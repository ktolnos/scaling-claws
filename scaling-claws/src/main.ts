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
import { TopBar } from './ui/TopBar.ts';
import { PanelManager } from './ui/PanelManager.ts';
import { JobsPanel } from './ui/panels/JobsPanel.ts';
import { AgentsPanel } from './ui/panels/AgentsPanel.ts';
import { ComputePanel } from './ui/panels/ComputePanel.ts';
import { TrainingPanel } from './ui/panels/TrainingPanel.ts';
import { SupplyPanel } from './ui/panels/SupplyPanel.ts';
import { SpaceEnergyPanel } from './ui/panels/SpaceEnergyPanel.ts';
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
const topBar = new TopBar(document.getElementById('top-bar')!);
const panelContainer = document.getElementById('panels')!;
let panelManager = new PanelManager(panelContainer);
const visualArea = document.getElementById('visual-area')!;
const datacenterVisual = new DatacenterInterior(visualArea);
const earthSurface = new EarthSurface(visualArea);
const earthMoonSpace = new EarthMoonSpace(visualArea);
const ticker = new Ticker(document.getElementById('ticker')!);
new HintOverlay(document.body);

// GPU transition callback
function handleGpuTransition(): void {
  panelManager.replace('agents', new ComputePanel(loop.getState()));
}

// Track whether panels have been added (for mid-game unlocks)
let trainingPanelAdded = false;
let supplyPanelAdded = false;
let energyPanelAdded = false;
let computePanelActive = false;

function hasSupplyPanelUnlock(state: GameState): boolean {
  return (
    state.completedResearch.includes('solarTechnology') ||
    state.completedResearch.includes('chipManufacturing')
  );
}

function configurePanels(state: GameState): void {
  panelContainer.innerHTML = '';
  panelManager = new PanelManager(panelContainer);

  panelManager.register('jobs', new JobsPanel(state));

  if (state.isPostGpuTransition) {
    panelManager.register('compute', new ComputePanel(state));
    computePanelActive = true;
    if (state.completedResearch.includes('orbitalLogistics') || state.datacenters.some(c => c > 0n)) {
      panelManager.register('energy', new SpaceEnergyPanel(state));
    }
  } else {
    panelManager.register('agents', new AgentsPanel(state, handleGpuTransition));
    computePanelActive = false;
  }

  if (state.intelligence >= BALANCE.trainingUnlockIntel) {
    panelManager.register('training', new TrainingPanel(state));
  }

  if (hasSupplyPanelUnlock(state)) {
    panelManager.register('supply', new SupplyPanel(state));
  }

  trainingPanelAdded = state.intelligence >= BALANCE.trainingUnlockIntel;
  supplyPanelAdded = hasSupplyPanelUnlock(state);
  energyPanelAdded = state.isPostGpuTransition &&
    (state.completedResearch.includes('orbitalLogistics') || state.datacenters.some(c => c > 0n));
}

configurePanels(initialState);

// UI update loop
setInterval(() => {
  const s = loop.getState();

  // Auto-handle GPU transition for non-UI-triggered paths (e.g. dev random/replay).
  if (s.isPostGpuTransition && !computePanelActive) {
    panelManager.replace('agents', new ComputePanel(s));
    computePanelActive = true;
  }

  // Check for mid-game training/research unlock
  if (!trainingPanelAdded && s.intelligence >= BALANCE.trainingUnlockIntel) {
    panelManager.register('training', new TrainingPanel(s));
    trainingPanelAdded = true;
  }

  // Check for mid-game supply chain unlock
  if (!supplyPanelAdded && hasSupplyPanelUnlock(s)) {
    panelManager.register('supply', new SupplyPanel(s));
    supplyPanelAdded = true;
  }

  // Check for mid-game energy unlock (first datacenter or direct orbital unlock)
  if (!energyPanelAdded && (s.datacenters.some(c => c > 0n) || s.completedResearch.includes('orbitalLogistics'))) {
    panelManager.register('energy', new SpaceEnergyPanel(s));
    energyPanelAdded = true;
  }

  topBar.update(s);
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
    topBar.update(state);
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
