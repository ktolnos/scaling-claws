import { BALANCE } from '../BalanceConfig.ts';
import type { GameState, LocationId, TransportPayloadId, TransportRouteId } from '../GameState.ts';
import { fromBigInt } from '../utils.ts';

export function isTransportRouteUnlocked(state: GameState, route: TransportRouteId): boolean {
  if (route === 'earthOrbit') return state.completedResearch.includes('rocketry');
  if (route === 'moonOrbit') {
    return state.completedResearch.includes('rocketry')
      && state.completedResearch.includes('payloadToMoon')
      && state.completedResearch.includes('moonMassDrivers');
  }
  if (route === 'earthMoon') return state.completedResearch.includes('payloadToMoon');
  if (route === 'moonMercury') return state.completedResearch.includes('payloadToMercury') && state.completedResearch.includes('moonMassDrivers');
  return state.completedResearch.includes('payloadToMercury');
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

