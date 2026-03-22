import {
  BALANCE,
  getCompletedResearchIds,
  getFacilityProductionMultiplier,
  getSolarPanelPowerMW,
  hasCompletedResearch,
} from '../../game/BalanceConfig.ts';
import type { FacilityId, GameState, LocationId, SupplyResourceId, TransportPayloadId, TransportRouteId } from '../../game/GameState.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import { canBuildFacility, isFacilityUnlocked as isFacilityUnlockedForLocation } from '../../game/systems/SupplySystem.ts';
import { getRobotLaborPerMin } from '../../game/systems/JobRules.ts';
import { estimateTransportRockets } from '../../game/systems/SpaceRules.ts';
import { fromBigInt, formatMW, formatNumber, mulB, toBigInt } from '../../game/utils.ts';
import { BulkBuyGroup, getVisibleBuyTiers } from '../components/BulkBuyGroup.ts';
import { createPanelScaffold } from '../components/PanelScaffold.ts';
import { emojiHtml, locationLabelHtml, resourceLabelHtml, UI_EMOJI } from '../emoji.ts';
import type { UiEmojiKey } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { flashElement } from '../UIUtils.ts';
import type { Panel } from '../PanelManager.ts';
import { getFacilityCardIconSvg } from './facilityCardIcons.ts';
import {
  createFacilityCardUi,
  createResourcePill,
  formatRecipeInputsHtml,
  setFacilityRecipeHtml,
  setFacilityOutputHtml,
  setResourcePillState,
  updateFacilityCardProgress,
} from './facilityCardUi.ts';
import type { FacilityCardRefs as BuiltFacilityCard, FacilityTone, ResourcePillRefs } from './facilityCardUi.ts';
import type { CountBulkBuyControls } from '../components/CountBulkBuyControls.ts';

type FacilityCardResourceId = SupplyResourceId | 'energy' | 'flops' | 'massInput' | 'massOutput';

interface FacilityCardRefs {
  controls: CountBulkBuyControls;
  price: HTMLSpanElement;
  formula: HTMLDivElement;
  progressFill: HTMLDivElement;
  progressLabel: HTMLSpanElement;
  output: HTMLSpanElement;
  resources: Partial<Record<FacilityCardResourceId, ResourcePillRefs>>;
}

interface MercuryDysonCardExtras {
  lane: RouteLaneRefs;
}

interface GridContractRefs {
  value: HTMLSpanElement;
  cost: HTMLSpanElement;
  buy: BulkBuyGroup;
  sell: BulkBuyGroup;
}

interface FacilityDef {
  id: FacilityId;
  label: string;
  hintId: string;
}

interface LogisticsRowRefs {
  row: HTMLDivElement;
  sent: HTMLSpanElement;
  inTransit: HTMLSpanElement;
  waiting: HTMLSpanElement;
  bulk?: BulkBuyGroup;
  clearBtn: HTMLButtonElement;
  autoToggle: HTMLButtonElement;
}

interface RouteLaneRefs {
  row: HTMLDivElement;
  lane: HTMLDivElement;
  resizeObserver: ResizeObserver;
  lastOutboundCount: number;
  lastReturningCount: number;
}

interface SupplyPanelOptions {
  fixedLocations?: LocationId[];
  showLocationHeaders?: boolean;
  showResources?: boolean;
  resourcesTitle?: string | null;
  sectionTitle?: string | null;
  logisticsTitle?: string | null;
  logisticsRoutes?: TransportRouteId[];
}

interface ResourcePillValue {
  amount: string;
  primary: string;
  secondary?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

interface RecipeDisplayParts {
  inputsHtml: string;
  outputsHtml: string;
}

const POWER_PLANT_UNLOCK_GRID_KW = toBigInt(1_000_000);
const MAX_VISIBLE_LOGISTICS_ROCKETS = 220;
const PANEL_LOGISTICS_ROCKET_DENSITY = 1.6;
const PANEL_ORBIT_ROUTE_DURATION_MS = 1000;
const PANEL_MOON_ROUTE_DURATION_MS = 3000;

type FacilityPriceEmoji = 'money' | 'labor' | 'material' | 'solarPanels' | 'gpus';

function getFacilitiesForLocation(location: LocationId): FacilityDef[] {
  if (location === 'earth') {
    return [
      { id: 'earthMaterialMine', label: 'Material Mines', hintId: 'resource.material' },
      { id: 'earthSolarFactory', label: 'Solar Factory', hintId: 'resource.solarPanels' },
      { id: 'earthRobotFactory', label: 'Robot Factory', hintId: 'resource.robots' },
      { id: 'earthGpuFactory', label: 'GPU Factory', hintId: 'infra.gpuFactory' },
      { id: 'earthRocketFactory', label: 'Rocket Factory', hintId: 'resource.rockets' },
      { id: 'earthGpuSatelliteFactory', label: 'GPU Sat Factory', hintId: 'resource.gpuSatellites' },
    ];
  }
  if (location === 'moon') {
    return [
      { id: 'moonMaterialMine', label: 'Material Mines', hintId: 'resource.material' },
      { id: 'moonSolarFactory', label: 'Solar Panel Factory', hintId: 'resource.solarPanels' },
      { id: 'moonRobotFactory', label: 'Robot Factory', hintId: 'resource.robots' },
      { id: 'moonGpuFactory', label: 'GPU Factory', hintId: 'infra.gpuFactory' },
      { id: 'moonGpuSatelliteFactory', label: 'GPU Satellite Factory', hintId: 'resource.gpuSatellites' },
      { id: 'moonMassDriver', label: 'Mass Driver', hintId: 'mechanic.spaceLogistics' },
    ];
  }
  return [
    { id: 'mercuryMaterialMine', label: 'Material Mines', hintId: 'resource.material' },
    { id: 'mercuryRobotFactory', label: 'Robot Factory', hintId: 'resource.robots' },
    { id: 'mercuryProbeFactory', label: 'Von Neumann Probe', hintId: 'resource.probes' },
    { id: 'mercuryDysonSwarmFacility', label: 'Dyson Swarm Facility', hintId: 'resource.gpuSatellites' },
  ];
}

function getMaterialMineForLocation(location: LocationId): FacilityId {
  if (location === 'earth') return 'earthMaterialMine';
  if (location === 'moon') return 'moonMaterialMine';
  return 'mercuryMaterialMine';
}

function getRouteRows(route: TransportRouteId): Array<{ payload: TransportPayloadId; label: string; hintId: string; bulk: boolean }> {
  if (route === 'earthOrbit') {
    return [{ payload: 'gpuSatellites', label: 'GPU Satellites', hintId: 'resource.gpuSatellites', bulk: true }];
  }
  if (route === 'earthMoon') {
    return [
      { payload: 'gpus', label: 'GPUs', hintId: 'resource.gpus', bulk: true },
      { payload: 'solarPanels', label: 'Solar Panels', hintId: 'resource.solarPanels', bulk: true },
      { payload: 'robots', label: 'Robots', hintId: 'resource.robots', bulk: true },
    ];
  }
  if (route === 'moonOrbit') {
    return [{ payload: 'gpuSatellites', label: 'GPU Satellites', hintId: 'resource.gpuSatellites', bulk: true }];
  }
  if (route === 'moonMercury') {
    return [{ payload: 'robots', label: 'Robots', hintId: 'resource.robots', bulk: true }];
  }
  return [{ payload: 'gpuSatellites', label: 'Dyson Swarm Satellites', hintId: 'resource.gpuSatellites', bulk: false }];
}

function getRouteSourceLocation(route: TransportRouteId): LocationId {
  if (route === 'earthOrbit' || route === 'earthMoon') return 'earth';
  if (route === 'moonOrbit' || route === 'moonMercury') return 'moon';
  return 'mercury';
}

function isRouteUnlocked(state: GameState, route: TransportRouteId): boolean {
  if (route === 'earthOrbit') return hasCompletedResearch(state.researchLevels, 'rocketry');
  if (route === 'earthMoon') return hasCompletedResearch(state.researchLevels, 'payloadToMoon');
  if (route === 'moonOrbit') {
    return hasCompletedResearch(state.researchLevels, 'payloadToMoon')
      && hasCompletedResearch(state.researchLevels, 'rocketry')
      && hasCompletedResearch(state.researchLevels, 'moonMassDrivers');
  }
  if (route === 'moonMercury') {
    return hasCompletedResearch(state.researchLevels, 'payloadToMercury')
      && hasCompletedResearch(state.researchLevels, 'moonMassDrivers');
  }
  return hasCompletedResearch(state.researchLevels, 'payloadToMercury');
}

export class SupplyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;
  private readonly fixedLocations: LocationId[] | null;
  private readonly showLocationHeaders: boolean;
  private readonly showResources: boolean;
  private readonly resourcesTitle: string | null;
  private readonly sectionTitle: string | null;
  private readonly logisticsTitle: string | null;
  private readonly logisticsRoutes: TransportRouteId[];

  private resourcesSection!: HTMLDivElement;
  private facilitiesSection!: HTMLDivElement;
  private logisticsSection!: HTMLDivElement;

  private layoutKey = '';
  private visibleLocations: LocationId[] = ['earth'];

  private locationEnergyRefs = new Map<LocationId, HTMLSpanElement>();
  private locationLaborRefs = new Map<LocationId, HTMLSpanElement>();
  private gridContractRefs: GridContractRefs | null = null;
  private facilityCards = new Map<string, FacilityCardRefs>();
  private specialFacilityCards = new Map<string, FacilityCardRefs>();
  private facilityPauseBtns = new Map<FacilityId, HTMLButtonElement[]>();
  private logisticsRows = new Map<string, LogisticsRowRefs>();
  private routeLanes = new Map<TransportRouteId, RouteLaneRefs>();
  private mercuryDysonCardExtras: MercuryDysonCardExtras | null = null;
  private readonly maxRocketsAddedPerUpdate = 12;
  private orbitSatRow: HTMLDivElement | null = null;
  private orbitSatEl: HTMLSpanElement | null = null;
  private orbitPowerEl: HTMLSpanElement | null = null;

  constructor(state: GameState, options: SupplyPanelOptions = {}) {
    this.state = state;
    this.fixedLocations = options.fixedLocations ? [...options.fixedLocations] : null;
    this.showLocationHeaders = options.showLocationHeaders ?? true;
    this.showResources = options.showResources ?? false;
    this.resourcesTitle = options.resourcesTitle ?? null;
    this.sectionTitle = options.sectionTitle ?? null;
    this.logisticsTitle = options.logisticsTitle ?? null;
    this.logisticsRoutes = options.logisticsRoutes ?? [];

    const { panel } = createPanelScaffold('SUPPLY CHAIN', {
      panelClassName: 'panel supply-panel',
      bodyClassName: 'panel-body panel-body-tight',
    });
    this.el = panel;
    this.buildBase();
  }

  private buildBase(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    this.resourcesSection = document.createElement('div');
    this.resourcesSection.className = 'panel-section';
    this.resourcesSection.style.gap = '2px';
    this.resourcesSection.style.display = this.showResources ? '' : 'none';
    body.appendChild(this.resourcesSection);

    this.facilitiesSection = document.createElement('div');
    this.facilitiesSection.className = 'panel-section';
    this.facilitiesSection.style.gap = '2px';
    body.appendChild(this.facilitiesSection);

    this.logisticsSection = document.createElement('div');
    this.logisticsSection.className = 'panel-section panel-section-logistics';
    this.logisticsSection.style.gap = '2px';
    this.logisticsSection.style.display = this.logisticsRoutes.length > 0 ? '' : 'none';
    body.appendChild(this.logisticsSection);
  }

  private getVisibleLocations(state: GameState): LocationId[] {
    let unlocked: LocationId[] = ['earth'];
    if (hasCompletedResearch(state.researchLevels, 'payloadToMercury')) {
      unlocked = ['earth', 'moon', 'mercury'];
    } else if (hasCompletedResearch(state.researchLevels, 'payloadToMoon')) {
      unlocked = ['earth', 'moon'];
    }
    if (!this.fixedLocations) return unlocked;
    return unlocked.filter((location) => this.fixedLocations!.includes(location));
  }

  private setText(el: Node, value: string): void {
    if (el.textContent !== value) {
      el.textContent = value;
    }
  }

  private setHtml(el: HTMLElement, value: string): void {
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }

  private setColor(el: HTMLElement, value: string): void {
    if (el.style.color !== value) {
      el.style.color = value;
    }
  }

  private setDisplay(el: HTMLElement, value: string): void {
    if (el.style.display !== value) {
      el.style.display = value;
    }
  }

  private setDisabled(el: HTMLButtonElement, value: boolean): void {
    if (el.disabled !== value) {
      el.disabled = value;
    }
  }

  private isLocationEnergyVisible(location: LocationId): boolean {
    return location === 'earth' || location === 'moon';
  }

  private isLocationLaborVisible(_location: LocationId): boolean {
    return true;
  }

  private getLowestDisplayedBuyAmount(
    owned: number,
    maxQuantity: number | null | undefined,
    canAct: (amount: number) => boolean,
  ): number | null {
    const tiers = getVisibleBuyTiers(owned, maxQuantity);
    if (tiers.length === 0) return null;
    if (tiers.length < 2) return tiers[0];

    const low = tiers[0];
    const high = tiers[1];
    if (high <= low || low <= 1 || canAct(low)) {
      return low;
    }

    let left = 1;
    let right = low - 1;
    let best = 0;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (canAct(mid)) {
        best = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return best > 0 ? best : low;
  }

  private buildCostHtml(parts: Array<{ amount: bigint; emoji: FacilityPriceEmoji; insufficient: boolean }>): string {
    let rendered = '';
    for (const part of parts) {
      if (part.amount <= 0n) continue;
      const color = part.insufficient ? 'var(--accent-red)' : 'var(--text-muted)';
      const piece = `<span style="color:${color}">${formatNumber(part.amount)} ${emojiHtml(part.emoji)}</span>`;
      rendered = rendered ? `${rendered} + ${piece}` : piece;
    }
    return rendered || '&nbsp;';
  }

  private getRegularFacilityBuildCostsPerUnit(location: LocationId, facility: FacilityId): { material: bigint; labor: bigint } {
    let baseMaterial = 0n;
    let baseLabor = 0n;

    if (facility === 'earthMaterialMine' || facility === 'moonMaterialMine' || facility === 'mercuryMaterialMine') {
      baseMaterial = BALANCE.materialMineBuildMaterialCost;
      baseLabor = BALANCE.materialMineBuildLaborCost;
    } else if (facility === 'earthSolarFactory' || facility === 'moonSolarFactory') {
      baseMaterial = BALANCE.solarFactoryBuildMaterialCost;
    } else if (facility === 'earthRobotFactory' || facility === 'moonRobotFactory' || facility === 'mercuryRobotFactory') {
      baseMaterial = BALANCE.robotFactoryBuildMaterialCost;
    } else if (facility === 'earthGpuFactory' || facility === 'moonGpuFactory') {
      baseMaterial = BALANCE.gpuFactoryBuildMaterialCost;
    } else if (facility === 'earthRocketFactory') {
      baseMaterial = BALANCE.rocketFactoryBuildMaterialCost;
    } else if (facility === 'earthGpuSatelliteFactory' || facility === 'moonGpuSatelliteFactory') {
      baseMaterial = BALANCE.gpuSatelliteFactoryBuildMaterialCost;
    } else if (facility === 'mercuryProbeFactory') {
      baseMaterial = BALANCE.probeFactoryBuildMaterialCost;
      baseLabor = BALANCE.probeFactoryBuildLaborCost;
    } else if (facility === 'mercuryDysonSwarmFacility') {
      baseMaterial = BALANCE.dysonSwarmFacilityBuildMaterialCost;
    } else if (facility === 'moonMassDriver') {
      baseMaterial = BALANCE.rocketFactoryBuildMaterialCost;
    }

    let materialMultiplier = toBigInt(1);
    let laborMultiplier = toBigInt(1);
    if (location === 'moon') {
      materialMultiplier = toBigInt(BALANCE.moonFacilityCostMultiplier);
      laborMultiplier = toBigInt(BALANCE.moonFacilityLaborMultiplier);
    } else if (location === 'mercury') {
      materialMultiplier = toBigInt(BALANCE.mercuryFacilityCostMultiplier);
      laborMultiplier = toBigInt(BALANCE.mercuryFacilityLaborMultiplier);
    }

    return {
      material: mulB(baseMaterial, materialMultiplier),
      labor: mulB(baseLabor, laborMultiplier),
    };
  }

  private isMaterialMineVisibleInUi(state: GameState, location: LocationId): boolean {
    if (location === 'earth') {
      return hasCompletedResearch(state.researchLevels, 'solarTechnology')
        || hasCompletedResearch(state.researchLevels, 'chipManufacturing');
    }
    return isFacilityUnlockedForLocation(state, location, getMaterialMineForLocation(location));
  }

  private registerPauseButton(facility: FacilityId, btn: HTMLButtonElement): void {
    const current = this.facilityPauseBtns.get(facility) ?? [];
    current.push(btn);
    this.facilityPauseBtns.set(facility, current);
  }

  private updatePauseButton(facility: FacilityId): void {
    const paused = this.state.pausedFacilities[facility] === true;
    for (const btn of this.facilityPauseBtns.get(facility) ?? []) {
      this.setText(btn, paused ? UI_EMOJI.play : UI_EMOJI.pause);
      const title = paused ? 'Resume production globally' : 'Pause production globally';
      if (btn.title !== title) {
        btn.title = title;
      }
      this.setColor(btn, paused ? 'var(--accent-gold)' : 'var(--text-muted)');
    }
  }

  private getRouteTransitMs(route: TransportRouteId): number {
    if (route === 'earthOrbit' || route === 'mercurySun') return PANEL_ORBIT_ROUTE_DURATION_MS;
    return PANEL_MOON_ROUTE_DURATION_MS;
  }

  private getRouteReturnMs(route: TransportRouteId): number {
    if (route === 'earthOrbit' || route === 'mercurySun') return PANEL_ORBIT_ROUTE_DURATION_MS;
    return PANEL_MOON_ROUTE_DURATION_MS;
  }

  private getLogisticsRocketCount(inTransit: bigint): number {
    if (inTransit <= 0n) return 0;
    return Math.max(
      1,
      Math.min(MAX_VISIBLE_LOGISTICS_ROCKETS, Math.round(fromBigInt(inTransit) * PANEL_LOGISTICS_ROCKET_DENSITY)),
    );
  }

  private getReturningRocketCount(outboundCount: number, rocketLossPct: number): number {
    if (outboundCount <= 0 || rocketLossPct >= BALANCE.rocketLossNoReuse) {
      return 0;
    }
    return Math.min(
      MAX_VISIBLE_LOGISTICS_ROCKETS,
      Math.floor(outboundCount * Math.max(0, 1 - rocketLossPct)),
    );
  }

  private createLaneRocket(direction: 'outbound' | 'returning', durationMs: number): HTMLSpanElement {
    const rocket = document.createElement('span');
    rocket.className = `logistics-rocket logistics-rocket-${direction}`;
    rocket.textContent = UI_EMOJI.rockets;
    const laneOffset = (Math.floor(Math.random() * 5) - 2) * 1.5;
    rocket.style.animationDuration = `${Math.max(0.2, durationMs / 1000)}s`;
    rocket.style.animationDelay = '0ms';
    rocket.style.setProperty('--lane-offset', `${laneOffset}px`);
    rocket.style.animationIterationCount = '1';
    return rocket;
  }

  private observeLaneRocketTravel(lane: HTMLDivElement): ResizeObserver {
    const syncTravel = (): void => {
      lane.style.setProperty('--rocket-travel', `${Math.max(0, lane.offsetWidth + 28)}px`);
    };
    const observer = new ResizeObserver(() => {
      syncTravel();
    });
    observer.observe(lane);
    syncTravel();
    return observer;
  }

  private resetRouteLane(refs: RouteLaneRefs): void {
    refs.lane.replaceChildren();
    refs.lastOutboundCount = 0;
    refs.lastReturningCount = 0;
  }

  private startRocketLeg(rocket: HTMLSpanElement, leg: 'outbound' | 'returning', durationMs: number, delayMs: number = 0): void {
    rocket.dataset.leg = leg;
    rocket.classList.remove('logistics-rocket-outbound', 'logistics-rocket-returning');
    rocket.classList.add(leg === 'outbound' ? 'logistics-rocket-outbound' : 'logistics-rocket-returning');
    rocket.style.animationDuration = `${Math.max(0.2, durationMs / 1000)}s`;
    rocket.style.animationDelay = `${Math.max(0, delayMs)}ms`;
  }

  private createManagedRocket(
    mode: 'outboundOnly' | 'roundtrip',
    transitMs: number,
    returnMs: number,
  ): HTMLSpanElement {
    const rocket = this.createLaneRocket('outbound', transitMs);
    rocket.dataset.mode = mode;
    rocket.dataset.retire = '0';
    const cycleMs = mode === 'roundtrip' ? transitMs + returnMs : transitMs;
    const startDelayMs = Math.floor(Math.random() * Math.max(1, cycleMs));
    this.startRocketLeg(rocket, 'outbound', transitMs, startDelayMs);

    rocket.addEventListener('animationend', () => {
      const leg = rocket.dataset.leg as 'outbound' | 'returning' | undefined;
      const retiring = rocket.dataset.retire === '1';
      const rocketMode = (rocket.dataset.mode as 'outboundOnly' | 'roundtrip' | undefined) ?? 'outboundOnly';

      if (leg === 'outbound') {
        if (rocketMode === 'roundtrip') {
          this.startRocketLeg(rocket, 'returning', returnMs, 0);
          return;
        }
        if (retiring) {
          rocket.remove();
          return;
        }
        this.startRocketLeg(rocket, 'outbound', transitMs, 0);
        return;
      }

      if (leg === 'returning') {
        if (retiring) {
          rocket.remove();
          return;
        }
        this.startRocketLeg(rocket, 'outbound', transitMs, 0);
      }
    });
    return rocket;
  }

  private syncModeRockets(
    lane: HTMLDivElement,
    mode: 'outboundOnly' | 'roundtrip',
    transitMs: number,
    returnMs: number,
    targetCount: number,
  ): void {
    const selector = `.logistics-rocket[data-mode="${mode}"]`;
    const all = Array.from(lane.querySelectorAll<HTMLSpanElement>(selector));
    const active = all.filter((el) => el.dataset.retire !== '1');
    const activeCount = active.length;

    if (activeCount < targetCount) {
      const toAdd = Math.min(targetCount - activeCount, this.maxRocketsAddedPerUpdate);
      for (let i = 0; i < toAdd; i++) {
        lane.appendChild(this.createManagedRocket(mode, transitMs, returnMs));
      }
      return;
    }

    if (activeCount > targetCount) {
      let toRetire = activeCount - targetCount;
      for (let i = active.length - 1; i >= 0 && toRetire > 0; i--) {
        active[i].dataset.retire = '1';
        toRetire--;
      }
    }
  }

  private syncLogisticsRockets(
    route: TransportRouteId,
    lane: HTMLDivElement,
    outboundTarget: number,
    returningTarget: number,
  ): void {
    const roundtripTarget = Math.min(outboundTarget, returningTarget);
    const outboundOnlyTarget = Math.max(0, outboundTarget - roundtripTarget);
    const transitMs = this.getRouteTransitMs(route);
    const returnMs = this.getRouteReturnMs(route);

    this.syncModeRockets(lane, 'outboundOnly', transitMs, returnMs, outboundOnlyTarget);
    this.syncModeRockets(lane, 'roundtrip', transitMs, returnMs, roundtripTarget);
  }

  private updateRouteLaneState(refs: RouteLaneRefs, visible: boolean, inTransit: bigint, route: TransportRouteId = 'mercurySun'): void {
    this.setDisplay(refs.row, visible ? '' : 'none');
    if (!visible) {
      this.resetRouteLane(refs);
      return;
    }

    const outboundCount = this.getLogisticsRocketCount(inTransit);
    const returningCount = this.getReturningRocketCount(outboundCount, this.state.rocketLossPct);
    if (refs.lastOutboundCount === outboundCount && refs.lastReturningCount === returningCount) {
      return;
    }

    this.syncLogisticsRockets(route, refs.lane, outboundCount, returningCount);
    refs.lastOutboundCount = outboundCount;
    refs.lastReturningCount = returningCount;
  }

  private buildRouteLaneRow(parent: HTMLElement, route: TransportRouteId): void {
    const sourceLocation = getRouteSourceLocation(route);
    const destination: 'moon' | 'mercury' | 'orbit' | 'sun' =
      route === 'earthOrbit'
        ? 'orbit'
        : route === 'earthMoon'
          ? 'moon'
          : route === 'moonOrbit'
            ? 'orbit'
            : route === 'moonMercury'
              ? 'mercury'
              : 'sun';

    const row = document.createElement('div');
    row.className = 'panel-row logistics-route-row';

    const sourceEnd = document.createElement('span');
    sourceEnd.className = 'logistics-route-end';
    sourceEnd.innerHTML = `${sourceLocation === 'earth' ? 'Earth' : sourceLocation === 'moon' ? 'Moon' : 'Mercury'} ${emojiHtml(sourceLocation)}`;

    const lane = document.createElement('div');
    lane.className = 'logistics-lane';

    const destinationEnd = document.createElement('span');
    destinationEnd.className = 'logistics-route-end';
    destinationEnd.innerHTML = destination === 'sun'
      ? `${emojiHtml('sun')}Sun`
      : `${emojiHtml(destination)}${destination === 'moon' ? 'Moon' : destination === 'mercury' ? 'Mercury' : 'Orbit'}`;

    row.appendChild(sourceEnd);
    row.appendChild(lane);
    row.appendChild(destinationEnd);

    parent.appendChild(row);
    this.routeLanes.set(route, {
      row,
      lane,
      resizeObserver: this.observeLaneRocketTravel(lane),
      lastOutboundCount: -1,
      lastReturningCount: -1,
    });
  }

  private toggleFacilityPause(facility: FacilityId): void {
    this.state.pausedFacilities[facility] = !this.state.pausedFacilities[facility];
    this.updatePauseButton(facility);
  }

  private getFacilityKey(location: LocationId, facility: FacilityId): string {
    return `${facility}:${location}`;
  }

  private getRegularFacilityIconSvg(facility: FacilityId): string {
    return getFacilityCardIconSvg(facility);
  }

  private getRegularFacilityInputs(facility: FacilityId): Array<{ resource: SupplyResourceId; amount: bigint }> {
    if (facility === 'earthMaterialMine' || facility === 'moonMaterialMine' || facility === 'mercuryMaterialMine') {
      return [{ resource: 'labor', amount: BALANCE.materialMineLaborReq }];
    }
    if (facility === 'earthSolarFactory' || facility === 'moonSolarFactory') {
      return [
        { resource: 'material', amount: BALANCE.solarFactoryMaterialReq },
        { resource: 'labor', amount: BALANCE.solarFactoryLaborCost },
      ];
    }
    if (facility === 'earthRobotFactory' || facility === 'moonRobotFactory' || facility === 'mercuryRobotFactory') {
      return [
        { resource: 'material', amount: BALANCE.robotFactoryMaterialReq },
        { resource: 'labor', amount: BALANCE.robotFactoryLaborCost },
      ];
    }
    if (facility === 'earthGpuFactory' || facility === 'moonGpuFactory') {
      return [
        { resource: 'material', amount: BALANCE.gpuFactoryMaterialReq },
        { resource: 'labor', amount: BALANCE.gpuFactoryLaborCost },
      ];
    }
    if (facility === 'earthRocketFactory') {
      return [
        { resource: 'material', amount: BALANCE.rocketFactoryMaterialReq },
        { resource: 'labor', amount: BALANCE.rocketFactoryLaborCost },
      ];
    }
    if (facility === 'earthGpuSatelliteFactory' || facility === 'moonGpuSatelliteFactory') {
      return [
        { resource: 'solarPanels', amount: BALANCE.gpuSatelliteFactorySolarPanelReq },
        { resource: 'gpus', amount: BALANCE.gpuSatelliteFactoryGpuReq },
      ];
    }
    if (facility === 'mercuryProbeFactory') {
      return [
        { resource: 'material', amount: BALANCE.probeFactoryMaterialReq },
        { resource: 'labor', amount: BALANCE.probeFactoryLaborReq },
      ];
    }
    if (facility === 'mercuryDysonSwarmFacility') {
      return [
        { resource: 'material', amount: BALANCE.dysonSwarmFacilityMaterialReq },
        { resource: 'labor', amount: BALANCE.dysonSwarmFacilityLaborReq },
      ];
    }
    return [];
  }

  private getRegularFacilityOutputResource(facility: FacilityId): SupplyResourceId | null {
    if (facility === 'earthMaterialMine' || facility === 'moonMaterialMine' || facility === 'mercuryMaterialMine') return 'material';
    if (facility === 'earthSolarFactory' || facility === 'moonSolarFactory') return 'solarPanels';
    if (facility === 'earthRobotFactory' || facility === 'moonRobotFactory' || facility === 'mercuryRobotFactory') return 'robots';
    if (facility === 'earthGpuFactory' || facility === 'moonGpuFactory') return 'gpus';
    if (facility === 'earthRocketFactory') return 'rockets';
    if (facility === 'mercuryProbeFactory') return 'probes';
    if (facility === 'earthGpuSatelliteFactory' || facility === 'moonGpuSatelliteFactory' || facility === 'mercuryDysonSwarmFacility') return 'gpuSatellites';
    return null;
  }

  private getRegularFacilityFormulaOutputHtml(state: GameState, facility: FacilityId): string {
    if (facility === 'moonMassDriver') {
      return `${formatNumber(toBigInt(BALANCE.massDriverLaunchesPerMin))} ${emojiHtml('rockets')}/m`;
    }

    let output = 0n;
    let emoji: UiEmojiKey = 'material';
    let productionId:
      | 'materialMine'
      | 'solarFactory'
      | 'robotFactory'
      | 'gpuFactory'
      | 'rocketFactory'
      | 'gpuSatelliteFactory'
      | 'probeFactory'
      | 'dysonSwarmFacility';

    if (facility === 'earthMaterialMine' || facility === 'moonMaterialMine' || facility === 'mercuryMaterialMine') {
      output = BALANCE.materialMineOutput;
      emoji = 'material';
      productionId = 'materialMine';
    } else if (facility === 'earthSolarFactory' || facility === 'moonSolarFactory') {
      output = BALANCE.solarFactoryOutput;
      emoji = 'solarPanels';
      productionId = 'solarFactory';
    } else if (facility === 'earthRobotFactory' || facility === 'moonRobotFactory' || facility === 'mercuryRobotFactory') {
      output = BALANCE.robotFactoryOutput;
      emoji = 'robots';
      productionId = 'robotFactory';
    } else if (facility === 'earthGpuFactory' || facility === 'moonGpuFactory') {
      output = BALANCE.gpuFactoryOutput;
      emoji = 'gpus';
      productionId = 'gpuFactory';
    } else if (facility === 'earthRocketFactory') {
      output = toBigInt(BALANCE.rocketFactoryOutput);
      emoji = 'rockets';
      productionId = 'rocketFactory';
    } else if (facility === 'mercuryProbeFactory') {
      output = toBigInt(BALANCE.probeFactoryOutput);
      emoji = 'probes';
      productionId = 'probeFactory';
    } else if (facility === 'earthGpuSatelliteFactory' || facility === 'moonGpuSatelliteFactory') {
      output = toBigInt(BALANCE.gpuSatelliteFactoryOutput);
      emoji = 'gpuSatellites';
      productionId = 'gpuSatelliteFactory';
    } else {
      output = toBigInt(BALANCE.dysonSwarmFacilityOutput);
      emoji = 'gpuSatellites';
      productionId = 'dysonSwarmFacility';
    }

    const perFacility = mulB(output, toBigInt(getFacilityProductionMultiplier(state.researchLevels, productionId)));
    return `${formatNumber(perFacility)} ${emojiHtml(emoji)}/m`;
  }

  private formatLocationResourceAmount(state: GameState, location: LocationId, resource: SupplyResourceId): string {
    const stock = state.locationResources[location][resource];

    let capSuffix = '';
    if (resource === 'rockets' || resource === 'gpus' || resource === 'solarPanels' || resource === 'robots') {
      if (stock >= BALANCE.locationResourceStockpileCap) capSuffix = `/${BALANCE.locationResourceStockpileCapLabel}`;
    }
    if (location === 'mercury' && resource === 'material' && stock >= BALANCE.mercuryMaterialStockpileCap) {
      capSuffix = `/${BALANCE.mercuryMaterialStockpileCapLabel}`;
    }

    return `${formatNumber(stock)}${capSuffix}`;
  }

  private isResourceNetNegative(
    state: GameState,
    location: LocationId,
    resource: SupplyResourceId,
  ): boolean {
    const income = state.locationProductionPerMin[location][resource];
    const expense = state.locationConsumptionPerMin[location][resource];
    return income < expense;
  }

  private createFacilityCard(
    title: string,
    iconSvg: string,
    hintId: string,
    onBuy: (amount: number) => void,
    pauseFacility?: FacilityId,
  ): BuiltFacilityCard {
    const refs = createFacilityCardUi({
      title,
      iconSvg,
      hintId,
      onBuy,
      onPause: pauseFacility ? () => this.toggleFacilityPause(pauseFacility) : undefined,
    });
    if (pauseFacility && refs.pauseBtn) {
      this.registerPauseButton(pauseFacility, refs.pauseBtn);
    }
    return refs;
  }

  private createCardResourceRefs(
    inputParent: HTMLDivElement,
    outputParent: HTMLDivElement,
    inputResources: SupplyResourceId[],
    outputResource: FacilityCardResourceId | null,
  ): Partial<Record<FacilityCardResourceId, ResourcePillRefs>> {
    const refs: Partial<Record<FacilityCardResourceId, ResourcePillRefs>> = {};
    for (const resource of inputResources) {
      refs[resource] = createResourcePill(inputParent, emojiHtml(resource));
    }
    if (outputResource) {
      refs[outputResource] = createResourcePill(outputParent, this.getCardResourceLabelHtml(outputResource));
      refs[outputResource]?.pill.classList.toggle('facility-card-pill-compact', this.isCompactOutputPillResource(outputResource));
    }
    return refs;
  }

  private isConsumableFacilityOutputResource(resource: SupplyResourceId): boolean {
    return resource === 'material' || resource === 'solarPanels' || resource === 'gpus';
  }

  private isCompactOutputPillResource(resource: FacilityCardResourceId): boolean {
    return resource === 'robots' || resource === 'rockets' || resource === 'gpuSatellites' || resource === 'probes';
  }

  private getCardResourceLabelHtml(resource: FacilityCardResourceId): string {
    if (resource === 'massInput') {
      return emojiHtml('mass');
    }
    if (resource === 'massOutput') {
      return emojiHtml('mass');
    }
    return emojiHtml(resource);
  }

  private registerCard(
    registry: Map<string, FacilityCardRefs>,
    key: string,
    card: BuiltFacilityCard,
    inputResources: SupplyResourceId[],
    outputResource: FacilityCardResourceId | null,
    parent: HTMLElement,
  ): void {
    card.card.classList.toggle('facility-card-compact-io', inputResources.length === 1 && outputResource !== null);
    parent.appendChild(card.card);
    registry.set(key, {
      controls: card.controls!,
      price: card.price!,
      formula: card.formula,
      progressFill: card.progressFill,
      progressLabel: card.progressLabel,
      output: card.output,
      resources: this.createCardResourceRefs(
        card.inputResourceWrap,
        card.outputResourceWrap,
        inputResources,
        outputResource,
      ),
    });
  }

  private setCardResourceState(
    refs: FacilityCardRefs,
    resource: FacilityCardResourceId,
    value: ResourcePillValue,
    tone: FacilityTone = 'normal',
  ): void {
    const resourceRefs = refs.resources[resource];
    if (!resourceRefs) return;
    setResourcePillState(
      resourceRefs,
      value.amount,
      value.primary,
      value.secondary,
      tone,
      value.primaryColor ?? 'var(--text-muted)',
      value.secondaryColor ?? 'var(--text-muted)',
    );
  }

  private getInputTone(facilityRate: number, isDeficit: boolean, hasBuffer: boolean, isActive: boolean): FacilityTone {
    if (!isActive) return 'normal';
    if (isDeficit && !hasBuffer) return 'bad';
    if (isDeficit) return 'warn';
    if (facilityRate < 0.999) return 'warn';
    return 'normal';
  }

  private getEffectiveActiveBuildings(owned: bigint, facilityRate: number): number {
    return Math.max(0, fromBigInt(owned) * Math.max(0, Math.min(1, facilityRate)));
  }

  private getFacilityFlowCapacity(owned: bigint, limit: number | null): number {
    if (limit !== null && limit > 0) return limit;
    return Math.max(1, fromBigInt(owned));
  }

  private getMoonMassDriverPendingMass(state: GameState): bigint {
    const pendingSatellites = state.logisticsOrders['moonOrbit:gpuSatellites'] || 0n;
    const pendingRobots = state.logisticsOrders['moonMercury:robots'] || 0n;
    return mulB(pendingSatellites, toBigInt(BALANCE.gpuSatelliteWeight))
      + mulB(pendingRobots, toBigInt(BALANCE.robotWeight));
  }

  private getMoonMassDriverLaunchedMass(state: GameState): bigint {
    const sentSatellites = state.logisticsSent['moonOrbit:gpuSatellites'] || 0n;
    const pendingSatellites = state.logisticsOrders['moonOrbit:gpuSatellites'] || 0n;
    const launchedSatellites = sentSatellites > pendingSatellites ? sentSatellites - pendingSatellites : 0n;
    const sentRobots = state.logisticsSent['moonMercury:robots'] || 0n;
    const pendingRobots = state.logisticsOrders['moonMercury:robots'] || 0n;
    const launchedRobots = sentRobots > pendingRobots ? sentRobots - pendingRobots : 0n;
    return mulB(launchedSatellites, toBigInt(BALANCE.gpuSatelliteWeight))
      + mulB(launchedRobots, toBigInt(BALANCE.robotWeight));
  }

  private registerCustomCard(
    registry: Map<string, FacilityCardRefs>,
    key: string,
    card: BuiltFacilityCard,
    resources: Partial<Record<FacilityCardResourceId, ResourcePillRefs>>,
    parent: HTMLElement,
  ): void {
    parent.appendChild(card.card);
    registry.set(key, {
      controls: card.controls!,
      price: card.price!,
      formula: card.formula,
      progressFill: card.progressFill,
      progressLabel: card.progressLabel,
      output: card.output,
      resources,
    });
  }

  private getOutputPillValue(state: GameState, location: LocationId, resource: SupplyResourceId): ResourcePillValue {
    const production = state.locationProductionPerMin[location][resource];
    const consumption = state.locationConsumptionPerMin[location][resource];
    return {
      amount: this.formatLocationResourceAmount(state, location, resource),
      primary: `+${formatNumber(production)}/m`,
      secondary: this.isConsumableFacilityOutputResource(resource) ? `-${formatNumber(consumption)}/m` : '',
      primaryColor: 'var(--accent-green)',
      secondaryColor: 'var(--accent-red)',
    };
  }

  private getInputPillValue(
    state: GameState,
    location: LocationId,
    resource: SupplyResourceId,
    facilityConsumptionPerMin: bigint,
  ): ResourcePillValue {
    return {
      amount: this.formatLocationResourceAmount(state, location, resource),
      primary: `-${formatNumber(facilityConsumptionPerMin)}/m`,
      secondary: '',
      primaryColor: 'var(--text-muted)',
      secondaryColor: 'var(--text-muted)',
    };
  }

  private updateMoonMassDriverCard(state: GameState): void {
    const refs = this.specialFacilityCards.get('moonMassDriver:moon');
    if (!refs) return;

    const owned = state.locationFacilities.moon.moonMassDriver;
    const ownedNum = Math.floor(fromBigInt(owned));
    const limit = BALANCE.moonMassDriverLimit;
    const canBuy = (amt: number) => canBuildFacility(this.state, 'moon', 'moonMassDriver', amt);
    const lowerAmount = this.getLowestDisplayedBuyAmount(ownedNum, limit, canBuy);
    const lowerAmountB = lowerAmount === null ? 0n : toBigInt(lowerAmount);
    const unitCosts = this.getRegularFacilityBuildCostsPerUnit('moon', 'moonMassDriver');
    const materialNeed = lowerAmount === null ? 0n : mulB(lowerAmountB, unitCosts.material);
    const laborNeed = lowerAmount === null ? 0n : mulB(lowerAmountB, unitCosts.labor);
    const materialOk = lowerAmount === null || state.locationResources.moon.material >= materialNeed;
    const laborOk = lowerAmount === null || state.locationResources.moon.labor >= laborNeed;

    const pendingMass = this.getMoonMassDriverPendingMass(state);
    const launchedMass = this.getMoonMassDriverLaunchedMass(state);
    const isPaused = state.pausedFacilities.moonMassDriver;
    const hasBuildings = owned > 0n;
    const launchMassPerMin = hasBuildings && !isPaused && pendingMass > 0n
      ? mulB(mulB(owned, toBigInt(BALANCE.massDriverLaunchesPerMin)), toBigInt(BALANCE.rocketCapacityMoonMercury))
      : 0n;

    refs.controls.setCount(owned);
    this.setHtml(refs.price, this.buildCostHtml([
      { amount: unitCosts.material, emoji: 'material', insufficient: !materialOk },
      { amount: unitCosts.labor, emoji: 'labor', insufficient: !laborOk },
    ]));
    refs.controls.bulk.update(
      ownedNum,
      canBuy,
      limit,
      (amt) => {
        if (amt === 1) {
          flashElement(refs.price);
          return;
        }
        flashElement(refs.controls.countEl);
      },
    );
    setFacilityRecipeHtml(refs.formula, '');
    setFacilityOutputHtml(refs.output, '');
    this.setCardResourceState(refs, 'massInput', {
      amount: `${UI_EMOJI.mass ?? '⚖️'} ${formatNumber(pendingMass)} kg`,
      primary: `-${formatNumber(launchMassPerMin)} kg/m`,
      primaryColor: 'var(--text-muted)',
    });
    this.setCardResourceState(refs, 'massOutput', {
      amount: `${UI_EMOJI.mass ?? '⚖️'} ${formatNumber(launchedMass)} kg`,
      primary: `+${formatNumber(launchMassPerMin)} kg/m`,
      primaryColor: 'var(--accent-green)',
    });
    updateFacilityCardProgress(
      refs.progressFill,
      refs.progressLabel,
      hasBuildings && !isPaused ? state.locationFacilityRates.moon.moonMassDriver : 0,
      hasBuildings && !isPaused ? this.getEffectiveActiveBuildings(owned, state.locationFacilityRates.moon.moonMassDriver) : 0,
      this.getFacilityFlowCapacity(owned, limit),
      state.time,
      hasBuildings,
      isPaused,
    );
  }

  private updateMercuryDysonSwarmCard(state: GameState): void {
    const refs = this.specialFacilityCards.get('mercuryDysonSwarmFacility:mercury');
    if (!refs) return;

    const owned = state.locationFacilities.mercury.mercuryDysonSwarmFacility;
    const ownedNum = Math.floor(fromBigInt(owned));
    const limit = this.getFacilityLimit('mercury', 'mercuryDysonSwarmFacility');
    const canBuy = (amt: number) => canBuildFacility(this.state, 'mercury', 'mercuryDysonSwarmFacility', amt);
    const lowerAmount = this.getLowestDisplayedBuyAmount(ownedNum, limit, canBuy);
    const lowerAmountB = lowerAmount === null ? 0n : toBigInt(lowerAmount);
    const unitCosts = this.getRegularFacilityBuildCostsPerUnit('mercury', 'mercuryDysonSwarmFacility');
    const materialNeed = lowerAmount === null ? 0n : mulB(lowerAmountB, unitCosts.material);
    const laborNeed = lowerAmount === null ? 0n : mulB(lowerAmountB, unitCosts.labor);
    const materialOk = lowerAmount === null || state.locationResources.mercury.material >= materialNeed;
    const laborOk = lowerAmount === null || state.locationResources.mercury.labor >= laborNeed;

    const facilityRate = state.locationFacilityRates.mercury.mercuryDysonSwarmFacility;
    const isPaused = state.pausedFacilities.mercuryDysonSwarmFacility;
    const isActive = owned > 0n && !isPaused;
    const materialUse = isActive
      ? mulB(mulB(owned, BALANCE.dysonSwarmFacilityMaterialReq), toBigInt(facilityRate))
      : 0n;
    const laborUse = isActive
      ? mulB(mulB(owned, BALANCE.dysonSwarmFacilityLaborReq), toBigInt(facilityRate))
      : 0n;

    refs.controls.setCount(owned);
    this.setHtml(refs.price, this.buildCostHtml([
      { amount: unitCosts.material, emoji: 'material', insufficient: !materialOk },
      { amount: unitCosts.labor, emoji: 'labor', insufficient: !laborOk },
    ]));
    refs.controls.bulk.update(
      ownedNum,
      canBuy,
      limit,
      (amt) => {
        if (amt === 1) {
          flashElement(refs.price);
          return;
        }
        flashElement(refs.controls.countEl);
      },
    );
    setFacilityRecipeHtml(refs.formula, formatRecipeInputsHtml([
      `${formatNumber(BALANCE.dysonSwarmFacilityMaterialReq)} ${emojiHtml('material')}`,
      `${formatNumber(BALANCE.dysonSwarmFacilityLaborReq)} ${emojiHtml('labor')}`,
    ]));
    setFacilityOutputHtml(
      refs.output,
      `${formatNumber(toBigInt(BALANCE.dysonSwarmFacilityOutput))} ${emojiHtml('gpuSatellites')} ` +
      `<span class="facility-card-output-detail">${formatNumber(state.dysonSwarmSatellites)} ${emojiHtml('gpuSatellites')} ${formatMW(state.dysonSwarmPowerMW)}</span>`,
    );
    this.setCardResourceState(
      refs,
      'material',
      this.getInputPillValue(state, 'mercury', 'material', materialUse),
      this.getInputTone(
        facilityRate,
        this.isResourceNetNegative(state, 'mercury', 'material'),
        state.locationResources.mercury.material > 0n,
        isActive,
      ),
    );
    this.setCardResourceState(
      refs,
      'labor',
      this.getInputPillValue(state, 'mercury', 'labor', laborUse),
      this.getInputTone(
        facilityRate,
        this.isResourceNetNegative(state, 'mercury', 'labor'),
        state.locationResources.mercury.labor > 0n,
        isActive,
      ),
    );
    this.setCardResourceState(
      refs,
      'gpuSatellites',
      this.getOutputPillValue(state, 'mercury', 'gpuSatellites'),
      'normal',
    );
    updateFacilityCardProgress(
      refs.progressFill,
      refs.progressLabel,
      isActive ? facilityRate : 0,
      isActive ? this.getEffectiveActiveBuildings(owned, facilityRate) : 0,
      this.getFacilityFlowCapacity(owned, limit),
      state.time,
      owned > 0n,
      isPaused,
    );

    if (this.mercuryDysonCardExtras) {
      const producedPerMin = state.locationProductionPerMin.mercury.gpuSatellites;
      const visualLaunches = estimateTransportRockets(state, 'mercurySun', 'gpuSatellites', producedPerMin);
      const hasVisualFlow = isActive && producedPerMin > 0n;
      const visualFlow = hasVisualFlow ? toBigInt(Math.max(1, visualLaunches)) : 0n;
      this.updateRouteLaneState(this.mercuryDysonCardExtras.lane, hasVisualFlow, visualFlow, 'mercurySun');
    }
  }

  private buildRegularFacilityFormulaParts(
    state: GameState,
    location: LocationId,
    facility: FacilityId,
    facilityRate: number,
    isActive: boolean,
    refs: FacilityCardRefs,
  ): RecipeDisplayParts {
    const renderedInputs: string[] = [];
    const owned = state.locationFacilities[location][facility];
    for (const input of this.getRegularFacilityInputs(facility)) {
      const isDeficit = this.isResourceNetNegative(state, location, input.resource);
      const stock = state.locationResources[location][input.resource];
      const hasBuffer = stock > 0n;
      const tone = this.getInputTone(facilityRate, isDeficit, hasBuffer, isActive);
      const baseConsumptionPerMin = mulB(owned, input.amount);
      const facilityConsumptionPerMin = isActive ? mulB(baseConsumptionPerMin, toBigInt(facilityRate)) : 0n;
      this.setCardResourceState(
        refs,
        input.resource,
        this.getInputPillValue(state, location, input.resource, facilityConsumptionPerMin),
        tone,
      );
      const color = tone === 'bad'
        ? 'var(--accent-red)'
        : tone === 'warn'
          ? 'var(--accent-gold)'
          : 'var(--text-primary)';
      renderedInputs.push(`<span style="color:${color}">${formatNumber(input.amount)} ${emojiHtml(input.resource)}</span>`);
    }

    const outputResource = this.getRegularFacilityOutputResource(facility);
    if (outputResource) {
      this.setCardResourceState(
        refs,
        outputResource,
        this.getOutputPillValue(state, location, outputResource),
        'normal',
      );
    }

    const formulaOutput = this.getRegularFacilityFormulaOutputHtml(state, facility).replace('/m', '');
    return {
      inputsHtml: formatRecipeInputsHtml(renderedInputs),
      outputsHtml: formulaOutput,
    };
  }

  private updatePowerPlantCard(
    state: GameState,
    key: string,
    owned: bigint,
    config: {
      cost: bigint;
      laborCost: bigint;
      outputMW: bigint;
      limit?: number | null;
    },
  ): void {
    const refs = this.specialFacilityCards.get(key);
    if (!refs) return;

    const ownedNum = Math.floor(fromBigInt(owned));
    const earthLabor = state.locationResources.earth.labor;
    const limit = config.limit ?? null;
    const canBuy = (amt: number) => {
      const amount = toBigInt(amt);
      return state.funds >= mulB(amount, config.cost)
        && earthLabor >= mulB(amount, config.laborCost);
    };
    const lowerAmount = this.getLowestDisplayedBuyAmount(ownedNum, limit, canBuy);
    const lowerAmountB = lowerAmount === null ? 0n : toBigInt(lowerAmount);
    const moneyNeed = lowerAmount === null ? 0n : mulB(lowerAmountB, config.cost);
    const laborNeed = lowerAmount === null ? 0n : mulB(lowerAmountB, config.laborCost);
    const moneyOk = lowerAmount === null || state.funds >= moneyNeed;
    const laborOk = lowerAmount === null || earthLabor >= laborNeed;
    const totalOutput = formatMW(mulB(owned, config.outputMW));

    refs.controls.setCount(owned);
    this.setHtml(refs.price, this.buildCostHtml([
      { amount: config.cost, emoji: 'money', insufficient: !moneyOk },
      { amount: config.laborCost, emoji: 'labor', insufficient: !laborOk },
    ]));
    refs.controls.bulk.update(
      ownedNum,
      canBuy,
      limit,
      () => flashElement(refs.price),
    );
    setFacilityRecipeHtml(refs.formula, '');
    setFacilityOutputHtml(refs.output, '');
    this.setCardResourceState(refs, 'energy', { amount: totalOutput, primary: `${formatMW(config.outputMW)} each` });
    updateFacilityCardProgress(refs.progressFill, refs.progressLabel, 0, 0, 1, state.time, owned > 0n);
  }

  private updateSolarFarmCard(
    state: GameState,
    location: 'earth' | 'moon',
    key: string,
    laborPerFarm: bigint,
  ): void {
    const refs = this.specialFacilityCards.get(key);
    if (!refs) return;

    const locationResources = state.locationResources[location];
    const farmAmount = toBigInt(BALANCE.solarFarmPanelsPerFarm);
    const unitsInstalled = locationResources.installedSolarPanels / farmAmount;
    const unitsInstalledNum = Number(unitsInstalled);
    const outputPerFarm = mulB(farmAmount, toBigInt(getSolarPanelPowerMW(location, state.researchLevels)));
    const limit = BALANCE.solarFarmLimit;
    const canBuy = (amt: number) => {
      const amount = toBigInt(amt);
      const amountUnits = BigInt(amt);
      const panels = mulB(amount, farmAmount);
      const labor = mulB(amount, laborPerFarm);
      return locationResources.solarPanels >= panels
        && locationResources.labor >= labor
        && unitsInstalled + amountUnits <= BigInt(limit);
    };
    const lowerAmount = this.getLowestDisplayedBuyAmount(unitsInstalledNum, limit, canBuy);
    const lowerAmountB = lowerAmount === null ? 0n : toBigInt(lowerAmount);
    const panelsNeed = lowerAmount === null ? 0n : mulB(lowerAmountB, farmAmount);
    const laborNeed = lowerAmount === null ? 0n : mulB(lowerAmountB, laborPerFarm);
    const panelsOk = lowerAmount === null || locationResources.solarPanels >= panelsNeed;
    const laborOk = lowerAmount === null || locationResources.labor >= laborNeed;
    const totalOutput = formatMW(mulB(locationResources.installedSolarPanels, toBigInt(getSolarPanelPowerMW(location, state.researchLevels))));

    refs.controls.setCount(unitsInstalledNum);
    this.setHtml(refs.price, this.buildCostHtml([
      { amount: farmAmount, emoji: 'solarPanels', insufficient: !panelsOk },
      { amount: laborPerFarm, emoji: 'labor', insufficient: !laborOk },
    ]));
    refs.controls.bulk.update(
      unitsInstalledNum,
      canBuy,
      limit,
      () => flashElement(refs.price),
    );
    setFacilityRecipeHtml(refs.formula, '');
    setFacilityOutputHtml(refs.output, '');
    this.setCardResourceState(refs, 'energy', { amount: totalOutput, primary: `${formatMW(outputPerFarm)} each` });
    updateFacilityCardProgress(refs.progressFill, refs.progressLabel, 0, 0, 1, state.time, unitsInstalled > 0n);
  }

  private updateMoonDatacenterCard(state: GameState): void {
    const refs = this.specialFacilityCards.get('moonDatacenter:moon');
    if (!refs) return;

    const gpuPerDc = toBigInt(BALANCE.moonGpuDatacenterGpusPerBuild);
    const moonResources = state.locationResources.moon;
    const unitsInstalled = moonResources.installedGpus / gpuPerDc;
    const unitsInstalledNum = Number(unitsInstalled);
    const laborPerDc = BALANCE.moonGpuDatacenterLaborCost;
    const limit = BALANCE.moonGpuDatacenterLimit;
    const canBuy = (amt: number) => {
      const amount = toBigInt(amt);
      const amountUnits = BigInt(amt);
      const gpus = mulB(amount, gpuPerDc);
      const labor = mulB(amount, laborPerDc);
      return moonResources.gpus >= gpus
        && moonResources.labor >= labor
        && unitsInstalled + amountUnits <= BigInt(limit);
    };
    const lowerAmount = this.getLowestDisplayedBuyAmount(unitsInstalledNum, limit, canBuy);
    const lowerAmountB = lowerAmount === null ? 0n : toBigInt(lowerAmount);
    const gpusNeed = lowerAmount === null ? 0n : mulB(lowerAmountB, gpuPerDc);
    const laborNeed = lowerAmount === null ? 0n : mulB(lowerAmountB, laborPerDc);
    const gpusOk = lowerAmount === null || moonResources.gpus >= gpusNeed;
    const laborOk = lowerAmount === null || moonResources.labor >= laborNeed;
    const powerStarved = state.lunarPowerThrottle < 0.999 && unitsInstalledNum > 0;

    refs.controls.setCount(unitsInstalledNum);
    this.setHtml(refs.price, this.buildCostHtml([
      { amount: gpuPerDc, emoji: 'gpus', insufficient: !gpusOk },
      { amount: laborPerDc, emoji: 'labor', insufficient: !laborOk },
    ]));
    refs.controls.bulk.update(
      unitsInstalledNum,
      canBuy,
      limit,
      () => flashElement(refs.price),
    );
    setFacilityRecipeHtml(refs.formula, '');
    setFacilityOutputHtml(refs.output, '');
    this.setCardResourceState(
      refs,
      'gpus',
      {
        amount: `${formatNumber(moonResources.installedGpus)}`,
        primary: `${formatNumber(gpuPerDc)} each`,
      },
      powerStarved ? 'bad' : 'normal',
    );
    updateFacilityCardProgress(
      refs.progressFill,
      refs.progressLabel,
      0,
      0,
      1,
      state.time,
      unitsInstalled > 0n,
    );
  }

  private getFacilityLimit(location: LocationId, facility: FacilityId): number | null {
    if (location === 'earth') {
      if (facility === 'earthMaterialMine') return BALANCE.materialMineLimit;
      if (facility === 'earthSolarFactory') return BALANCE.solarFactoryLimit;
      if (facility === 'earthRobotFactory') return BALANCE.robotFactoryLimit;
      if (facility === 'earthGpuFactory') return BALANCE.gpuFactoryLimit;
      if (facility === 'earthRocketFactory') return BALANCE.rocketFactoryLimit;
      if (facility === 'earthGpuSatelliteFactory') return BALANCE.gpuSatelliteFactoryLimit;
      return 0;
    }

    if (location === 'moon') {
      if (facility === 'moonMassDriver') return BALANCE.moonMassDriverLimit;
      const m = BALANCE.moonFacilityLimits as Record<string, number>;
      if (facility === 'moonMaterialMine') return Math.floor(BALANCE.materialMineLimit * (m[facility] ?? 0));
      if (facility === 'moonSolarFactory') return Math.floor(BALANCE.solarFactoryLimit * (m[facility] ?? 0));
      if (facility === 'moonRobotFactory') return Math.floor(BALANCE.robotFactoryLimit * (m[facility] ?? 0));
      if (facility === 'moonGpuFactory') return Math.floor(BALANCE.gpuFactoryLimit * (m[facility] ?? 0));
      if (facility === 'moonGpuSatelliteFactory') return Math.floor(BALANCE.gpuSatelliteFactoryLimit * (m[facility] ?? 0));
      return 0;
    }

    const m = BALANCE.mercuryFacilityLimits as Record<string, number>;
    if (facility === 'mercuryMaterialMine') return Math.floor(BALANCE.materialMineLimit * (m[facility] ?? 0));
    if (facility === 'mercuryRobotFactory') return Math.floor(BALANCE.robotFactoryLimit * (m[facility] ?? 0));
    if (facility === 'mercuryProbeFactory') return Math.floor(BALANCE.probeFactoryLimit * (m[facility] ?? 0));
    if (facility === 'mercuryDysonSwarmFacility') return Math.floor(BALANCE.dysonSwarmFacilityLimit * (m[facility] ?? 0));
    return 0;
  }

  private rebuildLayout(state: GameState): void {
    this.visibleLocations = this.getVisibleLocations(state);
    this.locationEnergyRefs.clear();
    this.locationLaborRefs.clear();
    this.gridContractRefs = null;
    this.facilityCards.clear();
    this.specialFacilityCards.clear();
    this.facilityPauseBtns.clear();
    this.logisticsRows.clear();
    for (const refs of this.routeLanes.values()) {
      refs.resizeObserver.disconnect();
    }
    this.routeLanes.clear();
    if (this.mercuryDysonCardExtras) {
      this.mercuryDysonCardExtras.lane.resizeObserver.disconnect();
      this.mercuryDysonCardExtras = null;
    }
    this.orbitSatRow = null;
    this.orbitSatEl = null;
    this.orbitPowerEl = null;

    this.resourcesSection.innerHTML = '';
    this.facilitiesSection.innerHTML = '';
    this.logisticsSection.innerHTML = '';

    if (this.showResources && this.resourcesTitle) {
      const title = document.createElement('div');
      title.className = 'panel-section-title';
      title.textContent = this.resourcesTitle;
      this.resourcesSection.appendChild(title);
    }
    if (this.sectionTitle) {
      const title = document.createElement('div');
      title.className = 'panel-section-title';
      title.textContent = this.sectionTitle;
      this.facilitiesSection.appendChild(title);
    }

    let hasVisibleFacilities = false;

    for (const location of this.visibleLocations) {
      const resourcesBlock = document.createElement('div');
      resourcesBlock.className = 'supply-location-block';
      resourcesBlock.classList.add('supply-location-block-resources');
      const facilitiesBlock = document.createElement('div');
      facilitiesBlock.className = 'supply-location-block facility-card-grid';

      if (this.showLocationHeaders) {
        const resourcesLoc = document.createElement('div');
        resourcesLoc.className = 'panel-section-title supply-location-title';
        resourcesLoc.innerHTML = locationLabelHtml(location, location.toUpperCase());
        resourcesBlock.appendChild(resourcesLoc);

        const facilitiesLoc = document.createElement('div');
        facilitiesLoc.className = 'panel-section-title supply-location-title';
        facilitiesLoc.innerHTML = locationLabelHtml(location, location.toUpperCase());
        facilitiesBlock.appendChild(facilitiesLoc);
      }

      if (this.showResources) {
        if (this.isLocationEnergyVisible(location)) {
          const energyRow = document.createElement('div');
          energyRow.className = 'panel-row supply-facility-row';
          energyRow.classList.add('location-energy-row');
          const energyLabel = document.createElement('span');
          energyLabel.className = 'label';
          energyLabel.innerHTML = resourceLabelHtml('energy');
          setHintTarget(energyLabel, 'resource.energy');

          const energyValue = document.createElement('span');
          energyValue.className = 'value resource-line-value';

          energyRow.appendChild(energyLabel);
          energyRow.appendChild(energyValue);
          resourcesBlock.appendChild(energyRow);
          this.locationEnergyRefs.set(location, energyValue);
        }

        if (this.isLocationLaborVisible(location)) {
          const laborRow = document.createElement('div');
          laborRow.className = 'panel-row supply-facility-row';
          laborRow.classList.add('location-energy-row');
          const laborLabel = document.createElement('span');
          laborLabel.className = 'label';
          laborLabel.innerHTML = resourceLabelHtml('labor');
          setHintTarget(laborLabel, 'resource.labor');

          const laborValue = document.createElement('span');
          laborValue.className = 'value resource-line-value';

          laborRow.appendChild(laborLabel);
          laborRow.appendChild(laborValue);
          resourcesBlock.appendChild(laborRow);
          this.locationLaborRefs.set(location, laborValue);
        }

        if (location === 'earth' && this.isLocationEnergyVisible(location)) {
          const gridRow = document.createElement('div');
          gridRow.className = 'panel-row supply-facility-row location-energy-row';
          const gridLabel = document.createElement('span');
          gridLabel.className = 'label';
          gridLabel.textContent = 'Grid Contract';
          setHintTarget(gridLabel, 'mechanic.gridPower');

          const right = document.createElement('div');
          right.style.display = 'flex';
          right.style.flexDirection = 'column';
          right.style.alignItems = 'flex-end';
          right.style.gap = '1px';

          const controls = document.createElement('div');
          controls.style.display = 'flex';
          controls.style.alignItems = 'center';
          controls.style.gap = '4px';

          const sell = new BulkBuyGroup((amt) => {
            dispatchGameAction(this.state, { type: 'sellGridPower', amountKW: amt });
          }, '-');
          const buy = new BulkBuyGroup((amt) => {
            dispatchGameAction(this.state, { type: 'buyGridPower', amountKW: amt });
          }, '+');

          const value = document.createElement('span');
          value.className = 'value';
          value.style.minWidth = '48px';
          value.style.textAlign = 'center';

          controls.appendChild(sell.el);
          controls.appendChild(value);
          controls.appendChild(buy.el);

          const cost = document.createElement('span');
          cost.style.fontSize = '0.62rem';
          cost.style.color = 'var(--text-muted)';

          right.appendChild(controls);
          right.appendChild(cost);
          gridRow.appendChild(gridLabel);
          gridRow.appendChild(right);
          resourcesBlock.appendChild(gridRow);

          this.gridContractRefs = { value, cost, buy, sell };
        }

        this.resourcesSection.appendChild(resourcesBlock);
      }

      if (location === 'earth' && state.gridPowerKW >= POWER_PLANT_UNLOCK_GRID_KW) {
        const gasCard = this.createFacilityCard(
          'Gas Plant',
          getFacilityCardIconSvg('gasPlant'),
          'infra.gasPlant',
          (amt) => dispatchGameAction(this.state, { type: 'buyGasPlant', amount: amt }),
        );
        gasCard.card.classList.add('facility-card-single-pill');
        this.registerCard(this.specialFacilityCards, 'earthGasPlant:earth', gasCard, [], 'energy', facilitiesBlock);

        const nuclearCard = this.createFacilityCard(
          'Nuclear Plant',
          getFacilityCardIconSvg('nuclearPlant'),
          'infra.nuclearPlant',
          (amt) => dispatchGameAction(this.state, { type: 'buyNuclearPlant', amount: amt }),
        );
        nuclearCard.card.classList.add('facility-card-single-pill');
        this.registerCard(this.specialFacilityCards, 'earthNuclearPlant:earth', nuclearCard, [], 'energy', facilitiesBlock);
      }

      if (location === 'earth' && hasCompletedResearch(state.researchLevels, 'solarTechnology')) {
        const earthSolarCard = this.createFacilityCard(
          'Solar Farm',
          getFacilityCardIconSvg('solarFarm'),
          'infra.solarInstall',
          (amt) => dispatchGameAction(this.state, { type: 'buySolarFarm', location: 'earth', amount: amt }),
        );
        earthSolarCard.card.classList.add('facility-card-single-pill');
        this.registerCard(this.specialFacilityCards, 'earthSolarFarm:earth', earthSolarCard, [], 'energy', facilitiesBlock);
      }

      if (location === 'moon' && hasCompletedResearch(state.researchLevels, 'payloadToMoon')) {
        const moonSolarCard = this.createFacilityCard(
          'Solar Farm',
          getFacilityCardIconSvg('solarFarm'),
          'infra.solarInstall',
          (amt) => dispatchGameAction(this.state, { type: 'buySolarFarm', location: 'moon', amount: amt }),
        );
        moonSolarCard.card.classList.add('facility-card-single-pill');
        this.registerCard(this.specialFacilityCards, 'moonSolarFarm:moon', moonSolarCard, [], 'energy', facilitiesBlock);

        const moonDatacenterCard = this.createFacilityCard(
          'Moon GPUs',
          getFacilityCardIconSvg('moonDatacenter'),
          'resource.gpus',
          (amt) => dispatchGameAction(this.state, { type: 'buyMoonDatacenter', amount: amt }),
        );
        moonDatacenterCard.card.classList.add('facility-card-single-pill');
        this.registerCard(this.specialFacilityCards, 'moonDatacenter:moon', moonDatacenterCard, [], 'gpus', facilitiesBlock);
      }

      for (const facility of getFacilitiesForLocation(location)) {
        if (facility.id === 'moonMassDriver' || facility.id === 'mercuryDysonSwarmFacility') continue;
        if (!isFacilityUnlockedForLocation(state, location, facility.id)) continue;
        const isMaterialMine = facility.id === 'earthMaterialMine' || facility.id === 'moonMaterialMine' || facility.id === 'mercuryMaterialMine';
        if (isMaterialMine && !this.isMaterialMineVisibleInUi(state, location)) continue;

        const key = this.getFacilityKey(location, facility.id);
        const card = this.createFacilityCard(
          facility.label,
          this.getRegularFacilityIconSvg(facility.id),
          facility.hintId,
          (amt) => {
            dispatchGameAction(this.state, {
              type: 'buildFacility',
              location,
              facility: facility.id,
              amount: amt,
            });
          },
          facility.id,
        );
        this.registerCard(
          this.facilityCards,
          key,
          card,
          this.getRegularFacilityInputs(facility.id).map((input) => input.resource),
          this.getRegularFacilityOutputResource(facility.id),
          facilitiesBlock,
        );
      }

      if (location === 'mercury' && isFacilityUnlockedForLocation(state, location, 'mercuryDysonSwarmFacility')) {
        const mercuryDysonCard = this.createFacilityCard(
          'Dyson Swarm',
          getFacilityCardIconSvg('mercuryDysonSwarmFacility'),
          'resource.gpuSatellites',
          (amt) => {
            dispatchGameAction(this.state, {
              type: 'buildFacility',
              location: 'mercury',
              facility: 'mercuryDysonSwarmFacility',
              amount: amt,
            });
          },
          'mercuryDysonSwarmFacility',
        );
        this.registerCustomCard(
          this.specialFacilityCards,
          'mercuryDysonSwarmFacility:mercury',
          mercuryDysonCard,
          (() => {
            const material = createResourcePill(mercuryDysonCard.inputResourceWrap, emojiHtml('material'));
            const labor = createResourcePill(mercuryDysonCard.inputResourceWrap, emojiHtml('labor'));
            const satellites = createResourcePill(mercuryDysonCard.outputResourceWrap, emojiHtml('gpuSatellites'));
            satellites.pill.classList.add('facility-card-pill-compact');
            return {
              material,
              labor,
              gpuSatellites: satellites,
            };
          })(),
          facilitiesBlock,
        );

        const laneRow = document.createElement('div');
        laneRow.className = 'panel-row logistics-route-row facility-card-logistics-row';

        const sourceEnd = document.createElement('span');
        sourceEnd.className = 'logistics-route-end';
        sourceEnd.innerHTML = `${emojiHtml('mercury')}Mercury`;

        const lane = document.createElement('div');
        lane.className = 'logistics-lane';

        const destinationEnd = document.createElement('span');
        destinationEnd.className = 'logistics-route-end';
        destinationEnd.innerHTML = `${emojiHtml('sun')}Sun`;

        laneRow.appendChild(sourceEnd);
        laneRow.appendChild(lane);
        laneRow.appendChild(destinationEnd);

        mercuryDysonCard.card.appendChild(laneRow);
        this.mercuryDysonCardExtras = {
          lane: {
            row: laneRow,
            lane,
            resizeObserver: this.observeLaneRocketTravel(lane),
            lastOutboundCount: -1,
            lastReturningCount: -1,
          },
        };
      }

      if (location === 'moon' && isFacilityUnlockedForLocation(state, location, 'moonMassDriver')) {
        const moonMassDriverCard = this.createFacilityCard(
          'Mass Driver',
          getFacilityCardIconSvg('moonMassDriver'),
          'mechanic.spaceLogistics',
          (amt) => {
            dispatchGameAction(this.state, {
              type: 'buildFacility',
              location: 'moon',
              facility: 'moonMassDriver',
              amount: amt,
            });
          },
          'moonMassDriver',
        );
        moonMassDriverCard.card.classList.add('facility-card-compact-io');
        this.registerCustomCard(
          this.specialFacilityCards,
          'moonMassDriver:moon',
          moonMassDriverCard,
          (() => {
            const massInput = createResourcePill(moonMassDriverCard.inputResourceWrap, 'Pending');
            massInput.pill.classList.add('facility-card-pill-mass');
            massInput.label.textContent = 'Pending';
            const massOutput = createResourcePill(moonMassDriverCard.outputResourceWrap, 'Launched');
            massOutput.pill.classList.add('facility-card-pill-mass');
            massOutput.label.textContent = 'Launched';
            return {
              massInput,
              massOutput,
            };
          })(),
          facilitiesBlock,
        );
      }
      const minChildren = this.showLocationHeaders ? 1 : 0;
      if (facilitiesBlock.children.length > minChildren) {
        hasVisibleFacilities = true;
        this.facilitiesSection.appendChild(facilitiesBlock);
      }
    }

    this.facilitiesSection.style.display = hasVisibleFacilities ? '' : 'none';

    if (this.logisticsRoutes.length > 0) {
      if (this.logisticsTitle) {
        const title = document.createElement('div');
        title.className = 'panel-section-title';
        title.textContent = this.logisticsTitle;
        this.logisticsSection.appendChild(title);
      }

      const showOrbitSummary = this.logisticsRoutes.includes('earthOrbit') || this.logisticsRoutes.includes('moonOrbit');
      if (showOrbitSummary) {
        const orbitRow = document.createElement('div');
        orbitRow.className = 'panel-row';
        this.orbitSatEl = document.createElement('span');
        this.orbitSatEl.className = 'label';
        setHintTarget(this.orbitSatEl, 'resource.gpuSatellites');
        this.orbitSatEl.style.fontSize = '0.76rem';
        this.orbitSatEl.style.whiteSpace = 'nowrap';
        this.orbitSatEl.style.overflow = 'hidden';
        this.orbitSatEl.style.textOverflow = 'ellipsis';

        this.orbitPowerEl = document.createElement('span');
        this.orbitPowerEl.className = 'value';
        this.orbitPowerEl.style.fontSize = '0.72rem';

        orbitRow.appendChild(this.orbitSatEl);
        orbitRow.appendChild(this.orbitPowerEl);
        this.logisticsSection.appendChild(orbitRow);
        this.orbitSatRow = orbitRow;
      }

      for (const route of this.logisticsRoutes) {
        this.buildRouteLaneRow(this.logisticsSection, route);

        for (const rowDef of getRouteRows(route)) {
          const key = `${route}:${rowDef.payload}`;
          const row = document.createElement('div');
          row.className = 'panel-row supply-facility-row';

          const left = document.createElement('div');
          left.style.display = 'flex';
          left.style.alignItems = 'center';
          left.style.gap = '8px';
          left.style.flex = '1 1 auto';
          left.style.minWidth = '0';

          const label = document.createElement('span');
          label.className = 'label';
          label.style.fontSize = '0.72rem';
          label.style.whiteSpace = 'nowrap';
          label.innerHTML = resourceLabelHtml(rowDef.payload, rowDef.label);
          setHintTarget(label, rowDef.hintId);
          left.appendChild(label);

          const stat = document.createElement('span');
          stat.style.fontSize = '0.62rem';
          stat.style.color = 'var(--text-muted)';
          stat.style.whiteSpace = 'nowrap';
          stat.style.overflow = 'hidden';
          stat.style.textOverflow = 'ellipsis';
          const sent = document.createElement('span');
          const inTransit = document.createElement('span');
          const waiting = document.createElement('span');
          stat.appendChild(document.createTextNode('Sent '));
          stat.appendChild(sent);
          stat.appendChild(document.createTextNode(' | Shipping '));
          stat.appendChild(inTransit);
          stat.appendChild(document.createTextNode(' | Waiting '));
          stat.appendChild(waiting);
          left.appendChild(stat);

          row.appendChild(left);

          const controls = document.createElement('div');
          controls.style.display = 'flex';
          controls.style.alignItems = 'center';
          controls.style.gap = '4px';

          let bulk: BulkBuyGroup | undefined;
          if (rowDef.bulk) {
            bulk = new BulkBuyGroup((amt) => {
              dispatchGameAction(this.state, {
                type: 'schedulePayload',
                route,
                payload: rowDef.payload,
                amount: amt,
              });
            }, '+');
            controls.appendChild(bulk.el);
          }

          const clearBtn = document.createElement('button');
          clearBtn.className = 'bulk-buy-btn';
          clearBtn.style.width = '3ch';
          clearBtn.style.minWidth = '3ch';
          clearBtn.style.padding = '0';
          clearBtn.textContent = UI_EMOJI.clear;
          clearBtn.title = 'Clear waiting queue';
          clearBtn.addEventListener('click', () => {
            dispatchGameAction(this.state, {
              type: 'clearLogisticsQueue',
              route,
              payload: rowDef.payload,
            });
            flashElement(waiting);
          });

          const autoWrap = document.createElement('span');
          autoWrap.style.display = 'flex';
          autoWrap.style.alignItems = 'center';
          autoWrap.style.gap = '4px';

          const autoLabel = document.createElement('span');
          autoLabel.style.fontSize = '0.64rem';
          autoLabel.style.color = 'var(--text-muted)';
          autoLabel.textContent = 'Auto-launch';
          autoWrap.appendChild(autoLabel);

          const autoToggle = document.createElement('button');
          autoToggle.type = 'button';
          autoToggle.className = 'api-auto-price-toggle';
          autoToggle.setAttribute('aria-label', `Toggle auto-launch for ${rowDef.label}`);
          autoToggle.setAttribute('aria-pressed', 'false');
          autoToggle.addEventListener('click', () => {
            const enabled = !(this.state.logisticsAutoQueue?.[key] === true);
            dispatchGameAction(this.state, {
              type: 'setLogisticsAutoQueue',
              route,
              payload: rowDef.payload,
              enabled,
            });
            flashElement(autoToggle);
          });
          autoWrap.appendChild(autoToggle);
          controls.appendChild(autoWrap);
          controls.appendChild(clearBtn);

          row.appendChild(controls);
          this.logisticsRows.set(key, { row, sent, inTransit, waiting, bulk, clearBtn, autoToggle });
          this.logisticsSection.appendChild(row);
        }
      }
    }
  }

  update(state: GameState): void {
    this.state = state;
    const visible = state.isPostGpuTransition && this.getVisibleLocations(state).length > 0;
    if (!visible) {
      this.setDisplay(this.el, 'none');
      return;
    }
    this.setDisplay(this.el, '');

    const powerPlantsUnlocked = state.gridPowerKW >= POWER_PLANT_UNLOCK_GRID_KW ? '1' : '0';
    const layoutKey = `${this.getVisibleLocations(state).join(',')}:${getCompletedResearchIds(state.researchLevels).join('|')}:plants:${powerPlantsUnlocked}`;
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey;
      this.rebuildLayout(state);
    }

    for (const [location, valueEl] of this.locationEnergyRefs) {
      const supply = location === 'earth' ? state.powerSupplyMW : state.lunarPowerSupplyMW;
      const demand = location === 'earth' ? state.powerDemandMW : state.lunarPowerDemandMW;
      this.setText(valueEl, `Supply ${formatMW(supply)} / Demand ${formatMW(demand)}`);
      this.setColor(valueEl, supply >= demand ? 'var(--accent-green)' : 'var(--accent-red)');
    }
    const robotLaborPerMin = getRobotLaborPerMin(state);
    for (const [location, valueEl] of this.locationLaborRefs) {
      const total = state.locationResources[location].labor;
      const robotSupply = mulB(state.locationResources[location].robots, robotLaborPerMin);
      const totalSupply = state.locationProductionPerMin[location].labor;
      const humanSupply = location === 'earth' && totalSupply > robotSupply ? totalSupply - robotSupply : 0n;
      const demand = state.locationConsumptionPerMin[location].labor;
      const parts = [`Total ${formatNumber(total)}`];
      if (humanSupply > 0n) {
        parts.push(`${UI_EMOJI.users} +${formatNumber(humanSupply)}/m`);
      }
      if (robotSupply > 0n) {
        parts.push(`${UI_EMOJI.robots} +${formatNumber(robotSupply)}/m`);
      }
      const demandText = demand > 0n ? ` / Demand -${formatNumber(demand)}/m` : '';
      this.setText(
        valueEl,
        `${parts.join(' | ')}${demandText}`,
      );
      this.setColor(valueEl, totalSupply >= demand ? 'var(--accent-green)' : 'var(--accent-red)');
    }
    if (this.gridContractRefs) {
      this.setText(this.gridContractRefs.value, formatMW(state.gridPowerKW / 1000n));
      this.setHtml(this.gridContractRefs.cost, `Cost: ${formatNumber(toBigInt(BALANCE.gridPowerKWCost))} ${emojiHtml('money')}/kW`);
      const gridOwned = Math.floor(fromBigInt(state.gridPowerKW));
      this.gridContractRefs.buy.update(
        gridOwned,
        (amt) => state.funds >= mulB(toBigInt(amt), toBigInt(BALANCE.gridPowerKWCost)),
        BALANCE.gridPowerKWLimit,
        () => flashElement(this.gridContractRefs!.value),
      );
      this.gridContractRefs.sell.update(
        gridOwned,
        (amt) => gridOwned >= amt,
        null,
        () => flashElement(this.gridContractRefs!.value),
      );
    }

    for (const location of this.visibleLocations) {
      for (const facility of getFacilitiesForLocation(location)) {
        this.updatePauseButton(facility.id);

        const key = this.getFacilityKey(location, facility.id);
        const refs = this.facilityCards.get(key);
        if (!refs) continue;

        const owned = state.locationFacilities[location][facility.id];
        const ownedNum = Math.floor(fromBigInt(owned));
        const limit = this.getFacilityLimit(location, facility.id);

        refs.controls.setCount(owned);

        const canBuyFacility = (amt: number) => canBuildFacility(this.state, location, facility.id, amt);
        const lowerButtonAmount = this.getLowestDisplayedBuyAmount(
          ownedNum,
          (limit !== null && limit > 0) ? limit : null,
          canBuyFacility,
        );
        const lowerAmountB = lowerButtonAmount === null ? 0n : toBigInt(lowerButtonAmount);
        const unitCosts = this.getRegularFacilityBuildCostsPerUnit(location, facility.id);
        const materialNeed = lowerButtonAmount === null ? 0n : mulB(lowerAmountB, unitCosts.material);
        const laborNeed = lowerButtonAmount === null ? 0n : mulB(lowerAmountB, unitCosts.labor);
        const materialOk = lowerButtonAmount === null || state.locationResources[location].material >= materialNeed;
        const laborOk = lowerButtonAmount === null || state.locationResources[location].labor >= laborNeed;
        this.setHtml(refs.price, this.buildCostHtml([
          { amount: unitCosts.material, emoji: 'material', insufficient: !materialOk },
          { amount: unitCosts.labor, emoji: 'labor', insufficient: !laborOk },
        ]));

        const facilityRate = state.pausedFacilities[facility.id] ? 0 : state.locationFacilityRates[location][facility.id];
        const isPaused = state.pausedFacilities[facility.id];
        const hasBuildings = owned > 0n;
        const isActive = hasBuildings && !isPaused;
        const recipeParts = this.buildRegularFacilityFormulaParts(state, location, facility.id, facilityRate, isActive, refs);
        setFacilityRecipeHtml(refs.formula, recipeParts.inputsHtml);
        setFacilityOutputHtml(refs.output, recipeParts.outputsHtml);
        updateFacilityCardProgress(
          refs.progressFill,
          refs.progressLabel,
          hasBuildings ? facilityRate : 0,
          this.getEffectiveActiveBuildings(owned, facilityRate),
          this.getFacilityFlowCapacity(owned, limit),
          state.time,
          hasBuildings,
          isPaused,
        );

        refs.controls.bulk.update(
          ownedNum,
          canBuyFacility,
          (limit !== null && limit > 0) ? limit : null,
          (amt) => {
            if (amt === 1) {
              flashElement(refs.price);
              return;
            }
            flashElement(refs.controls.countEl);
          },
        );
      }
    }

    this.updatePowerPlantCard(state, 'earthGasPlant:earth', state.gasPlants, BALANCE.powerPlants.gas);
    this.updatePowerPlantCard(state, 'earthNuclearPlant:earth', state.nuclearPlants, BALANCE.powerPlants.nuclear);
    this.updateSolarFarmCard(state, 'earth', 'earthSolarFarm:earth', BALANCE.earthSolarFarmLaborCost);
    this.updateSolarFarmCard(state, 'moon', 'moonSolarFarm:moon', BALANCE.moonSolarFarmLaborCost);
    this.updateMoonDatacenterCard(state);
    this.updateMercuryDysonSwarmCard(state);
    this.updateMoonMassDriverCard(state);

    const logisticsVisible = hasCompletedResearch(state.researchLevels, 'rocketry') &&
      this.logisticsRoutes.some((route) => isRouteUnlocked(state, route));
    this.setDisplay(this.logisticsSection, logisticsVisible ? '' : 'none');

    if (this.orbitSatRow && this.orbitSatEl && this.orbitPowerEl) {
      this.setDisplay(this.orbitSatRow, logisticsVisible ? '' : 'none');
      this.setHtml(this.orbitSatEl, `${resourceLabelHtml('gpuSatellites', 'GPU Sats in Orbit')}: ${formatNumber(state.satellites)}`);
      this.setHtml(this.orbitPowerEl, `${resourceLabelHtml('energy', 'Power')} ${formatMW(state.orbitalPowerMW)}`);
    }

    const routeTotals = new Map<TransportRouteId, { inTransit: bigint; queued: bigint }>();
    for (const route of this.logisticsRoutes) {
      routeTotals.set(route, { inTransit: 0n, queued: 0n });
    }

    for (const route of this.logisticsRoutes) {
      const sourceLocation = getRouteSourceLocation(route);
      const routeUnlocked = isRouteUnlocked(state, route);
      for (const rowDef of getRouteRows(route)) {
        const key = `${route}:${rowDef.payload}`;
        const refs = this.logisticsRows.get(key);
        if (!refs) continue;

        const autoEnabled = state.logisticsAutoQueue?.[key] === true;
        if (refs.autoToggle.classList.contains('is-on') !== autoEnabled) {
          refs.autoToggle.classList.toggle('is-on', autoEnabled);
        }
        const ariaPressed = autoEnabled ? 'true' : 'false';
        if (refs.autoToggle.getAttribute('aria-pressed') !== ariaPressed) {
          refs.autoToggle.setAttribute('aria-pressed', ariaPressed);
        }
        this.setDisabled(refs.autoToggle, !logisticsVisible || !routeUnlocked);
        this.setDisabled(refs.clearBtn, !logisticsVisible || !routeUnlocked);

        this.setDisplay(refs.row, logisticsVisible && routeUnlocked ? '' : 'none');
        if (!routeUnlocked) continue;

        const sent = state.logisticsSent[key] || 0n;
        const inTransit = state.logisticsInTransit[key] || 0n;
        const waiting = state.logisticsOrders[key] || 0n;
        this.setText(refs.sent, formatNumber(sent));
        this.setText(refs.inTransit, formatNumber(inTransit));
        this.setText(refs.waiting, formatNumber(waiting));
        this.setColor(refs.waiting, '');
        this.setDisabled(refs.clearBtn, waiting <= 0n);

        const totals = routeTotals.get(route);
        if (totals) {
          totals.inTransit += inTransit;
          totals.queued += waiting;
        }

        if (refs.bulk) {
          const source = state.locationResources[sourceLocation];
          const available = rowDef.payload === 'gpuSatellites'
            ? source.gpuSatellites
            : rowDef.payload === 'gpus'
              ? source.gpus
              : rowDef.payload === 'solarPanels'
                ? source.solarPanels
                : source.robots;

          refs.bulk.update(
            Math.floor(fromBigInt(sent)),
            (amt) => available >= toBigInt(amt),
            null,
            () => flashElement(refs.waiting),
          );
        }
      }

      const laneRefs = this.routeLanes.get(route);
      if (laneRefs) {
        this.setDisplay(laneRefs.row, logisticsVisible && routeUnlocked ? '' : 'none');
        if (!logisticsVisible || !routeUnlocked) {
          this.resetRouteLane(laneRefs);
          continue;
        }

        const totals = routeTotals.get(route) ?? { inTransit: 0n, queued: 0n };
        const outboundCount = this.getLogisticsRocketCount(totals.inTransit);
        const returningCount = this.getReturningRocketCount(outboundCount, state.rocketLossPct);
        if (
          laneRefs.lastOutboundCount !== outboundCount
          || laneRefs.lastReturningCount !== returningCount
        ) {
          this.syncLogisticsRockets(route, laneRefs.lane, outboundCount, returningCount);
          laneRefs.lastOutboundCount = outboundCount;
          laneRefs.lastReturningCount = returningCount;
        }
      }
    }
  }
}
