import type { GameState, FacilityId, LocationId, SupplyResourceId } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatNumber, fromBigInt, toBigInt } from '../../game/utils.ts';
import { canBuildFacility, isFacilityUnlocked as isFacilityUnlockedForLocation } from '../../game/systems/SupplySystem.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import { estimateTransportRockets, getTransportRouteSource } from '../../game/systems/SpaceRules.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';
import { createPanelDivider, createPanelScaffold } from '../components/PanelScaffold.ts';
import { emojiHtml, locationLabelHtml, resourceLabelHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';

interface ResourceCellRefs {
  value: HTMLSpanElement;
  cap: HTMLSpanElement;
  rate: HTMLSpanElement;
  busy: HTMLSpanElement;
}

interface FacilityCellRefs {
  efficiency?: HTMLSpanElement;
  count: HTMLSpanElement;
  buyGroup?: BulkBuyGroup;
  locked?: HTMLSpanElement;
}

interface FacilityDef {
  id: FacilityId;
  shortLabel: string;
  longLabel: string;
}

const RESOURCE_ORDER: Array<{ id: SupplyResourceId; shortLabel: string; longLabel: string }> = [
  { id: 'labor', shortLabel: 'Labor', longLabel: 'Labor' },
  { id: 'material', shortLabel: 'Material', longLabel: 'Materials' },
  { id: 'solarPanels', shortLabel: 'Solar', longLabel: 'Solar Panels' },
  { id: 'robots', shortLabel: 'Robots', longLabel: 'Worker Robots' },
  { id: 'gpus', shortLabel: 'GPUs', longLabel: 'Compute GPUs' },
  { id: 'rockets', shortLabel: 'Rockets', longLabel: 'Rockets' },
  { id: 'gpuSatellites', shortLabel: 'GPU Sats', longLabel: 'Orbital GPU Satellites' },
];

const FACILITY_ORDER: FacilityDef[] = [
  { id: 'materialMine', shortLabel: 'Mines', longLabel: 'Material Mines' },
  { id: 'solarFactory', shortLabel: 'Solar Fab', longLabel: 'Solar Panel Factory' },
  { id: 'robotFactory', shortLabel: 'Robot Fab', longLabel: 'Robot Factory' },
  { id: 'gpuFactory', shortLabel: 'GPU Fab', longLabel: 'GPU Factory' },
  { id: 'rocketFactory', shortLabel: 'Rocket Fab', longLabel: 'Rocket Factory' },
  { id: 'gpuSatelliteFactory', shortLabel: 'Sat Fab', longLabel: 'GPU Satellite Factory' },
  { id: 'massDriver', shortLabel: 'Mass Driver', longLabel: 'Mass Driver' },
];

const RESOURCE_HINT_ID: Record<SupplyResourceId, string> = {
  labor: 'resource.labor',
  material: 'resource.material',
  solarPanels: 'resource.solarPanels',
  robots: 'resource.robots',
  gpus: 'resource.gpus',
  rockets: 'resource.rockets',
  gpuSatellites: 'resource.gpuSatellites',
};

const FACILITY_HINT_ID: Record<FacilityId, string> = {
  materialMine: 'resource.material',
  solarFactory: 'resource.solarPanels',
  robotFactory: 'resource.robots',
  gpuFactory: 'infra.gpuFactory',
  rocketFactory: 'resource.rockets',
  gpuSatelliteFactory: 'resource.gpuSatellites',
  massDriver: 'mechanic.spaceLogistics',
};

export class SupplyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private body!: HTMLDivElement;
  private resourcesSection!: HTMLDivElement;
  private facilitiesSection!: HTMLDivElement;

  private layoutKey = '';
  private visibleLocations: LocationId[] = ['earth'];

  private resourceRefs = new Map<string, ResourceCellRefs>();
  private facilityRefs = new Map<string, FacilityCellRefs>();
  private facilityPauseBtns = new Map<FacilityId, HTMLButtonElement>();

  constructor(state: GameState) {
    this.state = state;
    const { panel } = createPanelScaffold('SUPPLY CHAIN', {
      panelClassName: 'panel supply-panel',
      bodyClassName: 'panel-body panel-body-tight',
    });
    this.el = panel;
    this.buildBase();
  }

  private buildBase(): void {
    this.body = this.el.querySelector('.panel-body') as HTMLDivElement;

    this.resourcesSection = document.createElement('div');
    this.resourcesSection.className = 'panel-section';

    this.facilitiesSection = document.createElement('div');
    this.facilitiesSection.className = 'panel-section';
    this.facilitiesSection.style.gap = '2px';

    this.body.appendChild(this.resourcesSection);
    this.body.appendChild(createPanelDivider());
    this.body.appendChild(this.facilitiesSection);
  }

  private getVisibleLocations(state: GameState): LocationId[] {
    if (state.completedResearch.includes('payloadToMercury')) return ['earth', 'moon', 'mercury'];
    if (state.completedResearch.includes('payloadToMoon')) return ['earth', 'moon'];
    return ['earth'];
  }

  private isResourceUnlocked(state: GameState, location: LocationId, resource: SupplyResourceId): boolean {
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
      if (location === 'earth') return state.completedResearch.includes('orbitalLogistics');
      if (location === 'moon') return state.completedResearch.includes('moonSatelliteManufacturing');
      return false;
    }

    return true;
  }

  private makeGridRow(columns: number, labelMinPx: number = 93, labelFr: number = 1.35): HTMLDivElement {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = `minmax(${labelMinPx}px, ${labelFr}fr) repeat(${columns}, minmax(0, 1fr))`;
    row.style.columnGap = '3px';
    row.style.alignItems = 'center';
    row.style.minHeight = '23px';
    return row;
  }

  private fmtAmount(value: bigint | number): string {
    return formatNumber(typeof value === 'number' ? toBigInt(value) : value);
  }

  private getResourceStockpileCap(
    location: LocationId,
    resource: SupplyResourceId,
  ): { cap: bigint; label: string } | null {
    if (resource === 'rockets' || resource === 'gpus' || resource === 'solarPanels' || resource === 'robots') {
      return { cap: BALANCE.locationResourceStockpileCap, label: BALANCE.locationResourceStockpileCapLabel };
    }
    if (location === 'mercury' && resource === 'material') {
      return { cap: BALANCE.mercuryMaterialStockpileCap, label: BALANCE.mercuryMaterialStockpileCapLabel };
    }
    return null;
  }

  private hasResourceProductionSetup(state: GameState, location: LocationId, resource: SupplyResourceId): boolean {
    const facilities = state.locationFacilities[location];
    if (resource === 'material') {
      return facilities.materialMine > 0n || facilities.solarFactory > 0n || facilities.robotFactory > 0n || facilities.gpuFactory > 0n || facilities.rocketFactory > 0n;
    }
    if (resource === 'labor') {
      return facilities.materialMine > 0n || facilities.solarFactory > 0n || facilities.robotFactory > 0n || facilities.gpuFactory > 0n || facilities.rocketFactory > 0n;
    }
    if (resource === 'solarPanels') {
      return facilities.solarFactory > 0n || facilities.gpuSatelliteFactory > 0n;
    }
    if (resource === 'robots') {
      return facilities.robotFactory > 0n;
    }
    if (resource === 'gpus') {
      return facilities.gpuFactory > 0n || facilities.gpuSatelliteFactory > 0n;
    }
    if (resource === 'rockets') {
      return facilities.rocketFactory > 0n || facilities.massDriver > 0n;
    }
    if (resource === 'gpuSatellites') {
      return facilities.gpuSatelliteFactory > 0n;
    }
    return false;
  }

  private isFacilityPaused(facility: FacilityId): boolean {
    return this.state.pausedFacilities[facility] === true;
  }

  private setFacilityPaused(facility: FacilityId, paused: boolean): void {
    this.state.pausedFacilities[facility] = paused;
  }

  private updatePauseButton(facility: FacilityId): void {
    const btn = this.facilityPauseBtns.get(facility);
    if (!btn) return;
    const paused = this.isFacilityPaused(facility);
    btn.textContent = paused ? '▶' : '⏸';
    btn.title = paused ? 'Resume production globally' : 'Pause production globally';
    btn.style.color = paused ? 'var(--accent-gold)' : 'var(--text-muted)';
  }

  private getBusyRocketsForLocation(state: GameState, location: LocationId): bigint {
    const reserved = state.logisticsReservedRockets || { earthOrbit: 0n, earthMoon: 0n, moonMercury: 0n, mercurySun: 0n };
    let busy = 0n;
    if (location === 'earth') busy += (reserved.earthOrbit || 0n) + (reserved.earthMoon || 0n);
    if (location === 'moon') busy += (reserved.moonMercury || 0n);
    if (location === 'mercury') busy += (reserved.mercurySun || 0n);

    const inFlight = state.transportBatches || [];
    for (const batch of inFlight) {
      if (getTransportRouteSource(batch.route) !== location) continue;
      const estimated = estimateTransportRockets(state, batch.route, batch.payload, batch.amount, batch.launchedRockets);
      busy += toBigInt(estimated);
    }

    const returns = state.rocketReturnBatches || [];
    for (const batch of returns) {
      if (batch.location === location) busy += batch.amount;
    }
    return busy;
  }

  private getFacilityInfo(facility: FacilityId): { price: string; output: string } {
    if (facility === 'materialMine') {
      return {
        price: `Price: ${formatNumber(BALANCE.materialMineBuildLaborCost)} ${emojiHtml('labor')} labor`,
        output: `${formatNumber(BALANCE.materialMineLaborReq)} ${emojiHtml('labor')} ➜ ${formatNumber(BALANCE.materialMineOutput)} ${emojiHtml('material')}`,
      };
    }
    if (facility === 'solarFactory') {
      return {
        price: `Price: ${formatNumber(BALANCE.solarFactoryBuildMaterialCost)} ${emojiHtml('material')} material`,
        output: `${formatNumber(BALANCE.solarFactoryMaterialReq)} ${emojiHtml('material')} + ${formatNumber(BALANCE.solarFactoryLaborCost)} ${emojiHtml('labor')} ➜ ${formatNumber(BALANCE.solarFactoryOutput)} ${emojiHtml('solarPanels')}`,
      };
    }
    if (facility === 'robotFactory') {
      return {
        price: `Price: ${formatNumber(BALANCE.robotFactoryBuildMaterialCost)} ${emojiHtml('material')} material`,
        output: `${formatNumber(BALANCE.robotFactoryMaterialReq)} ${emojiHtml('material')} + ${formatNumber(BALANCE.robotFactoryLaborCost)} ${emojiHtml('labor')} ➜ ${formatNumber(BALANCE.robotFactoryOutput)} ${emojiHtml('robots')}`,
      };
    }
    if (facility === 'gpuFactory') {
      return {
        price: `Price: ${formatNumber(BALANCE.gpuFactoryBuildMaterialCost)} ${emojiHtml('material')} material`,
        output: `${formatNumber(BALANCE.gpuFactoryMaterialReq)} ${emojiHtml('material')} + ${formatNumber(BALANCE.gpuFactoryLaborCost)} ${emojiHtml('labor')} ➜ ${formatNumber(BALANCE.gpuFactoryOutput)} ${emojiHtml('gpus')}`,
      };
    }
    if (facility === 'rocketFactory') {
      return {
        price: `Price: ${formatNumber(BALANCE.rocketFactoryBuildMaterialCost)} ${emojiHtml('material')} material`,
        output: `${formatNumber(BALANCE.rocketFactoryMaterialReq)} ${emojiHtml('material')} + ${formatNumber(BALANCE.rocketFactoryLaborCost)} ${emojiHtml('labor')} ➜ ${this.fmtAmount(BALANCE.rocketFactoryOutput)} ${emojiHtml('rockets')}`,
      };
    }
    if (facility === 'gpuSatelliteFactory') {
      return {
        price: `Price: ${formatNumber(BALANCE.gpuSatelliteFactoryBuildMaterialCost)} ${emojiHtml('material')} material`,
        output: `${formatNumber(BALANCE.gpuSatelliteFactorySolarPanelReq)} ${emojiHtml('solarPanels')} + ${formatNumber(BALANCE.gpuSatelliteFactoryGpuReq)} ${emojiHtml('gpus')} ➜ ${this.fmtAmount(BALANCE.gpuSatelliteFactoryOutput)} ${emojiHtml('gpuSatellites')}`,
      };
    }
    return {
      price: `Price: ${formatNumber(BALANCE.rocketFactoryBuildMaterialCost)} ${emojiHtml('material')} material`,
      output: `${formatNumber(toBigInt(BALANCE.massDriverLaunchesPerMin))} ${emojiHtml('rockets')} ➜ x${BALANCE.massDriverCapacityMultiplier}`,
    };
  }

  private getFacilityLimit(location: LocationId, facility: FacilityId): number | null {
    const getEarthLimit = (type: FacilityId): number => {
      if (type === 'materialMine') return BALANCE.materialMineLimit;
      if (type === 'solarFactory') return BALANCE.solarFactoryLimit;
      if (type === 'robotFactory') return BALANCE.robotFactoryLimit;
      if (type === 'gpuFactory') return BALANCE.gpuFactoryLimit;
      if (type === 'rocketFactory') return BALANCE.rocketFactoryLimit;
      if (type === 'gpuSatelliteFactory') return BALANCE.gpuSatelliteFactoryLimit;
      return 0;
    };

    if (location === 'earth') {
      return getEarthLimit(facility);
    }

    if (location === 'moon') {
      if (facility === 'massDriver') return BALANCE.moonMassDriverLimit;
      const earthLimit = getEarthLimit(facility);
      if (earthLimit <= 0) return 0;
      const multipliers = BALANCE.moonFacilityLimits as Record<string, number>;
      const multiplier = multipliers[facility] ?? 0;
      return Math.floor(earthLimit * multiplier);
    }

    if (facility === 'massDriver') {
      const launchesPerMin = Math.max(1, BALANCE.massDriverLaunchesPerMin);
      const rocketsCap = fromBigInt(BALANCE.locationResourceStockpileCap);
      return Math.max(1, Math.ceil(rocketsCap / launchesPerMin));
    }

    const earthLimit = getEarthLimit(facility);
    if (earthLimit <= 0) return 0;
    const multipliers = BALANCE.mercuryFacilityLimits as Record<string, number>;
    const multiplier = multipliers[facility] ?? 0;
    return Math.floor(earthLimit * multiplier);
  }

  private rebuildLayout(state: GameState): void {
    this.visibleLocations = this.getVisibleLocations(state);
    const compact = this.visibleLocations.length > 1;
    const dense = this.visibleLocations.length >= 3;
    const locationHeaderFontSize = dense ? '0.68rem' : '0.74rem';
    const facilityMetaFontSize = dense ? '0.58rem' : '0.62rem';
    const facilityLabelMinPx = dense ? 100 : 108;
    const facilityLabelFr = dense ? 1.45 : 1.5;
    this.resourceRefs.clear();
    this.facilityRefs.clear();
    this.facilityPauseBtns.clear();
    this.resourcesSection.innerHTML = '';
    this.facilitiesSection.innerHTML = '';

    const resTitle = document.createElement('div');
    resTitle.className = 'panel-section-title';
    resTitle.textContent = 'RESOURCES';
    this.resourcesSection.appendChild(resTitle);

    if (this.visibleLocations.length > 1) {
      const headerRow = this.makeGridRow(this.visibleLocations.length);
      const empty = document.createElement('span');
      headerRow.appendChild(empty);

      for (const location of this.visibleLocations) {
        const title = document.createElement('span');
        title.className = 'label';
        title.style.fontSize = locationHeaderFontSize;
        title.style.textAlign = 'right';
        title.style.justifySelf = 'end';
        title.innerHTML = locationLabelHtml(location, location.toUpperCase());
        headerRow.appendChild(title);
      }

      this.resourcesSection.appendChild(headerRow);
    }

    for (const resource of RESOURCE_ORDER) {
      const anyUnlocked = this.visibleLocations.some((location) => this.isResourceUnlocked(state, location, resource.id));
      if (!anyUnlocked) continue;

      const row = this.makeGridRow(this.visibleLocations.length);
      row.style.marginBottom = '0';

      const label = document.createElement('span');
      label.className = 'label';
      label.style.fontSize = '0.74rem';
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.innerHTML = resourceLabelHtml(resource.id, compact ? resource.shortLabel : resource.longLabel);
      label.title = resource.longLabel;
      setHintTarget(label, RESOURCE_HINT_ID[resource.id]);
      row.appendChild(label);

      for (const location of this.visibleLocations) {
        const cell = document.createElement('div');
        cell.style.display = 'flex';
        cell.style.flexDirection = 'column';
        cell.style.alignItems = 'flex-end';
        cell.style.gap = '0';

        const valueLine = document.createElement('div');
        valueLine.style.display = 'flex';
        valueLine.style.alignItems = 'baseline';
        valueLine.style.gap = '2px';

        const value = document.createElement('span');
        value.className = 'value';
        value.style.fontSize = '0.76rem';
        value.style.fontWeight = '600';
        valueLine.appendChild(value);

        const cap = document.createElement('span');
        cap.style.fontSize = '0.58rem';
        cap.style.fontWeight = '600';
        cap.style.color = 'var(--accent-gold)';
        valueLine.appendChild(cap);
        cell.appendChild(valueLine);

        const rate = document.createElement('span');
        rate.style.fontSize = '0.64rem';
        rate.style.color = 'var(--text-muted)';

        const busy = document.createElement('span');
        busy.style.fontSize = '0.62rem';
        busy.style.color = 'var(--text-muted)';

        cell.appendChild(rate);
        cell.appendChild(busy);

        this.resourceRefs.set(`${resource.id}:${location}`, { value, cap, rate, busy });
        row.appendChild(cell);
      }

      this.resourcesSection.appendChild(row);
    }

    const facTitle = document.createElement('div');
    facTitle.className = 'panel-section-title';
    facTitle.textContent = 'PRODUCTION FACILITIES';
    this.facilitiesSection.appendChild(facTitle);

    if (this.visibleLocations.length > 1) {
      const headerRow = this.makeGridRow(this.visibleLocations.length, facilityLabelMinPx, facilityLabelFr);
      const empty = document.createElement('span');
      headerRow.appendChild(empty);

      for (const location of this.visibleLocations) {
        const title = document.createElement('span');
        title.className = 'label';
        title.style.fontSize = locationHeaderFontSize;
        title.style.textAlign = 'right';
        title.style.justifySelf = 'end';
        title.innerHTML = locationLabelHtml(location, location.toUpperCase());
        headerRow.appendChild(title);
      }

      this.facilitiesSection.appendChild(headerRow);
    }

    for (const facility of FACILITY_ORDER) {
      const anyUnlocked = this.visibleLocations.some((location) => isFacilityUnlockedForLocation(state, location, facility.id));
      if (!anyUnlocked) continue;

      const row = this.makeGridRow(this.visibleLocations.length, facilityLabelMinPx, facilityLabelFr);
      row.style.padding = '0';
      row.style.minHeight = '25px';
      row.style.alignItems = 'flex-start';

      const facilityInfo = this.getFacilityInfo(facility.id);
      const labelWrap = document.createElement('div');
      labelWrap.style.display = 'flex';
      labelWrap.style.flexDirection = 'column';
      labelWrap.style.gap = '0';
      labelWrap.style.minWidth = '0';

      const label = document.createElement('span');
      label.className = 'label';
      label.style.fontSize = '0.74rem';
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.flex = '1 1 auto';
      label.innerHTML = compact ? facility.shortLabel : facility.longLabel;
      label.title = facility.longLabel;
      setHintTarget(label, FACILITY_HINT_ID[facility.id]);
      const labelTop = document.createElement('div');
      labelTop.style.display = 'flex';
      labelTop.style.alignItems = 'center';
      labelTop.style.gap = '4px';
      labelTop.style.minWidth = '0';
      labelTop.style.paddingRight = '2px';
      labelTop.appendChild(label);

      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'btn-mini';
      pauseBtn.style.minWidth = '18px';
      pauseBtn.style.height = '18px';
      pauseBtn.style.lineHeight = '1';
      pauseBtn.style.padding = '0';
      pauseBtn.style.marginRight = '2px';
      pauseBtn.style.background = 'transparent';
      pauseBtn.style.border = 'none';
      pauseBtn.style.outline = 'none';
      pauseBtn.style.boxShadow = 'none';
      pauseBtn.addEventListener('click', () => {
        this.setFacilityPaused(facility.id, !this.isFacilityPaused(facility.id));
        this.updatePauseButton(facility.id);
      });
      labelTop.appendChild(pauseBtn);
      this.facilityPauseBtns.set(facility.id, pauseBtn);
      this.updatePauseButton(facility.id);
      labelWrap.appendChild(labelTop);

      const meta = document.createElement('span');
      meta.style.fontSize = facilityMetaFontSize;
      meta.style.color = 'var(--text-muted)';
      meta.style.whiteSpace = 'nowrap';
      meta.style.overflow = 'hidden';
      meta.style.textOverflow = 'ellipsis';
      meta.innerHTML = facilityInfo.price;
      meta.title = `${facility.shortLabel} price`;
      labelWrap.appendChild(meta);

      const output = document.createElement('span');
      output.style.fontSize = facilityMetaFontSize;
      output.style.color = 'var(--text-muted)';
      output.style.whiteSpace = 'nowrap';
      output.style.overflow = 'hidden';
      output.style.textOverflow = 'ellipsis';
      output.innerHTML = facilityInfo.output;
      output.title = `${facility.shortLabel} output`;
      labelWrap.appendChild(output);

      row.appendChild(labelWrap);

      for (const location of this.visibleLocations) {
        const key = `${facility.id}:${location}`;
        const unlocked = isFacilityUnlockedForLocation(state, location, facility.id);
        const unavailableByDesign = facility.id === 'massDriver' && location === 'earth';

        const cell = document.createElement('div');
        cell.style.display = 'flex';
        cell.style.flexDirection = 'column';
        cell.style.alignItems = 'flex-end';
        cell.style.gap = '1px';

        if (!unlocked) {
          const locked = document.createElement('span');
          locked.style.fontSize = '0.68rem';
          locked.style.color = 'var(--text-muted)';
          locked.textContent = unavailableByDesign ? 'n/a' : 'locked';
          cell.appendChild(locked);
          this.facilityRefs.set(key, { count: document.createElement('span'), locked });
        } else {
          const countLine = document.createElement('div');
          countLine.style.display = 'flex';
          countLine.style.alignItems = 'baseline';
          countLine.style.gap = '2px';

          const efficiency = document.createElement('span');
          efficiency.style.fontSize = '0.58rem';
          efficiency.style.color = 'var(--text-muted)';
          efficiency.style.fontWeight = '600';
          countLine.appendChild(efficiency);

          const count = document.createElement('span');
          count.className = 'value';
          count.style.fontSize = '0.68rem';
          count.style.fontWeight = '600';
          count.style.lineHeight = '1';
          countLine.appendChild(count);

          cell.appendChild(countLine);

          const buyGroup = new BulkBuyGroup((amt) => {
            dispatchGameAction(this.state, {
              type: 'buildFacility',
              location,
              facility: facility.id,
              amount: amt,
            });
          }, '+');
          buyGroup.el.style.transform = 'scale(0.84)';
          buyGroup.el.style.transformOrigin = 'right center';
          cell.appendChild(buyGroup.el);

          this.facilityRefs.set(key, { efficiency, count, buyGroup });
        }

        row.appendChild(cell);
      }

      this.facilitiesSection.appendChild(row);
    }
  }

  update(state: GameState): void {
    this.state = state;

    const visible = state.isPostGpuTransition && (
      state.completedResearch.includes('solarTechnology') ||
      state.completedResearch.includes('chipManufacturing') ||
      state.completedResearch.includes('robotics1') ||
      state.completedResearch.includes('rocketry') ||
      state.completedResearch.includes('payloadToMoon')
    );

    if (!visible) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = '';

    const newLocations = this.getVisibleLocations(state);
    const layoutKey = `${newLocations.join(',')}:${state.completedResearch.join('|')}`;
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey;
      this.rebuildLayout(state);
    }

    for (const resource of RESOURCE_ORDER) {
      for (const location of this.visibleLocations) {
        const refs = this.resourceRefs.get(`${resource.id}:${location}`);
        if (!refs) continue;

        const stock = state.locationResources[location][resource.id];
        const income = state.locationProductionPerMin[location][resource.id];
        const expense = state.locationConsumptionPerMin[location][resource.id];
        const net = income - expense;
        const showZeroRate = income === 0n && expense === 0n && this.hasResourceProductionSetup(state, location, resource.id);

        refs.value.textContent = formatNumber(stock);
        const capInfo = this.getResourceStockpileCap(location, resource.id);
        if (capInfo) {
          const atCap = stock >= capInfo.cap;
          refs.cap.textContent = atCap ? `/${capInfo.label}` : '';
          refs.value.style.color = atCap ? 'var(--accent-gold)' : '';
        } else {
          refs.cap.textContent = '';
          refs.value.style.color = '';
        }
        if (this.visibleLocations.length === 1) {
          if (income !== 0n || expense !== 0n || showZeroRate) {
            refs.rate.textContent = `+${formatNumber(income)} / -${formatNumber(expense)} /m`;
          } else {
            refs.rate.textContent = '';
          }
          refs.rate.style.color = net < 0n ? 'var(--accent-red)' : 'var(--text-muted)';
        } else {
          refs.rate.textContent = (net !== 0n || showZeroRate)
            ? `${net >= 0n ? '+' : ''}${formatNumber(net)}/m`
            : '';
          refs.rate.style.color = net < 0n ? 'var(--accent-red)' : 'var(--text-muted)';
        }

        if (resource.id === 'rockets') {
          const busy = this.getBusyRocketsForLocation(state, location);
          refs.busy.textContent = busy > 0n ? `Busy: ${formatNumber(busy)}` : '';
        } else {
          refs.busy.textContent = '';
        }
      }
    }

    for (const facility of FACILITY_ORDER) {
      this.updatePauseButton(facility.id);
      for (const location of this.visibleLocations) {
        const refs = this.facilityRefs.get(`${facility.id}:${location}`);
        if (!refs || !refs.buyGroup) continue;

        const owned = state.locationFacilities[location][facility.id];
        const ownedNum = Math.floor(fromBigInt(owned));
        const efficiency = state.locationFacilityRates[location][facility.id];
        const efficiencyPct = Math.max(0, Math.min(100, Math.round(efficiency * 100)));
        const limit = this.getFacilityLimit(location, facility.id);
        if (refs.efficiency) {
          if (efficiencyPct >= 100) {
            refs.efficiency.textContent = '';
            refs.efficiency.style.display = 'none';
          } else {
            refs.efficiency.textContent = `${efficiencyPct}%`;
            refs.efficiency.style.display = '';
            refs.efficiency.style.color = 'var(--accent-red)';
          }
        }
        refs.count.textContent = formatNumber(owned);

        refs.buyGroup.update(ownedNum, (amt) => canBuildFacility(this.state, location, facility.id, amt), (limit !== null && limit > 0) ? limit : null);
      }
    }
  }
}

