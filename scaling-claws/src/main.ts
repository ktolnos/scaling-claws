import './styles/theme.css';
import './styles/panels.css';
import './styles/visuals.css';
import './styles/dev-overlay.css';

import { createInitialState } from './game/GameState.ts';
import type { GameState } from './game/GameState.ts';
// NOTE: DO NOT add migrations here. The game is in active development and breaking changes to saves are currently acceptable.
import { GameLoop } from './game/GameLoop.ts';
import { BALANCE } from './game/BalanceConfig.ts';
import { saveGame, loadGame } from './game/SaveManager.ts';
import { PanelManager } from './ui/PanelManager.ts';
import type { PanelPlacement } from './ui/PanelManager.ts';
import { createWorkspaceLayout } from './ui/WorkspaceLayout.ts';
import { JobsPanel } from './ui/panels/JobsPanel.ts';
import { ComputePanel } from './ui/panels/ComputePanel.ts';
import { TrainingPanel } from './ui/panels/TrainingPanel.ts';
import { SupplyPanel } from './ui/panels/SupplyPanel.ts';
import { ResourcesPanel } from './ui/panels/ResourcesPanel.ts';
import { LocationPanel } from './ui/panels/LocationPanel.ts';
import { UI_EMOJI } from './ui/emoji.ts';
import { DatacenterInterior } from './ui/visuals/DatacenterInterior.ts';
import { EarthSurface } from './ui/visuals/EarthSurface.ts';
import { EarthMoonSpace } from './ui/visuals/EarthMoonSpace.ts';
import { Ticker } from './ui/components/Ticker.ts';
import { HintOverlay } from './ui/hints/HintOverlay.ts';
import { DevOverlay } from './dev/DevOverlay.ts';
import { setGameRandomSeed } from './game/Random.ts';
import { toBigInt } from './game/utils.ts';

// Load or create state
const initialState = loadGame() ?? createInitialState();
setGameRandomSeed((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0);

// Game loop
const loop = new GameLoop(initialState);

// UI
const topBarEl = document.getElementById('top-bar');
if (topBarEl) {
  topBarEl.classList.add('hidden');
}
const panelContainer = document.getElementById('panels')!;
const visualArea = document.getElementById('visual-area')!;
const { leftRegion, tabsRegion } = createWorkspaceLayout(panelContainer, visualArea, {
  leftPanelWidthPx: 300,
  rightPanelWidthPx: 550,
});
const panelManager = new PanelManager(tabsRegion, { left: leftRegion }, initialState);
const datacenterVisual = new DatacenterInterior(visualArea);
const earthSurface = new EarthSurface(visualArea);
const earthMoonSpace = new EarthMoonSpace(visualArea);
const ticker = new Ticker(document.getElementById('ticker')!);
new HintOverlay(document.body);

const PANEL_LAYOUT = {
  resources: { kind: 'static', region: 'left' },
  jobs: { kind: 'tabs', tab: { emoji: UI_EMOJI.tabJobs, title: 'Jobs' } },
  compute: { kind: 'tabs', tab: { emoji: UI_EMOJI.tabCompute, title: 'Compute' } },
  training: { kind: 'tabs', tab: { emoji: UI_EMOJI.tabResearch, title: 'Research' } },
  supply: { kind: 'tabs', tab: { emoji: UI_EMOJI.earth, title: 'Supply Chain' } },
  moon: { kind: 'tabs', tab: { emoji: UI_EMOJI.moon, title: 'Moon' } },
  mercury: { kind: 'tabs', tab: { emoji: UI_EMOJI.mercury, title: 'Mercury' } },
} as const satisfies Record<string, PanelPlacement>;

// GPU transition callback
function handleGpuTransition(): void {
  const state = loop.getState();
  if (state.isPostGpuTransition && !computePanelActive) {
    panelManager.register('compute', new ComputePanel(state), PANEL_LAYOUT.compute);
    computePanelActive = true;
  }
}

// Track whether panels have been added (for mid-game unlocks)
let trainingPanelAdded = false;
let supplyPanelAdded = false;
let moonPanelAdded = false;
let mercuryPanelAdded = false;
let computePanelActive = false;

function hasSupplyPanelUnlock(state: GameState): boolean {
  return state.isPostGpuTransition &&
    (state.completedResearch.includes('rocketry') || state.datacenters.some((count) => count > 0n));
}

function hasMoonPanelUnlock(state: GameState): boolean {
  return state.isPostGpuTransition && state.completedResearch.includes('payloadToMoon');
}

function hasMercuryPanelUnlock(state: GameState): boolean {
  return state.isPostGpuTransition && state.completedResearch.includes('payloadToMercury');
}

function ensureTabAlerts(state: GameState): void {
  if (!state.tabAlerts) {
    state.tabAlerts = {};
  }
}

function isBuildCapped(count: bigint, limit: number | undefined): boolean {
  if (!limit || limit <= 0) {
    return false;
  }
  return count >= toBigInt(limit);
}

function shouldShowSupplyPowerAlert(state: GameState): boolean {
  const hasEarthPowerDeficit = state.powerDemandMW > state.powerSupplyMW;
  if (!hasEarthPowerDeficit) {
    return false;
  }

  const gasMaxed = isBuildCapped(state.gasPlants, BALANCE.powerPlants.gas.limit);
  const nuclearMaxed = isBuildCapped(state.nuclearPlants, BALANCE.powerPlants.nuclear.limit);
  const solarFarmsBuilt = state.locationResources.earth.installedSolarPanels / toBigInt(BALANCE.solarFarmPanelsPerFarm);
  const solarFarmsMaxed = solarFarmsBuilt >= BigInt(BALANCE.solarFarmLimit);
  const allExpansionPathsMaxed = gasMaxed && nuclearMaxed && solarFarmsMaxed;

  return !allExpansionPathsMaxed;
}

function updateSupplyTabAlert(state: GameState): void {
  ensureTabAlerts(state);
  state.tabAlerts.supply = shouldShowSupplyPowerAlert(state);
}

function configurePanels(state: GameState): void {
  updateSupplyTabAlert(state);
  panelManager.setState(state);
  panelManager.reset();
  panelManager.register('resources', new ResourcesPanel(state, {
    summaryMode: 'leftOverview',
    supplyTitle: null,
  }), PANEL_LAYOUT.resources);

  panelManager.register('jobs', new JobsPanel(state, handleGpuTransition), PANEL_LAYOUT.jobs);

  if (state.isPostGpuTransition) {
    panelManager.register('compute', new ComputePanel(state), PANEL_LAYOUT.compute);
    computePanelActive = true;
  } else {
    computePanelActive = false;
  }

  if (state.intelligence >= BALANCE.researchUnlockIntel) {
    panelManager.register('training', new TrainingPanel(state), PANEL_LAYOUT.training);
  }

  if (hasSupplyPanelUnlock(state)) {
    panelManager.register('supply', new SupplyPanel(state, {
      fixedLocations: ['earth'],
      showLocationHeaders: false,
      showResources: true,
      resourcesTitle: null,
      sectionTitle: 'Facilities',
      logisticsTitle: 'Launching',
      logisticsRoutes: ['earthOrbit', 'earthMoon'],
    }), PANEL_LAYOUT.supply);
  }

  if (hasMoonPanelUnlock(state)) {
    panelManager.register('moon', new LocationPanel(state, 'moon'), PANEL_LAYOUT.moon);
  }

  if (hasMercuryPanelUnlock(state)) {
    panelManager.register('mercury', new LocationPanel(state, 'mercury'), PANEL_LAYOUT.mercury);
  }

  trainingPanelAdded = state.intelligence >= BALANCE.researchUnlockIntel;
  supplyPanelAdded = hasSupplyPanelUnlock(state);
  moonPanelAdded = hasMoonPanelUnlock(state);
  mercuryPanelAdded = hasMercuryPanelUnlock(state);
}

configurePanels(initialState);

// UI update loop
setInterval(() => {
  const s = loop.getState();
  updateSupplyTabAlert(s);

  // Auto-handle GPU transition for non-UI-triggered paths (e.g. dev random/replay).
  if (s.isPostGpuTransition && !computePanelActive) {
    panelManager.register('compute', new ComputePanel(s), PANEL_LAYOUT.compute);
    computePanelActive = true;
  }

  // Check for mid-game training/research unlock
  if (!trainingPanelAdded && s.intelligence >= BALANCE.researchUnlockIntel) {
    panelManager.register('training', new TrainingPanel(s), PANEL_LAYOUT.training);
    trainingPanelAdded = true;
  }

  // Check for mid-game supply chain unlock
  if (!supplyPanelAdded && hasSupplyPanelUnlock(s)) {
    panelManager.register('supply', new SupplyPanel(s, {
      fixedLocations: ['earth'],
      showLocationHeaders: false,
      showResources: true,
      resourcesTitle: null,
      sectionTitle: 'Facilities',
      logisticsTitle: 'Launching',
      logisticsRoutes: ['earthOrbit', 'earthMoon'],
    }), PANEL_LAYOUT.supply);
    supplyPanelAdded = true;
  }

  if (!moonPanelAdded && hasMoonPanelUnlock(s)) {
    panelManager.register('moon', new LocationPanel(s, 'moon'), PANEL_LAYOUT.moon);
    moonPanelAdded = true;
  }

  if (!mercuryPanelAdded && hasMercuryPanelUnlock(s)) {
    panelManager.register('mercury', new LocationPanel(s, 'mercury'), PANEL_LAYOUT.mercury);
    mercuryPanelAdded = true;
  }

  panelManager.update(s);
  datacenterVisual.update(s);
  earthSurface.update(s);
  earthMoonSpace.update(s);
  ticker.update(s);
}, BALANCE.uiUpdateIntervalMs);

// Dev controls overlay
new DevOverlay({
  loop,
  onStateReplaced: (state) => {
    configurePanels(state);
    panelManager.update(state);
    datacenterVisual.update(state);
    earthSurface.update(state);
    earthMoonSpace.update(state);
    ticker.update(state);
  },
});

// Auto-save
setInterval(() => {
  saveGame(loop.getState());
}, BALANCE.autoSaveIntervalMs);

// Start game
loop.start();
