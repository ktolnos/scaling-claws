import type { GameLoop } from '../game/GameLoop.ts';
import {
  BALANCE,
  getHumanWorkforceRemaining,
  getHumanSalaryPerMin,
  getNextTier,
  getTrainingDataPurchaseCost,
  getTrainingDataRemainingPurchaseCapGB,
} from '../game/BalanceConfig.ts';
import { createInitialState, getTotalAssignedAgents } from '../game/GameState.ts';
import type { GameState } from '../game/GameState.ts';
import type { HumanJobType } from '../game/BalanceConfig.ts';
import type { GameAction } from '../game/ActionDispatcher.ts';
import { addActionObserver, dispatchGameActionWithSource } from '../game/ActionDispatcher.ts';
import { mulB, scaleBigInt } from '../game/utils.ts';
import { getGameRandomSeed, setGameRandomSeed } from '../game/Random.ts';
import { cloneGameState } from './StateClone.ts';
import { deserializeGameState, serializeGameState } from '../game/SaveManager.ts';

interface RecordedAction {
  atOffsetMs: number;
  action: GameAction;
}

interface PersistedReplayV1 {
  version: 1;
  recordingStartTimeMs: number;
  recordingStartRandomSeed: number;
  recordedActions: RecordedAction[];
}

interface PersistedDevOverlayV1 {
  version: 1;
  paused: boolean;
}

interface Snapshot {
  atTimeMs: number;
  state: GameState;
  randomSeed: number;
}

interface DevOverlayOptions {
  loop: GameLoop;
  onStateReplaced: (state: GameState) => void;
}

const DEV_REPLAY_STORAGE_KEY = 'scaling-claws.dev-replay.v1';
const DEV_OVERLAY_STORAGE_KEY = 'scaling-claws.dev-overlay.v1';

const GAME_ACTION_TYPES = new Set([
  'hireAgent',
  'upgradeTier',
  'buyMicMini',
  'goSelfHosted',
  'buyGpu',
  'upgradeModel',
  'buyDatacenter',
  'setApiPrice',
  'buyAds',
  'setComputeAllocations',
  'improveApi',
  'unlockApi',
  'nudgeAgent',
  'assignAgentsToJob',
  'removeAgentsFromJob',
  'hireHumanWorkers',
  'fireHumanWorkers',
  'buyRobotWorkers',
  'fireRobotWorkers',
  'buyTrainingData',
  'startFineTune',
  'startAriesTraining',
  'setTrainingAllocation',
  'purchaseResearch',
  'buyGridPower',
  'sellGridPower',
  'buyGasPlant',
  'buyNuclearPlant',
  'schedulePayload',
  'installSolarPanels',
  'installMoonGpus',
  'launchVonNeumannProbe',
  'buildFacility',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidGameAction(value: unknown): value is GameAction {
  if (!isObject(value)) return false;
  const type = value.type;
  return typeof type === 'string' && GAME_ACTION_TYPES.has(type);
}

export class DevOverlay {
  private readonly loop: GameLoop;
  private readonly onStateReplaced: (state: GameState) => void;

  private root!: HTMLDivElement;
  private body!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private pauseBtn!: HTMLButtonElement;
  private copyStateBtn!: HTMLButtonElement;
  private pasteStateBtn!: HTMLButtonElement;
  private randomBtn!: HTMLButtonElement;
  private replayBtn!: HTMLButtonElement;
  private replayPauseBtn!: HTMLButtonElement;
  private replayStopBtn!: HTMLButtonElement;
  private speedButtons = new Map<number, HTMLButtonElement>();
  private clipboardStatus: string = '';

  private minimized = false;
  private randomPlaying = false;
  private replaying = false;
  private replayPaused = false;
  private replayIndex = 0;
  private replayElapsedMs = 0;
  private randomElapsedMs = 0;
  private readonly randomIntervalMs = 250;

  private recordingStartTimeMs: number;
  private recordingStartRandomSeed: number;
  private recordedActions: RecordedAction[] = [];

  private snapshots: Snapshot[] = [];
  private nextSnapshotAtMs = 0;
  private readonly snapshotEveryMs = 2000;
  private readonly snapshotRetentionMs = 20 * 60 * 1000;
  private readonly maxSnapshots = 600;

  private unsubscribeActionObserver: (() => void) | null = null;
  private unsubscribeTick: (() => void) | null = null;
  private statusIntervalId: number | null = null;

  constructor(options: DevOverlayOptions) {
    this.loop = options.loop;
    this.onStateReplaced = options.onStateReplaced;
    this.recordingStartTimeMs = this.loop.getState().time;
    this.recordingStartRandomSeed = getGameRandomSeed();
    this.loadPersistedReplay();
    this.loadPersistedOverlayState();

    this.buildUi();
    this.attachObservers();
    this.resetSnapshots(this.loop.getState());
    this.refreshUi();
  }

  private buildUi(): void {
    this.root = document.createElement('div');
    this.root.className = 'dev-overlay';

    const header = document.createElement('div');
    header.className = 'dev-overlay-header';

    const title = document.createElement('div');
    title.className = 'dev-overlay-title';
    title.textContent = 'DEV';

    const minBtn = document.createElement('button');
    minBtn.className = 'dev-overlay-btn dev-overlay-min-btn';
    minBtn.textContent = '−';
    minBtn.title = 'Minimize';
    minBtn.addEventListener('click', () => {
      this.minimized = !this.minimized;
      this.root.classList.toggle('minimized', this.minimized);
      minBtn.textContent = this.minimized ? '+' : '−';
      minBtn.title = this.minimized ? 'Expand' : 'Minimize';
    });

    header.appendChild(title);
    header.appendChild(minBtn);
    this.root.appendChild(header);

    this.body = document.createElement('div');
    this.body.className = 'dev-overlay-body';

    const rowTop = document.createElement('div');
    rowTop.className = 'dev-overlay-row';

    this.pauseBtn = this.makeButton('Pause', () => {
      this.setLoopPaused(!this.loop.isPaused());
      this.refreshUi();
    });
    rowTop.appendChild(this.pauseBtn);

    this.replayBtn = this.makeButton('Restart + Replay', () => {
      this.restartAndReplay();
    });
    rowTop.appendChild(this.replayBtn);

    this.randomBtn = this.makeButton('Random: OFF', () => {
      this.randomPlaying = !this.randomPlaying;
      if (this.randomPlaying) {
        this.replaying = false;
        this.replayPaused = false;
      }
      this.refreshUi();
    });
    rowTop.appendChild(this.randomBtn);

    this.replayPauseBtn = this.makeButton('Pause Replay', () => {
      if (!this.replaying) return;
      this.replayPaused = !this.replayPaused;
      this.refreshUi();
    });
    rowTop.appendChild(this.replayPauseBtn);

    this.replayStopBtn = this.makeButton('Stop Replay', () => {
      this.stopReplay(false);
      this.refreshUi();
    });
    rowTop.appendChild(this.replayStopBtn);

    this.body.appendChild(rowTop);

    const rowState = document.createElement('div');
    rowState.className = 'dev-overlay-row';
    this.copyStateBtn = this.makeButton('Copy State', () => {
      void this.copyStateToClipboard();
    });
    rowState.appendChild(this.copyStateBtn);
    this.pasteStateBtn = this.makeButton('Paste State', () => {
      void this.pasteStateFromClipboard();
    });
    rowState.appendChild(this.pasteStateBtn);
    this.body.appendChild(rowState);

    const rowRollback = document.createElement('div');
    rowRollback.className = 'dev-overlay-row';
    rowRollback.appendChild(this.makeButton('↶1s', () => this.rollbackMs(1000)));
    rowRollback.appendChild(this.makeButton('↶10s', () => this.rollbackMs(10000)));
    rowRollback.appendChild(this.makeButton('↶1m', () => this.rollbackMs(60000)));
    rowRollback.appendChild(this.makeButton('↶10m', () => this.rollbackMs(600000)));
    this.body.appendChild(rowRollback);

    const rowSpeed = document.createElement('div');
    rowSpeed.className = 'dev-overlay-row';
    const speedValues = [1, 2, 4, 20, 100];
    for (const speed of speedValues) {
      const btn = this.makeButton(`${speed}x`, () => {
        this.loop.setSpeedMultiplier(speed);
        this.refreshUi();
      });
      this.speedButtons.set(speed, btn);
      rowSpeed.appendChild(btn);
    }
    this.body.appendChild(rowSpeed);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'dev-overlay-status';
    this.body.appendChild(this.statusEl);

    this.root.appendChild(this.body);
    document.body.appendChild(this.root);
  }

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'dev-overlay-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private attachObservers(): void {
    this.unsubscribeActionObserver = addActionObserver((event) => {
      if (event.source !== 'user') return;
      const offset = event.atTimeMs - this.recordingStartTimeMs;
      const actionCopy = JSON.parse(JSON.stringify(event.action)) as GameAction;
      this.recordedActions.push({ atOffsetMs: offset, action: actionCopy });
      this.persistReplay();
    });

    this.unsubscribeTick = this.loop.addTickListener((state, dtMs) => {
      this.captureSnapshots(state);
      this.runReplayTick(dtMs);
      this.runRandomTick(dtMs);
    });

    this.statusIntervalId = window.setInterval(() => {
      this.refreshUi();
    }, 200);
  }

  dispose(): void {
    if (this.unsubscribeActionObserver) this.unsubscribeActionObserver();
    if (this.unsubscribeTick) this.unsubscribeTick();
    if (this.statusIntervalId !== null) window.clearInterval(this.statusIntervalId);
    this.root.remove();
  }

  private captureSnapshots(state: GameState): void {
    while (state.time >= this.nextSnapshotAtMs) {
      this.snapshots.push({
        atTimeMs: this.nextSnapshotAtMs,
        state: cloneGameState(state),
        randomSeed: getGameRandomSeed(),
      });
      this.nextSnapshotAtMs += this.snapshotEveryMs;
    }
    this.pruneSnapshots(state.time);
  }

  private resetSnapshots(state: GameState): void {
    this.snapshots = [{ atTimeMs: state.time, state: cloneGameState(state), randomSeed: getGameRandomSeed() }];
    this.nextSnapshotAtMs = Math.floor(state.time / this.snapshotEveryMs) * this.snapshotEveryMs + this.snapshotEveryMs;
  }

  private pruneSnapshots(nowTimeMs: number): void {
    const minAllowedTime = nowTimeMs - this.snapshotRetentionMs;
    while (this.snapshots.length > 1 && this.snapshots[0].atTimeMs < minAllowedTime) {
      this.snapshots.shift();
    }
    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  private rollbackMs(amountMs: number): void {
    const state = this.loop.getState();
    const targetTime = Math.max(0, state.time - amountMs);
    let chosen = this.snapshots[0];
    for (const snap of this.snapshots) {
      if (snap.atTimeMs <= targetTime) {
        chosen = snap;
      } else {
        break;
      }
    }
    if (!chosen) return;

    const restored = cloneGameState(chosen.state);
    this.loop.setState(restored);
    setGameRandomSeed(chosen.randomSeed);
    this.onStateReplaced(restored);
    this.setLoopPaused(true);
    this.randomPlaying = false;
    this.stopReplay();
    this.randomElapsedMs = 0;

    this.snapshots = this.snapshots.filter((snap) => snap.atTimeMs <= restored.time);
    if (this.snapshots.length === 0 || this.snapshots[this.snapshots.length - 1].atTimeMs !== restored.time) {
      this.snapshots.push({ atTimeMs: restored.time, state: cloneGameState(restored), randomSeed: getGameRandomSeed() });
    }
    this.pruneSnapshots(restored.time);
    this.nextSnapshotAtMs = Math.floor(restored.time / this.snapshotEveryMs) * this.snapshotEveryMs + this.snapshotEveryMs;
    this.refreshUi();
  }

  private restartAndReplay(): void {
    setGameRandomSeed(this.recordingStartRandomSeed);

    const newState = createInitialState();
    this.loop.setState(newState);
    this.onStateReplaced(newState);
    this.setLoopPaused(false);
    this.randomPlaying = false;
    this.replaying = this.recordedActions.length > 0;
    this.replayPaused = false;
    this.replayIndex = 0;
    this.replayElapsedMs = 0;
    this.randomElapsedMs = 0;
    this.resetSnapshots(newState);
    if (!this.replaying) {
      // No recorded actions means replay is immediately finished.
      this.setLoopPaused(true);
      this.refreshUi();
      return;
    }
    // Apply immediate actions so replay visibly starts right away.
    this.runReplayTick(0);
    this.refreshUi();
  }

  private runReplayTick(dtMs: number): void {
    if (this.replayPaused) return;
    if (!this.replaying) return;
    this.replayElapsedMs += dtMs;

    while (this.replayIndex < this.recordedActions.length) {
      const nextAction = this.recordedActions[this.replayIndex];
      if (nextAction.atOffsetMs > this.replayElapsedMs) break;
      this.dispatchProgrammatic(nextAction.action);
      this.replayIndex++;
    }

    if (this.replayIndex >= this.recordedActions.length) {
      this.finishReplay();
    }
  }

  private finishReplay(): void {
    this.stopReplay(false);
    this.setLoopPaused(true);
  }

  private stopReplay(pauseGame = false): void {
    this.replaying = false;
    this.replayPaused = false;
    this.replayIndex = 0;
    this.replayElapsedMs = 0;
    if (pauseGame) {
      this.setLoopPaused(true);
    }
  }

  private setLoopPaused(paused: boolean): void {
    this.loop.setPaused(paused);
    this.persistOverlayState();
  }

  private runRandomTick(dtMs: number): void {
    if (!this.randomPlaying) return;
    this.randomElapsedMs += dtMs;
    while (this.randomElapsedMs >= this.randomIntervalMs) {
      this.randomElapsedMs -= this.randomIntervalMs;
      this.runOneRandomAction();
    }
  }

  private runOneRandomAction(): void {
    const state = this.loop.getState();
    const priorityAction = this.getPriorityAction(state);
    if (priorityAction) {
      const priorityResult = this.dispatchProgrammatic(priorityAction);
      if (priorityResult.ok) return;
    }

    const actions = this.buildRandomActionPool(state);
    if (actions.length <= 0) return;

    // Shuffle once and try each candidate at most once this cycle.
    for (let i = actions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = actions[i];
      actions[i] = actions[j];
      actions[j] = tmp;
    }

    for (const action of actions) {
      const actionResult = this.dispatchProgrammatic(action);
      if (actionResult.ok) return;
    }
  }

  private getPriorityAction(state: GameState): GameAction | null {
    const trainingRunActive = state.currentFineTuneIndex >= 0 || state.ariesModelIndex >= 0;
    const inferencePct = state.apiUnlocked ? state.apiInferenceAllocationPct : 0;
    const maxTrainingPct = Math.max(0, 100 - inferencePct);
    const targetTrainingPct = Math.min(20, maxTrainingPct);

    const ensureTrainingAllocation = (): GameAction | null => {
      if (targetTrainingPct <= 0) return null;
      if (state.trainingAllocationPct > 0) return null;
      return {
        type: 'setComputeAllocations',
        trainingPct: targetTrainingPct,
        inferencePct,
      };
    };

    if (trainingRunActive) {
      return ensureTrainingAllocation();
    }

    const nextFineTuneIdx = this.getNextFineTuneIndex(state);
    if (nextFineTuneIdx !== null && this.canStartFineTune(state, nextFineTuneIdx)) {
      const allocationAction = ensureTrainingAllocation();
      if (allocationAction) return allocationAction;
      return { type: 'startFineTune', index: nextFineTuneIdx };
    }

    const nextAriesIdx = this.getNextAriesIndex(state);
    if (nextAriesIdx !== null && this.canStartAries(state, nextAriesIdx)) {
      const allocationAction = ensureTrainingAllocation();
      if (allocationAction) return allocationAction;
      return { type: 'startAriesTraining', index: nextAriesIdx };
    }

    return null;
  }

  private getNextFineTuneIndex(state: GameState): number | null {
    for (let i = 0; i < BALANCE.fineTunes.length; i++) {
      if (!state.completedFineTunes.includes(i)) return i;
    }
    return null;
  }

  private canStartFineTune(state: GameState, index: number): boolean {
    if (index < 0 || index >= BALANCE.fineTunes.length) return false;
    if (state.completedFineTunes.includes(index)) return false;
    if (state.currentFineTuneIndex >= 0 || state.ariesModelIndex >= 0) return false;

    const ft = BALANCE.fineTunes[index];
    if (state.trainingData < ft.dataGB) return false;
    if (ft.codeReq > 0n && state.code < ft.codeReq) return false;
    if (ft.scienceReq > 0n && state.science < ft.scienceReq) return false;

    for (let i = 0; i < index; i++) {
      if (!state.completedFineTunes.includes(i)) return false;
    }
    return true;
  }

  private getNextAriesIndex(state: GameState): number | null {
    for (let i = 0; i < BALANCE.ariesModels.length; i++) {
      if (state.intelligence < BALANCE.ariesModels[i].intel) return i;
    }
    return null;
  }

  private canStartAries(state: GameState, index: number): boolean {
    if (index < 0 || index >= BALANCE.ariesModels.length) return false;
    if (state.currentFineTuneIndex >= 0 || state.ariesModelIndex >= 0) return false;
    if (state.completedFineTunes.length < BALANCE.fineTunes.length) return false;

    if (index > 0) {
      const prev = BALANCE.ariesModels[index - 1];
      if (state.intelligence < prev.intel) return false;
    }

    const am = BALANCE.ariesModels[index];
    if (state.trainingData < am.dataGB) return false;
    if (am.codeReq > 0n && state.code < am.codeReq) return false;
    if (am.scienceReq > 0n && state.science < am.scienceReq) return false;
    return true;
  }

  private buildRandomActionPool(state: GameState): GameAction[] {
    const actions: GameAction[] = [];
    const nextTier = getNextTier(state.subscriptionTier);
    const assigned = getTotalAssignedAgents(state);
    const unassigned = state.agentPools.unassigned.totalCount;
    const hasUnassigned = unassigned > 0n;
    const hasFreeActiveSlots = state.activeAgentCount > assigned;

    if (!state.isPostGpuTransition) {
      const tier = BALANCE.tiers[state.subscriptionTier];
      let tierUpgradeCost: bigint | null = null;

      if (nextTier) {
        const next = BALANCE.tiers[nextTier];
        const deltaCostPerAgent = next.cost - tier.cost;
        if (deltaCostPerAgent > 0n) {
          tierUpgradeCost = mulB(deltaCostPerAgent, state.totalAgents);
          if (state.funds >= tierUpgradeCost) {
            actions.push({ type: 'upgradeTier', tier: nextTier });
          }
        }
      }

      // Keep savings for next tier so random mode doesn't starve upgrades by over-hiring.
      const reserveForUpgrade = tierUpgradeCost ?? 0n;
      const spendableFunds = state.funds > reserveForUpgrade ? state.funds - reserveForUpgrade : 0n;

      if (spendableFunds >= tier.cost) {
        actions.push({ type: 'hireAgent', amount: 1 });
      }

      if (state.micMiniCount < BigInt(BALANCE.micMini.limit) && spendableFunds >= BALANCE.micMini.cost) {
        actions.push({ type: 'buyMicMini', amount: 1 });
      }

      if (state.intelligence >= BALANCE.selfHostedUnlockIntel) {
        const minGpus = BALANCE.models[0].minGpus;
        const gpuCount = minGpus > state.totalAgents ? minGpus : state.totalAgents;
        const selfHostedCost = mulB(gpuCount, state.gpuMarketPrice);
        if (state.funds >= selfHostedCost) {
          actions.push({ type: 'goSelfHosted' });
        }
      }
    } else {
      if (state.intelligence >= BALANCE.trainingUnlockIntel) {
        const purchasedGB = Math.max(0, Math.floor(state.trainingDataPurchases));
        const remainingPurchaseCapGB = getTrainingDataRemainingPurchaseCapGB(purchasedGB);
        if (remainingPurchaseCapGB > 0) {
          const preferredAmount = Math.min(10, remainingPurchaseCapGB);
          const preferredCost = getTrainingDataPurchaseCost(preferredAmount);
          if (state.funds >= preferredCost) {
            actions.push({ type: 'buyTrainingData', amountGB: preferredAmount });
          } else {
            const singleCost = getTrainingDataPurchaseCost(1);
            if (state.funds >= singleCost) {
              actions.push({ type: 'buyTrainingData', amountGB: 1 });
            }
          }
        }
      }

      const nextModelIndex = state.currentModelIndex + 1;
      if (nextModelIndex < BALANCE.models.length) {
        const nextModel = BALANCE.models[nextModelIndex];
        if (state.installedGpuCount >= nextModel.minGpus) {
          actions.push({ type: 'upgradeModel', modelIndex: nextModelIndex });
        }
      }

      if (state.funds >= state.gpuMarketPrice) {
        actions.push({ type: 'buyGpu', amount: 1 });
      }

      const dc0 = BALANCE.datacenters[0];
      const dc0Limit = dc0.limit ?? 0;
      const underDc0Limit = dc0Limit <= 0 || state.datacenters[0] < BigInt(dc0Limit);
      if (underDc0Limit && state.funds >= dc0.cost && state.locationResources.earth.labor >= dc0.laborCost) {
        actions.push({ type: 'buyDatacenter', tier: 0, amount: 1 });
      }

      const gridLimit = BALANCE.gridPowerKWLimit ?? 0;
      const underGridLimit = gridLimit <= 0 || state.gridPowerKW < BigInt(gridLimit);
      if (underGridLimit && state.funds >= BigInt(BALANCE.gridPowerKWCost) * 1000n) {
        actions.push({ type: 'buyGridPower', amountKW: 1000 });
      }

      const gasLimit = BALANCE.powerPlants.gas.limit ?? 0;
      const underGasLimit = gasLimit <= 0 || state.gasPlants < BigInt(gasLimit);
      if (underGasLimit &&
        state.funds >= BALANCE.powerPlants.gas.cost &&
        state.locationResources.earth.labor >= BALANCE.powerPlants.gas.laborCost) {
        actions.push({ type: 'buyGasPlant', amount: 1 });
      }

      if (state.apiUnlocked) {
        if (state.funds >= BALANCE.apiAdCost) {
          actions.push({ type: 'buyAds', amount: 1 });
        }
        if (state.code >= BALANCE.apiImproveCodeCost) {
          actions.push({ type: 'improveApi', amount: 1 });
        }
      } else {
        if (state.intelligence >= BALANCE.apiUnlockIntel && state.code >= BALANCE.apiUnlockCode) {
          actions.push({ type: 'unlockApi' });
        }
      }
    }

    if (hasUnassigned && hasFreeActiveSlots) {
      const aiJobs = state.unlockedJobs.filter((jobType) => jobType !== 'unassigned' && BALANCE.jobs[jobType].workerType === 'ai');
      if (aiJobs.length > 0) {
        const pick = aiJobs[Math.floor(Math.random() * aiJobs.length)];
        actions.push({ type: 'assignAgentsToJob', jobType: pick, amount: 1 });
      }
    }

    const occupiedJobs = state.unlockedJobs.filter((jobType) => jobType !== 'unassigned' && state.agentPools[jobType].totalCount > 0n);
    if (occupiedJobs.length > 0) {
      const pick = occupiedJobs[Math.floor(Math.random() * occupiedJobs.length)];
      actions.push({ type: 'removeAgentsFromJob', jobType: pick, amount: 1 });
    }

    let totalPaidHumans = 0n;
    for (const jobType of state.unlockedJobs) {
      const job = BALANCE.jobs[jobType];
      if (job.workerType === 'human' && job.salaryPerMin) {
        totalPaidHumans += state.humanPools[jobType].totalCount;
      }
    }

    const hireableHumanJobs = state.unlockedJobs.filter((jobType) => {
      if (jobType === 'robotWorker') return false;
      const job = BALANCE.jobs[jobType];
      if (job.workerType !== 'human') return false;
      const hireCost = job.hireCost ?? 0n;
      if (state.funds < hireCost) return false;
      const currentPool = state.humanPools[jobType];
      if (getHumanWorkforceRemaining(totalPaidHumans) <= 0n) return false;

      const currentJobSalary = getHumanSalaryPerMin(jobType as HumanJobType, currentPool.totalCount, totalPaidHumans);
      const projectedJobSalary = getHumanSalaryPerMin(
        jobType as HumanJobType,
        currentPool.totalCount + scaleBigInt(1n),
        totalPaidHumans + scaleBigInt(1n),
      );
      const projectedHumanSalary = state.humanSalaryPerMin - currentJobSalary + projectedJobSalary;
      // Keep hiring conservative in random mode:
      // 1) salary must stay covered by income,
      // 2) keep at least 1 minute of projected salary runway in cash after the hire.
      if (projectedHumanSalary > state.incomePerMin) return false;
      const fundsAfterHire = state.funds - hireCost;
      return fundsAfterHire >= projectedHumanSalary;
    });
    if (hireableHumanJobs.length > 0) {
      const pick = hireableHumanJobs[Math.floor(Math.random() * hireableHumanJobs.length)];
      actions.push({ type: 'hireHumanWorkers', jobType: pick, amount: 1 });
    }

    if (state.stuckCount > 0n) {
      actions.push({ type: 'nudgeAgent' });
    }
    return actions;
  }

  private dispatchProgrammatic(action: GameAction) {
    return dispatchGameActionWithSource(this.loop.getState(), action, 'programmatic');
  }

  private async copyStateToClipboard(): Promise<void> {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        this.clipboardStatus = 'Clipboard write unavailable';
        return;
      }
      const serialized = serializeGameState(this.loop.getState());
      await navigator.clipboard.writeText(serialized);
      this.clipboardStatus = 'State copied';
    } catch {
      this.clipboardStatus = 'Copy failed';
    } finally {
      this.refreshUi();
    }
  }

  private async pasteStateFromClipboard(): Promise<void> {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
        this.clipboardStatus = 'Clipboard read unavailable';
        return;
      }

      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        this.clipboardStatus = 'Clipboard is empty';
        return;
      }

      const parsed = deserializeGameState(text) as unknown;
      if (!this.isLikelyGameState(parsed)) {
        this.clipboardStatus = 'Clipboard does not contain a valid state';
        return;
      }

      const newState = parsed as GameState;
      this.loop.setState(newState);
      this.onStateReplaced(newState);
      this.setLoopPaused(true);
      this.randomPlaying = false;
      this.stopReplay();
      this.randomElapsedMs = 0;
      this.resetSnapshots(newState);
      this.clipboardStatus = 'State loaded';
    } catch {
      this.clipboardStatus = 'Paste failed';
    } finally {
      this.refreshUi();
    }
  }

  private isLikelyGameState(value: unknown): value is GameState {
    if (!isObject(value)) return false;
    if (typeof value.time !== 'number') return false;
    if (!isObject(value.locationResources)) return false;
    if (!isObject(value.locationFacilities)) return false;
    if (!isObject(value.agentPools)) return false;
    if (typeof value.apiUnlocked !== 'boolean') return false;
    return true;
  }

  private loadPersistedReplay(): void {
    try {
      const raw = localStorage.getItem(DEV_REPLAY_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as unknown;
      if (!isObject(parsed) || parsed.version !== 1) return;

      const startTime = parsed.recordingStartTimeMs;
      const startSeed = parsed.recordingStartRandomSeed;
      const actions = parsed.recordedActions;
      if (typeof startTime !== 'number' || !Number.isFinite(startTime)) return;
      if (typeof startSeed !== 'number' || !Number.isFinite(startSeed)) return;
      if (!Array.isArray(actions)) return;

      const validActions: RecordedAction[] = [];
      for (const item of actions) {
        if (!isObject(item)) continue;
        const atOffsetMs = item.atOffsetMs;
        const action = item.action;
        if (typeof atOffsetMs !== 'number' || !Number.isFinite(atOffsetMs) || atOffsetMs < 0) continue;
        if (!isValidGameAction(action)) continue;
        validActions.push({ atOffsetMs, action });
      }

      this.recordingStartTimeMs = startTime;
      this.recordingStartRandomSeed = startSeed >>> 0;
      this.recordedActions = validActions.sort((a, b) => a.atOffsetMs - b.atOffsetMs);
    } catch {
      // Ignore malformed payloads and continue with an empty in-memory recording.
    }
  }

  private loadPersistedOverlayState(): void {
    try {
      const raw = localStorage.getItem(DEV_OVERLAY_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as unknown;
      if (!isObject(parsed) || parsed.version !== 1) return;

      const paused = parsed.paused;
      if (typeof paused !== 'boolean') return;
      this.loop.setPaused(paused);
    } catch {
      // Ignore malformed payloads and continue with default overlay state.
    }
  }

  private persistOverlayState(): void {
    const payload: PersistedDevOverlayV1 = {
      version: 1,
      paused: this.loop.isPaused(),
    };
    try {
      localStorage.setItem(DEV_OVERLAY_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage write failures (quota/privacy mode).
    }
  }

  private persistReplay(): void {
    const payload: PersistedReplayV1 = {
      version: 1,
      recordingStartTimeMs: this.recordingStartTimeMs,
      recordingStartRandomSeed: this.recordingStartRandomSeed >>> 0,
      recordedActions: this.recordedActions,
    };
    try {
      localStorage.setItem(DEV_REPLAY_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage write failures (quota/privacy mode).
    }
  }

  private refreshUi(): void {
    const state = this.loop.getState();
    this.pauseBtn.textContent = this.loop.isPaused() ? 'Resume' : 'Pause';
    this.randomBtn.textContent = this.randomPlaying ? 'Random: ON' : 'Random: OFF';
    this.replayBtn.disabled = false;
    this.replayPauseBtn.textContent = this.replayPaused ? 'Resume Replay' : 'Pause Replay';
    this.replayPauseBtn.disabled = !this.replaying;
    this.replayStopBtn.disabled = !this.replaying;

    const currentSpeed = this.loop.getSpeedMultiplier();
    for (const [speed, btn] of this.speedButtons) {
      btn.classList.toggle('active', speed === currentSpeed);
    }

    const replayState = this.replaying
      ? `Replay ${this.replayPaused ? 'paused ' : ''}${this.replayIndex}/${this.recordedActions.length}`
      : 'Replay idle';
    const clipboardState = this.clipboardStatus ? ` | ${this.clipboardStatus}` : '';
    this.statusEl.textContent =
      `t=${Math.floor(state.time / 1000)}s | speed=${currentSpeed}x | actions=${this.recordedActions.length} | snapshots=${this.snapshots.length} | ${replayState}${clipboardState}`;
  }
}
