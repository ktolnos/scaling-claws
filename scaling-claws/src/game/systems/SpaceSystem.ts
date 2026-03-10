import { BALANCE, getGpuSatellitePowerMWPerUnit } from '../BalanceConfig.ts';
import type { GameState, TransportPayloadId, TransportRouteId } from '../GameState.ts';
import { fromBigInt, mulB, SCALE, toBigInt } from '../utils.ts';
import { reconcileEarthGpuInstallation } from './GpuState.ts';
import {
  getTransportPayloadWeight,
  getTransportRouteCapacityKg,
  getTransportRouteSource,
  isTransportRouteUnlocked,
} from './SpaceRules.ts';

function orderKey(route: TransportRouteId, payload: TransportPayloadId): string {
  return `${route}:${payload}`;
}

function toWholeUnits(value: bigint): bigint {
  if (value <= 0n) return 0n;
  return (value / SCALE) * SCALE;
}

function ensureLogisticsState(state: GameState): void {
  if (
    !state.logisticsOrders ||
    !state.logisticsSent ||
    !state.logisticsInTransit ||
    !state.transportBatches
  ) {
    throw new Error('Logistics state is missing. Start from a fresh save.');
  }
  const defaults: Record<string, boolean> = {
    'earthOrbit:gpuSatellites': false,
    'earthMoon:gpus': false,
    'earthMoon:solarPanels': false,
    'earthMoon:robots': false,
    'moonOrbit:gpuSatellites': false,
    'moonMercury:robots': false,
    'mercurySun:gpuSatellites': true,
  };
  state.logisticsAutoQueue = {
    ...defaults,
    ...(state.logisticsAutoQueue ?? {}),
  };
}

function normalizeLogisticsQuantities(state: GameState): void {
  for (const key of Object.keys(state.logisticsOrders)) {
    state.logisticsOrders[key] = toWholeUnits(state.logisticsOrders[key] || 0n);
  }
  for (const key of Object.keys(state.logisticsSent)) {
    state.logisticsSent[key] = toWholeUnits(state.logisticsSent[key] || 0n);
  }
  for (const key of Object.keys(state.logisticsInTransit)) {
    state.logisticsInTransit[key] = toWholeUnits(state.logisticsInTransit[key] || 0n);
  }
  state.transportBatches = state.transportBatches
    .map((batch) => ({ ...batch, amount: toWholeUnits(batch.amount) }))
    .filter((batch) => batch.amount > 0n);
}

function addToDestination(state: GameState, route: TransportRouteId, payload: TransportPayloadId, amount: bigint): void {
  if (amount <= 0n) return;

  if (route === 'earthOrbit' && payload === 'gpuSatellites') {
    state.satellites += amount;
    return;
  }
  if (route === 'moonOrbit' && payload === 'gpuSatellites') {
    state.satellites += amount;
    return;
  }
  if (route === 'mercurySun' && payload === 'gpuSatellites') {
    state.dysonSwarmSatellites += amount;
    return;
  }

  if (route === 'earthMoon') {
    if (payload === 'robots') state.locationResources.moon.robots += amount;
    else if (payload === 'solarPanels') state.locationResources.moon.solarPanels += amount;
    else if (payload === 'gpus') state.locationResources.moon.gpus += amount;
    return;
  }

  if (route === 'moonMercury' && payload === 'robots') {
    state.locationResources.mercury.robots += amount;
  }
}

function getTransitMs(route: TransportRouteId): number {
  if (route === 'earthOrbit') return BALANCE.routeEarthOrbitTransitMs;
  if (route === 'moonOrbit') return BALANCE.routeEarthMoonTransitMs;
  if (route === 'earthMoon') return BALANCE.routeEarthMoonTransitMs;
  if (route === 'mercurySun') return BALANCE.routeEarthOrbitTransitMs;
  return BALANCE.routeMoonMercuryTransitMs;
}

function getRouteLaunchesPerMin(state: GameState, route: TransportRouteId): number {
  if (route === 'earthOrbit' || route === 'earthMoon') {
    const rockets = Math.floor(fromBigInt(state.locationResources.earth.rockets));
    return Math.max(10, rockets * 2);
  }

  if (route === 'moonOrbit' || route === 'moonMercury') {
    if (state.pausedFacilities.moonMassDriver) return 0;
    const massDrivers = fromBigInt(state.locationFacilities.moon.moonMassDriver);
    return Math.max(0, Math.floor(massDrivers * BALANCE.massDriverLaunchesPerMin));
  }

  const facilities = fromBigInt(state.locationFacilities.mercury.mercuryDysonSwarmFacility);
  return Math.max(0, Math.floor(facilities * BALANCE.massDriverLaunchesPerMin));
}

function processDeliveries(state: GameState, now: number): void {
  if (state.transportBatches.length === 0) return;

  const remaining = [] as typeof state.transportBatches;
  for (const batch of state.transportBatches) {
    if (now >= batch.deliveredAt) {
      addToDestination(state, batch.route, batch.payload, batch.amount);
      const key = orderKey(batch.route, batch.payload);
      const current = state.logisticsInTransit[key] || 0n;
      state.logisticsInTransit[key] = current > batch.amount ? current - batch.amount : 0n;
    } else {
      remaining.push(batch);
    }
  }
  state.transportBatches = remaining;
}

function getRoutePayloads(route: TransportRouteId): TransportPayloadId[] {
  if (route === 'earthOrbit') return ['gpuSatellites'];
  if (route === 'moonOrbit') return ['gpuSatellites'];
  if (route === 'mercurySun') return ['gpuSatellites'];
  if (route === 'earthMoon') return ['gpus', 'solarPanels', 'robots'];
  return ['robots'];
}

function consumeEarthRocketsForLaunches(state: GameState, launchesUsed: number): void {
  if (launchesUsed <= 0) return;
  const lossPct = Math.max(0.01, state.rocketLossPct);
  const consumed = Math.ceil(launchesUsed * lossPct);
  if (consumed <= 0) return;
  const current = state.locationResources.earth.rockets;
  const next = current - toBigInt(consumed);
  state.locationResources.earth.rockets = next > 0n ? next : 0n;
}

function clampLaunchesByEarthFuel(state: GameState, launches: number): number {
  if (launches <= 0) return 0;
  const rockets = Math.floor(fromBigInt(state.locationResources.earth.rockets));
  if (rockets <= 0) return 0;
  const lossPct = Math.max(0.01, state.rocketLossPct);
  const maxLaunchesByFuel = Math.floor(rockets / lossPct);
  return Math.min(launches, Math.max(0, maxLaunchesByFuel));
}

function launchRoute(state: GameState, route: TransportRouteId, dtMs: number, now: number): void {
  if (!isTransportRouteUnlocked(state, route)) return;

  const payloads = getRoutePayloads(route);
  const active = payloads.filter((payload) => {
    const key = orderKey(route, payload);
    return (state.logisticsOrders[key] || 0n) > 0n;
  });

  if (active.length === 0) return;

  const launchesPerMin = getRouteLaunchesPerMin(state, route);
  const launchesFloat = (launchesPerMin * dtMs) / 60000;
  if (route === 'moonOrbit' || route === 'moonMercury') {
    state.moonLaunchCarry += launchesFloat;
  } else if (route === 'mercurySun') {
    state.mercuryLaunchCarry += launchesFloat;
  } else {
    state.earthLaunchCarry += launchesFloat;
  }

  let launchesToUse = 0;
  if (route === 'moonOrbit' || route === 'moonMercury') {
    launchesToUse = Math.floor(state.moonLaunchCarry);
    state.moonLaunchCarry -= launchesToUse;
  } else if (route === 'mercurySun') {
    launchesToUse = Math.floor(state.mercuryLaunchCarry);
    state.mercuryLaunchCarry -= launchesToUse;
  } else {
    launchesToUse = Math.floor(state.earthLaunchCarry);
    state.earthLaunchCarry -= launchesToUse;
    launchesToUse = clampLaunchesByEarthFuel(state, launchesToUse);
  }

  if (launchesToUse <= 0) return;

  const capacityKg = getTransportRouteCapacityKg(state, route);
  if (capacityKg <= 0) return;

  let launchesConsumed = 0;
  let launchesRemaining = launchesToUse;
  const perOrderBase = Math.floor(launchesToUse / active.length);
  let extra = launchesToUse % active.length;

  for (const payload of active) {
    if (launchesRemaining <= 0) break;

    let share = perOrderBase;
    if (extra > 0) {
      share += 1;
      extra -= 1;
    }

    const key = orderKey(route, payload);
    const pending = state.logisticsOrders[key] || 0n;
    const pendingUnits = fromBigInt(pending);
    if (pendingUnits <= 0) continue;

    const weight = getTransportPayloadWeight(payload);
    const maxUnitsByMass = Math.floor((share * capacityKg) / weight);
    const movedUnits = Math.max(0, Math.min(maxUnitsByMass, Math.floor(pendingUnits)));
    if (movedUnits <= 0) continue;

    const movedAmount = toBigInt(movedUnits);
    const massKg = movedUnits * weight;
    const usedLaunches = Math.max(1, Math.ceil(massKg / capacityKg));
    launchesConsumed += usedLaunches;
    launchesRemaining -= usedLaunches;

    state.logisticsOrders[key] -= movedAmount;
    state.logisticsInTransit[key] = (state.logisticsInTransit[key] || 0n) + movedAmount;
    state.transportBatches.push({
      route,
      payload,
      amount: movedAmount,
      deliveredAt: now + getTransitMs(route),
    });
  }

  if (route === 'earthOrbit' || route === 'earthMoon') {
    consumeEarthRocketsForLaunches(state, launchesConsumed);
  }
}

function autoQueuePayload(state: GameState, route: TransportRouteId, payload: TransportPayloadId): void {
  const key = orderKey(route, payload);
  if (!state.logisticsAutoQueue[key]) return;
  if (!isTransportRouteUnlocked(state, route)) return;

  const source = state.locationResources[getTransportRouteSource(route)];
  const available = toWholeUnits(
    payload === 'gpuSatellites'
      ? source.gpuSatellites
      : payload === 'gpus'
        ? source.gpus
        : payload === 'solarPanels'
          ? source.solarPanels
          : source.robots,
  );
  if (available <= 0n) return;

  if (payload === 'gpuSatellites') source.gpuSatellites -= available;
  if (payload === 'gpus') source.gpus -= available;
  if (payload === 'solarPanels') source.solarPanels -= available;
  if (payload === 'robots') source.robots -= available;

  state.logisticsOrders[key] = toWholeUnits(state.logisticsOrders[key] || 0n) + available;
  state.logisticsSent[key] = toWholeUnits(state.logisticsSent[key] || 0n) + available;
}

function autoQueueEnabledPayloads(state: GameState): void {
  autoQueuePayload(state, 'earthOrbit', 'gpuSatellites');
  autoQueuePayload(state, 'earthMoon', 'gpus');
  autoQueuePayload(state, 'earthMoon', 'solarPanels');
  autoQueuePayload(state, 'earthMoon', 'robots');
  autoQueuePayload(state, 'moonOrbit', 'gpuSatellites');
  autoQueuePayload(state, 'moonMercury', 'robots');
  autoQueuePayload(state, 'mercurySun', 'gpuSatellites');
}

export function tickSpace(state: GameState, dtMs: number): void {
  const now = state.time;
  ensureLogisticsState(state);
  normalizeLogisticsQuantities(state);
  processDeliveries(state, now);

  state.spaceUnlocked = state.completedResearch.includes('rocketry');
  if (!state.spaceUnlocked) {
    state.orbitalPowerMW = 0n;
    state.dysonSwarmPowerMW = 0n;
    return;
  }

  autoQueueEnabledPayloads(state);
  launchRoute(state, 'earthOrbit', dtMs, now);
  launchRoute(state, 'earthMoon', dtMs, now);
  launchRoute(state, 'moonOrbit', dtMs, now);
  launchRoute(state, 'moonMercury', dtMs, now);
  launchRoute(state, 'mercurySun', dtMs, now);

  const satellitePowerMW = toBigInt(getGpuSatellitePowerMWPerUnit());
  state.orbitalPowerMW = mulB(state.satellites, satellitePowerMW);
  state.dysonSwarmPowerMW = mulB(state.dysonSwarmSatellites, satellitePowerMW);
  state.totalEnergyMW = state.powerSupplyMW + state.lunarPowerSupplyMW + state.mercuryPowerSupplyMW + state.orbitalPowerMW + state.dysonSwarmPowerMW;

  state.mercuryMassMined = state.locationResources.mercury.material;
  if (state.mercuryMassTotal < BALANCE.mercuryBaseMassTotal) {
    state.mercuryMassTotal = BALANCE.mercuryBaseMassTotal;
  }

  reconcileEarthGpuInstallation(state);
}

export function schedulePayload(state: GameState, route: TransportRouteId, payload: TransportPayloadId, amount: number): boolean {
  if (!isTransportRouteUnlocked(state, route)) return false;
  const wholeAmount = Math.floor(amount);
  if (wholeAmount <= 0) return false;
  if (route === 'mercurySun') return false;

  const amountB = toBigInt(wholeAmount);
  const source = state.locationResources[getTransportRouteSource(route)];

  if (route === 'earthOrbit' && payload !== 'gpuSatellites') return false;
  if (route === 'moonOrbit' && payload !== 'gpuSatellites') return false;
  if (route === 'earthMoon' && !['gpus', 'solarPanels', 'robots'].includes(payload)) return false;
  if (route === 'moonMercury' && payload !== 'robots') return false;

  if (payload === 'gpuSatellites' && source.gpuSatellites < amountB) return false;
  if (payload === 'gpus' && source.gpus < amountB) return false;
  if (payload === 'solarPanels' && source.solarPanels < amountB) return false;
  if (payload === 'robots' && source.robots < amountB) return false;

  if (payload === 'gpuSatellites') source.gpuSatellites -= amountB;
  if (payload === 'gpus') source.gpus -= amountB;
  if (payload === 'solarPanels') source.solarPanels -= amountB;
  if (payload === 'robots') source.robots -= amountB;

  const key = orderKey(route, payload);
  state.logisticsOrders[key] = toWholeUnits(state.logisticsOrders[key] || 0n) + amountB;
  state.logisticsSent[key] = toWholeUnits(state.logisticsSent[key] || 0n) + amountB;

  reconcileEarthGpuInstallation(state);
  return true;
}

export function clearQueuedPayload(state: GameState, route: TransportRouteId, payload: TransportPayloadId): boolean {
  ensureLogisticsState(state);
  const key = orderKey(route, payload);
  const hadAutoQueue = state.logisticsAutoQueue[key] === true;
  state.logisticsAutoQueue[key] = false;

  const queued = toWholeUnits(state.logisticsOrders[key] || 0n);
  if (queued <= 0n) return hadAutoQueue;

  const source = state.locationResources[getTransportRouteSource(route)];
  if (payload === 'gpuSatellites') source.gpuSatellites += queued;
  if (payload === 'gpus') source.gpus += queued;
  if (payload === 'solarPanels') source.solarPanels += queued;
  if (payload === 'robots') source.robots += queued;

  state.logisticsOrders[key] = 0n;
  return true;
}

export function launchVonNeumannProbe(state: GameState): boolean {
  if (!state.completedResearch.includes('vonNeumannProbes')) return false;
  if (state.gameWon) return false;

  const moonHasLaunch = state.locationFacilities.moon.moonMassDriver > 0n;
  if (!moonHasLaunch) {
    if (state.locationResources.earth.rockets <= 0n) return false;
    state.locationResources.earth.rockets -= toBigInt(1);
  }

  state.gameWon = true;
  state.pendingFlavorTexts.push('"Von Neumann probe launch confirmed. Expansion is now irreversible."');
  reconcileEarthGpuInstallation(state);
  return true;
}
