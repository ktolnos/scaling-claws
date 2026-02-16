import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import type { ResearchId, ResearchConfig } from '../BalanceConfig.ts';

export function tickResearch(state: GameState, _dtMs: number): void {
  if (!state.isPostGpuTransition) return;

  // Compute research bonuses from completedResearch
  computeResearchBonuses(state);
}

function computeResearchBonuses(state: GameState): void {
  // Algo Efficiency: each tier is 25% faster
  let algoBonus = 1.0;
  if (state.completedResearch.includes('algoEfficiency1')) algoBonus *= 1.25;
  if (state.completedResearch.includes('algoEfficiency2')) algoBonus *= 1.25;
  if (state.completedResearch.includes('algoEfficiency3')) algoBonus *= 1.25;
  if (state.completedResearch.includes('algoEfficiency4')) algoBonus *= 1.25;
  state.algoEfficiencyBonus = algoBonus;

  // GPU FLOPS: v1 +50%, v2 +50%, v3 +100%
  let gpuBonus = 1.0;
  if (state.completedResearch.includes('gpuArch1')) gpuBonus *= 1.5;
  if (state.completedResearch.includes('gpuArch2')) gpuBonus *= 1.5;
  if (state.completedResearch.includes('gpuArch3')) gpuBonus *= 2.0;
  state.gpuFlopsBonus = gpuBonus;

  // Synth Data from research
  let synthRate = 0n;
  if (state.completedResearch.includes('synthData1')) {
    synthRate = BALANCE.apiUserSynthBase;
    if (state.completedResearch.includes('synthData2')) synthRate *= 2n;
    if (state.completedResearch.includes('synthData3')) synthRate *= 2n;
  }
  state.apiUserSynthRate = synthRate;

  // Launch cost reduction from space research
  let launchBonus = 1.0;
  if (state.completedResearch.includes('spaceRockets2')) launchBonus *= 0.6;
  state.launchCostBonus = launchBonus;
}

export function getResearchConfig(id: ResearchId): ResearchConfig | undefined {
  return BALANCE.research.find(r => r.id === id);
}

export function canPurchaseResearch(state: GameState, id: ResearchId): boolean {
  if (state.completedResearch.includes(id)) return false;

  const config = getResearchConfig(id);
  if (!config) return false;

  if (state.science < config.cost) return false;

  // Check prereqs
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

  // Flavor texts for notable research
  if (id === 'chipFab1') {
    state.pendingFlavorTexts.push(
      '"Your first chip fab. TSMC is not worried. Yet."'
    );
  } else if (id === 'robotics1') {
    state.pendingFlavorTexts.push(
      '"Robot factory blueprints acquired. The future is automation."'
    );
  } else if (id === 'synthData1') {
    state.pendingFlavorTexts.push(
      '"Synthetic data pipeline online. Your users are now training the model for you."'
    );
  } else if (id === 'spaceRockets1') {
    state.pendingFlavorTexts.push(
      '"Rocket blueprints acquired. Your neighbors have questions about the delivery."'
    );
  } else if (id === 'spaceSystems1') {
    state.pendingFlavorTexts.push(
      '"Orbital satellite capability unlocked. The sun works for free."'
    );
  } else if (id === 'spaceSystems2') {
    state.pendingFlavorTexts.push(
      '"Lunar operations unlocked. One small step for AI, one giant leap for compute."'
    );
  } else if (id === 'spaceSystems3') {
    state.pendingFlavorTexts.push(
      '"Mercury operations unlocked. The closest planet to the sun has the best solar real estate."'
    );
  }

  return true;
}

export function getAvailableResearch(state: GameState): ResearchConfig[] {
  return BALANCE.research.filter(r => {
    if (state.completedResearch.includes(r.id)) return false;
    // All prereqs met?
    for (const prereq of r.prereqs) {
      if (!state.completedResearch.includes(prereq)) return false;
    }
    return true;
  });
}



