import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import { toBigInt, mulB, scaleBigInt } from '../utils.ts';

export function tickEnergy(state: GameState): void { // Removed unused _dtMs
  if (!state.isPostGpuTransition) return;

  // Power demand: GPUs
  state.powerDemandMW = mulB(state.installedGpuCount, toBigInt(BALANCE.gpuPowerMW));

  // Power supply: grid + plants + solar + home
  let supply = toBigInt(BALANCE.homePowerMW);
  supply += state.gridPowerKW / 1000n;
  supply += mulB(state.gasPlants, BALANCE.powerPlants.gas.outputMW);
  supply += mulB(state.nuclearPlants, BALANCE.powerPlants.nuclear.outputMW);
  supply += mulB(state.solarPanels, toBigInt(BALANCE.solarPanelMW));
  state.powerSupplyMW = supply;

  // Throttle: if demand > supply, GPUs run at reduced capacity
  if (state.powerDemandMW > 0n && state.powerSupplyMW < state.powerDemandMW) {
    state.powerThrottle = Number(state.powerSupplyMW) / Number(state.powerDemandMW);
  } else {
    state.powerThrottle = 1.0;
  }

  // Lunar grid (independent of Earth)
  state.lunarPowerDemandMW = mulB(state.lunarGPUs, toBigInt(BALANCE.gpuPowerMW));
  state.lunarPowerSupplyMW = mulB(state.lunarSolarPanels, toBigInt(BALANCE.lunarSolarPanelMW));
  if (state.lunarPowerDemandMW > 0n && state.lunarPowerSupplyMW < state.lunarPowerDemandMW) {
    state.lunarPowerThrottle = Number(state.lunarPowerSupplyMW) / Number(state.lunarPowerDemandMW);
  } else {
    state.lunarPowerThrottle = 1.0;
  }

  // Total energy (for TopBar display)
  state.totalEnergyMW = state.powerSupplyMW + state.lunarPowerSupplyMW + state.orbitalPowerMW;
}

export function buyGridPower(state: GameState, amountKW: number): boolean {
  const amountKWB = toBigInt(amountKW);
  const newTotalKW = state.gridPowerKW + amountKWB;
  const newTotalCostPerMin = mulB(newTotalKW, toBigInt(BALANCE.gridPowerCostPerKWPerMin));
  
  if (state.funds < newTotalCostPerMin) return false;

  state.gridPowerKW = newTotalKW;
  return true;
}

export function sellGridPower(state: GameState, amountKW: number): boolean {
  const amountKWB = toBigInt(amountKW);
  if (state.gridPowerKW < amountKWB) {
    state.gridPowerKW = 0n;
  } else {
    state.gridPowerKW -= amountKWB;
  }
  return true;
}

export function buyGasPlant(state: GameState): boolean {
  if (state.funds < BALANCE.powerPlants.gas.cost) return false;
  if (state.labor < BALANCE.powerPlants.gas.laborCost) return false;

  state.funds -= BALANCE.powerPlants.gas.cost;
  state.labor -= BALANCE.powerPlants.gas.laborCost;
  state.gasPlants += scaleBigInt(1n);
  return true;
}

export function buyNuclearPlant(state: GameState): boolean {
  if (state.funds < BALANCE.powerPlants.nuclear.cost) return false;
  if (state.labor < BALANCE.powerPlants.nuclear.laborCost) return false;

  state.funds -= BALANCE.powerPlants.nuclear.cost;
  state.labor -= BALANCE.powerPlants.nuclear.laborCost;
  state.nuclearPlants += scaleBigInt(1n);
  return true;
}

export function buySolarFarm(state: GameState): boolean {
  if (state.funds < BALANCE.powerPlants.solar.cost) return false;
  if (state.labor < BALANCE.powerPlants.solar.laborCost) return false;

  state.funds -= BALANCE.powerPlants.solar.cost;
  state.labor -= BALANCE.powerPlants.solar.laborCost;
  state.solarFarms += scaleBigInt(1n);
  return true;
}

export function buySolarPanel(state: GameState, amount: number): boolean {
  if (state.solarFarms <= 0n) return false;
  const amountB = toBigInt(amount);
  const cost = mulB(amountB, BALANCE.solarPanelCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.solarPanels += amountB;
  return true;
}

