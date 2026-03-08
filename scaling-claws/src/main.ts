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
import { SpaceEnergyPanel } from './ui/panels/SpaceEnergyPanel.ts';
import { ResourcesPanel } from './ui/panels/ResourcesPanel.ts';
import { DatacenterInterior } from './ui/visuals/DatacenterInterior.ts';
import { EarthSurface } from './ui/visuals/EarthSurface.ts';
import { EarthMoonSpace } from './ui/visuals/EarthMoonSpace.ts';
import { Ticker } from './ui/components/Ticker.ts';
import { HintOverlay } from './ui/hints/HintOverlay.ts';
import { DevOverlay } from './dev/DevOverlay.ts';
import { setGameRandomSeed } from './game/Random.ts';

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
  rightPanelWidthPx: 500,
});
const panelManager = new PanelManager(tabsRegion, { left: leftRegion });
const datacenterVisual = new DatacenterInterior(visualArea);
const earthSurface = new EarthSurface(visualArea);
const earthMoonSpace = new EarthMoonSpace(visualArea);
const ticker = new Ticker(document.getElementById('ticker')!);
new HintOverlay(document.body);

const PANEL_LAYOUT = {
  resources: { kind: 'static', region: 'left' },
  jobs: { kind: 'tabs', tab: { emoji: '🗂️', title: 'Jobs' } },
  compute: { kind: 'tabs', tab: { emoji: '🧮', title: 'Compute' } },
  training: { kind: 'tabs', tab: { emoji: '🧪', title: 'Research' } },
  supply: { kind: 'tabs', tab: { emoji: '🏗️', title: 'Supply Chain' } },
  energy: { kind: 'tabs', tab: { emoji: '⚡', title: 'Energy' } },
  space: { kind: 'tabs', tab: { emoji: '🚀', title: 'Space' } },
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
let energyPanelAdded = false;
let spacePanelAdded = false;
let computePanelActive = false;

function hasSupplyPanelUnlock(state: GameState): boolean {
  return (
    state.completedResearch.includes('solarTechnology') ||
    state.completedResearch.includes('chipManufacturing')
  );
}

function hasEnergyPanelUnlock(state: GameState): boolean {
  return state.isPostGpuTransition &&
    (state.completedResearch.includes('rocketry') || state.datacenters.some((count) => count > 0n));
}

function hasSpacePanelUnlock(state: GameState): boolean {
  return state.isPostGpuTransition && state.completedResearch.includes('rocketry');
}

function configurePanels(state: GameState): void {
  panelManager.reset();
  panelManager.register('resources', new ResourcesPanel(state), PANEL_LAYOUT.resources);

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
    panelManager.register('supply', new SupplyPanel(state), PANEL_LAYOUT.supply);
  }

  if (hasEnergyPanelUnlock(state)) {
    panelManager.register('energy', new SpaceEnergyPanel(state, 'energy'), PANEL_LAYOUT.energy);
  }

  if (hasSpacePanelUnlock(state)) {
    panelManager.register('space', new SpaceEnergyPanel(state, 'space'), PANEL_LAYOUT.space);
  }

  trainingPanelAdded = state.intelligence >= BALANCE.researchUnlockIntel;
  supplyPanelAdded = hasSupplyPanelUnlock(state);
  energyPanelAdded = hasEnergyPanelUnlock(state);
  spacePanelAdded = hasSpacePanelUnlock(state);
}

configurePanels(initialState);

// UI update loop
setInterval(() => {
  const s = loop.getState();

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
    panelManager.register('supply', new SupplyPanel(s), PANEL_LAYOUT.supply);
    supplyPanelAdded = true;
  }

  if (!energyPanelAdded && hasEnergyPanelUnlock(s)) {
    panelManager.register('energy', new SpaceEnergyPanel(s, 'energy'), PANEL_LAYOUT.energy);
    energyPanelAdded = true;
  }

  if (!spacePanelAdded && hasSpacePanelUnlock(s)) {
    panelManager.register('space', new SpaceEnergyPanel(s, 'space'), PANEL_LAYOUT.space);
    spacePanelAdded = true;
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
