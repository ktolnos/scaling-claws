import type { GameState, FacilityId, LocationId, TransportPayloadId, TransportRouteId } from './GameState.ts';
import { BALANCE, getHumanWorkforceRemaining } from './BalanceConfig.ts';
import type { JobType, ResearchId, SubscriptionTier } from './BalanceConfig.ts';
import {
  hireAgent,
  upgradeTier,
  buyMicMini,
  goSelfHosted,
  buyGpu,
  upgradeModel,
  buyDatacenter,
  setApiPrice,
  buyAds,
  setComputeAllocations,
  improveApi,
  unlockApi,
} from './systems/ComputeSystem.ts';
import {
  nudgeAgent,
  assignAgentsToJob,
  removeAgentsFromJob,
  hireHumanWorkers,
  fireHumanWorkers,
  buyRobotWorkers,
  fireRobotWorkers,
} from './systems/JobSystem.ts';
import {
  buyTrainingData,
  startFineTune,
  startAriesTraining,
  setTrainingAllocation,
} from './systems/TrainingSystem.ts';
import { canPurchaseResearch, purchaseResearch } from './systems/ResearchSystem.ts';
import { buyGridPower, sellGridPower, buyGasPlant, buyNuclearPlant } from './systems/EnergySystem.ts';
import {
  schedulePayload,
  installSolarPanels,
  installMoonGpus,
  launchVonNeumannProbe,
} from './systems/SpaceSystem.ts';
import { canBuildFacility, buildFacility } from './systems/SupplySystem.ts';
import { toBigInt, mulB, divB } from './utils.ts';

export interface ActionDispatchResult {
  ok: boolean;
  info: Record<string, unknown>;
}

export interface ActionDispatchEvent {
  state: GameState;
  action: GameAction;
  result: ActionDispatchResult;
  atTimeMs: number;
  source: 'user' | 'programmatic';
}

export type GameAction =
  | { type: 'hireAgent'; amount?: number }
  | { type: 'upgradeTier'; tier: SubscriptionTier }
  | { type: 'buyMicMini'; amount?: number }
  | { type: 'goSelfHosted' }
  | { type: 'buyGpu'; amount: number }
  | { type: 'upgradeModel'; modelIndex: number }
  | { type: 'buyDatacenter'; tier: number; amount?: number }
  | { type: 'setApiPrice'; price: number }
  | { type: 'buyAds'; amount?: number }
  | { type: 'setComputeAllocations'; trainingPct: number; inferencePct: number }
  | { type: 'improveApi'; amount?: number }
  | { type: 'unlockApi' }
  | { type: 'nudgeAgent' }
  | { type: 'assignAgentsToJob'; jobType: JobType; amount: number }
  | { type: 'removeAgentsFromJob'; jobType: JobType; amount: number }
  | { type: 'hireHumanWorkers'; jobType: JobType; amount: number }
  | { type: 'fireHumanWorkers'; jobType: JobType; amount: number }
  | { type: 'buyRobotWorkers'; amount: number }
  | { type: 'fireRobotWorkers'; amount: number }
  | { type: 'buyTrainingData'; amountGB: number }
  | { type: 'startFineTune'; index: number }
  | { type: 'startAriesTraining'; index: number }
  | { type: 'setTrainingAllocation'; pct: number }
  | { type: 'purchaseResearch'; id: ResearchId }
  | { type: 'buyGridPower'; amountKW: number }
  | { type: 'sellGridPower'; amountKW: number }
  | { type: 'buyGasPlant'; amount?: number }
  | { type: 'buyNuclearPlant'; amount?: number }
  | { type: 'schedulePayload'; route: TransportRouteId; payload: TransportPayloadId; amount: number }
  | { type: 'installSolarPanels'; location: LocationId; amount: number }
  | { type: 'installMoonGpus'; amount: number }
  | { type: 'launchVonNeumannProbe' }
  | { type: 'buildFacility'; location: LocationId; facility: FacilityId; amount: number };

function getRequestedAmount(raw: number | undefined): number {
  if (raw === undefined) return 1;
  return Math.max(0, Math.floor(raw));
}

function runRepeated(amount: number, runOnce: () => boolean): { performed: number; requested: number } {
  const requested = getRequestedAmount(amount);
  if (requested <= 0) {
    return { performed: 0, requested: 0 };
  }
  let performed = 0;
  for (let i = 0; i < requested; i++) {
    if (!runOnce()) break;
    performed++;
  }
  return { performed, requested };
}

function result(ok: boolean, info: Record<string, unknown>): ActionDispatchResult {
  return { ok, info };
}

type ActionObserver = (event: ActionDispatchEvent) => void;
const actionObservers = new Set<ActionObserver>();

export function addActionObserver(observer: ActionObserver): () => void {
  actionObservers.add(observer);
  return () => {
    actionObservers.delete(observer);
  };
}

function dispatchGameActionCore(state: GameState, action: GameAction): ActionDispatchResult {
  switch (action.type) {
    case 'hireAgent': {
      const { performed, requested } = runRepeated(action.amount ?? 1, () => hireAgent(state));
      const tier = BALANCE.tiers[state.subscriptionTier];
      const nextAgent = state.totalAgents + toBigInt(1);
      const blockedByCpu = !state.isPostGpuTransition && mulB(nextAgent, toBigInt(tier.coresPerAgent)) > state.cpuCoresTotal;
      const maxAgentsByPflops = state.isPostGpuTransition
        ? divB(state.totalPflops, toBigInt(BALANCE.pflopsPerGpu))
        : 0n;
      const blockedByGpuSlots = state.isPostGpuTransition && state.totalAgents >= maxAgentsByPflops;
      const blockedByFunds = state.funds < tier.cost;
      return result(performed > 0, {
        performed,
        requested,
        partial: performed < requested,
        reason: performed > 0 ? undefined : 'failed',
        try_later: blockedByFunds || blockedByCpu || blockedByGpuSlots,
      });
    }
    case 'upgradeTier': {
      const ok = upgradeTier(state, action.tier);
      const currentConfig = BALANCE.tiers[state.subscriptionTier];
      const nextConfig = BALANCE.tiers[action.tier];
      const deltaCostPerAgent = nextConfig.cost - currentConfig.cost;
      return result(ok, {
        reason: ok ? undefined : 'failed',
        try_later: deltaCostPerAgent > 0n && state.funds < mulB(deltaCostPerAgent, state.totalAgents),
      });
    }
    case 'buyMicMini': {
      const { performed, requested } = runRepeated(action.amount ?? 1, () => buyMicMini(state));
      const atLimit = state.micMiniCount >= toBigInt(BALANCE.micMini.limit);
      const blockedByFunds = state.funds < BALANCE.micMini.cost;
      return result(performed > 0, {
        performed,
        requested,
        partial: performed < requested,
        reason: performed > 0 ? undefined : 'failed',
        try_later: atLimit ? false : blockedByFunds,
      });
    }
    case 'goSelfHosted': {
      const ok = goSelfHosted(state);
      const minGpus = BALANCE.models[0].minGpus;
      const gpuCount = minGpus > state.totalAgents ? minGpus : state.totalAgents;
      const cost = mulB(gpuCount, state.gpuMarketPrice);
      return result(ok, { reason: ok ? undefined : 'failed', try_later: state.funds < cost });
    }
    case 'buyGpu': {
      const amount = getRequestedAmount(action.amount);
      if (amount <= 0) return result(false, { performed: 0, requested: 0, reason: 'invalid_amount', try_later: false });
      const ok = buyGpu(state, amount);
      return result(ok, {
        performed: ok ? amount : 0,
        requested: amount,
        reason: ok ? undefined : 'failed',
        try_later: state.funds < toBigInt(amount) * state.gpuMarketPrice,
      });
    }
    case 'upgradeModel': {
      const ok = upgradeModel(state, action.modelIndex);
      const invalidIndex = action.modelIndex <= state.currentModelIndex || action.modelIndex >= BALANCE.models.length;
      const missingGpuReq = !invalidIndex && state.installedGpuCount < BALANCE.models[action.modelIndex].minGpus;
      return result(ok, { reason: ok ? undefined : 'failed', try_later: missingGpuReq && !invalidIndex });
    }
    case 'buyDatacenter': {
      const { performed, requested } = runRepeated(action.amount ?? 1, () => buyDatacenter(state, action.tier));
      const config = BALANCE.datacenters[action.tier];
      const tierExists = config !== undefined;
      const atLimit = tierExists && (config.limit ?? 0) > 0 && state.datacenters[action.tier] >= toBigInt(config.limit ?? 0);
      const blockedByFunds = tierExists && state.funds < config.cost;
      const blockedByLabor = tierExists && state.locationResources.earth.labor < config.laborCost;
      return result(performed > 0, {
        performed,
        requested,
        partial: performed < requested,
        reason: performed > 0 ? undefined : 'failed',
        try_later: tierExists ? (!atLimit && (blockedByFunds || blockedByLabor)) : false,
      });
    }
    case 'setApiPrice': {
      const before = state.apiPrice;
      setApiPrice(state, action.price);
      return result(true, { before, after: state.apiPrice });
    }
    case 'buyAds': {
      const amount = getRequestedAmount(action.amount ?? 1);
      if (amount <= 0) return result(false, { performed: 0, requested: 0, reason: 'invalid_amount', try_later: false });
      const ok = buyAds(state, amount);
      return result(ok, {
        performed: ok ? amount : 0,
        requested: amount,
        reason: ok ? undefined : 'failed',
        try_later: state.funds < toBigInt(amount) * BALANCE.apiAdCost,
      });
    }
    case 'setComputeAllocations': {
      const ok = setComputeAllocations(state, action.trainingPct, action.inferencePct);
      return result(ok, {
        trainingPct: state.trainingAllocationPct,
        inferencePct: state.apiInferenceAllocationPct,
        reason: ok ? undefined : 'invalid_allocation',
      });
    }
    case 'improveApi': {
      const amount = getRequestedAmount(action.amount ?? 1);
      if (amount <= 0) return result(false, { performed: 0, requested: 0, reason: 'invalid_amount', try_later: false });
      const ok = improveApi(state, amount);
      const purchased = state.apiImprovementLevel + 1;
      const atLimit = purchased >= BALANCE.apiImprovePurchaseLimit;
      return result(ok, {
        performed: ok ? amount : 0,
        requested: amount,
        reason: ok ? undefined : 'failed',
        try_later: atLimit ? false : state.code < toBigInt(amount) * BALANCE.apiImproveCodeCost,
      });
    }
    case 'unlockApi': {
      const ok = unlockApi(state);
      const impossible = state.apiUnlocked;
      return result(ok, {
        reason: ok ? undefined : 'requirements_not_met',
        try_later: !impossible,
      });
    }
    case 'nudgeAgent': {
      const ok = nudgeAgent(state);
      return result(ok, { performed: ok ? 1 : 0, reason: ok ? undefined : 'no_stuck_agents', try_later: true });
    }
    case 'assignAgentsToJob': {
      const requested = getRequestedAmount(action.amount);
      if (requested <= 0) return result(false, { performed: 0, requested: 0, reason: 'invalid_amount', try_later: false });
      const performed = assignAgentsToJob(state, action.jobType, requested);
      const hasUnassigned = state.agentPools.unassigned.totalCount > 0n;
      return result(performed > 0, {
        performed,
        requested,
        partial: performed < requested,
        reason: performed > 0 ? undefined : 'failed',
        try_later: hasUnassigned,
      });
    }
    case 'removeAgentsFromJob': {
      const requested = getRequestedAmount(action.amount);
      if (requested <= 0) return result(false, { performed: 0, requested: 0, reason: 'invalid_amount', try_later: false });
      const performed = removeAgentsFromJob(state, action.jobType, requested);
      return result(performed > 0, {
        performed,
        requested,
        partial: performed < requested,
        reason: performed > 0 ? undefined : 'failed',
        try_later: true,
      });
    }
    case 'hireHumanWorkers': {
      const requested = getRequestedAmount(action.amount);
      if (requested <= 0) return result(false, { performed: 0, requested: 0, reason: 'invalid_amount', try_later: false });
      const performed = hireHumanWorkers(state, action.jobType, requested);
      const jobConfig = BALANCE.jobs[action.jobType];
      const cost = jobConfig.hireCost ?? 0n;
      const totalPaidHumans = (Object.keys(state.humanPools) as JobType[])
        .reduce((sum, jt) => {
          const cfg = BALANCE.jobs[jt];
          if (cfg.workerType !== 'human' || !cfg.salaryPerMin) return sum;
          return sum + state.humanPools[jt].totalCount;
        }, 0n);
      const remainingWorkforce = getHumanWorkforceRemaining(totalPaidHumans);
      return result(performed > 0, {
        performed,
        requested,
        partial: performed < requested,
        reason: performed > 0 ? undefined : 'failed',
        try_later: state.intelligence >= jobConfig.unlockAtIntel && state.funds >= cost && remainingWorkforce > 0n,
      });
    }
    case 'fireHumanWorkers': {
      const requested = getRequestedAmount(action.amount);
      if (requested <= 0) return result(false, { performed: 0, requested: 0, reason: 'invalid_amount', try_later: false });
      const performed = fireHumanWorkers(state, action.jobType, requested);
      return result(performed > 0, {
        performed,
        requested,
        partial: performed < requested,
        reason: performed > 0 ? undefined : 'failed',
        try_later: true,
      });
    }
    case 'buyRobotWorkers': {
      const requested = getRequestedAmount(action.amount);
      if (requested <= 0) return result(false, { performed: 0, requested: 0, reason: 'invalid_amount', try_later: false });
      const performed = buyRobotWorkers(state, requested);
      const atLimit = state.locationResources.earth.robots >= toBigInt(BALANCE.robotWorkerBuyLimit);
      return result(performed > 0, {
        performed,
        requested,
        partial: performed < requested,
        reason: performed > 0 ? undefined : 'failed',
        try_later: atLimit ? false : true,
      });
    }
    case 'fireRobotWorkers': {
      const requested = getRequestedAmount(action.amount);
      if (requested <= 0) return result(false, { performed: 0, requested: 0, reason: 'invalid_amount', try_later: false });
      const performed = fireRobotWorkers(state, requested);
      return result(performed > 0, {
        performed,
        requested,
        partial: performed < requested,
        reason: performed > 0 ? undefined : 'failed',
        try_later: true,
      });
    }
    case 'buyTrainingData': {
      const amountGB = getRequestedAmount(action.amountGB);
      if (amountGB <= 0) return result(false, { performed: 0, requested: 0, reason: 'invalid_amount', try_later: false });
      const ok = buyTrainingData(state, amountGB);
      const capReached = state.trainingDataPurchases >= BALANCE.dataPurchaseLimitGB;
      return result(ok, {
        performed: ok ? amountGB : 0,
        requested: amountGB,
        reason: ok ? undefined : 'failed',
        try_later: capReached ? false : true,
      });
    }
    case 'startFineTune': {
      const ok = startFineTune(state, action.index);
      const invalid = action.index < 0 || action.index >= BALANCE.fineTunes.length;
      return result(ok, { index: action.index, reason: ok ? undefined : 'requirements_not_met', try_later: !invalid });
    }
    case 'startAriesTraining': {
      const ok = startAriesTraining(state, action.index);
      const invalid = action.index < 0 || action.index >= BALANCE.ariesModels.length;
      return result(ok, { index: action.index, reason: ok ? undefined : 'requirements_not_met', try_later: !invalid });
    }
    case 'setTrainingAllocation': {
      const ok = setTrainingAllocation(state, action.pct);
      return result(ok, { pct: state.trainingAllocationPct, reason: ok ? undefined : 'invalid_allocation', try_later: true });
    }
    case 'purchaseResearch': {
      const canBuy = canPurchaseResearch(state, action.id);
      if (!canBuy) {
        const exists = BALANCE.research.some((r) => r.id === action.id);
        return result(false, { id: action.id, reason: 'requirements_not_met', try_later: exists });
      }
      const ok = purchaseResearch(state, action.id);
      return result(ok, { id: action.id, reason: ok ? undefined : 'failed', try_later: true });
    }
    case 'buyGridPower': {
      const amountKW = getRequestedAmount(action.amountKW);
      if (amountKW <= 0) return result(false, { amountKW: 0, reason: 'invalid_amount', try_later: false });
      const ok = buyGridPower(state, amountKW);
      const limit = BALANCE.gridPowerKWLimit ?? 0;
      const atLimit = limit > 0 && state.gridPowerKW >= toBigInt(limit);
      return result(ok, { amountKW: ok ? amountKW : 0, reason: ok ? undefined : 'failed', try_later: atLimit ? false : true });
    }
    case 'sellGridPower': {
      const amountKW = getRequestedAmount(action.amountKW);
      if (amountKW <= 0) return result(false, { amountKW: 0, reason: 'invalid_amount', try_later: false });
      const ok = sellGridPower(state, amountKW);
      return result(ok, { amountKW, try_later: true });
    }
    case 'buyGasPlant': {
      const amount = getRequestedAmount(action.amount);
      if (amount <= 0) return result(false, { amount: 0, reason: 'invalid_amount', try_later: false });
      const ok = buyGasPlant(state, amount);
      const limit = BALANCE.powerPlants.gas.limit ?? 0;
      const atLimit = limit > 0 && state.gasPlants >= toBigInt(limit);
      return result(ok, { amount: ok ? amount : 0, reason: ok ? undefined : 'failed', try_later: atLimit ? false : true });
    }
    case 'buyNuclearPlant': {
      const amount = getRequestedAmount(action.amount);
      if (amount <= 0) return result(false, { amount: 0, reason: 'invalid_amount', try_later: false });
      const ok = buyNuclearPlant(state, amount);
      const limit = BALANCE.powerPlants.nuclear.limit ?? 0;
      const atLimit = limit > 0 && state.nuclearPlants >= toBigInt(limit);
      return result(ok, { amount: ok ? amount : 0, reason: ok ? undefined : 'failed', try_later: atLimit ? false : true });
    }
    case 'schedulePayload': {
      const amount = getRequestedAmount(action.amount);
      if (amount <= 0) return result(false, { amount: 0, reason: 'invalid_amount', try_later: false });
      const ok = schedulePayload(state, action.route, action.payload, amount);
      return result(ok, { amount: ok ? amount : 0, reason: ok ? undefined : 'failed', try_later: true });
    }
    case 'installSolarPanels': {
      const amount = getRequestedAmount(action.amount);
      if (amount <= 0) return result(false, { amount: 0, reason: 'invalid_amount', try_later: false });
      const ok = installSolarPanels(state, action.location, amount);
      return result(ok, {
        amount: ok ? amount : 0,
        location: action.location,
        reason: ok ? undefined : 'failed',
        try_later: true,
      });
    }
    case 'installMoonGpus': {
      const amount = getRequestedAmount(action.amount);
      if (amount <= 0) return result(false, { amount: 0, reason: 'invalid_amount', try_later: false });
      const ok = installMoonGpus(state, amount);
      return result(ok, { amount: ok ? amount : 0, reason: ok ? undefined : 'failed', try_later: true });
    }
    case 'launchVonNeumannProbe': {
      const ok = launchVonNeumannProbe(state);
      return result(ok, { reason: ok ? undefined : 'failed', try_later: !state.gameWon });
    }
    case 'buildFacility': {
      const amount = getRequestedAmount(action.amount);
      if (amount <= 0) {
        return result(false, {
          location: action.location,
          facility: action.facility,
          amount: 0,
          reason: 'invalid_amount',
          try_later: false,
        });
      }
      if (!canBuildFacility(state, action.location, action.facility, amount)) {
        return result(false, {
          location: action.location,
          facility: action.facility,
          amount,
          reason: 'requirements_not_met',
          try_later: true,
        });
      }
      const ok = buildFacility(state, action.location, action.facility, amount);
      return result(ok, {
        location: action.location,
        facility: action.facility,
        amount: ok ? amount : 0,
        reason: ok ? undefined : 'failed',
        try_later: true,
      });
    }
  }
}

export function dispatchGameAction(state: GameState, action: GameAction): ActionDispatchResult {
  const actionResult = dispatchGameActionCore(state, action);
  if (actionObservers.size > 0) {
    const event: ActionDispatchEvent = {
      state,
      action,
      result: actionResult,
      atTimeMs: state.time,
      source: 'user',
    };
    for (const observer of actionObservers) {
      observer(event);
    }
  }
  return actionResult;
}

export function dispatchGameActionWithSource(
  state: GameState,
  action: GameAction,
  source: 'user' | 'programmatic',
): ActionDispatchResult {
  const actionResult = dispatchGameActionCore(state, action);
  if (actionObservers.size > 0) {
    const event: ActionDispatchEvent = {
      state,
      action,
      result: actionResult,
      atTimeMs: state.time,
      source,
    };
    for (const observer of actionObservers) {
      observer(event);
    }
  }
  return actionResult;
}
