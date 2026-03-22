import type { GameState } from '../GameState.ts';
import { BALANCE, getTrainingModelResourceRequirements } from '../BalanceConfig.ts';
import { toBigInt, divB, scaleB, mulB } from '../utils.ts';

function canAffordTrainingModelResources(state: GameState, indexConfig: typeof BALANCE.fineTunes[number]): boolean {
  for (const requirement of getTrainingModelResourceRequirements(indexConfig)) {
    if (state[requirement.resource] < requirement.cost) return false;
  }
  return true;
}

export function tickTraining(state: GameState, dtMs: number): void {
  if (!state.isPostGpuTransition) return;

  // milliseconds per hour - must be scaled for divB
  const hourB = toBigInt(3600000);

  // Progress fine-tune (apply algo efficiency bonus)
  if (state.currentFineTuneIndex >= 0 && state.trainingAllocatedPflops > 0n) {
    let pflopsHrsThisTick = divB(mulB(state.trainingAllocatedPflops, toBigInt(dtMs)), hourB);
    pflopsHrsThisTick = scaleB(pflopsHrsThisTick, state.algoEfficiencyBonus);
    state.fineTuneProgress += pflopsHrsThisTick;

    const ft = BALANCE.fineTunes[state.currentFineTuneIndex];
    if (state.fineTuneProgress >= ft.pflopsHrs) {
      state.completedFineTunes.push(state.currentFineTuneIndex);
      state.intelligence = ft.intel;
      state.currentFineTuneIndex = -1;
      state.fineTuneProgress = 0n;
    }
  }

  // Progress Aries training (apply algo efficiency bonus)
  if (state.ariesModelIndex >= 0 && state.trainingAllocatedPflops > 0n) {
    let pflopsHrsThisTick = divB(mulB(state.trainingAllocatedPflops, toBigInt(dtMs)), hourB);
    pflopsHrsThisTick = scaleB(pflopsHrsThisTick, state.algoEfficiencyBonus);
    state.ariesProgress += pflopsHrsThisTick;

    const am = BALANCE.ariesModels[state.ariesModelIndex];
    if (state.ariesProgress >= am.pflopsHrs) {
      state.intelligence = am.intel;
      state.ariesModelIndex = -1;
      state.ariesProgress = 0n;
    }
  }
}

export function startFineTune(state: GameState, index: number): boolean {
  if (index < 0 || index >= BALANCE.fineTunes.length) return false;
  if (state.completedFineTunes.includes(index)) return false;
  if (state.currentFineTuneIndex >= 0) return false;
  if (state.ariesModelIndex >= 0) return false;

  const ft = BALANCE.fineTunes[index];
  if (state.trainingData < ft.dataGB) return false;
  if (!canAffordTrainingModelResources(state, ft)) return false;

  for (let i = 0; i < index; i++) {
    if (!state.completedFineTunes.includes(i)) return false;
  }

  state.currentFineTuneIndex = index;
  state.fineTuneProgress = 0n;
  
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
  if (state.trainingData < am.dataGB) return false;
  if (!canAffordTrainingModelResources(state, am)) return false;

  state.ariesModelIndex = index;
  state.ariesProgress = 0n;
  return true;
}

export function setTrainingAllocation(state: GameState, pct: number): boolean {
  const newPct = Math.max(0, Math.min(100, Math.round(pct)));
  const inferencePct = state.apiInferenceAllocationPct;

  if (newPct + inferencePct > 100) {
    return false;
  }

  state.trainingAllocationPct = newPct;
  return true;
}
