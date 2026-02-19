import type { GameState, LocationId, TransportPayloadId, TransportRouteId } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import { toBigInt, mulB, fromBigInt } from '../utils.ts';
import { buildFacility } from './SupplySystem.ts';
import { reconcileEarthGpuInstallation } from './GpuState.ts';

function orderKey(route: TransportRouteId, payload: TransportPayloadId): string {
  return `${route}:${payload}`;
}

function ensureLogisticsState(state: GameState): void {
  if (!state.logisticsReservedRockets) {
    state.logisticsReservedRockets = { earthOrbit: 0n, earthMoon: 0n, moonMercury: 0n, mercuryOrbit: 0n };
  }
  state.logisticsReservedRockets.earthOrbit ??= 0n;
  state.logisticsReservedRockets.earthMoon ??= 0n;
  state.logisticsReservedRockets.moonMercury ??= 0n;
  state.logisticsReservedRockets.mercuryOrbit ??= 0n;
  if ((state as any).mercuryLaunchCarry === undefined) (state as any).mercuryLaunchCarry = 0;
  if ((state as any).dysonSwarmSatellites === undefined) (state as any).dysonSwarmSatellites = 0n;
  if ((state as any).dysonSwarmPowerMW === undefined) (state as any).dysonSwarmPowerMW = 0n;
}

function routeUnlocked(state: GameState, route: TransportRouteId): boolean {
  if (route === 'earthOrbit') return state.completedResearch.includes('orbitalLogistics');
  if (route === 'earthMoon') return state.completedResearch.includes('payloadToMoon');
  if (route === 'mercuryOrbit') return state.completedResearch.includes('payloadToMercury');
  return state.completedResearch.includes('payloadToMercury');
}

function getPayloadWeight(payload: TransportPayloadId): number {
  if (payload === 'robots') return BALANCE.robotWeight;
  if (payload === 'solarPanels') return BALANCE.solarPanelWeight;
  if (payload === 'gpus') return BALANCE.gpuWeight;
  return BALANCE.gpuSatelliteWeight;
}

function getSourceLocation(route: TransportRouteId): LocationId {
  if (route === 'moonMercury') return 'moon';
  if (route === 'mercuryOrbit') return 'mercury';
  return 'earth';
}

function getRocketPool(state: GameState, route: TransportRouteId): bigint {
  const source = getSourceLocation(route);
  return state.locationResources[source].rockets;
}

function setRocketPool(state: GameState, route: TransportRouteId, value: bigint): void {
  const source = getSourceLocation(route);
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

function getRouteCapacityKg(state: GameState, route: TransportRouteId): number {
  if (route === 'earthOrbit') return BALANCE.rocketCapacityLowOrbit;
  if (route === 'earthMoon') return BALANCE.rocketCapacityLunar;
  const massDriverPaused = (state as any).pausedFacilities?.massDriver === true;
  if (route === 'mercuryOrbit') {
    const massDrivers = massDriverPaused ? 0 : fromBigInt(state.locationFacilities.mercury.massDriver);
    const bonus = 1 + (massDrivers * BALANCE.massDriverCapacityMultiplier);
    return BALANCE.rocketCapacityLowOrbit * bonus;
  }

  const massDrivers = massDriverPaused ? 0 : fromBigInt(state.locationFacilities.moon.massDriver);
  const bonus = 1 + (massDrivers * BALANCE.massDriverCapacityMultiplier);
  return BALANCE.rocketCapacityMercury * bonus;
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
  if (launchedRockets !== undefined) return Math.max(0, Math.floor(fromBigInt(launchedRockets)));
  const capacityKg = getRouteCapacityKg(state, route);
  if (capacityKg <= 0) return 0;
  const units = Math.floor(fromBigInt(amount));
  if (units <= 0) return 0;
  const massKg = units * getPayloadWeight(payload);
  return Math.max(0, Math.ceil(massKg / capacityKg));
}

function getSourceRocketFleetCount(state: GameState, source: LocationId): number {
  let total = Math.floor(fromBigInt(state.locationResources[source].rockets));

  const reserved = state.logisticsReservedRockets || { earthOrbit: 0n, earthMoon: 0n, moonMercury: 0n, mercuryOrbit: 0n };
  if (source === 'earth') total += Math.floor(fromBigInt((reserved.earthOrbit || 0n) + (reserved.earthMoon || 0n)));
  if (source === 'moon') total += Math.floor(fromBigInt(reserved.moonMercury || 0n));
  if (source === 'mercury') total += Math.floor(fromBigInt(reserved.mercuryOrbit || 0n));

  for (const batch of state.transportBatches || []) {
    if (!routeMatchesSource(batch.route, source)) continue;
    total += getBatchRocketCount(state, batch.route, batch.payload, batch.amount, batch.launchedRockets);
  }

  for (const batch of state.rocketReturnBatches || []) {
    if (batch.location !== source) continue;
    total += Math.max(0, Math.floor(fromBigInt(batch.amount)));
  }

  return Math.max(0, total);
}

function getRouteLaunchesPerMin(state: GameState, route: TransportRouteId): number {
  const source = getSourceLocation(route);
  const rockets = getSourceRocketFleetCount(state, source);
  return Math.max(10, rockets * 2);
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
  if (!routeUnlocked(state, route)) return;

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

  const capacityKg = getRouteCapacityKg(state, route);

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

    const weight = getPayloadWeight(payload);
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
  if (!routeUnlocked(state, route)) return 0;

  const payloads: TransportPayloadId[] = route === 'earthOrbit'
    ? ['gpuSatellites']
    : route === 'mercuryOrbit'
      ? ['gpuSatellites']
    : route === 'earthMoon'
      ? ['gpus', 'solarPanels', 'robots']
      : ['robots'];

  const capacityKg = getRouteCapacityKg(state, route);
  if (capacityKg <= 0) return 0;

  let rockets = 0;
  for (const payload of payloads) {
    const key = orderKey(route, payload);
    const pendingUnits = Math.floor(fromBigInt(state.logisticsOrders[key] || 0n));
    if (pendingUnits <= 0) continue;
    const weight = getPayloadWeight(payload);
    rockets += Math.ceil((pendingUnits * weight) / capacityKg);
  }
  return rockets;
}

function reserveRocketsForRoute(state: GameState, route: TransportRouteId): void {
  if (!routeUnlocked(state, route)) return;
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

function syncLegacy(state: GameState): void {
  state.gpuCount = state.locationResources.earth.gpus;
  state.rockets = state.locationResources.earth.rockets;
  state.robots = state.locationResources.earth.robots;
  state.solarPanels = state.locationResources.earth.solarPanels;
  state.gpuSatellites = state.locationResources.earth.gpuSatellites;
  state.lunarRobots = state.locationResources.moon.robots;
  state.lunarGPUs = state.locationResources.moon.installedGpus;
  state.lunarSolarPanels = state.locationResources.moon.installedSolarPanels;
  state.mercuryRobots = state.locationResources.mercury.robots;
  reconcileEarthGpuInstallation(state);
}

function autoQueueMercuryOrbitPayload(state: GameState): void {
  if (!routeUnlocked(state, 'mercuryOrbit')) return;
  const produced = state.locationResources.mercury.gpuSatellites;
  if (produced <= 0n) return;

  state.locationResources.mercury.gpuSatellites -= produced;
  const key = orderKey('mercuryOrbit', 'gpuSatellites');
  state.logisticsOrders[key] = (state.logisticsOrders[key] || 0n) + produced;
  state.logisticsSent[key] = (state.logisticsSent[key] || 0n) + produced;
}

export function tickSpace(state: GameState, dtMs: number): void {
  const now = Date.now();
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
  state.orbitalPowerMW = mulB(state.satellites, toBigInt(BALANCE.satellitePowerMW));
  state.dysonSwarmPowerMW = mulB(state.dysonSwarmSatellites, toBigInt(BALANCE.satellitePowerMW));
  state.totalEnergyMW = state.powerSupplyMW + state.lunarPowerSupplyMW + state.mercuryPowerSupplyMW + state.orbitalPowerMW + state.dysonSwarmPowerMW;

  // Mercury depletion progress from mined material
  state.mercuryMassMined = state.locationResources.mercury.material;
  if (state.mercuryMassTotal < BALANCE.mercuryBaseMassTotal) {
    state.mercuryMassTotal = BALANCE.mercuryBaseMassTotal;
  }

  // Legacy visual/flags compatibility
  state.lunarBase = state.completedResearch.includes('payloadToMoon');
  state.mercuryBase = state.completedResearch.includes('payloadToMercury');
  state.lunarMassDriverRate = fromBigInt(state.locationFacilities.moon.massDriver);

  syncLegacy(state);
}

export function schedulePayload(state: GameState, route: TransportRouteId, payload: TransportPayloadId, amount: number): boolean {
  if (!routeUnlocked(state, route)) return false;
  if (amount <= 0) return false;

  const amountB = toBigInt(amount);
  const source = state.locationResources[getSourceLocation(route)];

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

  syncLegacy(state);
  return true;
}

// Compatibility wrappers used by existing code
export function launchSatellite(state: GameState, amount: number): boolean {
  return schedulePayload(state, 'earthOrbit', 'gpuSatellites', amount);
}

export function launchLunarPayload(state: GameState, type: 'robot' | 'solar' | 'gpu', amount: number): boolean {
  if (type === 'robot') return schedulePayload(state, 'earthMoon', 'robots', amount);
  if (type === 'solar') return schedulePayload(state, 'earthMoon', 'solarPanels', amount);
  return schedulePayload(state, 'earthMoon', 'gpus', amount);
}

export function buildLunarBase(state: GameState): boolean {
  if (state.completedResearch.includes('payloadToMoon')) {
    state.lunarBase = true;
    return true;
  }
  return false;
}

export function buildMercuryBase(state: GameState): boolean {
  if (state.completedResearch.includes('payloadToMercury')) {
    state.mercuryBase = true;
    return true;
  }
  return false;
}

export function buildMoonFacility(state: GameState, type: 'mine' | 'datacenter' | 'solarFactory' | 'gpuFactory' | 'massDriver' | 'rocketFactory' | 'gpuSatelliteFactory' | 'robotFactory', amount: number): boolean {
  if (type === 'mine') return buildFacility(state, 'moon', 'materialMine', amount);
  if (type === 'solarFactory') return buildFacility(state, 'moon', 'solarFactory', amount);
  if (type === 'gpuFactory') return buildFacility(state, 'moon', 'gpuFactory', amount);
  if (type === 'massDriver') return buildFacility(state, 'moon', 'massDriver', amount);
  if (type === 'rocketFactory') return buildFacility(state, 'moon', 'rocketFactory', amount);
  if (type === 'gpuSatelliteFactory') return buildFacility(state, 'moon', 'gpuSatelliteFactory', amount);
  if (type === 'robotFactory') return buildFacility(state, 'moon', 'robotFactory', amount);
  // datacenter not used in moon flow now
  return false;
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
    syncLegacy(state);
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
    syncLegacy(state);
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
  syncLegacy(state);
  return true;
}

export function launchVonNeumannProbe(state: GameState): boolean {
  if (!state.completedResearch.includes('vonNeumannProbes') && !state.completedResearch.includes('selfReplicating')) return false;
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
  syncLegacy(state);
  return true;
}
