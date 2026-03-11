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
const FRONT_RACK_CAP = 4;
const MAX_CANVAS_RACKS = 2000;
const TERMINAL_LINE_COUNT = 4;
const SVG_FRONT_ROW_BOTTOM_PX = 30;
const SVG_FRONT_ROW_SIDE_PADDING_PX = 5;
const CANVAS_START_ROW_OFFSET_AFTER_SVG = 0.88;
const ROW_DEPTH_FALLOFF_PER_ROW = 0.95;
const CANVAS_FADE_START_RATIO = 0;
const CANVAS_FADE_MIN_ALPHA = 0;

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
  private farRackCount = 0;
  private frontRackPixelWidth = 182;
  private frontRackPixelHeight = 515;
  private frontRackFloorY: number | null = null;
  private frontRackGapPx = 12;
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

    const directCount = this.sampledPostGpu ? Math.min(this.sampledTotalRacks, FRONT_RACK_CAP) : 0;
    const overflowRackCount = this.sampledPostGpu ? Math.max(0, this.sampledTotalRacks - directCount) : 0;
    this.targetFrontRackCount = this.sampledPostGpu ? Math.max(1, directCount) : 0;
    this.targetFarRackCount = Math.min(MAX_CANVAS_RACKS, overflowRackCount);

    this.reconcileMicMiniLane(this.sampledMicMinis);
    const desiredFrontCount = this.targetFrontRackCount;
    const availableRacks = this.sampledPostGpu ? this.sampledTotalRacks : 0;
    const frontCount = Math.min(desiredFrontCount, availableRacks);

    this.reconcileRackRow(frontCount, this.frontRacks, this.rackFrontLaneEl);
    this.refreshFrontRackMetrics();
    this.updateFrontRackLayout();
    this.syncRackSlotFill();

    const jobs = this.collectJobSamples(state);
    this.reconcilePanes(jobs);
    this.updatePaneTargets(jobs);
  }

  simulate(dtMs: number): void {
    this.farRackCount += (this.targetFarRackCount - this.farRackCount) * Math.min(1, dtMs / 450);

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
  }

  private reconcileRackRow(targetCount: number, rowRefs: FrontRackRefs[], laneEl: HTMLElement): void {
    while (rowRefs.length < targetCount) {
      const rack = this.createFrontRack();
      rowRefs.push(rack);
      laneEl.appendChild(rack.root);
    }

    while (rowRefs.length > targetCount) {
      const stale = rowRefs.pop();
      stale?.root.remove();
    }
  }

  private createFrontRack(): FrontRackRefs {
    const root = document.createElement('div');
    root.className = 'dc-front-rack';
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

  private refreshFrontRackMetrics(): void {
    const rack = this.frontRacks[0];
    if (!rack) {
      this.frontRackFloorY = null;
      return;
    }

    const rect = rack.root.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.frontRackPixelWidth = rect.width;
      this.frontRackPixelHeight = rect.height;
    }

    const sceneRect = this.sceneEl.getBoundingClientRect();
    if (sceneRect.height > 0) {
      const measuredFloorY = rect.bottom - sceneRect.top;
      this.frontRackFloorY = Math.max(0, Math.min(sceneRect.height, measuredFloorY));
    }
  }

  private updateFrontRackLayout(): void {
    const baseGap = Math.max(8, this.frontRackPixelWidth * 0.12);
    const sceneWidth = this.sceneEl.clientWidth;
    const usableWidth = Math.max(0, sceneWidth - (SVG_FRONT_ROW_SIDE_PADDING_PX * 2));
    const rackSlots = Math.max(1, FRONT_RACK_CAP);

    let rowGap = baseGap;
    if (rackSlots > 1 && usableWidth > 0) {
      const filledGap = (usableWidth - (rackSlots * this.frontRackPixelWidth)) / (rackSlots - 1);
      rowGap = Math.max(4, filledGap);
    }

    this.frontRackGapPx = rowGap;
    this.rackFrontLaneEl.style.left = `${SVG_FRONT_ROW_SIDE_PADDING_PX}px`;
    this.rackFrontLaneEl.style.right = `${SVG_FRONT_ROW_SIDE_PADDING_PX}px`;
    this.rackFrontLaneEl.style.bottom = `${SVG_FRONT_ROW_BOTTOM_PX}px`;
    this.rackFrontLaneEl.style.gap = `${rowGap.toFixed(1)}px`;
    this.rackFrontLaneEl.style.justifyContent = 'flex-start';
    this.rackFrontLaneEl.style.transform = 'none';
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
      this.lastLayoutWidth = clientWidth;
      this.lastLayoutHeight = clientHeight;
      this.refreshFrontRackMetrics();
      this.updateFrontRackLayout();
    }

    ctx.setTransform(this.canvasDpr, 0, 0, this.canvasDpr, 0, 0);
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    const width = this.canvasWidth;
    const height = this.canvasHeight;

    const horizonY = height * 0.3;
    const floorY = this.frontRackFloorY ?? (height - SVG_FRONT_ROW_BOTTOM_PX);
    const centerX = width * 0.5;

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#04070f');
    bg.addColorStop(0.48, '#08101a');
    bg.addColorStop(1, '#091221');
    ctx.fillStyle = bg;
    this.fillRect(ctx, 0, 0, width, height);

    this.renderDensityRacks(ctx, centerX, horizonY, floorY);
  }

  private renderDensityRacks(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    horizonY: number,
    floorY: number,
  ): void {
    if (!this.sampledPostGpu) {
      return;
    }

    const firstRowCount = Math.max(1, this.frontRacks.length);
    const firstRackWidth = this.frontRackPixelWidth;
    const firstRackHeight = this.frontRackPixelHeight;
    const svgRowCount = this.frontRacks.length > 0 ? 1 : 0;
    const svgRowsVisible = this.frontRacks.length > 0 ? CANVAS_START_ROW_OFFSET_AFTER_SVG : 0;
    const visibleTotalRackBudget = Math.max(
      firstRowCount,
      Math.min(MAX_CANVAS_RACKS, Math.floor(this.farRackCount) + this.frontRacks.length),
    );
    const canvasRackBudget = Math.max(0, visibleTotalRackBudget - this.frontRacks.length);
    if (canvasRackBudget <= 0) {
      return;
    }

    let totalRowCount = Math.max(1, svgRowCount);
    while (totalRowCount < 2048) {
      const lastLogicalRow = totalRowCount - 1;
      const lastRowWidth = Math.max(firstRowCount, firstRowCount + (2 * Math.floor(lastLogicalRow / 3)));
      if ((lastRowWidth * totalRowCount) >= visibleTotalRackBudget) {
        break;
      }
      totalRowCount++;
    }

    const rowCount = Math.max(1, totalRowCount - svgRowCount);

    const firstGap = this.frontRackGapPx;
    const depthSpan = Math.max(1, floorY - horizonY);

    interface CanvasRow {
      y: number;
      rackWidth: number;
      rackHeight: number;
      renderCount: number;
      rowGap: number;
      rackStartIndex: number;
    }

    const rows: CanvasRow[] = [];
    let drawnRacks = 0;

    for (let row = 0; row < rowCount; row++) {
      if (drawnRacks >= canvasRackBudget) {
        break;
      }

      const logicalRow = row + svgRowsVisible;
      const depth = 1 - Math.pow(ROW_DEPTH_FALLOFF_PER_ROW, logicalRow);
      const scale = 1 - (0.82 * depth);
      const rackWidth = Math.max(1, firstRackWidth * scale);
      const rackHeight = Math.max(3, firstRackHeight * scale);

      const rowBaseCount = firstRowCount + (2 * Math.floor(logicalRow / 3));
      const colCount = Math.max(firstRowCount, rowBaseCount);
      const renderCount = Math.min(colCount, canvasRackBudget - drawnRacks);
      if (renderCount <= 0) {
        break;
      }

      const rowGap = Math.max(2, firstGap * scale);
      const y = floorY - (depth * depthSpan);
      rows.push({ y, rackWidth, rackHeight, renderCount, rowGap, rackStartIndex: drawnRacks });

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
      const oddRowCenterShift = (row.renderCount % 2 === 1) ? 0.5 : 0;
      for (let col = 0; col < row.renderCount; col++) {
        const centerOffset = (col - ((row.renderCount - 1) * 0.5) - oddRowCenterShift) * step;
        const x = centerX + centerOffset;

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
        const indicatorMargin = Math.max(1, row.rackWidth * 0.06);
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
