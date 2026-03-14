import { BALANCE } from '../../game/BalanceConfig.ts';
import type { GameState } from '../../game/GameState.ts';
import { fromBigInt } from '../../game/utils.ts';
import {
  datacenterBuildingSvg,
  datacenterLargeSvg,
  datacenterMegaSvg,
  datacenterMediumSvg,
  gasPlantSvg,
  gpuFactorySvg,
  gpuSatelliteFactorySvg,
  nuclearPlantSvg,
  robotFactorySvg,
  rocketSiloSvg,
  siliconMineSvg,
  solarFarmSvg,
  solarPanelFactorySvg,
} from '../../assets/sprites.ts';
import type { VisualScene } from './VisualScene.ts';
import { clamp01 } from './lod.ts';
import { SeededRng } from './seededRng.ts';

type BuildingKey =
  | 'rocket'
  | 'mine'
  | 'solar'
  | 'gas'
  | 'solarFactory'
  | 'gpuFactory'
  | 'gpuSatelliteFactory'
  | 'robot'
  | 'datacenterSmall'
  | 'nuclear'
  | 'datacenterMedium'
  | 'datacenterLarge'
  | 'datacenterMega';

interface BuildingConfig {
  key: BuildingKey;
  svg: string;
  columnWeight: number;
  fallbackAspect: number;
  stackScale: number;
}

interface LaunchTrail {
  progress: number;
  speed: number;
  padSeed: number;
  heightBias: number;
}

const BUILDING_COLUMNS: BuildingConfig[] = [
  { key: 'solar', svg: solarFarmSvg, columnWeight: 3, fallbackAspect: 70 / 34, stackScale: 1.5 },
  { key: 'rocket', svg: rocketSiloSvg, columnWeight: 1.05, fallbackAspect: 0.82, stackScale: 1 },
  { key: 'mine', svg: siliconMineSvg, columnWeight: 1.05, fallbackAspect: 66 / 48, stackScale: 1 },
  { key: 'gas', svg: gasPlantSvg, columnWeight: 1.1, fallbackAspect: 64 / 52, stackScale: 1 },
  { key: 'solarFactory', svg: solarPanelFactorySvg, columnWeight: 1.1, fallbackAspect: 78 / 52, stackScale: 1 },
  { key: 'gpuFactory', svg: gpuFactorySvg, columnWeight: 1.1, fallbackAspect: 82 / 54, stackScale: 1 },
  { key: 'gpuSatelliteFactory', svg: gpuSatelliteFactorySvg, columnWeight: 1.1, fallbackAspect: 86 / 56, stackScale: 1 },
  { key: 'robot', svg: robotFactorySvg, columnWeight: 1.05, fallbackAspect: 68 / 48, stackScale: 1 },
  { key: 'datacenterSmall', svg: datacenterBuildingSvg, columnWeight: 1, fallbackAspect: 56 / 40, stackScale: 1 },
  { key: 'nuclear', svg: nuclearPlantSvg, columnWeight: 1.1, fallbackAspect: 72 / 54, stackScale: 1 },
  { key: 'datacenterMedium', svg: datacenterMediumSvg, columnWeight: 1.15, fallbackAspect: 72 / 46, stackScale: 1 },
  { key: 'datacenterLarge', svg: datacenterLargeSvg, columnWeight: 1.2, fallbackAspect: 90 / 52, stackScale: 1 },
  { key: 'datacenterMega', svg: datacenterMegaSvg, columnWeight: 3, fallbackAspect: 132 / 68, stackScale: 1.5 },
];

// Per-row depth accumulation for all Earth building stacks. Lower values push rows back faster.
const EARTH_STACK_DEPTH_FALLOFF = 0.8;
// How much sprites shrink by the time they reach the far depth limit.
const EARTH_STACK_SCALE_FALLOFF = 0.82;
const MAX_LAUNCH_TRAILS = 18;
// Maximum number of rendered instances per building column.
const MAX_BUILDINGS_PER_COLUMN = 15;
const EARTH_HORIZON_Y_RATIO = 0.34;
// Horizontal padding for the full set of building columns.
const COLUMN_SIDE_PADDING_PX = 3;
// Ground clearance between sprite feet and the apron band.
const COLUMN_GROUND_OFFSET_PX = 0;
// Front-most building width relative to its column width.
const COLUMN_BASE_SCALE = 1;
const COLUMN_SMOKE_KEYS: BuildingKey[] = ['gas', 'nuclear'];
// Vertical depth span shared by all Earth columns, as a fraction of panel height.
const EARTH_STACK_DEPTH_SPAN_RATIO = 0.34;
// How strongly rows drift toward the scene vanishing point with distance.
const COLUMN_PERSPECTIVE_PULL = 0.8;

function toCount(value: bigint): number {
  const numeric = fromBigInt(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

export class EarthSurfaceScene implements VisualScene {
  private readonly rng: SeededRng;

  private sceneEl!: HTMLDivElement;
  private canvasEl!: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D | null = null;

  private visible = true;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private canvasDpr = 1;
  private lastFrameDrawCalls = 0;

  private sampledCounts = new Map<BuildingKey, number>();
  private sampledRocketInventory = 0;
  private lastSeenEarthLaunchCount: bigint | null = null;
  private pendingLaunchSpawns = 0;
  private launchTrails: LaunchTrail[] = [];

  private spriteImages = new Map<BuildingKey, HTMLImageElement>();
  private spriteReady = new Set<BuildingKey>();
  private pumpjackBaseSprite: HTMLCanvasElement | null = null;
  private pumpjackBeamSprite: HTMLCanvasElement | null = null;
  private launchRocketSprite: HTMLCanvasElement | null = null;
  private launchFlameSprite: HTMLCanvasElement | null = null;

  constructor(seed: number) {
    this.rng = new SeededRng(seed ^ 0x5a3e91d7);
  }

  build(root: HTMLElement): void {
    this.sceneEl = document.createElement('div');
    this.sceneEl.className = 'visual-scene es-scene';

    this.canvasEl = document.createElement('canvas');
    this.canvasEl.className = 'es-mass-canvas';
    this.sceneEl.appendChild(this.canvasEl);
    this.canvasCtx = this.canvasEl.getContext('2d');

    root.appendChild(this.sceneEl);
    this.primeSpriteCache();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.sceneEl.classList.toggle('is-hidden', !visible);
  }

  sample(state: GameState): void {
    const datacenterTier0 = toCount(state.datacenters[0] ?? 0n);
    const datacenterTier1 = toCount(state.datacenters[1] ?? 0n);
    const datacenterTier2 = toCount(state.datacenters[2] ?? 0n);
    const datacenterTier3 = toCount(state.datacenters[3] ?? 0n);
    const materialMines = toCount(state.locationFacilities.earth.earthMaterialMine);
    const solarFactories = toCount(state.locationFacilities.earth.earthSolarFactory);
    const robotFactories = toCount(state.locationFacilities.earth.earthRobotFactory);
    const gpuFactories = toCount(state.locationFacilities.earth.earthGpuFactory);
    const gpuSatelliteFactories = toCount(state.locationFacilities.earth.earthGpuSatelliteFactory);
    const rocketFactories = toCount(state.locationFacilities.earth.earthRocketFactory);
    const gasPlants = toCount(state.gasPlants);
    const nuclearPlants = toCount(state.nuclearPlants);
    const rocketInventory = toCount(state.locationResources.earth.rockets);
    const installedSolarPanels = fromBigInt(state.locationResources.earth.installedSolarPanels);
    const solarFarms = Math.max(0, Math.floor(installedSolarPanels / BALANCE.solarFarmPanelsPerFarm));

    this.sampledCounts.set('rocket', rocketFactories);
    this.sampledCounts.set('mine', materialMines);
    this.sampledCounts.set('solar', solarFarms);
    this.sampledCounts.set('gas', gasPlants);
    this.sampledCounts.set('solarFactory', solarFactories);
    this.sampledCounts.set('gpuFactory', gpuFactories);
    this.sampledCounts.set('gpuSatelliteFactory', gpuSatelliteFactories);
    this.sampledCounts.set('robot', robotFactories);
    this.sampledCounts.set('datacenterSmall', datacenterTier0);
    this.sampledCounts.set('nuclear', nuclearPlants);
    this.sampledCounts.set('datacenterMedium', datacenterTier1);
    this.sampledCounts.set('datacenterLarge', datacenterTier2);
    this.sampledCounts.set('datacenterMega', datacenterTier3);
    this.sampledRocketInventory = rocketInventory;
    if (this.lastSeenEarthLaunchCount === null) {
      this.lastSeenEarthLaunchCount = state.earthLaunchCount;
    } else if (state.earthLaunchCount > this.lastSeenEarthLaunchCount) {
      const launchesDelta = Number(state.earthLaunchCount - this.lastSeenEarthLaunchCount);
      this.pendingLaunchSpawns += Math.min(MAX_LAUNCH_TRAILS, launchesDelta);
      this.lastSeenEarthLaunchCount = state.earthLaunchCount;
    }
  }

  simulate(dtMs: number): void {
    const dtSec = dtMs / 1000;
    while (this.pendingLaunchSpawns > 0 && this.launchTrails.length < MAX_LAUNCH_TRAILS) {
      this.launchTrails.push(this.makeLaunchTrail());
      this.pendingLaunchSpawns -= 1;
    }

    for (let index = this.launchTrails.length - 1; index >= 0; index--) {
      const trail = this.launchTrails[index];
      trail.progress += trail.speed * dtSec;
      if (trail.progress >= 1) {
        this.launchTrails.splice(index, 1);
      }
    }
  }

  render(): void {
    if (!this.visible) {
      return;
    }
    this.lastFrameDrawCalls = 0;
    this.renderCanvas();
  }

  getDrawCallCount(): number {
    return this.lastFrameDrawCalls;
  }

  private primeSpriteCache(): void {
    for (const config of BUILDING_COLUMNS) {
      const image = new Image();
      image.decoding = 'async';
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(config.svg)}`;
      image.addEventListener('load', () => {
        this.spriteReady.add(config.key);
      }, { once: true });
      this.spriteImages.set(config.key, image);
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

    ctx.setTransform(this.canvasDpr, 0, 0, this.canvasDpr, 0, 0);
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    const width = clientWidth;
    const height = clientHeight;
    const horizonY = height * EARTH_HORIZON_Y_RATIO;
    const baseY = height - 8;

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#08172aff');
    sky.addColorStop(0.24, '#14304eff');
    sky.addColorStop(0.52, '#1f5a91ff');
    sky.addColorStop(0.74, '#274d59');
    sky.addColorStop(1, '#0d1523');
    ctx.fillStyle = sky;
    this.fillRect(ctx, 0, 0, width, height);

    this.drawClouds(ctx, width, height, horizonY);
    this.drawMountains(ctx, width, height, horizonY);
    this.drawForegroundColumns(ctx, width, height, baseY);
  }

  private drawForegroundColumns(ctx: CanvasRenderingContext2D, width: number, height: number, baseY: number): void {
    interface ColumnSprite {
      depthRow: number;
      y: number;
      x: number;
      width: number;
      height: number;
      image: HTMLImageElement;
    }

    interface SmokeEmitter {
      centerX: number;
      baseY: number;
      width: number;
      dense: boolean;
      depthRow: number;
    }

    interface PumpjackEmitter {
      centerX: number;
      baseY: number;
      width: number;
      depthRow: number;
    }

    interface LaunchPadEmitter {
      centerX: number;
      baseY: number;
      width: number;
      depthRow: number;
    }

    const topLimit = height * 0.1;
    const laneWidth = width - (COLUMN_SIDE_PADDING_PX * 2);
    const totalColumnWeight = BUILDING_COLUMNS.reduce((sum, config) => sum + config.columnWeight, 0);
    const timeSec = performance.now() / 1000;
    const perspectiveX = width * 0.5;
    const depthSpan = Math.max(36, height * EARTH_STACK_DEPTH_SPAN_RATIO);
    const sprites: ColumnSprite[] = [];
    const smokeEmitters: SmokeEmitter[] = [];
    const pumpjackEmitters: PumpjackEmitter[] = [];
    const launchPadEmitters: LaunchPadEmitter[] = [];
    let columnLeft = COLUMN_SIDE_PADDING_PX;

    for (const config of BUILDING_COLUMNS) {
      const count = Math.min(MAX_BUILDINGS_PER_COLUMN, this.sampledCounts.get(config.key) ?? 0);
      const columnWidth = laneWidth * (config.columnWeight / Math.max(0.0001, totalColumnWeight));
      const centerX = columnLeft + (columnWidth * 0.5);
      const frontWidth = Math.max(20, columnWidth * COLUMN_BASE_SCALE);
      columnLeft += columnWidth;
      if (count <= 0) {
        continue;
      }
      const image = this.spriteImages.get(config.key);
      if (!image || !this.spriteReady.has(config.key)) {
        continue;
      }
      const aspect = image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : config.fallbackAspect;
      const frontHeight = frontWidth / aspect;
      const floorY = baseY - COLUMN_GROUND_OFFSET_PX;
      let visibleCount = 0;

      for (let logicalRow = 0; logicalRow < count; logicalRow++) {
        const projected = this.projectStackInstance(
          centerX,
          floorY,
          frontWidth,
          frontHeight,
          logicalRow,
          perspectiveX,
          depthSpan,
        );
        if (projected.y + projected.height < topLimit) {
          break;
        }
        visibleCount++;
      }

      for (let index = visibleCount - 1; index >= 0; index--) {
        const projected = this.projectStackInstance(
          centerX,
          floorY,
          frontWidth,
          frontHeight,
          index,
          perspectiveX,
          depthSpan,
        );
        const drawWidth = projected.width * config.stackScale;
        const drawHeight = projected.height * config.stackScale;
        const x = projected.centerX - (drawWidth * 0.5);
        const y = projected.y - drawHeight;
        sprites.push({
          depthRow: index,
          y,
          x,
          width: drawWidth,
          height: drawHeight,
          image,
        });
      }

      if (COLUMN_SMOKE_KEYS.includes(config.key) && visibleCount > 0) {
        const emitterCount = Math.min(5, visibleCount);
        for (let smokeRow = 0; smokeRow < emitterCount; smokeRow++) {
          const smokeAnchor = this.projectStackInstance(
            centerX,
            floorY,
            frontWidth,
            frontHeight,
            smokeRow,
            perspectiveX,
            depthSpan,
          );
          smokeEmitters.push({
            centerX: smokeAnchor.centerX,
            baseY: smokeAnchor.y - (smokeAnchor.height * 0.82),
            width: smokeAnchor.width,
            dense: config.key === 'nuclear',
            depthRow: smokeRow,
          });
        }
      }

      if (config.key === 'mine' && visibleCount > 0) {
        for (let mineRow = 0; mineRow < visibleCount; mineRow++) {
          const pumpAnchor = this.projectStackInstance(
            centerX,
            floorY,
            frontWidth,
            frontHeight,
            mineRow,
            perspectiveX,
            depthSpan,
          );
          pumpjackEmitters.push({
            centerX: pumpAnchor.centerX,
            baseY: pumpAnchor.y - (pumpAnchor.height * 0.1),
            width: pumpAnchor.width,
            depthRow: mineRow,
          });
        }
      }

      if (config.key === 'rocket' && visibleCount > 0) {
        for (let rocketRow = 0; rocketRow < visibleCount; rocketRow++) {
          const launchAnchor = this.projectStackInstance(
            centerX,
            floorY,
            frontWidth,
            frontHeight,
            rocketRow,
            perspectiveX,
            depthSpan,
          );
          launchPadEmitters.push({
            centerX: launchAnchor.centerX,
            baseY: launchAnchor.y - (launchAnchor.height * 0.16),
            width: launchAnchor.width,
            depthRow: rocketRow,
          });
        }
      }
    }

    sprites.sort((a, b) => {
      if (a.depthRow !== b.depthRow) {
        return b.depthRow - a.depthRow;
      }
      return a.y - b.y;
    });

    for (const sprite of sprites) {
      ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.width, sprite.height);
      this.lastFrameDrawCalls++;
    }

    pumpjackEmitters.sort((a, b) => b.depthRow - a.depthRow);
    for (const emitter of pumpjackEmitters) {
      this.drawPumpjack(
        ctx,
        emitter.centerX,
        emitter.baseY,
        emitter.width,
        timeSec,
      );
    }

    smokeEmitters.sort((a, b) => b.depthRow - a.depthRow);
    for (const emitter of smokeEmitters) {
      this.drawStackSmoke(
        ctx,
        emitter.centerX,
        emitter.baseY,
        emitter.width,
        timeSec,
        emitter.dense,
      );
    }

    launchPadEmitters.sort((a, b) => b.depthRow - a.depthRow);
    this.drawLaunchRockets(ctx, height, launchPadEmitters);
  }

  private projectStackInstance(
    baseCenterX: number,
    floorY: number,
    frontWidth: number,
    frontHeight: number,
    logicalRow: number,
    perspectiveX: number,
    depthSpan: number,
  ): { centerX: number; y: number; width: number; height: number } {
    const depth = 1 - Math.pow(EARTH_STACK_DEPTH_FALLOFF, logicalRow);
    const scale = 1 - (EARTH_STACK_SCALE_FALLOFF * depth);
    const centerX = baseCenterX + ((perspectiveX - baseCenterX) * depth * COLUMN_PERSPECTIVE_PULL);
    return {
      centerX,
      y: floorY - (depth * depthSpan),
      width: frontWidth * scale,
      height: frontHeight * scale,
    };
  }

  private drawPumpjack(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    baseY: number,
    width: number,
    timeSec: number,
  ): void {
    const baseSprite = this.getPumpjackBaseSprite();
    const beamSprite = this.getPumpjackBeamSprite();
    const bodyWidth = width * 0.62;
    const bodyHeight = width * 0.42;
    const beamWidth = bodyWidth * 0.9;
    const beamHeight = width * 0.38;
    const pivotX = centerX - (bodyWidth * 0.04);
    const pivotY = baseY - (width * 0.34);
    const angle = Math.sin(timeSec * 1.3) * 0.24;

    ctx.drawImage(
      baseSprite,
      centerX - (bodyWidth * 0.33),
      baseY - bodyHeight,
      bodyWidth * 0.66,
      bodyHeight,
    );
    this.lastFrameDrawCalls++;

    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(angle);
    ctx.drawImage(
      beamSprite,
      -beamWidth * 0.5,
      -beamHeight * 0.34,
      beamWidth,
      beamHeight,
    );
    ctx.restore();
    this.lastFrameDrawCalls++;
  }

  private getPumpjackBaseSprite(): HTMLCanvasElement {
    if (this.pumpjackBaseSprite) {
      return this.pumpjackBaseSprite;
    }

    const sprite = document.createElement('canvas');
    sprite.width = 160;
    sprite.height = 120;
    const ctx = sprite.getContext('2d');
    if (!ctx) {
      this.pumpjackBaseSprite = sprite;
      return sprite;
    }

    ctx.strokeStyle = '#8ea4bf';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(28, 108);
    ctx.lineTo(58, 34);
    ctx.lineTo(102, 108);
    ctx.stroke();

    ctx.fillStyle = '#1b2838';
    ctx.fillRect(20, 102, 90, 8);

    this.pumpjackBaseSprite = sprite;
    return sprite;
  }

  private getPumpjackBeamSprite(): HTMLCanvasElement {
    if (this.pumpjackBeamSprite) {
      return this.pumpjackBeamSprite;
    }

    const sprite = document.createElement('canvas');
    sprite.width = 180;
    sprite.height = 90;
    const ctx = sprite.getContext('2d');
    if (!ctx) {
      this.pumpjackBeamSprite = sprite;
      return sprite;
    }

    ctx.translate(90, 32);
    ctx.strokeStyle = '#b7c6d7';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-72, 0);
    ctx.lineTo(72, 0);
    ctx.stroke();

    ctx.fillStyle = '#d1dde8';
    ctx.beginPath();
    ctx.moveTo(72, 0);
    ctx.lineTo(48, -14);
    ctx.lineTo(26, 0);
    ctx.lineTo(48, 14);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#7fd5b6';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(28, 4);
    ctx.lineTo(28, 42);
    ctx.stroke();

    ctx.fillStyle = '#8ea4bf';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    this.pumpjackBeamSprite = sprite;
    return sprite;
  }

  private getLaunchRocketSprite(): HTMLCanvasElement {
    if (this.launchRocketSprite) {
      return this.launchRocketSprite;
    }

    const sprite = document.createElement('canvas');
    sprite.width = 72;
    sprite.height = 180;
    const ctx = sprite.getContext('2d');
    if (!ctx) {
      this.launchRocketSprite = sprite;
      return sprite;
    }

    ctx.fillStyle = '#d9e1ea';
    ctx.beginPath();
    ctx.moveTo(36, 6);
    ctx.lineTo(52, 30);
    ctx.lineTo(52, 122);
    ctx.lineTo(20, 122);
    ctx.lineTo(20, 30);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f06b4d';
    ctx.beginPath();
    ctx.moveTo(20, 100);
    ctx.lineTo(10, 122);
    ctx.lineTo(20, 122);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(52, 100);
    ctx.lineTo(62, 122);
    ctx.lineTo(52, 122);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#8da3bf';
    ctx.fillRect(26, 40, 20, 58);
    ctx.fillStyle = '#66deb8';
    ctx.fillRect(27, 104, 18, 8);
    ctx.fillStyle = '#1f3147';
    ctx.beginPath();
    ctx.arc(36, 48, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a7b9cd';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 30, 32, 92);

    this.launchRocketSprite = sprite;
    return sprite;
  }

  private getLaunchFlameSprite(): HTMLCanvasElement {
    if (this.launchFlameSprite) {
      return this.launchFlameSprite;
    }

    const sprite = document.createElement('canvas');
    sprite.width = 96;
    sprite.height = 160;
    const ctx = sprite.getContext('2d');
    if (!ctx) {
      this.launchFlameSprite = sprite;
      return sprite;
    }

    const gradient = ctx.createLinearGradient(48, 0, 48, 160);
    gradient.addColorStop(0, 'rgba(255, 245, 214, 0.95)');
    gradient.addColorStop(0.24, 'rgba(255, 200, 92, 0.78)');
    gradient.addColorStop(0.6, 'rgba(255, 124, 54, 0.42)');
    gradient.addColorStop(1, 'rgba(255, 92, 40, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(48, 0);
    ctx.bezierCurveTo(76, 34, 70, 104, 48, 160);
    ctx.bezierCurveTo(26, 104, 20, 34, 48, 0);
    ctx.closePath();
    ctx.fill();

    this.launchFlameSprite = sprite;
    return sprite;
  }

  private drawStackSmoke(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    baseY: number,
    width: number,
    timeSec: number,
    dense: boolean,
  ): void {
    const puffCount = dense ? 7 : 6;
    for (let i = 0; i < puffCount; i++) {
      const phase = (timeSec * (dense ? 0.085 : 0.11)) + (i / puffCount);
      const phaseT = phase - Math.floor(phase);
      const smoothT = Math.sin(phaseT * Math.PI);
      const rise = phaseT * width * (dense ? 1.1 : 0.9);
      const radiusX = width * (dense ? 0.22 : 0.18) * (0.72 + (smoothT * 0.78));
      const radiusY = radiusX * (dense ? 0.68 : 0.54);
      const drift = Math.sin((timeSec * 0.8) + (i * 1.7)) * width * 0.12;
      const alpha = dense ? 0.2 : 0.16;
      ctx.fillStyle = `rgba(210, 218, 226, ${alpha * smoothT * smoothT})`;
      ctx.beginPath();
      ctx.ellipse(centerX + drift, baseY - rise, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      this.lastFrameDrawCalls++;
    }
  }

  private makeLaunchTrail(): LaunchTrail {
    const trail: LaunchTrail = {
      progress: 0,
      speed: 0.22,
      padSeed: 0,
      heightBias: 0,
    };
    this.resetLaunchTrail(trail);
    return trail;
  }

  private resetLaunchTrail(trail: LaunchTrail): void {
    trail.progress = 0;
    trail.speed = this.rng.nextRange(0.18, 0.42);
    trail.padSeed = this.rng.next();
    trail.heightBias = this.rng.nextRange(-0.04, 0.07);
  }

  private drawMountains(ctx: CanvasRenderingContext2D, width: number, height: number, horizonY: number): void {
    const mountainFill = ctx.createLinearGradient(0, horizonY - (height * 0.04), 0, height);
    mountainFill.addColorStop(0, '#ffffff');
    mountainFill.addColorStop(0.29, '#1a3445');
    mountainFill.addColorStop(0.47, '#132235');
    mountainFill.addColorStop(0.51, '#1e3923ff');
    mountainFill.addColorStop(0.66, '#365d2a');
    mountainFill.addColorStop(1, '#39662bff');
    ctx.fillStyle = mountainFill;
    ctx.beginPath();
    ctx.moveTo(0, horizonY + (height * 0.22));
    ctx.lineTo(width * 0.12, horizonY + (height * 0.11));
    ctx.lineTo(width * 0.24, horizonY + (height * 0.21));
    ctx.lineTo(width * 0.39, horizonY + (height * 0.07));
    ctx.lineTo(width * 0.55, horizonY + (height * 0.2));
    ctx.lineTo(width * 0.72, horizonY + (height * 0.08));
    ctx.lineTo(width * 0.88, horizonY + (height * 0.19));
    ctx.lineTo(width, horizonY + (height * 0.12));
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    this.lastFrameDrawCalls++;

    const mountainFill2 = ctx.createLinearGradient(0, horizonY - (height * 0.04), 0, height);
    mountainFill2.addColorStop(0, '#ffffff');
    mountainFill2.addColorStop(0.35, '#1a3445');
    mountainFill2.addColorStop(0.55, '#132235');
    mountainFill2.addColorStop(0.63, '#1e3923ff');
    mountainFill2.addColorStop(0.66, '#365d2a');
    mountainFill2.addColorStop(1, '#39662bff');
    ctx.fillStyle = mountainFill2;
    let sideBaseY = horizonY + (height * 0.45);
    ctx.beginPath();
    ctx.moveTo(0, sideBaseY);
    ctx.lineTo(0, horizonY + (height * 0.16));
    ctx.lineTo(width * 0.07, horizonY + (height * 0.07));
    ctx.lineTo(width * 0.14, horizonY + (height * 0.21));
    ctx.lineTo(width * 0.22, sideBaseY);
    ctx.closePath();
    ctx.fill();
    this.lastFrameDrawCalls++;

    const mountainFill3 = ctx.createLinearGradient(0, horizonY - (height * 0.04), 0, height);
    mountainFill3.addColorStop(0, '#ffffff');
    mountainFill3.addColorStop(0.35, '#1a3445');
    mountainFill3.addColorStop(0.55, '#132235');
    mountainFill3.addColorStop(0.59, '#1e3923ff');
    mountainFill3.addColorStop(0.66, '#365d2a');
    mountainFill3.addColorStop(1, '#39662bff');
    ctx.fillStyle = mountainFill3;
    sideBaseY = horizonY + (height * 0.4);
    ctx.beginPath();
    ctx.moveTo(width, sideBaseY);
    ctx.lineTo(width, horizonY + (height * 0.2));
    ctx.lineTo(width * 0.93, horizonY + (height * 0.1));
    ctx.lineTo(width * 0.88, horizonY + (height * 0.24));
    ctx.lineTo(width * 0.83, sideBaseY);
    ctx.closePath();
    ctx.fill();
    this.lastFrameDrawCalls++;
  }

  private drawClouds(ctx: CanvasRenderingContext2D, width: number, height: number, horizonY: number): void {
    const nowSec = performance.now() / 1000;
    const cloudRows = [
      { y: horizonY - (height * 0.2), alpha: 0.1, scale: 1.15, speed: 5, offset: 0.17 },
      { y: horizonY - (height * 0.13), alpha: 0.08, scale: 0.9, speed: 8, offset: 0.41 },
      { y: horizonY - (height * 0.07), alpha: 0.06, scale: 0.7, speed: 11, offset: 0.73 },
    ];

    for (const row of cloudRows) {
      const spacing = width * 0.22 * row.scale;
      const drift = ((nowSec * row.speed) + (width * row.offset)) % spacing;
      const visibleCount = Math.ceil(width / spacing) + 4;
      const baseIndex = Math.floor(((nowSec * row.speed) + (width * row.offset)) / spacing);
      for (let localIdx = -2; localIdx < visibleCount; localIdx++) {
        const worldIdx = baseIndex + localIdx;
        const centerX = (localIdx * spacing) - drift;
        const widthJitter = 0.82 + (0.22 * Math.sin((worldIdx * 1.73) + row.offset * 9));
        const heightJitter = 0.78 + (0.26 * Math.cos((worldIdx * 1.11) + row.offset * 13));
        const cloudWidth = width * 0.13 * row.scale * widthJitter;
        const cloudHeight = height * 0.05 * row.scale * heightJitter;
        const tiltY = row.y + (Math.sin((worldIdx * 0.9) + (nowSec * 0.2)) * height * 0.008);
        ctx.fillStyle = `rgba(213, 225, 236, ${row.alpha})`;
        ctx.beginPath();
        ctx.ellipse(centerX, tiltY, cloudWidth * 0.5, cloudHeight * 0.5, 0, 0, Math.PI * 2);
        ctx.ellipse(centerX - (cloudWidth * 0.28), tiltY + (cloudHeight * 0.03), cloudWidth * 0.31, cloudHeight * 0.36, 0, 0, Math.PI * 2);
        ctx.ellipse(centerX + (cloudWidth * 0.19), tiltY - (cloudHeight * 0.02), cloudWidth * 0.26, cloudHeight * 0.32, 0, 0, Math.PI * 2);
        ctx.ellipse(centerX + (cloudWidth * 0.42), tiltY + (cloudHeight * 0.06), cloudWidth * 0.18, cloudHeight * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        this.lastFrameDrawCalls++;
      }
    }
  }

  private drawLaunchRockets(
    ctx: CanvasRenderingContext2D,
    height: number,
    launchPads: Array<{ centerX: number; baseY: number; width: number; depthRow: number }>,
  ): void {
    if (launchPads.length === 0) {
      return;
    }

    const rocketSprite = this.getLaunchRocketSprite();
    const flameSprite = this.getLaunchFlameSprite();
    const occupiedPads = new Set<number>();
    for (const launch of this.launchTrails) {
      const padIndex = Math.min(launchPads.length - 1, Math.floor(launch.padSeed * launchPads.length));
      const emitter = launchPads[padIndex];
      if (!emitter) {
        continue;
      }
      occupiedPads.add(padIndex);

      const progress = Math.max(0, launch.progress);
      const visualProgress = clamp01(progress);
      const rocketHeight = Math.max(10, emitter.width * 0.44 * (1 + (visualProgress * 0.18)));
      const rocketWidth = rocketHeight * 0.32;
      const launchOffset = height * Math.max(0, 0.02 + launch.heightBias);
      const travelDistance = emitter.baseY + rocketHeight + 12;
      const rise = launchOffset + (progress * travelDistance);
      const sway = Math.sin((visualProgress * Math.PI) + (launch.padSeed * Math.PI * 2)) * emitter.width * 0.02;
      const rocketX = emitter.centerX + sway;
      const rocketY = emitter.baseY - rise;
      const flameHeight = rocketHeight * (0.62 + ((1 - visualProgress) * 0.35));
      const flameWidth = rocketWidth * 1.35;

      ctx.drawImage(
        flameSprite,
        rocketX - (flameWidth * 0.5),
        rocketY + (rocketHeight * 0.82),
        flameWidth,
        flameHeight,
      );
      this.lastFrameDrawCalls++;

      ctx.drawImage(
        rocketSprite,
        rocketX - (rocketWidth * 0.5),
        rocketY,
        rocketWidth,
        rocketHeight,
      );
      this.lastFrameDrawCalls++;
    }

    let parkedRocketsRemaining = Math.min(this.sampledRocketInventory, launchPads.length);
    for (let padIndex = launchPads.length - 1; padIndex >= 0; padIndex--) {
      if (parkedRocketsRemaining <= 0) {
        break;
      }
      if (occupiedPads.has(padIndex)) {
        continue;
      }

      const emitter = launchPads[padIndex];
      const rocketHeight = Math.max(10, emitter.width * 0.44);
      const rocketWidth = rocketHeight * 0.32;
      const rocketX = emitter.centerX;
      const rocketY = emitter.baseY - rocketHeight;
      ctx.drawImage(
        rocketSprite,
        rocketX - (rocketWidth * 0.5),
        rocketY,
        rocketWidth,
        rocketHeight,
      );
      this.lastFrameDrawCalls++;
      parkedRocketsRemaining--;
    }
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

}
