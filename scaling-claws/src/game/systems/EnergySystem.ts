import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';

export function tickEnergy(state: GameState, _dtMs: number): void {
  if (!state.isPostGpuTransition) return;

  // Power demand: GPUs
  state.powerDemandMW = state.gpuCount * BALANCE.gpuPowerMW;

  // Power supply: grid + plants + solar + home
  let supply = BALANCE.homePowerMW;
  supply += state.gridPowerKW / 1000;
  supply += state.gasPlants * BALANCE.powerPlants.gas.outputMW;
  supply += state.nuclearPlants * BALANCE.powerPlants.nuclear.outputMW;
  supply += state.solarPanels * BALANCE.solarPanelMW;
  state.powerSupplyMW = supply;

  // Throttle: if demand > supply, GPUs run at reduced capacity
  if (state.powerDemandMW > 0 && state.powerSupplyMW < state.powerDemandMW) {
    state.powerThrottle = state.powerSupplyMW / state.powerDemandMW;
  } else {
    state.powerThrottle = 1;
  }
}

export function buyGridPower(state: GameState, amountKW: number): boolean {
  const newTotalKW = state.gridPowerKW + amountKW;
  const newTotalCostPerMin = newTotalKW * BALANCE.gridPowerCostPerKWPerMin;
  if (state.funds < newTotalCostPerMin) return false;

  state.gridPowerKW = newTotalKW;
  return true;
}

export function sellGridPower(state: GameState, amountKW: number): boolean {
  if (state.gridPowerKW < amountKW) {
    state.gridPowerKW = 0;
  } else {
    state.gridPowerKW -= amountKW;
  }
  return true;
}

export function buyGasPlant(state: GameState): boolean {
  if (state.funds < BALANCE.powerPlants.gas.cost) return false;
  if (state.labor < BALANCE.powerPlants.gas.laborCost) return false;

  state.funds -= BALANCE.powerPlants.gas.cost;
  state.labor -= BALANCE.powerPlants.gas.laborCost;
  state.gasPlants++;
  return true;
}

export function buyNuclearPlant(state: GameState): boolean {
  if (state.funds < BALANCE.powerPlants.nuclear.cost) return false;
  if (state.labor < BALANCE.powerPlants.nuclear.laborCost) return false;

  state.funds -= BALANCE.powerPlants.nuclear.cost;
  state.labor -= BALANCE.powerPlants.nuclear.laborCost;
  state.nuclearPlants++;
  return true;
}

export function buySolarFarm(state: GameState): boolean {
  if (state.funds < BALANCE.powerPlants.solar.cost) return false;
  if (state.labor < BALANCE.powerPlants.solar.laborCost) return false;

  state.funds -= BALANCE.powerPlants.solar.cost;
  state.labor -= BALANCE.powerPlants.solar.laborCost;
  state.solarFarms++;
  return true;
}

export function buySolarPanel(state: GameState, amount: number): boolean {
  if (state.solarFarms <= 0) return false;
  const cost = amount * BALANCE.solarPanelCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.solarPanels += amount;
  return true;
}
