import { Container, Sprite, Texture } from 'pixi.js';
import { earthSvg } from '../../assets/sprites.ts';
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
}

interface ParticlePlacement {
  x: number;
  y: number;
  size: number;
  depth: number;
}

const EARTH_TEXTURE_SCALE = 6;
const BACKGROUND_STAR_DENSITY = 0.00022;
const BACKGROUND_STAR_MIN = 70;
const BACKGROUND_STAR_MAX = 230;
const PARTICLE_ALPHA = 1;

const ORBIT_BANDS: OrbitBandDefinition[] = [
  {
    key: 'leo',
    label: 'LEO',
    sourceStart: 0,
    maxVisible: 1152,
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
    maxVisible: 864,
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
    maxVisible: 640,
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
  private sampledSatelliteCount = 0;
  private activeBands: OrbitBandState[] = [];

  private backgroundSprite!: Sprite;
  private earthGlowSprite!: Sprite;
  private earthSprite!: Sprite;
  private backParticleContainer!: Container;
  private frontParticleContainer!: Container;

  private backgroundTexture: Texture | null = null;
  private earthTexture: Texture | null = null;
  private earthGlowTexture: Texture | null = null;
  private particleTexture: Texture | null = null;

  private backParticleSprites: Sprite[] = [];
  private frontParticleSprites: Sprite[] = [];

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
  }

  simulate(dtMs: number): void {
    this.elapsedSec += dtMs / 1000;
  }

  render(): void {
    if (!this.visible || !this.stageReady || !this.host.ready) {
      return;
    }

    const width = this.sceneEl.clientWidth;
    const height = this.sceneEl.clientHeight;
    if (width <= 0 || height <= 0) {
      return;
    }

    const planet = this.getPlanetLayout(width, height);
    const orbitBands = this.getOrbitBands();

    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.lastWidth = width;
      this.lastHeight = height;
      this.host.app.renderer.resize(width, height);
      this.rebuildBackground(width, height, planet);
    }

    this.activeBands = orbitBands;
    this.lastFrameDrawCalls = 0;
    this.updateEarthSprites(planet);
    this.updateParticleSprites(planet, orbitBands);
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
    this.backParticleContainer = new Container();
    this.earthGlowSprite = new Sprite(this.getEarthGlowTexture());
    this.earthGlowSprite.anchor.set(0.5, 0.5);
    this.earthSprite = new Sprite(Texture.EMPTY);
    this.earthSprite.anchor.set(0.5, 0.5);
    this.frontParticleContainer = new Container();

    stage.addChild(this.backgroundSprite);
    stage.addChild(this.backParticleContainer);
    stage.addChild(this.earthGlowSprite);
    stage.addChild(this.earthSprite);
    stage.addChild(this.frontParticleContainer);

    this.stageReady = true;
  }

  private primeTextures(): void {
    this.loadSvgTexture(earthSvg, EARTH_TEXTURE_SCALE, texture => {
      this.earthTexture = texture;
      if (this.stageReady) {
        this.earthSprite.texture = texture;
      }
    });
  }

  private loadSvgTexture(svgMarkup: string, scale: number, onReady: (texture: Texture) => void): void {
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
        onReady(textureFromCanvas(canvas));
      } else {
        onReady(Texture.from(image));
      }
    }, { once: true });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  }

  private getPlanetLayout(width: number, height: number): PlanetLayout {
    const radius = Math.max(68, Math.min(width * 0.29, height * 0.47));
    return {
      centerX: width * 0.5,
      centerY: height * 0.5,
      radius,
    };
  }

  private getOrbitBands(): OrbitBandState[] {
    const bands: OrbitBandState[] = [];
    for (const definition of ORBIT_BANDS) {
      const sourceCount = Math.max(0, this.sampledSatelliteCount - definition.sourceStart);
      const visibleCount = Math.min(definition.maxVisible, sourceCount);
      if (visibleCount <= 0) {
        continue;
      }

      const densityT = clamp01(Math.log1p(visibleCount) / Math.log1p(definition.maxVisible));
      const targetPlanes = Math.round(
        definition.minPlanes + ((definition.maxPlanes - definition.minPlanes) * densityT),
      );
      const planeCount = Math.max(1, Math.min(visibleCount, targetPlanes));
      bands.push({
        definition,
        sourceCount,
        visibleCount,
        planeCount,
      });
    }
    return bands;
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

    const starCount = Math.max(
      BACKGROUND_STAR_MIN,
      Math.min(BACKGROUND_STAR_MAX, Math.round(width * height * BACKGROUND_STAR_DENSITY)),
    );
    const starRng = new SeededRng(hashSeed(this.seed, (width << 16) ^ height));
    for (let i = 0; i < starCount; i++) {
      const x = starRng.next() * width;
      const y = Math.pow(starRng.next(), 0.85) * height * 0.9;
      const size = 0.6 + (starRng.next() * 1.8);
      const alpha = 0.22 + (starRng.next() * 0.55);
      ctx.fillStyle = `rgba(224, 241, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    this.backgroundTexture = replaceManagedTexture(this.backgroundTexture, textureFromCanvas(canvas));
    this.backgroundSprite.texture = this.backgroundTexture;
    this.backgroundSprite.x = 0;
    this.backgroundSprite.y = 0;
    this.backgroundSprite.width = width;
    this.backgroundSprite.height = height;
  }

  private updateEarthSprites(planet: PlanetLayout): void {
    const glowTexture = this.getEarthGlowTexture();
    const earthTexture = this.earthTexture ?? Texture.EMPTY;
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

  private updateParticleSprites(planet: PlanetLayout, orbitBands: OrbitBandState[]): void {
    const texture = this.getParticleTexture();
    const backPlacements: ParticlePlacement[] = [];
    const frontPlacements: ParticlePlacement[] = [];

    for (const band of orbitBands) {
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
        const radius = planet.radius * radiusMultiplier;
        const inclinationDeg = band.definition.inclinationBaseDeg
          + ((seededUnit(planeSeed, 0x22) - 0.5) * band.definition.inclinationSpreadDeg);
        const inclination = degToRad(inclinationDeg);
        const nodeAngle = ((planeIndex / Math.max(1, band.planeCount)) * Math.PI * 2)
          + (seededUnit(planeSeed, 0x33) * 0.45);
        const orbitalSpeed = band.definition.speedMin
          + (seededUnit(planeSeed, 0x44) * (band.definition.speedMax - band.definition.speedMin));
        const phaseOffset = seededUnit(planeSeed, 0x55) * Math.PI * 2;

        for (let dotIndex = 0; dotIndex < dotsInPlane; dotIndex++) {
          const dotSeed = hashSeed(planeSeed, dotIndex + 1);
          const phaseJitter = (seededUnit(dotSeed, 0x66) - 0.5)
            * (Math.PI * 2 / Math.max(16, dotsInPlane));
          const anomaly = phaseOffset
            + ((dotIndex / dotsInPlane) * Math.PI * 2)
            + phaseJitter
            + (this.elapsedSec * orbitalSpeed);
          const cosNode = Math.cos(nodeAngle);
          const sinNode = Math.sin(nodeAngle);
          const cosAnomaly = Math.cos(anomaly);
          const sinAnomaly = Math.sin(anomaly);
          const cosInclination = Math.cos(inclination);
          const sinInclination = Math.sin(inclination);

          const x = radius * ((cosNode * cosAnomaly) - (sinNode * sinAnomaly * cosInclination));
          const depth = radius * ((sinNode * cosAnomaly) + (cosNode * sinAnomaly * cosInclination));
          const z = radius * (sinAnomaly * sinInclination);
          const size = band.definition.particleSizeMin
            + (seededUnit(dotSeed, 0x77) * (band.definition.particleSizeMax - band.definition.particleSizeMin));
          const placement: ParticlePlacement = {
            x: planet.centerX + x,
            y: planet.centerY + z,
            size,
            depth,
          };
          if (depth >= 0) {
            frontPlacements.push(placement);
          } else {
            backPlacements.push(placement);
          }
        }
      }
    }

    backPlacements.sort((a, b) => a.depth - b.depth);
    frontPlacements.sort((a, b) => a.depth - b.depth);

    this.syncSpritePool(this.backParticleContainer, this.backParticleSprites, backPlacements.length, () => {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      return sprite;
    });
    this.syncSpritePool(this.frontParticleContainer, this.frontParticleSprites, frontPlacements.length, () => {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      return sprite;
    });

    for (let i = 0; i < backPlacements.length; i++) {
      const placement = backPlacements[i];
      const sprite = this.backParticleSprites[i];
      sprite.texture = texture;
      sprite.visible = true;
      sprite.x = placement.x;
      sprite.y = placement.y;
      sprite.width = placement.size;
      sprite.height = placement.size;
      sprite.alpha = PARTICLE_ALPHA;
      this.lastFrameDrawCalls++;
    }
    this.hideUnusedSprites(this.backParticleSprites, backPlacements.length);

    for (let i = 0; i < frontPlacements.length; i++) {
      const placement = frontPlacements[i];
      const sprite = this.frontParticleSprites[i];
      sprite.texture = texture;
      sprite.visible = true;
      sprite.x = placement.x;
      sprite.y = placement.y;
      sprite.width = placement.size;
      sprite.height = placement.size;
      sprite.alpha = PARTICLE_ALPHA;
      this.lastFrameDrawCalls++;
    }
    this.hideUnusedSprites(this.frontParticleSprites, frontPlacements.length);
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
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.26, 'rgba(255, 255, 255, 0.98)');
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(24, 24, 24, 0, Math.PI * 2);
    ctx.fill();

    this.particleTexture = textureFromCanvas(canvas);
    return this.particleTexture;
  }

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

  private hideUnusedSprites(pool: Sprite[], usedCount: number): void {
    for (let i = usedCount; i < pool.length; i++) {
      pool[i].visible = false;
    }
  }
}
