import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';

export function tickSupply(state: GameState, dtMs: number): void {
  if (!state.completedResearch.includes('chipFab1')) {
    state.mineActualRate = 0;
    state.fabActualRate = 0;
    state.lithoActualRate = 0;
    state.factoryActualRate = 0;
    return;
  }

  // Chip fabrication bonus from research
  let fabBonus = 1;
  if (state.completedResearch.includes('chipFab2')) fabBonus *= 2;
  if (state.completedResearch.includes('chipFab3')) fabBonus *= 3;

  const alpha = 0.05; // Smoothing factor for ~1s window

  // 1. Silicon production from mines
  const siliconProdPerMin = state.siliconMines * BALANCE.siliconMineOutputPerMin;
  state.siliconProductionPerMin = siliconProdPerMin * state.laborThrottle;
  const siliconProduced = state.siliconProductionPerMin * (dtMs / 60000);
  state.silicon += siliconProduced;
  
  const targetMineRate = state.siliconMines > 0 ? state.laborThrottle : 0;
  state.mineActualRate = (state.mineActualRate * (1 - alpha)) + (targetMineRate * alpha);

  // 2. Wafer production from fabs (consume silicon)
  const waferMaxProdPerMin = state.waferFabs * BALANCE.fabOutputPerMin * fabBonus;
  state.waferProductionPerMin = waferMaxProdPerMin * state.laborThrottle;
  state.siliconDemandPerMin = state.waferFabs * BALANCE.fabOutputPerMin * fabBonus * BALANCE.waferSiliconCost * state.laborThrottle;

  let fabTarget = 0;
  if (state.waferFabs > 0) {
    if (state.silicon > 0) {
      const maxPossibleBySilicon = state.silicon / BALANCE.waferSiliconCost;
      const potentialWafersInTick = state.waferProductionPerMin * (dtMs / 60000);
      const nextWafers = Math.min(maxPossibleBySilicon, potentialWafersInTick);
      
      state.wafers += nextWafers;
      state.silicon = Math.max(0, state.silicon - nextWafers * BALANCE.waferSiliconCost);
      fabTarget = nextWafers / (potentialWafersInTick || 1) * state.laborThrottle;
    }
  }
  state.fabActualRate = (state.fabActualRate * (1 - alpha)) + (fabTarget * alpha);

  // 3. GPU production from litho machines (consume wafers)
  const lithoWafersMaxPerMin = state.lithoMachines * BALANCE.lithoWaferConsumptionPerMin * fabBonus;
  state.waferDemandPerMin = lithoWafersMaxPerMin; // Litho doesn't use labor, just wafers/power? (Wait, currently no power for litho)

  let lithoTarget = 0;
  if (state.lithoMachines > 0) {
    if (state.wafers > 0) {
      const wafersNeeded = lithoWafersMaxPerMin * (dtMs / 60000);
      const wafersConsumed = Math.min(state.wafers, wafersNeeded);
      const gpusProduced = wafersConsumed * BALANCE.waferGpus;

      state.gpuCount += gpusProduced;
      state.wafers = Math.max(0, state.wafers - wafersConsumed);
      
      const potentialGpusInTick = lithoWafersMaxPerMin * BALANCE.waferGpus * (dtMs / 60000);
      lithoTarget = gpusProduced / (potentialGpusInTick || 1);
      state.gpuProductionPerMin = (gpusProduced / (dtMs / 60000));
    } else {
      state.gpuProductionPerMin = 0;
    }
  } else {
    state.gpuProductionPerMin = 0;
  }
  state.lithoActualRate = (state.lithoActualRate * (1 - alpha)) + (lithoTarget * alpha);

  // Auto-produce robots from factories
  let factoryTarget = 0;
  if (state.robotFactories > 0) {
    const robotsPerMin = state.robotFactories * BALANCE.robotFactoryOutputPerMin * state.laborThrottle;
    state.robots += robotsPerMin * (dtMs / 60000);
    factoryTarget = state.laborThrottle;
  }
  state.factoryActualRate = (state.factoryActualRate * (1 - alpha)) + (factoryTarget * alpha);

  // Final safety clamp
  state.silicon = Math.max(0, state.silicon);
  state.wafers = Math.max(0, state.wafers);
}

// --- Actions ---

export function buyLithoMachine(state: GameState, amount: number = 1): boolean {
  const cost = amount * BALANCE.lithoMachineCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.lithoMachines += amount;
  return true;
}

export function buyWafers(state: GameState, amount: number): boolean {
  const cost = amount * BALANCE.waferCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.wafers += amount;
  return true;
}

export function buySilicon(state: GameState, amount: number): boolean {
  const cost = amount * BALANCE.siliconCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.silicon += amount;
  return true;
}

export function buildFab(state: GameState, amount: number = 1): boolean {
  const cost = amount * BALANCE.fabCost;
  const laborCost = amount * BALANCE.fabLaborCost;
  if (state.funds < cost) return false;
  if (state.labor < laborCost) return false;

  state.funds -= cost;
  state.labor -= laborCost;
  state.waferFabs += amount;
  return true;
}

export function buildSiliconMine(state: GameState, amount: number = 1): boolean {
  const cost = amount * BALANCE.siliconMineCost;
  const laborCost = amount * BALANCE.siliconMineLaborCost;
  if (state.funds < cost) return false;
  if (state.labor < laborCost) return false;

  state.funds -= cost;
  state.labor -= laborCost;
  state.siliconMines += amount;
  return true;
}

export function buildRobotFactory(state: GameState, amount: number = 1): boolean {
  const cost = amount * BALANCE.robotFactoryCost;
  const laborCost = amount * BALANCE.robotFactoryLaborCost;
  if (state.funds < cost) return false;
  if (state.labor < laborCost) return false;

  state.funds -= BALANCE.robotFactoryCost;
  state.labor -= BALANCE.robotFactoryLaborCost;
  state.robotFactories += amount;
  return true;
}

export function buyRobot(state: GameState, amount: number): boolean {
  const cost = amount * BALANCE.robotCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.robots += amount;
  return true;
}
