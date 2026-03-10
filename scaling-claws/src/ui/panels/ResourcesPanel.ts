import type { GameState, LocationId, SupplyResourceId } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatFlops, formatMW, formatMoney, formatNumber } from '../../game/utils.ts';
import { deleteSave } from '../../game/SaveManager.ts';
import { createPanelScaffold } from '../components/PanelScaffold.ts';
import { emojiHtml, locationLabelHtml, resourceLabelHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { flashElement } from '../UIUtils.ts';
import { isSupplyResourceUnlocked } from './supplyVisibility.ts';

type CoreResourceId = 'funds' | 'intel' | 'flops' | 'code' | 'science' | 'energy';

interface ResourceLineRefs {
  row: HTMLDivElement;
  value: HTMLSpanElement;
  rate: HTMLSpanElement;
}

const CORE_RESOURCE_ORDER: CoreResourceId[] = [
  'funds',
  'intel',
  'flops',
  'code',
  'science',
  'energy',
];

const CORE_HINTS: Record<CoreResourceId, string> = {
  funds: 'resource.funds',
  intel: 'resource.intel',
  flops: 'resource.flops',
  code: 'resource.code',
  science: 'resource.science',
  energy: 'resource.energy',
};

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

interface ResourcesPanelOptions {
  includeCore?: boolean;
  fixedLocations?: LocationId[];
  showRestart?: boolean;
  supplyTitle?: string | null;
  showLocationHeaders?: boolean;
  summaryMode?: 'default' | 'leftOverview';
}

export class ResourcesPanel implements Panel {
  readonly el: HTMLElement;
  private readonly includeCore: boolean;
  private readonly fixedLocations: LocationId[] | null;
  private readonly showRestart: boolean;
  private readonly supplyTitle: string | null;
  private readonly showLocationHeaders: boolean;
  private readonly summaryMode: 'default' | 'leftOverview';

  private coreSection!: HTMLDivElement;
  private supplySection!: HTMLDivElement;
  private supplyLocationList!: HTMLDivElement;

  private coreRefs = new Map<CoreResourceId, ResourceLineRefs>();
  private supplyLocationRefs = new Map<string, ResourceLineRefs>();
  private locationEnergyRefs = new Map<LocationId, ResourceLineRefs>();
  private summaryLocationRefs = new Map<string, ResourceLineRefs>();
  private summaryLocationTitles = new Map<LocationId, HTMLDivElement>();
  private summaryOrbitBlock: HTMLDivElement | null = null;
  private orbitRefs: ResourceLineRefs | null = null;
  private dysonRefs: ResourceLineRefs | null = null;

  private supplyLayoutKey = '';
  private visibleLocations: LocationId[] = ['earth'];

  constructor(_state: GameState, options: ResourcesPanelOptions = {}) {
    this.includeCore = options.includeCore ?? true;
    this.fixedLocations = options.fixedLocations ? [...options.fixedLocations] : null;
    this.showRestart = options.showRestart ?? true;
    this.supplyTitle = Object.prototype.hasOwnProperty.call(options, 'supplyTitle')
      ? (options.supplyTitle ?? null)
      : 'SUPPLY CHAIN';
    this.showLocationHeaders = options.showLocationHeaders ?? true;
    this.summaryMode = options.summaryMode ?? 'default';
    const { panel } = createPanelScaffold('RESOURCES', {
      panelClassName: 'panel resources-panel',
      bodyClassName: 'panel-body panel-body-tight',
    });
    this.el = panel;
    this.build();
  }

  private build(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    if (this.includeCore) {
      this.coreSection = document.createElement('div');
      this.coreSection.className = 'panel-section resources-core-section';

      const coreTitle = document.createElement('div');
      coreTitle.className = 'panel-section-title';
      coreTitle.textContent = 'CORE';
      this.coreSection.appendChild(coreTitle);

      for (const resource of CORE_RESOURCE_ORDER) {
        if (this.summaryMode === 'leftOverview' && resource === 'energy') continue;
        const refs = this.createResourceLine(resourceLabelHtml(resource), CORE_HINTS[resource]);
        this.coreRefs.set(resource, refs);
        this.coreSection.appendChild(refs.row);
      }
    }

    this.supplySection = document.createElement('div');
    this.supplySection.className = 'panel-section resources-supply-section';

    if (this.supplyTitle) {
      const supplyTitle = document.createElement('div');
      supplyTitle.className = 'panel-section-title';
      supplyTitle.textContent = this.supplyTitle;
      this.supplySection.appendChild(supplyTitle);
    }

    this.supplyLocationList = document.createElement('div');
    this.supplyLocationList.className = 'resource-location-list';
    if (this.summaryMode === 'leftOverview') {
      this.supplyLocationList.classList.add('resource-location-list-single-col');
    }
    this.supplySection.appendChild(this.supplyLocationList);

    if (this.includeCore) {
      body.appendChild(this.coreSection);
    }
    body.appendChild(this.supplySection);

    if (this.showRestart) {
      const controls = document.createElement('div');
      controls.className = 'resources-controls';

      const restartBtn = document.createElement('button');
      restartBtn.className = 'btn-danger btn-restart';
      restartBtn.textContent = 'Restart';
      restartBtn.onclick = () => {
        if (confirm('Are you sure you want to RESTART? All progress will be lost forever.')) {
          deleteSave();
          window.location.reload();
        }
      };
      controls.appendChild(restartBtn);
      body.appendChild(controls);
    }

    if (this.includeCore) {
      document.addEventListener('flash-funds', () => {
        const funds = this.coreRefs.get('funds');
        if (funds) {
          flashElement(funds.value);
        }
      });

      document.addEventListener('flash-income', () => {
        const funds = this.coreRefs.get('funds');
        if (funds) {
          flashElement(funds.rate);
        }
      });
    }
  }

  private createResourceLine(labelHtml: string, hintId: string): ResourceLineRefs {
    const row = document.createElement('div');
    row.className = 'panel-row resource-line';

    const label = document.createElement('span');
    label.className = 'label';
    label.innerHTML = labelHtml;
    setHintTarget(label, hintId);
    row.appendChild(label);

    const right = document.createElement('span');
    right.className = 'value resource-line-value';

    const value = document.createElement('span');
    value.className = 'resource-primary-value';
    right.appendChild(value);

    const rate = document.createElement('span');
    rate.className = 'resource-rate-inline';
    right.appendChild(rate);

    row.appendChild(right);
    return { row, value, rate };
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

  private isSupplyResourceActive(state: GameState, location: LocationId, resource: SupplyResourceId): boolean {
    const stock = state.locationResources[location][resource];
    const income = state.locationProductionPerMin[location][resource];
    const expense = state.locationConsumptionPerMin[location][resource];
    return stock > 0n || income > 0n || expense > 0n;
  }

  private isSupplyResourceUnlocked(state: GameState, location: LocationId, resource: SupplyResourceId): boolean {
    return isSupplyResourceUnlocked(state, location, resource, this.isSupplyResourceActive(state, location, resource));
  }

  private getSupplyResourceLabel(_location: LocationId, resource: SupplyResourceId): string {
    return resourceLabelHtml(resource);
  }

  private isLocationEnergyVisible(location: LocationId): boolean {
    return location === 'earth' || location === 'moon';
  }

  private getSupplyLayoutKey(state: GameState): string {
    const locations = this.getVisibleLocations(state);
    if (this.summaryMode === 'leftOverview') {
      return `overview:${locations.join(',')}`;
    }
    const unlockToken = SUPPLY_RESOURCE_ORDER
      .map((resource) => {
        const unlocked = locations.some((location) => this.isSupplyResourceUnlocked(state, location, resource));
        return `${resource}:${unlocked ? '1' : '0'}`;
      })
      .join('|');
    return `${locations.join(',')}::${unlockToken}`;
  }

  private rebuildSupplyLayout(state: GameState): void {
    this.visibleLocations = this.getVisibleLocations(state);
    this.supplyLocationRefs.clear();
    this.locationEnergyRefs.clear();
    this.summaryLocationRefs.clear();
    this.summaryLocationTitles.clear();
    this.summaryOrbitBlock = null;
    this.orbitRefs = null;
    this.dysonRefs = null;
    this.supplyLocationList.innerHTML = '';

    if (this.summaryMode === 'leftOverview') {
      for (const location of this.visibleLocations) {
        const locationBlock = document.createElement('div');
        locationBlock.className = 'resource-location-block resource-location-block-single-col';

        if (this.showLocationHeaders) {
          const locationTitle = document.createElement('div');
          locationTitle.className = 'panel-section-title resource-location-title';
          locationTitle.innerHTML = locationLabelHtml(location, location.toUpperCase());
          this.summaryLocationTitles.set(location, locationTitle);
          locationBlock.appendChild(locationTitle);
        }

        const materialRefs = this.createResourceLine(resourceLabelHtml('material'), 'resource.material');
        this.summaryLocationRefs.set(`${location}:material`, materialRefs);
        locationBlock.appendChild(materialRefs.row);

        const laborRefs = this.createResourceLine(resourceLabelHtml('labor'), 'resource.labor');
        this.summaryLocationRefs.set(`${location}:labor`, laborRefs);
        locationBlock.appendChild(laborRefs.row);

        if (location !== 'mercury') {
          const installedGpuRefs = this.createResourceLine(resourceLabelHtml('gpus', 'Installed GPUs'), 'resource.gpus');
          this.summaryLocationRefs.set(`${location}:installedGpus`, installedGpuRefs);
          locationBlock.appendChild(installedGpuRefs.row);
        }

        if (this.isLocationEnergyVisible(location)) {
          const energyRefs = this.createResourceLine(resourceLabelHtml('energy'), 'resource.energy');
          this.summaryLocationRefs.set(`${location}:energy`, energyRefs);
          locationBlock.appendChild(energyRefs.row);
        }

        this.supplyLocationList.appendChild(locationBlock);

        if (location === 'earth') {
          const orbitBlock = document.createElement('div');
          orbitBlock.className = 'resource-location-block resource-location-block-single-col';
          this.summaryOrbitBlock = orbitBlock;
          if (this.showLocationHeaders) {
            const orbitTitle = document.createElement('div');
            orbitTitle.className = 'panel-section-title resource-location-title';
            orbitTitle.innerHTML = locationLabelHtml('orbit', 'EARTH ORBIT');
            orbitBlock.appendChild(orbitTitle);
          }
          const orbitRefs = this.createResourceLine(resourceLabelHtml('gpuSatellites', 'GPU Satellites'), 'resource.gpuSatellites');
          this.orbitRefs = orbitRefs;
          orbitBlock.appendChild(orbitRefs.row);
          this.supplyLocationList.appendChild(orbitBlock);
        }

        if (location === 'mercury') {
          const sunOrbitBlock = document.createElement('div');
          sunOrbitBlock.className = 'resource-location-block resource-location-block-single-col';
          if (this.showLocationHeaders) {
            const sunOrbitTitle = document.createElement('div');
            sunOrbitTitle.className = 'panel-section-title resource-location-title';
            sunOrbitTitle.innerHTML = `${emojiHtml('sun')} SUN ORBIT`;
            sunOrbitBlock.appendChild(sunOrbitTitle);
          }
          const dysonRefs = this.createResourceLine(resourceLabelHtml('gpuSatellites', 'Dyson Swarm'), 'resource.gpuSatellites');
          this.dysonRefs = dysonRefs;
          sunOrbitBlock.appendChild(dysonRefs.row);
          this.supplyLocationList.appendChild(sunOrbitBlock);
        }
      }
      return;
    }

    for (const location of this.visibleLocations) {
      const locationBlock = document.createElement('div');
      locationBlock.className = 'resource-location-block';

      if (this.showLocationHeaders) {
        const locationTitle = document.createElement('div');
        locationTitle.className = 'panel-section-title resource-location-title';
        locationTitle.innerHTML = locationLabelHtml(location, location.toUpperCase());
        locationBlock.appendChild(locationTitle);
      }

      for (const resource of SUPPLY_RESOURCE_ORDER) {
        if (!this.isSupplyResourceUnlocked(state, location, resource)) continue;
        const refs = this.createResourceLine(this.getSupplyResourceLabel(location, resource), SUPPLY_HINTS[resource]);
        this.supplyLocationRefs.set(`${resource}:${location}`, refs);
        locationBlock.appendChild(refs.row);
      }

      if (this.isLocationEnergyVisible(location)) {
        const energyRefs = this.createResourceLine(resourceLabelHtml('energy'), 'resource.energy');
        energyRefs.row.classList.add('location-energy-row');
        this.locationEnergyRefs.set(location, energyRefs);
        locationBlock.appendChild(energyRefs.row);
      }

      this.supplyLocationList.appendChild(locationBlock);
    }
  }

  private formatRate(value: bigint, formatter: (input: bigint) => string): string {
    if (value === 0n) return '';
    const abs = value < 0n ? -value : value;
    return `${value > 0n ? '+' : '-'}${formatter(abs)}/m`;
  }

  private formatMoneySpaced(value: bigint): string {
    const raw = formatMoney(value);
    if (raw.startsWith('-$')) return `- $ ${raw.slice(2)}`;
    if (raw.startsWith('$')) return `$ ${raw.slice(1)}`;
    return raw;
  }

  private getSupplyCapSuffix(location: LocationId, resource: SupplyResourceId, amount: bigint): string {
    if (resource === 'rockets' || resource === 'gpus' || resource === 'solarPanels' || resource === 'robots') {
      return amount >= BALANCE.locationResourceStockpileCap ? `/${BALANCE.locationResourceStockpileCapLabel}` : '';
    }
    if (location === 'mercury' && resource === 'material') {
      return amount >= BALANCE.mercuryMaterialStockpileCap ? `/${BALANCE.mercuryMaterialStockpileCapLabel}` : '';
    }
    return '';
  }

  private updateCore(state: GameState): void {
    if (!this.includeCore) return;

    const funds = this.coreRefs.get('funds')!;
    funds.value.textContent = this.formatMoneySpaced(state.funds);
    const fundsNet = state.incomePerMin - state.expensePerMin;
    funds.rate.textContent = this.formatRate(fundsNet, (v) => this.formatMoneySpaced(v));
    funds.row.style.display = '';

    const intel = this.coreRefs.get('intel')!;
    intel.value.textContent = (Math.round(state.intelligence * 10) / 10).toString();
    intel.rate.textContent = '';
    intel.row.style.display = '';

    const flops = this.coreRefs.get('flops')!;
    flops.value.textContent = formatFlops(state.totalPflops);
    flops.rate.textContent = '';
    flops.row.style.display = state.isPostGpuTransition ? '' : 'none';

    const code = this.coreRefs.get('code')!;
    code.value.textContent = formatNumber(state.code);
    code.rate.textContent = this.formatRate(state.codePerMin, formatNumber);
    code.row.style.display = state.unlockedJobs.includes('humanSWE') || state.code > 0n || state.codePerMin > 0n ? '' : 'none';

    const science = this.coreRefs.get('science')!;
    science.value.textContent = formatNumber(state.science);
    science.rate.textContent = this.formatRate(state.sciencePerMin, formatNumber);
    science.row.style.display = state.science > 0n || state.sciencePerMin > 0n ? '' : 'none';

    const energy = this.coreRefs.get('energy');
    if (energy) {
      const energyUnlocked = state.datacenters.some((count) => count > 0n);
      energy.value.textContent = formatMW(state.totalEnergyMW);
      energy.rate.textContent = '';
      energy.row.style.display = energyUnlocked ? '' : 'none';
    }
  }

  private updateSupplyByLocation(state: GameState): void {
    if (this.summaryMode === 'leftOverview') {
      const rocketryUnlocked = state.completedResearch.includes('rocketry');
      const humanWorkerUnlocked = state.unlockedJobs.includes('humanWorker');
      const energyUnlocked = state.datacenters.some((count) => count > 0n);

      for (const location of this.visibleLocations) {
        const locationTitle = this.summaryLocationTitles.get(location);
        if (locationTitle) {
          locationTitle.style.display = location === 'earth' && !rocketryUnlocked ? 'none' : '';
        }

        const materialRefs = this.summaryLocationRefs.get(`${location}:material`);
        if (materialRefs) {
          const materialVisible = this.isSupplyResourceUnlocked(state, location, 'material');
          materialRefs.row.style.display = materialVisible ? '' : 'none';
          const stock = state.locationResources[location].material;
          const net = state.locationProductionPerMin[location].material - state.locationConsumptionPerMin[location].material;
          const capSuffix = this.getSupplyCapSuffix(location, 'material', stock);
          materialRefs.value.textContent = `${formatNumber(stock)}${capSuffix}`;
          materialRefs.rate.textContent = this.formatRate(net, formatNumber);
          materialRefs.rate.style.color = net < 0n ? 'var(--accent-red)' : 'var(--text-muted)';
        }

        const laborRefs = this.summaryLocationRefs.get(`${location}:labor`);
        if (laborRefs) {
          laborRefs.row.style.display = humanWorkerUnlocked ? '' : 'none';
          const stock = state.locationResources[location].labor;
          const net = state.locationProductionPerMin[location].labor - state.locationConsumptionPerMin[location].labor;
          laborRefs.value.textContent = formatNumber(stock);
          laborRefs.rate.textContent = this.formatRate(net, formatNumber);
          laborRefs.rate.style.color = net < 0n ? 'var(--accent-red)' : 'var(--text-muted)';
        }

        const installedGpuRefs = this.summaryLocationRefs.get(`${location}:installedGpus`);
        if (installedGpuRefs) {
          const installed = location === 'earth'
            ? state.installedGpuCount
            : state.locationResources[location].installedGpus;
          installedGpuRefs.value.textContent = formatNumber(installed);
          installedGpuRefs.rate.textContent = '';
        }

        const energyRefs = this.summaryLocationRefs.get(`${location}:energy`);
        if (energyRefs) {
          energyRefs.row.style.display = energyUnlocked ? '' : 'none';
          const supply = location === 'earth' ? state.powerSupplyMW : state.lunarPowerSupplyMW;
          const demand = location === 'earth' ? state.powerDemandMW : state.lunarPowerDemandMW;
          energyRefs.value.textContent = `${formatMW(supply)} / Demand ${formatMW(demand)}`;
          energyRefs.rate.textContent = '';
          energyRefs.value.style.color = supply >= demand ? 'var(--accent-green)' : 'var(--accent-red)';
        }
      }

      if (this.summaryOrbitBlock) {
        this.summaryOrbitBlock.style.display = rocketryUnlocked ? '' : 'none';
      }

      if (this.orbitRefs) {
        this.orbitRefs.value.textContent = formatNumber(state.satellites);
        this.orbitRefs.rate.textContent = '';
      }
      if (this.dysonRefs) {
        this.dysonRefs.value.textContent = formatNumber(state.dysonSwarmSatellites);
        this.dysonRefs.rate.textContent = '';
      }
      return;
    }

    for (const resource of SUPPLY_RESOURCE_ORDER) {
      for (const location of this.visibleLocations) {
        const refs = this.supplyLocationRefs.get(`${resource}:${location}`);
        if (!refs) continue;

        const stock = state.locationResources[location][resource];
        const income = state.locationProductionPerMin[location][resource];
        const expense = state.locationConsumptionPerMin[location][resource];
        const net = income - expense;

        const capSuffix = this.getSupplyCapSuffix(location, resource, stock);
        refs.value.textContent = `${formatNumber(stock)}${capSuffix}`;

        refs.rate.textContent = this.formatRate(net, formatNumber);
        refs.rate.style.color = net < 0n ? 'var(--accent-red)' : 'var(--text-muted)';
      }
    }

    for (const [location, refs] of this.locationEnergyRefs) {
      const supply = location === 'earth' ? state.powerSupplyMW : state.lunarPowerSupplyMW;
      const demand = location === 'earth' ? state.powerDemandMW : state.lunarPowerDemandMW;
      refs.value.textContent = `Supply ${formatMW(supply)} / Demand ${formatMW(demand)}`;
      refs.rate.textContent = '';
      refs.value.style.color = supply >= demand ? 'var(--accent-green)' : 'var(--accent-red)';
    }
  }

  update(state: GameState): void {
    this.updateCore(state);

    const newLayoutKey = this.getSupplyLayoutKey(state);
    if (newLayoutKey !== this.supplyLayoutKey) {
      this.supplyLayoutKey = newLayoutKey;
      this.rebuildSupplyLayout(state);
    }

    this.updateSupplyByLocation(state);
  }
}
