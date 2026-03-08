import type { GameState, FacilityId, LocationId, LocationRateState } from '../GameState.ts';
import { BALANCE, getFacilityProductionMultiplier } from '../BalanceConfig.ts';
import { toBigInt, mulB, divB, scaleBigInt, fromBigInt } from '../utils.ts';
import { reconcileEarthGpuInstallation } from './GpuState.ts';
import { getRobotLaborPerMin } from './JobRules.ts';

function toScaled(value: number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  return toBigInt(value);
}

function getFacilityOutputPerMin(
  state: GameState,
  facility: FacilityId,
  baseOutputPerMin: number | bigint,
): bigint {
  return mulB(
    toScaled(baseOutputPerMin),
    toBigInt(getFacilityProductionMultiplier(state.completedResearch, facility)),
  );
}

function resetLocationRates(state: GameState): void {
  const locations: LocationId[] = ['earth', 'moon', 'mercury'];
  for (const location of locations) {
    state.locationProductionPerMin[location] = {
      material: 0n,
      solarPanels: 0n,
      robots: 0n,
      gpus: 0n,
      rockets: 0n,
      gpuSatellites: 0n,
      labor: 0n,
    };
    state.locationConsumptionPerMin[location] = {
      material: 0n,
      solarPanels: 0n,
      robots: 0n,
      gpus: 0n,
      rockets: 0n,
      gpuSatellites: 0n,
      labor: 0n,
    };
  }
}

function ensureLocationState(state: GameState): void {
  if (!state.locationResources || !state.locationFacilities) {
    throw new Error('Location state is missing. Start from a fresh save.');
  }
}

export function isFacilityUnlocked(state: GameState, location: LocationId, facility: FacilityId): boolean {
  if (location === 'earth') {
    if (facility === 'materialMine') return true;
    if (facility === 'solarFactory') return state.completedResearch.includes('solarTechnology');
    if (facility === 'robotFactory') return state.completedResearch.includes('robotFactoryEngineering1');
    if (facility === 'gpuFactory') return state.completedResearch.includes('chipManufacturing');
    if (facility === 'rocketFactory') return state.completedResearch.includes('rocketry');
    if (facility === 'gpuSatelliteFactory') return state.completedResearch.includes('rocketry');
    return false;
  }

  if (location === 'moon') {
    if (!state.completedResearch.includes('payloadToMoon')) return false;
    if (facility === 'materialMine') return state.completedResearch.includes('moonMineEngineering');
    if (facility === 'solarFactory') return state.completedResearch.includes('moonSolarManufacturing');
    if (facility === 'gpuFactory') return state.completedResearch.includes('moonChipManufacturing');
    if (facility === 'gpuSatelliteFactory') return state.completedResearch.includes('moonRocketry');
    if (facility === 'rocketFactory') return state.completedResearch.includes('moonRocketry');
    if (facility === 'massDriver') return state.completedResearch.includes('moonMassDrivers');
    if (facility === 'robotFactory') return state.completedResearch.includes('moonRobotics');
    return false;
  }

  if (!state.completedResearch.includes('payloadToMercury')) return false;
  if (facility === 'robotFactory') return state.completedResearch.includes('mercuryRobotics');
  return true;
}

type RateResourceId = keyof LocationRateState;
type FactoryInput = { resource: RateResourceId; reqPerFactoryPerMin: bigint };

interface FacilityOperation {
  facility: FacilityId;
  outputResource: RateResourceId;
  outputPerFactoryPerMin: bigint;
  inputA?: FactoryInput;
  inputB?: FactoryInput;
}

interface PlannedOperation extends FacilityOperation {
  count: bigint;
  maxOutputPerMin: bigint;
  potentialOutput: bigint;
  consumeA: bigint;
  consumeB: bigint;
  capEffScaled: bigint;
}

const UNIT_SCALED = scaleBigInt(1n);

function clampUnitScaled(ratio: bigint): bigint {
  if (ratio < 0n) return 0n;
  if (ratio > UNIT_SCALED) return UNIT_SCALED;
  return ratio;
}

function getOutputStockpileCap(location: LocationId, resource: RateResourceId): bigint | null {
  if (resource === 'rockets' || resource === 'gpus' || resource === 'solarPanels' || resource === 'robots') {
    return BALANCE.locationResourceStockpileCap;
  }
  if (location === 'mercury' && resource === 'material') return BALANCE.mercuryMaterialStockpileCap;
  return null;
}

function decayFacilityRate(state: GameState, location: LocationId, facility: FacilityId): void {
  state.locationFacilityRates[location][facility] *= 0.95;
}

function planOperation(
  state: GameState,
  location: LocationId,
  op: FacilityOperation,
  dtMs: number,
): PlannedOperation | null {
  const count = state.locationFacilities[location][op.facility];
  if (count <= 0n || dtMs <= 0) return null;

  const resources = state.locationResources[location];
  const maxOutputPerMin = mulB(count, op.outputPerFactoryPerMin);
  const potentialOutput = (maxOutputPerMin * BigInt(dtMs)) / 60000n;

  if (potentialOutput <= 0n) {
    return {
      ...op,
      count,
      maxOutputPerMin,
      potentialOutput,
      consumeA: 0n,
      consumeB: 0n,
      capEffScaled: 0n,
    };
  }

  let capEffScaled = UNIT_SCALED;
  const cap = getOutputStockpileCap(location, op.outputResource);
  if (cap !== null) {
    const current = resources[op.outputResource];
    if (current >= cap) {
      capEffScaled = 0n;
    } else {
      const room = cap - current;
      capEffScaled = clampUnitScaled(divB(room, potentialOutput));
    }
  }

  const consumeA = op.inputA ? ((mulB(count, op.inputA.reqPerFactoryPerMin) * BigInt(dtMs)) / 60000n) : 0n;
  const consumeB = op.inputB ? ((mulB(count, op.inputB.reqPerFactoryPerMin) * BigInt(dtMs)) / 60000n) : 0n;

  return {
    ...op,
    count,
    maxOutputPerMin,
    potentialOutput,
    consumeA,
    consumeB,
    capEffScaled,
  };
}

function applyPlannedOperation(
  state: GameState,
  location: LocationId,
  op: PlannedOperation,
  resourceEff: Partial<Record<RateResourceId, bigint>>,
): void {
  let effScaled = op.capEffScaled;
  if (op.inputA && op.consumeA > 0n) {
    const ratio = resourceEff[op.inputA.resource] ?? UNIT_SCALED;
    if (ratio < effScaled) effScaled = ratio;
  }
  if (op.inputB && op.consumeB > 0n) {
    const ratio = resourceEff[op.inputB.resource] ?? UNIT_SCALED;
    if (ratio < effScaled) effScaled = ratio;
  }
  effScaled = clampUnitScaled(effScaled);

  const resources = state.locationResources[location];
  const actualOutput = mulB(op.potentialOutput, effScaled);
  resources[op.outputResource] += actualOutput;

  const effectivePerMin = mulB(op.maxOutputPerMin, effScaled);
  state.locationProductionPerMin[location][op.outputResource] += effectivePerMin;

  if (op.inputA && op.consumeA > 0n) {
    const inputPerMin = mulB(op.count, op.inputA.reqPerFactoryPerMin);
    const actualInput = mulB(op.consumeA, effScaled);
    resources[op.inputA.resource] -= actualInput;
    state.locationConsumptionPerMin[location][op.inputA.resource] += mulB(inputPerMin, effScaled);
  }

  if (op.inputB && op.consumeB > 0n) {
    const inputPerMin = mulB(op.count, op.inputB.reqPerFactoryPerMin);
    const actualInput = mulB(op.consumeB, effScaled);
    resources[op.inputB.resource] -= actualInput;
    state.locationConsumptionPerMin[location][op.inputB.resource] += mulB(inputPerMin, effScaled);
  }

  const eff = Number(effScaled) / Number(UNIT_SCALED);
  state.locationFacilityRates[location][op.facility] = (state.locationFacilityRates[location][op.facility] * 0.95) + (eff * 0.05);
}

function runOperationsProportionally(
  state: GameState,
  location: LocationId,
  ops: FacilityOperation[],
  dtMs: number,
): void {
  const planned: PlannedOperation[] = [];
  for (const op of ops) {
    const p = planOperation(state, location, op, dtMs);
    if (!p) {
      decayFacilityRate(state, location, op.facility);
      continue;
    }
    planned.push(p);
  }
  if (planned.length === 0) return;

  const totalDemand: Partial<Record<RateResourceId, bigint>> = {};
  for (const p of planned) {
    if (p.inputA && p.consumeA > 0n) {
      const demand = mulB(p.consumeA, p.capEffScaled);
      totalDemand[p.inputA.resource] = (totalDemand[p.inputA.resource] ?? 0n) + demand;
    }
    if (p.inputB && p.consumeB > 0n) {
      const demand = mulB(p.consumeB, p.capEffScaled);
      totalDemand[p.inputB.resource] = (totalDemand[p.inputB.resource] ?? 0n) + demand;
    }
  }

  const resourceEff: Partial<Record<RateResourceId, bigint>> = {};
  const resourceKeys = Object.keys(totalDemand) as RateResourceId[];
  for (const resource of resourceKeys) {
    const demand = totalDemand[resource] ?? 0n;
    if (demand <= 0n) continue;
    const available = state.locationResources[location][resource];
    resourceEff[resource] = clampUnitScaled(divB(available, demand));
  }

  for (const p of planned) {
    applyPlannedOperation(state, location, p, resourceEff);
  }
}

export function tickSupply(state: GameState, dtMs: number): void {
  ensureLocationState(state);
  resetLocationRates(state);

  // Robot labor generation at each location
  const robotLaborPerMin = getRobotLaborPerMin(state);
  const locations: LocationId[] = ['earth', 'moon', 'mercury'];
  for (const location of locations) {
    const robots = state.locationResources[location].robots;
    const perMin = mulB(robots, robotLaborPerMin);
    const produced = (perMin * BigInt(dtMs)) / 60000n;
    if (produced > 0n) {
      state.locationResources[location].labor += produced;
      state.locationProductionPerMin[location].labor += perMin;
      if (location === 'earth') {
        state.resourceBreakdown.labor.income.push({ label: 'Earth Robots', ratePerMin: perMin });
      } else if (location === 'moon') {
        state.resourceBreakdown.labor.income.push({ label: 'Moon Robots', ratePerMin: perMin });
      } else {
        state.resourceBreakdown.labor.income.push({ label: 'Mercury Robots', ratePerMin: perMin });
      }
    }
  }

  // Facility simulation by location
  for (const location of locations) {
    const mineOps: FacilityOperation[] = [];
    if (isFacilityUnlocked(state, location, 'materialMine') && !state.pausedFacilities.materialMine) {
      mineOps.push({
        facility: 'materialMine',
        outputResource: 'material',
        outputPerFactoryPerMin: getFacilityOutputPerMin(state, 'materialMine', BALANCE.materialMineOutput),
        inputA: { resource: 'labor', reqPerFactoryPerMin: BALANCE.materialMineLaborReq },
      });
    } else if (state.pausedFacilities.materialMine) {
      decayFacilityRate(state, location, 'materialMine');
    }
    runOperationsProportionally(state, location, mineOps, dtMs);

    const factoryOps: FacilityOperation[] = [];
    if (isFacilityUnlocked(state, location, 'solarFactory') && !state.pausedFacilities.solarFactory) {
      factoryOps.push({
        facility: 'solarFactory',
        outputResource: 'solarPanels',
        outputPerFactoryPerMin: getFacilityOutputPerMin(state, 'solarFactory', BALANCE.solarFactoryOutput),
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.solarFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.solarFactoryLaborCost },
      });
    } else if (state.pausedFacilities.solarFactory) {
      decayFacilityRate(state, location, 'solarFactory');
    }
    if (isFacilityUnlocked(state, location, 'robotFactory') && !state.pausedFacilities.robotFactory) {
      factoryOps.push({
        facility: 'robotFactory',
        outputResource: 'robots',
        outputPerFactoryPerMin: getFacilityOutputPerMin(state, 'robotFactory', BALANCE.robotFactoryOutput),
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.robotFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.robotFactoryLaborCost },
      });
    } else if (state.pausedFacilities.robotFactory) {
      decayFacilityRate(state, location, 'robotFactory');
    }
    if (isFacilityUnlocked(state, location, 'gpuFactory') && !state.pausedFacilities.gpuFactory) {
      factoryOps.push({
        facility: 'gpuFactory',
        outputResource: 'gpus',
        outputPerFactoryPerMin: getFacilityOutputPerMin(state, 'gpuFactory', BALANCE.gpuFactoryOutput),
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.gpuFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.gpuFactoryLaborCost },
      });
    } else if (state.pausedFacilities.gpuFactory) {
      decayFacilityRate(state, location, 'gpuFactory');
    }
    if (isFacilityUnlocked(state, location, 'rocketFactory') && !state.pausedFacilities.rocketFactory) {
      factoryOps.push({
        facility: 'rocketFactory',
        outputResource: 'rockets',
        outputPerFactoryPerMin: getFacilityOutputPerMin(state, 'rocketFactory', BALANCE.rocketFactoryOutput),
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.rocketFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.rocketFactoryLaborCost },
      });
    } else if (state.pausedFacilities.rocketFactory) {
      decayFacilityRate(state, location, 'rocketFactory');
    }
    if (isFacilityUnlocked(state, location, 'gpuSatelliteFactory') && !state.pausedFacilities.gpuSatelliteFactory) {
      factoryOps.push({
        facility: 'gpuSatelliteFactory',
        outputResource: 'gpuSatellites',
        outputPerFactoryPerMin: getFacilityOutputPerMin(state, 'gpuSatelliteFactory', BALANCE.gpuSatelliteFactoryOutput),
        inputA: { resource: 'solarPanels', reqPerFactoryPerMin: BALANCE.gpuSatelliteFactorySolarPanelReq },
        inputB: { resource: 'gpus', reqPerFactoryPerMin: BALANCE.gpuSatelliteFactoryGpuReq },
      });
    } else if (state.pausedFacilities.gpuSatelliteFactory) {
      decayFacilityRate(state, location, 'gpuSatelliteFactory');
    }
    runOperationsProportionally(state, location, factoryOps, dtMs);

    // Mass driver just has an operational rate used by logistics.
    const md = state.locationFacilities[location].massDriver;
    if (state.pausedFacilities.massDriver) {
      state.locationFacilityRates[location].massDriver *= 0.95;
    } else if (md > 0n) {
      state.locationFacilityRates[location].massDriver = (state.locationFacilityRates[location].massDriver * 0.95) + 0.05;
    } else {
      state.locationFacilityRates[location].massDriver *= 0.95;
    }
  }

  reconcileEarthGpuInstallation(state);
}

function getEarthLimit(type: FacilityId): number {
  if (type === 'materialMine') return BALANCE.materialMineLimit;
  if (type === 'solarFactory') return BALANCE.solarFactoryLimit;
  if (type === 'robotFactory') return BALANCE.robotFactoryLimit;
  if (type === 'gpuFactory') return BALANCE.gpuFactoryLimit;
  if (type === 'rocketFactory') return BALANCE.rocketFactoryLimit;
  if (type === 'gpuSatelliteFactory') return BALANCE.gpuSatelliteFactoryLimit;
  return 0;
}

function getMercuryMassDriverLimit(): number {
  const rocketsCap = fromBigInt(BALANCE.locationResourceStockpileCap);
  const launchesPerMin = Math.max(1, BALANCE.massDriverLaunchesPerMin);
  return Math.max(1, Math.ceil(rocketsCap / launchesPerMin));
}

function getMoonFacilityLimit(type: FacilityId): number {
  if (type === 'massDriver') return BALANCE.moonMassDriverLimit;
  const earthLimit = getEarthLimit(type);
  if (earthLimit <= 0) return 0;
  const multiplier = (BALANCE.moonFacilityLimits as Record<string, number>)[type] ?? 0;
  return Math.floor(earthLimit * multiplier);
}

function getMercuryFacilityLimit(type: FacilityId): number | null {
  if (type === 'massDriver') return getMercuryMassDriverLimit();
  const earthLimit = getEarthLimit(type);
  if (earthLimit <= 0) return 0;
  const multiplier = (BALANCE.mercuryFacilityLimits as Record<string, number>)[type] ?? 0;
  return Math.floor(earthLimit * multiplier);
}

function getFacilityLimitByLocation(location: LocationId, type: FacilityId): number | null {
  if (location === 'earth') return getEarthLimit(type);
  if (location === 'moon') return getMoonFacilityLimit(type);
  return getMercuryFacilityLimit(type);
}

function getFacilityBaseCost(type: FacilityId): { material: bigint; labor: bigint } {
  if (type === 'materialMine') return { material: BALANCE.materialMineBuildMaterialCost, labor: BALANCE.materialMineBuildLaborCost };
  if (type === 'solarFactory') return { material: BALANCE.solarFactoryBuildMaterialCost, labor: 0n };
  if (type === 'robotFactory') return { material: BALANCE.robotFactoryBuildMaterialCost, labor: 0n };
  if (type === 'gpuFactory') return { material: BALANCE.gpuFactoryBuildMaterialCost, labor: 0n };
  if (type === 'rocketFactory') return { material: BALANCE.rocketFactoryBuildMaterialCost, labor: 0n };
  if (type === 'gpuSatelliteFactory') return { material: BALANCE.gpuSatelliteFactoryBuildMaterialCost, labor: 0n };
  // Mass driver uses rocket factory-scale economics
  return { material: BALANCE.rocketFactoryBuildMaterialCost, labor: 0n };
}

export function canBuildFacility(state: GameState, location: LocationId, type: FacilityId, amount: number): boolean {
  ensureLocationState(state);
  if (!isFacilityUnlocked(state, location, type)) return false;

  const amountB = toBigInt(amount);
  const current = state.locationFacilities[location][type];
  const limit = getFacilityLimitByLocation(location, type);
  if (limit !== null && limit > 0 && current + amountB > toBigInt(limit)) return false;

  const base = getFacilityBaseCost(type);
  let materialEach = base.material;
  let laborEach = base.labor;

  if (location === 'moon') {
    materialEach = mulB(base.material, toBigInt(BALANCE.moonFacilityCostMultiplier));
    laborEach = mulB(base.labor, toBigInt(BALANCE.moonFacilityLaborMultiplier));
  } else if (location === 'mercury') {
    materialEach = mulB(base.material, toBigInt(BALANCE.mercuryFacilityCostMultiplier));
    laborEach = mulB(base.labor, toBigInt(BALANCE.mercuryFacilityLaborMultiplier));
  }

  const totalMaterial = mulB(toBigInt(amount), materialEach);
  const totalLabor = mulB(toBigInt(amount), laborEach);

  const materialPool = state.locationResources[location].material;
  const laborPool = state.locationResources[location].labor;
  if (materialPool < totalMaterial) return false;
  if (laborPool < totalLabor) return false;

  return true;
}

export function buildFacility(
  state: GameState,
  location: LocationId,
  type: FacilityId,
  amount: number,
): boolean {
  if (!canBuildFacility(state, location, type, amount)) return false;

  const base = getFacilityBaseCost(type);
  let materialEach = base.material;
  let laborEach = base.labor;

  if (location === 'moon') {
    materialEach = mulB(base.material, toBigInt(BALANCE.moonFacilityCostMultiplier));
    laborEach = mulB(base.labor, toBigInt(BALANCE.moonFacilityLaborMultiplier));
  } else if (location === 'mercury') {
    materialEach = mulB(base.material, toBigInt(BALANCE.mercuryFacilityCostMultiplier));
    laborEach = mulB(base.labor, toBigInt(BALANCE.mercuryFacilityLaborMultiplier));
  }

  const totalMaterial = mulB(toBigInt(amount), materialEach);
  const totalLabor = mulB(toBigInt(amount), laborEach);

  state.locationResources[location].material -= totalMaterial;
  state.locationResources[location].labor -= totalLabor;
  state.locationFacilities[location][type] += toBigInt(amount);

  reconcileEarthGpuInstallation(state);
  return true;
}
