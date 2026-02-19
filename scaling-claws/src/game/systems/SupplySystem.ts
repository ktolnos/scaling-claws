import type { GameState, FacilityId, LocationId, LocationResourceState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import { toBigInt, mulB, divB, scaleBigInt, fromBigInt } from '../utils.ts';
import { reconcileEarthGpuInstallation } from './GpuState.ts';

function toScaled(value: number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  return toBigInt(value);
}

const ALL_FACILITIES: FacilityId[] = [
  'materialMine',
  'solarFactory',
  'robotFactory',
  'gpuFactory',
  'rocketFactory',
  'gpuSatelliteFactory',
  'massDriver',
];

function ensurePausedFacilities(state: GameState): void {
  const maybe = (state as any).pausedFacilities as Record<FacilityId, boolean> | undefined;
  if (!maybe) {
    (state as any).pausedFacilities = {
      materialMine: false,
      solarFactory: false,
      robotFactory: false,
      gpuFactory: false,
      rocketFactory: false,
      gpuSatelliteFactory: false,
      massDriver: false,
    };
    return;
  }
  for (const facility of ALL_FACILITIES) {
    if (typeof maybe[facility] !== 'boolean') maybe[facility] = false;
  }
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

  // Keep Earth aliases in sync with the newer location model.
  const earth = state.locationResources.earth;
  if (earth.material === 0n && state.material > 0n) earth.material = state.material;
  if (earth.solarPanels === 0n && state.solarPanels > 0n) earth.solarPanels = state.solarPanels;
  if (earth.robots === 0n && state.robots > 0n) earth.robots = state.robots;
  if (earth.gpus === 0n && state.gpuCount > 0n) earth.gpus = state.gpuCount;
  if (earth.rockets === 0n && state.rockets > 0n) earth.rockets = state.rockets;
  if (earth.gpuSatellites === 0n && state.gpuSatellites > 0n) earth.gpuSatellites = state.gpuSatellites;
  if (earth.labor === 0n && state.labor > 0n) earth.labor = state.labor;

  const moon = state.locationResources.moon;
  if (moon.material === 0n && state.moonMaterials > 0n) moon.material = state.moonMaterials;
  if (moon.robots === 0n && state.lunarRobots > 0n) moon.robots = state.lunarRobots;
  if (moon.installedGpus === 0n && state.lunarGPUs > 0n) moon.installedGpus = state.lunarGPUs;
  if (moon.installedSolarPanels === 0n && state.lunarSolarPanels > 0n) moon.installedSolarPanels = state.lunarSolarPanels;

  const mercury = state.locationResources.mercury;
  if (mercury.robots === 0n && state.mercuryRobots > 0n) mercury.robots = state.mercuryRobots;

  const earthFacilities = state.locationFacilities.earth;
  if (earthFacilities.materialMine === 0n && state.materialMines > 0n) earthFacilities.materialMine = state.materialMines;
  if (earthFacilities.solarFactory === 0n && state.solarFactories > 0n) earthFacilities.solarFactory = state.solarFactories;
  if (earthFacilities.robotFactory === 0n && state.robotFactories > 0n) earthFacilities.robotFactory = state.robotFactories;
  if (earthFacilities.gpuFactory === 0n && state.gpuFactories > 0n) earthFacilities.gpuFactory = state.gpuFactories;
  if (earthFacilities.rocketFactory === 0n && state.rocketFactories > 0n) earthFacilities.rocketFactory = state.rocketFactories;
  if (earthFacilities.gpuSatelliteFactory === 0n && state.gpuSatelliteFactories > 0n) earthFacilities.gpuSatelliteFactory = state.gpuSatelliteFactories;

  const moonFacilities = state.locationFacilities.moon;
  if (moonFacilities.materialMine === 0n && state.moonMines > 0n) moonFacilities.materialMine = state.moonMines;
  if (moonFacilities.gpuFactory === 0n && state.moonGpuFactories > 0n) moonFacilities.gpuFactory = state.moonGpuFactories;
  if (moonFacilities.solarFactory === 0n && state.moonSolarFactories > 0n) moonFacilities.solarFactory = state.moonSolarFactories;
  if (moonFacilities.gpuSatelliteFactory === 0n && state.moonGpuSatelliteFactories > 0n) moonFacilities.gpuSatelliteFactory = state.moonGpuSatelliteFactories;
  if (moonFacilities.massDriver === 0n && state.moonMassDrivers > 0n) moonFacilities.massDriver = state.moonMassDrivers;
}

function isFacilityUnlocked(state: GameState, location: LocationId, facility: FacilityId): boolean {
  if (location === 'earth') {
    if (facility === 'materialMine') return true;
    if (facility === 'solarFactory') return state.completedResearch.includes('solarTechnology');
    if (facility === 'robotFactory') return state.completedResearch.includes('robotics1');
    if (facility === 'gpuFactory') return state.completedResearch.includes('chipManufacturing');
    if (facility === 'rocketFactory') return state.completedResearch.includes('rocketry');
    if (facility === 'gpuSatelliteFactory') return state.completedResearch.includes('orbitalLogistics');
    return false;
  }

  if (location === 'moon') {
    if (!state.completedResearch.includes('payloadToMoon')) return false;
    if (facility === 'materialMine') return state.completedResearch.includes('moonMineEngineering');
    if (facility === 'solarFactory') return state.completedResearch.includes('moonSolarManufacturing');
    if (facility === 'gpuFactory') return state.completedResearch.includes('moonChipManufacturing');
    if (facility === 'gpuSatelliteFactory') return state.completedResearch.includes('moonSatelliteManufacturing');
    if (facility === 'rocketFactory') return state.completedResearch.includes('moonRocketry');
    if (facility === 'massDriver') return state.completedResearch.includes('moonMassDrivers');
    if (facility === 'robotFactory') return state.completedResearch.includes('robotics1');
    return false;
  }

  if (!state.completedResearch.includes('payloadToMercury')) return false;
  return true;
}

function getLaborMultiplier(state: GameState): number {
  if (state.completedResearch.includes('robotics3')) return BALANCE.robotLaborMultRobotics3;
  if (state.completedResearch.includes('robotics2')) return BALANCE.robotLaborMultRobotics2;
  return 1;
}

type FactoryInput = { resource: keyof LocationResourceState; reqPerFactoryPerMin: bigint };

interface FacilityOperation {
  facility: FacilityId;
  outputResource: keyof LocationResourceState;
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

function getOutputStockpileCap(location: LocationId, resource: keyof LocationResourceState): bigint | null {
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
  resourceEff: Partial<Record<keyof LocationResourceState, bigint>>,
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
  (state.locationProductionPerMin[location] as any)[op.outputResource] += effectivePerMin;

  if (op.inputA && op.consumeA > 0n) {
    const inputPerMin = mulB(op.count, op.inputA.reqPerFactoryPerMin);
    const actualInput = mulB(op.consumeA, effScaled);
    resources[op.inputA.resource] -= actualInput;
    (state.locationConsumptionPerMin[location] as any)[op.inputA.resource] += mulB(inputPerMin, effScaled);
  }

  if (op.inputB && op.consumeB > 0n) {
    const inputPerMin = mulB(op.count, op.inputB.reqPerFactoryPerMin);
    const actualInput = mulB(op.consumeB, effScaled);
    resources[op.inputB.resource] -= actualInput;
    (state.locationConsumptionPerMin[location] as any)[op.inputB.resource] += mulB(inputPerMin, effScaled);
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

  const totalDemand: Partial<Record<keyof LocationResourceState, bigint>> = {};
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

  const resourceEff: Partial<Record<keyof LocationResourceState, bigint>> = {};
  const resourceKeys = Object.keys(totalDemand) as Array<keyof LocationResourceState>;
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

function syncLegacyAliases(state: GameState): void {
  const earth = state.locationResources.earth;
  const moon = state.locationResources.moon;
  const mercury = state.locationResources.mercury;

  // Earth resource aliases
  state.material = earth.material;
  state.solarPanels = earth.solarPanels;
  state.robots = earth.robots;
  state.gpuCount = earth.gpus;
  state.rockets = earth.rockets;
  state.gpuSatellites = earth.gpuSatellites;
  state.labor = earth.labor;
  reconcileEarthGpuInstallation(state);

  // Earth rates aliases
  state.materialProductionPerMin = state.locationProductionPerMin.earth.material;
  state.solarPanelProductionPerMin = state.locationProductionPerMin.earth.solarPanels;
  state.robotProductionPerMin = state.locationProductionPerMin.earth.robots;
  state.gpuProductionPerMin = state.locationProductionPerMin.earth.gpus;
  state.rocketProductionPerMin = state.locationProductionPerMin.earth.rockets;
  state.gpuSatelliteProductionPerMin = state.locationProductionPerMin.earth.gpuSatellites;

  state.materialConsumptionPerMin = state.locationConsumptionPerMin.earth.material;
  state.solarPanelConsumptionPerMin = state.locationConsumptionPerMin.earth.solarPanels;
  state.robotConsumptionPerMin = state.locationConsumptionPerMin.earth.robots;
  state.gpuConsumptionPerMin = state.locationConsumptionPerMin.earth.gpus;
  state.rocketConsumptionPerMin = state.locationConsumptionPerMin.earth.rockets;
  state.gpuSatelliteConsumptionPerMin = state.locationConsumptionPerMin.earth.gpuSatellites;

  // Earth facility aliases
  state.materialMines = state.locationFacilities.earth.materialMine;
  state.solarFactories = state.locationFacilities.earth.solarFactory;
  state.robotFactories = state.locationFacilities.earth.robotFactory;
  state.gpuFactories = state.locationFacilities.earth.gpuFactory;
  state.rocketFactories = state.locationFacilities.earth.rocketFactory;
  state.gpuSatelliteFactories = state.locationFacilities.earth.gpuSatelliteFactory;

  state.materialMineRate = state.locationFacilityRates.earth.materialMine;
  state.solarFactoryRate = state.locationFacilityRates.earth.solarFactory;
  state.robotFactoryRate = state.locationFacilityRates.earth.robotFactory;
  state.gpuFactoryRate = state.locationFacilityRates.earth.gpuFactory;
  state.rocketFactoryRate = state.locationFacilityRates.earth.rocketFactory;
  state.gpuSatelliteFactoryRate = state.locationFacilityRates.earth.gpuSatelliteFactory;

  // Legacy moon aliases
  state.lunarRobots = moon.robots;
  state.lunarGPUs = moon.installedGpus;
  state.lunarSolarPanels = moon.installedSolarPanels;
  state.moonMaterials = moon.material;
  state.moonMines = state.locationFacilities.moon.materialMine;
  state.moonGpuFactories = state.locationFacilities.moon.gpuFactory;
  state.moonSolarFactories = state.locationFacilities.moon.solarFactory;
  state.moonGpuSatelliteFactories = state.locationFacilities.moon.gpuSatelliteFactory;
  state.moonMassDrivers = state.locationFacilities.moon.massDriver;

  // Legacy mercury aliases
  state.mercuryRobots = mercury.robots;
}

export function tickSupply(state: GameState, dtMs: number): void {
  ensureLocationState(state);
  ensurePausedFacilities(state);
  resetLocationRates(state);

  // Keep Earth GPU value from compute actions before running supply simulation.
  state.locationResources.earth.gpus = state.gpuCount;
  state.locationResources.earth.rockets = state.rockets;
  state.locationResources.earth.gpuSatellites = state.gpuSatellites;
  state.locationResources.earth.solarPanels = state.solarPanels;
  state.locationResources.earth.robots = state.robots;
  state.locationResources.earth.material = state.material;
  state.locationResources.earth.labor = state.labor;

  // Robot labor generation at each location
  const laborMult = getLaborMultiplier(state);
  const robotLaborPerMin = mulB(BALANCE.robotLaborPerMinBase, toBigInt(laborMult));
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
        outputPerFactoryPerMin: BALANCE.materialMineOutput,
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
        outputPerFactoryPerMin: BALANCE.solarFactoryOutput,
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
        outputPerFactoryPerMin: BALANCE.robotFactoryOutput,
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
        outputPerFactoryPerMin: BALANCE.gpuFactoryOutput,
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
        outputPerFactoryPerMin: toScaled(BALANCE.rocketFactoryOutput),
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
        outputPerFactoryPerMin: toScaled(BALANCE.gpuSatelliteFactoryOutput),
        inputA: { resource: 'solarPanels', reqPerFactoryPerMin: BALANCE.gpuSatelliteFactoryMaterialReq },
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

  syncLegacyAliases(state);
}

// Generic imports (Earth only)
export function importResource(state: GameState, resource: 'material' | 'solarPanels' | 'robots' | 'rockets' | 'gpuSatellites' | 'gpu', amount: number): boolean {
  const amountB = toBigInt(amount);
  let cost = 0n;

  if (resource === 'material') cost = BALANCE.materialCost;
  else if (resource === 'solarPanels') cost = BALANCE.solarPanelImportCost;
  else if (resource === 'robots') cost = BALANCE.robotImportCost;
  else if (resource === 'rockets') cost = BALANCE.rocketImportCost;
  else if (resource === 'gpuSatellites') cost = BALANCE.gpuSatelliteImportCost;
  else if (resource === 'gpu') cost = BALANCE.gpuImportCost;

  const totalCost = mulB(amountB, cost);
  if (state.funds < totalCost) return false;

  state.funds -= totalCost;

  if (resource === 'material') state.locationResources.earth.material += amountB;
  else if (resource === 'solarPanels') state.locationResources.earth.solarPanels += amountB;
  else if (resource === 'robots') state.locationResources.earth.robots += amountB;
  else if (resource === 'rockets') state.locationResources.earth.rockets += amountB;
  else if (resource === 'gpuSatellites') state.locationResources.earth.gpuSatellites += amountB;
  else if (resource === 'gpu') state.locationResources.earth.gpus += amountB;

  syncLegacyAliases(state);
  return true;
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

function getFacilityBaseCost(type: FacilityId): { money: bigint; labor: bigint } {
  if (type === 'materialMine') return { money: BALANCE.materialMineCost, labor: BALANCE.materialMineLaborCost };
  if (type === 'solarFactory') return { money: BALANCE.solarFactoryCost, labor: 0n };
  if (type === 'robotFactory') return { money: BALANCE.robotFactoryCost, labor: 0n };
  if (type === 'gpuFactory') return { money: BALANCE.gpuFactoryCost, labor: 0n };
  if (type === 'rocketFactory') return { money: BALANCE.rocketFactoryCost, labor: 0n };
  if (type === 'gpuSatelliteFactory') return { money: BALANCE.gpuSatelliteFactoryCost, labor: 0n };
  // Mass driver uses rocket factory-scale economics
  return { money: BALANCE.rocketFactoryCost, labor: 0n };
}

function resolveBuildArgs(
  locationOrType: LocationId | FacilityId,
  maybeTypeOrAmount: FacilityId | number,
  maybeAmount?: number,
): { location: LocationId; type: FacilityId; amount: number } {
  if (typeof maybeTypeOrAmount === 'number') {
    return { location: 'earth', type: locationOrType as FacilityId, amount: maybeTypeOrAmount };
  }
  return {
    location: locationOrType as LocationId,
    type: maybeTypeOrAmount,
    amount: maybeAmount ?? 1,
  };
}

export function canBuildFacility(state: GameState, location: LocationId, type: FacilityId, amount: number): boolean {
  ensureLocationState(state);
  if (!isFacilityUnlocked(state, location, type)) return false;

  const amountB = toBigInt(amount);
  const current = state.locationFacilities[location][type];

  if (location === 'earth') {
    const limit = getEarthLimit(type);
    if (limit > 0 && current + amountB > toBigInt(limit)) return false;
  } else if (location === 'moon') {
    const limit = (BALANCE.moonFacilityLimits as Record<string, number>)[type] ?? 0;
    if (limit > 0 && current + amountB > toBigInt(limit)) return false;
  } else if (location === 'mercury' && type === 'massDriver') {
    const limit = getMercuryMassDriverLimit();
    if (current + amountB > toBigInt(limit)) return false;
  }

  const base = getFacilityBaseCost(type);
  let moneyEach = base.money;
  let laborEach = base.labor;

  if (location === 'moon') {
    moneyEach = mulB(base.money, toBigInt(BALANCE.moonFacilityCostMultiplier));
    laborEach = mulB(base.labor, toBigInt(BALANCE.moonFacilityLaborMultiplier));
  } else if (location === 'mercury') {
    moneyEach = mulB(base.money, toBigInt(BALANCE.mercuryFacilityCostMultiplier));
    laborEach = mulB(base.labor, toBigInt(BALANCE.mercuryFacilityLaborMultiplier));
  }

  const totalMoney = mulB(toBigInt(amount), moneyEach);
  const totalLabor = mulB(toBigInt(amount), laborEach);

  const laborPool = state.locationResources[location].labor;
  if (state.funds < totalMoney) return false;
  if (laborPool < totalLabor) return false;

  return true;
}

// Supports both old signature buildFacility(state, type, amount)
// and new signature buildFacility(state, location, type, amount)
export function buildFacility(
  state: GameState,
  locationOrType: LocationId | FacilityId,
  maybeTypeOrAmount: FacilityId | number,
  maybeAmount?: number,
): boolean {
  const { location, type, amount } = resolveBuildArgs(locationOrType, maybeTypeOrAmount, maybeAmount);
  if (!canBuildFacility(state, location, type, amount)) return false;

  const base = getFacilityBaseCost(type);
  let moneyEach = base.money;
  let laborEach = base.labor;

  if (location === 'moon') {
    moneyEach = mulB(base.money, toBigInt(BALANCE.moonFacilityCostMultiplier));
    laborEach = mulB(base.labor, toBigInt(BALANCE.moonFacilityLaborMultiplier));
  } else if (location === 'mercury') {
    moneyEach = mulB(base.money, toBigInt(BALANCE.mercuryFacilityCostMultiplier));
    laborEach = mulB(base.labor, toBigInt(BALANCE.mercuryFacilityLaborMultiplier));
  }

  const totalMoney = mulB(toBigInt(amount), moneyEach);
  const totalLabor = mulB(toBigInt(amount), laborEach);

  state.funds -= totalMoney;
  state.locationResources[location].labor -= totalLabor;
  state.locationFacilities[location][type] += toBigInt(amount);

  syncLegacyAliases(state);
  return true;
}


