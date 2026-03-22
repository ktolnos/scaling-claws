import { hasCompletedResearch } from '../../game/BalanceConfig.ts';
import type { GameState, LocationId, SupplyResourceId } from '../../game/GameState.ts';

export function isSupplyResourceUnlocked(
  state: GameState,
  location: LocationId,
  resource: SupplyResourceId,
  isActive: boolean,
): boolean {
  if (location === 'moon' && resource === 'rockets') return false;
  if (location === 'mercury' && (resource === 'rockets' || resource === 'gpus' || resource === 'solarPanels' || resource === 'gpuSatellites')) return false;
  if ((location === 'earth' || location === 'moon') && resource === 'probes') return false;
  if (isActive) return true;

  if (resource === 'labor') {
    if (location === 'earth') {
      return state.unlockedJobs.includes('humanWorker') || hasCompletedResearch(state.researchLevels, 'robotics1');
    }
    if (location === 'moon') {
      return hasCompletedResearch(state.researchLevels, 'payloadToMoon') && hasCompletedResearch(state.researchLevels, 'robotics1');
    }
    return hasCompletedResearch(state.researchLevels, 'payloadToMercury') && hasCompletedResearch(state.researchLevels, 'robotics1');
  }

  if (resource === 'material') {
    if (location === 'earth') {
      return (
        hasCompletedResearch(state.researchLevels, 'solarTechnology') ||
        hasCompletedResearch(state.researchLevels, 'chipManufacturing') ||
        hasCompletedResearch(state.researchLevels, 'robotFactoryEngineering1') ||
        hasCompletedResearch(state.researchLevels, 'rocketry')
      );
    }
    if (location === 'moon') {
      return hasCompletedResearch(state.researchLevels, 'payloadToMoon') && (
        hasCompletedResearch(state.researchLevels, 'moonMineEngineering') ||
        hasCompletedResearch(state.researchLevels, 'moonChipManufacturing') ||
        hasCompletedResearch(state.researchLevels, 'moonRobotics') ||
        hasCompletedResearch(state.researchLevels, 'moonMassDrivers')
      );
    }
    return hasCompletedResearch(state.researchLevels, 'payloadToMercury');
  }

  if (resource === 'solarPanels') {
    if (location === 'earth') return hasCompletedResearch(state.researchLevels, 'solarTechnology');
    if (location === 'moon') return hasCompletedResearch(state.researchLevels, 'payloadToMoon') && hasCompletedResearch(state.researchLevels, 'moonMineEngineering');
    return false;
  }

  if (resource === 'gpus') {
    if (location === 'earth') return state.isPostGpuTransition || hasCompletedResearch(state.researchLevels, 'chipManufacturing');
    if (location === 'moon') return hasCompletedResearch(state.researchLevels, 'payloadToMoon') && hasCompletedResearch(state.researchLevels, 'moonChipManufacturing');
    return false;
  }

  if (resource === 'robots') {
    if (location === 'earth') return hasCompletedResearch(state.researchLevels, 'robotics1');
    if (location === 'moon') return hasCompletedResearch(state.researchLevels, 'payloadToMoon') && hasCompletedResearch(state.researchLevels, 'robotics1');
    return hasCompletedResearch(state.researchLevels, 'payloadToMercury') && hasCompletedResearch(state.researchLevels, 'robotics1');
  }

  if (resource === 'rockets') return location === 'earth' && hasCompletedResearch(state.researchLevels, 'rocketry');

  if (resource === 'gpuSatellites') {
    if (location === 'earth') return hasCompletedResearch(state.researchLevels, 'rocketry');
    if (location === 'moon') return hasCompletedResearch(state.researchLevels, 'moonMassDrivers');
    return false;
  }

  if (resource === 'probes') {
    return location === 'mercury' && hasCompletedResearch(state.researchLevels, 'vonNeumannProbes');
  }

  return true;
}
