import type { GameState, FacilityId, LocationId } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatNumber, fromBigInt, toBigInt } from '../../game/utils.ts';
import { canBuildFacility, isFacilityUnlocked as isFacilityUnlockedForLocation } from '../../game/systems/SupplySystem.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';
import { createPanelScaffold } from '../components/PanelScaffold.ts';
import { emojiHtml, locationLabelHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { flashElement } from '../UIUtils.ts';

interface FacilityCellRefs {
  efficiency?: HTMLSpanElement;
  count: HTMLSpanElement;
  buyGroup?: BulkBuyGroup;
}

interface FacilityDef {
  id: FacilityId;
  shortLabel: string;
  longLabel: string;
}

const FACILITY_ORDER: FacilityDef[] = [
  { id: 'materialMine', shortLabel: 'Mines', longLabel: 'Material Mines' },
  { id: 'solarFactory', shortLabel: 'Solar Fab', longLabel: 'Solar Panel Factory' },
  { id: 'robotFactory', shortLabel: 'Robot Fab', longLabel: 'Robot Factory' },
  { id: 'gpuFactory', shortLabel: 'GPU Fab', longLabel: 'GPU Factory' },
  { id: 'rocketFactory', shortLabel: 'Rocket Fab', longLabel: 'Rocket Factory' },
  { id: 'gpuSatelliteFactory', shortLabel: 'Sat Fab', longLabel: 'GPU Satellite Factory' },
  { id: 'massDriver', shortLabel: 'Mass Driver', longLabel: 'Mass Driver' },
];

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

  private facilitiesSection!: HTMLDivElement;

  private layoutKey = '';
  private visibleLocations: LocationId[] = ['earth'];

  private facilityRefs = new Map<string, FacilityCellRefs>();
  private facilityPriceRefs = new Map<FacilityId, HTMLSpanElement>();
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
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    this.facilitiesSection = document.createElement('div');
    this.facilitiesSection.className = 'panel-section';
    this.facilitiesSection.style.gap = '2px';

    body.appendChild(this.facilitiesSection);
  }

  private getVisibleLocations(state: GameState): LocationId[] {
    if (state.completedResearch.includes('payloadToMercury')) return ['earth', 'moon', 'mercury'];
    if (state.completedResearch.includes('payloadToMoon')) return ['earth', 'moon'];
    return ['earth'];
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
    this.facilityRefs.clear();
    this.facilityPriceRefs.clear();
    this.facilityPauseBtns.clear();
    this.facilitiesSection.innerHTML = '';

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
      this.facilityPriceRefs.set(facility.id, meta);

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
          this.facilityRefs.set(key, { count: document.createElement('span') });
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
          if (ownedNum <= 0 || efficiencyPct >= 100) {
            refs.efficiency.textContent = '';
            refs.efficiency.style.display = 'none';
          } else {
            refs.efficiency.textContent = `${efficiencyPct}%`;
            refs.efficiency.style.display = '';
            refs.efficiency.style.color = 'var(--accent-red)';
          }
        }
        refs.count.textContent = formatNumber(owned);

        refs.buyGroup.update(
          ownedNum,
          (amt) => canBuildFacility(this.state, location, facility.id, amt),
          (limit !== null && limit > 0) ? limit : null,
          (amt) => {
            if (amt === 1) {
              const priceRef = this.facilityPriceRefs.get(facility.id);
              if (priceRef) {
                flashElement(priceRef);
                return;
              }
            }
            flashElement(refs.count);
          },
        );
      }
    }
  }
}

