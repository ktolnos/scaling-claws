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
import { DatacenterInterior } from './ui/visuals/DatacenterInterior.ts';
import { Ticker } from './ui/components/Ticker.ts';

// Load or create state
const state = loadGame() ?? createInitialState();

// Game loop
const loop = new GameLoop(state);

// UI
const topBar = new TopBar(document.getElementById('top-bar')!);
const panelManager = new PanelManager(document.getElementById('panels')!);
const datacenterVisual = new DatacenterInterior(document.getElementById('visual-area')!);
const ticker = new Ticker(document.getElementById('ticker')!);

// GPU transition callback
function handleGpuTransition(): void {
  panelManager.replace('agents', new ComputePanel(loop.getState()));
  panelManager.register('energy', new EnergyPanel(loop.getState()));
}

// Register panels
panelManager.register('jobs', new JobsPanel(state));

// If already post-GPU (loaded from save), show compute + energy panels
if (state.isPostGpuTransition) {
  panelManager.register('compute', new ComputePanel(state));
  panelManager.register('energy', new EnergyPanel(state));
} else {
  panelManager.register('agents', new AgentsPanel(state, handleGpuTransition));
}

// If training already unlocked (loaded from save), show training panel
if (state.milestones.trainingUnlocked) {
  panelManager.register('training', new TrainingPanel(state));
}

// Track whether training panel has been added (for mid-game unlock)
let trainingPanelAdded = state.milestones.trainingUnlocked;

// UI update loop
setInterval(() => {
  const s = loop.getState();
  topBar.update(s);
  panelManager.update(s);
  datacenterVisual.update(s);
  ticker.update(s);

  // Check for mid-game training unlock
  if (!trainingPanelAdded && s.milestones.trainingUnlocked) {
    panelManager.register('training', new TrainingPanel(s));
    trainingPanelAdded = true;
  }
}, BALANCE.uiUpdateIntervalMs);

// Auto-save
setInterval(() => {
  saveGame(loop.getState());
}, BALANCE.autoSaveIntervalMs);

// Start game
loop.start();
