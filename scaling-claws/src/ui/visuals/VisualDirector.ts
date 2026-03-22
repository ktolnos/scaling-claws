import type { GameState } from '../../game/GameState.ts';
import { getCompletedResearchCount } from '../../game/BalanceConfig.ts';
import { VisualClock } from './VisualClock.ts';
import type { VisualScene } from './VisualScene.ts';
import { DatacenterScene } from './DatacenterScene.ts';
import { EarthSurfaceScene } from './EarthSurfaceScene.ts';
import { NearEarthSpaceScene } from './NearEarthSpaceScene.ts';
import { hashSeed } from './seededRng.ts';

export interface VisualPanelPerfStat {
  id: string;
  label: string;
  fps: number;
  renderMs: number;
  drawCalls: number;
  debugLines: string[];
}

export const VISUAL_PLACEHOLDERS = [
  { id: 'mercuryDyson', label: 'Mercury + Dyson' },
  { id: 'moonSurface', label: 'Moon Surface' },
  { id: 'nearEarthSpace', label: 'Near-Earth Space' },
  { id: 'earthSurface', label: 'Earth Surface' },
] as const;

export type VisualPlaceholderId = (typeof VISUAL_PLACEHOLDERS)[number]['id'];

export interface VisualPlaceholderState {
  id: VisualPlaceholderId;
  label: string;
  visible: boolean;
}

interface VisualSceneEntry {
  id: string;
  label: string;
  scene: VisualScene;
  visible: boolean;
  fps: number;
  renderMs: number;
  drawCalls: number;
  frameCount: number;
  renderTimeTotalMs: number;
  drawCallCountTotal: number;
  windowStartMs: number;
}

function hasAnyLocationResources(
  resources: GameState['locationResources']['earth'],
): boolean {
  return resources.material > 0n
    || resources.solarPanels > 0n
    || resources.robots > 0n
    || resources.gpus > 0n
    || resources.rockets > 0n
    || resources.gpuSatellites > 0n
    || resources.labor > 0n
    || resources.probes > 0n
    || resources.installedGpus > 0n
    || resources.installedSolarPanels > 0n;
}

function hasAnyLocationFacilities(
  facilities: GameState['locationFacilities']['earth'],
): boolean {
  return Object.values(facilities).some((count) => count > 0n);
}

function hasEarthSurfaceUnlock(state: GameState): boolean {
  return state.datacenters.some((count) => count > 0n)
    || state.gasPlants > 0n
    || state.nuclearPlants > 0n
    || state.locationResources.earth.installedSolarPanels > 0n
    || hasAnyLocationFacilities(state.locationFacilities.earth);
}

function hasNearEarthSpaceUnlock(state: GameState): boolean {
  const earthLaunchCount = state.earthLaunchCount ?? 0n;
  const earthOrbitLaunchCount = state.earthOrbitLaunchCount ?? 0n;
  const earthMoonLaunchCount = state.earthMoonLaunchCount ?? 0n;
  return earthLaunchCount > 0n
    || earthOrbitLaunchCount > 0n
    || earthMoonLaunchCount > 0n
    || state.satellites > 0n
    || state.transportBatches.some((batch) => batch.route === 'earthOrbit' || batch.route === 'earthMoon')
    || hasAnyLocationResources(state.locationResources.moon);
}

function hasMoonSurfaceUnlock(state: GameState): boolean {
  const earthMoonLaunchCount = state.earthMoonLaunchCount ?? 0n;
  return earthMoonLaunchCount > 0n
    || state.transportBatches.some((batch) => batch.route === 'earthMoon')
    || hasAnyLocationResources(state.locationResources.moon)
    || hasAnyLocationFacilities(state.locationFacilities.moon);
}

function hasMercuryDysonUnlock(state: GameState): boolean {
  const moonMercuryLaunchCount = state.moonMercuryLaunchCount ?? 0n;
  return moonMercuryLaunchCount > 0n
    || state.transportBatches.some((batch) => batch.route === 'moonMercury')
    || hasAnyLocationResources(state.locationResources.mercury)
    || hasAnyLocationFacilities(state.locationFacilities.mercury)
    || state.dysonSwarmSatellites > 0n;
}

function mixSeed(seed: number, value: number): number {
  return hashSeed(seed, value >>> 0);
}

function mixSeedBigInt(seed: number, value: bigint): number {
  let mixed = seed;
  let remaining = value < 0n ? -value : value;
  const mask = 0xffffffffn;
  for (let i = 0; i < 3; i++) {
    mixed = mixSeed(mixed, Number(remaining & mask));
    remaining >>= 32n;
    if (remaining === 0n) {
      break;
    }
  }
  return mixed;
}

function deriveVisualSeed(state: GameState): number {
  let seed = 0x4f3cc25d;
  seed = mixSeed(seed, state.tickCount);
  seed = mixSeed(seed, getCompletedResearchCount(state.researchLevels));
  seed = mixSeed(seed, state.unlockedJobs.length);
  seed = mixSeedBigInt(seed, state.totalEarned);
  seed = mixSeedBigInt(seed, state.locationResources.earth.gpus);
  seed = mixSeedBigInt(seed, state.micMiniCount);
  return seed >>> 0;
}

export class VisualDirector {
  private readonly root: HTMLElement;
  private readonly clock: VisualClock;
  private readonly scenes: VisualSceneEntry[];
  private readonly placeholderSlots = new Map<VisualPlaceholderId, HTMLDivElement>();

  constructor(root: HTMLElement, initialState: GameState) {
    this.root = root;
    this.root.innerHTML = '';

    const sceneRoot = document.createElement('div');
    sceneRoot.className = 'visual-director-root';
    this.root.appendChild(sceneRoot);

    const stack = document.createElement('div');
    stack.className = 'visual-director-stack';
    sceneRoot.appendChild(stack);

    for (const placeholder of VISUAL_PLACEHOLDERS) {
      const slot = document.createElement('div');
      slot.className = 'visual-scene-slot visual-scene-slot-placeholder';
      this.placeholderSlots.set(placeholder.id, slot);
      if (placeholder.id !== 'earthSurface' && placeholder.id !== 'nearEarthSpace') {
        const text = document.createElement('div');
        text.className = 'visual-placeholder-label';
        text.textContent = `${placeholder.label} (placeholder)`;
        slot.appendChild(text);
      }
      stack.appendChild(slot);
    }

    const datacenterSlot = document.createElement('div');
    datacenterSlot.className = 'visual-scene-slot visual-scene-slot-datacenter';
    stack.appendChild(datacenterSlot);

    const datacenterScene = new DatacenterScene(deriveVisualSeed(initialState));
    datacenterScene.build(datacenterSlot);
    datacenterScene.setVisible(true);

    const now = performance.now();
    const nearEarthSpaceSlot = this.placeholderSlots.get('nearEarthSpace');
    const nearEarthSpaceScene = new NearEarthSpaceScene(deriveVisualSeed(initialState));
    if (nearEarthSpaceSlot) {
      nearEarthSpaceSlot.className = 'visual-scene-slot visual-scene-slot-near-earth-space';
      nearEarthSpaceScene.build(nearEarthSpaceSlot);
      nearEarthSpaceScene.setVisible(true);
    }

    const earthSurfaceSlot = this.placeholderSlots.get('earthSurface');
    const earthSurfaceScene = new EarthSurfaceScene(deriveVisualSeed(initialState));
    if (earthSurfaceSlot) {
      earthSurfaceSlot.className = 'visual-scene-slot visual-scene-slot-earth-surface';
      earthSurfaceScene.build(earthSurfaceSlot);
      earthSurfaceScene.setVisible(true);
    }

    this.scenes = [
      {
        id: 'nearEarthSpace',
        label: 'Near-Earth Space',
        scene: nearEarthSpaceScene,
        visible: true,
        fps: 0,
        renderMs: 0,
        drawCalls: 0,
        frameCount: 0,
        renderTimeTotalMs: 0,
        drawCallCountTotal: 0,
        windowStartMs: now,
      },
      {
        id: 'earthSurface',
        label: 'Earth Surface',
        scene: earthSurfaceScene,
        visible: true,
        fps: 0,
        renderMs: 0,
        drawCalls: 0,
        frameCount: 0,
        renderTimeTotalMs: 0,
        drawCallCountTotal: 0,
        windowStartMs: now,
      },
      {
        id: 'datacenter',
        label: 'Datacenter',
        scene: datacenterScene,
        visible: true,
        fps: 0,
        renderMs: 0,
        drawCalls: 0,
        frameCount: 0,
        renderTimeTotalMs: 0,
        drawCallCountTotal: 0,
        windowStartMs: now,
      },
    ];

    this.clock = new VisualClock({
      fixedStepMs: 1000 / 60,
      renderStepMs: 1000 / 60,
      maxCatchUpSteps: 6,
      onSimulate: (dtMs: number) => {
        for (const entry of this.scenes) {
          if (!entry.visible) {
            continue;
          }
          entry.scene.simulate(dtMs);
        }
      },
      onRender: () => {
        const nowMs = performance.now();
        for (const entry of this.scenes) {
          if (!entry.visible) {
            continue;
          }
          const renderStartMs = performance.now();
          entry.scene.render();
          const renderDurationMs = performance.now() - renderStartMs;
          const drawCalls = entry.scene.getDrawCallCount?.() ?? 0;
          entry.frameCount += 1;
          entry.renderTimeTotalMs += renderDurationMs;
          entry.drawCallCountTotal += drawCalls;

          const windowElapsedMs = nowMs - entry.windowStartMs;
          if (windowElapsedMs >= 1000) {
            entry.fps = entry.frameCount > 0 ? ((entry.frameCount * 1000) / windowElapsedMs) : 0;
            entry.renderMs = entry.frameCount > 0 ? (entry.renderTimeTotalMs / entry.frameCount) : 0;
            entry.drawCalls = entry.frameCount > 0 ? Math.round(entry.drawCallCountTotal / entry.frameCount) : 0;
            entry.frameCount = 0;
            entry.renderTimeTotalMs = 0;
            entry.drawCallCountTotal = 0;
            entry.windowStartMs = nowMs;
          }
        }
      },
    });

    this.syncProgressVisibility(initialState);
  }

  start(): void {
    this.clock.start();
  }

  stop(): void {
    this.clock.stop();
  }

  sample(state: GameState): void {
    this.syncProgressVisibility(state);
    for (const entry of this.scenes) {
      entry.scene.sample(state);
    }
  }

  private syncProgressVisibility(state: GameState): void {
    this.setPlaceholderVisible('earthSurface', hasEarthSurfaceUnlock(state));
    this.setPlaceholderVisible('nearEarthSpace', hasNearEarthSpaceUnlock(state));
    this.setPlaceholderVisible('moonSurface', hasMoonSurfaceUnlock(state));
    this.setPlaceholderVisible('mercuryDyson', hasMercuryDysonUnlock(state));
  }

  getPanelPerfStats(): ReadonlyArray<VisualPanelPerfStat> {
    return this.scenes.map(entry => ({
      id: entry.id,
      label: entry.label,
      fps: entry.fps,
      renderMs: entry.renderMs,
      drawCalls: entry.drawCalls,
      debugLines: entry.scene.getDebugLines?.() ?? [],
    }));
  }

  setPlaceholderVisible(id: VisualPlaceholderId, visible: boolean): void {
    const slot = this.placeholderSlots.get(id);
    if (!slot) {
      return;
    }
    slot.classList.toggle('is-hidden', !visible);
    const sceneEntry = this.scenes.find(entry => entry.id === id);
    if (sceneEntry) {
      sceneEntry.visible = visible;
      sceneEntry.scene.setVisible(visible);
      if (!visible) {
        sceneEntry.frameCount = 0;
        sceneEntry.renderTimeTotalMs = 0;
        sceneEntry.drawCallCountTotal = 0;
        sceneEntry.fps = 0;
        sceneEntry.renderMs = 0;
        sceneEntry.drawCalls = 0;
        sceneEntry.windowStartMs = performance.now();
      }
    }
  }

  getPlaceholderStates(): ReadonlyArray<VisualPlaceholderState> {
    return VISUAL_PLACEHOLDERS.map(placeholder => {
      const slot = this.placeholderSlots.get(placeholder.id);
      const visible = slot ? !slot.classList.contains('is-hidden') : false;
      return {
        id: placeholder.id,
        label: placeholder.label,
        visible,
      };
    });
  }
}
