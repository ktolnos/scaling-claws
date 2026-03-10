import type { GameState, LocationId, SupplyResourceId } from '../../game/GameState.ts';

export function isSupplyResourceUnlocked(
  state: GameState,
  location: LocationId,
  resource: SupplyResourceId,
  isActive: boolean,
): boolean {
  if (location === 'moon' && resource === 'rockets') return false;
  if (location === 'mercury' && (resource === 'rockets' || resource === 'gpus' || resource === 'solarPanels' || resource === 'gpuSatellites')) return false;
  if (isActive) return true;

  if (resource === 'labor') {
    if (location === 'earth') {
      return state.unlockedJobs.includes('humanWorker') || state.completedResearch.includes('robotics1');
    }
    if (location === 'moon') {
      return state.completedResearch.includes('payloadToMoon') && state.completedResearch.includes('robotics1');
    }
    return state.completedResearch.includes('payloadToMercury') && state.completedResearch.includes('robotics1');
  }

  if (resource === 'material') {
    if (location === 'earth') {
      return (
        state.completedResearch.includes('solarTechnology') ||
        state.completedResearch.includes('chipManufacturing') ||
        state.completedResearch.includes('robotFactoryEngineering1') ||
        state.completedResearch.includes('rocketry')
      );
    }
    if (location === 'moon') {
      return state.completedResearch.includes('payloadToMoon') && (
        state.completedResearch.includes('moonMineEngineering') ||
        state.completedResearch.includes('moonChipManufacturing') ||
        state.completedResearch.includes('moonRobotics') ||
        state.completedResearch.includes('moonMassDrivers')
      );
    }
    return state.completedResearch.includes('payloadToMercury');
  }

  if (resource === 'solarPanels') {
    if (location === 'earth') return state.completedResearch.includes('solarTechnology');
    if (location === 'moon') return state.completedResearch.includes('payloadToMoon') && state.completedResearch.includes('moonMineEngineering');
    return false;
  }

  if (resource === 'gpus') {
    if (location === 'earth') return state.isPostGpuTransition || state.completedResearch.includes('chipManufacturing');
    if (location === 'moon') return state.completedResearch.includes('payloadToMoon') && state.completedResearch.includes('moonChipManufacturing');
    return false;
  }

  if (resource === 'robots') {
    if (location === 'earth') return state.completedResearch.includes('robotics1');
    if (location === 'moon') return state.completedResearch.includes('payloadToMoon') && state.completedResearch.includes('robotics1');
    return state.completedResearch.includes('payloadToMercury') && state.completedResearch.includes('robotics1');
  }

  if (resource === 'rockets') return location === 'earth' && state.completedResearch.includes('rocketry');

  if (resource === 'gpuSatellites') {
    if (location === 'earth') return state.completedResearch.includes('rocketry');
    if (location === 'moon') return state.completedResearch.includes('moonMassDrivers');
    return false;
  }

  return true;
}
