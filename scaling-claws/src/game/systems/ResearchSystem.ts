import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import type { ResearchId, ResearchConfig } from '../BalanceConfig.ts';

export function tickResearch(state: GameState, _dtMs: number): void {
  computeResearchBonuses(state);
}

function computeResearchBonuses(state: GameState): void {
  // Algo Efficiency: each tier is 3x faster
  let algoBonus = 1.0;
  if (state.completedResearch.includes('algoEfficiency1')) algoBonus *= 3;
  if (state.completedResearch.includes('algoEfficiency2')) algoBonus *= 3;
  if (state.completedResearch.includes('algoEfficiency3')) algoBonus *= 3;
  if (state.completedResearch.includes('algoEfficiency4')) algoBonus *= 3;
  state.algoEfficiencyBonus = algoBonus;

  // GPU FLOPS
  let gpuBonus = 1.0;
  if (state.completedResearch.includes('gpuArch1')) gpuBonus *= 1.5;
  if (state.completedResearch.includes('gpuArch2')) gpuBonus *= 1.5;
  if (state.completedResearch.includes('gpuArch3')) gpuBonus *= 2.0;
  state.gpuFlopsBonus = gpuBonus;

  // API user data generation bonuses
  let synthRate = 0n;
  if (state.completedResearch.includes('synthData1')) {
    synthRate = BALANCE.apiUserSynthBase;
    if (state.completedResearch.includes('synthData2')) synthRate *= 2n;
    if (state.completedResearch.includes('synthData3')) synthRate *= 2n;
  }
  state.apiUserSynthRate = synthRate;

  // Rocket loss / recovery tiers
  let rocketLoss = BALANCE.rocketLossNoReuse;
  if (state.completedResearch.includes('reusableRockets1')) {
    rocketLoss = BALANCE.rocketLossReusable1;
  }
  if (state.completedResearch.includes('reusableRockets2')) {
    rocketLoss = BALANCE.rocketLossReusable2;
  }
  if (state.completedResearch.includes('reusableRockets3')) {
    rocketLoss = BALANCE.rocketLossReusable3;
  }
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
  } else if (id === 'robotFactoryEngineering2') {
    state.pendingFlavorTexts.push('"Off-world robot factories unlocked for Moon and Mercury."');
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
