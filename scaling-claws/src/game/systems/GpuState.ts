import type { GameState } from '../GameState.ts';
import { getTotalGpuCapacity } from '../BalanceConfig.ts';

export function reconcileEarthGpuInstallation(state: GameState): void {
  const earthGpuCount = state.locationResources.earth.gpus;
  state.gpuCapacity = getTotalGpuCapacity(state.datacenters);
  state.needsDatacenter = earthGpuCount >= state.gpuCapacity;
  state.installedGpuCount = earthGpuCount < state.gpuCapacity ? earthGpuCount : state.gpuCapacity;
}
