import { BALANCE } from '../BalanceConfig.ts';
import type { GameState, LocationId, TransportPayloadId, TransportRouteId } from '../GameState.ts';
import { fromBigInt } from '../utils.ts';

export function isTransportRouteUnlocked(state: GameState, route: TransportRouteId): boolean {
  if (route === 'earthOrbit') return state.completedResearch.includes('orbitalLogistics');
  if (route === 'earthMoon') return state.completedResearch.includes('payloadToMoon');
  return state.completedResearch.includes('payloadToMercury');
}

export function getTransportRouteSource(route: TransportRouteId): LocationId {
  if (route === 'moonMercury') return 'moon';
  if (route === 'mercuryOrbit') return 'mercury';
  return 'earth';
}

export function getTransportPayloadWeight(payload: TransportPayloadId): number {
  if (payload === 'robots') return BALANCE.robotWeight;
  if (payload === 'solarPanels') return BALANCE.solarPanelWeight;
  if (payload === 'gpus') return BALANCE.gpuWeight;
  return BALANCE.gpuSatelliteWeight;
}

function isMassDriverPaused(state: GameState): boolean {
  return state.pausedFacilities.massDriver === true;
}

export function getTransportRouteCapacityKg(state: GameState, route: TransportRouteId): number {
  if (route === 'earthOrbit') return BALANCE.rocketCapacityLowOrbit;
  if (route === 'earthMoon') return BALANCE.rocketCapacityLunar;

  const paused = isMassDriverPaused(state);
  if (route === 'mercuryOrbit') {
    const massDrivers = paused ? 0 : fromBigInt(state.locationFacilities.mercury.massDriver);
    return BALANCE.rocketCapacityLowOrbit * (1 + (massDrivers * BALANCE.massDriverCapacityMultiplier));
  }

  const massDrivers = paused ? 0 : fromBigInt(state.locationFacilities.moon.massDriver);
  return BALANCE.rocketCapacityMercury * (1 + (massDrivers * BALANCE.massDriverCapacityMultiplier));
}

export function estimateTransportRockets(
  state: GameState,
  route: TransportRouteId,
  payload: TransportPayloadId,
  amount: bigint,
  launchedRockets?: bigint,
): number {
  if (launchedRockets !== undefined) return Math.max(0, Math.floor(fromBigInt(launchedRockets)));

  const capacityKg = getTransportRouteCapacityKg(state, route);
  if (capacityKg <= 0) return 0;

  const units = Math.floor(fromBigInt(amount));
  if (units <= 0) return 0;

  const massKg = units * getTransportPayloadWeight(payload);
  return Math.max(0, Math.ceil(massKg / capacityKg));
}
