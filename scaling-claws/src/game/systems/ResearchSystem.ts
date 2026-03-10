import type { GameState } from '../GameState.ts';
import {
  BALANCE,
  getAlgoEfficiencyResearchMultiplier,
  getApiUserSynthRateFromResearch,
  getGpuFlopsResearchMultiplier,
  getRocketLossPctFromResearch,
} from '../BalanceConfig.ts';
import type { ResearchId, ResearchConfig, ResearchCostResource } from '../BalanceConfig.ts';
import { scaleB } from '../utils.ts';

export function tickResearch(state: GameState, _dtMs: number): void {
  computeResearchBonuses(state);
}

function computeResearchBonuses(state: GameState): void {
  state.algoEfficiencyBonus = getAlgoEfficiencyResearchMultiplier(state.completedResearch);

  // GPU FLOPS
  state.gpuFlopsBonus = getGpuFlopsResearchMultiplier(state.completedResearch);

  // API user data generation bonuses
  state.apiUserSynthRate = getApiUserSynthRateFromResearch(state.completedResearch);

  // Rocket loss / recovery tiers
  const rocketLoss = getRocketLossPctFromResearch(state.completedResearch);
  state.rocketLossPct = rocketLoss;
  state.launchCostBonus = 1 - rocketLoss;
}

function getResearchConfig(id: ResearchId): ResearchConfig | undefined {
  return BALANCE.research.find(r => r.id === id);
}

function getResearchPurchaseCount(state: GameState, id: ResearchId): number {
  let count = 0;
  for (const completedId of state.completedResearch) {
    if (completedId === id) count++;
  }
  return count;
}

function getCostResource(config: ResearchConfig): ResearchCostResource {
  return config.costResource ?? 'science';
}

function isSyntheticData1LockedByIntel(state: GameState, id: ResearchId): boolean {
  if (id !== 'syntheticData1') return false;
  return state.intelligence <= BALANCE.jobs.aiDataSynthesizer.unlockAtIntel;
}

function getResearchCostForPurchases(config: ResearchConfig, purchaseCount: number): bigint {
  if (!config.infinite) return config.cost;

  const internalLevel = Math.max(0, config.infinite.initialLevel + purchaseCount);
  const growth = Math.pow(config.infinite.priceExponentPerLevel, internalLevel);
  const safeGrowth = Number.isFinite(growth) ? growth : Number.MAX_SAFE_INTEGER;
  return scaleB(config.cost, safeGrowth);
}

export function getResearchCurrentCost(state: GameState, id: ResearchId): bigint {
  const config = getResearchConfig(id);
  if (!config) return 0n;
  const purchaseCount = getResearchPurchaseCount(state, id);
  return getResearchCostForPurchases(config, purchaseCount);
}

export interface ResearchQuantityPreview {
  label: string;
  emoji: 'code' | 'science' | 'labor' | 'data' | 'flops' | 'energy' | 'rockets';
  unit: string;
  current: number;
  next: number;
}

export function getResearchQuantityPreview(state: GameState, id: ResearchId): ResearchQuantityPreview | null {
  const config = getResearchConfig(id);
  if (!config?.infinite) return null;

  const purchaseCount = getResearchPurchaseCount(state, id);
  const internalLevel = Math.max(0, config.infinite.initialLevel + purchaseCount);
  const current = config.infinite.quantityBase * Math.pow(config.infinite.quantityMultiplierPerLevel, internalLevel);
  const next = config.infinite.quantityBase * Math.pow(config.infinite.quantityMultiplierPerLevel, internalLevel + 1);
  return {
    label: config.infinite.quantityLabel,
    emoji: config.infinite.quantityEmoji,
    unit: config.infinite.quantityUnit ?? '',
    current,
    next,
  };
}

export function canPurchaseResearch(state: GameState, id: ResearchId): boolean {
  const config = getResearchConfig(id);
  if (!config) return false;
  if (isSyntheticData1LockedByIntel(state, id)) return false;

  const alreadyPurchased = state.completedResearch.includes(id);
  if (alreadyPurchased && !config.infinite) return false;

  const purchaseCount = getResearchPurchaseCount(state, id);
  const cost = getResearchCostForPurchases(config, purchaseCount);
  const costResource = getCostResource(config);
  if (state[costResource] < cost) return false;

  for (const prereq of config.prereqs) {
    if (!state.completedResearch.includes(prereq)) return false;
  }

  return true;
}

export function purchaseResearch(state: GameState, id: ResearchId): boolean {
  if (!canPurchaseResearch(state, id)) return false;

  const config = getResearchConfig(id)!;
  const purchaseCount = getResearchPurchaseCount(state, id);
  const cost = getResearchCostForPurchases(config, purchaseCount);
  const costResource = getCostResource(config);
  state[costResource] -= cost;
  state.completedResearch.push(id);

  const firstPurchase = purchaseCount === 0;

  // Flavor text highlights
  if (firstPurchase && id === 'robotics1') {
    state.pendingFlavorTexts.push('"Robot workers unlocked. Automated labor now scales with robotics tech."');
  } else if (firstPurchase && id === 'robotFactoryEngineering1') {
    state.pendingFlavorTexts.push('"Earth robot factories unlocked."');
  } else if (firstPurchase && id === 'moonRobotics') {
    state.pendingFlavorTexts.push('"Moon robot factories unlocked."');
  } else if (firstPurchase && id === 'mercuryRobotics') {
    state.pendingFlavorTexts.push('"Mercury robot factories unlocked."');
  } else if (firstPurchase && id === 'syntheticData1') {
    state.pendingFlavorTexts.push('"AI Data Synthesizer unlocked. Agents can now generate training data directly."');
  } else if (firstPurchase && id === 'payloadToMoon') {
    state.pendingFlavorTexts.push('"Lunar logistics online. Earth no longer runs alone."');
  } else if (firstPurchase && id === 'payloadToMercury') {
    state.pendingFlavorTexts.push('"Mercury corridor unlocked. The Dyson route is open."');
  } else if (firstPurchase && id === 'moonMassDrivers') {
    state.pendingFlavorTexts.push('"Mass drivers and lunar sat fabs online. Payload throughput surges."');
  } else if (firstPurchase && id === 'vonNeumannProbes') {
    state.pendingFlavorTexts.push('"Probe architecture complete. You can now trigger the endgame launch."');
  }

  return true;
}

export function getAvailableResearch(state: GameState): ResearchConfig[] {
  return BALANCE.research.filter(r => {
    if (!r.infinite && state.completedResearch.includes(r.id)) return false;
    if (isSyntheticData1LockedByIntel(state, r.id)) return false;
    for (const prereq of r.prereqs) {
      if (!state.completedResearch.includes(prereq)) return false;
    }
    return true;
  });
}
