import './styles/theme.css';
import './styles/panels.css';
import './styles/visuals.css';

import { createInitialState } from './game/GameState.ts';
import { GameLoop } from './game/GameLoop.ts';
import { BALANCE } from './game/BalanceConfig.ts';
import { saveGame, loadGame } from './game/SaveManager.ts';
import { TopBar } from './ui/TopBar.ts';
import { PanelManager } from './ui/PanelManager.ts';
import { JobsPanel } from './ui/panels/JobsPanel.ts';
import { AgentsPanel } from './ui/panels/AgentsPanel.ts';
import { ComputePanel } from './ui/panels/ComputePanel.ts';
import { EnergyPanel } from './ui/panels/EnergyPanel.ts';
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
  panelManager.register('energy', new EnergyPanel(loop.getState()));
}

// Register panels
panelManager.register('jobs', new JobsPanel(state));

// If already post-GPU (loaded from save), show compute + energy/space panels
if (state.isPostGpuTransition) {
  panelManager.register('compute', new ComputePanel(state));
  if (state.completedResearch.includes('spaceRockets1')) {
    panelManager.register('energy', new SpaceEnergyPanel(state));
  } else {
    panelManager.register('energy', new EnergyPanel(state));
  }
} else {
  panelManager.register('agents', new AgentsPanel(state, handleGpuTransition));
}

// If training/research already unlocked (loaded from save), show training panel
if (state.intelligence >= BALANCE.researchUnlockIntel) {
  panelManager.register('training', new TrainingPanel(state));
}

// If supply chain already unlocked (loaded from save), show supply panel
if (state.completedResearch.includes('chipFab1')) {
  panelManager.register('supply', new SupplyPanel(state));
}

// Track whether panels have been added (for mid-game unlocks)
let trainingPanelAdded = state.intelligence >= BALANCE.researchUnlockIntel;
let supplyPanelAdded = state.completedResearch.includes('chipFab1');
let spacePanelAdded = state.completedResearch.includes('spaceRockets1');

// UI update loop
setInterval(() => {
  const s = loop.getState();
  topBar.update(s);
  panelManager.update(s);
  datacenterVisual.update(s);
  earthSurface.update(s);
  earthMoonSpace.update(s);
  ticker.update(s);

  // Check for mid-game training/research unlock
  if (!trainingPanelAdded && s.intelligence >= BALANCE.researchUnlockIntel) {
    panelManager.register('training', new TrainingPanel(s));
    trainingPanelAdded = true;
  }

  // Check for mid-game supply chain unlock
  if (!supplyPanelAdded && s.completedResearch.includes('chipFab1')) {
    panelManager.register('supply', new SupplyPanel(s));
    supplyPanelAdded = true;
  }

  // Check for mid-game space unlock (replace energy with space+energy)
  if (!spacePanelAdded && s.completedResearch.includes('spaceRockets1')) {
    panelManager.replace('energy', new SpaceEnergyPanel(s));
    spacePanelAdded = true;
  }
}, BALANCE.uiUpdateIntervalMs);

// Auto-save
setInterval(() => {
  saveGame(loop.getState());
}, BALANCE.autoSaveIntervalMs);

// Start game
loop.start();
