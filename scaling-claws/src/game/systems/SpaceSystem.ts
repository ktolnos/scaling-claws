import type { GameState, LocationId, TransportPayloadId, TransportRouteId } from '../GameState.ts';
import { BALANCE, getGpuSatellitePowerMWPerUnit } from '../BalanceConfig.ts';
import { toBigInt, mulB, fromBigInt } from '../utils.ts';
import { reconcileEarthGpuInstallation } from './GpuState.ts';
import {
  estimateTransportRockets,
  getTransportPayloadWeight,
  getTransportRouteCapacityKg,
  getTransportRouteSource,
  isTransportRouteUnlocked,
} from './SpaceRules.ts';

function orderKey(route: TransportRouteId, payload: TransportPayloadId): string {
  return `${route}:${payload}`;
}

function ensureLogisticsState(state: GameState): void {
  if (
    !state.logisticsReservedRockets ||
    !state.logisticsOrders ||
    !state.logisticsSent ||
    !state.logisticsInTransit ||
    !state.transportBatches ||
    !state.rocketReturnBatches
  ) {
    throw new Error('Logistics state is missing. Start from a fresh save.');
  }
}

function getRocketPool(state: GameState, route: TransportRouteId): bigint {
  const source = getTransportRouteSource(route);
  return state.locationResources[source].rockets;
}

function setRocketPool(state: GameState, route: TransportRouteId, value: bigint): void {
  const source = getTransportRouteSource(route);
  state.locationResources[source].rockets = value;
}

function addToDestination(state: GameState, route: TransportRouteId, payload: TransportPayloadId, amount: bigint): void {
  if (amount <= 0n) return;

  if (route === 'earthOrbit' && payload === 'gpuSatellites') {
    state.satellites += amount;
    return;
  }
  if (route === 'mercuryOrbit' && payload === 'gpuSatellites') {
    state.dysonSwarmSatellites += amount;
    return;
  }

  if (route === 'earthMoon') {
    if (payload === 'robots') state.locationResources.moon.robots += amount;
    else if (payload === 'solarPanels') state.locationResources.moon.solarPanels += amount;
    else if (payload === 'gpus') state.locationResources.moon.gpus += amount;
    return;
  }

  if (route === 'moonMercury') {
    if (payload === 'robots') state.locationResources.mercury.robots += amount;
  }
}

function getTransitMs(route: TransportRouteId): number {
  if (route === 'earthOrbit') return BALANCE.routeEarthOrbitTransitMs;
  if (route === 'earthMoon') return BALANCE.routeEarthMoonTransitMs;
  if (route === 'mercuryOrbit') return BALANCE.routeEarthOrbitTransitMs;
  return BALANCE.routeMoonMercuryTransitMs;
}

function getReturnMs(route: TransportRouteId): number {
  if (route === 'moonMercury') return BALANCE.moonRocketReturnMs;
  if (route === 'mercuryOrbit') return BALANCE.moonRocketReturnMs;
  return BALANCE.earthRocketReturnMs;
}

function routeMatchesSource(route: TransportRouteId, source: LocationId): boolean {
  if (source === 'earth') return route === 'earthOrbit' || route === 'earthMoon';
  if (source === 'moon') return route === 'moonMercury';
  return route === 'mercuryOrbit';
}

function getBatchRocketCount(
  state: GameState,
  route: TransportRouteId,
  payload: TransportPayloadId,
  amount: bigint,
  launchedRockets?: bigint,
): number {
  return estimateTransportRockets(state, route, payload, amount, launchedRockets);
}

function getSourceRocketFleetCount(state: GameState, source: LocationId): number {
  let total = Math.floor(fromBigInt(state.locationResources[source].rockets));

  const reserved = state.logisticsReservedRockets;
  if (source === 'earth') total += Math.floor(fromBigInt(reserved.earthOrbit + reserved.earthMoon));
  if (source === 'moon') total += Math.floor(fromBigInt(reserved.moonMercury));
  if (source === 'mercury') total += Math.floor(fromBigInt(reserved.mercuryOrbit));

  for (const batch of state.transportBatches) {
    if (!routeMatchesSource(batch.route, source)) continue;
    total += getBatchRocketCount(state, batch.route, batch.payload, batch.amount, batch.launchedRockets);
  }

  for (const batch of state.rocketReturnBatches) {
    if (batch.location !== source) continue;
    total += Math.max(0, Math.floor(fromBigInt(batch.amount)));
  }

  return Math.max(0, total);
}

function getMassDriverLaunchBoostPerMin(state: GameState, route: TransportRouteId): number {
  if (state.pausedFacilities.massDriver) return 0;

  if (route === 'moonMercury') {
    return fromBigInt(state.locationFacilities.moon.massDriver) * BALANCE.massDriverLaunchesPerMin;
  }

  if (route === 'mercuryOrbit') {
    return fromBigInt(state.locationFacilities.mercury.massDriver) * BALANCE.massDriverLaunchesPerMin;
  }

  return 0;
}

function getRouteLaunchesPerMin(state: GameState, route: TransportRouteId): number {
  const source = getTransportRouteSource(route);
  const rockets = getSourceRocketFleetCount(state, source);
  const baseLaunches = Math.max(10, rockets * 2);
  return baseLaunches + getMassDriverLaunchBoostPerMin(state, route);
}

function scheduleRocketReturns(state: GameState, route: TransportRouteId, rocketsUsed: number, now: number): void {
  if (rocketsUsed <= 0) return;
  const recoveredPct = Math.max(0, 1 - state.rocketLossPct);
  const recoverCount = Math.floor(rocketsUsed * recoveredPct);
  if (recoverCount <= 0) return;

  const location = route === 'moonMercury'
    ? 'moon'
    : route === 'mercuryOrbit'
      ? 'mercury'
      : 'earth';
  state.rocketReturnBatches.push({
    location,
    amount: toBigInt(recoverCount),
    returnAt: now + getReturnMs(route),
  });
}

function processReturns(state: GameState, now: number): void {
  if (state.rocketReturnBatches.length === 0) return;
  const remaining = [] as typeof state.rocketReturnBatches;
  for (const batch of state.rocketReturnBatches) {
    if (now >= batch.returnAt) {
      state.locationResources[batch.location].rockets += batch.amount;
    } else {
      remaining.push(batch);
    }
  }
  state.rocketReturnBatches = remaining;
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

function launchRoute(state: GameState, route: TransportRouteId, dtMs: number, now: number): void {
  if (!isTransportRouteUnlocked(state, route)) return;

  const payloads: TransportPayloadId[] = route === 'earthOrbit'
    ? ['gpuSatellites']
    : route === 'mercuryOrbit'
      ? ['gpuSatellites']
    : route === 'earthMoon'
      ? ['gpus', 'solarPanels', 'robots']
      : ['robots'];

  const active = payloads.filter((payload) => {
    const key = orderKey(route, payload);
    return (state.logisticsOrders[key] || 0n) > 0n;
  });

  if (active.length === 0) return;

  const launchesPerMin = getRouteLaunchesPerMin(state, route);
  const launchesFloat = (launchesPerMin * dtMs) / 60000;
  if (route === 'moonMercury') {
    state.moonLaunchCarry += launchesFloat;
  } else if (route === 'mercuryOrbit') {
    state.mercuryLaunchCarry += launchesFloat;
  } else {
    state.earthLaunchCarry += launchesFloat;
  }

  let launchesToUse = 0;
  if (route === 'moonMercury') {
    launchesToUse = Math.floor(state.moonLaunchCarry);
    state.moonLaunchCarry -= launchesToUse;
  } else if (route === 'mercuryOrbit') {
    launchesToUse = Math.floor(state.mercuryLaunchCarry);
    state.mercuryLaunchCarry -= launchesToUse;
  } else {
    launchesToUse = Math.floor(state.earthLaunchCarry);
    state.earthLaunchCarry -= launchesToUse;
  }

  if (launchesToUse <= 0) return;

  const rocketsAvailable = fromBigInt(state.logisticsReservedRockets[route] || 0n);
  if (rocketsAvailable <= 0) return;

  launchesToUse = Math.min(launchesToUse, Math.floor(rocketsAvailable));
  if (launchesToUse <= 0) return;

  const capacityKg = getTransportRouteCapacityKg(state, route);

  let rocketsConsumed = 0;
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
    const usedRockets = Math.ceil(massKg / capacityKg);

    rocketsConsumed += usedRockets;
    launchesRemaining -= usedRockets;

    state.logisticsOrders[key] -= movedAmount;
    state.logisticsInTransit[key] = (state.logisticsInTransit[key] || 0n) + movedAmount;

    state.transportBatches.push({
      route,
      payload,
      amount: movedAmount,
      launchedRockets: toBigInt(usedRockets),
      deliveredAt: now + getTransitMs(route),
      rocketReturnAt: now + getReturnMs(route),
      rocketReturnsTo: route === 'moonMercury' ? 'moon' : route === 'mercuryOrbit' ? 'mercury' : 'earth',
      returningRockets: toBigInt(Math.max(0, Math.floor(usedRockets * (1 - state.rocketLossPct)))),
    });
  }

  if (rocketsConsumed > 0) {
    state.logisticsReservedRockets[route] = (state.logisticsReservedRockets[route] || 0n) - toBigInt(rocketsConsumed);
    scheduleRocketReturns(state, route, rocketsConsumed, now);
  }
}

function estimateRocketsNeededForPending(state: GameState, route: TransportRouteId): number {
  if (!isTransportRouteUnlocked(state, route)) return 0;

  const payloads: TransportPayloadId[] = route === 'earthOrbit'
    ? ['gpuSatellites']
    : route === 'mercuryOrbit'
      ? ['gpuSatellites']
    : route === 'earthMoon'
      ? ['gpus', 'solarPanels', 'robots']
      : ['robots'];

  const capacityKg = getTransportRouteCapacityKg(state, route);
  if (capacityKg <= 0) return 0;

  let rockets = 0;
  for (const payload of payloads) {
    const key = orderKey(route, payload);
    const pendingUnits = Math.floor(fromBigInt(state.logisticsOrders[key] || 0n));
    if (pendingUnits <= 0) continue;
    const weight = getTransportPayloadWeight(payload);
    rockets += Math.ceil((pendingUnits * weight) / capacityKg);
  }
  return rockets;
}

function reserveRocketsForRoute(state: GameState, route: TransportRouteId): void {
  if (!isTransportRouteUnlocked(state, route)) return;
  const needed = estimateRocketsNeededForPending(state, route);
  const reservedNow = Math.floor(fromBigInt(state.logisticsReservedRockets[route] || 0n));

  // Release extra reservations when pending demand drops.
  if (reservedNow > needed) {
    const release = reservedNow - needed;
    if (release > 0) {
      state.logisticsReservedRockets[route] -= toBigInt(release);
      setRocketPool(state, route, getRocketPool(state, route) + toBigInt(release));
    }
    return;
  }

  const deficit = needed - reservedNow;
  if (deficit <= 0) return;

  const available = Math.floor(fromBigInt(getRocketPool(state, route)));
  if (available <= 0) return;

  const reserve = Math.min(deficit, available);
  if (reserve <= 0) return;

  setRocketPool(state, route, getRocketPool(state, route) - toBigInt(reserve));
  state.logisticsReservedRockets[route] = (state.logisticsReservedRockets[route] || 0n) + toBigInt(reserve);
}

function autoQueueMercuryOrbitPayload(state: GameState): void {
  if (!isTransportRouteUnlocked(state, 'mercuryOrbit')) return;
  const produced = state.locationResources.mercury.gpuSatellites;
  if (produced <= 0n) return;

  state.locationResources.mercury.gpuSatellites -= produced;
  const key = orderKey('mercuryOrbit', 'gpuSatellites');
  state.logisticsOrders[key] = (state.logisticsOrders[key] || 0n) + produced;
  state.logisticsSent[key] = (state.logisticsSent[key] || 0n) + produced;
}

export function tickSpace(state: GameState, dtMs: number): void {
  const now = state.time;
  ensureLogisticsState(state);

  processReturns(state, now);
  processDeliveries(state, now);

  state.spaceUnlocked = state.completedResearch.includes('orbitalLogistics');
  if (!state.spaceUnlocked) {
    state.orbitalPowerMW = 0n;
    return;
  }

  // Mercury Dyson payloads auto-ship to orbit once route is unlocked.
  autoQueueMercuryOrbitPayload(state);

  // Reserve rockets immediately for pending orders so source rocket stock reflects demand.
  reserveRocketsForRoute(state, 'earthOrbit');
  reserveRocketsForRoute(state, 'earthMoon');
  reserveRocketsForRoute(state, 'moonMercury');
  reserveRocketsForRoute(state, 'mercuryOrbit');

  launchRoute(state, 'earthOrbit', dtMs, now);
  launchRoute(state, 'earthMoon', dtMs, now);
  launchRoute(state, 'moonMercury', dtMs, now);
  launchRoute(state, 'mercuryOrbit', dtMs, now);

  // Orbital power
  const satellitePowerMW = toBigInt(getGpuSatellitePowerMWPerUnit());
  state.orbitalPowerMW = mulB(state.satellites, satellitePowerMW);
  state.dysonSwarmPowerMW = mulB(state.dysonSwarmSatellites, satellitePowerMW);
  state.totalEnergyMW = state.powerSupplyMW + state.lunarPowerSupplyMW + state.mercuryPowerSupplyMW + state.orbitalPowerMW + state.dysonSwarmPowerMW;

  // Mercury depletion progress from mined material
  state.mercuryMassMined = state.locationResources.mercury.material;
  if (state.mercuryMassTotal < BALANCE.mercuryBaseMassTotal) {
    state.mercuryMassTotal = BALANCE.mercuryBaseMassTotal;
  }

  reconcileEarthGpuInstallation(state);
}

export function schedulePayload(state: GameState, route: TransportRouteId, payload: TransportPayloadId, amount: number): boolean {
  if (!isTransportRouteUnlocked(state, route)) return false;
  if (amount <= 0) return false;

  const amountB = toBigInt(amount);
  const source = state.locationResources[getTransportRouteSource(route)];

  if (route === 'earthOrbit' && payload !== 'gpuSatellites') return false;
  if (route === 'mercuryOrbit' && payload !== 'gpuSatellites') return false;
  if (route === 'earthMoon' && !['gpus', 'solarPanels', 'robots'].includes(payload)) return false;
  if (route === 'moonMercury' && payload !== 'robots') return false;

  if (payload === 'gpuSatellites' && source.gpuSatellites < amountB) return false;
  if (payload === 'gpus' && source.gpus < amountB) return false;
  if (payload === 'solarPanels' && source.solarPanels < amountB) return false;
  if (payload === 'robots' && source.robots < amountB) return false;

  // Consume immediately at source
  if (payload === 'gpuSatellites') source.gpuSatellites -= amountB;
  if (payload === 'gpus') source.gpus -= amountB;
  if (payload === 'solarPanels') source.solarPanels -= amountB;
  if (payload === 'robots') source.robots -= amountB;

  const key = orderKey(route, payload);
  state.logisticsOrders[key] = (state.logisticsOrders[key] || 0n) + amountB;
  state.logisticsSent[key] = (state.logisticsSent[key] || 0n) + amountB;

  reconcileEarthGpuInstallation(state);
  return true;
}

export function installSolarPanels(state: GameState, location: LocationId, amount: number): boolean {
  const amountB = toBigInt(amount);
  if (amountB <= 0n) return false;

  if (location === 'earth') {
    if (!state.completedResearch.includes('solarTechnology')) return false;
    if (state.locationResources.earth.solarPanels < amountB) return false;

    const laborCost = mulB(amountB, BALANCE.earthSolarInstallLaborCost);
    if (state.locationResources.earth.labor < laborCost) return false;

    const limit = BALANCE.earthSolarInstallLimit;
    if (state.locationResources.earth.installedSolarPanels + amountB > limit) return false;

    state.locationResources.earth.solarPanels -= amountB;
    state.locationResources.earth.installedSolarPanels += amountB;
    state.locationResources.earth.labor -= laborCost;
    reconcileEarthGpuInstallation(state);
    return true;
  }

  if (location === 'moon') {
    if (!state.completedResearch.includes('payloadToMoon')) return false;
    if (state.locationResources.moon.solarPanels < amountB) return false;

    const laborCost = mulB(amountB, BALANCE.moonInstallLaborCost);
    if (state.locationResources.moon.labor < laborCost) return false;

    if (state.locationResources.moon.installedSolarPanels + amountB > BALANCE.moonSolarInstallLimit) return false;

    state.locationResources.moon.solarPanels -= amountB;
    state.locationResources.moon.installedSolarPanels += amountB;
    state.locationResources.moon.labor -= laborCost;
    reconcileEarthGpuInstallation(state);
    return true;
  }

  return false;
}

export function installMoonGpus(state: GameState, amount: number): boolean {
  const amountB = toBigInt(amount);
  if (!state.completedResearch.includes('payloadToMoon')) return false;
  if (state.locationResources.moon.gpus < amountB) return false;

  const laborCost = mulB(amountB, BALANCE.moonInstallLaborCost);
  if (state.locationResources.moon.labor < laborCost) return false;

  if (state.locationResources.moon.installedGpus + amountB > BALANCE.moonGpuInstallLimit) return false;

  state.locationResources.moon.gpus -= amountB;
  state.locationResources.moon.installedGpus += amountB;
  state.locationResources.moon.labor -= laborCost;
  reconcileEarthGpuInstallation(state);
  return true;
}

export function launchVonNeumannProbe(state: GameState): boolean {
  if (!state.completedResearch.includes('vonNeumannProbes')) return false;
  if (state.gameWon) return false;

  // Any launch-capable location can trigger the end.
  if (state.locationResources.moon.rockets > 0n) {
    state.locationResources.moon.rockets -= toBigInt(1);
  } else if (state.locationResources.earth.rockets > 0n) {
    state.locationResources.earth.rockets -= toBigInt(1);
  } else {
    return false;
  }

  state.gameWon = true;
  state.pendingFlavorTexts.push('"Von Neumann probe launch confirmed. Expansion is now irreversible."');
  reconcileEarthGpuInstallation(state);
  return true;
}
