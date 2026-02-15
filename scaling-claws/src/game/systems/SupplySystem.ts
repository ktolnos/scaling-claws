import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';

export function tickSupply(state: GameState, dtMs: number): void {
  if (!state.completedResearch.includes('chipFab1')) return;

  // Chip fabrication bonus from research
  let fabBonus = 1;
  if (state.completedResearch.includes('chipFab2')) fabBonus *= 2;
  if (state.completedResearch.includes('chipFab3')) fabBonus *= 3;

  // Auto-produce GPUs from fabs (consume wafer batches)
  if (state.waferFabs > 0 && state.waferBatches > 0) {
    const batchesPerMin = state.waferFabs * BALANCE.fabOutputPerMin * fabBonus;
    const batchesConsumed = Math.min(state.waferBatches, batchesPerMin * (dtMs / 60000));
    const gpusProduced = batchesConsumed * BALANCE.waferBatchGpus;

    state.waferBatches -= batchesConsumed;
    const spaceAvailable = state.gpuCapacity - state.gpuCount;
    const actualGpus = Math.min(gpusProduced, spaceAvailable);
    state.gpuCount += actualGpus;
    state.gpuProductionPerMin = batchesPerMin * BALANCE.waferBatchGpus;
  } else if (state.lithoMachines > 0 && state.waferBatches > 0) {
    const batchesPerMin = state.lithoMachines * 1 * fabBonus;
    const batchesConsumed = Math.min(state.waferBatches, batchesPerMin * (dtMs / 60000));
    const gpusProduced = batchesConsumed * BALANCE.waferBatchGpus;

    state.waferBatches -= batchesConsumed;
    const spaceAvailable = state.gpuCapacity - state.gpuCount;
    const actualGpus = Math.min(gpusProduced, spaceAvailable);
    state.gpuCount += actualGpus;
    state.gpuProductionPerMin = batchesPerMin * BALANCE.waferBatchGpus;
  } else {
    state.gpuProductionPerMin = 0;
  }

  // Auto-produce robots from factories
  if (state.robotFactories > 0) {
    const robotsPerMin = state.robotFactories * BALANCE.robotFactoryOutputPerMin;
    state.robots += robotsPerMin * (dtMs / 60000);
  }
}

// --- Actions ---

export function buyLithoMachine(state: GameState): boolean {
  if (state.funds < BALANCE.lithoMachineCost) return false;

  state.funds -= BALANCE.lithoMachineCost;
  state.lithoMachines++;
  return true;
}

export function buyWaferBatch(state: GameState, amount: number): boolean {
  const cost = amount * BALANCE.waferBatchCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.waferBatches += amount;
  return true;
}

export function buildFab(state: GameState): boolean {
  if (state.funds < BALANCE.fabCost) return false;
  if (state.labor < BALANCE.fabLaborCost) return false;

  state.funds -= BALANCE.fabCost;
  state.labor -= BALANCE.fabLaborCost;
  state.waferFabs++;
  return true;
}

export function buildSiliconMine(state: GameState): boolean {
  if (state.funds < BALANCE.siliconMineCost) return false;
  if (state.labor < BALANCE.siliconMineLaborCost) return false;

  state.funds -= BALANCE.siliconMineCost;
  state.labor -= BALANCE.siliconMineLaborCost;
  state.siliconMines++;
  return true;
}

export function buildRobotFactory(state: GameState): boolean {
  if (state.funds < BALANCE.robotFactoryCost) return false;
  if (state.labor < BALANCE.robotFactoryLaborCost) return false;

  state.funds -= BALANCE.robotFactoryCost;
  state.labor -= BALANCE.robotFactoryLaborCost;
  state.robotFactories++;
  return true;
}

export function buyRobot(state: GameState, amount: number): boolean {
  const cost = amount * BALANCE.robotCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.robots += amount;
  return true;
}
