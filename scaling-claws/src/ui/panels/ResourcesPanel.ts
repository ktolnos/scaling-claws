import type { GameState, LocationId, SupplyResourceId } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatFlops, formatMW, formatMoney, formatNumber, toBigInt } from '../../game/utils.ts';
import { deleteSave } from '../../game/SaveManager.ts';
import { estimateTransportRockets, getTransportRouteSource } from '../../game/systems/SpaceRules.ts';
import { createPanelScaffold } from '../components/PanelScaffold.ts';
import { locationLabelHtml, resourceLabelHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { flashElement } from '../UIUtils.ts';

type CoreResourceId = 'funds' | 'intel' | 'flops' | 'code' | 'science' | 'energy';

interface ResourceLineRefs {
  row: HTMLDivElement;
  value: HTMLSpanElement;
  rate: HTMLSpanElement;
}

interface SupplyTableCellRefs {
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

export class ResourcesPanel implements Panel {
  readonly el: HTMLElement;

  private coreSection!: HTMLDivElement;
  private supplySection!: HTMLDivElement;
  private supplySimpleList!: HTMLDivElement;
  private supplyTableWrap!: HTMLDivElement;

  private coreRefs = new Map<CoreResourceId, ResourceLineRefs>();
  private supplySimpleRefs = new Map<SupplyResourceId, ResourceLineRefs>();
  private supplyTableRefs = new Map<string, SupplyTableCellRefs>();

  private supplyLayoutKey = '';
  private visibleLocations: LocationId[] = ['earth'];
  private supplyMode: 'simple' | 'table' = 'simple';

  constructor(_state: GameState) {
    const { panel } = createPanelScaffold('RESOURCES', {
      panelClassName: 'panel resources-panel',
      bodyClassName: 'panel-body panel-body-tight',
    });
    this.el = panel;
    this.build();
  }

  private build(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    this.coreSection = document.createElement('div');
    this.coreSection.className = 'panel-section resources-core-section';

    const coreTitle = document.createElement('div');
    coreTitle.className = 'panel-section-title';
    coreTitle.textContent = 'CORE';
    this.coreSection.appendChild(coreTitle);

    for (const resource of CORE_RESOURCE_ORDER) {
      const refs = this.createResourceLine(resourceLabelHtml(resource), CORE_HINTS[resource]);
      this.coreRefs.set(resource, refs);
      this.coreSection.appendChild(refs.row);
    }

    this.supplySection = document.createElement('div');
    this.supplySection.className = 'panel-section resources-supply-section';

    const supplyTitle = document.createElement('div');
    supplyTitle.className = 'panel-section-title';
    supplyTitle.textContent = 'SUPPLY CHAIN';
    this.supplySection.appendChild(supplyTitle);

    this.supplySimpleList = document.createElement('div');
    this.supplySimpleList.className = 'resource-simple-list';
    this.supplySection.appendChild(this.supplySimpleList);

    this.supplyTableWrap = document.createElement('div');
    this.supplyTableWrap.className = 'resource-table-wrap hidden';
    this.supplySection.appendChild(this.supplyTableWrap);

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

    body.appendChild(this.coreSection);
    body.appendChild(this.supplySection);
    body.appendChild(controls);

    document.addEventListener('flash-funds', () => {
      const funds = this.coreRefs.get('funds');
      if (funds) {
        flashElement(funds.value);
      }
    });
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
    if (state.completedResearch.includes('payloadToMercury')) return ['earth', 'moon', 'mercury'];
    if (state.completedResearch.includes('payloadToMoon')) return ['earth', 'moon'];
    return ['earth'];
  }

  private isSupplyResourceUnlocked(state: GameState, location: LocationId, resource: SupplyResourceId): boolean {
    if (resource === 'robots') {
      if (location === 'earth') return state.completedResearch.includes('robotics1');
      if (location === 'moon') return state.completedResearch.includes('payloadToMoon') && state.completedResearch.includes('robotics1');
      return state.completedResearch.includes('payloadToMercury') && state.completedResearch.includes('robotics1');
    }

    if (resource === 'rockets') {
      if (location === 'earth') return state.completedResearch.includes('rocketry');
      if (location === 'moon') return state.completedResearch.includes('moonRocketry');
      return state.completedResearch.includes('payloadToMercury');
    }

    if (resource === 'gpuSatellites') {
      if (location === 'earth') return state.completedResearch.includes('rocketry');
      if (location === 'moon') return state.completedResearch.includes('moonRocketry');
      return false;
    }

    return true;
  }

  private getSupplyLayoutKey(state: GameState): string {
    const locations = this.getVisibleLocations(state);
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
    this.supplyMode = this.visibleLocations.length > 1 ? 'table' : 'simple';

    this.supplySimpleRefs.clear();
    this.supplyTableRefs.clear();
    this.supplySimpleList.innerHTML = '';
    this.supplyTableWrap.innerHTML = '';

    if (this.supplyMode === 'simple') {
      this.supplySimpleList.classList.remove('hidden');
      this.supplyTableWrap.classList.add('hidden');
      for (const resource of SUPPLY_RESOURCE_ORDER) {
        const unlocked = this.isSupplyResourceUnlocked(state, 'earth', resource);
        if (!unlocked) continue;
        const refs = this.createResourceLine(resourceLabelHtml(resource), SUPPLY_HINTS[resource]);
        this.supplySimpleRefs.set(resource, refs);
        this.supplySimpleList.appendChild(refs.row);
      }
      return;
    }

    this.supplySimpleList.classList.add('hidden');
    this.supplyTableWrap.classList.remove('hidden');

    const table = document.createElement('div');
    table.className = 'resource-table';
    table.style.setProperty('--resource-table-cols', this.visibleLocations.length.toString());

    const header = document.createElement('div');
    header.className = 'resource-table-row resource-table-header';
    const headLabel = document.createElement('span');
    headLabel.className = 'label';
    header.appendChild(headLabel);
    for (const location of this.visibleLocations) {
      const col = document.createElement('span');
      col.className = 'resource-table-col-head';
      col.innerHTML = locationLabelHtml(location);
      header.appendChild(col);
    }
    table.appendChild(header);

    for (const resource of SUPPLY_RESOURCE_ORDER) {
      const unlocked = this.visibleLocations.some((location) => this.isSupplyResourceUnlocked(state, location, resource));
      if (!unlocked) continue;

      const row = document.createElement('div');
      row.className = 'resource-table-row';

      const label = document.createElement('span');
      label.className = 'label';
      label.innerHTML = resourceLabelHtml(resource);
      setHintTarget(label, SUPPLY_HINTS[resource]);
      row.appendChild(label);

      for (const location of this.visibleLocations) {
        const cell = document.createElement('div');
        cell.className = 'resource-table-cell';

        const value = document.createElement('span');
        value.className = 'resource-table-value';
        cell.appendChild(value);

        const rate = document.createElement('span');
        rate.className = 'resource-table-rate';
        cell.appendChild(rate);

        row.appendChild(cell);
        this.supplyTableRefs.set(`${resource}:${location}`, { value, rate });
      }

      table.appendChild(row);
    }

    this.supplyTableWrap.appendChild(table);
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

  private getBusyRocketsForLocation(state: GameState, location: LocationId): bigint {
    const reserved = state.logisticsReservedRockets || {
      earthOrbit: 0n,
      earthMoon: 0n,
      moonOrbit: 0n,
      moonMercury: 0n,
      mercurySun: 0n,
    };

    let busy = 0n;
    if (location === 'earth') busy += (reserved.earthOrbit || 0n) + (reserved.earthMoon || 0n);
    if (location === 'moon') busy += (reserved.moonMercury || 0n);
    if (location === 'mercury') busy += (reserved.mercurySun || 0n);

    for (const batch of state.transportBatches || []) {
      if (getTransportRouteSource(batch.route) !== location) continue;
      const estimated = estimateTransportRockets(state, batch.route, batch.payload, batch.amount, batch.launchedRockets);
      busy += toBigInt(estimated);
    }

    for (const batch of state.rocketReturnBatches || []) {
      if (batch.location === location) busy += batch.amount;
    }
    return busy;
  }

  private updateCore(state: GameState): void {
    const energyUnlocked = state.isPostGpuTransition &&
      (state.completedResearch.includes('rocketry') || state.datacenters.some((count) => count > 0n));

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
    code.row.style.display = state.code > 0n || state.codePerMin > 0n ? '' : 'none';

    const science = this.coreRefs.get('science')!;
    science.value.textContent = formatNumber(state.science);
    science.rate.textContent = this.formatRate(state.sciencePerMin, formatNumber);
    science.row.style.display = state.science > 0n || state.sciencePerMin > 0n ? '' : 'none';

    const energy = this.coreRefs.get('energy')!;
    energy.value.textContent = formatMW(state.totalEnergyMW);
    energy.rate.textContent = '';
    energy.row.style.display = energyUnlocked ? '' : 'none';
  }

  private updateSupplySimple(state: GameState): void {
    for (const resource of SUPPLY_RESOURCE_ORDER) {
      const refs = this.supplySimpleRefs.get(resource);
      if (!refs) continue;

      const stock = state.locationResources.earth[resource];
      const income = state.locationProductionPerMin.earth[resource];
      const expense = state.locationConsumptionPerMin.earth[resource];
      const net = income - expense;

      const capSuffix = this.getSupplyCapSuffix('earth', resource, stock);
      refs.value.textContent = `${formatNumber(stock)}${capSuffix}`;

      const rateText = this.formatRate(net, formatNumber);
      if (resource === 'rockets') {
        const busy = this.getBusyRocketsForLocation(state, 'earth');
        refs.rate.textContent = busy > 0n
          ? `${rateText}${rateText ? ' ' : ''}Busy ${formatNumber(busy)}`
          : rateText;
      } else {
        refs.rate.textContent = rateText;
      }
      refs.rate.style.color = net < 0n ? 'var(--accent-red)' : 'var(--text-muted)';
    }
  }

  private updateSupplyTable(state: GameState): void {
    for (const resource of SUPPLY_RESOURCE_ORDER) {
      for (const location of this.visibleLocations) {
        const refs = this.supplyTableRefs.get(`${resource}:${location}`);
        if (!refs) continue;

        const stock = state.locationResources[location][resource];
        const income = state.locationProductionPerMin[location][resource];
        const expense = state.locationConsumptionPerMin[location][resource];
        const net = income - expense;

        const capSuffix = this.getSupplyCapSuffix(location, resource, stock);
        refs.value.textContent = `${formatNumber(stock)}${capSuffix}`;

        const rateText = this.formatRate(net, formatNumber);
        if (resource === 'rockets') {
          const busy = this.getBusyRocketsForLocation(state, location);
          refs.rate.textContent = busy > 0n
            ? `${rateText}${rateText ? ' ' : ''}Busy ${formatNumber(busy)}`
            : rateText;
        } else {
          refs.rate.textContent = rateText;
        }
        refs.rate.style.color = net < 0n ? 'var(--accent-red)' : 'var(--text-muted)';
      }
    }
  }

  update(state: GameState): void {
    this.updateCore(state);

    const newLayoutKey = this.getSupplyLayoutKey(state);
    if (newLayoutKey !== this.supplyLayoutKey) {
      this.supplyLayoutKey = newLayoutKey;
      this.rebuildSupplyLayout(state);
    }

    if (this.supplyMode === 'simple') {
      this.updateSupplySimple(state);
      return;
    }

    this.updateSupplyTable(state);
  }
}
