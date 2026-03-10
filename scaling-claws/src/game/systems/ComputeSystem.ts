import type { GameState } from '../GameState.ts';
import { getTotalAssignedAgents } from '../GameState.ts';
import {
  BALANCE,
  getApiDemand,
  getApiPflopsPerUser,
  getAgentsRequiredAllocationPct,
  getBestModel,
  getGpuTargetPrice,
  getGpuSatellitePflopsPerUnit,
  isApiAutoPricingUnlocked,
  isComputeAutoAllocationUnlocked,
  JOB_ORDER,
} from '../BalanceConfig.ts';
import type { SubscriptionTier } from '../BalanceConfig.ts';
import { toBigInt, divB, mulB, scaleB, fromBigInt, scaleBigInt } from '../utils.ts';
import { reconcileEarthGpuInstallation } from './GpuState.ts';

const API_AUTO_PRICE_MIN = 1;
const API_AUTO_PRICE_LOCAL_STEP = 1;
const API_AUTO_PRICE_PROBE_PCT = 0.02;
const API_AUTO_PRICE_PROBE_MIN = 1;
const API_AUTO_PRICE_GRADIENT_EPS = 1e-6;
const API_AUTO_PRICE_STEP_PCT_MIN = 0.005;
const API_AUTO_PRICE_STEP_PCT_MAX = 0.08;
const COMPUTE_AUTO_TRAINING_MIN_PCT = 10;
const COMPUTE_AUTO_INFERENCE_MIN_PCT = 1;

function getEarthGpuCount(state: GameState): bigint {
  return state.locationResources.earth.gpus;
}

function getInstalledGpuCount(state: GameState): bigint {
  return state.installedGpuCount;
}

function getMaxAgentsByPflops(state: GameState): bigint {
  return divB(state.totalPflops, toBigInt(BALANCE.pflopsPerGpu));
}

function syncAgentsToPflopsCapacity(state: GameState): void {
  if (!state.isPostGpuTransition) return;

  const targetAgents = getMaxAgentsByPflops(state);
  if (state.totalAgents >= targetAgents) return;

  const unassignedPool = state.agentPools['unassigned'];
  const toAdd = targetAgents - state.totalAgents;
  const oldCount = unassignedPool.totalCount;
  unassignedPool.totalCount += toAdd;
  state.totalAgents = targetAgents;

  for (
    let i = Math.floor(fromBigInt(oldCount));
    i < Math.min(Math.floor(fromBigInt(unassignedPool.totalCount)), 4);
    i++
  ) {
    unassignedPool.samples.progress[i] = 0;
    unassignedPool.samples.stuck[i] = false;
  }
}

export function tickCompute(state: GameState, dtMs: number): void {
  // GPU market is global and should evolve in both subscription and GPU eras.
  tickGpuMarketPrice(state, dtMs);

  if (state.isPostGpuTransition) {
    tickGpuEra(state, dtMs);
  } else {
    tickSubscriptionEra(state, dtMs);
  }
}

// --- Subscription Era ---

function tickSubscriptionEra(state: GameState, dtMs: number): void {
  // Human salary expenses (from jobs)
  state.expensePerMin = state.humanSalaryPerMin;
  
  if (state.humanSalaryPerMin > 0n) {
    state.resourceBreakdown.funds.expense.push({ label: 'Human Salaries', ratePerMin: state.humanSalaryPerMin });
  }

  // Deduct salary costs
  if (state.humanSalaryPerMin > 0n) {
    const cost = mulB(state.humanSalaryPerMin, toBigInt(dtMs)) / 60000n;
    state.funds -= cost;
    if (state.funds < 0n) {
      state.funds = 0n;
    }
  }

  // Update intelligence
  const tierConfig = BALANCE.tiers[state.subscriptionTier];
  state.intelligence = tierConfig.intel;

  // Allocate CPU cores
  allocateCores(state);
}

// --- GPU Era ---

function tickGpuEra(state: GameState, dtMs: number): void {

  // Keep GPU stock/capacity/install state coherent before compute math.
  reconcileEarthGpuInstallation(state);
  
  // Earth compute
  let earthPflops = scaleB(state.installedGpuCount, BALANCE.pflopsPerGpu);
  earthPflops = scaleB(earthPflops, state.gpuFlopsBonus);
  earthPflops = scaleB(earthPflops, state.powerThrottle);
  state.earthPflops = earthPflops;

  const moonInstalled = state.locationResources.moon.installedGpus;
  let moonPflops = scaleB(moonInstalled, BALANCE.pflopsPerGpu);
  moonPflops = scaleB(moonPflops, state.gpuFlopsBonus);
  moonPflops = scaleB(moonPflops, state.lunarPowerThrottle);
  state.moonPflops = moonPflops;

  const mercuryInstalled = state.locationResources?.mercury?.installedGpus ?? 0n;
  let mercuryPflops = scaleB(mercuryInstalled, BALANCE.pflopsPerGpu);
  mercuryPflops = scaleB(mercuryPflops, state.gpuFlopsBonus);
  mercuryPflops = scaleB(mercuryPflops, state.mercuryPowerThrottle ?? 1);
  state.mercuryPflops = mercuryPflops;

  // Orbital compute from embedded GPU payload in launched satellites.
  const orbitalSatellites = state.satellites + state.dysonSwarmSatellites;
  let orbitalPflops = mulB(orbitalSatellites, getGpuSatellitePflopsPerUnit());
  orbitalPflops = scaleB(orbitalPflops, state.gpuFlopsBonus);
  state.orbitalPflops = orbitalPflops;

  // Gameplay allocations use total compute across all locations.
  state.totalPflops = state.earthPflops + state.moonPflops + state.mercuryPflops + state.orbitalPflops;
  syncAgentsToPflopsCapacity(state);

  // Only set intelligence from model if no training has been done yet
  if (state.completedFineTunes.length === 0 && state.ariesModelIndex === -1 && state.currentFineTuneIndex === -1) {
    const model = BALANCE.models[state.currentModelIndex];
    state.intelligence = model.intel;
  }

  // Auto-upgrade model
  if (state.completedFineTunes.length > 0) {
    const bestModel = getBestModel(getInstalledGpuCount(state));
    const bestIdx = BALANCE.models.indexOf(bestModel);
    if (bestIdx > state.currentModelIndex) {
      state.currentModelIndex = bestIdx;
    }
  }

  if (state.computeAutoAllocationEnabled && isComputeAutoAllocationUnlocked(state.completedResearch)) {
    autoAdjustComputeAllocations(state);
  }

  // Allocation Logic (Percentages)
  const trainingPct = toBigInt(state.trainingAllocationPct);
  const inferencePct = state.apiUnlocked ? toBigInt(state.apiInferenceAllocationPct) : 0n;
  
  state.trainingAllocatedPflops = mulB(state.totalPflops, trainingPct) / 100n;
  state.apiReservedPflops = mulB(state.totalPflops, inferencePct) / 100n;
  
  // Calculate "Rest" of compute (available for Agents and Synth Data)
  const restPflops = state.totalPflops - state.trainingAllocatedPflops - state.apiReservedPflops;
  state.freeCompute = restPflops < 0n ? 0n : restPflops; 

  const agentsAllocatedPflops = state.freeCompute;

  // Poplate Compute Breakdown
  if (state.trainingAllocatedPflops > 0n) {
    state.resourceBreakdown.compute.push({ label: 'Training', pflops: state.trainingAllocatedPflops });
  }
  if (state.apiReservedPflops > 0n) {
    state.resourceBreakdown.compute.push({ label: 'API Services', pflops: state.apiReservedPflops });
  }
  if (agentsAllocatedPflops > 0n) {
    state.resourceBreakdown.compute.push({ label: 'AI Agents', pflops: agentsAllocatedPflops });
  }

  // Allocate GPU slots to agent pools
  allocateGpuSlots(state, agentsAllocatedPflops);

  // Agent Efficiency
  // 1 Agent requires 1 GPU worth of compute (pflopsPerGpu) to run at 100% efficiency
  const assignedAgents = getTotalAssignedAgents(state);
  const pflopsNeeded = scaleB(assignedAgents, BALANCE.pflopsPerGpu);
  
  let computeEfficiency = 1.0;
  if (pflopsNeeded > 0n) {
     computeEfficiency = Math.min(1.0, Number(agentsAllocatedPflops) / Number(pflopsNeeded));
  }

  // Power constraints are already baked into per-location PFLOPS before total aggregation.
  state.agentEfficiency = computeEfficiency;

  // API Services
  if (state.apiUnlocked) {
    if (state.apiAutoPriceEnabled && isApiAutoPricingUnlocked(state.completedResearch)) {
      autoAdjustApiPrice(state);
    }

    // Demand calculation is centralized in BalanceConfig economics helpers.
    state.apiDemand = toBigInt(getApiDemand(
      state.apiAwareness,
      state.intelligence,
      state.apiPrice,
    ));

    // Available capacity for users
    const capacityUsers = divB(state.apiReservedPflops, toBigInt(getApiPflopsPerUser(state.apiQuality)));

    // Active users limited by demand and capacity
    state.apiUserCount = state.apiDemand < capacityUsers ? state.apiDemand : capacityUsers;

    // API users always generate baseline training data.
    // Research bonuses scale the per-user generation rate.
    state.synthDataRate = mulB(state.apiUserCount, state.apiUserSynthRate);
    state.trainingData += mulB(state.synthDataRate, toBigInt(dtMs)) / 60000n;

    // Income
    state.apiIncomePerMin = mulB(state.apiUserCount, toBigInt(state.apiPrice)); 
    
    if (state.apiIncomePerMin > 0n) {
      state.resourceBreakdown.funds.income.push({ label: 'API Services', ratePerMin: state.apiIncomePerMin });
    }

    const income = mulB(state.apiIncomePerMin, toBigInt(dtMs)) / 60000n;
    state.funds += income;
    state.totalEarned += income;
  } else {
    state.synthDataRate = 0n;
  }

  // Expenses: human salaries + grid power
  if (state.humanSalaryPerMin > 0n) {
    state.resourceBreakdown.funds.expense.push({ label: 'Human Salaries', ratePerMin: state.humanSalaryPerMin });
  }

  let totalExpensePerMin = state.humanSalaryPerMin;

  
  // Grid power is now one-time payment, no recurring cost
  // const gridCost = ...
  state.expensePerMin = totalExpensePerMin;

  // Deduct costs
  const cost = mulB(totalExpensePerMin, toBigInt(dtMs)) / 60000n;
  state.funds -= cost;

  if (state.funds < 0n) {
    state.funds = 0n;
  }
}

function tickGpuMarketPrice(state: GameState, dtMs: number): void {
  void dtMs;
  state.gpuMarketPrice = getGpuTargetPrice(state.locationResources.earth.gpus);
}

function allocateCores(state: GameState): void {
  const totalCores = state.cpuCoresTotal; // assumed scaled
  const coresPerAgent = toBigInt(BALANCE.tiers[state.subscriptionTier].coresPerAgent);
  const maxAgents = divB(totalCores, coresPerAgent);

  const allocatedAgents = allocateActiveSlots(state, maxAgents);
  state.usedCores = mulB(allocatedAgents, coresPerAgent);
}

function allocateGpuSlots(state: GameState, agentsAllocatedPflops: bigint): void {
  const maxActiveAgents = divB(agentsAllocatedPflops, toBigInt(BALANCE.pflopsPerGpu));
  allocateActiveSlots(state, maxActiveAgents);
}

function allocateActiveSlots(state: GameState, maxActiveAgents: bigint): bigint {
  const oneAgent = scaleBigInt(1n);
  const maxSlots = maxActiveAgents <= 0n ? 0n : (maxActiveAgents / oneAgent) * oneAgent;
  let remainingSlots = maxSlots;
  for (const jobType of JOB_ORDER) {
    const pool = state.agentPools[jobType];
    if (!pool) continue;

    if (remainingSlots >= pool.totalCount) {
      pool.idleCount = 0n;
      remainingSlots -= pool.totalCount;
    } else {
      pool.idleCount = pool.totalCount - remainingSlots;
      remainingSlots = 0n;
      break;
    }
  }

  const unassignedPool = state.agentPools['unassigned'];
  if (remainingSlots >= unassignedPool.totalCount) {
    unassignedPool.idleCount = 0n;
    remainingSlots -= unassignedPool.totalCount;
  } else {
    unassignedPool.idleCount = unassignedPool.totalCount - remainingSlots;
    remainingSlots = 0n;
  }

  const allocatedAgents = maxSlots - remainingSlots;
  state.activeAgentCount = allocatedAgents;
  return allocatedAgents;
}

// --- Actions ---

export function hireAgent(state: GameState): boolean {
  const tierConfig = BALANCE.tiers[state.subscriptionTier];

  if (!state.isPostGpuTransition) {
    if (mulB(state.totalAgents + scaleBigInt(1n), toBigInt(tierConfig.coresPerAgent)) > state.cpuCoresTotal) {
      return false;
    }
  } else {
    if (state.totalAgents >= getMaxAgentsByPflops(state)) {
      return false;
    }
  }

  if (state.funds < tierConfig.cost) {
    return false;
  }

  state.funds -= tierConfig.cost;

  const unassignedPool = state.agentPools['unassigned'];
  unassignedPool.totalCount += scaleBigInt(1n);
  state.totalAgents += scaleBigInt(1n);

  if (unassignedPool.totalCount <= scaleBigInt(4n)) {
    const idx = Math.floor(fromBigInt(unassignedPool.totalCount)) - 1;
    unassignedPool.samples.progress[idx] = 0;
    unassignedPool.samples.stuck[idx] = false;
  }

  return true;
}

export function upgradeTier(state: GameState, tier: SubscriptionTier): boolean {
  const currentConfig = BALANCE.tiers[state.subscriptionTier];
  const nextConfig = BALANCE.tiers[tier];
  const deltaCostPerAgent = nextConfig.cost - currentConfig.cost;
  if (deltaCostPerAgent <= 0n) return false;

  const upgradeCost = mulB(deltaCostPerAgent, state.totalAgents);

  if (state.funds < upgradeCost) {
    return false;
  }

  state.funds -= upgradeCost;
  state.subscriptionTier = tier;

  return true;
}

export function buyMicMini(state: GameState): boolean {
  if (state.micMiniCount >= scaleBigInt(BigInt(BALANCE.micMini.limit))) return false;
  if (state.funds < BALANCE.micMini.cost) return false;

  state.funds -= BALANCE.micMini.cost;
  state.micMiniCount += scaleBigInt(1n);
  state.cpuCoresTotal += BALANCE.micMini.coresAdded;

  return true;
}

export function goSelfHosted(state: GameState): boolean {
  const minGpus = BALANCE.models[0].minGpus;
  const agentCount = state.totalAgents;
  const earthGpuCount = minGpus > agentCount ? minGpus : agentCount;
  const totalCost = mulB(earthGpuCount, state.gpuMarketPrice);

  if (state.funds < totalCost) return false;

  state.funds -= totalCost;
  state.locationResources.earth.gpus = earthGpuCount;
  state.isPostGpuTransition = true;
  reconcileEarthGpuInstallation(state);

  // Free starting energy: cover the datacenter threshold
  const powerReqMW = mulB(BALANCE.datacenterThreshold, toBigInt(BALANCE.gpuPowerMW)); 
  state.gridPowerKW = toBigInt(Math.max(0, Math.ceil(fromBigInt(powerReqMW) * 1000)));

  state.subscriptionTier = 'basic';

  state.pendingFlavorTexts.push(
    '"Subscriptions cancelled. You are no longer ClawedCode\'s best customer. You are their competitor."'
  );

  return true;
}

export function buyGpu(state: GameState, amount: number): boolean {
  const amountB = toBigInt(amount);
  const earthGpuCount = getEarthGpuCount(state);
  if (earthGpuCount >= state.gpuCapacity) return false;
  if (earthGpuCount + amountB > state.gpuCapacity) return false;

  const cost = mulB(amountB, state.gpuMarketPrice);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.locationResources.earth.gpus = earthGpuCount + amountB;
  reconcileEarthGpuInstallation(state);

  if (earthGpuCount <= 0n) {
    state.pendingFlavorTexts.push(
      '"GPU #1 has arrived. Your apartment\'s circuit breaker has opinions about this."'
    );
  }

  return true;
}

export function upgradeModel(state: GameState, modelIndex: number): boolean {
  if (modelIndex <= state.currentModelIndex) return false;
  if (modelIndex >= BALANCE.models.length) return false;

  const model = BALANCE.models[modelIndex];
  if (getInstalledGpuCount(state) < model.minGpus) return false;

  state.currentModelIndex = modelIndex;
  return true;
}

export function buyDatacenter(state: GameState, tier: number): boolean {
  if (tier < 0 || tier >= BALANCE.datacenters.length) return false;

  const config = BALANCE.datacenters[tier];
  const limit = config.limit ?? 0;
  if (limit > 0 && state.datacenters[tier] >= toBigInt(limit)) return false;
  if (state.funds < config.cost) return false;
  const earthLabor = state.locationResources.earth.labor;
  if (earthLabor < config.laborCost) return false;

  state.funds -= config.cost;
  state.locationResources.earth.labor -= config.laborCost;
  state.datacenters[tier] += scaleBigInt(1n);
  reconcileEarthGpuInstallation(state);

  return true;
}


// --- API Actions ---

export function setApiPrice(state: GameState, price: number): void {
  // Price is in $, can go from very low to high
  state.apiPrice = normalizeApiPrice(price);
}

function normalizeApiPrice(price: number): number {
  return Math.max(API_AUTO_PRICE_MIN, Math.round(price));
}

function getApiRevenuePerMinAtPrice(
  state: GameState,
  price: number,
  effectiveCapacityUsers: number,
): number {
  if (effectiveCapacityUsers <= 0) return 0;
  const demand = getApiDemand(state.apiAwareness, state.intelligence, price);
  const activeUsers = Math.min(demand, effectiveCapacityUsers);
  return activeUsers * price;
}

function autoAdjustApiPrice(state: GameState): void {
  const infrastructureCapacityUsers = fromBigInt(divB(
    state.apiReservedPflops,
    toBigInt(getApiPflopsPerUser(state.apiQuality)),
  ));
  const effectiveCapacityUsers = Math.min(
    infrastructureCapacityUsers,
    BALANCE.apiDemandCapUsers,
  );
  if (effectiveCapacityUsers <= 0) return;

  const currentPrice = normalizeApiPrice(state.apiPrice);
  const probeSize = Math.max(API_AUTO_PRICE_PROBE_MIN, currentPrice * API_AUTO_PRICE_PROBE_PCT);
  const leftPrice = normalizeApiPrice(currentPrice - probeSize);
  const rightPrice = normalizeApiPrice(currentPrice + probeSize);
  if (rightPrice <= leftPrice) return;

  const currentRevenue = getApiRevenuePerMinAtPrice(state, currentPrice, effectiveCapacityUsers);
  const leftRevenue = getApiRevenuePerMinAtPrice(state, leftPrice, effectiveCapacityUsers);
  const rightRevenue = getApiRevenuePerMinAtPrice(state, rightPrice, effectiveCapacityUsers);
  const gradient = (rightRevenue - leftRevenue) / (rightPrice - leftPrice);
  if (!Number.isFinite(gradient) || Math.abs(gradient) <= API_AUTO_PRICE_GRADIENT_EPS) return;

  // Scale slope to a dimensionless signal so step sizing behaves similarly across price ranges.
  const normalizedSlope = currentRevenue > 0
    ? (gradient * currentPrice) / currentRevenue
    : (gradient > 0 ? 1 : -1);
  const direction = normalizedSlope > 0 ? 1 : -1;
  const stepPct = Math.max(
    API_AUTO_PRICE_STEP_PCT_MIN,
    Math.min(API_AUTO_PRICE_STEP_PCT_MAX, Math.abs(normalizedSlope) * 0.2),
  );
  const gradientStep = currentPrice * stepPct;

  // Pick the best local candidate so auto-pricing never intentionally walks downhill.
  const candidates = new Set<number>([
    currentPrice,
    normalizeApiPrice(currentPrice - API_AUTO_PRICE_LOCAL_STEP),
    normalizeApiPrice(currentPrice + API_AUTO_PRICE_LOCAL_STEP),
    normalizeApiPrice(currentPrice + (direction * gradientStep)),
    normalizeApiPrice(currentPrice + (direction * gradientStep * 0.5)),
  ]);

  let bestPrice = currentPrice;
  let bestRevenue = currentRevenue;
  for (const price of candidates) {
    const revenue = getApiRevenuePerMinAtPrice(state, price, effectiveCapacityUsers);
    if (revenue > bestRevenue) {
      bestRevenue = revenue;
      bestPrice = price;
    }
  }

  if (bestPrice !== currentPrice) {
    setApiPrice(state, bestPrice);
  }
}

export function setApiAutoPriceEnabled(state: GameState, enabled: boolean): boolean {
  if (!enabled) {
    state.apiAutoPriceEnabled = false;
    return true;
  }

  if (!isApiAutoPricingUnlocked(state.completedResearch)) return false;
  state.apiAutoPriceEnabled = true;
  return true;
}

function ceilPctOfTotal(requested: bigint, total: bigint): number {
  if (requested <= 0n) return 0;
  if (total <= 0n) return 100;
  const pct = (requested * 100n + total - 1n) / total;
  if (pct >= 100n) return 100;
  return Number(pct);
}

function autoAdjustComputeAllocations(state: GameState): void {
  const trainingActive = state.currentFineTuneIndex >= 0 || state.ariesModelIndex >= 0;
  const totalPflops = state.totalPflops;
  if (totalPflops <= 0n) {
    const inferencePct = state.apiUnlocked ? COMPUTE_AUTO_INFERENCE_MIN_PCT : 0;
    const trainingPct = trainingActive ? (100 - inferencePct) : 0;
    setComputeAllocations(state, trainingPct, inferencePct);
    return;
  }

  const assignedAgents = getTotalAssignedAgents(state);
  let agentsPct = getAgentsRequiredAllocationPct(totalPflops, assignedAgents);

  let inferencePct = 0;
  if (state.apiUnlocked) {
    const apiDemandUsers = toBigInt(getApiDemand(state.apiAwareness, state.intelligence, state.apiPrice));
    const apiNeedPflops = mulB(apiDemandUsers, toBigInt(getApiPflopsPerUser(state.apiQuality)));
    inferencePct = Math.max(COMPUTE_AUTO_INFERENCE_MIN_PCT, ceilPctOfTotal(apiNeedPflops, totalPflops));
  }

  const minInference = state.apiUnlocked ? COMPUTE_AUTO_INFERENCE_MIN_PCT : 0;
  if (!trainingActive) {
    agentsPct = Math.max(0, Math.min(100, agentsPct));
    // When no training run is active, reserve all non-agent compute for inference.
    inferencePct = state.apiUnlocked ? (100 - agentsPct) : 0;
    setComputeAllocations(state, 0, inferencePct);
    return;
  }

  let trainingPct = 100 - agentsPct - inferencePct;
  if (trainingPct < COMPUTE_AUTO_TRAINING_MIN_PCT) {
    let shortfall = COMPUTE_AUTO_TRAINING_MIN_PCT - trainingPct;

    const inferenceReducible = Math.max(0, inferencePct - minInference);
    const inferenceBorrow = Math.min(shortfall, inferenceReducible);
    inferencePct -= inferenceBorrow;
    shortfall -= inferenceBorrow;

    if (shortfall > 0) {
      const agentsBorrow = Math.min(shortfall, Math.max(0, agentsPct));
      agentsPct -= agentsBorrow;
      shortfall -= agentsBorrow;
    }
  }

  agentsPct = Math.max(0, Math.min(100, agentsPct));
  inferencePct = Math.max(minInference, Math.min(100 - agentsPct, inferencePct));
  trainingPct = Math.max(0, 100 - agentsPct - inferencePct);

  const ok = setComputeAllocations(state, trainingPct, inferencePct);
  if (!ok) {
    setComputeAllocations(state, 100, 0);
  }
}

export function setComputeAutoAllocationEnabled(state: GameState, enabled: boolean): boolean {
  if (!enabled) {
    state.computeAutoAllocationEnabled = false;
    return true;
  }

  if (!isComputeAutoAllocationUnlocked(state.completedResearch)) return false;
  state.computeAutoAllocationEnabled = true;
  return true;
}

export function buyAds(state: GameState, amount: number = 1): boolean {
  const amountB = toBigInt(amount);
  const totalCost = mulB(amountB, BALANCE.apiAdCost);
  if (state.funds < totalCost) return false;
  state.funds -= totalCost;
  state.apiAwareness += amount * BALANCE.apiAdAwarenessBoost;
  return true;
}

function normalizeAllocationPct(pct: number): number {
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function setComputeAllocations(state: GameState, trainingPct: number, inferencePct: number): boolean {
  const newTraining = normalizeAllocationPct(trainingPct);
  const newInference = state.apiUnlocked ? normalizeAllocationPct(inferencePct) : 0;
  if (newTraining + newInference > 100) return false;

  state.trainingAllocationPct = newTraining;
  state.apiInferenceAllocationPct = newInference;
  return true;
}

export function improveApi(state: GameState, amount: number = 1): boolean {
  const purchased = state.apiImprovementLevel + 1;
  const remaining = BALANCE.apiImprovePurchaseLimit - purchased;
  if (remaining <= 0 || amount > remaining) return false;

  const amountB = toBigInt(amount);
  const totalCost = mulB(amountB, BALANCE.apiImproveCodeCost);
  if (state.code < totalCost) return false;

  state.code -= totalCost;
  state.apiImprovementLevel += amount;
  state.apiQuality += amount * BALANCE.apiImproveEfficiencyBoost;
  
  return true;
}

export function unlockApi(state: GameState): boolean {
  if (state.apiUnlocked) return false;
  if (state.intelligence < BALANCE.apiUnlockIntel) return false;
  if (state.code < BALANCE.apiUnlockCode) return false;

  state.code -= BALANCE.apiUnlockCode;
  state.apiUnlocked = true;
  state.apiInferenceAllocationPct = 5;
  return true;
}
