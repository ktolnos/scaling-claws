import type { GameState } from '../GameState.ts';
import { getTotalGpuCapacity } from '../BalanceConfig.ts';

export function reconcileEarthGpuInstallation(state: GameState): void {
  state.gpuCapacity = getTotalGpuCapacity(state.datacenters);
  state.needsDatacenter = state.gpuCount >= state.gpuCapacity;
  state.installedGpuCount = state.gpuCount < state.gpuCapacity ? state.gpuCount : state.gpuCapacity;
}
