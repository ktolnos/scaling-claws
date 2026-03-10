import type { GameState, LocationId } from '../GameState.ts';
import { BALANCE, getSolarPanelPowerMW } from '../BalanceConfig.ts';
import { toBigInt, mulB, fromBigInt } from '../utils.ts';

function getEarthLaborPool(state: GameState): bigint {
  return state.locationResources.earth.labor;
}

function spendEarthLabor(state: GameState, amount: bigint): void {
  state.locationResources.earth.labor -= amount;
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
  supply += mulB(earthInstalledSolar, toBigInt(getSolarPanelPowerMW('earth', state.completedResearch)));
  state.powerSupplyMW = supply;

  if (state.powerDemandMW > 0n && state.powerSupplyMW < state.powerDemandMW) {
    state.powerThrottle = Number(state.powerSupplyMW) / Number(state.powerDemandMW);
  } else {
    state.powerThrottle = 1.0;
  }

  // Moon grid
  const moonInstalledGpus = state.locationResources.moon.installedGpus;
  const moonInstalledSolar = state.locationResources.moon.installedSolarPanels;

  state.lunarPowerDemandMW = mulB(moonInstalledGpus, toBigInt(BALANCE.gpuPowerMW));
  state.lunarPowerSupplyMW = mulB(moonInstalledSolar, toBigInt(getSolarPanelPowerMW('moon', state.completedResearch)));

  if (state.lunarPowerDemandMW > 0n && state.lunarPowerSupplyMW < state.lunarPowerDemandMW) {
    state.lunarPowerThrottle = Number(state.lunarPowerSupplyMW) / Number(state.lunarPowerDemandMW);
  } else {
    state.lunarPowerThrottle = 1.0;
  }

  const mercuryInstalledGpus = state.locationResources?.mercury?.installedGpus ?? 0n;
  const mercuryInstalledSolar = state.locationResources?.mercury?.installedSolarPanels ?? 0n;

  state.mercuryPowerDemandMW = mulB(mercuryInstalledGpus, toBigInt(BALANCE.gpuPowerMW));
  state.mercuryPowerSupplyMW = mulB(mercuryInstalledSolar, toBigInt(getSolarPanelPowerMW('mercury', state.completedResearch)));
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

export function buySolarFarm(state: GameState, location: LocationId, amount: number = 1): boolean {
  if (location !== 'earth' && location !== 'moon') return false;

  const amountB = toBigInt(amount);
  const amountUnits = BigInt(Math.floor(amount));
  if (amountB <= 0n) return false;
  const solarPanelsPerFarm = toBigInt(BALANCE.solarFarmPanelsPerFarm);
  const installedFarms = state.locationResources[location].installedSolarPanels / solarPanelsPerFarm;
  if (installedFarms + amountUnits > BigInt(BALANCE.solarFarmLimit)) return false;

  if (location === 'earth' && !state.completedResearch.includes('solarTechnology')) return false;
  if (location === 'moon' && !state.completedResearch.includes('payloadToMoon')) return false;

  const locationResources = state.locationResources[location];
  const panelCost = mulB(amountB, solarPanelsPerFarm);
  const laborCost = location === 'earth'
    ? mulB(amountB, BALANCE.earthSolarFarmLaborCost)
    : mulB(amountB, BALANCE.moonSolarFarmLaborCost);

  if (locationResources.solarPanels < panelCost) return false;
  if (locationResources.labor < laborCost) return false;

  locationResources.solarPanels -= panelCost;
  locationResources.labor -= laborCost;
  locationResources.installedSolarPanels += panelCost;
  return true;
}

export function buyMoonDatacenter(state: GameState, amount: number = 1): boolean {
  if (!state.completedResearch.includes('payloadToMoon')) return false;

  const amountB = toBigInt(amount);
  const amountUnits = BigInt(Math.floor(amount));
  if (amountB <= 0n) return false;

  const moon = state.locationResources.moon;
  const gpusPerBuild = toBigInt(BALANCE.moonGpuDatacenterGpusPerBuild);
  const builtCount = moon.installedGpus / gpusPerBuild;
  if (builtCount + amountUnits > BigInt(BALANCE.moonGpuDatacenterLimit)) return false;

  const gpuCost = mulB(amountB, gpusPerBuild);
  const laborCost = mulB(amountB, BALANCE.moonGpuDatacenterLaborCost);
  if (moon.gpus < gpuCost) return false;
  if (moon.labor < laborCost) return false;

  moon.gpus -= gpuCost;
  moon.labor -= laborCost;
  moon.installedGpus += gpuCost;
  return true;
}

