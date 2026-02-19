import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import { toBigInt, mulB, scaleBigInt, fromBigInt } from '../utils.ts';

function getEarthLaborPool(state: GameState): bigint {
  return state.locationResources?.earth?.labor ?? state.labor;
}

function spendEarthLabor(state: GameState, amount: bigint): void {
  if (state.locationResources?.earth) {
    state.locationResources.earth.labor -= amount;
    state.labor = state.locationResources.earth.labor;
  } else {
    state.labor -= amount;
  }
}

export function tickEnergy(state: GameState): void {
  if (!state.isPostGpuTransition) return;

  // Earth demand from installed GPUs
  state.powerDemandMW = mulB(state.installedGpuCount, toBigInt(BALANCE.gpuPowerMW));

  // Earth supply: grid + plants + installed solar
  let supply = 0n;
  supply += state.gridPowerKW / 1000n;
  supply += mulB(state.gasPlants, BALANCE.powerPlants.gas.outputMW);
  supply += mulB(state.nuclearPlants, BALANCE.powerPlants.nuclear.outputMW);

  const earthInstalledSolar = state.locationResources?.earth?.installedSolarPanels ?? 0n;
  supply += mulB(earthInstalledSolar, toBigInt(BALANCE.solarPanelMW));
  state.powerSupplyMW = supply;

  if (state.powerDemandMW > 0n && state.powerSupplyMW < state.powerDemandMW) {
    state.powerThrottle = Number(state.powerSupplyMW) / Number(state.powerDemandMW);
  } else {
    state.powerThrottle = 1.0;
  }

  // Moon grid
  const moonInstalledGpus = state.locationResources?.moon?.installedGpus ?? state.lunarGPUs;
  const moonInstalledSolar = state.locationResources?.moon?.installedSolarPanels ?? state.lunarSolarPanels;

  state.lunarPowerDemandMW = mulB(moonInstalledGpus, toBigInt(BALANCE.gpuPowerMW));
  state.lunarPowerSupplyMW = mulB(moonInstalledSolar, toBigInt(BALANCE.solarPanelMW));

  if (state.lunarPowerDemandMW > 0n && state.lunarPowerSupplyMW < state.lunarPowerDemandMW) {
    state.lunarPowerThrottle = Number(state.lunarPowerSupplyMW) / Number(state.lunarPowerDemandMW);
  } else {
    state.lunarPowerThrottle = 1.0;
  }

  const mercuryInstalledGpus = state.locationResources?.mercury?.installedGpus ?? 0n;
  const mercuryInstalledSolar = state.locationResources?.mercury?.installedSolarPanels ?? 0n;

  state.mercuryPowerDemandMW = mulB(mercuryInstalledGpus, toBigInt(BALANCE.gpuPowerMW));
  state.mercuryPowerSupplyMW = mulB(mercuryInstalledSolar, toBigInt(BALANCE.solarPanelMW));
  if (state.mercuryPowerDemandMW > 0n && state.mercuryPowerSupplyMW < state.mercuryPowerDemandMW) {
    state.mercuryPowerThrottle = Number(state.mercuryPowerSupplyMW) / Number(state.mercuryPowerDemandMW);
  } else {
    state.mercuryPowerThrottle = 1.0;
  }

  state.totalEnergyMW = state.powerSupplyMW + state.lunarPowerSupplyMW + state.mercuryPowerSupplyMW + state.orbitalPowerMW + (state.dysonSwarmPowerMW ?? 0n);
}

export function buyGridPower(state: GameState, amountKW: number): boolean {
  // Keep grid contracts on whole-kW steps for predictable bulk tiering.
  state.gridPowerKW = toBigInt(Math.max(0, Math.floor(fromBigInt(state.gridPowerKW))));

  const amountKWB = toBigInt(amountKW);
  const limit = BALANCE.gridPowerKWLimit ?? 0;
  if (limit > 0 && state.gridPowerKW + amountKWB > toBigInt(limit)) return false;

  const cost = mulB(amountKWB, toBigInt(BALANCE.gridPowerKWCost));
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.gridPowerKW += amountKWB;
  return true;
}

export function sellGridPower(state: GameState, amountKW: number): boolean {
  state.gridPowerKW = toBigInt(Math.max(0, Math.floor(fromBigInt(state.gridPowerKW))));

  const amountKWB = toBigInt(amountKW);
  if (state.gridPowerKW < amountKWB) {
    state.gridPowerKW = 0n;
  } else {
    state.gridPowerKW -= amountKWB;
  }
  return true;
}

export function buyGasPlant(state: GameState, amount: number = 1): boolean {
  const amountB = toBigInt(amount);
  const limit = BALANCE.powerPlants.gas.limit ?? 0;
  if (limit > 0 && state.gasPlants + amountB > toBigInt(limit)) return false;

  const totalCost = mulB(amountB, BALANCE.powerPlants.gas.cost);
  const totalLabor = mulB(amountB, BALANCE.powerPlants.gas.laborCost);

  if (state.funds < totalCost) return false;
  if (getEarthLaborPool(state) < totalLabor) return false;

  state.funds -= totalCost;
  spendEarthLabor(state, totalLabor);
  state.gasPlants += amountB;
  return true;
}

export function buyNuclearPlant(state: GameState, amount: number = 1): boolean {
  const amountB = toBigInt(amount);
  const limit = BALANCE.powerPlants.nuclear.limit ?? 0;
  if (limit > 0 && state.nuclearPlants + amountB > toBigInt(limit)) return false;

  const totalCost = mulB(amountB, BALANCE.powerPlants.nuclear.cost);
  const totalLabor = mulB(amountB, BALANCE.powerPlants.nuclear.laborCost);

  if (state.funds < totalCost) return false;
  if (getEarthLaborPool(state) < totalLabor) return false;

  state.funds -= totalCost;
  spendEarthLabor(state, totalLabor);
  state.nuclearPlants += amountB;
  return true;
}

// Legacy APIs (unused in new flow but kept for compatibility)
export function buySolarFarm(state: GameState): boolean {
  if (state.funds < BALANCE.powerPlants.solar.cost) return false;
  if (getEarthLaborPool(state) < BALANCE.powerPlants.solar.laborCost) return false;

  state.funds -= BALANCE.powerPlants.solar.cost;
  spendEarthLabor(state, BALANCE.powerPlants.solar.laborCost);
  state.solarFarms += scaleBigInt(1n);
  return true;
}

export function buySolarPanel(state: GameState, amount: number): boolean {
  if (!state.locationResources?.earth) return false;
  const amountB = toBigInt(amount);
  const cost = mulB(amountB, BALANCE.solarPanelCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.locationResources.earth.solarPanels += amountB;
  state.solarPanels = state.locationResources.earth.solarPanels;
  return true;
}

