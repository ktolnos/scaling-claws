import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';

export function tickTraining(state: GameState, dtMs: number): void {
  if (!state.isPostGpuTransition) return;

  // Compute training allocation - NOW HANDLED IN ComputeSystem.ts
  // state.trainingAllocatedPflops is already set
  
  // Update freeCompute accounting - NOW HANDLED IN ComputeSystem.ts

  // Code and science production is now handled by JobSystem (AI/Human SWE and AI Researcher jobs)

  // Progress fine-tune (apply algo efficiency bonus)
  if (state.currentFineTuneIndex >= 0 && state.trainingAllocatedPflops > 0) {
    const pflopsHrsThisTick = state.trainingAllocatedPflops * (dtMs / 3600000) * state.algoEfficiencyBonus;
    state.fineTuneProgress += pflopsHrsThisTick;

    const ft = BALANCE.fineTunes[state.currentFineTuneIndex];
    if (state.fineTuneProgress >= ft.pflopsHrs) {
      state.completedFineTunes.push(state.currentFineTuneIndex);
      state.intelligence = ft.intel;
      state.currentFineTuneIndex = -1;
      state.fineTuneProgress = 0;

      state.pendingFlavorTexts.push(
        '"' + ft.name + ' passed every benchmark. The clients are impressed."'
      );
    }
  }

  // Progress Aries training (apply algo efficiency bonus)
  if (state.ariesModelIndex >= 0 && state.trainingAllocatedPflops > 0) {
    const pflopsHrsThisTick = state.trainingAllocatedPflops * (dtMs / 3600000) * state.algoEfficiencyBonus;
    state.ariesProgress += pflopsHrsThisTick;

    const am = BALANCE.ariesModels[state.ariesModelIndex];
    if (state.ariesProgress >= am.pflopsHrs) {
      state.intelligence = am.intel;
      state.ariesModelIndex = -1;
      state.ariesProgress = 0;

      state.pendingFlavorTexts.push(
        '"' + am.name + ' is online. Intelligence: ' + am.intel + '."'
      );
    }
  }
}

export function buyTrainingData(state: GameState, amountTB: number): boolean {
  const pricePerTB = BALANCE.dataBaseCostPerTB * Math.pow(1 + BALANCE.dataEscalationRate, state.trainingDataPurchases);
  const cost = amountTB * pricePerTB;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.trainingData += amountTB;
  state.trainingDataPurchases++;
  return true;
}

export function startFineTune(state: GameState, index: number): boolean {
  if (index < 0 || index >= BALANCE.fineTunes.length) return false;
  if (state.completedFineTunes.includes(index)) return false;
  if (state.currentFineTuneIndex >= 0) return false;
  if (state.ariesModelIndex >= 0) return false;

  const ft = BALANCE.fineTunes[index];
  if (state.trainingData < ft.dataTB) return false;
  if (ft.codeReq > 0 && state.code < ft.codeReq) return false;

  for (let i = 0; i < index; i++) {
    if (!state.completedFineTunes.includes(i)) return false;
  }

  state.currentFineTuneIndex = index;
  state.fineTuneProgress = 0;
  return true;
}

export function startAriesTraining(state: GameState, index: number): boolean {
  if (index < 0 || index >= BALANCE.ariesModels.length) return false;
  if (state.currentFineTuneIndex >= 0) return false;
  if (state.ariesModelIndex >= 0) return false;

  if (state.completedFineTunes.length < BALANCE.fineTunes.length) return false;

  if (index > 0) {
    const prevAries = BALANCE.ariesModels[index - 1];
    if (state.intelligence < prevAries.intel) return false;
  }

  const am = BALANCE.ariesModels[index];
  if (state.trainingData < am.dataTB) return false;
  if (am.codeReq > 0 && state.code < am.codeReq) return false;

  state.ariesModelIndex = index;
  state.ariesProgress = 0;
  return true;
}

export function setTrainingAllocation(state: GameState, pct: number): boolean {
  const newPct = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
  const inferencePct = state.apiInferenceAllocationPct;

  if (newPct + inferencePct > 100) {
    return false;
  }

  state.trainingAllocationPct = newPct;
  return true;
}
