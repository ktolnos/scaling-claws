import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE, getSolarPanelPowerMW } from '../../game/BalanceConfig.ts';
import { formatMW, formatNumber, toBigInt, mulB, fromBigInt, scaleBigInt } from '../../game/utils.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import { BulkBuyGroup, getVisibleBuyTiers } from '../components/BulkBuyGroup.ts';
import { CountBulkBuyControls } from '../components/CountBulkBuyControls.ts';
import { createPanelDivider, createPanelScaffold } from '../components/PanelScaffold.ts';
import { emojiHtml, moneyWithEmojiHtml, resourceLabelHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { flashElement } from '../UIUtils.ts';

interface PlantRowRefs {
  row: HTMLDivElement;
  count: HTMLSpanElement;
  production: HTMLSpanElement;
  buyGroup: BulkBuyGroup;
  buildLabel: HTMLSpanElement;
}

const POWER_PLANT_UNLOCK_GRID_KW = toBigInt(1_000_000);

type LogisticsRoute = 'earthOrbit' | 'earthMoon' | 'moonOrbit' | 'moonMercury' | 'mercurySun';

interface LogisticsRowRefs {
  row: HTMLDivElement;
  sent: HTMLSpanElement;
  inTransit: HTMLSpanElement;
  waiting: HTMLSpanElement;
  bulk?: BulkBuyGroup;
}

interface RouteLaneRefs {
  row: HTMLDivElement;
  lane: HTMLDivElement;
}

export class SpaceEnergyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;
  private panelHeaderEl!: HTMLDivElement;
  private earthEnergyTitleEl!: HTMLDivElement;

  // Earth energy
  private demandEl!: HTMLSpanElement;
  private supplyEl!: HTMLSpanElement;
  private throttleEl!: HTMLDivElement;
  private gridRow!: HTMLDivElement;
  private gridEl!: HTMLSpanElement;
  private gridCostEl!: HTMLSpanElement;
  private gridBuyGroup!: BulkBuyGroup;
  private gridSellGroup!: BulkBuyGroup;

  private gasRefs!: PlantRowRefs;
  private nuclearRefs!: PlantRowRefs;

  private earthSolarRow!: HTMLDivElement;
  private earthSolarLabelEl!: HTMLSpanElement;
  private earthSolarProductionEl!: HTMLSpanElement;
  private earthSolarStatusEl!: HTMLSpanElement;
  private earthSolarCostEl!: HTMLSpanElement;
  private earthSolarBulk!: BulkBuyGroup;

  // Orbit/logistics
  private logisticsSection!: HTMLDivElement;
  private orbitSatEl!: HTMLSpanElement;
  private orbitPowerEl!: HTMLSpanElement;
  private logisticsRows = new Map<string, LogisticsRowRefs>();
  private routeLanes = new Map<LogisticsRoute, RouteLaneRefs>();
  private readonly maxRocketsAddedPerUpdate = 4;

  // Moon installs
  private moonSection!: HTMLDivElement;
  private moonPowerSupplyEl!: HTMLSpanElement;
  private moonPowerDemandEl!: HTMLSpanElement;
  private moonSolarStatusEl!: HTMLSpanElement;
  private moonSolarCostEl!: HTMLSpanElement;
  private moonSolarBulk!: BulkBuyGroup;
  private moonGpuStatusEl!: HTMLSpanElement;
  private moonGpuCostEl!: HTMLSpanElement;
  private moonGpuBulk!: BulkBuyGroup;

  // Mercury
  private mercurySection!: HTMLDivElement;
  private mercurySwarmEl!: HTMLSpanElement;
  private mercurySwarmPowerEl!: HTMLSpanElement;
  private mercuryMinedEl!: HTMLSpanElement;
  private mercuryPieEl!: HTMLDivElement;
  private probeBtn!: HTMLButtonElement;

  constructor(state: GameState) {
    this.state = state;
    const { panel } = createPanelScaffold('SPACE & ENERGY', {
      panelClassName: 'panel space-energy-panel',
      bodyClassName: 'panel-body panel-body-tight',
    });
    this.el = panel;
    this.panelHeaderEl = this.el.querySelector('.panel-header') as HTMLDivElement;
    this.build();
  }

  private build(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    this.buildEarthEnergy(body);
    body.appendChild(createPanelDivider());
    this.buildLogistics(body);
    this.buildMoon(body);
    this.buildMercury(body);
  }

  private buildEarthEnergy(parent: HTMLElement): void {
    this.earthEnergyTitleEl = document.createElement('div');
    this.earthEnergyTitleEl.className = 'panel-section-title';
    this.earthEnergyTitleEl.innerHTML = 'EARTH ENERGY' // `${locationLabelHtml('earth')} ${resourceLabelHtml('energy', 'Energy')}`;
    parent.appendChild(this.earthEnergyTitleEl);

    const powerRow = document.createElement('div');
    powerRow.className = 'panel-row';
    const powerLabel = document.createElement('span');
    powerLabel.className = 'label';
    powerLabel.innerHTML = emojiHtml('energy');
    setHintTarget(powerLabel, 'resource.energy');
    powerRow.appendChild(powerLabel);

    const powerValues = document.createElement('div');
    powerValues.className = 'value';
    powerValues.innerHTML = 'Supply ';
    this.supplyEl = document.createElement('span');
    powerValues.appendChild(this.supplyEl);
    powerValues.insertAdjacentHTML('beforeend', ' / Demand ');
    this.demandEl = document.createElement('span');
    powerValues.appendChild(this.demandEl);
    powerRow.appendChild(powerValues);
    parent.appendChild(powerRow);

    // Grid
    this.gridRow = document.createElement('div');
    this.gridRow.className = 'panel-row';
    this.gridRow.style.display = 'none';

    const gridLabel = document.createElement('span');
    gridLabel.className = 'label';
    gridLabel.textContent = 'Grid Contract';
    setHintTarget(gridLabel, 'mechanic.gridPower');
    this.gridRow.appendChild(gridLabel);

    const gridControls = document.createElement('div');
    gridControls.style.display = 'flex';
    gridControls.style.alignItems = 'center';
    gridControls.style.gap = '4px';

    this.gridSellGroup = new BulkBuyGroup((amt) => {
      dispatchGameAction(this.state, { type: 'sellGridPower', amountKW: amt });
    }, '-');
    this.gridBuyGroup = new BulkBuyGroup((amt) => {
      dispatchGameAction(this.state, { type: 'buyGridPower', amountKW: amt });
    }, '+');

    this.gridEl = document.createElement('span');
    this.gridEl.className = 'value';
    this.gridEl.style.minWidth = '48px';
    this.gridEl.style.textAlign = 'center';

    gridControls.appendChild(this.gridSellGroup.el);
    gridControls.appendChild(this.gridEl);
    gridControls.appendChild(this.gridBuyGroup.el);

    const gridRight = document.createElement('div');
    gridRight.style.display = 'flex';
    gridRight.style.flexDirection = 'column';
    gridRight.style.alignItems = 'flex-end';
    gridRight.style.gap = '1px';

    this.gridCostEl = document.createElement('span');
    this.gridCostEl.style.fontSize = '0.62rem';
    this.gridCostEl.style.color = 'var(--text-muted)';

    gridRight.appendChild(gridControls);
    gridRight.appendChild(this.gridCostEl);
    this.gridRow.appendChild(gridRight);
    parent.appendChild(this.gridRow);

    this.gasRefs = this.buildPlantRow(parent, 'Gas Plants', BALANCE.powerPlants.gas.outputMW, (amt) => {
      dispatchGameAction(this.state, { type: 'buyGasPlant', amount: amt });
    }, 'infra.gasPlant');
    this.nuclearRefs = this.buildPlantRow(parent, 'Nuclear Plants', BALANCE.powerPlants.nuclear.outputMW, (amt) => {
      dispatchGameAction(this.state, { type: 'buyNuclearPlant', amount: amt });
    }, 'infra.nuclearPlant');

    this.earthSolarRow = document.createElement('div');
    this.earthSolarRow.className = 'panel-row';
    this.earthSolarRow.style.alignItems = 'center';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '1px';

    const top = document.createElement('div');
    top.style.display = 'flex';
    top.style.alignItems = 'baseline';
    top.style.gap = '6px';

    this.earthSolarLabelEl = document.createElement('span');
    this.earthSolarLabelEl.className = 'label';
    this.earthSolarLabelEl.textContent = 'Solar Panels Installation';
    setHintTarget(this.earthSolarLabelEl, 'infra.solarInstall');
    top.appendChild(this.earthSolarLabelEl);

    this.earthSolarProductionEl = document.createElement('span');
    this.earthSolarProductionEl.className = 'value';
    this.earthSolarProductionEl.style.fontSize = '0.72rem';
    this.earthSolarProductionEl.style.color = 'var(--text-secondary)';
    this.earthSolarProductionEl.style.whiteSpace = 'nowrap';
    top.appendChild(this.earthSolarProductionEl);

    this.earthSolarCostEl = document.createElement('span');

    left.appendChild(top);

    const sub = document.createElement('span');
    sub.style.fontSize = '0.64rem';
    sub.style.color = 'var(--text-muted)';
    this.earthSolarStatusEl = document.createElement('span');
    this.earthSolarStatusEl.style.fontSize = '0.64rem';
    this.earthSolarStatusEl.style.color = 'var(--text-muted)';
    sub.appendChild(this.earthSolarStatusEl);
    left.appendChild(sub);

    this.earthSolarRow.appendChild(left);

    this.earthSolarBulk = new BulkBuyGroup((amt) => {
      dispatchGameAction(this.state, { type: 'installSolarPanels', location: 'earth', amount: amt });
    }, '+');
    const earthSolarControls = document.createElement('div');
    earthSolarControls.style.display = 'flex';
    earthSolarControls.style.flexDirection = 'column';
    earthSolarControls.style.alignItems = 'flex-end';
    earthSolarControls.style.gap = '1px';
    earthSolarControls.appendChild(this.earthSolarBulk.el);

    const earthSolarActionLabel = document.createElement('span');
    earthSolarActionLabel.insertAdjacentHTML('beforeend', 'Install: ');
    earthSolarActionLabel.appendChild(this.earthSolarCostEl);
    earthSolarActionLabel.style.fontSize = '0.62rem';
    earthSolarActionLabel.style.color = 'var(--text-muted)';
    earthSolarControls.appendChild(earthSolarActionLabel);

    this.earthSolarRow.appendChild(earthSolarControls);

    parent.appendChild(this.earthSolarRow);

    // Keep this warning slot below all Earth power builders to reduce UI movement.
    this.throttleEl = document.createElement('div');
    this.throttleEl.className = 'warning-text earth-power-warning';
    this.throttleEl.style.visibility = 'hidden';
    this.throttleEl.textContent = '\u00a0';
    parent.appendChild(this.throttleEl);
  }

  private buildPlantRow(
    parent: HTMLElement,
    label: string,
    outputMW: bigint,
    buy: (amount: number) => void,
    hintId: string,
  ): PlantRowRefs {
    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.alignItems = 'center';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'baseline';
    left.style.gap = '6px';
    left.style.flex = '1';
    left.style.minWidth = '0';

    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = `${label} (${formatMW(outputMW).replace(' ', '')})`;
    setHintTarget(name, hintId);
    left.appendChild(name);

    const production = document.createElement('span');
    production.className = 'value';
    production.style.fontSize = '0.72rem';
    production.style.color = 'var(--text-secondary)';
    production.style.whiteSpace = 'nowrap';
    left.appendChild(production);

    row.appendChild(left);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.flexDirection = 'column';
    right.style.alignItems = 'flex-end';

    const buildLabel = document.createElement('span');
    buildLabel.style.fontSize = '0.62rem';
    buildLabel.style.color = 'var(--text-muted)';

    const controls = new CountBulkBuyControls((amt) => buy(amt), { prefix: '+' });
    right.appendChild(controls.el);
    right.appendChild(buildLabel);

    row.appendChild(right);
    parent.appendChild(row);

    return { row, count: controls.countEl, production, buyGroup: controls.bulk, buildLabel };
  }

  private buildLogistics(parent: HTMLElement): void {
    this.logisticsSection = document.createElement('div');
    this.logisticsSection.style.display = 'none';
    this.logisticsRows.clear();
    this.routeLanes.clear();

    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.innerHTML = 'SPACE LOGISTICS' // `${emojiHtml('rockets')} SPACE LOGISTICS`;
    this.logisticsSection.appendChild(title);

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
    orbitRow.appendChild(this.orbitSatEl);
    orbitRow.appendChild(this.orbitPowerEl);
    this.logisticsSection.appendChild(orbitRow);

    this.buildRouteLaneRow(this.logisticsSection, 'earthOrbit', 'earth', 'orbit');
    this.buildLogisticsRow(this.logisticsSection, resourceLabelHtml('gpuSatellites'), 'GPU Satellites', 'earthOrbit:gpuSatellites', (amt) => {
      dispatchGameAction(this.state, { type: 'schedulePayload', route: 'earthOrbit', payload: 'gpuSatellites', amount: amt });
    }, true, 'resource.gpuSatellites');

    this.buildRouteLaneRow(this.logisticsSection, 'earthMoon', 'earth', 'moon');
    this.buildLogisticsRow(this.logisticsSection, resourceLabelHtml('gpus'), 'GPUs', 'earthMoon:gpus', (amt) => {
      dispatchGameAction(this.state, { type: 'schedulePayload', route: 'earthMoon', payload: 'gpus', amount: amt });
    }, true, 'resource.gpus');
    this.buildLogisticsRow(this.logisticsSection, resourceLabelHtml('solarPanels'), 'Solar Panels', 'earthMoon:solarPanels', (amt) => {
      dispatchGameAction(this.state, { type: 'schedulePayload', route: 'earthMoon', payload: 'solarPanels', amount: amt });
    }, true, 'resource.solarPanels');
    this.buildLogisticsRow(this.logisticsSection, resourceLabelHtml('robots'), 'Robots', 'earthMoon:robots', (amt) => {
      dispatchGameAction(this.state, { type: 'schedulePayload', route: 'earthMoon', payload: 'robots', amount: amt });
    }, true, 'resource.robots');

    this.buildRouteLaneRow(this.logisticsSection, 'moonOrbit', 'moon', 'orbit');
    this.buildLogisticsRow(this.logisticsSection, resourceLabelHtml('gpuSatellites'), 'GPU Satellites', 'moonOrbit:gpuSatellites', (amt) => {
      dispatchGameAction(this.state, { type: 'schedulePayload', route: 'moonOrbit', payload: 'gpuSatellites', amount: amt });
    }, true, 'resource.gpuSatellites');

    this.buildRouteLaneRow(this.logisticsSection, 'moonMercury', 'moon', 'mercury');
    this.buildLogisticsRow(this.logisticsSection, resourceLabelHtml('robots'), 'Robots', 'moonMercury:robots', (amt) => {
      dispatchGameAction(this.state, { type: 'schedulePayload', route: 'moonMercury', payload: 'robots', amount: amt });
    }, true, 'resource.robots');

    this.buildRouteLaneRow(this.logisticsSection, 'mercurySun', 'mercury', 'sun');
    this.buildLogisticsRow(this.logisticsSection, resourceLabelHtml('gpuSatellites'), 'GPU Satellites', 'mercurySun:gpuSatellites', (amt) => {
      dispatchGameAction(this.state, { type: 'schedulePayload', route: 'mercurySun', payload: 'gpuSatellites', amount: amt });
    }, false, 'resource.gpuSatellites');

    parent.appendChild(this.logisticsSection);
  }

  private buildRouteLaneRow(
    parent: HTMLElement,
    route: LogisticsRoute,
    source: 'earth' | 'moon' | 'mercury',
    destination: 'moon' | 'mercury' | 'orbit' | 'sun',
  ): void {
    const row = document.createElement('div');
    row.className = 'panel-row logistics-route-row';

    const sourceEnd = document.createElement('span');
    sourceEnd.className = 'logistics-route-end';
    sourceEnd.innerHTML = `${source === 'earth' ? 'Earth' : source === 'moon' ? 'Moon' : 'Mercury'} ${emojiHtml(source)}`;

    const lane = document.createElement('div');
    lane.className = 'logistics-lane';

    const destinationEnd = document.createElement('span');
    destinationEnd.className = 'logistics-route-end';
    destinationEnd.innerHTML = destination === 'sun'
      ? '☀ Sun'
      : `${emojiHtml(destination)}${destination === 'moon' ? 'Moon' : destination === 'mercury' ? 'Mercury' : 'Orbit'}`;

    row.appendChild(sourceEnd);
    row.appendChild(lane);
    row.appendChild(destinationEnd);

    parent.appendChild(row);
    this.routeLanes.set(route, { row, lane });
  }

  private buildLogisticsRow(
    parent: HTMLElement,
    labelHtml: string,
    labelTitle: string,
    key: string,
    act: (amt: number) => void,
    withBulk: boolean = true,
    hintId?: string,
  ): void {
    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.alignItems = 'center';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '8px';
    left.style.flex = '1';
    left.style.minWidth = '0';

    const lbl = document.createElement('span');
    lbl.className = 'label';
    lbl.style.fontSize = '0.72rem';
    lbl.style.whiteSpace = 'nowrap';
    lbl.style.overflow = 'hidden';
    lbl.style.textOverflow = 'ellipsis';
    lbl.title = labelTitle;
    lbl.innerHTML = labelHtml;
    if (hintId) setHintTarget(lbl, hintId);

    const stat = document.createElement('span');
    stat.style.fontSize = '0.64rem';
    stat.style.color = 'var(--text-muted)';
    stat.style.whiteSpace = 'nowrap';
    stat.title = 'Sent from source, currently in transit, and waiting for rockets';
    const sent = document.createElement('span');
    const inTransit = document.createElement('span');
    const waiting = document.createElement('span');
    stat.appendChild(document.createTextNode('Sent '));
    stat.appendChild(sent);
    stat.appendChild(document.createTextNode(' | Shipping '));
    stat.appendChild(inTransit);
    stat.appendChild(document.createTextNode(' | Waiting '));
    stat.appendChild(waiting);

    left.appendChild(lbl);
    left.appendChild(stat);

    row.appendChild(left);

    let bulk: BulkBuyGroup | undefined;
    if (withBulk) {
      bulk = new BulkBuyGroup((amt) => act(amt), '+');
      row.appendChild(bulk.el);
    }

    parent.appendChild(row);
    this.logisticsRows.set(key, { row, sent, inTransit, waiting, bulk });
  }

  private getLogisticsRocketCount(inTransit: bigint): number {
    if (inTransit <= 0n) return 0;
    if (inTransit >= scaleBigInt(100n)) return 100;
    return Math.max(1, Math.floor(fromBigInt(inTransit)));
  }

  private getRouteTransitMs(route: LogisticsRoute): number {
    if (route === 'earthOrbit' || route === 'mercurySun') return BALANCE.routeEarthOrbitTransitMs;
    if (route === 'moonOrbit') return BALANCE.routeEarthMoonTransitMs;
    if (route === 'earthMoon') return BALANCE.routeEarthMoonTransitMs;
    return BALANCE.routeMoonMercuryTransitMs;
  }

  private getRouteReturnMs(route: LogisticsRoute): number {
    if (route === 'moonOrbit' || route === 'moonMercury' || route === 'mercurySun') return BALANCE.moonRocketReturnMs;
    return BALANCE.earthRocketReturnMs;
  }

  private createLaneRocket(direction: 'outbound' | 'returning', durationMs: number): HTMLSpanElement {
    const rocket = document.createElement('span');
    rocket.className = `logistics-rocket logistics-rocket-${direction}`;
    rocket.textContent = '🚀';
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
    route: LogisticsRoute,
    lane: HTMLDivElement,
    outboundTarget: number,
    returningTarget: number,
  ): void {
    const roundtripTarget = Math.min(outboundTarget, returningTarget);
    const outboundOnlyTarget = Math.max(0, outboundTarget - roundtripTarget);
    const transitMs = this.getRouteTransitMs(route);
    const returnMs = this.getRouteReturnMs(route);

    this.syncModeRockets(
      lane,
      'outboundOnly',
      transitMs,
      returnMs,
      outboundOnlyTarget,
    );
    this.syncModeRockets(
      lane,
      'roundtrip',
      transitMs,
      returnMs,
      roundtripTarget,
    );
  }

  private buildMoon(parent: HTMLElement): void {
    this.moonSection = document.createElement('div');
    this.moonSection.style.display = 'none';
    this.moonSection.appendChild(createPanelDivider());

    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.innerHTML = 'MOON' // `${locationLabelHtml('moon')} Installation`;
    this.moonSection.appendChild(title);

    const powerRow = document.createElement('div');
    powerRow.className = 'panel-row';

    const powerLabel = document.createElement('span');
    powerLabel.className = 'label';
    powerLabel.innerHTML = emojiHtml('energy');
    setHintTarget(powerLabel, 'resource.energy');
    powerRow.appendChild(powerLabel);

    const powerValues = document.createElement('span');
    powerValues.className = 'value';
    powerValues.style.marginLeft = 'auto';
    powerValues.style.textAlign = 'right';
    powerValues.innerHTML = 'Supply ';
    this.moonPowerSupplyEl = document.createElement('span');
    powerValues.appendChild(this.moonPowerSupplyEl);
    powerValues.insertAdjacentHTML('beforeend', ' / Demand ');
    this.moonPowerDemandEl = document.createElement('span');
    powerValues.appendChild(this.moonPowerDemandEl);
    powerRow.appendChild(powerValues);

    this.moonSection.appendChild(powerRow);

    const solarBlock = document.createElement('div');
    solarBlock.style.display = 'flex';
    solarBlock.style.flexDirection = 'column';
    solarBlock.style.gap = '1px';
    solarBlock.style.marginTop = '0';

    const solarTop = document.createElement('div');
    solarTop.className = 'panel-row';
    solarTop.style.minHeight = '18px';
    solarTop.style.gap = '6px';

    const solarLbl = document.createElement('span');
    solarLbl.className = 'label';
    solarLbl.textContent = 'Moon Solar';
    setHintTarget(solarLbl, 'infra.solarInstall');
    solarLbl.style.whiteSpace = 'nowrap';
    solarTop.appendChild(solarLbl);

    const solarTopCost = document.createElement('span');
    solarTopCost.style.fontSize = '0.66rem';
    solarTopCost.style.color = 'var(--text-secondary)';
    solarTopCost.style.marginLeft = 'auto';
    this.moonSolarCostEl = document.createElement('span');
    solarTopCost.insertAdjacentHTML('beforeend', 'Cost: ');
    solarTopCost.appendChild(this.moonSolarCostEl);
    solarTop.appendChild(solarTopCost);

    const solarBottom = document.createElement('div');
    solarBottom.className = 'panel-row';
    solarBottom.style.minHeight = '19px';
    solarBottom.style.gap = '6px';

    const solarMeta = document.createElement('span');
    solarMeta.style.fontSize = '0.68rem';
    solarMeta.style.color = 'var(--text-secondary)';
    this.moonSolarStatusEl = document.createElement('span');
    this.moonSolarStatusEl.style.fontSize = '0.68rem';
    this.moonSolarStatusEl.style.color = 'var(--text-secondary)';
    this.moonSolarStatusEl.style.whiteSpace = 'nowrap';
    solarMeta.appendChild(this.moonSolarStatusEl);
    solarBottom.appendChild(solarMeta);

    this.moonSolarBulk = new BulkBuyGroup((amt) => {
      dispatchGameAction(this.state, { type: 'installSolarPanels', location: 'moon', amount: amt });
    }, '+');
    solarBottom.appendChild(this.moonSolarBulk.el);

    solarBlock.appendChild(solarTop);
    solarBlock.appendChild(solarBottom);
    this.moonSection.appendChild(solarBlock);

    const gpuBlock = document.createElement('div');
    gpuBlock.style.display = 'flex';
    gpuBlock.style.flexDirection = 'column';
    gpuBlock.style.gap = '1px';

    const gpuTop = document.createElement('div');
    gpuTop.className = 'panel-row';
    gpuTop.style.minHeight = '18px';
    gpuTop.style.gap = '6px';

    const gpuTitle = document.createElement('div');
    gpuTitle.style.display = 'flex';
    gpuTitle.style.alignItems = 'center';
    gpuTitle.style.gap = '5px';
    gpuTitle.style.minWidth = '0';

    const gpuLbl = document.createElement('span');
    gpuLbl.className = 'label';
    gpuLbl.textContent = 'Moon GPUs';
    setHintTarget(gpuLbl, 'resource.gpus');
    gpuLbl.style.whiteSpace = 'nowrap';
    gpuTitle.appendChild(gpuLbl);
    gpuTop.appendChild(gpuTitle);

    const gpuTopCost = document.createElement('span');
    gpuTopCost.style.fontSize = '0.66rem';
    gpuTopCost.style.color = 'var(--text-secondary)';
    gpuTopCost.style.marginLeft = 'auto';
    this.moonGpuCostEl = document.createElement('span');
    gpuTopCost.insertAdjacentHTML('beforeend', 'Cost: ');
    gpuTopCost.appendChild(this.moonGpuCostEl);
    gpuTop.appendChild(gpuTopCost);

    const gpuBottom = document.createElement('div');
    gpuBottom.className = 'panel-row';
    gpuBottom.style.minHeight = '19px';
    gpuBottom.style.gap = '6px';

    const gpuMeta = document.createElement('span');
    gpuMeta.style.fontSize = '0.68rem';
    gpuMeta.style.color = 'var(--text-secondary)';
    this.moonGpuStatusEl = document.createElement('span');
    this.moonGpuStatusEl.style.fontSize = '0.68rem';
    this.moonGpuStatusEl.style.color = 'var(--text-secondary)';
    this.moonGpuStatusEl.style.whiteSpace = 'nowrap';
    gpuMeta.appendChild(this.moonGpuStatusEl);
    gpuBottom.appendChild(gpuMeta);

    this.moonGpuBulk = new BulkBuyGroup((amt) => {
      dispatchGameAction(this.state, { type: 'installMoonGpus', amount: amt });
    }, '+');
    gpuBottom.appendChild(this.moonGpuBulk.el);

    gpuBlock.appendChild(gpuTop);
    gpuBlock.appendChild(gpuBottom);
    this.moonSection.appendChild(gpuBlock);

    parent.appendChild(this.moonSection);
  }

  private buildMercury(parent: HTMLElement): void {
    this.mercurySection = document.createElement('div');
    this.mercurySection.style.display = 'none';
    this.mercurySection.appendChild(createPanelDivider());

    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.innerHTML =  'MERCURY' // locationLabelHtml('mercury');
    this.mercurySection.appendChild(title);

    const overview = document.createElement('div');
    overview.className = 'mercury-overview';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'mercury-overview-icon';
    iconWrap.innerHTML = `<span class="mercury-overview-emoji">${emojiHtml('mercury')}</span>`;
    this.mercuryPieEl = document.createElement('div');
    this.mercuryPieEl.className = 'mercury-overview-pie';
    iconWrap.appendChild(this.mercuryPieEl);
    overview.appendChild(iconWrap);

    const textWrap = document.createElement('div');
    textWrap.className = 'mercury-overview-text';

    const swarmRow = document.createElement('div');
    swarmRow.className = 'panel-row mercury-overview-row';
    this.mercurySwarmEl = document.createElement('span');
    this.mercurySwarmEl.className = 'label';
    this.mercurySwarmPowerEl = document.createElement('span');
    this.mercurySwarmPowerEl.className = 'value';
    swarmRow.appendChild(this.mercurySwarmEl);
    swarmRow.appendChild(this.mercurySwarmPowerEl);
    textWrap.appendChild(swarmRow);

    const minedRow = document.createElement('div');
    minedRow.className = 'mercury-mined-row';
    this.mercuryMinedEl = document.createElement('span');
    this.mercuryMinedEl.className = 'value';
    minedRow.appendChild(this.mercuryMinedEl);
    textWrap.appendChild(minedRow);

    overview.appendChild(textWrap);
    this.mercurySection.appendChild(overview);

    this.probeBtn = document.createElement('button');
    this.probeBtn.textContent = 'Launch Von Neumann Probe';
    this.probeBtn.addEventListener('click', () => {
      dispatchGameAction(this.state, { type: 'launchVonNeumannProbe' });
    });
    this.probeBtn.style.marginTop = '2px';
    this.mercurySection.appendChild(this.probeBtn);

    parent.appendChild(this.mercurySection);
  }

  private updatePlant(
    refs: PlantRowRefs,
    count: bigint,
    outputMW: bigint,
    cost: bigint,
    labor: bigint,
    canBuy: (amt: number) => boolean,
    maxCount: number | null = null,
  ): void {
    const owned = Math.floor(fromBigInt(count));
    const visibleTiers = getVisibleBuyTiers(owned, maxCount);
    const smallestTier = visibleTiers[0] ?? 0;
    const tierScale = toBigInt(smallestTier);
    const fundsNeeded = smallestTier > 0 ? mulB(tierScale, cost) : 0n;
    const laborNeeded = smallestTier > 0 ? mulB(tierScale, labor) : 0n;
    const fundsMet = this.state.funds >= fundsNeeded;
    const laborMet = this.state.locationResources.earth.labor >= laborNeeded;
    const moneyColor = fundsMet ? 'var(--text-muted)' : 'var(--accent-red)';
    const laborColor = laborMet ? 'var(--text-muted)' : 'var(--accent-red)';

    refs.count.textContent = `x${formatNumber(count)}`;
    refs.production.textContent = formatMW(mulB(count, outputMW));
    refs.buildLabel.innerHTML =
      `<span style="color:${moneyColor}">${moneyWithEmojiHtml(cost, 'money')}</span>` +
      ` + ` +
      `<span style="color:${laborColor}">${formatNumber(labor)} ${emojiHtml('labor')} labor</span>`;
    refs.buyGroup.update(owned, canBuy, maxCount, () => {
      flashElement(refs.buildLabel);
    });
  }

  update(state: GameState): void {
    this.state = state;

    if (!state.isPostGpuTransition) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = '';

    const spaceUnlocked = state.spaceUnlocked || state.completedResearch.includes('rocketry');
    this.panelHeaderEl.textContent = spaceUnlocked ? 'SPACE & ENERGY' : 'ENERGY';
    this.earthEnergyTitleEl.style.display = spaceUnlocked ? '' : 'none';

    this.demandEl.textContent = formatMW(state.powerDemandMW);
    this.supplyEl.textContent = formatMW(state.powerSupplyMW);
    this.supplyEl.style.color = state.powerSupplyMW >= state.powerDemandMW ? 'var(--accent-green)' : 'var(--accent-red)';

    // Grid
    this.gridRow.style.display = '';
    this.gridEl.textContent = formatMW(state.gridPowerKW / 1000n);
    const gridOwned = Math.floor(fromBigInt(state.gridPowerKW));
    const visibleGridTiers = getVisibleBuyTiers(gridOwned, BALANCE.gridPowerKWLimit);
    const smallestGridTier = visibleGridTiers[0] ?? 0;
    const gridCostNeeded = smallestGridTier > 0
      ? mulB(toBigInt(smallestGridTier), toBigInt(BALANCE.gridPowerKWCost))
      : 0n;
    const gridCostColor = state.funds >= gridCostNeeded ? 'var(--text-muted)' : 'var(--accent-red)';
    this.gridCostEl.innerHTML = `Cost: <span style="color:${gridCostColor}">${moneyWithEmojiHtml(toBigInt(BALANCE.gridPowerKWCost), 'money')}</span>/kW`;
    this.gridBuyGroup.update(
      gridOwned,
      (amt) => state.funds >= mulB(toBigInt(amt), toBigInt(BALANCE.gridPowerKWCost)),
      BALANCE.gridPowerKWLimit,
      () => {
        flashElement(this.gridEl);
      },
    );
    this.gridSellGroup.update(gridOwned, (amt) => gridOwned >= amt, null, () => {
      flashElement(this.gridEl);
    });

    const powerPlantsUnlocked = state.gridPowerKW >= POWER_PLANT_UNLOCK_GRID_KW;
    this.gasRefs.row.style.display = powerPlantsUnlocked ? '' : 'none';
    this.nuclearRefs.row.style.display = powerPlantsUnlocked ? '' : 'none';

    if (powerPlantsUnlocked) {
      this.updatePlant(
        this.gasRefs,
        state.gasPlants,
        BALANCE.powerPlants.gas.outputMW,
        BALANCE.powerPlants.gas.cost,
        BALANCE.powerPlants.gas.laborCost,
        (amt) => {
          return state.funds >= mulB(toBigInt(amt), BALANCE.powerPlants.gas.cost) && state.locationResources.earth.labor >= mulB(toBigInt(amt), BALANCE.powerPlants.gas.laborCost);
        },
        BALANCE.powerPlants.gas.limit ?? null,
      );

      this.updatePlant(
        this.nuclearRefs,
        state.nuclearPlants,
        BALANCE.powerPlants.nuclear.outputMW,
        BALANCE.powerPlants.nuclear.cost,
        BALANCE.powerPlants.nuclear.laborCost,
        (amt) => {
          return state.funds >= mulB(toBigInt(amt), BALANCE.powerPlants.nuclear.cost) && state.locationResources.earth.labor >= mulB(toBigInt(amt), BALANCE.powerPlants.nuclear.laborCost);
        },
        BALANCE.powerPlants.nuclear.limit ?? null,
      );
    }

    // Earth solar install
    const earthSolarUnlocked = state.completedResearch.includes('solarTechnology');
    this.earthSolarRow.style.display = earthSolarUnlocked ? '' : 'none';
    const earth = state.locationResources.earth;
    const earthSolarProduction = mulB(earth.installedSolarPanels, toBigInt(getSolarPanelPowerMW('earth', state.completedResearch)));
    this.earthSolarLabelEl.textContent = 'Solar Panels';
    this.earthSolarProductionEl.textContent = formatMW(earthSolarProduction);
    this.earthSolarStatusEl.innerHTML =
      `Stock ${formatNumber(earth.solarPanels)} | Installed ${formatNumber(earth.installedSolarPanels)}`;
    const earthLaborOk = earth.labor >= BALANCE.earthSolarInstallLaborCost;
    const earthSolarOk = earth.solarPanels >= toBigInt(1);
    this.earthSolarCostEl.innerHTML =
      `<span style="color:${earthLaborOk ? 'var(--text-muted)' : 'var(--accent-red)'}">${formatNumber(BALANCE.earthSolarInstallLaborCost)} ${emojiHtml('labor')} labor</span>` +
      ` + ` +
      `<span style="color:${earthSolarOk ? 'var(--text-muted)' : 'var(--accent-red)'}">1 ${emojiHtml('solarPanels')} solar</span>`;
    this.earthSolarBulk.update(Math.floor(fromBigInt(earth.installedSolarPanels)), (amt) => {
      const a = toBigInt(amt);
      const laborCost = mulB(a, BALANCE.earthSolarInstallLaborCost);
      return earth.solarPanels >= a && earth.labor >= laborCost;
    }, Math.floor(fromBigInt(BALANCE.earthSolarInstallLimit)), () => {
      flashElement(this.earthSolarStatusEl);
    });

    const gasLimit = BALANCE.powerPlants.gas.limit ?? 0;
    const nuclearLimit = BALANCE.powerPlants.nuclear.limit ?? 0;
    const gasAtLimit = gasLimit > 0 && state.gasPlants >= toBigInt(gasLimit);
    const nuclearAtLimit = nuclearLimit > 0 && state.nuclearPlants >= toBigInt(nuclearLimit);
    const solarAtLimit = !earthSolarUnlocked || earth.installedSolarPanels >= BALANCE.earthSolarInstallLimit;
    const gridAtLimit = state.gridPowerKW >= toBigInt(BALANCE.gridPowerKWLimit);
    const allEarthPowerOptionsMaxed = gasAtLimit && nuclearAtLimit && solarAtLimit && gridAtLimit;
    const showThrottleWarning = state.powerThrottle < 1 && !allEarthPowerOptionsMaxed;

    if (showThrottleWarning) {
      this.throttleEl.style.visibility = 'visible';
      this.throttleEl.innerHTML = `${emojiHtml('gpus')} GPUs throttled to ${Math.round(state.powerThrottle * 100)}% - add ${resourceLabelHtml('energy', 'power')}`;
    } else {
      this.throttleEl.style.visibility = 'hidden';
      this.throttleEl.textContent = '\u00a0';
    }

    const logisticsUnlocked = state.completedResearch.includes('rocketry');
    this.logisticsSection.style.display = logisticsUnlocked ? '' : 'none';

    // Orbit
    this.orbitSatEl.innerHTML = `${resourceLabelHtml('gpuSatellites', 'GPU Sats in Orbit')}: ${formatNumber(state.satellites)}`;
    this.orbitPowerEl.innerHTML = `${resourceLabelHtml('energy', 'Power')} ${formatMW(state.orbitalPowerMW)}`;

    const logisticsConfigs: Array<{ key: string; route: LogisticsRoute; source: bigint; enabled: boolean }> = [
      { key: 'earthOrbit:gpuSatellites', route: 'earthOrbit', source: state.locationResources.earth.gpuSatellites, enabled: state.completedResearch.includes('rocketry') },
      { key: 'earthMoon:gpus', route: 'earthMoon', source: state.locationResources.earth.gpus, enabled: state.completedResearch.includes('payloadToMoon') },
      { key: 'earthMoon:solarPanels', route: 'earthMoon', source: state.locationResources.earth.solarPanels, enabled: state.completedResearch.includes('payloadToMoon') },
      { key: 'earthMoon:robots', route: 'earthMoon', source: state.locationResources.earth.robots, enabled: state.completedResearch.includes('payloadToMoon') },
      { key: 'moonOrbit:gpuSatellites', route: 'moonOrbit', source: state.locationResources.moon.gpuSatellites, enabled: state.completedResearch.includes('rocketry') && state.completedResearch.includes('payloadToMoon') },
      { key: 'moonMercury:robots', route: 'moonMercury', source: state.locationResources.moon.robots, enabled: state.completedResearch.includes('payloadToMercury') },
      { key: 'mercurySun:gpuSatellites', route: 'mercurySun', source: state.locationResources.mercury.gpuSatellites, enabled: state.completedResearch.includes('payloadToMercury') },
    ];

    const routeTotals: Record<LogisticsRoute, { enabled: boolean; inTransit: bigint; queued: bigint }> = {
      earthOrbit: { enabled: false, inTransit: 0n, queued: 0n },
      earthMoon: { enabled: false, inTransit: 0n, queued: 0n },
      moonOrbit: { enabled: false, inTransit: 0n, queued: 0n },
      moonMercury: { enabled: false, inTransit: 0n, queued: 0n },
      mercurySun: { enabled: false, inTransit: 0n, queued: 0n },
    };

    for (const config of logisticsConfigs) {
      const refs = this.logisticsRows.get(config.key);
      if (!refs) continue;
      refs.row.style.display = config.enabled ? '' : 'none';
      if (!config.enabled) continue;

      const sent = state.logisticsSent[config.key] || 0n;
      const inTransit = state.logisticsInTransit[config.key] || 0n;
      const queued = state.logisticsOrders[config.key] || 0n;
      refs.sent.textContent = formatNumber(sent);
      refs.inTransit.textContent = formatNumber(inTransit);
      refs.waiting.textContent = formatNumber(queued);
      refs.waiting.style.color = queued > inTransit ? 'var(--accent-red)' : '';
      routeTotals[config.route].enabled = true;
      routeTotals[config.route].inTransit += inTransit;
      routeTotals[config.route].queued += queued;

      if (refs.bulk) {
        refs.bulk.update(
          Math.floor(fromBigInt(sent)),
          (amt) => config.enabled && config.source >= toBigInt(amt),
          null,
          () => {
            flashElement(refs.waiting);
          },
        );
        refs.bulk.el.style.opacity = config.enabled ? '1' : '0.45';
      }
    }

    const recoveryUnlocked = state.rocketLossPct < BALANCE.rocketLossNoReuse;
    const recoveredPct = Math.max(0, 1 - state.rocketLossPct);

    for (const [route, refs] of this.routeLanes) {
      const totals = routeTotals[route];
      refs.row.style.display = totals.enabled ? '' : 'none';
      if (!totals.enabled) {
        refs.lane.classList.remove('logistics-lane-congested');
        refs.lane.replaceChildren();
        continue;
      }

      refs.lane.classList.toggle('logistics-lane-congested', totals.queued > totals.inTransit);
      const outboundCount = this.getLogisticsRocketCount(totals.inTransit);
      const returningCount = recoveryUnlocked ? Math.min(100, Math.floor(outboundCount * recoveredPct)) : 0;
      this.syncLogisticsRockets(route, refs.lane, outboundCount, returningCount);
    }

    // Moon installation
    const moonUnlocked = state.completedResearch.includes('payloadToMoon');
    this.moonSection.style.display = moonUnlocked ? '' : 'none';
    if (moonUnlocked) {
      const moon = state.locationResources.moon;
      this.moonPowerSupplyEl.textContent = formatMW(state.lunarPowerSupplyMW);
      this.moonPowerDemandEl.textContent = formatMW(state.lunarPowerDemandMW);
      this.moonPowerSupplyEl.style.color = state.lunarPowerSupplyMW >= state.lunarPowerDemandMW ? 'var(--accent-green)' : 'var(--accent-red)';
      const moonEffPct = Math.round(state.lunarPowerThrottle * 100);

      const moonSolarProduction = mulB(moon.installedSolarPanels, toBigInt(getSolarPanelPowerMW('moon', state.completedResearch)));
      this.moonSolarStatusEl.innerHTML =
        `Stock ${formatNumber(moon.solarPanels)} | Installed ${formatNumber(moon.installedSolarPanels)} | ${formatMW(moonSolarProduction)}`;
      const moonSolarLaborOk = moon.labor >= BALANCE.moonSolarInstallLaborCost;
      const moonSolarUnitOk = moon.solarPanels >= toBigInt(1);
      this.moonSolarCostEl.innerHTML =
        `<span style="color:${moonSolarLaborOk ? 'var(--text-secondary)' : 'var(--accent-red)'}">${formatNumber(BALANCE.moonSolarInstallLaborCost)} ${emojiHtml('labor')} labor</span>` +
        ` + ` +
        `<span style="color:${moonSolarUnitOk ? 'var(--text-secondary)' : 'var(--accent-red)'}">1 ${emojiHtml('solarPanels')} solar</span>`;
      this.moonSolarBulk.update(Math.floor(fromBigInt(moon.installedSolarPanels)), (amt) => {
        const a = toBigInt(amt);
        const laborCost = mulB(a, BALANCE.moonSolarInstallLaborCost);
        return moon.solarPanels >= a && moon.labor >= laborCost;
      }, Math.floor(fromBigInt(BALANCE.moonSolarInstallLimit)), () => {
        flashElement(this.moonSolarStatusEl);
      });

      const moonEffColor = moonEffPct === 100 ? 'var(--text-primary)' : 'var(--accent-red)';
      this.moonGpuStatusEl.innerHTML =
        `Stock ${formatNumber(moon.gpus)} | Installed ${formatNumber(moon.installedGpus)} | ` +
        `${resourceLabelHtml('efficiency', 'Efficiency')} <span style="color:${moonEffColor}">${moonEffPct}%</span>`;
      const moonGpuLaborOk = moon.labor >= BALANCE.moonGpuInstallLaborCost;
      const moonGpuUnitOk = moon.gpus >= toBigInt(1);
      this.moonGpuCostEl.innerHTML =
        `<span style="color:${moonGpuLaborOk ? 'var(--text-secondary)' : 'var(--accent-red)'}">${formatNumber(BALANCE.moonGpuInstallLaborCost)} ${emojiHtml('labor')} labor</span>` +
        ` + ` +
        `<span style="color:${moonGpuUnitOk ? 'var(--text-secondary)' : 'var(--accent-red)'}">1 ${emojiHtml('gpus')} GPU</span>`;
      this.moonGpuBulk.update(Math.floor(fromBigInt(moon.installedGpus)), (amt) => {
        const a = toBigInt(amt);
        const laborCost = mulB(a, BALANCE.moonGpuInstallLaborCost);
        return moon.gpus >= a && moon.labor >= laborCost;
      }, Math.floor(fromBigInt(BALANCE.moonGpuInstallLimit)), () => {
        flashElement(this.moonGpuStatusEl);
      });
    }

    // Mercury and endgame
    const mercuryUnlocked = state.completedResearch.includes('payloadToMercury');
    this.mercurySection.style.display = mercuryUnlocked ? '' : 'none';
    if (mercuryUnlocked) {
      const mined = state.mercuryMassMined;
      const total = state.mercuryMassTotal > 0n ? state.mercuryMassTotal : BALANCE.mercuryBaseMassTotal;
      const minedPctRaw = total > 0n ? (Number(mined) / Number(total)) * 100 : 0;
      const minedPct = Math.max(0, Math.min(100, minedPctRaw));

      const mercuryMatRate = state.locationProductionPerMin.mercury.material - state.locationConsumptionPerMin.mercury.material;
      this.mercurySwarmEl.innerHTML = `${resourceLabelHtml('gpuSatellites', 'Dyson Swarm')}: ${formatNumber(state.dysonSwarmSatellites)}`;
      this.mercurySwarmPowerEl.innerHTML = `${resourceLabelHtml('energy', 'Power')} ${formatMW(state.dysonSwarmPowerMW)}`;
      const minedPctText = minedPct >= 1 ? (Math.round(minedPct * 10) / 10).toString() : minedPct >= 0.01 ? minedPct.toFixed(2) : minedPct.toFixed(3);
      const rateAbs = mercuryMatRate >= 0n ? mercuryMatRate : -mercuryMatRate;
      const rateSign = mercuryMatRate >= 0n ? '+' : '-';
      const rateColor = mercuryMatRate >= 0n ? 'var(--accent-green)' : 'var(--accent-red)';
      this.mercuryMinedEl.innerHTML =
        `Mined ${formatNumber(mined)}/${formatNumber(total)} (${minedPctText}%) ` +
        `<span style="color:${rateColor}">${rateSign}${formatNumber(rateAbs)}/m</span>`;
      this.mercuryPieEl.style.background = `conic-gradient(var(--bg-panel) 0 ${minedPct.toFixed(3)}%, transparent ${minedPct.toFixed(3)}% 100%)`;

      const hasProbeTech = state.completedResearch.includes('vonNeumannProbes');
      this.probeBtn.style.display = hasProbeTech ? '' : 'none';
      this.probeBtn.disabled = !hasProbeTech || state.gameWon;
      if (state.gameWon) {
        this.probeBtn.textContent = 'Probe Launched';
      } else {
        this.probeBtn.textContent = 'Launch Von Neumann Probe';
      }
    }
  }
}
