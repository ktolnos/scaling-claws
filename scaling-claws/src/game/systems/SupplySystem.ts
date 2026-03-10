import type { FacilityProductionId } from '../BalanceConfig.ts';
import { BALANCE, getFacilityProductionMultiplier } from '../BalanceConfig.ts';
import type { FacilityId, GameState, LocationId, LocationRateState } from '../GameState.ts';
import { divB, mulB, scaleBigInt, toBigInt } from '../utils.ts';
import { reconcileEarthGpuInstallation } from './GpuState.ts';
import { getRobotLaborPerMin } from './JobRules.ts';

type RateResourceId = keyof LocationRateState;
type FactoryInput = { resource: RateResourceId; reqPerFactoryPerMin: bigint };

interface FacilityOperation {
  facility: FacilityId;
  productionId: FacilityProductionId;
  outputResource: RateResourceId;
  outputPerFactoryPerMin: number | bigint;
  inputA?: FactoryInput;
  inputB?: FactoryInput;
}

interface PlannedOperation {
  facility: FacilityId;
  outputResource: RateResourceId;
  count: bigint;
  maxOutputPerMin: bigint;
  potentialOutput: bigint;
  consumeA: bigint;
  consumeB: bigint;
  capEffScaled: bigint;
  inputA?: FactoryInput;
  inputB?: FactoryInput;
}

const UNIT_SCALED = scaleBigInt(1n);

function toScaled(value: number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  return toBigInt(value);
}

function clampUnitScaled(ratio: bigint): bigint {
  if (ratio < 0n) return 0n;
  if (ratio > UNIT_SCALED) return UNIT_SCALED;
  return ratio;
}

function getFacilityLocation(facility: FacilityId): LocationId {
  if (facility.startsWith('earth')) return 'earth';
  if (facility.startsWith('moon')) return 'moon';
  return 'mercury';
}

function getFacilityOutputPerMin(
  state: GameState,
  productionId: FacilityProductionId,
  baseOutputPerMin: number | bigint,
): bigint {
  return mulB(
    toScaled(baseOutputPerMin),
    toBigInt(getFacilityProductionMultiplier(state.completedResearch, productionId)),
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
  if (getFacilityLocation(facility) !== location) return false;

  if (location === 'earth') {
    if (facility === 'earthMaterialMine') return true;
    if (facility === 'earthSolarFactory') return state.completedResearch.includes('solarTechnology');
    if (facility === 'earthRobotFactory') return state.completedResearch.includes('robotFactoryEngineering1');
    if (facility === 'earthGpuFactory') return state.completedResearch.includes('chipManufacturing');
    if (facility === 'earthRocketFactory') return state.completedResearch.includes('rocketry');
    if (facility === 'earthGpuSatelliteFactory') return state.completedResearch.includes('rocketry');
    return false;
  }

  if (location === 'moon') {
    if (!state.completedResearch.includes('payloadToMoon')) return false;
    if (facility === 'moonMaterialMine') return state.completedResearch.includes('moonMineEngineering');
    if (facility === 'moonSolarFactory') return state.completedResearch.includes('moonMineEngineering');
    if (facility === 'moonRobotFactory') return state.completedResearch.includes('moonRobotics');
    if (facility === 'moonGpuFactory') return state.completedResearch.includes('moonChipManufacturing');
    if (facility === 'moonGpuSatelliteFactory') return state.completedResearch.includes('moonMassDrivers');
    if (facility === 'moonMassDriver') return state.completedResearch.includes('moonMassDrivers');
    return false;
  }

  if (!state.completedResearch.includes('payloadToMercury')) return false;
  if (facility === 'mercuryMaterialMine') return true;
  if (facility === 'mercuryRobotFactory') return state.completedResearch.includes('mercuryRobotics');
  if (facility === 'mercuryDysonSwarmFacility') return true;
  return false;
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
  const perFactoryOutput = getFacilityOutputPerMin(state, op.productionId, op.outputPerFactoryPerMin);
  const maxOutputPerMin = mulB(count, perFactoryOutput);
  const potentialOutput = (maxOutputPerMin * BigInt(dtMs)) / 60000n;

  if (potentialOutput <= 0n) {
    return {
      facility: op.facility,
      outputResource: op.outputResource,
      count,
      maxOutputPerMin,
      potentialOutput,
      consumeA: 0n,
      consumeB: 0n,
      capEffScaled: 0n,
      inputA: op.inputA,
      inputB: op.inputB,
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
    facility: op.facility,
    outputResource: op.outputResource,
    count,
    maxOutputPerMin,
    potentialOutput,
    consumeA,
    consumeB,
    capEffScaled,
    inputA: op.inputA,
    inputB: op.inputB,
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

function buildOperationsForLocation(state: GameState, location: LocationId): FacilityOperation[] {
  const ops: FacilityOperation[] = [];

  if (location === 'earth') {
    if (isFacilityUnlocked(state, location, 'earthMaterialMine') && !state.pausedFacilities.earthMaterialMine) {
      ops.push({
        facility: 'earthMaterialMine',
        productionId: 'materialMine',
        outputResource: 'material',
        outputPerFactoryPerMin: BALANCE.materialMineOutput,
        inputA: { resource: 'labor', reqPerFactoryPerMin: BALANCE.materialMineLaborReq },
      });
    } else if (state.pausedFacilities.earthMaterialMine) {
      decayFacilityRate(state, location, 'earthMaterialMine');
    }

    if (isFacilityUnlocked(state, location, 'earthSolarFactory') && !state.pausedFacilities.earthSolarFactory) {
      ops.push({
        facility: 'earthSolarFactory',
        productionId: 'solarFactory',
        outputResource: 'solarPanels',
        outputPerFactoryPerMin: BALANCE.solarFactoryOutput,
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.solarFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.solarFactoryLaborCost },
      });
    } else if (state.pausedFacilities.earthSolarFactory) {
      decayFacilityRate(state, location, 'earthSolarFactory');
    }

    if (isFacilityUnlocked(state, location, 'earthRobotFactory') && !state.pausedFacilities.earthRobotFactory) {
      ops.push({
        facility: 'earthRobotFactory',
        productionId: 'robotFactory',
        outputResource: 'robots',
        outputPerFactoryPerMin: BALANCE.robotFactoryOutput,
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.robotFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.robotFactoryLaborCost },
      });
    } else if (state.pausedFacilities.earthRobotFactory) {
      decayFacilityRate(state, location, 'earthRobotFactory');
    }

    if (isFacilityUnlocked(state, location, 'earthGpuFactory') && !state.pausedFacilities.earthGpuFactory) {
      ops.push({
        facility: 'earthGpuFactory',
        productionId: 'gpuFactory',
        outputResource: 'gpus',
        outputPerFactoryPerMin: BALANCE.gpuFactoryOutput,
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.gpuFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.gpuFactoryLaborCost },
      });
    } else if (state.pausedFacilities.earthGpuFactory) {
      decayFacilityRate(state, location, 'earthGpuFactory');
    }

    if (isFacilityUnlocked(state, location, 'earthRocketFactory') && !state.pausedFacilities.earthRocketFactory) {
      ops.push({
        facility: 'earthRocketFactory',
        productionId: 'rocketFactory',
        outputResource: 'rockets',
        outputPerFactoryPerMin: BALANCE.rocketFactoryOutput,
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.rocketFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.rocketFactoryLaborCost },
      });
    } else if (state.pausedFacilities.earthRocketFactory) {
      decayFacilityRate(state, location, 'earthRocketFactory');
    }

    if (isFacilityUnlocked(state, location, 'earthGpuSatelliteFactory') && !state.pausedFacilities.earthGpuSatelliteFactory) {
      ops.push({
        facility: 'earthGpuSatelliteFactory',
        productionId: 'gpuSatelliteFactory',
        outputResource: 'gpuSatellites',
        outputPerFactoryPerMin: BALANCE.gpuSatelliteFactoryOutput,
        inputA: { resource: 'solarPanels', reqPerFactoryPerMin: BALANCE.gpuSatelliteFactorySolarPanelReq },
        inputB: { resource: 'gpus', reqPerFactoryPerMin: BALANCE.gpuSatelliteFactoryGpuReq },
      });
    } else if (state.pausedFacilities.earthGpuSatelliteFactory) {
      decayFacilityRate(state, location, 'earthGpuSatelliteFactory');
    }
    return ops;
  }

  if (location === 'moon') {
    if (isFacilityUnlocked(state, location, 'moonMaterialMine') && !state.pausedFacilities.moonMaterialMine) {
      ops.push({
        facility: 'moonMaterialMine',
        productionId: 'materialMine',
        outputResource: 'material',
        outputPerFactoryPerMin: BALANCE.materialMineOutput,
        inputA: { resource: 'labor', reqPerFactoryPerMin: BALANCE.materialMineLaborReq },
      });
    } else if (state.pausedFacilities.moonMaterialMine) {
      decayFacilityRate(state, location, 'moonMaterialMine');
    }

    if (isFacilityUnlocked(state, location, 'moonSolarFactory') && !state.pausedFacilities.moonSolarFactory) {
      ops.push({
        facility: 'moonSolarFactory',
        productionId: 'solarFactory',
        outputResource: 'solarPanels',
        outputPerFactoryPerMin: BALANCE.solarFactoryOutput,
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.solarFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.solarFactoryLaborCost },
      });
    } else if (state.pausedFacilities.moonSolarFactory) {
      decayFacilityRate(state, location, 'moonSolarFactory');
    }

    if (isFacilityUnlocked(state, location, 'moonRobotFactory') && !state.pausedFacilities.moonRobotFactory) {
      ops.push({
        facility: 'moonRobotFactory',
        productionId: 'robotFactory',
        outputResource: 'robots',
        outputPerFactoryPerMin: BALANCE.robotFactoryOutput,
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.robotFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.robotFactoryLaborCost },
      });
    } else if (state.pausedFacilities.moonRobotFactory) {
      decayFacilityRate(state, location, 'moonRobotFactory');
    }

    if (isFacilityUnlocked(state, location, 'moonGpuFactory') && !state.pausedFacilities.moonGpuFactory) {
      ops.push({
        facility: 'moonGpuFactory',
        productionId: 'gpuFactory',
        outputResource: 'gpus',
        outputPerFactoryPerMin: BALANCE.gpuFactoryOutput,
        inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.gpuFactoryMaterialReq },
        inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.gpuFactoryLaborCost },
      });
    } else if (state.pausedFacilities.moonGpuFactory) {
      decayFacilityRate(state, location, 'moonGpuFactory');
    }

    if (isFacilityUnlocked(state, location, 'moonGpuSatelliteFactory') && !state.pausedFacilities.moonGpuSatelliteFactory) {
      ops.push({
        facility: 'moonGpuSatelliteFactory',
        productionId: 'gpuSatelliteFactory',
        outputResource: 'gpuSatellites',
        outputPerFactoryPerMin: BALANCE.gpuSatelliteFactoryOutput,
        inputA: { resource: 'solarPanels', reqPerFactoryPerMin: BALANCE.gpuSatelliteFactorySolarPanelReq },
        inputB: { resource: 'gpus', reqPerFactoryPerMin: BALANCE.gpuSatelliteFactoryGpuReq },
      });
    } else if (state.pausedFacilities.moonGpuSatelliteFactory) {
      decayFacilityRate(state, location, 'moonGpuSatelliteFactory');
    }

    if (state.pausedFacilities.moonMassDriver) {
      decayFacilityRate(state, location, 'moonMassDriver');
    } else if (state.locationFacilities.moon.moonMassDriver > 0n) {
      state.locationFacilityRates.moon.moonMassDriver = (state.locationFacilityRates.moon.moonMassDriver * 0.95) + 0.05;
    } else {
      decayFacilityRate(state, location, 'moonMassDriver');
    }
    return ops;
  }

  if (isFacilityUnlocked(state, location, 'mercuryMaterialMine') && !state.pausedFacilities.mercuryMaterialMine) {
    ops.push({
      facility: 'mercuryMaterialMine',
      productionId: 'materialMine',
      outputResource: 'material',
      outputPerFactoryPerMin: BALANCE.materialMineOutput,
      inputA: { resource: 'labor', reqPerFactoryPerMin: BALANCE.materialMineLaborReq },
    });
  } else if (state.pausedFacilities.mercuryMaterialMine) {
    decayFacilityRate(state, location, 'mercuryMaterialMine');
  }

  if (isFacilityUnlocked(state, location, 'mercuryRobotFactory') && !state.pausedFacilities.mercuryRobotFactory) {
    ops.push({
      facility: 'mercuryRobotFactory',
      productionId: 'robotFactory',
      outputResource: 'robots',
      outputPerFactoryPerMin: BALANCE.robotFactoryOutput,
      inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.robotFactoryMaterialReq },
      inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.robotFactoryLaborCost },
    });
  } else if (state.pausedFacilities.mercuryRobotFactory) {
    decayFacilityRate(state, location, 'mercuryRobotFactory');
  }

  if (isFacilityUnlocked(state, location, 'mercuryDysonSwarmFacility') && !state.pausedFacilities.mercuryDysonSwarmFacility) {
    ops.push({
      facility: 'mercuryDysonSwarmFacility',
      productionId: 'dysonSwarmFacility',
      outputResource: 'gpuSatellites',
      outputPerFactoryPerMin: BALANCE.dysonSwarmFacilityOutput,
      inputA: { resource: 'material', reqPerFactoryPerMin: BALANCE.dysonSwarmFacilityMaterialReq },
      inputB: { resource: 'labor', reqPerFactoryPerMin: BALANCE.dysonSwarmFacilityLaborReq },
    });
  } else if (state.pausedFacilities.mercuryDysonSwarmFacility) {
    decayFacilityRate(state, location, 'mercuryDysonSwarmFacility');
  }

  return ops;
}

export function tickSupply(state: GameState, dtMs: number): void {
  ensureLocationState(state);
  resetLocationRates(state);

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

  for (const location of locations) {
    runOperationsProportionally(state, location, buildOperationsForLocation(state, location), dtMs);
  }

  reconcileEarthGpuInstallation(state);
}

function getEarthLimit(type: FacilityId): number {
  if (type === 'earthMaterialMine') return BALANCE.materialMineLimit;
  if (type === 'earthSolarFactory') return BALANCE.solarFactoryLimit;
  if (type === 'earthRobotFactory') return BALANCE.robotFactoryLimit;
  if (type === 'earthGpuFactory') return BALANCE.gpuFactoryLimit;
  if (type === 'earthRocketFactory') return BALANCE.rocketFactoryLimit;
  if (type === 'earthGpuSatelliteFactory') return BALANCE.gpuSatelliteFactoryLimit;
  return 0;
}

function getMoonBaseLimit(type: FacilityId): number {
  if (type === 'moonMaterialMine') return BALANCE.materialMineLimit;
  if (type === 'moonSolarFactory') return BALANCE.solarFactoryLimit;
  if (type === 'moonRobotFactory') return BALANCE.robotFactoryLimit;
  if (type === 'moonGpuFactory') return BALANCE.gpuFactoryLimit;
  if (type === 'moonGpuSatelliteFactory') return BALANCE.gpuSatelliteFactoryLimit;
  return 0;
}

function getMercuryBaseLimit(type: FacilityId): number {
  if (type === 'mercuryMaterialMine') return BALANCE.materialMineLimit;
  if (type === 'mercuryRobotFactory') return BALANCE.robotFactoryLimit;
  if (type === 'mercuryDysonSwarmFacility') return BALANCE.dysonSwarmFacilityLimit;
  return 0;
}

function getFacilityLimitByLocation(location: LocationId, type: FacilityId): number | null {
  if (location === 'earth') return getEarthLimit(type);
  if (location === 'moon') {
    if (type === 'moonMassDriver') return BALANCE.moonMassDriverLimit;
    const baseLimit = getMoonBaseLimit(type);
    if (baseLimit <= 0) return 0;
    const multipliers = BALANCE.moonFacilityLimits as Record<string, number>;
    const multiplier = multipliers[type] ?? 0;
    return Math.floor(baseLimit * multiplier);
  }

  const baseLimit = getMercuryBaseLimit(type);
  if (baseLimit <= 0) return 0;
  const multipliers = BALANCE.mercuryFacilityLimits as Record<string, number>;
  const multiplier = multipliers[type] ?? 0;
  return Math.floor(baseLimit * multiplier);
}

function getFacilityBaseCost(type: FacilityId): { material: bigint; labor: bigint } {
  if (type === 'earthMaterialMine' || type === 'moonMaterialMine' || type === 'mercuryMaterialMine') {
    return { material: BALANCE.materialMineBuildMaterialCost, labor: BALANCE.materialMineBuildLaborCost };
  }
  if (type === 'earthSolarFactory' || type === 'moonSolarFactory') {
    return { material: BALANCE.solarFactoryBuildMaterialCost, labor: 0n };
  }
  if (type === 'earthRobotFactory' || type === 'moonRobotFactory' || type === 'mercuryRobotFactory') {
    return { material: BALANCE.robotFactoryBuildMaterialCost, labor: 0n };
  }
  if (type === 'earthGpuFactory' || type === 'moonGpuFactory') {
    return { material: BALANCE.gpuFactoryBuildMaterialCost, labor: 0n };
  }
  if (type === 'earthRocketFactory') {
    return { material: BALANCE.rocketFactoryBuildMaterialCost, labor: 0n };
  }
  if (type === 'earthGpuSatelliteFactory' || type === 'moonGpuSatelliteFactory') {
    return { material: BALANCE.gpuSatelliteFactoryBuildMaterialCost, labor: 0n };
  }
  if (type === 'mercuryDysonSwarmFacility') {
    return { material: BALANCE.dysonSwarmFacilityBuildMaterialCost, labor: 0n };
  }
  // Mass driver uses rocket-factory scale capex.
  return { material: BALANCE.rocketFactoryBuildMaterialCost, labor: 0n };
}

function getLocationCostMultipliers(location: LocationId): { material: bigint; labor: bigint } {
  if (location === 'moon') {
    return {
      material: toBigInt(BALANCE.moonFacilityCostMultiplier),
      labor: toBigInt(BALANCE.moonFacilityLaborMultiplier),
    };
  }
  if (location === 'mercury') {
    return {
      material: toBigInt(BALANCE.mercuryFacilityCostMultiplier),
      labor: toBigInt(BALANCE.mercuryFacilityLaborMultiplier),
    };
  }
  return { material: toBigInt(1), labor: toBigInt(1) };
}

export function canBuildFacility(state: GameState, location: LocationId, type: FacilityId, amount: number): boolean {
  ensureLocationState(state);
  if (getFacilityLocation(type) !== location) return false;
  if (!isFacilityUnlocked(state, location, type)) return false;

  const amountB = toBigInt(amount);
  const current = state.locationFacilities[location][type];
  const limit = getFacilityLimitByLocation(location, type);
  if (limit !== null && limit > 0 && current + amountB > toBigInt(limit)) return false;

  const base = getFacilityBaseCost(type);
  const multipliers = getLocationCostMultipliers(location);
  const materialEach = mulB(base.material, multipliers.material);
  const laborEach = mulB(base.labor, multipliers.labor);
  const totalMaterial = mulB(toBigInt(amount), materialEach);
  const totalLabor = mulB(toBigInt(amount), laborEach);

  if (state.locationResources[location].material < totalMaterial) return false;
  if (state.locationResources[location].labor < totalLabor) return false;
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
  const multipliers = getLocationCostMultipliers(location);
  const materialEach = mulB(base.material, multipliers.material);
  const laborEach = mulB(base.labor, multipliers.labor);
  const totalMaterial = mulB(toBigInt(amount), materialEach);
  const totalLabor = mulB(toBigInt(amount), laborEach);

  state.locationResources[location].material -= totalMaterial;
  state.locationResources[location].labor -= totalLabor;
  state.locationFacilities[location][type] += toBigInt(amount);

  reconcileEarthGpuInstallation(state);
  return true;
}
