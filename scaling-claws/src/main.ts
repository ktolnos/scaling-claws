import './styles/theme.css';
import './styles/panels.css';
import './styles/visuals.css';

import { createInitialState } from './game/GameState.ts';
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

// Load or create state
const state = loadGame() ?? createInitialState();

// Game loop
const loop = new GameLoop(state);

// UI
const topBar = new TopBar(document.getElementById('top-bar')!);
const panelManager = new PanelManager(document.getElementById('panels')!);
const visualArea = document.getElementById('visual-area')!;
const datacenterVisual = new DatacenterInterior(visualArea);
const earthSurface = new EarthSurface(visualArea);
const earthMoonSpace = new EarthMoonSpace(visualArea);
const ticker = new Ticker(document.getElementById('ticker')!);

// GPU transition callback
function handleGpuTransition(): void {
  panelManager.replace('agents', new ComputePanel(loop.getState()));
}

// Register panels
panelManager.register('jobs', new JobsPanel(state));

// If already post-GPU (loaded from save), show compute + energy panel
if (state.isPostGpuTransition) {
  panelManager.register('compute', new ComputePanel(state));
  if (state.completedResearch.includes('orbitalLogistics') || state.datacenters.some(c => c > 0n)) {
    panelManager.register('energy', new SpaceEnergyPanel(state));
  }
} else {
  panelManager.register('agents', new AgentsPanel(state, handleGpuTransition));
}

// If training/research already unlocked (loaded from save), show training panel
if (state.intelligence >= BALANCE.trainingUnlockIntel) {
  panelManager.register('training', new TrainingPanel(state));
}

// If supply chain already unlocked (loaded from save), show supply panel
if (state.completedResearch.includes('materialProcessing')) {
  panelManager.register('supply', new SupplyPanel(state));
}

// Track whether panels have been added (for mid-game unlocks)
let trainingPanelAdded = state.intelligence >= BALANCE.trainingUnlockIntel;
let supplyPanelAdded = state.completedResearch.includes('materialProcessing');
let energyPanelAdded = state.isPostGpuTransition &&
  (state.completedResearch.includes('orbitalLogistics') || state.datacenters.some(c => c > 0n));

// UI update loop
setInterval(() => {
  const s = loop.getState();

  // Check for mid-game training/research unlock
  if (!trainingPanelAdded && s.intelligence >= BALANCE.trainingUnlockIntel) {
    panelManager.register('training', new TrainingPanel(s));
    trainingPanelAdded = true;
  }

  // Check for mid-game supply chain unlock
  if (!supplyPanelAdded && s.completedResearch.includes('materialProcessing')) {
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

// Auto-save
setInterval(() => {
  saveGame(loop.getState());
}, BALANCE.autoSaveIntervalMs);

// Start game
loop.start();
