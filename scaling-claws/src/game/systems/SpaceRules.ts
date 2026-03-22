import { BALANCE, hasCompletedResearch } from '../BalanceConfig.ts';
import type { GameState, LocationId, TransportPayloadId, TransportRouteId } from '../GameState.ts';
import { fromBigInt } from '../utils.ts';

export function isTransportRouteUnlocked(state: GameState, route: TransportRouteId): boolean {
  if (route === 'earthOrbit') return hasCompletedResearch(state.researchLevels, 'rocketry');
  if (route === 'moonOrbit') {
    return hasCompletedResearch(state.researchLevels, 'rocketry')
      && hasCompletedResearch(state.researchLevels, 'payloadToMoon')
      && hasCompletedResearch(state.researchLevels, 'moonMassDrivers');
  }
  if (route === 'earthMoon') return hasCompletedResearch(state.researchLevels, 'payloadToMoon');
  if (route === 'moonMercury') {
    return hasCompletedResearch(state.researchLevels, 'payloadToMercury')
      && hasCompletedResearch(state.researchLevels, 'moonMassDrivers');
  }
  return hasCompletedResearch(state.researchLevels, 'payloadToMercury');
}

export function getTransportRouteSource(route: TransportRouteId): LocationId {
  if (route === 'moonOrbit') return 'moon';
  if (route === 'moonMercury') return 'moon';
  if (route === 'mercurySun') return 'mercury';
  return 'earth';
}

export function getTransportPayloadWeight(payload: TransportPayloadId): number {
  if (payload === 'robots') return BALANCE.robotWeight;
  if (payload === 'solarPanels') return BALANCE.solarPanelWeight;
  if (payload === 'gpus') return BALANCE.gpuWeight;
  return BALANCE.gpuSatelliteWeight;
}

export function getTransportRouteCapacityKg(state: GameState, route: TransportRouteId): number {
  void state;
  if (route === 'earthOrbit') return BALANCE.rocketCapacityLowOrbit;
  if (route === 'earthMoon') return BALANCE.rocketCapacityLunar;
  if (route === 'moonOrbit') return BALANCE.rocketCapacityMoonMercury;
  if (route === 'moonMercury') return BALANCE.rocketCapacityMoonMercury;
  return BALANCE.rocketCapacityLowOrbit;
}

export function estimateTransportRockets(
  state: GameState,
  route: TransportRouteId,
  payload: TransportPayloadId,
  amount: bigint,
  launchedRockets?: bigint,
): number {
  // Legacy helper name: this now estimates launches rather than literal rocket units.
  if (launchedRockets !== undefined) return Math.max(0, Math.floor(fromBigInt(launchedRockets)));

  const capacityKg = getTransportRouteCapacityKg(state, route);
  if (capacityKg <= 0) return 0;

  const units = Math.floor(fromBigInt(amount));
  if (units <= 0) return 0;

  const massKg = units * getTransportPayloadWeight(payload);
  return Math.max(0, Math.ceil(massKg / capacityKg));
}

