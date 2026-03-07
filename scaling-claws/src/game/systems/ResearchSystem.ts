import type { GameState } from '../GameState.ts';
import {
  BALANCE,
  getAlgoEfficiencyResearchMultiplier,
  getApiUserSynthRateFromResearch,
  getGpuFlopsResearchMultiplier,
  getRocketLossPctFromResearch,
} from '../BalanceConfig.ts';
import type { ResearchId, ResearchConfig } from '../BalanceConfig.ts';

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

export function canPurchaseResearch(state: GameState, id: ResearchId): boolean {
  if (state.completedResearch.includes(id)) return false;

  const config = getResearchConfig(id);
  if (!config) return false;

  if (state.science < config.cost) return false;

  for (const prereq of config.prereqs) {
    if (!state.completedResearch.includes(prereq)) return false;
  }

  return true;
}

export function purchaseResearch(state: GameState, id: ResearchId): boolean {
  if (!canPurchaseResearch(state, id)) return false;

  const config = getResearchConfig(id)!;
  state.science -= config.cost;
  state.completedResearch.push(id);

  // Flavor text highlights
  if (id === 'robotics1') {
    state.pendingFlavorTexts.push('"Robot workers unlocked. Automated labor now scales with robotics tech."');
  } else if (id === 'robotFactoryEngineering1') {
    state.pendingFlavorTexts.push('"Earth robot factories unlocked."');
  } else if (id === 'moonRobotics') {
    state.pendingFlavorTexts.push('"Moon robot factories unlocked."');
  } else if (id === 'mercuryRobotics') {
    state.pendingFlavorTexts.push('"Mercury robot factories unlocked."');
  } else if (id === 'syntheticData1') {
    state.pendingFlavorTexts.push('"AI Data Synthesizer unlocked. Agents can now generate training data directly."');
  } else if (id === 'payloadToMoon') {
    state.pendingFlavorTexts.push('"Lunar logistics online. Earth no longer runs alone."');
  } else if (id === 'payloadToMercury') {
    state.pendingFlavorTexts.push('"Mercury corridor unlocked. The Dyson route is open."');
  } else if (id === 'moonMassDrivers') {
    state.pendingFlavorTexts.push('"Mass drivers active. Payload throughput surges."');
  } else if (id === 'vonNeumannProbes') {
    state.pendingFlavorTexts.push('"Probe architecture complete. You can now trigger the endgame launch."');
  }

  return true;
}

export function getAvailableResearch(state: GameState): ResearchConfig[] {
  return BALANCE.research.filter(r => {
    if (state.completedResearch.includes(r.id)) return false;
    for (const prereq of r.prereqs) {
      if (!state.completedResearch.includes(prereq)) return false;
    }
    return true;
  });
}
