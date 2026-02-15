import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import type { ResearchId, ResearchConfig } from '../BalanceConfig.ts';

export function tickResearch(state: GameState, _dtMs: number): void {
  if (!state.isPostGpuTransition) return;

  // Compute research bonuses from completedResearch
  computeResearchBonuses(state);

  // Synth data production
  if (state.synthDataUnlocked && state.synthDataAllocPflops > 0) {
    const synthMultiplier = getSynthDataMultiplier(state);
    const tbPerMin = (state.synthDataAllocPflops / BALANCE.synthDataPflopsPerTBPerMin) * synthMultiplier;
    state.synthDataRate = tbPerMin;
    state.trainingData += tbPerMin * (_dtMs / 60000);
  } else {
    state.synthDataRate = 0;
  }

  // Compute sub selling unlock
  state.subSellingUnlocked = state.intelligence >= BALANCE.subSellingUnlockIntel &&
      state.code >= BALANCE.subSellingUnlockCode;
}

function computeResearchBonuses(state: GameState): void {
  // Algo Efficiency: each tier is 25% faster → multiply by 1.25 per tier
  let algoBonus = 1;
  if (state.completedResearch.includes('algoEfficiency1')) algoBonus *= 1.25;
  if (state.completedResearch.includes('algoEfficiency2')) algoBonus *= 1.25;
  if (state.completedResearch.includes('algoEfficiency3')) algoBonus *= 1.25;
  if (state.completedResearch.includes('algoEfficiency4')) algoBonus *= 1.25;
  state.algoEfficiencyBonus = algoBonus;

  // GPU FLOPS: v1 +50%, v2 +50%, v3 +100%
  let gpuBonus = 1;
  if (state.completedResearch.includes('gpuArch1')) gpuBonus *= 1.5;
  if (state.completedResearch.includes('gpuArch2')) gpuBonus *= 1.5;
  if (state.completedResearch.includes('gpuArch3')) gpuBonus *= 2.0;
  state.gpuFlopsBonus = gpuBonus;

  // Synth data unlock
  state.synthDataUnlocked = state.completedResearch.includes('synthData1');

}

function getSynthDataMultiplier(state: GameState): number {
  let mult = 1;
  if (state.completedResearch.includes('synthData2')) mult *= 2;
  if (state.completedResearch.includes('synthData3')) mult *= 2;
  return mult;
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
      '"Synthetic data pipeline online. The model trains on its own imagination."'
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

export function setSynthDataAllocation(state: GameState, pflops: number): void {
  state.synthDataAllocPflops = Math.max(0, Math.min(state.freeCompute, pflops));
}
