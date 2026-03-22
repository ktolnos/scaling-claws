import { BALANCE, JOB_ORDER } from '../../game/BalanceConfig.ts';
import type { JobPool, GameState } from '../../game/GameState.ts';
import type { JobType } from '../../game/BalanceConfig.ts';
import { fromBigInt } from '../../game/utils.ts';
import { micMiniSvg, phase1LaptopShellSvg, phase1RackFrontSvg } from '../../assets/sprites.ts';
import type { VisualScene } from './VisualScene.ts';
import { clamp01 } from './lod.ts';
import { createPixiSceneHost, replaceManagedTexture, textureFromCanvas } from './pixiHost.ts';
import type { PixiSceneHost } from './pixiHost.ts';
import { SeededRng } from './seededRng.ts';
import { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js';

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

interface NetworkParticle {
  lane: number;
  progress: number;
  speed: number;
  size: number;
  rotation: number;
}

interface NetworkParticleProjection {
  x: number;
  y: number;
  planeProgress: number;
}

interface CanvasRow {
  firstCenterX: number;
  y: number;
  rackWidth: number;
  rackHeight: number;
  renderCount: number;
  rowGap: number;
  rackStartIndex: number;
}

const GPUS_PER_RACK = 80;
const SLOT_COUNT = 10;
const GPUS_PER_SLOT = 8;
const FRONT_RACK_MIN_CAP = 1;
const FRONT_RACK_MAX_CAP = 96;
const MAX_CANVAS_RACKS = 300;
const TERMINAL_LINE_COUNT = 4;
const FOREGROUND_ROW_BOTTOM_OFFSET_PX = 0;
const BACKGROUND_ROW_BOTTOM_OFFSET_PX = 0;
const SVG_FRONT_ROW_SIDE_PADDING_PX = 5;
const CANVAS_START_ROW_OFFSET_AFTER_SVG = 2;
const ROW_DEPTH_FALLOFF_PER_ROW = 0.87;
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
const NETWORK_PARTICLE_MAX_COUNT = 2000;
const NETWORK_PARTICLE_BASE_COUNT = 4;
const NETWORK_RACKS_FOR_MAX_INTENSITY = 1_000_000;
const NETWORK_PARTICLE_MIN_SPEED = 0.1;
const NETWORK_PARTICLE_MAX_SPEED = 0.2;
const NETWORK_PARTICLE_MIN_SIZE = 30;
const NETWORK_PARTICLE_MAX_SIZE = 30;
const NETWORK_VANISH_Y_RATIO = 0.5;
const NETWORK_PLANE_NEAR_SCALE = 0.08;
const NETWORK_PLANE_FAR_SCALE = 1;
const NETWORK_PLANE_HALF_SPAN_RATIO = 1.7;
const NETWORK_PLANE_TOP_Y_RATIO = -0.55;
const NETWORK_PARTICLE_CULL_ABOVE_FLOOR_PX = 0;
const NETWORK_PARTICLE_SPRITE_WIDTH = 128;
const NETWORK_PARTICLE_SPRITE_HEIGHT = 20;
const DISTANT_GLOW_BASE_ALPHA = 0.08;
const DISTANT_GLOW_MAX_ALPHA = 1;
const DISTANT_GLOW_BASE_RADIUS_X_RATIO = 0.8;
const DISTANT_GLOW_BASE_RADIUS_Y_RATIO = 0.8;
const DISTANT_GLOW_BREATH_X_RATIO = 0.2;
const DISTANT_GLOW_BREATH_Y_RATIO = 0.2;

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

  private host!: PixiSceneHost;
  private sceneEl!: HTMLDivElement;
  private paneGridEl!: HTMLDivElement;
  private micLaneEl!: HTMLDivElement;
  private rackFrontLaneEl!: HTMLDivElement;
  private laptopStageEl!: HTMLDivElement;

  private visible = true;
  private pixiReady = false;
  private pixiWidth = 0;
  private pixiHeight = 0;

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
  private outboundNetworkParticles: NetworkParticle[] = [];
  private inboundNetworkParticles: NetworkParticle[] = [];
  private lastNetworkUpdateAtMs = 0;
  private layoutResizedSinceLastSample = false;
  private pendingFillAnimEnableFrame: number | null = null;
  private lastFrameDrawCalls = 0;
  private lastLayoutWidth = 0;
  private lastLayoutHeight = 0;
  private nextTerminalRenderAtMs = 0;

  private backgroundSprite!: Sprite;
  private glowSprite!: Sprite;
  private rackContainer!: Container;
  private outboundNetworkContainer!: ParticleContainer<Particle>;
  private inboundNetworkContainer!: ParticleContainer<Particle>;
  private backgroundTexture: Texture | null = null;
  private rackTexture: Texture | null = null;
  private networkParticleTexture: Texture | null = null;
  private glowTexture: Texture | null = null;
  private rackSprites: Sprite[] = [];
  private outboundParticleSprites: Particle[] = [];
  private inboundParticleSprites: Particle[] = [];
  private readonly rackRows: CanvasRow[] = [];
  private rackRowCount = 0;
  private readonly networkProjection: NetworkParticleProjection = { x: 0, y: 0, planeProgress: 0 };

  private cursorBlinkMs = 0;
  private cursorVisible = true;

  constructor(seed: number) {
    this.rng = new SeededRng(seed);
  }

  build(root: HTMLElement): void {
    this.host = createPixiSceneHost(root, 'visual-scene dc-scene', 'dc-mass-canvas');
    this.sceneEl = this.host.sceneEl;

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
    void this.host.initPromise.then(() => {
      this.configurePixiStage();
    });
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.sceneEl.classList.toggle('is-hidden', !visible);
  }

  private configurePixiStage(): void {
    const stage = this.host.app.stage;
    stage.removeChildren();

    this.backgroundSprite = new Sprite(Texture.EMPTY);
    this.glowSprite = new Sprite(this.getGlowTexture());
    this.glowSprite.anchor.set(0.5, 0.5);
    this.rackContainer = new Container();
    this.outboundNetworkContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: true,
        vertex: true,
        color: true,
      },
      texture: this.getNetworkParticleTexture(),
    });
    this.inboundNetworkContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: true,
        vertex: true,
        color: true,
      },
      texture: this.getNetworkParticleTexture(),
    });

    stage.addChild(this.backgroundSprite);
    stage.addChild(this.glowSprite);
    stage.addChild(this.outboundNetworkContainer);
    stage.addChild(this.inboundNetworkContainer);
    stage.addChild(this.rackContainer);
    this.pixiReady = true;
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
    if (!this.visible || !this.pixiReady || !this.host.ready) {
      return;
    }

    const nowMs = performance.now();
    this.lastFrameDrawCalls = 0;
    this.renderPixi(nowMs);
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

    this.updateMicMiniLayout(this.host.width);
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
    const sceneWidth = this.host.width;
    const sceneHeight = this.host.height;
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

  private renderPixi(nowMs: number): void {
    const width = this.host.width;
    const height = this.host.height;
    if (width <= 0 || height <= 0) {
      return;
    }

    if (
      this.frontRackFloorY === null ||
      width !== this.lastLayoutWidth ||
      height !== this.lastLayoutHeight
    ) {
      this.updateFrontRackLayout();
    }

    if (width !== this.pixiWidth || height !== this.pixiHeight) {
      this.pixiWidth = width;
      this.pixiHeight = height;
      this.rebuildBackgroundTexture(width, height);
      this.refreshNetworkParticleRotations(width, height);
    }

    const floorY = this.frontRackFloorY ?? (height - BACKGROUND_ROW_BOTTOM_OFFSET_PX);
    const centerX = width * 0.5;
    const convergenceY = height * NETWORK_VANISH_Y_RATIO;

    this.updateGlowSprite(nowMs, centerX, convergenceY, width, height);
    this.updateNetworkSprites(nowMs, centerX, convergenceY, width, height, floorY);
    this.updateRackSprites(centerX, floorY);
    this.host.app.render();
  }

  private updateGlowSprite(
    nowMs: number,
    centerX: number,
    convergenceY: number,
    width: number,
    height: number,
  ): void {
    if (!this.sampledPostGpu || this.sampledTotalRacks <= 0) {
      this.glowSprite.visible = false;
      return;
    }

    const rackGlow = clamp01(Math.log10(Math.max(1, this.sampledTotalRacks) + 1) / 5);
    if (rackGlow <= 0) {
      this.glowSprite.visible = false;
      return;
    }

    const t = nowMs * 0.003;
    const pulseA = Math.sin(t);
    const pulseB = Math.sin((t * 0.61) + 1.7);
    const pulseC = Math.sin((t * 0.37) + 3.1);
    const glowAlpha = DISTANT_GLOW_BASE_ALPHA + ((DISTANT_GLOW_MAX_ALPHA - DISTANT_GLOW_BASE_ALPHA) * rackGlow);
    const glowY = convergenceY;
    const breathX = 1 + (DISTANT_GLOW_BREATH_X_RATIO * ((0.65 * pulseA) + (0.35 * pulseC)));
    const breathY = 1 + (DISTANT_GLOW_BREATH_Y_RATIO * ((0.7 * pulseB) + (0.3 * pulseC)));
    const radiusX = width * DISTANT_GLOW_BASE_RADIUS_X_RATIO * breathX;
    const radiusY = height * DISTANT_GLOW_BASE_RADIUS_Y_RATIO * breathY;
    this.glowSprite.visible = true;
    this.glowSprite.x = centerX;
    this.glowSprite.y = glowY;
    this.glowSprite.width = Math.max(2, radiusX * 2);
    this.glowSprite.height = Math.max(2, radiusY * 2);
    this.glowSprite.alpha = glowAlpha;
    this.lastFrameDrawCalls++;
  }

  private updateNetworkSprites(
    nowMs: number,
    centerX: number,
    convergenceY: number,
    width: number,
    height: number,
    floorY: number,
  ): void {
    if (!this.sampledPostGpu || this.sampledGpus <= 0) {
      this.outboundNetworkParticles.length = 0;
      this.inboundNetworkParticles.length = 0;
      this.lastNetworkUpdateAtMs = 0;
      this.hideUnusedParticles(this.outboundParticleSprites, 0);
      this.hideUnusedParticles(this.inboundParticleSprites, 0);
      return;
    }

    const rackRatio = clamp01(this.sampledTotalRacks / NETWORK_RACKS_FOR_MAX_INTENSITY);
    const intensity = clamp01(Math.sqrt(rackRatio));
    const targetCount = Math.round(
      NETWORK_PARTICLE_BASE_COUNT + ((NETWORK_PARTICLE_MAX_COUNT - NETWORK_PARTICLE_BASE_COUNT) * intensity),
    );

    this.reconcileNetworkParticlePool(this.outboundNetworkParticles, targetCount, false, width, height, false);
    this.reconcileNetworkParticlePool(this.inboundNetworkParticles, targetCount, true, width, height, true);

    const dtSec = this.getNetworkDeltaSeconds(nowMs);
    for (const particle of this.outboundNetworkParticles) {
      particle.progress += particle.speed * dtSec;
      if (particle.progress >= 1) {
        this.resetNetworkParticle(particle, true, false);
        this.updateNetworkParticleRotation(particle, width, height, false);
      }
    }
    for (const particle of this.inboundNetworkParticles) {
      particle.progress -= particle.speed * dtSec;
      if (particle.progress <= 0) {
        this.resetNetworkParticle(particle, true, true);
        this.updateNetworkParticleRotation(particle, width, height, true);
      }
    }

    const maxOpacity = clamp01(Math.log10(Math.max(1, this.sampledTotalRacks) + 1) / 20);
    this.updateNetworkParticlePoolSprites(
      this.outboundNetworkContainer,
      this.outboundParticleSprites,
      this.outboundNetworkParticles,
      centerX,
      convergenceY,
      width,
      height,
      floorY,
      maxOpacity,
      false,
    );
    this.updateNetworkParticlePoolSprites(
      this.inboundNetworkContainer,
      this.inboundParticleSprites,
      this.inboundNetworkParticles,
      centerX,
      convergenceY,
      width,
      height,
      floorY,
      maxOpacity,
      true,
    );
  }

  private reconcileNetworkParticlePool(
    particles: NetworkParticle[],
    targetCount: number,
    spawnAtNearSide: boolean,
    width: number,
    height: number,
    reverseDirection: boolean,
  ): void {
    while (particles.length < targetCount) {
      const particle = this.makeNetworkParticle(false, spawnAtNearSide);
      this.updateNetworkParticleRotation(particle, width, height, reverseDirection);
      particles.push(particle);
    }
    while (particles.length > targetCount) {
      particles.pop();
    }
  }

  private updateNetworkParticlePoolSprites(
    container: ParticleContainer<Particle>,
    spritePool: Particle[],
    particles: NetworkParticle[],
    centerX: number,
    convergenceY: number,
    width: number,
    height: number,
    floorY: number,
    maxOpacity: number,
    _reverseDirection: boolean,
  ): void {
    const cullY = floorY - NETWORK_PARTICLE_CULL_ABOVE_FLOOR_PX;
    const texture = this.getNetworkParticleTexture();
    container.texture = texture;
    this.syncParticlePool(container, spritePool, particles.length, this.createNetworkParticleSprite);
    const scaleX = 1 / Math.max(1, texture.orig.width);
    const scaleY = 1 / Math.max(1, texture.orig.height);
    const projection = this.networkProjection;
    let visibleCount = 0;
    for (let idx = 0; idx < particles.length; idx++) {
      const particle = particles[idx];
      this.projectNetworkParticle(
        centerX,
        convergenceY,
        width,
        height,
        particle.lane,
        particle.progress,
        projection,
      );
      if (projection.y >= cullY) {
        continue;
      }
      const projectedScale = NETWORK_PLANE_NEAR_SCALE
        + ((NETWORK_PLANE_FAR_SCALE - NETWORK_PLANE_NEAR_SCALE) * projection.planeProgress);
      const thickness = Math.max(0.55, particle.size * projectedScale * 0.42);
      const length = Math.max(
        thickness * 2.2,
        particle.size * projectedScale * (2.2 + (3.8 * projection.planeProgress)),
      );
      const sprite = spritePool[visibleCount];
      if (!sprite) {
        continue;
      }
      sprite.x = projection.x;
      sprite.y = projection.y;
      sprite.scaleX = length * scaleX;
      sprite.scaleY = thickness * scaleY;
      sprite.rotation = particle.rotation;
      sprite.alpha = maxOpacity;
      visibleCount++;
      this.lastFrameDrawCalls++;
    }
    this.hideUnusedParticles(spritePool, visibleCount);
  }

  private getNetworkDeltaSeconds(nowMs: number): number {
    if (this.lastNetworkUpdateAtMs <= 0) {
      this.lastNetworkUpdateAtMs = nowMs;
      return 1 / 60;
    }

    const deltaMs = Math.max(0, Math.min(80, nowMs - this.lastNetworkUpdateAtMs));
    this.lastNetworkUpdateAtMs = nowMs;
    return Math.max(1 / 240, deltaMs / 1000);
  }

  private makeNetworkParticle(startAtOrigin: boolean, spawnAtNearSide: boolean): NetworkParticle {
    const particle: NetworkParticle = {
      lane: 0,
      progress: 0,
      speed: NETWORK_PARTICLE_MIN_SPEED,
      size: NETWORK_PARTICLE_MIN_SIZE,
      rotation: 0,
    };
    this.resetNetworkParticle(particle, startAtOrigin, spawnAtNearSide);
    return particle;
  }

  private resetNetworkParticle(
    particle: NetworkParticle,
    startAtOrigin: boolean,
    spawnAtNearSide: boolean,
  ): void {
    const laneRandom = (this.rng.next() * 2) - 1;
    const laneBias = Math.sign(laneRandom) * Math.pow(Math.abs(laneRandom), 0.72);
    particle.lane = laneBias * NETWORK_PLANE_HALF_SPAN_RATIO;
    particle.progress = startAtOrigin ? (spawnAtNearSide ? 1 : 0) : this.rng.next();
    particle.speed = this.rng.nextRange(NETWORK_PARTICLE_MIN_SPEED, NETWORK_PARTICLE_MAX_SPEED);
    particle.size = this.rng.nextRange(NETWORK_PARTICLE_MIN_SIZE, NETWORK_PARTICLE_MAX_SIZE);
  }

  private refreshNetworkParticleRotations(width: number, height: number): void {
    for (const particle of this.outboundNetworkParticles) {
      this.updateNetworkParticleRotation(particle, width, height, false);
    }
    for (const particle of this.inboundNetworkParticles) {
      this.updateNetworkParticleRotation(particle, width, height, true);
    }
  }

  private updateNetworkParticleRotation(
    particle: NetworkParticle,
    width: number,
    height: number,
    reverseDirection: boolean,
  ): void {
    const halfSpan = width * NETWORK_PLANE_HALF_SPAN_RATIO;
    const direction = reverseDirection ? -1 : 1;
    const motionDx = direction * particle.lane * halfSpan;
    const motionDy = direction * ((height * NETWORK_PLANE_TOP_Y_RATIO) - (height * NETWORK_VANISH_Y_RATIO));
    particle.rotation = Math.atan2(motionDy, motionDx);
  }

  private projectNetworkParticle(
    centerX: number,
    convergenceY: number,
    width: number,
    height: number,
    lane: number,
    progress: number,
    out: NetworkParticleProjection,
  ): void {
    const clampedProgress = clamp01(progress);
    const farDepth = Math.max(1.0001, NETWORK_PLANE_FAR_SCALE / Math.max(0.0001, NETWORK_PLANE_NEAR_SCALE));
    const depth = farDepth - ((farDepth - 1) * clampedProgress);
    const projectedScale = NETWORK_PLANE_FAR_SCALE / depth;
    const planeProgress = clamp01(
      (projectedScale - NETWORK_PLANE_NEAR_SCALE)
      / Math.max(0.0001, NETWORK_PLANE_FAR_SCALE - NETWORK_PLANE_NEAR_SCALE),
    );
    const topY = height * NETWORK_PLANE_TOP_Y_RATIO;
    const halfSpan = width * NETWORK_PLANE_HALF_SPAN_RATIO;
    const targetX = centerX + (lane * halfSpan);
    const targetY = topY;
    out.x = centerX + ((targetX - centerX) * planeProgress);
    out.y = convergenceY + ((targetY - convergenceY) * planeProgress);
    out.planeProgress = planeProgress;
  }

  private getNetworkParticleTexture(): Texture {
    if (this.networkParticleTexture) {
      return this.networkParticleTexture;
    }

    const sprite = document.createElement('canvas');
    sprite.width = NETWORK_PARTICLE_SPRITE_WIDTH;
    sprite.height = NETWORK_PARTICLE_SPRITE_HEIGHT;
    const spriteCtx = sprite.getContext('2d');
    if (!spriteCtx) {
      this.networkParticleTexture = Texture.EMPTY;
      return this.networkParticleTexture;
    }

    const gradient = spriteCtx.createLinearGradient(0, 0, sprite.width, 0);
    gradient.addColorStop(0, 'rgba(91, 231, 184, 0)');
    gradient.addColorStop(0.18, 'rgba(91, 231, 184, 0.22)');
    gradient.addColorStop(0.5, 'rgba(91, 231, 184, 1)');
    gradient.addColorStop(0.82, 'rgba(91, 231, 184, 0.22)');
    gradient.addColorStop(1, 'rgba(91, 231, 184, 0)');
    spriteCtx.fillStyle = gradient;
    spriteCtx.beginPath();
    spriteCtx.roundRect(0, 0, sprite.width, sprite.height, sprite.height * 0.5);
    spriteCtx.fill();

    this.networkParticleTexture = textureFromCanvas(sprite);
    return this.networkParticleTexture;
  }

  private updateRackSprites(
    centerX: number,
    floorY: number,
  ): void {
    if (!this.sampledPostGpu) {
      this.hideUnusedPixiSprites(this.rackSprites, 0);
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

    this.rackRowCount = 0;
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
      const fittedCount = Math.max(1, Math.ceil(this.pixiWidth / Math.max(1, rackWidth + rowGap)));
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
      const rowState = this.getRackRow(this.rackRowCount);
      rowState.firstCenterX = firstCenterX;
      rowState.y = y;
      rowState.rackWidth = rackWidth;
      rowState.rackHeight = rackHeight;
      rowState.renderCount = renderCount;
      rowState.rowGap = rowGap;
      rowState.rackStartIndex = drawnRacks;
      this.rackRowCount++;

      drawnRacks += renderCount;
    }

    const fadeStartIndex = MAX_CANVAS_RACKS * CANVAS_FADE_START_RATIO;
    const fadeSpan = Math.max(1, MAX_CANVAS_RACKS - fadeStartIndex);
    let visibleSpriteCount = 0;
    this.syncPixiSpritePool(this.rackContainer, this.rackSprites, drawnRacks, this.createRackSprite);

    for (let rowIdx = this.rackRowCount - 1; rowIdx >= 0; rowIdx--) {
      const row = this.rackRows[rowIdx];
      const rowMidIndex = row.rackStartIndex + (row.renderCount * 0.5);
      const fadeT = clamp01((rowMidIndex - fadeStartIndex) / fadeSpan);
      const rowAlpha = 1 - ((1 - CANVAS_FADE_MIN_ALPHA) * fadeT);

      const step = row.rackWidth + row.rowGap;
      for (let col = 0; col < row.renderCount; col++) {
        const x = row.firstCenterX + (col * step);
        const sprite = this.rackSprites[visibleSpriteCount];
        if (!sprite) {
          continue;
        }
        sprite.visible = true;
        sprite.x = x;
        sprite.y = row.y;
        sprite.width = row.rackWidth;
        sprite.height = row.rackHeight;
        sprite.alpha = rowAlpha;
        visibleSpriteCount++;
        this.lastFrameDrawCalls++;
      }
    }
    this.hideUnusedPixiSprites(this.rackSprites, visibleSpriteCount);
  }

  private rebuildBackgroundTexture(width: number, height: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#04070f');
    bg.addColorStop(0.48, '#08101a');
    bg.addColorStop(1, '#091221');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    this.backgroundTexture = replaceManagedTexture(this.backgroundTexture, textureFromCanvas(canvas));
    this.backgroundSprite.texture = this.backgroundTexture;
    this.backgroundSprite.x = 0;
    this.backgroundSprite.y = 0;
    this.backgroundSprite.width = width;
    this.backgroundSprite.height = height;
    this.lastFrameDrawCalls++;
  }

  private getRackTexture(): Texture {
    if (this.rackTexture) {
      return this.rackTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 118;
    canvas.height = 350;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.rackTexture = Texture.EMPTY;
      return this.rackTexture;
    }

    ctx.fillStyle = '#131e30';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#2e405e';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);

    const indicatorSize = canvas.width * 0.08;
    const indicatorMargin = canvas.width * 0.02;
    ctx.fillStyle = '#5be7b8';
    ctx.fillRect(
      canvas.width - indicatorMargin - indicatorSize,
      indicatorMargin,
      indicatorSize,
      indicatorSize,
    );

    this.rackTexture = textureFromCanvas(canvas);
    return this.rackTexture;
  }

  private getGlowTexture(): Texture {
    if (this.glowTexture) {
      return this.glowTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.glowTexture = Texture.EMPTY;
      return this.glowTexture;
    }

    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(91, 231, 184, 0.65)');
    gradient.addColorStop(0.42, 'rgba(70, 182, 196, 0.28)');
    gradient.addColorStop(0.78, 'rgba(19, 52, 82, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();

    this.glowTexture = textureFromCanvas(canvas);
    return this.glowTexture;
  }

  private getRackRow(index: number): CanvasRow {
    const existing = this.rackRows[index];
    if (existing) {
      return existing;
    }
    const created: CanvasRow = {
      firstCenterX: 0,
      y: 0,
      rackWidth: 0,
      rackHeight: 0,
      renderCount: 0,
      rowGap: 0,
      rackStartIndex: 0,
    };
    this.rackRows.push(created);
    return created;
  }

  private readonly createRackSprite = (): Sprite => {
    const sprite = new Sprite(this.getRackTexture());
    sprite.anchor.set(0.5, 1);
    return sprite;
  };

  private readonly createNetworkParticleSprite = (): Particle => {
    return new Particle({
      texture: this.getNetworkParticleTexture(),
      anchorX: 0.5,
      anchorY: 0.5,
    });
  };

  private syncPixiSpritePool(
    container: Container,
    pool: Sprite[],
    targetCount: number,
    createSprite: () => Sprite,
  ): void {
    while (pool.length < targetCount) {
      const sprite = createSprite();
      container.addChild(sprite);
      pool.push(sprite);
    }
  }

  private syncParticlePool(
    container: ParticleContainer<Particle>,
    pool: Particle[],
    targetCount: number,
    createParticle: () => Particle,
  ): void {
    while (pool.length < targetCount) {
      const particle = createParticle();
      container.addParticle(particle);
      pool.push(particle);
    }
  }

  private hideUnusedPixiSprites(pool: Sprite[], usedCount: number): void {
    for (let i = usedCount; i < pool.length; i++) {
      pool[i].visible = false;
    }
  }

  private hideUnusedParticles(pool: Particle[], usedCount: number): void {
    for (let i = usedCount; i < pool.length; i++) {
      pool[i].alpha = 0;
      pool[i].scaleX = 0;
      pool[i].scaleY = 0;
    }
  }
}
