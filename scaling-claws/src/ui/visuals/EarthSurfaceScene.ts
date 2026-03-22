import { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js';
import { BALANCE } from '../../game/BalanceConfig.ts';
import type { GameState } from '../../game/GameState.ts';
import {
  datacenterBuildingSvg,
  datacenterLargeSvg,
  datacenterMegaSvg,
  datacenterMediumSvg,
  gasPlantSvg,
  gpuFactorySvg,
  gpuSatelliteFactorySvg,
  launchRocketTrailSvg,
  nuclearPlantSvg,
  robotFactorySvg,
  rocketSiloSvg,
  siliconMineSvg,
  solarFarmSvg,
  solarPanelFactorySvg,
} from '../../assets/sprites.ts';
import { fromBigInt } from '../../game/utils.ts';
import type { VisualScene } from './VisualScene.ts';
import { clamp01 } from './lod.ts';
import { createPixiSceneHost, replaceManagedTexture, textureFromCanvas } from './pixiHost.ts';
import type { PixiSceneHost } from './pixiHost.ts';
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
  sourceIndex: number;
  heightBias: number;
  directionBias: number;
}

interface ReturnTrail {
  delaySec: number;
  progress: number;
  speed: number;
  targetSeed: number;
  targetIndex: number;
  driftBias: number;
  heightBias: number;
}

interface StackProjection {
  centerX: number;
  y: number;
  width: number;
  height: number;
}

interface BuildingPlacement {
  texture: Texture;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  alpha?: number;
  rotation?: number;
}

interface SmokePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  z: number;
}

interface PeoplePlacement {
  x: number;
  y: number;
  size: number;
  alpha: number;
  z: number;
}

interface PumpPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  beamWidth: number;
  beamHeight: number;
  angle: number;
  z: number;
}

interface LaunchPadPlacement {
  centerX: number;
  baseY: number;
  width: number;
  rocketHeight: number;
  speedScale: number;
  depthRow: number;
  slotInFactory: number;
}

interface LandingZonePlacement {
  centerX: number;
  baseY: number;
  rocketHeight: number;
  depthRow: number;
}

interface MultiRowLayout {
  frontWidthRatio: number;
  frontHeightRatio: number;
  gapToWidth: number;
  startDepthRow: number;
  extraSlots: number;
  side: 'left' | 'right';
}

const BUILDING_COLUMNS: BuildingConfig[] = [
  { key: 'datacenterMega', svg: datacenterMegaSvg, columnWeight: 5, fallbackAspect: 132 / 96, stackScale: 1.7 },
  { key: 'rocket', svg: rocketSiloSvg, columnWeight: 1.2, fallbackAspect: 0.82, stackScale: 1.5 },
  { key: 'mine', svg: siliconMineSvg, columnWeight: 1.05, fallbackAspect: 66 / 48, stackScale: 1 },
  { key: 'gas', svg: gasPlantSvg, columnWeight: 1.1, fallbackAspect: 64 / 52, stackScale: 1 },
  { key: 'solarFactory', svg: solarPanelFactorySvg, columnWeight: 1.1, fallbackAspect: 78 / 52, stackScale: 1 },
  { key: 'gpuFactory', svg: gpuFactorySvg, columnWeight: 1.1, fallbackAspect: 82 / 54, stackScale: 1 },
  { key: 'gpuSatelliteFactory', svg: gpuSatelliteFactorySvg, columnWeight: 1.1, fallbackAspect: 86 / 56, stackScale: 1 },
  { key: 'robot', svg: robotFactorySvg, columnWeight: 1.05, fallbackAspect: 68 / 48, stackScale: 1 },
  { key: 'datacenterSmall', svg: datacenterBuildingSvg, columnWeight: 0.5, fallbackAspect: 56 / 40, stackScale: 1 },
  { key: 'nuclear', svg: nuclearPlantSvg, columnWeight: 1.5, fallbackAspect: 72 / 54, stackScale: 1 },
  { key: 'datacenterMedium', svg: datacenterMediumSvg, columnWeight: 1.15, fallbackAspect: 72 / 46, stackScale: 1 },
  { key: 'datacenterLarge', svg: datacenterLargeSvg, columnWeight: 3, fallbackAspect: 90 / 52, stackScale: 1 },
  { key: 'solar', svg: solarFarmSvg, columnWeight: 3, fallbackAspect: 70 / 34, stackScale: 1.5 },
];

const EARTH_STACK_DEPTH_FALLOFF = 0.92;
const EARTH_STACK_SCALE_FALLOFF = 1;
const MAX_LAUNCH_TRAILS = 180;
const MAX_BUILDINGS_PER_COLUMN = 25;
const MAX_SMOKE_ROWS = 5;
const EARTH_HORIZON_Y_RATIO = 0.33;
const COLUMN_SIDE_PADDING_PX = 3;
const COLUMN_GROUND_OFFSET_PX = 0;
const COLUMN_BASE_SCALE = 1;
const COLUMN_SMOKE_KEYS: BuildingKey[] = ['gas', 'nuclear'];
const EARTH_STACK_DEPTH_SPAN_RATIO = 0.38;
const COLUMN_PERSPECTIVE_PULL = 0.8;
const BUILDING_TEXTURE_SCALE = 4;
const ROCKET_TRAIL_TEXTURE_SCALE = 1.5;
const CENTER_COLUMNS_WIDTH_RATIO = 0.56;
const SIDE_FIELD_INNER_GAP_PX = -20;
const ROCKET_PADS_PER_FACTORY = 3;
const ROCKET_PAD_SPREAD = 0.2;
const ROCKET_PAD_WIDTH_RATIO = 0.28;
const ROCKET_BASE_HEIGHT_RATIO = 1;
const ROCKET_LAUNCH_SHRINK_RATIO = 0.24;
const ROCKET_MIN_HEIGHT = 1;
const ROCKET_MIN_SPEED_SCALE = 2;
const ROCKET_SPEED_HEIGHT_REFERENCE = 38;
const ROCKET_ROW_PERSPECTIVE_FALLOFF = 1;
const ROCKET_PAD_SINK_RATIO = 0.5;
const ROCKET_LAUNCH_DIRECTION_DRIFT_RATIO = 0.1;
const ROCKET_LAUNCH_TILT_MAX = 0.16;
const PEOPLE_WORKERS_PER_DOT = 1000;
const MAX_PEOPLE_DOTS = 1000;
const PEOPLE_MIN_SIZE = 1;
const PEOPLE_MAX_SIZE = 3.8;
const BUILDING_ROW_FADE_START = 0.8;
const BUILDING_ROW_FADE_MIN_ALPHA = 0.35;
const MAX_NEW_LAUNCH_TRAILS_PER_SAMPLE = 12;
const MAX_RETURN_TRAILS = 84;
const MAX_NEW_RETURN_TRAILS_PER_SAMPLE = 7;
const MAX_RENDERED_RETURN_TRAILS = 84;
const LANDING_ZONE_COUNT = 18;
const MULTI_ROW_KEYS = new Set<BuildingKey>(['solar', 'datacenterMega']);
const MULTI_ROW_BUILDING_KEYS = ['datacenterMega', 'solar'] as const;
const MULTI_ROW_LAYOUTS: Record<'solar' | 'datacenterMega', MultiRowLayout> = {
  solar: {
    frontWidthRatio: 0.48,
    frontHeightRatio: 0.51,
    gapToWidth: 0.12,
    startDepthRow: 0,
    extraSlots: 2,
    side: 'right',
  },
  datacenterMega: {
    frontWidthRatio: 0.51,
    frontHeightRatio: 0.66,
    gapToWidth: 0.14,
    startDepthRow: 0,
    extraSlots: 2,
    side: 'left',
  },
};
const SINGLE_ROW_BUILDING_COLUMNS = BUILDING_COLUMNS.filter(config => !MULTI_ROW_KEYS.has(config.key));
const BUILDING_CONFIG_BY_KEY = new Map<BuildingKey, BuildingConfig>(
  BUILDING_COLUMNS.map(config => [config.key, config]),
);
const SINGLE_ROW_BUILDING_TOTAL_WEIGHT = SINGLE_ROW_BUILDING_COLUMNS.reduce(
  (sum, config) => sum + config.columnWeight,
  0,
);
const CLOUD_ROWS = [
  { yRatio: -0.25, alpha: 0.1, scale: 4.15, speed: 5, offset: 0.1 },
  { yRatio: -0.15, alpha: 0.08, scale: 3.9, speed: 8, offset: 0.4 },
  { yRatio: 0, alpha: 0.06, scale: 2.7, speed: 11, offset: 0.7 },
] as const;

function compareByZ<T extends { z: number }>(a: T, b: T): number {
  return a.z - b.z;
}

function compareByDepthRow<T extends { depthRow: number }>(a: T, b: T): number {
  return a.depthRow - b.depthRow;
}

function toCount(value: bigint): number {
  const numeric = fromBigInt(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

export class EarthSurfaceScene implements VisualScene {
  private readonly rng: SeededRng;

  private host!: PixiSceneHost;
  private sceneEl!: HTMLDivElement;
  private visible = true;
  private stageReady = false;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastFrameDrawCalls = 0;

  private sampledCounts = new Map<BuildingKey, number>();
  private sampledRocketInventory = 0;
  private sampledHumanWorkers = 0;
  private sampledRocketReuseRatio = 0;
  private launchTrails: LaunchTrail[] = [];
  private returnTrails: ReturnTrail[] = [];
  private nextLaunchSourceIndex = 0;
  private nextReturnTargetIndex = 0;
  private lastSampledEarthLaunchesUsed = 0;
  private lastSeenEarthLaunchCount: bigint | null = null;
  private lastVisibleLaunchPadCount = 0;
  private lastVisibleLaunchSourceCount = 0;
  private lastVisiblePeopleCount = 0;

  private spriteTextures = new Map<BuildingKey, Texture>();
  private spriteAspects = new Map<BuildingKey, number>();
  private spriteReady = new Set<BuildingKey>();

  private backgroundSprite!: Sprite;
  private cloudContainer!: Container;
  private buildingContainer!: Container;
  private peopleContainer!: ParticleContainer<Particle>;
  private smokeContainer!: ParticleContainer<Particle>;
  private pumpjackBaseContainer!: ParticleContainer<Particle>;
  private pumpjackBeamContainer!: ParticleContainer<Particle>;
  private rocketTrailContainer!: ParticleContainer<Particle>;
  private parkedRocketContainer!: ParticleContainer<Particle>;

  private backgroundTexture: Texture | null = null;
  private cloudTextures: Texture[] = [];
  private peopleTexture: Texture | null = null;
  private smokeTexture: Texture | null = null;
  private pumpjackBaseTexture: Texture | null = null;
  private pumpjackBeamTexture: Texture | null = null;
  private launchRocketTexture: Texture | null = null;
  private launchRocketTrailTexture: Texture | null = null;

  private cloudSprites: Sprite[] = [];
  private buildingSprites: Sprite[] = [];
  private peopleParticles: Particle[] = [];
  private smokeParticles: Particle[] = [];
  private pumpjackBaseParticles: Particle[] = [];
  private pumpjackBeamParticles: Particle[] = [];
  private rocketTrailParticles: Particle[] = [];
  private parkedRocketParticles: Particle[] = [];
  private readonly buildingPlacements: BuildingPlacement[] = [];
  private buildingPlacementCount = 0;
  private readonly peoplePlacements: PeoplePlacement[] = [];
  private peoplePlacementCount = 0;
  private readonly smokePlacements: SmokePlacement[] = [];
  private smokePlacementCount = 0;
  private readonly pumpPlacements: PumpPlacement[] = [];
  private pumpPlacementCount = 0;
  private readonly launchPads: LaunchPadPlacement[] = [];
  private launchPadCount = 0;
  private readonly landingZones: LandingZonePlacement[] = [];
  private landingZoneCount = 0;
  private readonly rocketTrailPlacements: BuildingPlacement[] = [];
  private rocketTrailPlacementCount = 0;
  private readonly parkedRocketPlacements: BuildingPlacement[] = [];
  private parkedRocketPlacementCount = 0;
  private readonly launchPadOrder: number[] = [];
  private readonly parkedPadOrder: number[] = [];
  private readonly occupiedPadFlags: boolean[] = [];
  private readonly stackProjectionScratch: StackProjection = {
    centerX: 0,
    y: 0,
    width: 0,
    height: 0,
  };

  constructor(seed: number) {
    this.rng = new SeededRng(seed ^ 0x5a3e91d7);
  }

  build(root: HTMLElement): void {
    this.host = createPixiSceneHost(root, 'visual-scene es-scene', 'es-mass-canvas');
    this.sceneEl = this.host.sceneEl;
    this.primeSpriteCache();
    this.primeLaunchEffectTextures();
    void this.host.initPromise.then(() => {
      this.configureStage();
    });
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
    let humanWorkers = 0n;
    for (const pool of Object.values(state.humanPools)) {
      humanWorkers += pool.totalCount;
    }

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
    this.sampledHumanWorkers = toCount(humanWorkers);
    this.sampledRocketReuseRatio = clamp01(1 - state.rocketLossPct);
    const launchesDelta = this.lastSeenEarthLaunchCount === null
      ? 0
      : Math.max(0, Number(state.earthLaunchCount - this.lastSeenEarthLaunchCount));
    const launchesUsed = Math.max(
      Math.max(0, state.earthLaunchesUsedLastTick),
      launchesDelta,
    );
    this.lastSampledEarthLaunchesUsed = launchesUsed;
    this.lastSeenEarthLaunchCount = state.earthLaunchCount;

    const visualBurst = this.getLaunchVisualBurst(launchesUsed);
    for (let i = 0; i < visualBurst && this.launchTrails.length < MAX_LAUNCH_TRAILS; i++) {
      this.launchTrails.push(this.makeLaunchTrail());
    }
    const returnBurst = this.getReturnVisualBurst(launchesUsed, this.sampledRocketReuseRatio);
    for (let i = 0; i < returnBurst && this.returnTrails.length < MAX_RETURN_TRAILS; i++) {
      this.returnTrails.push(this.makeReturnTrail());
    }
  }

  simulate(dtMs: number): void {
    const dtSec = dtMs / 1000;
    for (const trail of this.launchTrails) {
      trail.progress += trail.speed * dtSec;
    }
    for (let i = this.returnTrails.length - 1; i >= 0; i--) {
      const trail = this.returnTrails[i];
      let activeDt = dtSec;
      if (trail.delaySec > 0) {
        trail.delaySec -= dtSec;
        if (trail.delaySec > 0) {
          continue;
        }
        activeDt = Math.max(0, -trail.delaySec);
        trail.delaySec = 0;
      }
      trail.progress += trail.speed * activeDt;
      if (trail.progress >= 1.16) {
        this.returnTrails.splice(i, 1);
      }
    }
  }

  render(): void {
    if (!this.visible || !this.stageReady || !this.host.ready) {
      return;
    }

    const width = this.host.width;
    const height = this.host.height;
    if (width <= 0 || height <= 0) {
      return;
    }

    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.lastWidth = width;
      this.lastHeight = height;
      this.rebuildBackground(width, height);
    }

    this.lastFrameDrawCalls = 0;
    const horizonY = height * EARTH_HORIZON_Y_RATIO;
    this.updateCloudSprites(width, height, horizonY);
    this.updateForegroundSprites(width, height, height - 8);
    this.host.app.render();
  }

  getDrawCallCount(): number {
    return this.lastFrameDrawCalls;
  }

  getDebugLines(): string[] {
    return [
      `launches/tick=${this.lastSampledEarthLaunchesUsed} | active=${this.launchTrails.length}`,
      `rockets=${this.sampledRocketInventory} | pads=${this.lastVisibleLaunchPadCount} | sources=${this.lastVisibleLaunchSourceCount}`,
      `humans=${this.sampledHumanWorkers} | peopleDots=${this.lastVisiblePeopleCount}`,
    ];
  }

  private getLaunchVisualBurst(launchesUsed: number): number {
    if (launchesUsed <= 0) {
      return 0;
    }
    return Math.max(1, Math.min(
      MAX_NEW_LAUNCH_TRAILS_PER_SAMPLE,
      Math.round(Math.sqrt(launchesUsed) * 4),
    ));
  }

  private getReturnVisualBurst(launchesUsed: number, rocketReuseRatio: number): number {
    if (launchesUsed <= 0 || rocketReuseRatio <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(
      MAX_NEW_RETURN_TRAILS_PER_SAMPLE,
      Math.round(Math.sqrt(launchesUsed) * 2.2 * rocketReuseRatio),
    ));
  }

  private configureStage(): void {
    const stage = this.host.app.stage;
    stage.removeChildren();

    this.backgroundSprite = new Sprite(Texture.EMPTY);
    this.cloudContainer = new Container();
    this.buildingContainer = new Container();
    this.peopleContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: false,
        vertex: true,
        color: true,
      },
      texture: this.getPeopleTexture(),
    });
    this.smokeContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: false,
        vertex: true,
        color: true,
      },
      texture: this.getSmokeTexture(),
    });
    this.pumpjackBaseContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: false,
        vertex: true,
        color: true,
      },
      texture: this.getPumpjackBaseTexture(),
    });
    this.pumpjackBeamContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: true,
        vertex: true,
        color: true,
      },
      texture: this.getPumpjackBeamTexture(),
    });
    this.rocketTrailContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: true,
        vertex: true,
        color: true,
      },
      texture: this.getLaunchRocketTrailTexture(),
    });
    this.parkedRocketContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: false,
        vertex: true,
        color: true,
      },
      texture: this.getLaunchRocketTexture(),
    });

    stage.addChild(this.backgroundSprite);
    stage.addChild(this.cloudContainer);
    stage.addChild(this.peopleContainer);
    stage.addChild(this.buildingContainer);
    stage.addChild(this.smokeContainer);
    stage.addChild(this.pumpjackBaseContainer);
    stage.addChild(this.pumpjackBeamContainer);
    stage.addChild(this.parkedRocketContainer);
    stage.addChild(this.rocketTrailContainer);

    this.stageReady = true;
  }

  private primeSpriteCache(): void {
    for (const config of BUILDING_COLUMNS) {
      const image = new Image();
      image.decoding = 'async';
      image.addEventListener('load', () => {
        const naturalWidth = Math.max(1, image.naturalWidth);
        const naturalHeight = Math.max(1, image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(naturalWidth * BUILDING_TEXTURE_SCALE));
        canvas.height = Math.max(1, Math.floor(naturalHeight * BUILDING_TEXTURE_SCALE));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          this.spriteTextures.set(config.key, textureFromCanvas(canvas));
        } else {
          this.spriteTextures.set(config.key, Texture.from(image));
        }
        this.spriteAspects.set(config.key, naturalWidth / naturalHeight);
        this.spriteReady.add(config.key);
      }, { once: true });
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(config.svg)}`;
    }
  }

  private rebuildBackground(width: number, height: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const horizonY = height * EARTH_HORIZON_Y_RATIO;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#08172a');
    sky.addColorStop(0.24, '#14304e');
    sky.addColorStop(0.52, '#1f5a91');
    sky.addColorStop(0.74, '#274d59');
    sky.addColorStop(1, '#0d1523');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const mountainFill = ctx.createLinearGradient(0, horizonY - (height * 0.04), 0, height);
    mountainFill.addColorStop(0, '#ffffff');
    mountainFill.addColorStop(0.29, '#1a3445');
    mountainFill.addColorStop(0.47, '#132235');
    mountainFill.addColorStop(0.51, '#1e3923');
    mountainFill.addColorStop(0.66, '#365d2a');
    mountainFill.addColorStop(1, '#39662b');
    ctx.fillStyle = mountainFill;
    ctx.beginPath();
    ctx.moveTo(0, horizonY + (height * 0.23));
    ctx.lineTo(width * 0.12, horizonY + (height * 0.1));
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

    const mountainFill2 = ctx.createLinearGradient(0, horizonY - (height * 0), 0, height);
    mountainFill2.addColorStop(0, '#ffffff');
    mountainFill2.addColorStop(0.35, '#1a3445');
    mountainFill2.addColorStop(0.55, '#132235');
    mountainFill2.addColorStop(0.63, '#1e3923');
    mountainFill2.addColorStop(0.66, '#365d2a');
    mountainFill2.addColorStop(1, '#39662b');
    ctx.fillStyle = mountainFill2;
    let sideBaseY = horizonY + (height * 0.35);
    ctx.beginPath();
    ctx.moveTo(0, sideBaseY);
    ctx.lineTo(0, horizonY + (height * 0.16));
    ctx.lineTo(width * 0.07, horizonY + (height * 0.07));
    ctx.lineTo(width * 0.14, horizonY + (height * 0.16));
    ctx.lineTo(width * 0.32, sideBaseY);
    ctx.closePath();
    ctx.fill();

    const mountainFill3 = ctx.createLinearGradient(0, horizonY - (height * 0.04), 0, height);
    mountainFill3.addColorStop(0, '#ffffff');
    mountainFill3.addColorStop(0.35, '#1a3445');
    mountainFill3.addColorStop(0.44, '#132235');
    mountainFill3.addColorStop(0.54, '#1e3923');
    mountainFill3.addColorStop(0.58, '#365d2a');
    mountainFill3.addColorStop(1, '#39662b');
    ctx.fillStyle = mountainFill3;
    sideBaseY = horizonY + (height * 0.32);
    ctx.beginPath();
    ctx.moveTo(width, sideBaseY);
    ctx.lineTo(width, horizonY + (height * 0.2));
    ctx.lineTo(width * 0.93, horizonY + (height * 0.1));
    ctx.lineTo(width * 0.88, horizonY + (height * 0.14));
    ctx.lineTo(width * 0.73, sideBaseY);
    ctx.closePath();
    ctx.fill();

    this.backgroundTexture = replaceManagedTexture(this.backgroundTexture, textureFromCanvas(canvas));
    this.backgroundSprite.texture = this.backgroundTexture;
    this.backgroundSprite.x = 0;
    this.backgroundSprite.y = 0;
    this.backgroundSprite.width = width;
    this.backgroundSprite.height = height;
  }

  private updateCloudSprites(width: number, height: number, horizonY: number): void {
    const nowSec = performance.now() / 1000;
    let placementCount = 0;
    for (const row of CLOUD_ROWS) {
      const spacing = width * 0.1 * row.scale;
      const visibleCount = Math.ceil(width / spacing) + 4;
      placementCount += visibleCount + 2;
    }

    this.syncSpritePool(this.cloudContainer, this.cloudSprites, placementCount, this.createCloudSprite);

    let placementIndex = 0;
    for (const row of CLOUD_ROWS) {
      const spacing = width * 0.1 * row.scale;
      const drift = ((nowSec * row.speed) + (width * row.offset)) % spacing;
      const visibleCount = Math.ceil(width / spacing) + 4;
      const baseIndex = Math.floor(((nowSec * row.speed) + (width * row.offset)) / spacing);
      for (let localIdx = -2; localIdx < visibleCount; localIdx++) {
        const worldIdx = baseIndex + localIdx;
        const centerX = (localIdx * spacing) - drift;
        const widthJitter = 0.82 + (0.22 * Math.sin((worldIdx * 1.73) + (row.offset * 9)));
        const heightJitter = 0.78 + (0.26 * Math.cos((worldIdx * 1.11) + (row.offset * 13)));
        const sprite = this.cloudSprites[placementIndex];
        if (!sprite) {
          continue;
        }
        const texture = this.getCloudTexture(Math.abs(worldIdx + Math.floor(row.offset * 100)) % 4);
        sprite.visible = true;
        sprite.texture = texture;
        sprite.x = centerX;
        sprite.y = horizonY + (height * row.yRatio) + (Math.sin((worldIdx * 0.9) + (nowSec * 0.2)) * height * 0.008);
        sprite.scale.x = (width * 0.13 * row.scale * widthJitter) / Math.max(1, texture.orig.width);
        sprite.scale.y = (height * 0.05 * row.scale * heightJitter) / Math.max(1, texture.orig.height);
        sprite.alpha = row.alpha;
        placementIndex++;
        this.lastFrameDrawCalls++;
      }
    }
    this.hideUnusedSprites(this.cloudSprites, placementIndex);
  }

  private updateForegroundSprites(width: number, height: number, baseY: number): void {
    const outerLeft = COLUMN_SIDE_PADDING_PX;
    const outerRight = width - COLUMN_SIDE_PADDING_PX;
    const totalUsableWidth = outerRight - outerLeft;
    const centerLaneWidth = totalUsableWidth * CENTER_COLUMNS_WIDTH_RATIO;
    const centerLaneLeft = outerLeft + ((totalUsableWidth - centerLaneWidth) * 0.5);
    const centerLaneRight = centerLaneLeft + centerLaneWidth;
    const laneWidth = centerLaneWidth;
    const perspectiveX = width * 0.5;
    const depthSpan = Math.max(36, height * EARTH_STACK_DEPTH_SPAN_RATIO);
    const topLimit = height * 0.1;
    const timeSec = performance.now() / 1000;
    this.buildingPlacementCount = 0;
    this.peoplePlacementCount = 0;
    this.smokePlacementCount = 0;
    this.pumpPlacementCount = 0;
    this.launchPadCount = 0;
    this.landingZoneCount = 0;

    for (const key of MULTI_ROW_BUILDING_KEYS) {
      const config = BUILDING_CONFIG_BY_KEY.get(key);
      if (!config) {
        continue;
      }
      const count = this.sampledCounts.get(key) ?? 0;
      if (count <= 0 || !this.spriteReady.has(key)) {
        continue;
      }
      const texture = this.spriteTextures.get(key);
      if (!texture) {
        continue;
      }
      const layout = MULTI_ROW_LAYOUTS[key];
      const sizingSpanLeft = layout.side === 'left' ? outerLeft : centerLaneRight;
      const sizingSpanRight = layout.side === 'left' ? centerLaneLeft : outerRight;
      const spanLeft = layout.side === 'left' ? outerLeft : centerLaneRight + SIDE_FIELD_INNER_GAP_PX;
      const spanRight = layout.side === 'left' ? centerLaneLeft - SIDE_FIELD_INNER_GAP_PX : outerRight;
      this.collectMultiRowPlacements(
        config,
        texture,
        count,
        Math.max(0, sizingSpanRight - sizingSpanLeft),
        spanLeft,
        spanRight,
        height,
        baseY - COLUMN_GROUND_OFFSET_PX,
        perspectiveX,
        depthSpan,
        topLimit,
      );
    }

    let columnLeft = centerLaneLeft;
    for (const config of SINGLE_ROW_BUILDING_COLUMNS) {
      const count = Math.min(MAX_BUILDINGS_PER_COLUMN, this.sampledCounts.get(config.key) ?? 0);
      const columnWidth = laneWidth * (config.columnWeight / Math.max(0.0001, SINGLE_ROW_BUILDING_TOTAL_WEIGHT));
      const centerX = columnLeft + (columnWidth * 0.5);
      const frontWidth = Math.max(20, columnWidth * COLUMN_BASE_SCALE);
      columnLeft += columnWidth;
      if (count <= 0 || !this.spriteReady.has(config.key)) {
        continue;
      }
      const texture = this.spriteTextures.get(config.key);
      if (!texture) {
        continue;
      }
      const aspect = this.spriteAspects.get(config.key) ?? config.fallbackAspect;
      const frontHeight = frontWidth / aspect;
      const floorY = baseY - COLUMN_GROUND_OFFSET_PX;

      let visibleCount = 0;
      for (let logicalRow = 0; logicalRow < count; logicalRow++) {
        this.fillStackProjection(
          this.stackProjectionScratch,
          centerX,
          floorY,
          frontWidth,
          frontHeight,
          logicalRow,
          perspectiveX,
          depthSpan,
        );
        if (this.stackProjectionScratch.y + this.stackProjectionScratch.height < topLimit) {
          break;
        }
        visibleCount++;
      }

      for (let row = 0; row < visibleCount; row++) {
        this.fillStackProjection(
          this.stackProjectionScratch,
          centerX,
          floorY,
          frontWidth,
          frontHeight,
          row,
          perspectiveX,
          depthSpan,
        );
        const projected = this.stackProjectionScratch;
        const drawWidth = projected.width * config.stackScale;
        const drawHeight = projected.height * config.stackScale;
        const depthOrder = (100000 - (row * 1000)) + projected.y;
        const buildingPlacement = this.acquireBuildingPlacement();
        buildingPlacement.texture = texture;
        buildingPlacement.x = projected.centerX - (drawWidth * 0.5);
        buildingPlacement.y = projected.y - drawHeight;
        buildingPlacement.width = drawWidth;
        buildingPlacement.height = drawHeight;
        buildingPlacement.z = depthOrder;
        buildingPlacement.alpha = this.getBuildingRowAlpha(row);
        buildingPlacement.rotation = undefined;

        if (config.key === 'mine') {
          const bodyWidth = projected.width * 0.62;
          const bodyHeight = projected.width * 0.42;
          const pumpPlacement = this.acquirePumpPlacement();
          pumpPlacement.x = projected.centerX - (bodyWidth * 0.33);
          pumpPlacement.y = (projected.y - (projected.height * 0.1)) - bodyHeight;
          pumpPlacement.width = bodyWidth * 0.66;
          pumpPlacement.height = bodyHeight;
          pumpPlacement.pivotX = projected.centerX - (bodyWidth * 0.04);
          pumpPlacement.pivotY = (projected.y - (projected.height * 0.1)) - (projected.width * 0.34);
          pumpPlacement.beamWidth = bodyWidth * 0.9;
          pumpPlacement.beamHeight = projected.width * 0.38;
          pumpPlacement.angle = Math.sin(timeSec * 1.3) * 0.24;
          pumpPlacement.z = depthOrder + 4;
        }

        if (config.key === 'rocket') {
          const padBaseY = projected.y - (drawHeight * 0.42);
          const rowPerspectiveScale = Math.pow(ROCKET_ROW_PERSPECTIVE_FALLOFF, row);
          const padWidth = Math.max(12, drawWidth * ROCKET_PAD_WIDTH_RATIO * rowPerspectiveScale);
          const rocketHeight = Math.max(ROCKET_MIN_HEIGHT, drawHeight * ROCKET_BASE_HEIGHT_RATIO * rowPerspectiveScale);
          const speedScale = Math.max(ROCKET_MIN_SPEED_SCALE, Math.min(1, rocketHeight / ROCKET_SPEED_HEIGHT_REFERENCE));
        
          for (let padIndex = 0; padIndex < ROCKET_PADS_PER_FACTORY; padIndex++) {
            const t = padIndex / (ROCKET_PADS_PER_FACTORY - 1);
            const xOffset = ((t - 0.5) * 2) * projected.width * ROCKET_PAD_SPREAD;
            const launchPad = this.acquireLaunchPad();
            launchPad.centerX = projected.centerX + xOffset;
            launchPad.baseY = padBaseY;
            launchPad.width = padWidth;
            launchPad.rocketHeight = rocketHeight;
            launchPad.speedScale = speedScale;
            launchPad.depthRow = row;
            launchPad.slotInFactory = padIndex;
          }
        }
      }

      if (COLUMN_SMOKE_KEYS.includes(config.key) && visibleCount > 0) {
        const dense = config.key === 'nuclear';
        const emitterRows = Math.min(MAX_SMOKE_ROWS, visibleCount);
        const puffCount = dense ? 7 : 6;
        for (let smokeRow = 0; smokeRow < emitterRows; smokeRow++) {
          this.fillStackProjection(
            this.stackProjectionScratch,
            centerX,
            floorY,
            frontWidth,
            frontHeight,
            smokeRow,
            perspectiveX,
            depthSpan,
          );
          const projected = this.stackProjectionScratch;
          const depthOrder = (100000 - (smokeRow * 1000)) + projected.y;
          for (let i = 0; i < puffCount; i++) {
            const phase = (timeSec * (dense ? 0.085 : 0.11)) + (i / puffCount);
            const phaseT = phase - Math.floor(phase);
            const smoothT = Math.sin(phaseT * Math.PI);
            const radiusX = projected.width * (dense ? 0.22 : 0.18) * (0.72 + (smoothT * 0.78));
            const radiusY = radiusX * (dense ? 0.68 : 0.54);
            const smokePlacement = this.acquireSmokePlacement();
            smokePlacement.x = projected.centerX + (Math.sin((timeSec * 0.8) + (i * 1.7)) * projected.width * 0.12);
            smokePlacement.y = projected.y - (projected.height * 0.82) - (phaseT * projected.width * (dense ? 1.1 : 0.9));
            smokePlacement.width = radiusX * 2;
            smokePlacement.height = radiusY * 2;
            smokePlacement.alpha = (dense ? 0.5 : 0.36) * smoothT * smoothT;
            smokePlacement.z = depthOrder + 20;
          }
        }
      }
    }

    this.collectPeoplePlacements(width, height, height - 1, timeSec);
    this.collectLandingZones(width, baseY, perspectiveX, depthSpan);

    this.buildingPlacements.length = this.buildingPlacementCount;
    this.buildingPlacements.sort(compareByZ);
    this.syncSpritePool(this.buildingContainer, this.buildingSprites, this.buildingPlacementCount, this.createBuildingSprite);
    for (let i = 0; i < this.buildingPlacementCount; i++) {
      const placement = this.buildingPlacements[i];
      const sprite = this.buildingSprites[i];
      sprite.visible = true;
      sprite.texture = placement.texture;
      sprite.x = placement.x;
      sprite.y = placement.y;
      sprite.scale.x = placement.width / Math.max(1, placement.texture.orig.width);
      sprite.scale.y = placement.height / Math.max(1, placement.texture.orig.height);
      sprite.alpha = placement.alpha ?? 1;
      this.lastFrameDrawCalls++;
    }
    this.hideUnusedSprites(this.buildingSprites, this.buildingPlacementCount);

    this.peoplePlacements.length = this.peoplePlacementCount;
    this.lastVisiblePeopleCount = this.peoplePlacementCount;
    this.peoplePlacements.sort(compareByZ);
    const peopleTexture = this.getPeopleTexture();
    this.peopleContainer.texture = peopleTexture;
    this.syncParticlePool(this.peopleContainer, this.peopleParticles, this.peoplePlacementCount, this.createPeopleParticle);
    const peopleScaleX = 1 / Math.max(1, peopleTexture.orig.width);
    const peopleScaleY = 1 / Math.max(1, peopleTexture.orig.height);
    for (let i = 0; i < this.peoplePlacementCount; i++) {
      const placement = this.peoplePlacements[i];
      const particle = this.peopleParticles[i];
      particle.x = placement.x;
      particle.y = placement.y;
      particle.scaleX = placement.size * peopleScaleX;
      particle.scaleY = placement.size * peopleScaleY;
      particle.alpha = placement.alpha;
      this.lastFrameDrawCalls++;
    }
    this.hideUnusedParticles(this.peopleParticles, this.peoplePlacementCount);

    this.smokePlacements.length = this.smokePlacementCount;
    this.smokePlacements.sort(compareByZ);
    const smokeTexture = this.getSmokeTexture();
    this.smokeContainer.texture = smokeTexture;
    this.syncParticlePool(this.smokeContainer, this.smokeParticles, this.smokePlacementCount, this.createSmokeParticle);
    const smokeScaleX = 1 / Math.max(1, smokeTexture.orig.width);
    const smokeScaleY = 1 / Math.max(1, smokeTexture.orig.height);
    for (let i = 0; i < this.smokePlacementCount; i++) {
      const placement = this.smokePlacements[i];
      const particle = this.smokeParticles[i];
      particle.x = placement.x;
      particle.y = placement.y;
      particle.scaleX = placement.width * smokeScaleX;
      particle.scaleY = placement.height * smokeScaleY;
      particle.alpha = placement.alpha;
      this.lastFrameDrawCalls++;
    }
    this.hideUnusedParticles(this.smokeParticles, this.smokePlacementCount);

    this.pumpPlacements.length = this.pumpPlacementCount;
    this.pumpPlacements.sort(compareByZ);
    const pumpjackBaseTexture = this.getPumpjackBaseTexture();
    const pumpjackBeamTexture = this.getPumpjackBeamTexture();
    this.pumpjackBaseContainer.texture = pumpjackBaseTexture;
    this.pumpjackBeamContainer.texture = pumpjackBeamTexture;
    this.syncParticlePool(this.pumpjackBaseContainer, this.pumpjackBaseParticles, this.pumpPlacementCount, this.createPumpjackBaseParticle);
    this.syncParticlePool(this.pumpjackBeamContainer, this.pumpjackBeamParticles, this.pumpPlacementCount, this.createPumpjackBeamParticle);
    const pumpjackBaseScaleX = 1 / Math.max(1, pumpjackBaseTexture.orig.width);
    const pumpjackBaseScaleY = 1 / Math.max(1, pumpjackBaseTexture.orig.height);
    const pumpjackBeamScaleX = 1 / Math.max(1, pumpjackBeamTexture.orig.width);
    const pumpjackBeamScaleY = 1 / Math.max(1, pumpjackBeamTexture.orig.height);
    for (let i = 0; i < this.pumpPlacementCount; i++) {
      const placement = this.pumpPlacements[i];
      const baseParticle = this.pumpjackBaseParticles[i];
      baseParticle.x = placement.x;
      baseParticle.y = placement.y;
      baseParticle.scaleX = placement.width * pumpjackBaseScaleX;
      baseParticle.scaleY = placement.height * pumpjackBaseScaleY;
      baseParticle.rotation = 0;
      baseParticle.alpha = 1;

      const beamParticle = this.pumpjackBeamParticles[i];
      beamParticle.x = placement.pivotX;
      beamParticle.y = placement.pivotY;
      beamParticle.scaleX = placement.beamWidth * pumpjackBeamScaleX;
      beamParticle.scaleY = placement.beamHeight * pumpjackBeamScaleY;
      beamParticle.rotation = placement.angle;
      beamParticle.alpha = 1;
      this.lastFrameDrawCalls += 2;
    }
    this.hideUnusedParticles(this.pumpjackBaseParticles, this.pumpPlacementCount);
    this.hideUnusedParticles(this.pumpjackBeamParticles, this.pumpPlacementCount);

    this.launchPads.length = this.launchPadCount;
    this.launchPads.sort(compareByDepthRow);
    this.landingZones.length = this.landingZoneCount;
    this.updateRocketSprites(this.launchPads, this.landingZones);
  }

  private collectPeoplePlacements(
    width: number,
    height: number,
    panelBottomY: number,
    timeSec: number,
  ): void {
    const personCount = Math.min(
      MAX_PEOPLE_DOTS,
      Math.ceil(this.sampledHumanWorkers / Math.max(1, PEOPLE_WORKERS_PER_DOT)),
    );
    if (personCount <= 0) {
      return;
    }

    const laneCenterX = width * 0.5;
    const laneWidth = Math.max(24, width - (COLUMN_SIDE_PADDING_PX * 2));
    const noise = (value: number): number => {
      const sample = Math.sin(value * 12.9898) * 43758.5453123;
      return sample - Math.floor(sample);
    };

    for (let i = 0; i < personCount; i++) {
      const depthT = noise((i * 0.71) + 1.3);
      const speed = 0.06 + (noise((i * 1.17) + 4.9) * 0.14);
      const direction = noise((i * 1.91) + 0.4) < 0.5 ? -1 : 1;
      const phase = ((timeSec * speed) + noise((i * 2.37) + 8.1)) % 1;
      const localTravel = ((phase * 2) - 1) * direction;
      const walkwayHalfWidth = laneWidth * 0.5;
      const x = laneCenterX + (localTravel * walkwayHalfWidth);
      const yBase = panelBottomY - (depthT * height * 0.19);
      const bob = Math.sin((phase * Math.PI * 6) + (i * 0.9)) * (0.2 + ((1 - depthT) * 0.65));
      const size = PEOPLE_MIN_SIZE + ((1 - depthT) * (PEOPLE_MAX_SIZE - PEOPLE_MIN_SIZE));
      const placement = this.acquirePeoplePlacement();
      placement.x = x;
      placement.y = yBase + bob;
      placement.size = size;
      placement.alpha = 0.32 + ((1 - depthT) * 0.58);
      placement.z = 100500 + ((1 - depthT) * 1200) + yBase;
    }
  }

  private primeLaunchEffectTextures(): void {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => {
      const naturalWidth = Math.max(1, image.naturalWidth);
      const naturalHeight = Math.max(1, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(naturalWidth * ROCKET_TRAIL_TEXTURE_SCALE));
      canvas.height = Math.max(1, Math.floor(naturalHeight * ROCKET_TRAIL_TEXTURE_SCALE));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        this.launchRocketTrailTexture = textureFromCanvas(canvas);
      } else {
        this.launchRocketTrailTexture = Texture.from(image);
      }
    }, { once: true });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(launchRocketTrailSvg)}`;
  }

  private collectLandingZones(
    width: number,
    baseY: number,
    perspectiveX: number,
    depthSpan: number,
  ): void {
    const left = width * 0;
    const right = width * 1;
    const frontRocketHeight = 22;
    const frontRocketWidth = frontRocketHeight * 0.32;
    for (let i = 0; i < LANDING_ZONE_COUNT; i++) {
      const xT = ((i * 0.61803398875) + 0.19) % 1;
      const depthT = 0.06 + ((((i * 0.41421356237) + 0.31) % 1) * 0.88);
      const centerX = left + ((right - left) * xT);
      const depthRow = Math.round(depthT * (MAX_BUILDINGS_PER_COLUMN * 0.8));
      this.fillStackProjection(
        this.stackProjectionScratch,
        centerX,
        baseY,
        frontRocketWidth,
        frontRocketHeight,
        depthRow,
        perspectiveX,
        depthSpan,
      );
      const zone = this.acquireLandingZone();
      zone.centerX = centerX;
      zone.baseY = this.stackProjectionScratch.y;
      zone.rocketHeight = Math.max(ROCKET_MIN_HEIGHT * 3, this.stackProjectionScratch.height);
      zone.depthRow = depthRow;
    }
  }

  private collectMultiRowPlacements(
    config: BuildingConfig,
    texture: Texture,
    count: number,
    sizingSpanWidth: number,
    spanLeft: number,
    spanRight: number,
    height: number,
    floorY: number,
    perspectiveX: number,
    depthSpan: number,
    topLimit: number,
  ): void {
    const layout = MULTI_ROW_LAYOUTS[config.key as 'solar' | 'datacenterMega'];
    const spanWidth = Math.max(0, spanRight - spanLeft);
    if (spanWidth <= 8) {
      return;
    }
    const aspect = this.spriteAspects.get(config.key) ?? config.fallbackAspect;
    const firstWidth = Math.max(
      18,
      Math.min(sizingSpanWidth * layout.frontWidthRatio, height * layout.frontHeightRatio * aspect),
    );
    const firstHeight = firstWidth / aspect;
    const firstGap = Math.max(2, firstWidth * layout.gapToWidth);
    const baseStep = (firstWidth * config.stackScale) + firstGap;
    const frontLogicalRow = layout.startDepthRow;
    const frontDepth = 1 - Math.pow(EARTH_STACK_DEPTH_FALLOFF, frontLogicalRow);
    const frontXProjectionFactor = Math.max(0.0001, 1 - (frontDepth * COLUMN_PERSPECTIVE_PULL));
    this.fillStackProjection(
      this.stackProjectionScratch,
      perspectiveX,
      floorY,
      firstWidth,
      firstHeight,
      frontLogicalRow,
      perspectiveX,
      depthSpan,
    );
    const frontProjectedWidth = this.stackProjectionScratch.width * config.stackScale;
    const frontMinCenterX = spanLeft + (frontProjectedWidth * 0.5);
    const frontMaxCenterX = spanRight - (frontProjectedWidth * 0.5);
    const frontBaseMinCenterX = perspectiveX + ((frontMinCenterX - perspectiveX) / frontXProjectionFactor);
    const frontBaseMaxCenterX = perspectiveX + ((frontMaxCenterX - perspectiveX) / frontXProjectionFactor);
    let frontMinSlotIndex = Math.ceil((frontBaseMinCenterX - perspectiveX) / baseStep);
    let frontMaxSlotIndex = Math.floor((frontBaseMaxCenterX - perspectiveX) / baseStep);
    if (layout.side === 'left') {
      frontMinSlotIndex -= layout.extraSlots;
      frontMaxSlotIndex = Math.min(frontMaxSlotIndex, -1);
    } else {
      frontMinSlotIndex = Math.max(frontMinSlotIndex, 1);
      frontMaxSlotIndex += layout.extraSlots;
    }
    if (frontMinSlotIndex > frontMaxSlotIndex) {
      return;
    }

    let remaining = count;
    let renderedRowCount = 0;
    for (let rowIndex = 0; rowIndex < MAX_BUILDINGS_PER_COLUMN && remaining > 0; rowIndex++) {
      const logicalRow = layout.startDepthRow + rowIndex;
      const depth = 1 - Math.pow(EARTH_STACK_DEPTH_FALLOFF, logicalRow);
      const xProjectionFactor = Math.max(0.0001, 1 - (depth * COLUMN_PERSPECTIVE_PULL));
      this.fillStackProjection(
        this.stackProjectionScratch,
        perspectiveX,
        floorY,
        firstWidth,
        firstHeight,
        logicalRow,
        perspectiveX,
        depthSpan,
      );
      const rowProjected = this.stackProjectionScratch;
      if (rowProjected.y + rowProjected.height < topLimit) {
        break;
      }

      const depthOrder = (100000 - (logicalRow * 1000)) + rowProjected.y;
      const rowProjectedWidth = rowProjected.width * config.stackScale;
      const rowMinCenterX = spanLeft + (rowProjectedWidth * 0.5);
      const rowMaxCenterX = spanRight - (rowProjectedWidth * 0.5);
      const rowBaseMinCenterX = perspectiveX + ((rowMinCenterX - perspectiveX) / xProjectionFactor);
      const rowBaseMaxCenterX = perspectiveX + ((rowMaxCenterX - perspectiveX) / xProjectionFactor);
      let rowMinSlotIndex = Math.ceil((rowBaseMinCenterX - perspectiveX) / baseStep);
      let rowMaxSlotIndex = Math.floor((rowBaseMaxCenterX - perspectiveX) / baseStep);
      if (layout.side === 'left') {
        rowMinSlotIndex -= 1;
        rowMaxSlotIndex = Math.min(rowMaxSlotIndex, -1);
      } else {
        rowMinSlotIndex = Math.max(rowMinSlotIndex, 1);
        rowMaxSlotIndex += 1;
      }
      let minSlotIndex = frontMinSlotIndex;
      let maxSlotIndex = frontMaxSlotIndex;
      if (layout.side === 'left') {
        minSlotIndex = Math.min(frontMinSlotIndex, rowMinSlotIndex);
      } else {
        maxSlotIndex = Math.max(frontMaxSlotIndex, rowMaxSlotIndex);
      }
      if (minSlotIndex > maxSlotIndex) {
        continue;
      }
      let renderedInRow = 0;
      const rowAlpha = this.getBuildingRowAlpha(renderedRowCount);
      if (layout.side === 'left') {
        for (let slotIndex = maxSlotIndex; slotIndex >= minSlotIndex && remaining > 0; slotIndex--) {
          const baseCenterX = perspectiveX + (slotIndex * baseStep);
          this.fillStackProjection(
            this.stackProjectionScratch,
            baseCenterX,
            floorY,
            firstWidth,
            firstHeight,
            logicalRow,
            perspectiveX,
            depthSpan,
          );
          const projected = this.stackProjectionScratch;
          const projectedWidth = projected.width * config.stackScale;
          const projectedHeight = projected.height * config.stackScale;
          const placement = this.acquireBuildingPlacement();
          placement.texture = texture;
          placement.x = projected.centerX - (projectedWidth * 0.5);
          placement.y = projected.y - projectedHeight;
          placement.width = projectedWidth;
          placement.height = projectedHeight;
          placement.z = depthOrder;
          placement.alpha = rowAlpha;
          placement.rotation = undefined;
          renderedInRow++;
          remaining--;
        }
      } else {
        for (let slotIndex = minSlotIndex; slotIndex <= maxSlotIndex && remaining > 0; slotIndex++) {
          const baseCenterX = perspectiveX + (slotIndex * baseStep);
          this.fillStackProjection(
            this.stackProjectionScratch,
            baseCenterX,
            floorY,
            firstWidth,
            firstHeight,
            logicalRow,
            perspectiveX,
            depthSpan,
          );
          const projected = this.stackProjectionScratch;
          const projectedWidth = projected.width * config.stackScale;
          const projectedHeight = projected.height * config.stackScale;
          const placement = this.acquireBuildingPlacement();
          placement.texture = texture;
          placement.x = projected.centerX - (projectedWidth * 0.5);
          placement.y = projected.y - projectedHeight;
          placement.width = projectedWidth;
          placement.height = projectedHeight;
          placement.z = depthOrder;
          placement.alpha = rowAlpha;
          placement.rotation = undefined;
          renderedInRow++;
          remaining--;
        }
      }

      if (renderedInRow <= 0) {
        break;
      }
      renderedRowCount++;
    }
  }

  private getBuildingRowAlpha(row: number): number {
    if (MAX_BUILDINGS_PER_COLUMN <= 1) {
      return 1;
    }
    const rowT = row / Math.max(1, MAX_BUILDINGS_PER_COLUMN - 1);
    if (rowT <= BUILDING_ROW_FADE_START) {
      return 1;
    }
    const fadeT = (rowT - BUILDING_ROW_FADE_START) / (1 - BUILDING_ROW_FADE_START);
    return 1 - ((1 - BUILDING_ROW_FADE_MIN_ALPHA) * fadeT);
  }

  private updateRocketSprites(launchPads: LaunchPadPlacement[], landingZones: LandingZonePlacement[]): void {
    this.rocketTrailPlacementCount = 0;
    this.parkedRocketPlacementCount = 0;
    this.occupiedPadFlags.length = launchPads.length;
    for (let i = 0; i < launchPads.length; i++) {
      this.occupiedPadFlags[i] = false;
    }
    let renderedReturnTrails = 0;
    const launchPadIndices = this.getLaunchPadOrder(launchPads);
    const parkedPadIndices = this.getParkedPadOrder(launchPads);
    this.lastVisibleLaunchPadCount = launchPads.length;
    this.lastVisibleLaunchSourceCount = launchPadIndices.length;

    let nextLaunchTrailCount = 0;
    for (let i = 0; i < this.launchTrails.length; i++) {
      const launch = this.launchTrails[i];
      if (launchPads.length <= 0 || launchPadIndices.length <= 0) {
        this.launchTrails[nextLaunchTrailCount++] = launch;
        continue;
      }
      const padIndex = launchPadIndices[launch.sourceIndex % launchPadIndices.length];
      const emitter = launchPads[padIndex];
      if (!emitter) {
        this.launchTrails[nextLaunchTrailCount++] = launch;
        continue;
      }
      this.occupiedPadFlags[padIndex] = true;
      const progress = Math.max(0, launch.progress);
      const visualProgress = clamp01(progress);
      const rocketHeight = Math.max(ROCKET_MIN_HEIGHT * 0.66, emitter.rocketHeight * (1 - (visualProgress * ROCKET_LAUNCH_SHRINK_RATIO)));
      const rocketWidth = rocketHeight * 0.32;
      const launchOffset = Math.max(emitter.rocketHeight * 0.55, emitter.rocketHeight * Math.max(0.2, 0.34 + launch.heightBias));
      const travelDistance = emitter.baseY + rocketHeight + 12;
      const rise = launchOffset + (progress * travelDistance * emitter.speedScale);
      const padSink = emitter.rocketHeight * ROCKET_PAD_SINK_RATIO;
      const sway = Math.sin((visualProgress * Math.PI) + (launch.padSeed * Math.PI * 2)) * emitter.width * 0.016;
      const directionalDrift = launch.directionBias * travelDistance * visualProgress * visualProgress * ROCKET_LAUNCH_DIRECTION_DRIFT_RATIO;
      const rocketTilt = launch.directionBias * ROCKET_LAUNCH_TILT_MAX * Math.min(1, visualProgress * 1.4);
      const rocketX = emitter.centerX + sway + directionalDrift;
      const rocketY = emitter.baseY + padSink - rise;
      if (rocketY + rocketHeight < 0) {
        continue;
      }
      this.launchTrails[nextLaunchTrailCount++] = launch;
      const trailPlacement = this.acquireRocketTrailPlacement();
      trailPlacement.texture = this.getLaunchRocketTrailTexture();
      trailPlacement.x = rocketX - (rocketWidth * 0.16);
      trailPlacement.y = rocketY;
      trailPlacement.width = rocketWidth * 1.32;
      trailPlacement.height = rocketHeight * 1.92;
      trailPlacement.z = 0;
      trailPlacement.rotation = rocketTilt;
      trailPlacement.alpha = undefined;
    }
    this.launchTrails.length = nextLaunchTrailCount;

    let nextReturnTrailCount = 0;
    for (let i = 0; i < this.returnTrails.length; i++) {
      const trail = this.returnTrails[i];
      if (trail.delaySec > 0) {
        this.returnTrails[nextReturnTrailCount++] = trail;
        continue;
      }
      if (landingZones.length <= 0) {
        this.returnTrails[nextReturnTrailCount++] = trail;
        continue;
      }
      const zone = landingZones[trail.targetIndex % landingZones.length];
      if (!zone) {
        this.returnTrails[nextReturnTrailCount++] = trail;
        continue;
      }
      const visualProgress = clamp01(trail.progress);
      const perspectiveScale = Math.max(0.52, 1 - (zone.depthRow * 0.08));
      const rocketHeight = Math.max(
        ROCKET_MIN_HEIGHT * 0.75,
        zone.rocketHeight * (0.88 + ((1 - visualProgress) * 0.18)),
      );
      const rocketWidth = rocketHeight * 0.32;
      const startY = -rocketHeight - ((trail.heightBias + (zone.depthRow * 0.08)) * 120);
      const touchdownY = zone.baseY - rocketHeight;
      const sway = Math.sin((visualProgress * Math.PI * 2) + (trail.targetSeed * Math.PI * 2))
        * ((8 + (zone.depthRow * 0.8)) * perspectiveScale);
      const drift = trail.driftBias * (1 - visualProgress) * 24 * perspectiveScale;
      const rocketTilt = trail.driftBias * 0.06 * (1 - visualProgress);
      const rocketX = zone.centerX + sway + drift;
      const rocketY = startY + ((touchdownY - startY) * visualProgress);
      if (rocketY >= touchdownY) {
        continue;
      }
      this.returnTrails[nextReturnTrailCount++] = trail;
      if (rocketY + rocketHeight < 0) {
        continue;
      }
      if (renderedReturnTrails >= MAX_RENDERED_RETURN_TRAILS) {
        continue;
      }
      const fadeOut = clamp01((1 - visualProgress) / 0.16);
      const fadeIn = clamp01(visualProgress / 0.14);
      const alpha = fadeIn * fadeOut;
      const trailPlacement = this.acquireRocketTrailPlacement();
      trailPlacement.texture = this.getLaunchRocketTrailTexture();
      trailPlacement.x = rocketX - (rocketWidth * 0.16);
      trailPlacement.y = rocketY;
      trailPlacement.width = rocketWidth * 1.32;
      trailPlacement.height = rocketHeight * 1.92;
      trailPlacement.z = 0;
      trailPlacement.rotation = rocketTilt;
      trailPlacement.alpha = alpha;
      renderedReturnTrails++;
    }
    this.returnTrails.length = nextReturnTrailCount;

    let parked = Math.min(this.sampledRocketInventory, parkedPadIndices.length);
    for (let parkedIndex = 0; parkedIndex < parkedPadIndices.length; parkedIndex++) {
      if (parked <= 0) {
        break;
      }
      const padIndex = parkedPadIndices[parkedIndex];
      if (this.occupiedPadFlags[padIndex]) {
        continue;
      }
      const emitter = launchPads[padIndex];
      const rocketHeight = emitter.rocketHeight;
      const rocketWidth = rocketHeight * 0.32;
      const padSink = emitter.rocketHeight * ROCKET_PAD_SINK_RATIO;
      const parkedPlacement = this.acquireParkedRocketPlacement();
      parkedPlacement.texture = this.getLaunchRocketTexture();
      parkedPlacement.x = emitter.centerX;
      parkedPlacement.y = emitter.baseY + padSink - rocketHeight;
      parkedPlacement.width = rocketWidth;
      parkedPlacement.height = rocketHeight;
      parkedPlacement.z = 0;
      parkedPlacement.alpha = undefined;
      parkedPlacement.rotation = undefined;
      parked--;
    }
    const launchTrailTexture = this.getLaunchRocketTrailTexture();
    this.rocketTrailContainer.texture = launchTrailTexture;
    this.rocketTrailPlacements.length = this.rocketTrailPlacementCount;
    this.syncParticlePool(this.rocketTrailContainer, this.rocketTrailParticles, this.rocketTrailPlacementCount, this.createRocketTrailParticle);
    for (let i = 0; i < this.rocketTrailPlacementCount; i++) {
      const placement = this.rocketTrailPlacements[i];
      const particle = this.rocketTrailParticles[i];
      particle.texture = placement.texture;
      particle.x = placement.x;
      particle.y = placement.y;
      particle.scaleX = placement.width / Math.max(1, placement.texture.orig.width);
      particle.scaleY = placement.height / Math.max(1, placement.texture.orig.height);
      particle.alpha = placement.alpha ?? 1;
      particle.rotation = placement.rotation ?? 0;
      this.lastFrameDrawCalls++;
    }
    this.hideUnusedParticles(this.rocketTrailParticles, this.rocketTrailPlacementCount);
    const rocketTexture = this.getLaunchRocketTexture();
    this.parkedRocketContainer.texture = rocketTexture;
    this.parkedRocketPlacements.length = this.parkedRocketPlacementCount;
    this.syncParticlePool(this.parkedRocketContainer, this.parkedRocketParticles, this.parkedRocketPlacementCount, this.createParkedRocketParticle);
    for (let i = 0; i < this.parkedRocketPlacementCount; i++) {
      const placement = this.parkedRocketPlacements[i];
      const particle = this.parkedRocketParticles[i];
      particle.texture = placement.texture;
      particle.x = placement.x;
      particle.y = placement.y;
      particle.scaleX = placement.width / Math.max(1, placement.texture.orig.width);
      particle.scaleY = placement.height / Math.max(1, placement.texture.orig.height);
      particle.alpha = placement.alpha ?? 1;
      particle.rotation = 0;
      this.lastFrameDrawCalls++;
    }
    this.hideUnusedParticles(this.parkedRocketParticles, this.parkedRocketPlacementCount);
  }

  private fillStackProjection(
    out: StackProjection,
    baseCenterX: number,
    floorY: number,
    frontWidth: number,
    frontHeight: number,
    logicalRow: number,
    perspectiveX: number,
    depthSpan: number,
  ): void {
    const depth = 1 - Math.pow(EARTH_STACK_DEPTH_FALLOFF, logicalRow);
    const scale = 1 - (EARTH_STACK_SCALE_FALLOFF * depth);
    out.centerX = baseCenterX + ((perspectiveX - baseCenterX) * depth * COLUMN_PERSPECTIVE_PULL);
    out.y = floorY - (depth * depthSpan);
    out.width = frontWidth * scale;
    out.height = frontHeight * scale;
  }

  private acquireBuildingPlacement(): BuildingPlacement {
    const placement = this.buildingPlacements[this.buildingPlacementCount];
    this.buildingPlacementCount++;
    if (placement) {
      return placement;
    }
    const created: BuildingPlacement = {
      texture: Texture.EMPTY,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      z: 0,
    };
    this.buildingPlacements.push(created);
    return created;
  }

  private acquirePeoplePlacement(): PeoplePlacement {
    const placement = this.peoplePlacements[this.peoplePlacementCount];
    this.peoplePlacementCount++;
    if (placement) {
      return placement;
    }
    const created: PeoplePlacement = {
      x: 0,
      y: 0,
      size: 0,
      alpha: 0,
      z: 0,
    };
    this.peoplePlacements.push(created);
    return created;
  }

  private acquireSmokePlacement(): SmokePlacement {
    const placement = this.smokePlacements[this.smokePlacementCount];
    this.smokePlacementCount++;
    if (placement) {
      return placement;
    }
    const created: SmokePlacement = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      alpha: 0,
      z: 0,
    };
    this.smokePlacements.push(created);
    return created;
  }

  private acquirePumpPlacement(): PumpPlacement {
    const placement = this.pumpPlacements[this.pumpPlacementCount];
    this.pumpPlacementCount++;
    if (placement) {
      return placement;
    }
    const created: PumpPlacement = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      pivotX: 0,
      pivotY: 0,
      beamWidth: 0,
      beamHeight: 0,
      angle: 0,
      z: 0,
    };
    this.pumpPlacements.push(created);
    return created;
  }

  private acquireLaunchPad(): LaunchPadPlacement {
    const placement = this.launchPads[this.launchPadCount];
    this.launchPadCount++;
    if (placement) {
      return placement;
    }
    const created: LaunchPadPlacement = {
      centerX: 0,
      baseY: 0,
      width: 0,
      rocketHeight: 0,
      speedScale: 0,
      depthRow: 0,
      slotInFactory: 0,
    };
    this.launchPads.push(created);
    return created;
  }

  private acquireLandingZone(): LandingZonePlacement {
    const placement = this.landingZones[this.landingZoneCount];
    this.landingZoneCount++;
    if (placement) {
      return placement;
    }
    const created: LandingZonePlacement = {
      centerX: 0,
      baseY: 0,
      rocketHeight: 0,
      depthRow: 0,
    };
    this.landingZones.push(created);
    return created;
  }

  private acquireRocketTrailPlacement(): BuildingPlacement {
    const placement = this.rocketTrailPlacements[this.rocketTrailPlacementCount];
    this.rocketTrailPlacementCount++;
    if (placement) {
      return placement;
    }
    const created: BuildingPlacement = {
      texture: Texture.EMPTY,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      z: 0,
    };
    this.rocketTrailPlacements.push(created);
    return created;
  }

  private acquireParkedRocketPlacement(): BuildingPlacement {
    const placement = this.parkedRocketPlacements[this.parkedRocketPlacementCount];
    this.parkedRocketPlacementCount++;
    if (placement) {
      return placement;
    }
    const created: BuildingPlacement = {
      texture: Texture.EMPTY,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      z: 0,
    };
    this.parkedRocketPlacements.push(created);
    return created;
  }

  private readonly createCloudSprite = (): Sprite => {
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5, 0.5);
    return sprite;
  };

  private readonly createBuildingSprite = (): Sprite => {
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0, 0);
    return sprite;
  };

  private readonly createPeopleParticle = (): Particle => {
    return new Particle({
      texture: this.getPeopleTexture(),
      anchorX: 0.5,
      anchorY: 0.5,
    });
  };

  private readonly createSmokeParticle = (): Particle => {
    return new Particle({
      texture: this.getSmokeTexture(),
      anchorX: 0.5,
      anchorY: 0.5,
    });
  };

  private readonly createPumpjackBaseParticle = (): Particle => {
    return new Particle({
      texture: this.getPumpjackBaseTexture(),
      anchorX: 0,
      anchorY: 0,
    });
  };

  private readonly createPumpjackBeamParticle = (): Particle => {
    return new Particle({
      texture: this.getPumpjackBeamTexture(),
      anchorX: 0.5,
      anchorY: 32 / 90,
    });
  };

  private readonly createRocketTrailParticle = (): Particle => {
    return new Particle({
      texture: this.getLaunchRocketTrailTexture(),
      anchorX: 0.5,
      anchorY: 0,
    });
  };

  private readonly createParkedRocketParticle = (): Particle => {
    return new Particle({
      texture: this.getLaunchRocketTexture(),
      anchorX: 0.5,
      anchorY: 0,
    });
  };

  private syncSpritePool(
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
    while (pool.length > targetCount) {
      const particle = pool.pop();
      if (!particle) {
        break;
      }
      container.removeParticle(particle);
    }
  }

  private hideUnusedSprites(pool: Sprite[], usedCount: number): void {
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

  private getCloudTexture(variant: number): Texture {
    if (this.cloudTextures[variant]) {
      return this.cloudTextures[variant];
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.cloudTextures[variant] = Texture.EMPTY;
      return this.cloudTextures[variant];
    }
    ctx.fillStyle = 'rgba(213, 225, 236, 1)';
    ctx.beginPath();
    if (variant === 0) {
      ctx.ellipse(112, 64, 58, 24, 0, 0, Math.PI * 2);
      ctx.ellipse(76, 70, 34, 23, 0, 0, Math.PI * 2);
      ctx.ellipse(144, 60, 31, 21, 0, 0, Math.PI * 2);
      ctx.ellipse(186, 72, 21, 15, 0, 0, Math.PI * 2);
    } else if (variant === 1) {
      ctx.ellipse(98, 68, 50, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(62, 74, 28, 19, 0, 0, Math.PI * 2);
      ctx.ellipse(138, 56, 38, 24, 0, 0, Math.PI * 2);
      ctx.ellipse(184, 68, 30, 18, 0, 0, Math.PI * 2);
    } else if (variant === 2) {
      ctx.ellipse(118, 62, 64, 23, 0, 0, Math.PI * 2);
      ctx.ellipse(82, 76, 30, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(154, 60, 28, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(44, 68, 20, 14, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(108, 70, 54, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(68, 62, 26, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(150, 64, 36, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(198, 76, 18, 12, 0, 0, Math.PI * 2);
      ctx.ellipse(32, 74, 18, 13, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    this.cloudTextures[variant] = textureFromCanvas(canvas);
    return this.cloudTextures[variant];
  }

  private getPeopleTexture(): Texture {
    if (this.peopleTexture) {
      return this.peopleTexture;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.peopleTexture = Texture.EMPTY;
      return this.peopleTexture;
    }
    ctx.fillStyle = 'rgba(18, 28, 42, 0.35)';
    ctx.beginPath();
    ctx.arc(8, 10.5, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e3edf8';
    ctx.beginPath();
    ctx.arc(8, 7.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
    this.peopleTexture = textureFromCanvas(canvas);
    return this.peopleTexture;
  }

  private getSmokeTexture(): Texture {
    if (this.smokeTexture) {
      return this.smokeTexture;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.smokeTexture = Texture.EMPTY;
      return this.smokeTexture;
    }
    const gradient = ctx.createRadialGradient(80, 60, 8, 80, 60, 56);
    gradient.addColorStop(0, 'rgba(210, 218, 226, 0.9)');
    gradient.addColorStop(0.58, 'rgba(210, 218, 226, 0.46)');
    gradient.addColorStop(1, 'rgba(210, 218, 226, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(80, 60, 56, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    this.smokeTexture = textureFromCanvas(canvas);
    return this.smokeTexture;
  }

  private getPumpjackBaseTexture(): Texture {
    if (this.pumpjackBaseTexture) {
      return this.pumpjackBaseTexture;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.pumpjackBaseTexture = Texture.EMPTY;
      return this.pumpjackBaseTexture;
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
    this.pumpjackBaseTexture = textureFromCanvas(canvas);
    return this.pumpjackBaseTexture;
  }

  private getPumpjackBeamTexture(): Texture {
    if (this.pumpjackBeamTexture) {
      return this.pumpjackBeamTexture;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.pumpjackBeamTexture = Texture.EMPTY;
      return this.pumpjackBeamTexture;
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
    this.pumpjackBeamTexture = textureFromCanvas(canvas);
    return this.pumpjackBeamTexture;
  }

  private getLaunchRocketTexture(): Texture {
    if (this.launchRocketTexture) {
      return this.launchRocketTexture;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 72;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.launchRocketTexture = Texture.EMPTY;
      return this.launchRocketTexture;
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
    this.launchRocketTexture = textureFromCanvas(canvas);
    return this.launchRocketTexture;
  }

  private getLaunchRocketTrailTexture(): Texture {
    return this.launchRocketTrailTexture ?? Texture.EMPTY;
  }

  private makeLaunchTrail(): LaunchTrail {
    const sourceIndex = this.nextLaunchSourceIndex;
    this.nextLaunchSourceIndex = (this.nextLaunchSourceIndex + 1) % Math.max(1, MAX_BUILDINGS_PER_COLUMN);
    return {
      progress: 0,
      speed: this.rng.nextRange(0.08, 0.18),
      padSeed: this.rng.next(),
      sourceIndex,
      heightBias: this.rng.nextRange(-0.04, 0.07),
      directionBias: this.rng.nextRange(-10, 10),
    };
  }

  private makeReturnTrail(): ReturnTrail {
    const targetIndex = this.nextReturnTargetIndex;
    this.nextReturnTargetIndex = (this.nextReturnTargetIndex + 1) % LANDING_ZONE_COUNT;
    return {
      delaySec: this.rng.nextRange(0.8, 2.2),
      progress: 0,
      speed: this.rng.nextRange(0.11, 0.19),
      targetSeed: this.rng.next(),
      targetIndex,
      driftBias: this.rng.nextRange(-1, 1),
      heightBias: this.rng.nextRange(0.1, 0.9),
    };
  }

  private getLaunchPadOrder(launchPads: LaunchPadPlacement[]): number[] {
    this.launchPadOrder.length = 0;
    const launchSlot = ROCKET_PADS_PER_FACTORY - 1;
    for (let i = 0; i < launchPads.length; i++) {
      if (launchPads[i].slotInFactory === launchSlot) {
        this.launchPadOrder.push(i);
      }
    }
    return this.launchPadOrder;
  }

  private getParkedPadOrder(launchPads: LaunchPadPlacement[]): number[] {
    this.parkedPadOrder.length = 0;
    for (let slot = ROCKET_PADS_PER_FACTORY - 1; slot >= 0; slot--) {
      for (let i = 0; i < launchPads.length; i++) {
        if (launchPads[i].slotInFactory === slot) {
          this.parkedPadOrder.push(i);
        }
      }
    }
    return this.parkedPadOrder;
  }
}
