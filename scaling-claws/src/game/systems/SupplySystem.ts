import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import { toBigInt, divB, mulB, scaleB } from '../utils.ts';

export function tickSupply(state: GameState, dtMs: number): void {

  if (!state.completedResearch.includes('chipFab1')) {
    state.mineActualRate = 0;
    state.fabActualRate = 0;
    state.lithoActualRate = 0;
    state.factoryActualRate = 0;
    return;
  }

  // Chip fabrication bonus from research
  let fabBonus = 1.0;
  if (state.completedResearch.includes('chipFab2')) fabBonus = 2.0;
  if (state.completedResearch.includes('chipFab3')) fabBonus = 3.0;

  const alpha = 0.05; // Smoothing factor for ~1s window

  // 1. Silicon production from mines
  state.siliconProductionPerMin = mulB(state.siliconMines, BALANCE.siliconMineOutputPerMin);
  state.silicon += mulB(state.siliconProductionPerMin, toBigInt(dtMs)) / 60000n;
  
  const targetMineRate = state.siliconMines > 0n ? 1.0 : 0;
  state.mineActualRate = (state.mineActualRate * (1 - alpha)) + (targetMineRate * alpha);

  // 2. Wafer production from fabs (consume silicon)
  // waferMaxProdPerMin = fabs * output * bonus (all scaled)
  const baseWaferMaxPerMin = mulB(state.waferFabs, BALANCE.fabOutputPerMin);
  const waferMaxProdPerMin = scaleB(baseWaferMaxPerMin, fabBonus);
  
  state.waferProductionPerMin = waferMaxProdPerMin;
  state.siliconDemandPerMin = mulB(state.waferProductionPerMin, BALANCE.waferSiliconCost);

  let fabTarget = 0;
  if (state.waferFabs > 0n) {
    if (state.silicon > 0n) {
      const maxPossibleBySilicon = divB(state.silicon, BALANCE.waferSiliconCost);
      const potentialWafersInTick = mulB(state.waferProductionPerMin, toBigInt(dtMs)) / 60000n;
      const nextWafers = maxPossibleBySilicon < potentialWafersInTick ? maxPossibleBySilicon : potentialWafersInTick;
      
      state.wafers += nextWafers;
      state.silicon -= mulB(nextWafers, BALANCE.waferSiliconCost);
      if (state.silicon < 0n) state.silicon = 0n;
      
      fabTarget = (potentialWafersInTick > 0n) ? (Number(nextWafers) / Number(potentialWafersInTick)) : 0;
    }
  }
  state.fabActualRate = (state.fabActualRate * (1 - alpha)) + (fabTarget * alpha);

  // 3. GPU production from litho machines (consume wafers)
  const baseLithoWafersMax = mulB(state.lithoMachines, BALANCE.lithoWaferConsumptionPerMin);
  const lithoWafersMaxPerMin = scaleB(baseLithoWafersMax, fabBonus);
  state.waferDemandPerMin = lithoWafersMaxPerMin; 

  let lithoTarget = 0;
  if (state.lithoMachines > 0n) {
    if (state.wafers > 0n) {
      const wafersNeeded = mulB(lithoWafersMaxPerMin, toBigInt(dtMs)) / 60000n;
      const wafersConsumed = state.wafers < wafersNeeded ? state.wafers : wafersNeeded;
      const gpusProduced = mulB(wafersConsumed, BALANCE.waferGpus);

      state.gpuCount += gpusProduced;
      state.wafers -= wafersConsumed;
      
      const potentialGpusInTick = mulB(mulB(lithoWafersMaxPerMin, BALANCE.waferGpus), toBigInt(dtMs)) / 60000n;
      lithoTarget = (potentialGpusInTick > 0n) ? Number(gpusProduced) / Number(potentialGpusInTick) : 0;
      state.gpuProductionPerMin = (gpusProduced * 60000n) / toBigInt(dtMs);
    } else {
      state.gpuProductionPerMin = 0n;
    }
  } else {
    state.gpuProductionPerMin = 0n;
  }
  state.lithoActualRate = (state.lithoActualRate * (1 - alpha)) + (lithoTarget * alpha);

  // Auto-produce robots from factories
  let factoryTarget = 0;
  if (state.robotFactories > 0n) {
    const robotsMaxPerMin = mulB(state.robotFactories, BALANCE.robotFactoryOutputPerMin);
    state.robots += mulB(robotsMaxPerMin, toBigInt(dtMs)) / 60000n;
    factoryTarget = 1.0;
  }
  state.factoryActualRate = (state.factoryActualRate * (1 - alpha)) + (factoryTarget * alpha);

  // Final safety clamp
  if (state.silicon < 0n) state.silicon = 0n;
  if (state.wafers < 0n) state.wafers = 0n;
}

// --- Actions ---

export function buyLithoMachine(state: GameState, amount: number = 1): boolean {
  const amountB = toBigInt(amount);
  const cost = mulB(amountB, BALANCE.lithoMachineCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.lithoMachines += amountB;
  return true;
}

export function buyWafers(state: GameState, amount: number): boolean {
  const amountB = toBigInt(amount);
  const cost = mulB(amountB, BALANCE.waferCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.wafers += amountB;
  return true;
}

export function buySilicon(state: GameState, amount: number): boolean {
  const amountB = toBigInt(amount);
  const cost = mulB(amountB, BALANCE.siliconCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.silicon += amountB;
  return true;
}

export function buildFab(state: GameState, amount: number = 1): boolean {
  const amountB = toBigInt(amount);
  const cost = mulB(amountB, BALANCE.fabCost);
  const laborCost = mulB(amountB, BALANCE.fabLaborCost);
  if (state.funds < cost) return false;
  if (state.labor < laborCost) return false;

  state.funds -= cost;
  state.labor -= laborCost;
  state.waferFabs += amountB;
  return true;
}

export function buildSiliconMine(state: GameState, amount: number = 1): boolean {
  const amountB = toBigInt(amount);
  const cost = mulB(amountB, BALANCE.siliconMineCost);
  const laborCost = mulB(amountB, BALANCE.siliconMineLaborCost);
  if (state.funds < cost) return false;
  if (state.labor < laborCost) return false;

  state.funds -= cost;
  state.labor -= laborCost;
  state.siliconMines += amountB;
  return true;
}

export function buildRobotFactory(state: GameState, amount: number = 1): boolean {
  const amountB = toBigInt(amount);
  const cost = mulB(amountB, BALANCE.robotFactoryCost);
  const laborCost = mulB(amountB, BALANCE.robotFactoryLaborCost);
  if (state.funds < cost) return false;
  if (state.labor < laborCost) return false;

  state.funds -= cost;
  state.labor -= laborCost;
  state.robotFactories += amountB;
  return true;
}

export function buyRobot(state: GameState, amount: number): boolean {
  const amountB = toBigInt(amount);
  const cost = mulB(amountB, BALANCE.robotCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.robots += amountB;
  return true;
}


