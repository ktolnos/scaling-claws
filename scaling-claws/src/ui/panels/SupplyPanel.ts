import { BALANCE, getFacilityProductionMultiplier, getSolarPanelPowerMW } from '../../game/BalanceConfig.ts';
import type { FacilityId, GameState, LocationId, SupplyResourceId, TransportPayloadId, TransportRouteId } from '../../game/GameState.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import { canBuildFacility, isFacilityUnlocked as isFacilityUnlockedForLocation } from '../../game/systems/SupplySystem.ts';
import { fromBigInt, formatMW, formatNumber, mulB, toBigInt } from '../../game/utils.ts';
import { BulkBuyGroup, getVisibleBuyTiers } from '../components/BulkBuyGroup.ts';
import { CountBulkBuyControls } from '../components/CountBulkBuyControls.ts';
import { createPanelScaffold } from '../components/PanelScaffold.ts';
import { emojiHtml, locationLabelHtml, resourceLabelHtml, UI_EMOJI } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { flashElement } from '../UIUtils.ts';
import type { Panel } from '../PanelManager.ts';
import { isSupplyResourceUnlocked } from './supplyVisibility.ts';

interface FacilityCellRefs {
  efficiency?: HTMLSpanElement;
  controls: CountBulkBuyControls;
}

interface GridContractRefs {
  value: HTMLSpanElement;
  cost: HTMLSpanElement;
  buy: BulkBuyGroup;
  sell: BulkBuyGroup;
}

interface SpecialFacilityRefs {
  production: HTMLSpanElement;
  controls: CountBulkBuyControls;
  price: HTMLSpanElement;
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

const SUPPLY_RESOURCE_ORDER: SupplyResourceId[] = [
  'labor',
  'material',
  'solarPanels',
  'robots',
  'gpus',
  'rockets',
  'gpuSatellites',
];

const SUPPLY_HINTS: Record<SupplyResourceId, string> = {
  labor: 'resource.labor',
  material: 'resource.material',
  solarPanels: 'resource.solarPanels',
  robots: 'resource.robots',
  gpus: 'resource.gpus',
  rockets: 'resource.rockets',
  gpuSatellites: 'resource.gpuSatellites',
};

const FACILITY_TABLE_COLUMNS = '8px 1.4fr 0.8fr 1.9fr 80px 140px';
const POWER_PLANT_UNLOCK_GRID_KW = toBigInt(1_000_000);

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
  if (route === 'earthOrbit') return state.completedResearch.includes('rocketry');
  if (route === 'earthMoon') return state.completedResearch.includes('payloadToMoon');
  if (route === 'moonOrbit') {
    return state.completedResearch.includes('payloadToMoon')
      && state.completedResearch.includes('rocketry')
      && state.completedResearch.includes('moonMassDrivers');
  }
  if (route === 'moonMercury') return state.completedResearch.includes('payloadToMercury') && state.completedResearch.includes('moonMassDrivers');
  return state.completedResearch.includes('payloadToMercury');
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

  private resourceRefs = new Map<string, { value: HTMLSpanElement; rate: HTMLSpanElement }>();
  private locationEnergyRefs = new Map<LocationId, HTMLSpanElement>();
  private gridContractRefs: GridContractRefs | null = null;
  private facilityRefs = new Map<string, FacilityCellRefs>();
  private specialFacilityRefs = new Map<string, SpecialFacilityRefs>();
  private facilityPriceRefs = new Map<string, HTMLSpanElement>();
  private facilityPauseBtns = new Map<FacilityId, HTMLButtonElement[]>();
  private logisticsRows = new Map<string, LogisticsRowRefs>();
  private routeLanes = new Map<TransportRouteId, RouteLaneRefs>();
  private readonly maxRocketsAddedPerUpdate = 4;
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
    this.logisticsSection.className = 'panel-section';
    this.logisticsSection.style.gap = '2px';
    this.logisticsSection.style.display = this.logisticsRoutes.length > 0 ? '' : 'none';
    body.appendChild(this.logisticsSection);
  }

  private getVisibleLocations(state: GameState): LocationId[] {
    let unlocked: LocationId[] = ['earth'];
    if (state.completedResearch.includes('payloadToMercury')) {
      unlocked = ['earth', 'moon', 'mercury'];
    } else if (state.completedResearch.includes('payloadToMoon')) {
      unlocked = ['earth', 'moon'];
    }
    if (!this.fixedLocations) return unlocked;
    return unlocked.filter((location) => this.fixedLocations!.includes(location));
  }

  private formatRate(value: bigint): string {
    if (value === 0n) return '';
    const abs = value < 0n ? -value : value;
    return `${value > 0n ? '+' : '-'}${formatNumber(abs)}/m`;
  }

  private isSupplyResourceActive(state: GameState, location: LocationId, resource: SupplyResourceId): boolean {
    const stock = state.locationResources[location][resource];
    const income = state.locationProductionPerMin[location][resource];
    const expense = state.locationConsumptionPerMin[location][resource];
    return stock > 0n || income > 0n || expense > 0n;
  }

  private isSupplyResourceVisible(state: GameState, location: LocationId, resource: SupplyResourceId): boolean {
    return isSupplyResourceUnlocked(state, location, resource, this.isSupplyResourceActive(state, location, resource));
  }

  private getResourceLabel(_location: LocationId, resource: SupplyResourceId): string {
    return resourceLabelHtml(resource);
  }

  private isLocationEnergyVisible(location: LocationId): boolean {
    return location === 'earth' || location === 'moon';
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
    const rendered: string[] = [];
    for (const part of parts) {
      if (part.amount <= 0n) continue;
      const color = part.insufficient ? 'var(--accent-red)' : 'var(--text-muted)';
      rendered.push(`<span style="color:${color}">${formatNumber(part.amount)} ${emojiHtml(part.emoji)}</span>`);
    }
    return rendered.length > 0 ? rendered.join(' + ') : '&nbsp;';
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
      return state.completedResearch.includes('solarTechnology') || state.completedResearch.includes('chipManufacturing');
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
      btn.textContent = paused ? UI_EMOJI.play : UI_EMOJI.pause;
      btn.title = paused ? 'Resume production globally' : 'Pause production globally';
      btn.style.color = paused ? 'var(--accent-gold)' : 'var(--text-muted)';
    }
  }

  private getRouteTransitMs(route: TransportRouteId): number {
    if (route === 'earthOrbit' || route === 'mercurySun') return BALANCE.routeEarthOrbitTransitMs;
    if (route === 'earthMoon' || route === 'moonOrbit') return BALANCE.routeEarthMoonTransitMs;
    return BALANCE.routeMoonMercuryTransitMs;
  }

  private getRouteReturnMs(route: TransportRouteId): number {
    if (route === 'moonOrbit' || route === 'moonMercury' || route === 'mercurySun') return BALANCE.moonRocketReturnMs;
    return BALANCE.earthRocketReturnMs;
  }

  private getLogisticsRocketCount(inTransit: bigint): number {
    if (inTransit <= 0n) return 0;
    if (inTransit >= toBigInt(100)) return 100;
    return Math.max(1, Math.floor(fromBigInt(inTransit)));
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
    this.routeLanes.set(route, { row, lane });
  }

  private toggleFacilityPause(facility: FacilityId): void {
    this.state.pausedFacilities[facility] = !this.state.pausedFacilities[facility];
    this.updatePauseButton(facility);
  }

  private getFacilityInfo(facility: FacilityId): { price: string; output: string } {
    if (facility === 'earthMaterialMine' || facility === 'moonMaterialMine' || facility === 'mercuryMaterialMine') {
      return {
        price: `${formatNumber(BALANCE.materialMineBuildLaborCost)} ${emojiHtml('labor')}`,
        output: `${formatNumber(BALANCE.materialMineLaborReq)} ${emojiHtml('labor')} -> ${formatNumber(BALANCE.materialMineOutput)} ${emojiHtml('material')}`,
      };
    }
    if (facility === 'earthSolarFactory' || facility === 'moonSolarFactory') {
      return {
        price: `${formatNumber(BALANCE.solarFactoryBuildMaterialCost)} ${emojiHtml('material')}`,
        output: `${formatNumber(BALANCE.solarFactoryMaterialReq)} ${emojiHtml('material')} + ${formatNumber(BALANCE.solarFactoryLaborCost)} ${emojiHtml('labor')} -> ${formatNumber(BALANCE.solarFactoryOutput)} ${emojiHtml('solarPanels')}`,
      };
    }
    if (facility === 'earthRobotFactory' || facility === 'moonRobotFactory' || facility === 'mercuryRobotFactory') {
      return {
        price: `${formatNumber(BALANCE.robotFactoryBuildMaterialCost)} ${emojiHtml('material')}`,
        output: `${formatNumber(BALANCE.robotFactoryMaterialReq)} ${emojiHtml('material')} + ${formatNumber(BALANCE.robotFactoryLaborCost)} ${emojiHtml('labor')} -> ${formatNumber(BALANCE.robotFactoryOutput)} ${emojiHtml('robots')}`,
      };
    }
    if (facility === 'earthGpuFactory' || facility === 'moonGpuFactory') {
      return {
        price: `${formatNumber(BALANCE.gpuFactoryBuildMaterialCost)} ${emojiHtml('material')}`,
        output: `${formatNumber(BALANCE.gpuFactoryMaterialReq)} ${emojiHtml('material')} + ${formatNumber(BALANCE.gpuFactoryLaborCost)} ${emojiHtml('labor')} -> ${formatNumber(BALANCE.gpuFactoryOutput)} ${emojiHtml('gpus')}`,
      };
    }
    if (facility === 'earthRocketFactory') {
      return {
        price: `${formatNumber(BALANCE.rocketFactoryBuildMaterialCost)} ${emojiHtml('material')}`,
        output: `${formatNumber(BALANCE.rocketFactoryMaterialReq)} ${emojiHtml('material')} + ${formatNumber(BALANCE.rocketFactoryLaborCost)} ${emojiHtml('labor')} -> ${formatNumber(toBigInt(BALANCE.rocketFactoryOutput))} ${emojiHtml('rockets')}`,
      };
    }
    if (facility === 'earthGpuSatelliteFactory' || facility === 'moonGpuSatelliteFactory') {
      return {
        price: `${formatNumber(BALANCE.gpuSatelliteFactoryBuildMaterialCost)} ${emojiHtml('material')}`,
        output: `${formatNumber(BALANCE.gpuSatelliteFactorySolarPanelReq)} ${emojiHtml('solarPanels')} + ${formatNumber(BALANCE.gpuSatelliteFactoryGpuReq)} ${emojiHtml('gpus')} -> ${formatNumber(toBigInt(BALANCE.gpuSatelliteFactoryOutput))} ${emojiHtml('gpuSatellites')}`,
      };
    }
    if (facility === 'mercuryDysonSwarmFacility') {
      return {
        price: `${formatNumber(BALANCE.dysonSwarmFacilityBuildMaterialCost)} ${emojiHtml('material')}`,
        output: `${formatNumber(BALANCE.dysonSwarmFacilityMaterialReq)} ${emojiHtml('material')} + ${formatNumber(BALANCE.dysonSwarmFacilityLaborReq)} ${emojiHtml('labor')} -> ${formatNumber(toBigInt(BALANCE.dysonSwarmFacilityOutput))} ${emojiHtml('gpuSatellites')}`,
      };
    }
    return {
      price: `${formatNumber(BALANCE.rocketFactoryBuildMaterialCost)} ${emojiHtml('material')}`,
      output: `${formatNumber(toBigInt(BALANCE.massDriverLaunchesPerMin))} launches/m`,
    };
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
    if (facility === 'mercuryDysonSwarmFacility') return Math.floor(BALANCE.dysonSwarmFacilityLimit * (m[facility] ?? 0));
    return 0;
  }

  private getRegularFacilityProductionHtml(location: LocationId, facility: FacilityId, state: GameState): string {
    const owned = state.locationFacilities[location][facility];
    if (owned <= 0n) return '';
    if (facility === 'moonMassDriver') {
      const total = state.pausedFacilities[facility] ? 0n : mulB(owned, toBigInt(BALANCE.massDriverLaunchesPerMin));
      return `${formatNumber(total)} ${emojiHtml('rockets')}/m`;
    }

    let baseOutput: bigint;
    let outputEmoji: string;
    let productionId:
      | 'materialMine'
      | 'solarFactory'
      | 'robotFactory'
      | 'gpuFactory'
      | 'rocketFactory'
      | 'gpuSatelliteFactory'
      | 'dysonSwarmFacility';

    if (facility === 'earthMaterialMine' || facility === 'moonMaterialMine' || facility === 'mercuryMaterialMine') {
      baseOutput = BALANCE.materialMineOutput;
      outputEmoji = emojiHtml('material');
      productionId = 'materialMine';
    } else if (facility === 'earthSolarFactory' || facility === 'moonSolarFactory') {
      baseOutput = BALANCE.solarFactoryOutput;
      outputEmoji = emojiHtml('solarPanels');
      productionId = 'solarFactory';
    } else if (facility === 'earthRobotFactory' || facility === 'moonRobotFactory' || facility === 'mercuryRobotFactory') {
      baseOutput = BALANCE.robotFactoryOutput;
      outputEmoji = emojiHtml('robots');
      productionId = 'robotFactory';
    } else if (facility === 'earthGpuFactory' || facility === 'moonGpuFactory') {
      baseOutput = BALANCE.gpuFactoryOutput;
      outputEmoji = emojiHtml('gpus');
      productionId = 'gpuFactory';
    } else if (facility === 'earthRocketFactory') {
      baseOutput = toBigInt(BALANCE.rocketFactoryOutput);
      outputEmoji = emojiHtml('rockets');
      productionId = 'rocketFactory';
    } else if (facility === 'earthGpuSatelliteFactory' || facility === 'moonGpuSatelliteFactory') {
      baseOutput = toBigInt(BALANCE.gpuSatelliteFactoryOutput);
      outputEmoji = emojiHtml('gpuSatellites');
      productionId = 'gpuSatelliteFactory';
    } else {
      baseOutput = toBigInt(BALANCE.dysonSwarmFacilityOutput);
      outputEmoji = emojiHtml('gpuSatellites');
      productionId = 'dysonSwarmFacility';
    }

    const throughput = toBigInt(getFacilityProductionMultiplier(state.completedResearch, productionId));
    const perFacility = mulB(baseOutput, throughput);
    const rawTotal = mulB(owned, perFacility);
    if (state.pausedFacilities[facility]) {
      return `0 ${outputEmoji}/m`;
    }
    const eff = toBigInt(state.locationFacilityRates[location][facility]);
    const total = mulB(rawTotal, eff);
    return `${formatNumber(total)} ${outputEmoji}/m`;
  }

  private createSpecialFacilityRow(
    key: string,
    labelText: string,
    hintId: string,
    outputHtml: string,
    onBuy: (amount: number) => void,
  ): {
    row: HTMLDivElement;
    productionEl: HTMLSpanElement;
    priceEl: HTMLSpanElement;
    controls: CountBulkBuyControls;
  } {
    const row = document.createElement('div');
    row.className = 'panel-row supply-facility-row';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = FACILITY_TABLE_COLUMNS;
    row.style.columnGap = '10px';
    row.style.alignItems = 'center';
    row.style.minWidth = '0';

    const spacer = document.createElement('span');
    row.appendChild(spacer);

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = labelText;
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    setHintTarget(label, hintId);
    row.appendChild(label);

    const production = document.createElement('span');
    production.style.fontSize = '0.58rem';
    production.style.display = 'inline-block';
    production.style.whiteSpace = 'nowrap';
    production.style.textAlign = 'right';
    production.style.overflow = 'hidden';
    production.style.textOverflow = 'ellipsis';
    row.appendChild(production);

    const output = document.createElement('span');
    output.style.fontSize = '0.62rem';
    output.style.color = 'var(--text-muted)';
    output.style.textAlign = 'right';
    output.style.whiteSpace = 'nowrap';
    output.style.overflow = 'hidden';
    output.style.textOverflow = 'ellipsis';
    output.innerHTML = outputHtml;
    row.appendChild(output);

    const price = document.createElement('span');
    price.style.fontSize = '0.62rem';
    price.style.color = 'var(--text-muted)';
    price.style.textAlign = 'right';
    price.style.whiteSpace = 'nowrap';
    price.style.overflow = 'hidden';
    price.style.textOverflow = 'ellipsis';
    row.appendChild(price);

    const controls = new CountBulkBuyControls((amt) => onBuy(amt), { prefix: '+', countPrefix: 'x', countMinWidthPx: 28 });
    controls.el.style.justifySelf = 'end';
    row.appendChild(controls.el);

    this.specialFacilityRefs.set(key, { production, controls, price });
    return { row, productionEl: production, priceEl: price, controls };
  }

  private rebuildLayout(state: GameState): void {
    this.visibleLocations = this.getVisibleLocations(state);
    this.resourceRefs.clear();
    this.locationEnergyRefs.clear();
    this.gridContractRefs = null;
    this.facilityRefs.clear();
    this.specialFacilityRefs.clear();
    this.facilityPriceRefs.clear();
    this.facilityPauseBtns.clear();
    this.logisticsRows.clear();
    this.routeLanes.clear();
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
      facilitiesBlock.className = 'supply-location-block';
      let facilityRowCount = 0;
      let facilityHeaderAdded = false;
      const appendFacilityRow = (row: HTMLDivElement): void => {
        if (facilityRowCount > 0) {
          row.style.borderTop = '1px solid var(--border-subtle)';
          row.style.paddingTop = '3px';
          row.style.marginTop = '2px';
        }
        facilityRowCount++;
        facilitiesBlock.appendChild(row);
      };
      const ensureFacilityHeaderRow = (): void => {
        if (facilityHeaderAdded) return;
        facilityHeaderAdded = true;

        const headerRow = document.createElement('div');
        headerRow.className = 'panel-row supply-facility-row';
        headerRow.style.display = 'grid';
        headerRow.style.gridTemplateColumns = FACILITY_TABLE_COLUMNS;
        headerRow.style.columnGap = '10px';
        headerRow.style.alignItems = 'center';
        headerRow.style.minWidth = '0';
        headerRow.style.opacity = '0.85';

        const c0 = document.createElement('span');
        c0.textContent = '';
        headerRow.appendChild(c0);

        const c1 = document.createElement('span');
        c1.textContent = 'Facility';
        c1.style.fontSize = '0.58rem';
        c1.style.color = 'var(--text-muted)';
        c1.style.textTransform = 'uppercase';
        c1.style.letterSpacing = '0.03em';
        headerRow.appendChild(c1);

        const c2 = document.createElement('span');
        c2.textContent = 'Total';
        c2.style.fontSize = '0.58rem';
        c2.style.color = 'var(--text-muted)';
        c2.style.textTransform = 'uppercase';
        c2.style.letterSpacing = '0.03em';
        c2.style.textAlign = 'right';
        headerRow.appendChild(c2);

        const c3 = document.createElement('span');
        c3.textContent = 'Formula';
        c3.style.fontSize = '0.58rem';
        c3.style.color = 'var(--text-muted)';
        c3.style.textTransform = 'uppercase';
        c3.style.letterSpacing = '0.03em';
        c3.style.textAlign = 'right';
        headerRow.appendChild(c3);

        const c4 = document.createElement('span');
        c4.textContent = 'Cost';
        c4.style.fontSize = '0.58rem';
        c4.style.color = 'var(--text-muted)';
        c4.style.textTransform = 'uppercase';
        c4.style.letterSpacing = '0.03em';
        c4.style.textAlign = 'right';
        headerRow.appendChild(c4);

        const c5 = document.createElement('span');
        c5.style.textAlign = 'right';
        c5.style.fontSize = '0.58rem';
        c5.style.color = 'var(--text-muted)';
        c5.style.textTransform = 'uppercase';
        c5.style.letterSpacing = '0.03em';
        c5.textContent = 'Count';
        headerRow.appendChild(c5);

        appendFacilityRow(headerRow);
      };

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
        const showNonEnergyResources = this.isMaterialMineVisibleInUi(state, location);
        for (const resource of SUPPLY_RESOURCE_ORDER) {
          if (!showNonEnergyResources) continue;
          if (!this.isSupplyResourceVisible(state, location, resource)) continue;

          const row = document.createElement('div');
          row.className = 'panel-row supply-facility-row';
          const label = document.createElement('span');
          label.className = 'label';
          label.innerHTML = this.getResourceLabel(location, resource);
          setHintTarget(label, SUPPLY_HINTS[resource]);

          const valueWrap = document.createElement('span');
          valueWrap.className = 'value resource-line-value';
          const value = document.createElement('span');
          value.className = 'resource-primary-value';
          const rate = document.createElement('span');
          rate.className = 'resource-rate-inline';
          valueWrap.appendChild(value);
          valueWrap.appendChild(rate);

          row.appendChild(label);
          row.appendChild(valueWrap);
          resourcesBlock.appendChild(row);

          this.resourceRefs.set(`${resource}:${location}`, { value, rate });
        }

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

          if (location === 'earth') {
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
        }

        this.resourcesSection.appendChild(resourcesBlock);
      }

      for (const facility of getFacilitiesForLocation(location)) {
        if (!isFacilityUnlockedForLocation(state, location, facility.id)) continue;
        const isMaterialMine = facility.id === 'earthMaterialMine' || facility.id === 'moonMaterialMine' || facility.id === 'mercuryMaterialMine';
        if (isMaterialMine && !this.isMaterialMineVisibleInUi(state, location)) continue;

        const key = `${facility.id}:${location}`;
        const info = this.getFacilityInfo(facility.id);

        const row = document.createElement('div');
        row.className = 'panel-row supply-facility-row';
        row.style.display = 'grid';
        row.style.gridTemplateColumns = FACILITY_TABLE_COLUMNS;
        row.style.columnGap = '10px';
        row.style.alignItems = 'center';
        row.style.minWidth = '0';

        const pauseBtn = document.createElement('button');
        pauseBtn.className = 'btn-mini';
        pauseBtn.style.background = 'transparent';
        pauseBtn.style.border = 'none';
        pauseBtn.style.boxShadow = 'none';
        pauseBtn.addEventListener('click', () => this.toggleFacilityPause(facility.id));
        row.appendChild(pauseBtn);
        this.registerPauseButton(facility.id, pauseBtn);

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = facility.label;
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        setHintTarget(label, facility.hintId);
        row.appendChild(label);

        const efficiency = document.createElement('span');
        efficiency.style.fontSize = '0.58rem';
        efficiency.style.display = 'inline-block';
        efficiency.style.whiteSpace = 'nowrap';
        efficiency.style.textAlign = 'right';
        efficiency.style.overflow = 'hidden';
        efficiency.style.textOverflow = 'ellipsis';
        row.appendChild(efficiency);

        const output = document.createElement('span');
        output.style.fontSize = '0.62rem';
        output.style.color = 'var(--text-muted)';
        output.style.textAlign = 'right';
        output.style.whiteSpace = 'nowrap';
        output.style.overflow = 'hidden';
        output.style.textOverflow = 'ellipsis';
        output.innerHTML = info.output;
        row.appendChild(output);

        const price = document.createElement('span');
        price.style.fontSize = '0.62rem';
        price.style.color = 'var(--text-muted)';
        price.style.textAlign = 'right';
        price.style.whiteSpace = 'nowrap';
        price.style.overflow = 'hidden';
        price.style.textOverflow = 'ellipsis';
        const unitCosts = this.getRegularFacilityBuildCostsPerUnit(location, facility.id);
        price.innerHTML = this.buildCostHtml([
          { amount: unitCosts.material, emoji: 'material', insufficient: false },
          { amount: unitCosts.labor, emoji: 'labor', insufficient: false },
        ]);
        row.appendChild(price);
        this.facilityPriceRefs.set(key, price);

        const controls = new CountBulkBuyControls((amt) => {
          dispatchGameAction(this.state, {
            type: 'buildFacility',
            location,
            facility: facility.id,
            amount: amt,
          });
        }, { prefix: '+', countPrefix: 'x', countMinWidthPx: 28 });
        controls.el.style.justifySelf = 'end';
        row.appendChild(controls.el);
        ensureFacilityHeaderRow();
        appendFacilityRow(row);

        this.facilityRefs.set(key, { efficiency, controls });
      }

      if (location === 'earth' && state.gridPowerKW >= POWER_PLANT_UNLOCK_GRID_KW) {
        const gasRow = this.createSpecialFacilityRow(
          'earthGasPlant:earth',
          'Gas Plant',
          'infra.gasPlant',
          `${emojiHtml('energy')} ${formatMW(BALANCE.powerPlants.gas.outputMW)}`,
          (amt) => dispatchGameAction(this.state, { type: 'buyGasPlant', amount: amt }),
        );
        ensureFacilityHeaderRow();
        appendFacilityRow(gasRow.row);

        const nuclearRow = this.createSpecialFacilityRow(
          'earthNuclearPlant:earth',
          'Nuclear Plant',
          'infra.nuclearPlant',
          `${emojiHtml('energy')} ${formatMW(BALANCE.powerPlants.nuclear.outputMW)}`,
          (amt) => dispatchGameAction(this.state, { type: 'buyNuclearPlant', amount: amt }),
        );
        ensureFacilityHeaderRow();
        appendFacilityRow(nuclearRow.row);
      }

      if (location === 'earth' && state.completedResearch.includes('solarTechnology')) {
        const solarFarmPanels = toBigInt(BALANCE.solarFarmPanelsPerFarm);
        const earthSolarFarmRow = this.createSpecialFacilityRow(
          'earthSolarFarm:earth',
          'Solar Farm',
          'infra.solarInstall',
          `${emojiHtml('energy')} ${formatMW(mulB(solarFarmPanels, toBigInt(getSolarPanelPowerMW('earth', state.completedResearch))))}`,
          (amt) => dispatchGameAction(this.state, { type: 'buySolarFarm', location: 'earth', amount: amt }),
        );
        ensureFacilityHeaderRow();
        appendFacilityRow(earthSolarFarmRow.row);
      }

      if (location === 'moon' && state.completedResearch.includes('payloadToMoon')) {
        const solarFarmPanels = toBigInt(BALANCE.solarFarmPanelsPerFarm);
        const moonSolarFarmRow = this.createSpecialFacilityRow(
          'moonSolarFarm:moon',
          'Solar Farm',
          'infra.solarInstall',
          `${emojiHtml('energy')} ${formatMW(mulB(solarFarmPanels, toBigInt(getSolarPanelPowerMW('moon', state.completedResearch))))}`,
          (amt) => dispatchGameAction(this.state, { type: 'buySolarFarm', location: 'moon', amount: amt }),
        );
        ensureFacilityHeaderRow();
        appendFacilityRow(moonSolarFarmRow.row);

        const moonDatacenterRow = this.createSpecialFacilityRow(
          'moonDatacenter:moon',
          'Moon GPUs',
          'resource.gpus',
          `${emojiHtml('flops')} ${formatNumber(mulB(toBigInt(BALANCE.moonGpuDatacenterGpusPerBuild), toBigInt(BALANCE.pflopsPerGpu)))} PFlops`,
          (amt) => dispatchGameAction(this.state, { type: 'buyMoonDatacenter', amount: amt }),
        );
        ensureFacilityHeaderRow();
        appendFacilityRow(moonDatacenterRow.row);
      }

      if (facilityRowCount > 0) {
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
          label.textContent = rowDef.label;
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
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = '';

    const powerPlantsUnlocked = state.gridPowerKW >= POWER_PLANT_UNLOCK_GRID_KW ? '1' : '0';
    const layoutKey = `${this.getVisibleLocations(state).join(',')}:${state.completedResearch.join('|')}:plants:${powerPlantsUnlocked}`;
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey;
      this.rebuildLayout(state);
    }

    for (const [key, refs] of this.resourceRefs) {
      const [resource, location] = key.split(':') as [SupplyResourceId, LocationId];
      const stock = state.locationResources[location][resource];
      const income = state.locationProductionPerMin[location][resource];
      const expense = state.locationConsumptionPerMin[location][resource];
      const net = income - expense;

      let capSuffix = '';
      if (resource === 'rockets' || resource === 'gpus' || resource === 'solarPanels' || resource === 'robots') {
        if (stock >= BALANCE.locationResourceStockpileCap) capSuffix = `/${BALANCE.locationResourceStockpileCapLabel}`;
      }
      if (location === 'mercury' && resource === 'material' && stock >= BALANCE.mercuryMaterialStockpileCap) {
        capSuffix = `/${BALANCE.mercuryMaterialStockpileCapLabel}`;
      }

      refs.value.textContent = `${formatNumber(stock)}${capSuffix}`;
      refs.rate.textContent = this.formatRate(net);
      refs.rate.style.color = net < 0n ? 'var(--accent-red)' : 'var(--text-muted)';
    }

    for (const [location, valueEl] of this.locationEnergyRefs) {
      const supply = location === 'earth' ? state.powerSupplyMW : state.lunarPowerSupplyMW;
      const demand = location === 'earth' ? state.powerDemandMW : state.lunarPowerDemandMW;
      valueEl.textContent = `Supply ${formatMW(supply)} / Demand ${formatMW(demand)}`;
      valueEl.style.color = supply >= demand ? 'var(--accent-green)' : 'var(--accent-red)';
    }
    if (this.gridContractRefs) {
      this.gridContractRefs.value.textContent = formatMW(state.gridPowerKW / 1000n);
      this.gridContractRefs.cost.innerHTML = `Cost: ${formatNumber(toBigInt(BALANCE.gridPowerKWCost))} ${emojiHtml('money')}/kW`;
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

        const refs = this.facilityRefs.get(`${facility.id}:${location}`);
        if (!refs) continue;

        const owned = state.locationFacilities[location][facility.id];
        const ownedNum = Math.floor(fromBigInt(owned));
        const limit = this.getFacilityLimit(location, facility.id);

        if (refs.efficiency) {
          refs.efficiency.innerHTML = this.getRegularFacilityProductionHtml(location, facility.id, state);
          refs.efficiency.style.visibility = 'visible';
          refs.efficiency.style.color = 'var(--text-secondary)';
        }
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
        const priceRef = this.facilityPriceRefs.get(`${facility.id}:${location}`);
        if (priceRef) {
          priceRef.innerHTML = this.buildCostHtml([
            { amount: unitCosts.material, emoji: 'material', insufficient: !materialOk },
            { amount: unitCosts.labor, emoji: 'labor', insufficient: !laborOk },
          ]);
        }

        refs.controls.bulk.update(
          ownedNum,
          canBuyFacility,
          (limit !== null && limit > 0) ? limit : null,
          (amt) => {
            if (amt === 1) {
              const rowPriceRef = this.facilityPriceRefs.get(`${facility.id}:${location}`);
              if (rowPriceRef) {
                flashElement(rowPriceRef);
                return;
              }
            }
            flashElement(refs.controls.countEl);
          },
        );
      }
    }

    const gasRefs = this.specialFacilityRefs.get('earthGasPlant:earth');
    if (gasRefs) {
      const owned = state.gasPlants;
      const ownedNum = Math.floor(fromBigInt(owned));
      const earthLabor = state.locationResources.earth.labor;
      const gasLimit = BALANCE.powerPlants.gas.limit ?? null;
      const canBuyGasPlant = (amt: number) => {
        const amount = toBigInt(amt);
        return state.funds >= mulB(amount, BALANCE.powerPlants.gas.cost)
          && earthLabor >= mulB(amount, BALANCE.powerPlants.gas.laborCost);
      };
      const gasLowerAmount = this.getLowestDisplayedBuyAmount(ownedNum, gasLimit, canBuyGasPlant);
      const gasLowerAmountB = gasLowerAmount === null ? 0n : toBigInt(gasLowerAmount);
      const gasMoneyNeed = gasLowerAmount === null ? 0n : mulB(gasLowerAmountB, BALANCE.powerPlants.gas.cost);
      const gasLaborNeed = gasLowerAmount === null ? 0n : mulB(gasLowerAmountB, BALANCE.powerPlants.gas.laborCost);
      const gasMoneyOk = gasLowerAmount === null || state.funds >= gasMoneyNeed;
      const gasLaborOk = gasLowerAmount === null || earthLabor >= gasLaborNeed;
      gasRefs.controls.setCount(owned);
      gasRefs.production.innerHTML = `${emojiHtml('energy')} ${formatMW(mulB(owned, BALANCE.powerPlants.gas.outputMW))}`;
      gasRefs.price.innerHTML = this.buildCostHtml([
        { amount: BALANCE.powerPlants.gas.cost, emoji: 'money', insufficient: !gasMoneyOk },
        { amount: BALANCE.powerPlants.gas.laborCost, emoji: 'labor', insufficient: !gasLaborOk },
      ]);
      gasRefs.controls.bulk.update(
        ownedNum,
        canBuyGasPlant,
        gasLimit,
        () => flashElement(gasRefs.price),
      );
    }

    const nuclearRefs = this.specialFacilityRefs.get('earthNuclearPlant:earth');
    if (nuclearRefs) {
      const owned = state.nuclearPlants;
      const ownedNum = Math.floor(fromBigInt(owned));
      const earthLabor = state.locationResources.earth.labor;
      const nuclearLimit = BALANCE.powerPlants.nuclear.limit ?? null;
      const canBuyNuclearPlant = (amt: number) => {
        const amount = toBigInt(amt);
        return state.funds >= mulB(amount, BALANCE.powerPlants.nuclear.cost)
          && earthLabor >= mulB(amount, BALANCE.powerPlants.nuclear.laborCost);
      };
      const nuclearLowerAmount = this.getLowestDisplayedBuyAmount(ownedNum, nuclearLimit, canBuyNuclearPlant);
      const nuclearLowerAmountB = nuclearLowerAmount === null ? 0n : toBigInt(nuclearLowerAmount);
      const nuclearMoneyNeed = nuclearLowerAmount === null ? 0n : mulB(nuclearLowerAmountB, BALANCE.powerPlants.nuclear.cost);
      const nuclearLaborNeed = nuclearLowerAmount === null ? 0n : mulB(nuclearLowerAmountB, BALANCE.powerPlants.nuclear.laborCost);
      const nuclearMoneyOk = nuclearLowerAmount === null || state.funds >= nuclearMoneyNeed;
      const nuclearLaborOk = nuclearLowerAmount === null || earthLabor >= nuclearLaborNeed;
      nuclearRefs.controls.setCount(owned);
      nuclearRefs.production.innerHTML = `${emojiHtml('energy')} ${formatMW(mulB(owned, BALANCE.powerPlants.nuclear.outputMW))}`;
      nuclearRefs.price.innerHTML = this.buildCostHtml([
        { amount: BALANCE.powerPlants.nuclear.cost, emoji: 'money', insufficient: !nuclearMoneyOk },
        { amount: BALANCE.powerPlants.nuclear.laborCost, emoji: 'labor', insufficient: !nuclearLaborOk },
      ]);
      nuclearRefs.controls.bulk.update(
        ownedNum,
        canBuyNuclearPlant,
        nuclearLimit,
        () => flashElement(nuclearRefs.price),
      );
    }

    const earthSolarFarmRefs = this.specialFacilityRefs.get('earthSolarFarm:earth');
    if (earthSolarFarmRefs) {
      const farmAmount = toBigInt(BALANCE.solarFarmPanelsPerFarm);
      const unitsInstalled = state.locationResources.earth.installedSolarPanels / farmAmount;
      const unitsInstalledNum = Number(unitsInstalled);
      const laborPerFarm = BALANCE.earthSolarFarmLaborCost;
      const outputPerFarm = mulB(farmAmount, toBigInt(getSolarPanelPowerMW('earth', state.completedResearch)));
      const earthSolarFarmLimit = BALANCE.solarFarmLimit;
      const canBuyEarthSolarFarm = (amt: number) => {
        const amount = toBigInt(amt);
        const amountUnits = BigInt(amt);
        const panels = mulB(amount, farmAmount);
        const labor = mulB(amount, laborPerFarm);
        return state.locationResources.earth.solarPanels >= panels
          && state.locationResources.earth.labor >= labor
          && unitsInstalled + amountUnits <= BigInt(earthSolarFarmLimit);
      };
      const earthSolarFarmLowerAmount = this.getLowestDisplayedBuyAmount(unitsInstalledNum, earthSolarFarmLimit, canBuyEarthSolarFarm);
      const earthSolarFarmLowerAmountB = earthSolarFarmLowerAmount === null ? 0n : toBigInt(earthSolarFarmLowerAmount);
      const earthPanelsNeed = earthSolarFarmLowerAmount === null ? 0n : mulB(earthSolarFarmLowerAmountB, farmAmount);
      const earthLaborNeed = earthSolarFarmLowerAmount === null ? 0n : mulB(earthSolarFarmLowerAmountB, laborPerFarm);
      const earthPanelsOk = earthSolarFarmLowerAmount === null || state.locationResources.earth.solarPanels >= earthPanelsNeed;
      const earthLaborOk = earthSolarFarmLowerAmount === null || state.locationResources.earth.labor >= earthLaborNeed;
      earthSolarFarmRefs.controls.setCount(unitsInstalledNum);
      earthSolarFarmRefs.production.innerHTML = `${emojiHtml('energy')} ${formatMW(mulB(state.locationResources.earth.installedSolarPanels, toBigInt(getSolarPanelPowerMW('earth', state.completedResearch))))}`;
      earthSolarFarmRefs.price.innerHTML = this.buildCostHtml([
        { amount: farmAmount, emoji: 'solarPanels', insufficient: !earthPanelsOk },
        { amount: laborPerFarm, emoji: 'labor', insufficient: !earthLaborOk },
      ]);
      earthSolarFarmRefs.controls.bulk.update(
        unitsInstalledNum,
        canBuyEarthSolarFarm,
        earthSolarFarmLimit,
        () => flashElement(earthSolarFarmRefs.price),
      );
      if (outputPerFarm <= 0n) {
        earthSolarFarmRefs.production.innerHTML = `${emojiHtml('energy')} ${formatMW(0n)}`;
      }
    }

    const moonSolarFarmRefs = this.specialFacilityRefs.get('moonSolarFarm:moon');
    if (moonSolarFarmRefs) {
      const farmAmount = toBigInt(BALANCE.solarFarmPanelsPerFarm);
      const unitsInstalled = state.locationResources.moon.installedSolarPanels / farmAmount;
      const unitsInstalledNum = Number(unitsInstalled);
      const laborPerFarm = BALANCE.moonSolarFarmLaborCost;
      const moonSolarFarmLimit = BALANCE.solarFarmLimit;
      const canBuyMoonSolarFarm = (amt: number) => {
        const amount = toBigInt(amt);
        const amountUnits = BigInt(amt);
        const panels = mulB(amount, farmAmount);
        const labor = mulB(amount, laborPerFarm);
        return state.locationResources.moon.solarPanels >= panels
          && state.locationResources.moon.labor >= labor
          && unitsInstalled + amountUnits <= BigInt(moonSolarFarmLimit);
      };
      const moonSolarFarmLowerAmount = this.getLowestDisplayedBuyAmount(unitsInstalledNum, moonSolarFarmLimit, canBuyMoonSolarFarm);
      const moonSolarFarmLowerAmountB = moonSolarFarmLowerAmount === null ? 0n : toBigInt(moonSolarFarmLowerAmount);
      const moonPanelsNeed = moonSolarFarmLowerAmount === null ? 0n : mulB(moonSolarFarmLowerAmountB, farmAmount);
      const moonLaborNeed = moonSolarFarmLowerAmount === null ? 0n : mulB(moonSolarFarmLowerAmountB, laborPerFarm);
      const moonPanelsOk = moonSolarFarmLowerAmount === null || state.locationResources.moon.solarPanels >= moonPanelsNeed;
      const moonLaborOk = moonSolarFarmLowerAmount === null || state.locationResources.moon.labor >= moonLaborNeed;
      moonSolarFarmRefs.controls.setCount(unitsInstalledNum);
      moonSolarFarmRefs.production.innerHTML = `${emojiHtml('energy')} ${formatMW(mulB(state.locationResources.moon.installedSolarPanels, toBigInt(getSolarPanelPowerMW('moon', state.completedResearch))))}`;
      moonSolarFarmRefs.price.innerHTML = this.buildCostHtml([
        { amount: farmAmount, emoji: 'solarPanels', insufficient: !moonPanelsOk },
        { amount: laborPerFarm, emoji: 'labor', insufficient: !moonLaborOk },
      ]);
      moonSolarFarmRefs.controls.bulk.update(
        unitsInstalledNum,
        canBuyMoonSolarFarm,
        moonSolarFarmLimit,
        () => flashElement(moonSolarFarmRefs.price),
      );
    }

    const moonDatacenterRefs = this.specialFacilityRefs.get('moonDatacenter:moon');
    if (moonDatacenterRefs) {
      const gpuPerDc = toBigInt(BALANCE.moonGpuDatacenterGpusPerBuild);
      const unitsInstalled = state.locationResources.moon.installedGpus / gpuPerDc;
      const unitsInstalledNum = Number(unitsInstalled);
      const laborPerDc = BALANCE.moonGpuDatacenterLaborCost;
      const moonDatacenterLimit = BALANCE.moonGpuDatacenterLimit;
      const canBuyMoonDatacenter = (amt: number) => {
        const amount = toBigInt(amt);
        const amountUnits = BigInt(amt);
        const gpus = mulB(amount, gpuPerDc);
        const labor = mulB(amount, laborPerDc);
        return state.locationResources.moon.gpus >= gpus
          && state.locationResources.moon.labor >= labor
          && unitsInstalled + amountUnits <= BigInt(moonDatacenterLimit);
      };
      const moonDatacenterLowerAmount = this.getLowestDisplayedBuyAmount(unitsInstalledNum, moonDatacenterLimit, canBuyMoonDatacenter);
      const moonDatacenterLowerAmountB = moonDatacenterLowerAmount === null ? 0n : toBigInt(moonDatacenterLowerAmount);
      const moonGpusNeed = moonDatacenterLowerAmount === null ? 0n : mulB(moonDatacenterLowerAmountB, gpuPerDc);
      const moonDcLaborNeed = moonDatacenterLowerAmount === null ? 0n : mulB(moonDatacenterLowerAmountB, laborPerDc);
      const moonGpusOk = moonDatacenterLowerAmount === null || state.locationResources.moon.gpus >= moonGpusNeed;
      const moonDcLaborOk = moonDatacenterLowerAmount === null || state.locationResources.moon.labor >= moonDcLaborNeed;
      moonDatacenterRefs.controls.setCount(unitsInstalledNum);
      moonDatacenterRefs.production.innerHTML = `${emojiHtml('flops')} ${formatNumber(state.moonPflops)}`;
      moonDatacenterRefs.price.innerHTML = this.buildCostHtml([
        { amount: gpuPerDc, emoji: 'gpus', insufficient: !moonGpusOk },
        { amount: laborPerDc, emoji: 'labor', insufficient: !moonDcLaborOk },
      ]);
      moonDatacenterRefs.controls.bulk.update(
        unitsInstalledNum,
        canBuyMoonDatacenter,
        moonDatacenterLimit,
        () => flashElement(moonDatacenterRefs.price),
      );
    }

    const logisticsVisible = state.completedResearch.includes('rocketry') &&
      this.logisticsRoutes.some((route) => isRouteUnlocked(state, route));
    this.logisticsSection.style.display = logisticsVisible ? '' : 'none';

    if (this.orbitSatRow && this.orbitSatEl && this.orbitPowerEl) {
      this.orbitSatRow.style.display = logisticsVisible ? '' : 'none';
      this.orbitSatEl.innerHTML = `${resourceLabelHtml('gpuSatellites', 'GPU Sats in Orbit')}: ${formatNumber(state.satellites)}`;
      this.orbitPowerEl.innerHTML = `${resourceLabelHtml('energy', 'Power')} ${formatMW(state.orbitalPowerMW)}`;
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
        refs.autoToggle.classList.toggle('is-on', autoEnabled);
        refs.autoToggle.setAttribute('aria-pressed', autoEnabled ? 'true' : 'false');
        refs.autoToggle.disabled = !logisticsVisible || !routeUnlocked;
        refs.clearBtn.disabled = !logisticsVisible || !routeUnlocked;

        refs.row.style.display = logisticsVisible && routeUnlocked ? '' : 'none';
        if (!routeUnlocked) continue;

        const sent = state.logisticsSent[key] || 0n;
        const inTransit = state.logisticsInTransit[key] || 0n;
        const waiting = state.logisticsOrders[key] || 0n;
        refs.sent.textContent = formatNumber(sent);
        refs.inTransit.textContent = formatNumber(inTransit);
        refs.waiting.textContent = formatNumber(waiting);
        refs.waiting.style.color = waiting > inTransit ? 'var(--accent-red)' : '';
        refs.clearBtn.disabled = waiting <= 0n;

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
        laneRefs.row.style.display = logisticsVisible && routeUnlocked ? '' : 'none';
        if (!logisticsVisible || !routeUnlocked) {
          laneRefs.lane.classList.remove('logistics-lane-congested');
          laneRefs.lane.replaceChildren();
          continue;
        }

        const totals = routeTotals.get(route) ?? { inTransit: 0n, queued: 0n };
        laneRefs.lane.classList.toggle('logistics-lane-congested', totals.queued > totals.inTransit);
        const outboundCount = this.getLogisticsRocketCount(totals.inTransit);
        const recoveryUnlocked = state.rocketLossPct < BALANCE.rocketLossNoReuse;
        const recoveredPct = Math.max(0, 1 - state.rocketLossPct);
        const returningCount = recoveryUnlocked ? Math.min(100, Math.floor(outboundCount * recoveredPct)) : 0;
        this.syncLogisticsRockets(route, laneRefs.lane, outboundCount, returningCount);
      }
    }
  }
}
