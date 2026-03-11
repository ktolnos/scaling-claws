import { BALANCE, JOB_ORDER } from '../../game/BalanceConfig.ts';
import type { JobPool, GameState } from '../../game/GameState.ts';
import type { JobType } from '../../game/BalanceConfig.ts';
import { fromBigInt } from '../../game/utils.ts';
import { micMiniSvg, phase1LaptopShellSvg, phase1RackFrontSvg } from '../../assets/sprites.ts';
import type { VisualScene } from './VisualScene.ts';
import { clamp01 } from './lod.ts';
import { SeededRng } from './seededRng.ts';

interface JobTerminalSample {
  jobType: JobType;
  displayName: string;
  activeCount: number;
  stuckCount: number;
  avgProgress: number;
}

interface TerminalPaneRefs {
  root: HTMLDivElement;
  statEl: HTMLSpanElement;
  lineEls: HTMLDivElement[];
  progressFillEl: HTMLDivElement;
}

interface TerminalPaneState {
  jobType: JobType;
  activeCount: number;
  stuckCount: number;
  avgProgress: number;
  smoothedProgress: number;
  nextLineInMs: number;
  lines: string[];
}

interface FrontRackRefs {
  root: HTMLDivElement;
  slotFillEls: SVGRectElement[];
}

const GPUS_PER_RACK = 80;
const SLOT_COUNT = 10;
const GPUS_PER_SLOT = 8;
const FRONT_RACK_MIN_CAP = 1;
const FRONT_RACK_MAX_CAP = 96;
const MAX_CANVAS_RACKS = 1000;
const TERMINAL_LINE_COUNT = 4;
const FOREGROUND_ROW_BOTTOM_OFFSET_PX = 0;
const BACKGROUND_ROW_BOTTOM_OFFSET_PX = 0;
const SVG_FRONT_ROW_SIDE_PADDING_PX = 5;
const CANVAS_START_ROW_OFFSET_AFTER_SVG = 2;
const ROW_DEPTH_FALLOFF_PER_ROW = 0.94;
const CANVAS_FADE_START_RATIO = 0.5;
const CANVAS_FADE_MIN_ALPHA = 0;
const BACKGROUND_DEPTH_SPAN_RACK_HEIGHT_MULTIPLIER = 1;
const LAPTOP_ASPECT = 820 / 500;
const RACK_ASPECT = 118 / 350;
const LAPTOP_MAX_HEIGHT_RATIO = 0.48;
const LAPTOP_TARGET_WIDTH_RATIO = 0.7;
const LAPTOP_BASE_WIDTH_PX = 610;
const FRONT_RACK_HEIGHT_TO_LAPTOP = 1.2;
const FRONT_RACK_GAP_TO_WIDTH = 0.18;
const MIC_MINI_WIDTH_PX = 52;
const MIC_MINI_HEIGHT_PX = 86;
const MIC_MINI_GAP_PX = 3;
const MIC_MINI_SIDE_OFFSET_PX = -50;

const TERMINAL_BOOT_LINES = [
  'Booting dispatch runtime...',
  'Syncing queue snapshots...',
  'Awaiting next batch.',
  'Terminal online.',
];

const JOB_LINE_VERBS = ['compile', 'train', 'score', 'route', 'nudge', 'ship'];
const JOB_LINE_OBJECTS = ['batch', 'tickets', 'models', 'graphs', 'workers', 'prompts'];

function toWholeCount(value: bigint): number {
  const numeric = fromBigInt(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function averageSampleProgress(pool: JobPool): number {
  const sampleCount = Math.max(0, Math.min(4, toWholeCount(pool.totalCount)));
  if (sampleCount === 0) {
    return 0;
  }

  let sum = 0;
  let contributors = 0;
  for (let idx = 0; idx < sampleCount; idx++) {
    if (pool.samples.stuck[idx]) {
      continue;
    }
    sum += clamp01(pool.samples.progress[idx]);
    contributors++;
  }

  if (contributors <= 0) {
    return 0;
  }
  return sum / contributors;
}

export class DatacenterScene implements VisualScene {
  private readonly rng: SeededRng;

  private sceneEl!: HTMLDivElement;
  private canvasEl!: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private paneGridEl!: HTMLDivElement;
  private micLaneEl!: HTMLDivElement;
  private rackFrontLaneEl!: HTMLDivElement;
  private laptopStageEl!: HTMLDivElement;

  private visible = true;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private canvasDpr = 1;

  private micNodes: HTMLDivElement[] = [];
  private frontRacks: FrontRackRefs[] = [];
  private paneRefs = new Map<JobType, TerminalPaneRefs>();
  private paneState = new Map<JobType, TerminalPaneState>();
  private paneOrder: JobType[] = [];

  private sampledMicMinis = 0;
  private sampledGpus = 0;
  private sampledTotalRacks = 0;
  private sampledPostGpu = false;
  private targetFrontRackCount = 0;
  private targetFarRackCount = 0;
  private frontRowCapacity = FRONT_RACK_MIN_CAP;
  private frontRowSlotCount = FRONT_RACK_MIN_CAP;
  private frontRackPixelWidth = 182;
  private frontRackPixelHeight = 515;
  private frontRackFloorY: number | null = null;
  private frontRackGapPx = 12;
  private laptopPixelWidth = LAPTOP_BASE_WIDTH_PX;
  private laptopUiScale = 1;
  private layoutResizedSinceLastSample = false;
  private pendingFillAnimEnableFrame: number | null = null;
  private lastFrameDrawCalls = 0;
  private lastLayoutWidth = 0;
  private lastLayoutHeight = 0;
  private nextTerminalRenderAtMs = 0;

  private cursorBlinkMs = 0;
  private cursorVisible = true;

  constructor(seed: number) {
    this.rng = new SeededRng(seed);
  }

  build(root: HTMLElement): void {
    this.sceneEl = document.createElement('div');
    this.sceneEl.className = 'visual-scene dc-scene';

    this.canvasEl = document.createElement('canvas');
    this.canvasEl.className = 'dc-mass-canvas';
    this.sceneEl.appendChild(this.canvasEl);
    this.canvasCtx = this.canvasEl.getContext('2d');

    const hero = document.createElement('div');
    hero.className = 'dc-hero-layer';

    const laptopStage = document.createElement('div');
    laptopStage.className = 'dc-laptop-stage';
    this.laptopStageEl = laptopStage;

    const laptopShell = document.createElement('div');
    laptopShell.className = 'dc-laptop-shell';
    laptopShell.innerHTML = phase1LaptopShellSvg;

    const screen = document.createElement('div');
    screen.className = 'dc-terminal-screen';

    this.paneGridEl = document.createElement('div');
    this.paneGridEl.className = 'dc-terminal-grid';
    screen.appendChild(this.paneGridEl);

    laptopShell.appendChild(screen);
    laptopStage.appendChild(laptopShell);
    hero.appendChild(laptopStage);

    this.micLaneEl = document.createElement('div');
    this.micLaneEl.className = 'dc-mic-lane';
    hero.appendChild(this.micLaneEl);

    this.rackFrontLaneEl = document.createElement('div');
    this.rackFrontLaneEl.className = 'dc-front-rack-lane dc-front-rack-lane-front';
    hero.appendChild(this.rackFrontLaneEl);

    this.sceneEl.appendChild(hero);
    root.appendChild(this.sceneEl);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.sceneEl.classList.toggle('is-hidden', !visible);
  }

  sample(state: GameState): void {
    this.sampledPostGpu = state.isPostGpuTransition;
    this.sampledMicMinis = toWholeCount(state.micMiniCount);
    this.sampledGpus = toWholeCount(state.locationResources.earth.gpus);
    this.sampledTotalRacks = this.sampledGpus <= 0 ? 0 : Math.ceil(this.sampledGpus / GPUS_PER_RACK);

    this.updateFrontRackLayout();

    const directCount = this.sampledPostGpu ? Math.min(this.sampledTotalRacks, this.frontRowCapacity) : 0;
    const overflowRackCount = this.sampledPostGpu ? Math.max(0, this.sampledTotalRacks - directCount) : 0;
    this.targetFrontRackCount = this.sampledPostGpu ? Math.max(1, directCount) : 0;
    this.targetFarRackCount = Math.min(MAX_CANVAS_RACKS, overflowRackCount);

    this.reconcileMicMiniLane(this.sampledMicMinis);
    const desiredFrontCount = this.targetFrontRackCount;
    const availableRacks = this.sampledPostGpu ? this.sampledTotalRacks : 0;
    const frontCount = Math.min(desiredFrontCount, availableRacks);

    this.reconcileRackRow(frontCount, this.frontRacks, this.rackFrontLaneEl, this.layoutResizedSinceLastSample);
    if (this.layoutResizedSinceLastSample) {
      this.rackFrontLaneEl.classList.add('dc-front-rack-lane-no-fill-anim');
      if (this.pendingFillAnimEnableFrame !== null) {
        cancelAnimationFrame(this.pendingFillAnimEnableFrame);
      }
      this.pendingFillAnimEnableFrame = requestAnimationFrame(() => {
        this.rackFrontLaneEl.classList.remove('dc-front-rack-lane-no-fill-anim');
        this.pendingFillAnimEnableFrame = null;
      });
    }
    this.updateFrontRackLayout();
    this.layoutResizedSinceLastSample = false;
    this.syncRackSlotFill();

    const jobs = this.collectJobSamples(state);
    this.reconcilePanes(jobs);
    this.updatePaneTargets(jobs);
  }

  simulate(dtMs: number): void {
    this.cursorBlinkMs += dtMs;
    if (this.cursorBlinkMs >= 520) {
      this.cursorBlinkMs = 0;
      this.cursorVisible = !this.cursorVisible;
    }

    for (const jobType of this.paneOrder) {
      const state = this.paneState.get(jobType);
      if (!state) continue;

      state.smoothedProgress += (state.avgProgress - state.smoothedProgress) * Math.min(1, dtMs / 260);
      state.nextLineInMs -= dtMs;
      if (state.nextLineInMs <= 0) {
        this.pushTerminalLine(state, this.makeTerminalLine(state));
        state.nextLineInMs = this.rng.nextRange(450, 1650);
      }
    }
  }

  render(): void {
    if (!this.visible) {
      return;
    }

    this.lastFrameDrawCalls = 0;
    this.renderCanvas();
    const nowMs = performance.now();
    if (nowMs >= this.nextTerminalRenderAtMs) {
      this.renderTerminal();
      this.nextTerminalRenderAtMs = nowMs + 120;
    }
  }

  getDrawCallCount(): number {
    return this.lastFrameDrawCalls;
  }

  private collectJobSamples(state: GameState): JobTerminalSample[] {
    const result: JobTerminalSample[] = [];
    for (const jobType of JOB_ORDER) {
      if (jobType === 'unassigned') {
        continue;
      }

      const jobConfig = BALANCE.jobs[jobType];
      if (jobConfig.workerType !== 'ai') {
        continue;
      }

      const pool = state.agentPools[jobType];
      if (!pool) {
        continue;
      }

      const unlocked = state.unlockedJobs.includes(jobType);
      const totalCount = toWholeCount(pool.totalCount);
      if (!unlocked && totalCount <= 0) {
        continue;
      }

      const idleCount = toWholeCount(pool.idleCount);
      const stuckCount = toWholeCount(pool.stuckCount);
      const activeCount = Math.max(0, totalCount - idleCount);

      result.push({
        jobType,
        displayName: jobConfig.displayName,
        activeCount,
        stuckCount: Math.min(activeCount, stuckCount),
        avgProgress: averageSampleProgress(pool),
      });
    }

    if (result.length === 0) {
      result.push({
        jobType: 'sixxerBasic',
        displayName: BALANCE.jobs.sixxerBasic.displayName,
        activeCount: 0,
        stuckCount: 0,
        avgProgress: 0,
      });
    }
    return result.slice(0, 6);
  }

  private reconcileMicMiniLane(targetCount: number): void {
    while (this.micNodes.length < targetCount) {
      const unit = document.createElement('div');
      unit.className = 'dc-mic-unit';
      unit.innerHTML = micMiniSvg;
      this.micLaneEl.appendChild(unit);
      this.micNodes.push(unit);
    }

    while (this.micNodes.length > targetCount) {
      const stale = this.micNodes.pop();
      stale?.remove();
    }

    this.updateMicMiniLayout(this.sceneEl.clientWidth);
  }

  private reconcileRackRow(
    targetCount: number,
    rowRefs: FrontRackRefs[],
    laneEl: HTMLElement,
    suppressAppearAnimation = false,
  ): void {
    while (rowRefs.length < targetCount) {
      const rack = this.createFrontRack(!suppressAppearAnimation);
      rowRefs.push(rack);
      laneEl.appendChild(rack.root);
    }

    while (rowRefs.length > targetCount) {
      const stale = rowRefs.pop();
      stale?.root.remove();
    }
  }

  private createFrontRack(animateAppear = true): FrontRackRefs {
    const root = document.createElement('div');
    root.className = 'dc-front-rack';
    if (!animateAppear) {
      root.classList.add('dc-front-rack-no-pop');
    }
    root.innerHTML = phase1RackFrontSvg;

    const slotFillEls = Array.from(root.querySelectorAll<SVGRectElement>('rect.phase1-rack-slot-fill'));
    return { root, slotFillEls };
  }

  private syncRackSlotFill(): void {
    let rackIdx = 0;

    for (const rack of this.frontRacks) {
      const rackGpuStart = rackIdx * GPUS_PER_RACK;
      const rackGpuCount = Math.max(0, Math.min(GPUS_PER_RACK, this.sampledGpus - rackGpuStart));

      for (let slotIdx = 0; slotIdx < SLOT_COUNT; slotIdx++) {
        const slotGpuStart = slotIdx * GPUS_PER_SLOT;
        const slotGpuCount = Math.max(0, Math.min(GPUS_PER_SLOT, rackGpuCount - slotGpuStart));
        const fillRatio = slotGpuCount / GPUS_PER_SLOT;
        const fillWidth = (fillRatio * 72).toFixed(2);
        const fillRect = rack.slotFillEls[slotIdx];
        if (!fillRect) {
          continue;
        }
        fillRect.setAttribute('width', fillWidth);
        fillRect.setAttribute('opacity', fillRatio > 0 ? '1' : '0.2');
      }
      rackIdx++;
    }
  }

  private updateFrontRackLayout(): boolean {
    const sceneWidth = this.sceneEl.clientWidth;
    const sceneHeight = this.sceneEl.clientHeight;
    if (sceneWidth <= 0 || sceneHeight <= 0) {
      return false;
    }
    const layoutChanged = sceneWidth !== this.lastLayoutWidth || sceneHeight !== this.lastLayoutHeight;
    if (layoutChanged) {
      this.layoutResizedSinceLastSample = true;
    }

    const maxLaptopHeight = sceneHeight * LAPTOP_MAX_HEIGHT_RATIO;
    const targetLaptopWidth = sceneWidth * LAPTOP_TARGET_WIDTH_RATIO;
    const maxLaptopWidthByHeight = maxLaptopHeight * LAPTOP_ASPECT;
    const laptopWidth = Math.max(1, Math.min(targetLaptopWidth, maxLaptopWidthByHeight));
    this.laptopStageEl.style.width = `${laptopWidth.toFixed(1)}px`;
    this.laptopPixelWidth = laptopWidth;
    const laptopUiScale = Math.max(0.55, Math.min(1.35, laptopWidth / LAPTOP_BASE_WIDTH_PX));
    this.laptopUiScale = laptopUiScale;
    const laptopUiScaleInv = 1 / laptopUiScale;
    this.laptopStageEl.style.setProperty('--dc-laptop-ui-scale', laptopUiScale.toFixed(3));
    this.laptopStageEl.style.setProperty('--dc-laptop-ui-scale-inv', laptopUiScaleInv.toFixed(6));
    this.updateMicMiniLayout(sceneWidth);

    const laptopHeight = laptopWidth / LAPTOP_ASPECT;
    const rackHeight = Math.max(6, laptopHeight * FRONT_RACK_HEIGHT_TO_LAPTOP);
    const rackWidth = Math.max(2, rackHeight * RACK_ASPECT);
    this.frontRackPixelWidth = rackWidth;
    this.frontRackPixelHeight = rackHeight;

    const rowGap = Math.max(2, rackWidth * FRONT_RACK_GAP_TO_WIDTH);
    const usableWidth = Math.max(0, sceneWidth - (SVG_FRONT_ROW_SIDE_PADDING_PX * 2));
    const rackStep = rackWidth + rowGap;
    const fittedCount = rackStep > 0 ? Math.ceil((usableWidth + rowGap) / rackStep) : FRONT_RACK_MIN_CAP;
    let slotCount = Math.max(1, Math.min(FRONT_RACK_MAX_CAP, Math.max(FRONT_RACK_MIN_CAP, fittedCount)));
    if (slotCount > 1 && slotCount % 2 === 0) {
      if (slotCount < FRONT_RACK_MAX_CAP) {
        slotCount += 1;
      } else {
        slotCount -= 1;
      }
    }
    this.frontRowSlotCount = slotCount;
    this.frontRowCapacity = slotCount;

    this.frontRackGapPx = rowGap;
    this.rackFrontLaneEl.style.left = '0';
    this.rackFrontLaneEl.style.right = '0';
    this.rackFrontLaneEl.style.bottom = `${FOREGROUND_ROW_BOTTOM_OFFSET_PX}px`;
    this.rackFrontLaneEl.style.gap = '0';
    this.rackFrontLaneEl.style.justifyContent = 'flex-start';
    this.rackFrontLaneEl.style.transform = 'none';
    this.frontRackFloorY = Math.max(0, sceneHeight - BACKGROUND_ROW_BOTTOM_OFFSET_PX);

    const step = rackWidth + rowGap;
    const centeredLeftMostCenterX = (sceneWidth * 0.5) - (((this.frontRowSlotCount - 1) * step) * 0.5);
    const leftMostCenterX = centeredLeftMostCenterX;
    this.frontRowCapacity = this.frontRowSlotCount;
    for (let idx = 0; idx < this.frontRacks.length; idx++) {
      const rack = this.frontRacks[idx];
      const slotIndex = idx;
      const centerX = leftMostCenterX + (slotIndex * step);
      rack.root.style.width = `${rackWidth.toFixed(1)}px`;
      rack.root.style.position = 'absolute';
      rack.root.style.left = `${(centerX - (rackWidth * 0.5)).toFixed(1)}px`;
      rack.root.style.bottom = '0';
    }
    this.lastLayoutWidth = sceneWidth;
    this.lastLayoutHeight = sceneHeight;
    return layoutChanged;
  }

  private updateMicMiniLayout(sceneWidth: number): void {
    if (sceneWidth <= 0) {
      return;
    }

    const micScale = this.laptopUiScale;
    const micWidth = Math.max(1, MIC_MINI_WIDTH_PX * micScale);
    const micHeight = Math.max(1, MIC_MINI_HEIGHT_PX * micScale);
    const micGap = Math.max(1, MIC_MINI_GAP_PX * micScale);
    const micSideOffset = MIC_MINI_SIDE_OFFSET_PX * micScale;

    const centerX = sceneWidth * 0.5;
    const halfLaptopWidth = this.laptopPixelWidth * 0.5;
    const firstOffset = halfLaptopWidth + micSideOffset + (micWidth * 0.5);
    const step = micWidth + micGap;

    for (let idx = 0; idx < this.micNodes.length; idx++) {
      const node = this.micNodes[idx];
      const side = idx % 2 === 0 ? -1 : 1;
      const sideOrder = Math.floor(idx / 2);
      const center = centerX + (side * (firstOffset + (sideOrder * step)));
      node.style.width = `${micWidth.toFixed(1)}px`;
      node.style.height = `${micHeight.toFixed(1)}px`;
      node.style.position = 'absolute';
      node.style.left = `${(center - (micWidth * 0.5)).toFixed(1)}px`;
      node.style.bottom = '-7px';
    }
  }

  private reconcilePanes(samples: JobTerminalSample[]): void {
    const nextOrder = samples.map(sample => sample.jobType);
    const nextOrderKey = nextOrder.join('|');
    const currentOrderKey = this.paneOrder.join('|');
    if (nextOrderKey === currentOrderKey) {
      return;
    }

    for (const [jobType, refs] of this.paneRefs.entries()) {
      if (!nextOrder.includes(jobType)) {
        refs.root.remove();
        this.paneRefs.delete(jobType);
        this.paneState.delete(jobType);
      }
    }

    for (const sample of samples) {
      if (this.paneRefs.has(sample.jobType)) {
        continue;
      }
      const refs = this.createPane(sample.displayName, sample.jobType);
      this.paneRefs.set(sample.jobType, refs);
      this.paneState.set(sample.jobType, this.createPaneState(sample.jobType));
    }

    for (const jobType of nextOrder) {
      const refs = this.paneRefs.get(jobType);
      if (!refs) {
        continue;
      }
      this.paneGridEl.appendChild(refs.root);
    }

    this.paneOrder = nextOrder;
  }

  private createPane(title: string, jobType: JobType): TerminalPaneRefs {
    const root = document.createElement('div');
    root.className = 'dc-term-pane';
    root.dataset.jobType = jobType;

    const header = document.createElement('div');
    header.className = 'dc-term-pane-head';
    const titleEl = document.createElement('span');
    titleEl.className = 'dc-term-pane-title';
    titleEl.textContent = title;
    header.appendChild(titleEl);

    const statEl = document.createElement('span');
    statEl.className = 'dc-term-pane-stat';
    header.appendChild(statEl);
    root.appendChild(header);

    const linesWrap = document.createElement('div');
    linesWrap.className = 'dc-term-pane-lines';
    const lineEls: HTMLDivElement[] = [];
    for (let idx = 0; idx < TERMINAL_LINE_COUNT; idx++) {
      const line = document.createElement('div');
      line.className = 'dc-term-line';
      linesWrap.appendChild(line);
      lineEls.push(line);
    }
    root.appendChild(linesWrap);

    const progress = document.createElement('div');
    progress.className = 'dc-term-progress';
    const progressFillEl = document.createElement('div');
    progressFillEl.className = 'dc-term-progress-fill';
    progress.appendChild(progressFillEl);
    root.appendChild(progress);

    return {
      root,
      statEl,
      lineEls,
      progressFillEl,
    };
  }

  private createPaneState(jobType: JobType): TerminalPaneState {
    return {
      jobType,
      activeCount: 0,
      stuckCount: 0,
      avgProgress: 0,
      smoothedProgress: 0,
      nextLineInMs: this.rng.nextRange(250, 900),
      lines: [...TERMINAL_BOOT_LINES],
    };
  }

  private updatePaneTargets(samples: JobTerminalSample[]): void {
    for (const sample of samples) {
      const state = this.paneState.get(sample.jobType);
      if (!state) {
        continue;
      }
      state.activeCount = sample.activeCount;
      state.stuckCount = sample.stuckCount;
      state.avgProgress = sample.avgProgress;
    }
  }

  private makeTerminalLine(state: TerminalPaneState): string {
    const verb = JOB_LINE_VERBS[this.rng.nextInt(JOB_LINE_VERBS.length)];
    const obj = JOB_LINE_OBJECTS[this.rng.nextInt(JOB_LINE_OBJECTS.length)];
    const urgency = this.rng.nextInt(10);
    const jobTag = state.jobType.slice(0, 4).padEnd(4, '_');
    const progressPct = Math.floor(state.smoothedProgress * 100);
    const stuckTag = state.stuckCount > 0 && urgency > 6 ? ` warn:${state.stuckCount}` : '';
    const ticket = 1000 + this.rng.nextInt(8999);
    return `#${ticket} ${jobTag} ${verb} ${obj} ${progressPct}% act:${state.activeCount}${stuckTag}`;
  }

  private pushTerminalLine(state: TerminalPaneState, line: string): void {
    state.lines.push(line);
    while (state.lines.length > TERMINAL_LINE_COUNT) {
      state.lines.shift();
    }
  }

  private renderTerminal(): void {
    for (const jobType of this.paneOrder) {
      const refs = this.paneRefs.get(jobType);
      const state = this.paneState.get(jobType);
      if (!refs || !state) {
        continue;
      }

      refs.statEl.textContent = `active ${state.activeCount} | stuck ${state.stuckCount}`;

      for (let idx = 0; idx < TERMINAL_LINE_COUNT; idx++) {
        const baseLine = state.lines[idx] ?? '';
        if (idx === TERMINAL_LINE_COUNT - 1 && this.cursorVisible) {
          refs.lineEls[idx].textContent = `${baseLine} _`;
        } else {
          refs.lineEls[idx].textContent = baseLine;
        }
      }

      const progressPct = Math.round(clamp01(state.smoothedProgress) * 100);
      refs.progressFillEl.style.width = `${progressPct}%`;
    }
  }

  private renderCanvas(): void {
    const ctx = this.canvasCtx;
    if (!ctx) {
      return;
    }

    const clientWidth = this.canvasEl.clientWidth;
    const clientHeight = this.canvasEl.clientHeight;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    if (clientWidth <= 0 || clientHeight <= 0) {
      return;
    }

    if (
      clientWidth !== this.canvasWidth ||
      clientHeight !== this.canvasHeight ||
      dpr !== this.canvasDpr
    ) {
      this.canvasWidth = clientWidth;
      this.canvasHeight = clientHeight;
      this.canvasDpr = dpr;
      this.canvasEl.width = Math.floor(clientWidth * dpr);
      this.canvasEl.height = Math.floor(clientHeight * dpr);
    }

    if (
      this.frontRackFloorY === null ||
      clientWidth !== this.lastLayoutWidth ||
      clientHeight !== this.lastLayoutHeight
    ) {
      this.updateFrontRackLayout();
    }

    ctx.setTransform(this.canvasDpr, 0, 0, this.canvasDpr, 0, 0);
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    const width = this.canvasWidth;
    const height = this.canvasHeight;

    const floorY = this.frontRackFloorY ?? (height - BACKGROUND_ROW_BOTTOM_OFFSET_PX);
    const centerX = width * 0.5;

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#04070f');
    bg.addColorStop(0.48, '#08101a');
    bg.addColorStop(1, '#091221');
    ctx.fillStyle = bg;
    this.fillRect(ctx, 0, 0, width, height);

    this.renderDensityRacks(ctx, centerX, floorY);
  }

  private renderDensityRacks(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    floorY: number,
  ): void {
    if (!this.sampledPostGpu) {
      return;
    }

    const firstRowVisibleCount = Math.max(1, this.frontRacks.length);
    const firstRowSlotCount = Math.max(1, this.frontRowSlotCount);
    const firstRackWidth = this.frontRackPixelWidth;
    const firstRackHeight = this.frontRackPixelHeight;
    const svgRowsVisible = this.frontRacks.length > 0 ? CANVAS_START_ROW_OFFSET_AFTER_SVG : 0;
    const visibleTotalRackBudget = Math.max(
      firstRowVisibleCount,
      Math.min(MAX_CANVAS_RACKS, this.targetFarRackCount + this.frontRacks.length),
    );
    const canvasRackBudget = Math.max(0, visibleTotalRackBudget - this.frontRacks.length);
    if (canvasRackBudget <= 0) {
      return;
    }

    const firstGap = this.frontRackGapPx;
    const depthSpan = Math.max(1, firstRackHeight * BACKGROUND_DEPTH_SPAN_RACK_HEIGHT_MULTIPLIER);

    interface CanvasRow {
      firstCenterX: number;
      y: number;
      rackWidth: number;
      rackHeight: number;
      renderCount: number;
      rowGap: number;
      rackStartIndex: number;
    }

    const rows: CanvasRow[] = [];
    let drawnRacks = 0;

    for (let row = 0; row < 2048; row++) {
      if (drawnRacks >= canvasRackBudget) {
        break;
      }

      const logicalRow = row + svgRowsVisible;
      const depth = 1 - Math.pow(ROW_DEPTH_FALLOFF_PER_ROW, logicalRow);
      const scale = 1 - (0.82 * depth);
      const rackWidth = Math.max(1, firstRackWidth * scale);
      const rackHeight = Math.max(3, firstRackHeight * scale);
      const rowGap = Math.max(2, firstGap * scale);

      const rowBaseCount = firstRowSlotCount + (2 * Math.floor(logicalRow / 3));
      const fittedCount = Math.max(1, Math.ceil(this.canvasWidth / Math.max(1, rackWidth + rowGap)));
      let rowSlotCount = fittedCount + 2;
      if (rowSlotCount > 1 && rowSlotCount % 2 === 0) {
        rowSlotCount += 1;
      }
      const colCount = Math.max(firstRowSlotCount, rowBaseCount, rowSlotCount);
      const remainingBudget = canvasRackBudget - drawnRacks;
      const renderCount = Math.min(colCount, remainingBudget);
      if (renderCount <= 0) {
        break;
      }

      const firstCenterX = centerX - (((colCount - 1) * (rackWidth + rowGap)) * 0.5);
      const y = floorY - (depth * depthSpan);
      rows.push({
        firstCenterX,
        y,
        rackWidth,
        rackHeight,
        renderCount,
        rowGap,
        rackStartIndex: drawnRacks,
      });

      drawnRacks += renderCount;
    }

    const fadeStartIndex = MAX_CANVAS_RACKS * CANVAS_FADE_START_RATIO;
    const fadeSpan = Math.max(1, MAX_CANVAS_RACKS - fadeStartIndex);

    for (let rowIdx = rows.length - 1; rowIdx >= 0; rowIdx--) {
      const row = rows[rowIdx];
      const rowMidIndex = row.rackStartIndex + (row.renderCount * 0.5);
      const fadeT = clamp01((rowMidIndex - fadeStartIndex) / fadeSpan);
      const rowAlpha = 1 - ((1 - CANVAS_FADE_MIN_ALPHA) * fadeT);
      ctx.globalAlpha = rowAlpha;

      const step = row.rackWidth + row.rowGap;
      for (let col = 0; col < row.renderCount; col++) {
        const x = row.firstCenterX + (col * step);

        ctx.fillStyle = '#131e30';
        this.fillRect(ctx, x - (row.rackWidth * 0.5), row.y - row.rackHeight, row.rackWidth, row.rackHeight);
        ctx.strokeStyle = '#2e405e';
        ctx.lineWidth = 1;
        this.strokeRect(
          ctx,
          x - (row.rackWidth * 0.5) + 0.5,
          row.y - row.rackHeight + 0.5,
          Math.max(1, row.rackWidth - 1),
          Math.max(1, row.rackHeight - 1),
        );

        const indicatorSize = Math.max(1, row.rackWidth * 0.08);
        const indicatorMargin = Math.max(1, row.rackWidth * 0.02);
        const indicatorX = x + (row.rackWidth * 0.5) - indicatorMargin - indicatorSize;
        const indicatorY = row.y - row.rackHeight + indicatorMargin;
        ctx.fillStyle = '#5be7b8';
        this.fillRect(
          ctx,
          indicatorX,
          indicatorY,
          indicatorSize,
          indicatorSize,
        );
      }
    }

    ctx.globalAlpha = 1;
  }

  private fillRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    this.lastFrameDrawCalls++;
    ctx.fillRect(x, y, width, height);
  }

  private strokeRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    this.lastFrameDrawCalls++;
    ctx.strokeRect(x, y, width, height);
  }
}
