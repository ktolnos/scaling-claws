import { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js';
import { earthSvg } from '../../assets/sprites.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import type { GameState } from '../../game/GameState.ts';
import { fromBigInt } from '../../game/utils.ts';
import type { VisualScene } from './VisualScene.ts';
import { clamp01 } from './lod.ts';
import { createPixiSceneHost, replaceManagedTexture, textureFromCanvas } from './pixiHost.ts';
import type { PixiSceneHost } from './pixiHost.ts';
import { hashSeed, SeededRng } from './seededRng.ts';

interface PlanetLayout {
  centerX: number;
  centerY: number;
  radius: number;
}

interface OrbitBandDefinition {
  key: 'leo' | 'sso' | 'high';
  label: string;
  sourceStart: number;
  maxVisible: number;
  minPlanes: number;
  maxPlanes: number;
  radiusMinMultiplier: number;
  radiusMaxMultiplier: number;
  inclinationBaseDeg: number;
  inclinationSpreadDeg: number;
  speedMin: number;
  speedMax: number;
  particleSizeMin: number;
  particleSizeMax: number;
  seedSalt: number;
}

interface OrbitBandState {
  definition: OrbitBandDefinition;
  sourceCount: number;
  visibleCount: number;
  planeCount: number;
  overflowSizeMultiplier: number;
}

interface OrbitParticleState {
  radiusMultiplier: number;
  cosNode: number;
  sinNode: number;
  cosInclination: number;
  sinInclination: number;
  orbitalSpeed: number;
  phaseBase: number;
  size: number;
}

interface CityLightPlacement {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

interface RocketLaunchParticle {
  route: 'orbit' | 'moon';
  siteIndex: number;
  progress: number;
  speed: number;
  drift: number;
  size: number;
  alpha: number;
}

interface BackgroundStar {
  baseX: number;
  baseY: number;
  size: number;
  alpha: number;
  driftFactor: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

const EARTH_TEXTURE_SCALE = 6;
const BACKGROUND_STAR_DENSITY = 0.00022;
const BACKGROUND_STAR_MIN = 70;
const BACKGROUND_STAR_MAX = 230;
const STARFIELD_BASE_DRIFT_SPEED = 18;
const PARTICLE_ALPHA = 1;
const MAX_VISIBLE_LEO_SATELLITES = 1000;
const MAX_VISIBLE_SSO_SATELLITES = 1000;
const MAX_VISIBLE_HIGH_ORBIT_SATELLITES = 1000;
const SATELLITE_OVERFLOW_SIZE_LOG_FACTOR = 0.22;
const SATELLITE_OVERFLOW_SIZE_LOG_BASE = 10;
const MAX_CITY_LIGHTS = 24;
const MAX_BUILDING_LIGHTS = 1000;
const BUILDINGS_PER_BUILDING_LIGHT = 1000;
const MAX_ROCKET_LAUNCH_SITES = 18;
const MAX_ACTIVE_ORBIT_LAUNCHES = 96;
const MAX_ACTIVE_MOON_LAUNCHES = 42;
const MAX_NEW_ORBIT_LAUNCHES_PER_SAMPLE = 10;
const MAX_NEW_MOON_LAUNCHES_PER_SAMPLE = 8;
const ROCKET_LAUNCH_MIN_SPEED = 0.42;
const ROCKET_LAUNCH_MAX_SPEED = 0.86;

const ORBIT_BANDS: OrbitBandDefinition[] = [
  {
    key: 'leo',
    label: 'LEO',
    sourceStart: 0,
    maxVisible: MAX_VISIBLE_LEO_SATELLITES,
    minPlanes: 4,
    maxPlanes: 24,
    radiusMinMultiplier: 1.18,
    radiusMaxMultiplier: 1.42,
    inclinationBaseDeg: 32,
    inclinationSpreadDeg: 56,
    speedMin: 0.08,
    speedMax: 0.14,
    particleSizeMin: 1.8,
    particleSizeMax: 2.7,
    seedSalt: 0x13579bdf,
  },
  {
    key: 'sso',
    label: 'SSO',
    sourceStart: 96,
    maxVisible: MAX_VISIBLE_SSO_SATELLITES,
    minPlanes: 3,
    maxPlanes: 16,
    radiusMinMultiplier: 1.38,
    radiusMaxMultiplier: 1.66,
    inclinationBaseDeg: 97,
    inclinationSpreadDeg: 10,
    speedMin: 0.048,
    speedMax: 0.082,
    particleSizeMin: 1.8,
    particleSizeMax: 2.5,
    seedSalt: 0x2468ace1,
  },
  {
    key: 'high',
    label: 'High Orbit',
    sourceStart: 320,
    maxVisible: MAX_VISIBLE_HIGH_ORBIT_SATELLITES,
    minPlanes: 3,
    maxPlanes: 12,
    radiusMinMultiplier: 1.62,
    radiusMaxMultiplier: 2.04,
    inclinationBaseDeg: 24,
    inclinationSpreadDeg: 72,
    speedMin: 0.02,
    speedMax: 0.042,
    particleSizeMin: 1.6,
    particleSizeMax: 2.3,
    seedSalt: 0x55aa33dd,
  },
];

function toWholeCount(value: bigint): number {
  const numeric = fromBigInt(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function seededUnit(seed: number, salt: number): number {
  return hashSeed(seed, salt) / 4294967296;
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function getLogOverflowMultiplier(overflowCount: number): number {
  if (overflowCount <= 0) {
    return 1;
  }
  return 1 + (
    (Math.log1p(overflowCount) / Math.log(SATELLITE_OVERFLOW_SIZE_LOG_BASE))
    * SATELLITE_OVERFLOW_SIZE_LOG_FACTOR
  );
}

export class NearEarthSpaceScene implements VisualScene {
  private readonly seed: number;

  private host!: PixiSceneHost;
  private sceneEl!: HTMLDivElement;
  private visible = true;
  private stageReady = false;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastFrameDrawCalls = 0;
  private elapsedSec = 0;
  private currentEarthPhase = 0;
  private sampledSatelliteCount = 0;
  private sampledEarthBuiltStructureCount = 0;
  private sampledOrbitLaunchActivity = 0;
  private sampledMoonLaunchActivity = 0;
  private lastSeenEarthOrbitLaunchCount: bigint | null = null;
  private lastSeenEarthMoonLaunchCount: bigint | null = null;
  private activeBands: OrbitBandState[] = [];
  private orbitBandCount = 0;
  private orbitParticleSignature = 0;
  private readonly planetLayout: PlanetLayout = { centerX: 0, centerY: 0, radius: 0 };

  private backgroundSprite!: Sprite;
  private starContainer!: Container;
  private earthGlowSprite!: Sprite;
  private earthSprite!: Sprite;
  private cityLightContainer!: Container;
  private buildingLightContainer!: Container;
  private rocketLaunchContainer!: ParticleContainer<Particle>;
  private backParticleContainer!: ParticleContainer<Particle>;
  private frontParticleContainer!: ParticleContainer<Particle>;

  private backgroundTexture: Texture | null = null;
  private earthTexture: Texture | null = null;
  private earthCompositeTexture: Texture | null = null;
  private earthGlowTexture: Texture | null = null;
  private starTexture: Texture | null = null;
  private cityLightTexture: Texture | null = null;
  private buildingLightTexture: Texture | null = null;
  private rocketLaunchTexture: Texture | null = null;
  private particleTexture: Texture | null = null;
  private earthDayCanvas: HTMLCanvasElement | null = null;
  private earthNightCanvas: HTMLCanvasElement | null = null;
  private earthLightCanvas: HTMLCanvasElement | null = null;
  private earthLightCtx: CanvasRenderingContext2D | null = null;
  private earthCompositeCanvas: HTMLCanvasElement | null = null;
  private earthCompositeCtx: CanvasRenderingContext2D | null = null;
  private cityLightPlacements: CityLightPlacement[] = [];
  private buildingLightPlacements: CityLightPlacement[] = [];
  private rocketLaunchSitePlacements: CityLightPlacement[] = [];
  private backgroundStars: BackgroundStar[] = [];
  private orbitParticles: OrbitParticleState[] = [];

  private starSprites: Sprite[] = [];
  private cityLightSprites: Sprite[] = [];
  private buildingLightSprites: Sprite[] = [];
  private rocketLaunchSprites: Particle[] = [];
  private backParticleSprites: Particle[] = [];
  private frontParticleSprites: Particle[] = [];
  private rocketLaunches: RocketLaunchParticle[] = [];

  constructor(seed: number) {
    this.seed = seed ^ 0x6b3f4c91;
  }

  build(root: HTMLElement): void {
    this.host = createPixiSceneHost(root, 'visual-scene nes-scene', 'nes-mass-canvas');
    this.sceneEl = this.host.sceneEl;
    this.primeTextures();
    void this.host.initPromise.then(() => {
      this.configureStage();
    });
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.sceneEl.classList.toggle('is-hidden', !visible);
  }

  sample(state: GameState): void {
    this.sampledSatelliteCount = toWholeCount(state.satellites);
    let datacenterCount = 0;
    for (const count of state.datacenters) {
      datacenterCount += toWholeCount(count);
    }
    const facilityCount = toWholeCount(state.locationFacilities.earth.earthMaterialMine)
      + toWholeCount(state.locationFacilities.earth.earthSolarFactory)
      + toWholeCount(state.locationFacilities.earth.earthRobotFactory)
      + toWholeCount(state.locationFacilities.earth.earthGpuFactory)
      + toWholeCount(state.locationFacilities.earth.earthRocketFactory)
      + toWholeCount(state.locationFacilities.earth.earthGpuSatelliteFactory);
    const powerPlantCount = toWholeCount(state.gasPlants) + toWholeCount(state.nuclearPlants);
    const solarFarmCount = Math.max(
      0,
      Math.floor(fromBigInt(state.locationResources.earth.installedSolarPanels) / BALANCE.solarFarmPanelsPerFarm),
    );
    this.sampledEarthBuiltStructureCount = datacenterCount + facilityCount + powerPlantCount + solarFarmCount;
    const earthOrbitLaunchCount = state.earthOrbitLaunchCount ?? 0n;
    const earthOrbitLaunchesUsedLastTick = state.earthOrbitLaunchesUsedLastTick ?? 0;
    const orbitLaunchesDelta = this.lastSeenEarthOrbitLaunchCount === null
      ? 0
      : Math.max(0, Number(earthOrbitLaunchCount - this.lastSeenEarthOrbitLaunchCount));
    const orbitLaunchesUsed = Math.max(
      Math.max(0, earthOrbitLaunchesUsedLastTick),
      orbitLaunchesDelta,
    );
    this.sampledOrbitLaunchActivity = orbitLaunchesUsed;
    this.lastSeenEarthOrbitLaunchCount = earthOrbitLaunchCount;

    const earthMoonLaunchCount = state.earthMoonLaunchCount ?? 0n;
    const earthMoonLaunchesUsedLastTick = state.earthMoonLaunchesUsedLastTick ?? 0;
    const moonLaunchesDelta = this.lastSeenEarthMoonLaunchCount === null
      ? 0
      : Math.max(0, Number(earthMoonLaunchCount - this.lastSeenEarthMoonLaunchCount));
    const moonLaunchesUsed = Math.max(
      Math.max(0, earthMoonLaunchesUsedLastTick),
      moonLaunchesDelta,
    );
    this.sampledMoonLaunchActivity = moonLaunchesUsed;
    this.lastSeenEarthMoonLaunchCount = earthMoonLaunchCount;

    const orbitBurst = this.getOrbitLaunchVisualBurst(orbitLaunchesUsed);
    const activeOrbitLaunches = this.countActiveLaunches('orbit');
    for (let i = 0; i < orbitBurst && (activeOrbitLaunches + i) < MAX_ACTIVE_ORBIT_LAUNCHES; i++) {
      this.rocketLaunches.push(this.createRocketLaunchParticle('orbit'));
    }

    const moonBurst = this.getMoonLaunchVisualBurst(moonLaunchesUsed);
    const activeMoonLaunches = this.countActiveLaunches('moon');
    for (let i = 0; i < moonBurst && (activeMoonLaunches + i) < MAX_ACTIVE_MOON_LAUNCHES; i++) {
      this.rocketLaunches.push(this.createRocketLaunchParticle('moon'));
    }
  }

  simulate(dtMs: number): void {
    this.elapsedSec += dtMs / 1000;
    this.simulateRocketLaunches(dtMs / 1000);
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

    const planet = this.getPlanetLayout(width, height);
    this.updateOrbitBands();
    this.ensureOrbitParticleCache();

    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.lastWidth = width;
      this.lastHeight = height;
      this.rebuildBackground(width, height, planet);
    }

    this.lastFrameDrawCalls = 0;
    this.currentEarthPhase = this.elapsedSec * 0.22;
    this.updateStarSprites(planet);
    this.updateEarthSprites(planet);
    this.updateCityLightSprites(planet);
    this.updateBuildingLightSprites(planet);
    this.updateRocketLaunchSprites(planet);
    this.updateParticleSprites(planet);
    this.host.app.render();
  }

  getDrawCallCount(): number {
    return this.lastFrameDrawCalls;
  }

  getDebugLines(): string[] {
    const bandSummary = this.activeBands.length > 0
      ? this.activeBands.map(band => `${band.definition.label} ${band.sourceCount}`).join(' | ')
      : 'No active orbits';
    const planeSummary = this.activeBands.length > 0
      ? this.activeBands.map(band => `${band.definition.key}:${band.planeCount}p/${band.visibleCount}`).join(' ')
      : 'planes:0';
    return [
      `satellites=${this.sampledSatelliteCount}`,
      bandSummary,
      planeSummary,
    ];
  }

  private configureStage(): void {
    const stage = this.host.app.stage;
    stage.removeChildren();

    this.backgroundSprite = new Sprite(Texture.EMPTY);
    this.starContainer = new Container();
    this.backParticleContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: false,
        vertex: true,
        color: true,
      },
      texture: this.getParticleTexture(),
    });
    this.earthGlowSprite = new Sprite(this.getEarthGlowTexture());
    this.earthGlowSprite.anchor.set(0.5, 0.5);
    this.earthSprite = new Sprite(Texture.EMPTY);
    this.earthSprite.anchor.set(0.5, 0.5);
    this.cityLightContainer = new Container();
    this.buildingLightContainer = new Container();
    this.rocketLaunchContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: false,
        vertex: true,
        color: true,
      },
      texture: this.getRocketLaunchTexture(),
    });
    this.frontParticleContainer = new ParticleContainer<Particle>({
      dynamicProperties: {
        position: true,
        rotation: false,
        vertex: true,
        color: true,
      },
      texture: this.getParticleTexture(),
    });

    stage.addChild(this.backgroundSprite);
    stage.addChild(this.starContainer);
    stage.addChild(this.backParticleContainer);
    stage.addChild(this.earthGlowSprite);
    stage.addChild(this.earthSprite);
    stage.addChild(this.cityLightContainer);
    stage.addChild(this.buildingLightContainer);
    stage.addChild(this.rocketLaunchContainer);
    stage.addChild(this.frontParticleContainer);

    this.stageReady = true;
  }

  private primeTextures(): void {
    this.loadSvgTexture(earthSvg, EARTH_TEXTURE_SCALE, (texture, _image, canvas) => {
      this.earthTexture = texture;
      this.earthDayCanvas = canvas;
      this.rebuildLightPlacements(canvas);
      this.earthNightCanvas = this.buildEarthNightCanvas(canvas);
      this.ensureEarthCompositeTexture();
      if (this.stageReady) {
        this.earthSprite.texture = this.earthCompositeTexture ?? texture;
      }
    });
  }

  private loadSvgTexture(
    svgMarkup: string,
    scale: number,
    onReady: (texture: Texture, image: HTMLImageElement, canvas: HTMLCanvasElement) => void,
  ): void {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => {
      const width = Math.max(1, image.naturalWidth);
      const height = Math.max(1, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        onReady(textureFromCanvas(canvas), image, canvas);
      } else {
        onReady(Texture.from(image), image, canvas);
      }
    }, { once: true });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  }

  private getPlanetLayout(width: number, height: number): PlanetLayout {
    this.planetLayout.radius = Math.max(68, Math.min(width * 0.29, height * 0.47));
    this.planetLayout.centerX = width * 0.5;
    this.planetLayout.centerY = height * 0.5;
    return this.planetLayout;
  }

  private updateOrbitBands(): void {
    this.orbitBandCount = 0;
    for (const definition of ORBIT_BANDS) {
      const sourceCount = Math.max(0, this.sampledSatelliteCount - definition.sourceStart);
      const visibleCount = Math.min(definition.maxVisible, sourceCount);
      if (visibleCount <= 0) {
        continue;
      }
      const overflowCount = Math.max(0, sourceCount - definition.maxVisible);

      const densityT = clamp01(Math.log1p(visibleCount) / Math.log1p(definition.maxVisible));
      const targetPlanes = Math.round(
        definition.minPlanes + ((definition.maxPlanes - definition.minPlanes) * densityT),
      );
      const planeCount = Math.max(1, Math.min(visibleCount, targetPlanes));
      const band = this.activeBands[this.orbitBandCount];
      if (band) {
        band.definition = definition;
        band.sourceCount = sourceCount;
        band.visibleCount = visibleCount;
        band.planeCount = planeCount;
        band.overflowSizeMultiplier = getLogOverflowMultiplier(overflowCount);
      } else {
        this.activeBands.push({
          definition,
          sourceCount,
          visibleCount,
          planeCount,
          overflowSizeMultiplier: getLogOverflowMultiplier(overflowCount),
        });
      }
      this.orbitBandCount++;
    }
    this.activeBands.length = this.orbitBandCount;
  }

  private ensureOrbitParticleCache(): void {
    let signature = hashSeed(this.seed ^ 0x51c9aa37, this.orbitBandCount);
    for (let i = 0; i < this.orbitBandCount; i++) {
      const band = this.activeBands[i];
      signature = hashSeed(signature, band.definition.seedSalt);
      signature = hashSeed(signature, band.sourceCount);
      signature = hashSeed(signature, band.visibleCount);
      signature = hashSeed(signature, band.planeCount);
    }
    if (signature === this.orbitParticleSignature) {
      return;
    }

    this.orbitParticleSignature = signature;
    this.orbitParticles = [];

    for (let bandIndex = 0; bandIndex < this.orbitBandCount; bandIndex++) {
      const band = this.activeBands[bandIndex];
      let remaining = band.visibleCount;
      for (let planeIndex = 0; planeIndex < band.planeCount && remaining > 0; planeIndex++) {
        const planesRemaining = band.planeCount - planeIndex;
        const dotsInPlane = Math.max(1, Math.round(remaining / planesRemaining));
        remaining -= dotsInPlane;

        const planeSeed = hashSeed(this.seed ^ band.definition.seedSalt, planeIndex + 1);
        const planeT = band.planeCount <= 1 ? 0.5 : (planeIndex / Math.max(1, band.planeCount - 1));
        const radiusMultiplier = band.definition.radiusMinMultiplier
          + ((band.definition.radiusMaxMultiplier - band.definition.radiusMinMultiplier) * planeT)
          + ((seededUnit(planeSeed, 0x11) - 0.5) * 0.045);
        const inclinationDeg = band.definition.inclinationBaseDeg
          + ((seededUnit(planeSeed, 0x22) - 0.5) * band.definition.inclinationSpreadDeg);
        const inclination = degToRad(inclinationDeg);
        const nodeAngle = ((planeIndex / Math.max(1, band.planeCount)) * Math.PI * 2)
          + (seededUnit(planeSeed, 0x33) * 0.45);
        const orbitalSpeed = band.definition.speedMin
          + (seededUnit(planeSeed, 0x44) * (band.definition.speedMax - band.definition.speedMin));
        const phaseOffset = seededUnit(planeSeed, 0x55) * Math.PI * 2;
        const cosNode = Math.cos(nodeAngle);
        const sinNode = Math.sin(nodeAngle);
        const cosInclination = Math.cos(inclination);
        const sinInclination = Math.sin(inclination);

        for (let dotIndex = 0; dotIndex < dotsInPlane; dotIndex++) {
          const dotSeed = hashSeed(planeSeed, dotIndex + 1);
          const phaseJitter = (seededUnit(dotSeed, 0x66) - 0.5)
            * (Math.PI * 2 / Math.max(16, dotsInPlane));
          const size = (
            band.definition.particleSizeMin
            + (seededUnit(dotSeed, 0x77) * (band.definition.particleSizeMax - band.definition.particleSizeMin))
          ) * band.overflowSizeMultiplier;
          this.orbitParticles.push({
            radiusMultiplier,
            cosNode,
            sinNode,
            cosInclination,
            sinInclination,
            orbitalSpeed,
            phaseBase: phaseOffset + ((dotIndex / dotsInPlane) * Math.PI * 2) + phaseJitter,
            size,
          });
        }
      }
    }
  }

  private rebuildBackground(width: number, height: number, planet: PlanetLayout): void {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#040811');
    background.addColorStop(0.45, '#081224');
    background.addColorStop(1, '#091a33');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const limbGlow = ctx.createRadialGradient(
      planet.centerX,
      planet.centerY,
      planet.radius * 0.22,
      planet.centerX,
      planet.centerY,
      planet.radius * 3.8,
    );
    limbGlow.addColorStop(0, 'rgba(88, 180, 255, 0.12)');
    limbGlow.addColorStop(0.42, 'rgba(34, 101, 168, 0.1)');
    limbGlow.addColorStop(1, 'rgba(4, 10, 20, 0)');
    ctx.fillStyle = limbGlow;
    ctx.fillRect(0, 0, width, height);

    this.backgroundTexture = replaceManagedTexture(this.backgroundTexture, textureFromCanvas(canvas));
    this.backgroundSprite.texture = this.backgroundTexture;
    this.backgroundSprite.x = 0;
    this.backgroundSprite.y = 0;
    this.backgroundSprite.width = width;
    this.backgroundSprite.height = height;
    this.rebuildStarfield(width, height);
  }

  private rebuildStarfield(width: number, height: number): void {
    const starCount = Math.max(
      BACKGROUND_STAR_MIN,
      Math.min(BACKGROUND_STAR_MAX, Math.round(width * height * BACKGROUND_STAR_DENSITY)),
    );
    const starRng = new SeededRng(hashSeed(this.seed ^ 0x1d2f3b47, (width << 16) ^ height));
    const horizontalSpan = width * 1.6;
    const verticalSpan = height * 0.95;
    this.backgroundStars = [];

    for (let i = 0; i < starCount; i++) {
      this.backgroundStars.push({
        baseX: starRng.nextRange(-horizontalSpan * 0.5, horizontalSpan * 0.5),
        baseY: starRng.nextRange(-verticalSpan * 0.5, verticalSpan * 0.5),
        size: 0.8 + (starRng.next() * 2),
        alpha: 0.2 + (starRng.next() * 0.58),
        driftFactor: starRng.nextRange(0.82, 1.22),
        twinklePhase: starRng.next() * Math.PI * 2,
        twinkleSpeed: starRng.nextRange(0.8, 1.6),
      });
    }

    this.syncSpritePool(this.starContainer, this.starSprites, this.backgroundStars.length, this.createStarSprite);
    this.hideUnusedSprites(this.starSprites, this.backgroundStars.length);
  }

  private updateStarSprites(planet: PlanetLayout): void {
    if (this.backgroundStars.length <= 0) {
      this.hideUnusedSprites(this.starSprites, 0);
      return;
    }

    const texture = this.getStarTexture();
    const wrapWidth = Math.max(this.lastWidth, 1) * 1.6;
    for (let i = 0; i < this.backgroundStars.length; i++) {
      const star = this.backgroundStars[i];
      const sprite = this.starSprites[i];
      const driftX = (this.elapsedSec * STARFIELD_BASE_DRIFT_SPEED * star.driftFactor) % wrapWidth;
      const wrappedX = ((((star.baseX + driftX) + (wrapWidth * 0.5)) % wrapWidth) + wrapWidth) % wrapWidth;
      const twinkle = 0.86 + (0.14 * Math.sin(star.twinklePhase + (this.elapsedSec * star.twinkleSpeed)));
      sprite.texture = texture;
      sprite.visible = true;
      sprite.x = planet.centerX + wrappedX - (wrapWidth * 0.5);
      sprite.y = planet.centerY + star.baseY;
      sprite.width = star.size;
      sprite.height = star.size;
      sprite.alpha = star.alpha * twinkle;
      this.lastFrameDrawCalls++;
    }
  }

  private updateEarthSprites(planet: PlanetLayout): void {
    const glowTexture = this.getEarthGlowTexture();
    const earthTexture = this.getAnimatedEarthTexture() ?? this.earthTexture ?? Texture.EMPTY;
    const diameter = planet.radius * 2;

    this.backgroundSprite.visible = true;

    this.earthGlowSprite.texture = glowTexture;
    this.earthGlowSprite.visible = true;
    this.earthGlowSprite.x = planet.centerX;
    this.earthGlowSprite.y = planet.centerY;
    this.earthGlowSprite.width = diameter * 2.18;
    this.earthGlowSprite.height = diameter * 2.18;
    this.earthGlowSprite.alpha = 0.9;
    this.lastFrameDrawCalls++;

    this.earthSprite.texture = earthTexture;
    this.earthSprite.visible = true;
    this.earthSprite.x = planet.centerX;
    this.earthSprite.y = planet.centerY;
    this.earthSprite.width = diameter;
    this.earthSprite.height = diameter;
    this.earthSprite.alpha = 1;

    this.lastFrameDrawCalls += 2;
  }

  private updateParticleSprites(planet: PlanetLayout): void {
    const texture = this.getParticleTexture();
    const orbitParticleCount = this.orbitParticles.length;
    this.backParticleContainer.texture = texture;
    this.frontParticleContainer.texture = texture;
    this.syncParticlePool(this.backParticleContainer, this.backParticleSprites, orbitParticleCount, this.createOrbitParticleSprite);
    this.syncParticlePool(this.frontParticleContainer, this.frontParticleSprites, orbitParticleCount, this.createOrbitParticleSprite);

    const scaleX = 1 / Math.max(1, texture.orig.width);
    const scaleY = 1 / Math.max(1, texture.orig.height);
    let backUsedCount = 0;
    let frontUsedCount = 0;

    for (const orbitParticle of this.orbitParticles) {
      const radius = planet.radius * orbitParticle.radiusMultiplier;
      const anomaly = orbitParticle.phaseBase + (this.elapsedSec * orbitParticle.orbitalSpeed);
      const cosAnomaly = Math.cos(anomaly);
      const sinAnomaly = Math.sin(anomaly);
      const x = radius * (
        (orbitParticle.cosNode * cosAnomaly)
        - (orbitParticle.sinNode * sinAnomaly * orbitParticle.cosInclination)
      );
      const depth = radius * (
        (orbitParticle.sinNode * cosAnomaly)
        + (orbitParticle.cosNode * sinAnomaly * orbitParticle.cosInclination)
      );
      const y = radius * (sinAnomaly * orbitParticle.sinInclination);
      const particle = depth >= 0
        ? this.frontParticleSprites[frontUsedCount++]
        : this.backParticleSprites[backUsedCount++];
      if (!particle) {
        continue;
      }

      particle.texture = texture;
      particle.x = planet.centerX + x;
      particle.y = planet.centerY + y;
      particle.scaleX = orbitParticle.size * scaleX;
      particle.scaleY = orbitParticle.size * scaleY;
      particle.alpha = PARTICLE_ALPHA;
      this.lastFrameDrawCalls++;
    }

    this.hideUnusedParticles(this.backParticleSprites, backUsedCount);
    this.hideUnusedParticles(this.frontParticleSprites, frontUsedCount);
  }

  private getEarthGlowTexture(): Texture {
    if (this.earthGlowTexture) {
      return this.earthGlowTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.earthGlowTexture = Texture.EMPTY;
      return this.earthGlowTexture;
    }

    const gradient = ctx.createRadialGradient(128, 128, 18, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(106, 180, 255, 0.34)');
    gradient.addColorStop(0.48, 'rgba(42, 122, 214, 0.18)');
    gradient.addColorStop(0.78, 'rgba(16, 40, 86, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();

    this.earthGlowTexture = textureFromCanvas(canvas);
    return this.earthGlowTexture;
  }

  private getStarTexture(): Texture {
    if (this.starTexture) {
      return this.starTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.starTexture = Texture.EMPTY;
      return this.starTexture;
    }

    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(244, 248, 255, 1)');
    gradient.addColorStop(0.34, 'rgba(238, 245, 255, 0.96)');
    gradient.addColorStop(0.72, 'rgba(214, 232, 255, 0.34)');
    gradient.addColorStop(1, 'rgba(214, 232, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();

    this.starTexture = textureFromCanvas(canvas);
    return this.starTexture;
  }

  private buildEarthNightCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const width = Math.max(1, sourceCanvas.width);
    const height = Math.max(1, sourceCanvas.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return sourceCanvas;
    }

    ctx.drawImage(sourceCanvas, 0, 0, width, height);
    ctx.fillStyle = 'rgba(12, 22, 40, 0.58)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'multiply';
    const tint = ctx.createLinearGradient(0, 0, width, height);
    tint.addColorStop(0, 'rgba(20, 36, 68, 0.92)');
    tint.addColorStop(1, 'rgba(4, 8, 18, 0.98)');
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    return canvas;
  }

  private ensureEarthCompositeTexture(): void {
    if (this.earthCompositeTexture || !this.earthDayCanvas) {
      return;
    }
    this.earthLightCanvas = document.createElement('canvas');
    this.earthLightCanvas.width = this.earthDayCanvas.width;
    this.earthLightCanvas.height = this.earthDayCanvas.height;
    this.earthLightCtx = this.earthLightCanvas.getContext('2d');
    this.earthCompositeCanvas = document.createElement('canvas');
    this.earthCompositeCanvas.width = this.earthDayCanvas.width;
    this.earthCompositeCanvas.height = this.earthDayCanvas.height;
    this.earthCompositeCtx = this.earthCompositeCanvas.getContext('2d');
    this.earthCompositeTexture = textureFromCanvas(this.earthCompositeCanvas);
  }

  private getAnimatedEarthTexture(): Texture | null {
    if (!this.earthDayCanvas || !this.earthNightCanvas) {
      return this.earthTexture;
    }
    this.ensureEarthCompositeTexture();
    if (
      !this.earthCompositeCanvas
      || !this.earthCompositeCtx
      || !this.earthCompositeTexture
      || !this.earthLightCanvas
      || !this.earthLightCtx
    ) {
      return this.earthTexture;
    }

    const width = this.earthCompositeCanvas.width;
    const height = this.earthCompositeCanvas.height;
    const ctx = this.earthCompositeCtx;
    const lightCtx = this.earthLightCtx;
    const phase = this.currentEarthPhase;

    lightCtx.clearRect(0, 0, width, height);
    lightCtx.drawImage(this.earthDayCanvas, 0, 0, width, height);
    lightCtx.globalCompositeOperation = 'destination-in';
    this.fillEarthPhaseMask(lightCtx, width, height, phase);
    lightCtx.globalCompositeOperation = 'source-over';

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.earthNightCanvas, 0, 0, width, height);
    ctx.drawImage(this.earthLightCanvas, 0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    const rim = ctx.createRadialGradient(width * 0.37, height * 0.28, width * 0.02, width * 0.37, height * 0.28, width * 0.44);
    rim.addColorStop(0, 'rgba(140, 214, 255, 0.15)');
    rim.addColorStop(0.5, 'rgba(140, 214, 255, 0.08)');
    rim.addColorStop(1, 'rgba(140, 214, 255, 0)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.5, width * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    this.earthCompositeTexture.source.update();
    return this.earthCompositeTexture;
  }

  private updateCityLightSprites(planet: PlanetLayout): void {
    if (!this.earthDayCanvas || this.cityLightPlacements.length <= 0) {
      this.hideUnusedSprites(this.cityLightSprites, 0);
      return;
    }

    const texture = this.getCityLightTexture();
    const sourceWidth = this.earthDayCanvas.width;
    const sourceHeight = this.earthDayCanvas.height;
    const diameter = planet.radius * 2;
    const pixelScale = diameter / sourceWidth;
    const visibleCount = this.cityLightPlacements.length;

    this.syncSpritePool(this.cityLightContainer, this.cityLightSprites, visibleCount, this.createCityLightSprite);

    let usedCount = 0;
    for (let i = 0; i < visibleCount; i++) {
      const light = this.cityLightPlacements[i];
      const normalizedX = ((light.x / sourceWidth) - 0.5) * 2;
      const normalizedY = ((light.y / sourceHeight) - 0.5) * 2;
      const nightVisibility = this.getNightVisibilityAtPoint(normalizedX, normalizedY, this.currentEarthPhase);
      if (nightVisibility <= 0.02) {
        continue;
      }

      const sprite = this.cityLightSprites[usedCount];
      const glowDiameter = light.radius * 3.2 * pixelScale;
      sprite.texture = texture;
      sprite.visible = true;
      sprite.x = planet.centerX + (normalizedX * planet.radius);
      sprite.y = planet.centerY + (normalizedY * planet.radius);
      sprite.width = glowDiameter;
      sprite.height = glowDiameter;
      sprite.alpha = light.alpha * nightVisibility;
      usedCount++;
      this.lastFrameDrawCalls++;
    }

    this.hideUnusedSprites(this.cityLightSprites, usedCount);
  }

  private updateBuildingLightSprites(planet: PlanetLayout): void {
    if (!this.earthDayCanvas || this.buildingLightPlacements.length <= 0 || this.sampledEarthBuiltStructureCount <= 0) {
      this.hideUnusedSprites(this.buildingLightSprites, 0);
      return;
    }

    const visibleCount = Math.max(0, Math.min(
      this.buildingLightPlacements.length,
      Math.floor(this.sampledEarthBuiltStructureCount / BUILDINGS_PER_BUILDING_LIGHT),
    ));
    if (visibleCount <= 0) {
      this.hideUnusedSprites(this.buildingLightSprites, 0);
      return;
    }

    const texture = this.getBuildingLightTexture();
    const sourceWidth = this.earthDayCanvas.width;
    const sourceHeight = this.earthDayCanvas.height;
    const diameter = planet.radius * 2;
    const pixelScale = diameter / sourceWidth;

    this.syncSpritePool(this.buildingLightContainer, this.buildingLightSprites, visibleCount, this.createBuildingLightSprite);

    let usedCount = 0;
    for (let i = 0; i < visibleCount; i++) {
      const light = this.buildingLightPlacements[i];
      const normalizedX = ((light.x / sourceWidth) - 0.5) * 2;
      const normalizedY = ((light.y / sourceHeight) - 0.5) * 2;
      const nightVisibility = this.getNightVisibilityAtPoint(normalizedX, normalizedY, this.currentEarthPhase);
      if (nightVisibility <= 0.02) {
        continue;
      }

      const sprite = this.buildingLightSprites[usedCount];
      const glowDiameter = light.radius * 2.6 * pixelScale;
      sprite.texture = texture;
      sprite.visible = true;
      sprite.x = planet.centerX + (normalizedX * planet.radius);
      sprite.y = planet.centerY + (normalizedY * planet.radius);
      sprite.width = glowDiameter;
      sprite.height = glowDiameter;
      sprite.alpha = light.alpha * nightVisibility;
      usedCount++;
      this.lastFrameDrawCalls++;
    }

    this.hideUnusedSprites(this.buildingLightSprites, usedCount);
  }

  private simulateRocketLaunches(dtSec: number): void {
    if (this.rocketLaunchSitePlacements.length <= 0) {
      this.rocketLaunches.length = 0;
      return;
    }

    let nextCount = 0;
    for (let i = 0; i < this.rocketLaunches.length; i++) {
      const launch = this.rocketLaunches[i];
      launch.progress += dtSec * launch.speed;
      if (launch.progress < 1) {
        this.rocketLaunches[nextCount++] = launch;
      }
    }
    this.rocketLaunches.length = nextCount;
  }

  private countActiveLaunches(route: 'orbit' | 'moon'): number {
    let count = 0;
    for (const launch of this.rocketLaunches) {
      if (launch.route === route) {
        count++;
      }
    }
    return count;
  }

  private getOrbitLaunchVisualBurst(launchesUsed: number): number {
    if (launchesUsed <= 0) {
      return 0;
    }
    return Math.max(1, Math.min(
      MAX_NEW_ORBIT_LAUNCHES_PER_SAMPLE,
      Math.round(Math.sqrt(launchesUsed) * 3.4),
    ));
  }

  private getMoonLaunchVisualBurst(launchesUsed: number): number {
    if (launchesUsed <= 0) {
      return 0;
    }
    return Math.max(1, Math.min(
      MAX_NEW_MOON_LAUNCHES_PER_SAMPLE,
      Math.round(Math.sqrt(launchesUsed) * 2.4),
    ));
  }

  private createRocketLaunchParticle(route: 'orbit' | 'moon'): RocketLaunchParticle {
    const seedBase = hashSeed(
      this.seed ^ 0x7a4c2d1f,
      this.rocketLaunches.length
        + Math.floor(this.elapsedSec * 10)
        + Math.floor(this.sampledOrbitLaunchActivity)
        + Math.floor(this.sampledMoonLaunchActivity)
        + (route === 'orbit' ? 0x1000 : 0x2000),
    );
    const siteCount = Math.max(1, this.rocketLaunchSitePlacements.length);
    return {
      route,
      siteIndex: Math.floor(seededUnit(seedBase, 0x11) * siteCount) % siteCount,
      progress: seededUnit(seedBase, 0x22) * (route === 'moon' ? 0.18 : 0.08),
      speed: (ROCKET_LAUNCH_MIN_SPEED * (route === 'moon' ? 0.72 : 0.88)) + (
        seededUnit(seedBase, 0x33) * (ROCKET_LAUNCH_MAX_SPEED - ROCKET_LAUNCH_MIN_SPEED)
      ),
      drift: (seededUnit(seedBase, 0x44) - 0.5) * 0.16,
      size: (route === 'moon' ? 1.8 : 1.4) + (seededUnit(seedBase, 0x55) * (route === 'moon' ? 2.2 : 1.6)),
      alpha: 0.64 + (seededUnit(seedBase, 0x66) * 0.3),
    };
  }

  private updateRocketLaunchSprites(planet: PlanetLayout): void {
    if (!this.earthDayCanvas || this.rocketLaunches.length <= 0 || this.rocketLaunchSitePlacements.length <= 0) {
      this.hideUnusedParticles(this.rocketLaunchSprites, 0);
      return;
    }

    const texture = this.getRocketLaunchTexture();
    const sourceWidth = this.earthDayCanvas.width;
    const sourceHeight = this.earthDayCanvas.height;
    const diameter = planet.radius * 2;
    const pixelScale = diameter / sourceWidth;
    const textureScaleX = 1 / Math.max(1, texture.orig.width);
    const textureScaleY = 1 / Math.max(1, texture.orig.height);

    this.rocketLaunchContainer.texture = texture;
    this.syncParticlePool(this.rocketLaunchContainer, this.rocketLaunchSprites, this.rocketLaunches.length, this.createRocketLaunchSprite);

    let usedCount = 0;
    for (const launch of this.rocketLaunches) {
      const site = this.rocketLaunchSitePlacements[launch.siteIndex];
      if (!site) {
        continue;
      }

      const normalizedY = (((site.y / sourceHeight) - 0.5) * 2) * 0.82;
      if (Math.abs(normalizedY) >= 0.98) {
        continue;
      }
      const localProgress = clamp01(launch.progress);

      const sprite = this.rocketLaunchSprites[usedCount];
      const size = launch.size * pixelScale * (1 + (0.45 * Math.sin(localProgress * Math.PI)));
      sprite.texture = texture;
      if (launch.route === 'moon') {
        const rimX = Math.sqrt(Math.max(0, 1 - (normalizedY * normalizedY))) * 0.98;
        const startX = planet.centerX + (rimX * planet.radius);
        const startY = planet.centerY + (normalizedY * planet.radius);
        const travelDistance = (this.lastWidth * 0.28) + (planet.radius * 0.34);
        const arcHeight = (0.04 + (Math.abs(launch.drift) * 0.12)) * planet.radius;
        const endDriftY = launch.drift * planet.radius * 0.15;
        sprite.x = startX + (travelDistance * localProgress);
        sprite.y = startY + endDriftY - (Math.sin(localProgress * Math.PI) * arcHeight);
        sprite.scaleX = (size * 16.6) * textureScaleX;
        sprite.scaleY = (size * 14.6) * textureScaleY;
        sprite.alpha = launch.alpha * Math.sin(localProgress * Math.PI);
      } else {
        const normalizedX = ((site.x / sourceWidth) - 0.5) * 2;
        const radialLength = Math.hypot(normalizedX, normalizedY);
        if (radialLength <= 0.001 || radialLength >= 1) {
          continue;
        }
        const radialX = normalizedX / radialLength;
        const radialY = normalizedY / radialLength;
        const tangentX = -radialY;
        const tangentY = radialX;
        const launchLift = 0.034 + (0.18 * localProgress);
        const arcOffset = Math.sin(localProgress * Math.PI) * launch.drift * 0.8;
        const localX = normalizedX + (radialX * launchLift) + (tangentX * arcOffset);
        const localY = normalizedY + (radialY * launchLift) + (tangentY * arcOffset);
        const visibility = clamp01(1 - ((((localX * localX) + (localY * localY)) - 1.05) / 0.24));
        if (visibility <= 0.02) {
          continue;
        }
        sprite.x = planet.centerX + (localX * planet.radius);
        sprite.y = planet.centerY + (localY * planet.radius);
        sprite.scaleX = (size * 15.8) * textureScaleX;
        sprite.scaleY = (size * 15.8) * textureScaleY;
        sprite.alpha = launch.alpha * visibility * Math.sin(localProgress * Math.PI);
      }
      usedCount++;
      this.lastFrameDrawCalls++;
    }

    this.hideUnusedParticles(this.rocketLaunchSprites, usedCount);
  }

  private getNightVisibilityAtPoint(normalizedX: number, normalizedY: number, phase: number): number {
    const radialLimitSq = (normalizedX * normalizedX) + (normalizedY * normalizedY);
    if (radialLimitSq >= 1) {
      return 0;
    }

    const verticalRadius = Math.sqrt(Math.max(0, 1 - (normalizedY * normalizedY)));
    const terminatorRadiusX = Math.abs(Math.cos(phase)) * verticalRadius;
    const litOnRight = Math.sin(phase) >= 0;
    const isGibbous = Math.cos(phase) >= 0;
    const threshold = litOnRight
      ? (isGibbous ? -terminatorRadiusX : terminatorRadiusX)
      : (isGibbous ? terminatorRadiusX : -terminatorRadiusX);
    const signedDistance = litOnRight
      ? (normalizedX - threshold)
      : (threshold - normalizedX);
    const softness = 0.12;
    const litVisibility = clamp01((signedDistance / softness) + 0.5);
    return 1 - litVisibility;
  }

  private fillEarthPhaseMask(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    phase: number,
  ): void {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const r = width * 0.5;
    const featherPx = Math.max(2, width * 0.1);
    const terminatorRadiusX = Math.max(0.0001, Math.abs(Math.cos(phase)) * r);
    const litOnRight = Math.sin(phase) >= 0;
    const isGibbous = Math.cos(phase) >= 0;

    ctx.beginPath();
    if (litOnRight) {
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
      if (isGibbous) {
        ctx.ellipse(cx, cy, terminatorRadiusX, r, 0, Math.PI / 2, -Math.PI / 2, false);
      } else {
        ctx.ellipse(cx, cy, terminatorRadiusX, r, 0, Math.PI / 2, -Math.PI / 2, true);
      }
    } else {
      ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, false);
      if (isGibbous) {
        ctx.ellipse(cx, cy, terminatorRadiusX, r, 0, -Math.PI / 2, Math.PI / 2, false);
      } else {
        ctx.ellipse(cx, cy, terminatorRadiusX, r, 0, -Math.PI / 2, Math.PI / 2, true);
      }
    }
    ctx.closePath();
    ctx.save();
    ctx.filter = `blur(${featherPx.toFixed(1)}px)`;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  private rebuildLightPlacements(sourceCanvas: HTMLCanvasElement): void {
    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      this.cityLightPlacements = [];
      this.buildingLightPlacements = [];
      this.rocketLaunchSitePlacements = [];
      return;
    }

    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const imageData = ctx.getImageData(0, 0, width, height).data;
    this.cityLightPlacements = this.sampleLandLightPlacements(
      imageData,
      width,
      height,
      MAX_CITY_LIGHTS,
      hashSeed(this.seed, 0x71c17eed),
      160,
      0.004,
      0.006,
      0.55,
      0.95,
    );
    this.buildingLightPlacements = this.sampleLandLightPlacements(
      imageData,
      width,
      height,
      MAX_BUILDING_LIGHTS,
      hashSeed(this.seed, 0x49d3af21),
      96,
      0.0035,
      0.0105,
      0.45,
      0.82,
    );
    this.rocketLaunchSitePlacements = this.sampleLandLightPlacements(
      imageData,
      width,
      height,
      MAX_ROCKET_LAUNCH_SITES,
      hashSeed(this.seed, 0x1cc7a10f),
      180,
      0.005,
      0.012,
      0.6,
      0.9,
    );
  }

  private sampleLandLightPlacements(
    imageData: Uint8ClampedArray,
    width: number,
    height: number,
    targetCount: number,
    seed: number,
    minDistanceSq: number,
    radiusMinFactor: number,
    radiusMaxFactor: number,
    alphaMin: number,
    alphaMax: number,
  ): CityLightPlacement[] {
    const candidates: CityLightPlacement[] = [];
    const rng = new SeededRng(seed);
    let attempts = 0;

    while (candidates.length < targetCount && attempts < 12000) {
      attempts++;
      const x = Math.floor(rng.next() * width);
      const y = Math.floor(rng.next() * height);
      const dx = x - (width * 0.5);
      const dy = y - (height * 0.5);
      const radiusLimit = width * 0.5;
      if ((dx * dx) + (dy * dy) > (radiusLimit * radiusLimit)) {
        continue;
      }

      const idx = ((y * width) + x) * 4;
      const r = imageData[idx] ?? 0;
      const g = imageData[idx + 1] ?? 0;
      const b = imageData[idx + 2] ?? 0;
      const a = imageData[idx + 3] ?? 0;
      const landLike = a > 0
        && g > 55
        && g > (r * 0.88)
        && g > (b * 1.06)
        && (g - b) > 10;
      if (!landLike) {
        continue;
      }

      let tooClose = false;
      for (const existing of candidates) {
        const ex = existing.x - x;
        const ey = existing.y - y;
        if ((ex * ex) + (ey * ey) < minDistanceSq) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) {
        continue;
      }

      candidates.push({
        x,
        y,
        radius: width * rng.nextRange(radiusMinFactor, radiusMaxFactor),
        alpha: rng.nextRange(alphaMin, alphaMax),
      });
    }

    return candidates.sort((a, b) => (b.radius * b.alpha) - (a.radius * a.alpha));
  }

  private getParticleTexture(): Texture {
    if (this.particleTexture) {
      return this.particleTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.particleTexture = Texture.EMPTY;
      return this.particleTexture;
    }

    const gradient = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
    gradient.addColorStop(0, 'rgba(91, 231, 184, 1)');
    gradient.addColorStop(0.26, 'rgba(91, 231, 184, 0.98)');
    gradient.addColorStop(0.6, 'rgba(91, 231, 184, 0.4)');
    gradient.addColorStop(1, 'rgba(91, 231, 184, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(24, 24, 24, 0, Math.PI * 2);
    ctx.fill();

    this.particleTexture = textureFromCanvas(canvas);
    return this.particleTexture;
  }

  private getCityLightTexture(): Texture {
    if (this.cityLightTexture) {
      return this.cityLightTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.cityLightTexture = Texture.EMPTY;
      return this.cityLightTexture;
    }

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 228, 162, 1)');
    gradient.addColorStop(0.28, 'rgba(255, 212, 134, 0.96)');
    gradient.addColorStop(0.62, 'rgba(255, 182, 92, 0.34)');
    gradient.addColorStop(1, 'rgba(255, 182, 92, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();

    this.cityLightTexture = textureFromCanvas(canvas);
    return this.cityLightTexture;
  }

  private getBuildingLightTexture(): Texture {
    if (this.buildingLightTexture) {
      return this.buildingLightTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.buildingLightTexture = Texture.EMPTY;
      return this.buildingLightTexture;
    }

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(108, 255, 168, 1)');
    gradient.addColorStop(0.24, 'rgba(84, 255, 154, 0.96)');
    gradient.addColorStop(0.58, 'rgba(36, 219, 119, 0.34)');
    gradient.addColorStop(1, 'rgba(36, 219, 119, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();

    this.buildingLightTexture = textureFromCanvas(canvas);
    return this.buildingLightTexture;
  }

  private getRocketLaunchTexture(): Texture {
    if (this.rocketLaunchTexture) {
      return this.rocketLaunchTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.rocketLaunchTexture = Texture.EMPTY;
      return this.rocketLaunchTexture;
    }

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 223, 132, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 184, 86, 0.98)');
    gradient.addColorStop(0.52, 'rgba(255, 126, 44, 0.44)');
    gradient.addColorStop(1, 'rgba(255, 126, 44, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();

    this.rocketLaunchTexture = textureFromCanvas(canvas);
    return this.rocketLaunchTexture;
  }

  private readonly createStarSprite = (): Sprite => {
    const sprite = new Sprite(this.getStarTexture());
    sprite.anchor.set(0.5, 0.5);
    return sprite;
  };

  private readonly createCityLightSprite = (): Sprite => {
    const sprite = new Sprite(this.getCityLightTexture());
    sprite.anchor.set(0.5, 0.5);
    return sprite;
  };

  private readonly createBuildingLightSprite = (): Sprite => {
    const sprite = new Sprite(this.getBuildingLightTexture());
    sprite.anchor.set(0.5, 0.5);
    return sprite;
  };

  private readonly createOrbitParticleSprite = (): Particle => {
    return new Particle({
      texture: this.getParticleTexture(),
      anchorX: 0.5,
      anchorY: 0.5,
    });
  };

  private readonly createRocketLaunchSprite = (): Particle => {
    return new Particle({
      texture: this.getRocketLaunchTexture(),
      anchorX: 0.5,
      anchorY: 0.5,
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
}
