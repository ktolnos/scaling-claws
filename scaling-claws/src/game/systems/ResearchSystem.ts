import type { GameState } from '../GameState.ts';
import {
  BALANCE,
  getAlgoEfficiencyResearchMultiplier,
  getAgentsPerGpuResearchMultiplier,
  getApiUserSynthRateFromResearch,
  getGpuFlopsResearchMultiplier,
  getLevelScaledCost,
  getResearchConfig,
  getResearchCurrentLevel,
  getResearchMaxLevel,
  getRocketLossPctFromResearch,
  hasCompletedResearch,
} from '../BalanceConfig.ts';
import type { ResearchId, ResearchConfig, ResearchCostResource } from '../BalanceConfig.ts';

export function tickResearch(state: GameState, _dtMs: number): void {
  computeResearchBonuses(state);
}

function computeResearchBonuses(state: GameState): void {
  state.algoEfficiencyBonus = getAlgoEfficiencyResearchMultiplier(state.researchLevels);

  // GPU FLOPS
  state.gpuFlopsBonus = getGpuFlopsResearchMultiplier(state.researchLevels);

  // Agent density per GPU
  state.agentsPerGpu = BALANCE.baseAgentsPerGpu * getAgentsPerGpuResearchMultiplier(state.researchLevels);

  // API user data generation bonuses
  state.apiUserSynthRate = getApiUserSynthRateFromResearch(state.researchLevels);

  // Rocket loss / recovery tiers
  const rocketLoss = getRocketLossPctFromResearch(state.researchLevels);
  state.rocketLossPct = rocketLoss;
  state.launchCostBonus = 1 - rocketLoss;
}

function getCostResource(config: ResearchConfig): ResearchCostResource {
  return config.costResource ?? 'science';
}

function isSyntheticData1LockedByIntel(state: GameState, id: ResearchId): boolean {
  if (id !== 'syntheticData1') return false;
  return state.intelligence <= BALANCE.jobs.aiDataSynthesizer.unlockAtIntel;
}

function getNextResearchLevel(state: GameState, id: ResearchId): number {
  return getResearchCurrentLevel(state.researchLevels, id) + 1;
}

function isResearchMaxed(state: GameState, id: ResearchId): boolean {
  const config = getResearchConfig(id);
  if (!config) return true;
  return getResearchCurrentLevel(state.researchLevels, id) >= getResearchMaxLevel(config);
}

function getResearchCostForLevel(config: ResearchConfig, level: number): bigint {
  const costResource = getCostResource(config);
  return getLevelScaledCost(BALANCE.researchResourceBaseCostByResource[costResource], costResource, level);
}

export function getResearchCurrentCost(state: GameState, id: ResearchId): bigint {
  const config = getResearchConfig(id);
  if (!config) return 0n;
  if (isResearchMaxed(state, id)) return 0n;
  return getResearchCostForLevel(config, getNextResearchLevel(state, id));
}

export interface ResearchQuantityPreview {
  currentLevel: number;
  nextLevel: number;
  label: string;
  emoji: 'code' | 'science' | 'labor' | 'data' | 'flops' | 'energy' | 'rockets';
  unit: string;
  current: number;
  next: number;
}

export function getResearchQuantityPreview(state: GameState, id: ResearchId): ResearchQuantityPreview | null {
  const config = getResearchConfig(id);
  if (!config || config.quantityBase === undefined || config.quantityLabel === undefined || config.quantityEmoji === undefined) {
    return null;
  }

  const currentLevel = getResearchCurrentLevel(state.researchLevels, id);
  const nextLevel = getNextResearchLevel(state, id);
  const current = config.quantityBase * Math.pow(config.quantityMultiplierPerLevel, Math.max(0, currentLevel));
  const next = config.quantityBase * Math.pow(config.quantityMultiplierPerLevel, Math.max(0, nextLevel));
  return {
    currentLevel,
    nextLevel,
    label: config.quantityLabel,
    emoji: config.quantityEmoji,
    unit: config.quantityUnit ?? '',
    current,
    next,
  };
}

export function canPurchaseResearch(state: GameState, id: ResearchId): boolean {
  const config = getResearchConfig(id);
  if (!config) return false;
  if (isSyntheticData1LockedByIntel(state, id)) return false;
  if (isResearchMaxed(state, id)) return false;

  const cost = getResearchCostForLevel(config, getNextResearchLevel(state, id));
  const costResource = getCostResource(config);
  if (state[costResource] < cost) return false;

  for (const prereq of config.prereqs) {
    if (!hasCompletedResearch(state.researchLevels, prereq)) return false;
  }

  return true;
}

export function purchaseResearch(state: GameState, id: ResearchId): boolean {
  if (!canPurchaseResearch(state, id)) return false;

  const config = getResearchConfig(id)!;
  const nextLevel = getNextResearchLevel(state, id);
  const cost = getResearchCostForLevel(config, nextLevel);
  const costResource = getCostResource(config);
  state[costResource] -= cost;
  state.researchLevels[id] = nextLevel;

  return true;
}

export function getAvailableResearch(state: GameState): ResearchConfig[] {
  return BALANCE.research.filter(r => {
    if (isResearchMaxed(state, r.id)) return false;
    if (isSyntheticData1LockedByIntel(state, r.id)) return false;
    for (const prereq of r.prereqs) {
      if (!hasCompletedResearch(state.researchLevels, prereq)) return false;
    }
    return true;
  });
}
