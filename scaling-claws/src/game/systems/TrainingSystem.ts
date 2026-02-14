import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';

export function tickTraining(state: GameState, dtMs: number): void {
  if (!state.isPostGpuTransition) return;

  // Compute training allocation
  const allocPct = state.trainingAllocationPct / 100;
  state.trainingAllocatedPflops = state.totalPflops * allocPct;

  // Update freeCompute accounting (instances + training)
  const model = BALANCE.models[state.currentModelIndex];
  const instanceCompute = state.instanceCount * model.pflopsPerInstance;
  state.freeCompute = Math.max(0, state.totalPflops - instanceCompute - state.trainingAllocatedPflops);

  // Code production
  const humanCodePerMin = state.humanSoftwareDevs * BALANCE.humanDevCodePerMin;
  const aiCodePerMin = state.aiSoftwareDevs * (state.intelligence * BALANCE.aiDevCodePerMinPerIntel);
  state.codePerMin = humanCodePerMin + aiCodePerMin;
  state.code += state.codePerMin * (dtMs / 60000);

  // Science production
  state.sciencePerMin = state.aiResearchers * state.intelligence * BALANCE.aiResearcherSciencePerMinPerIntel;
  state.science += state.sciencePerMin * (dtMs / 60000);

  // Software dev expenses
  const devExpense = state.humanSoftwareDevs * BALANCE.humanDevCostPerMin;
  state.expensePerMin += devExpense;
  state.funds -= devExpense * (dtMs / 60000);

  // Check training unlock
  const totalDCs = state.datacenters.reduce((a, b) => a + b, 0);
  if (!state.milestones.trainingUnlocked && totalDCs >= BALANCE.trainingUnlockDatacenters && state.code >= BALANCE.trainingUnlockCode) {
    state.milestones.trainingUnlocked = true;
  }

  // Progress fine-tune
  if (state.currentFineTuneIndex >= 0 && state.trainingAllocatedPflops > 0) {
    const pflopsHrsThisTick = state.trainingAllocatedPflops * (dtMs / 3600000);
    state.fineTuneProgress += pflopsHrsThisTick;

    const ft = BALANCE.fineTunes[state.currentFineTuneIndex];
    if (state.fineTuneProgress >= ft.pflopsHrs) {
      // Fine-tune complete!
      state.completedFineTunes.push(state.currentFineTuneIndex);
      state.intelligence = ft.intel;
      state.currentFineTuneIndex = -1;
      state.fineTuneProgress = 0;

      state.pendingFlavorTexts.push(
        '"' + ft.name + ' passed every benchmark. The clients are impressed."'
      );
    }
  }

  // Progress Aries training
  if (state.ariesModelIndex >= 0 && state.trainingAllocatedPflops > 0) {
    const pflopsHrsThisTick = state.trainingAllocatedPflops * (dtMs / 3600000);
    state.ariesProgress += pflopsHrsThisTick;

    const am = BALANCE.ariesModels[state.ariesModelIndex];
    if (state.ariesProgress >= am.pflopsHrs) {
      // Aries model complete!
      state.intelligence = am.intel;
      state.ariesModelIndex = -1;
      state.ariesProgress = 0;

      state.pendingFlavorTexts.push(
        '"' + am.name + ' is online. Intelligence: ' + am.intel + '."'
      );
    }
  }

  // Check research unlock
  if (!state.milestones.researchUnlocked && state.intelligence >= BALANCE.researchUnlockIntel) {
    state.milestones.researchUnlocked = true;
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
  if (state.currentFineTuneIndex >= 0) return false; // Already training
  if (state.ariesModelIndex >= 0) return false; // Aries training in progress

  const ft = BALANCE.fineTunes[index];
  if (state.trainingData < ft.dataTB) return false;
  if (ft.codeReq > 0 && state.code < ft.codeReq) return false;

  // Check prereqs: must have completed all previous fine-tunes
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

  // Must have completed all fine-tunes first
  if (state.completedFineTunes.length < BALANCE.fineTunes.length) return false;

  // Must have completed all previous Aries models
  // (intelligence check serves as proxy)
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

export function setTrainingAllocation(state: GameState, pct: number): void {
  state.trainingAllocationPct = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
}

export function hireSoftwareDev(state: GameState, isAI: boolean): boolean {
  if (isAI) {
    if (state.intelligence < 4.0) return false; // Need Intel 4.0+
    state.aiSoftwareDevs++;
  } else {
    if (state.funds < BALANCE.humanDevCostPerMin) return false;
    state.humanSoftwareDevs++;
  }
  return true;
}

export function hireAIResearcher(state: GameState): boolean {
  if (state.intelligence < 12.0) return false;
  state.aiResearchers++;
  return true;
}
