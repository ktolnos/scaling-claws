import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber, fromBigInt, mulB } from '../../game/utils.ts';
import {
  buyLithoMachine, buyWafers, buySilicon, buildFab,
  buildSiliconMine, buildRobotFactory, buyRobot,
} from '../../game/systems/SupplySystem.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';

export class SupplyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  // GPU Production
  private lithoBuyGroup!: BulkBuyGroup;
  private lithoInfoEl!: HTMLSpanElement;
  private lithoRateEl!: HTMLSpanElement;
  private lithoPriceEl!: HTMLSpanElement;

  private siliconBuyGroup!: BulkBuyGroup;
  private siliconInfoEl!: HTMLSpanElement;
  private siliconRateEl!: HTMLSpanElement;
  private siliconPriceEl!: HTMLSpanElement;

  private waferBuyGroup!: BulkBuyGroup;
  private waferInfoEl!: HTMLSpanElement;
  private waferRateEl!: HTMLSpanElement;
  private waferPriceEl!: HTMLSpanElement;
  
  private gpuOutputEl!: HTMLDivElement;

  // Facilities
  private fabBuyGroup!: BulkBuyGroup;
  private fabInfoEl!: HTMLSpanElement;
  private fabRateEl!: HTMLSpanElement;
  private fabPriceEl!: HTMLSpanElement;

  private mineBuyGroup!: BulkBuyGroup;
  private mineInfoEl!: HTMLSpanElement;
  private mineRateEl!: HTMLSpanElement;
  private minePriceEl!: HTMLSpanElement;

  // Robotics
  private roboticsHint!: HTMLDivElement;
  private roboticsContent!: HTMLDivElement;
  private factoryBuyGroup!: BulkBuyGroup;
  private factoryInfoEl!: HTMLSpanElement;
  private factoryRateEl!: HTMLSpanElement;
  private factoryPriceEl!: HTMLSpanElement;

  private robotInfoEl!: HTMLSpanElement;
  private robotBuyGroup!: BulkBuyGroup;
  private robotRateEl!: HTMLSpanElement;
  private robotPriceEl!: HTMLSpanElement;

  constructor(state: GameState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.build();
  }

  private build(): void {
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'SUPPLY CHAIN';
    this.el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';

    // GPU Production
    const gpuTitle = document.createElement('div');
    gpuTitle.className = 'panel-section-title';
    gpuTitle.textContent = 'GPU PRODUCTION';
    body.appendChild(gpuTitle);

    const gpuSection = document.createElement('div');
    gpuSection.className = 'panel-section';

    const litho = this.buildBulkRow(gpuSection, 'Litho machines:', (amt) => buyLithoMachine(this.state, amt));
    this.lithoInfoEl = litho.info;
    this.lithoRateEl = litho.rate!;
    this.lithoPriceEl = litho.price;
    this.lithoBuyGroup = litho.buyGroup;

    const silicon = this.buildBulkRow(gpuSection, 'Silicon:', (amt) => buySilicon(this.state, amt));
    this.siliconInfoEl = silicon.info;
    this.siliconPriceEl = silicon.price;
    this.siliconRateEl = silicon.rate!;
    this.siliconBuyGroup = silicon.buyGroup;

    const wafer = this.buildBulkRow(gpuSection, 'Wafers:', (amt) => buyWafers(this.state, amt));
    this.waferInfoEl = wafer.info;
    this.waferPriceEl = wafer.price;
    this.waferRateEl = wafer.rate!;
    this.waferBuyGroup = wafer.buyGroup;

    this.gpuOutputEl = document.createElement('div');
    this.gpuOutputEl.style.fontSize = '0.82rem';
    this.gpuOutputEl.style.color = 'var(--accent-green)';
    this.gpuOutputEl.style.marginTop = '4px';
    gpuSection.appendChild(this.gpuOutputEl);

    body.appendChild(gpuSection);
    body.appendChild(this.createDivider());

    // Facilities
    const facTitle = document.createElement('div');
    facTitle.className = 'panel-section-title';
    facTitle.textContent = 'FACILITIES';
    body.appendChild(facTitle);

    const fabSection = document.createElement('div');
    fabSection.className = 'panel-section';

    const fab = this.buildBulkRow(fabSection, 'Wafer fabs:', (amt) => buildFab(this.state, amt));
    this.fabInfoEl = fab.info;
    this.fabRateEl = fab.rate!;
    this.fabPriceEl = fab.price;
    this.fabBuyGroup = fab.buyGroup;

    const mine = this.buildBulkRow(fabSection, 'Silicon mines:', (amt) => buildSiliconMine(this.state, amt));
    this.mineInfoEl = mine.info;
    this.mineRateEl = mine.rate!;
    this.minePriceEl = mine.price;
    this.mineBuyGroup = mine.buyGroup;

    body.appendChild(fabSection);
    body.appendChild(this.createDivider());

    // Robotics
    const roboTitle = document.createElement('div');
    roboTitle.className = 'panel-section-title';
    roboTitle.textContent = 'ROBOTICS';
    body.appendChild(roboTitle);

    const roboticsSection = document.createElement('div');
    roboticsSection.className = 'panel-section';

    this.roboticsHint = document.createElement('div');
    this.roboticsHint.style.fontSize = '0.82rem';
    this.roboticsHint.style.color = 'var(--text-muted)';
    this.roboticsHint.textContent = 'Requires Robotics I research';
    roboticsSection.appendChild(this.roboticsHint);

    this.roboticsContent = document.createElement('div');
    this.roboticsContent.style.display = 'none';

    const factory = this.buildBulkRow(this.roboticsContent, 'Robot factories:', (amt) => buildRobotFactory(this.state, amt));
    this.factoryInfoEl = factory.info;
    this.factoryRateEl = factory.rate!;
    this.factoryPriceEl = factory.price;
    this.factoryBuyGroup = factory.buyGroup;

    const robot = this.buildBulkRow(this.roboticsContent, 'Robots:', (amt) => buyRobot(this.state, amt));
    this.robotInfoEl = robot.info;
    this.robotPriceEl = robot.price;
    this.robotRateEl = robot.rate!;
    this.robotBuyGroup = robot.buyGroup;

    roboticsSection.appendChild(this.roboticsContent);
    body.appendChild(roboticsSection);

    this.el.appendChild(body);
  }

  private buildBulkRow(parent: HTMLElement, labelText: string, onAction: (amt: number) => void) {
    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.fontSize = '0.82rem';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.marginBottom = '6px';

    const textCol = document.createElement('div');
    textCol.style.display = 'flex';
    textCol.style.flexDirection = 'column';
    textCol.style.flex = '1';
    textCol.style.overflow = 'hidden';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'baseline';
    topRow.style.gap = '4px';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = labelText;
    topRow.appendChild(label);

    const info = document.createElement('span');
    info.className = 'value';
    info.style.fontWeight = 'bold';
    topRow.appendChild(info);

    const rate = document.createElement('span');
    rate.className = 'value';
    rate.style.color = 'var(--text-muted)';
    rate.style.fontSize = '0.72rem';
    topRow.appendChild(rate);

    textCol.appendChild(topRow);

    const price = document.createElement('div');
    price.style.fontSize = '0.68rem';
    price.style.color = 'var(--text-muted)';
    price.style.whiteSpace = 'nowrap';
    price.style.overflow = 'hidden';
    price.style.textOverflow = 'ellipsis';
    textCol.appendChild(price);

    row.appendChild(textCol);

    const buyGroup = new BulkBuyGroup(onAction, '+');
    row.appendChild(buyGroup.el);

    parent.appendChild(row);
    return { info, rate, price, buyGroup };
  }

  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  update(state: GameState): void {
    this.state = state;
    this.updateGpuProduction(state);
    this.updateFacilities(state);
    this.updateRobotics(state);
  }

  private updateGpuProduction(state: GameState): void {
    // Litho
    this.lithoInfoEl.textContent = formatNumber(state.lithoMachines);
    this.lithoPriceEl.textContent = `${formatMoney(BALANCE.lithoMachineCost)} ea | ${BALANCE.lithoWaferConsumptionPerMin} waf/m | ${BALANCE.waferGpus} GPUs/waf`;
    const lithoNum = Math.floor(fromBigInt(state.lithoMachines));
    this.lithoBuyGroup.update(lithoNum, (amt) => state.funds >= BigInt(amt) * BALANCE.lithoMachineCost);
    this.updateRateDisplay(this.lithoRateEl, state.lithoActualRate, state.lithoMachines > 0n);

    // Silicon
    const silProd = state.siliconProductionPerMin;
    const silDem = state.siliconDemandPerMin;
    this.siliconInfoEl.textContent = formatNumber(state.silicon);
    this.siliconInfoEl.style.color = state.silicon <= 0n ? 'var(--accent-red)' : '';
    this.siliconRateEl.textContent = `(+${formatNumber(silProd)}, -${formatNumber(silDem)})/m`;
    this.siliconPriceEl.textContent = `${formatMoney(BALANCE.siliconCost)} each`;
    const silNum = Math.floor(fromBigInt(state.silicon));
    this.siliconBuyGroup.update(silNum, (amt) => state.funds >= BigInt(amt) * BALANCE.siliconCost);

    // Wafers
    const wafProd = state.waferProductionPerMin;
    const wafDem = state.waferDemandPerMin;
    this.waferInfoEl.textContent = formatNumber(state.wafers);
    this.waferInfoEl.style.color = state.wafers <= 0n ? 'var(--accent-red)' : '';
    this.waferRateEl.textContent = `(+${formatNumber(wafProd)}, -${formatNumber(wafDem)})/m`;
    this.waferPriceEl.textContent = `${formatMoney(BALANCE.waferCost)} each`;
    const wafNum = Math.floor(fromBigInt(state.wafers));
    this.waferBuyGroup.update(wafNum, (amt) => state.funds >= BigInt(amt) * BALANCE.waferCost);

    if (state.gpuProductionPerMin > 0n) {
      this.gpuOutputEl.textContent = 'GPU output: ' + formatNumber(state.gpuProductionPerMin) + '/min';
      this.gpuOutputEl.style.display = '';
    } else {
      this.gpuOutputEl.style.display = 'none';
    }
  }

  private updateRateDisplay(el: HTMLSpanElement, rate: number, show: boolean): void {
    if (!show) {
      el.textContent = '';
      return;
    }
    const pct = Math.round(rate * 100);
    el.textContent = `(${pct}%)`;
    if (pct >= 100) {
      el.style.color = 'var(--accent-green)';
    } else if (pct >= 50) {
      el.style.color = 'var(--accent-yellow)';
    } else {
      el.style.color = 'var(--accent-red)';
    }
  }

  private updateFacilities(state: GameState): void {
    // Fabs
    this.fabInfoEl.textContent = formatNumber(state.waferFabs);
    const fabPriceStr = `${formatMoney(BALANCE.fabCost)} + ${formatNumber(BALANCE.fabLaborCost)} labor`;
    this.fabPriceEl.textContent = `${fabPriceStr} ea | ${formatNumber(BALANCE.fabOutputPerMin)} wafers/m`;
    const fabNum = Math.floor(fromBigInt(state.waferFabs));
    this.fabBuyGroup.update(fabNum, (amt) => 
      state.funds >= BigInt(amt) * BALANCE.fabCost && state.labor >= BigInt(amt) * BALANCE.fabLaborCost
    );
    this.updateRateDisplay(this.fabRateEl, state.fabActualRate, state.waferFabs > 0n);

    // Mines
    this.mineInfoEl.textContent = formatNumber(state.siliconMines);
    const minePriceStr = `${formatMoney(BALANCE.siliconMineCost)} + ${formatNumber(BALANCE.siliconMineLaborCost)} labor`;
    this.minePriceEl.textContent = `${minePriceStr} ea | ${formatNumber(BALANCE.siliconMineOutputPerMin)} silicon/m`;
    const mineNum = Math.floor(fromBigInt(state.siliconMines));
    this.mineBuyGroup.update(mineNum, (amt) => 
      state.funds >= BigInt(amt) * BALANCE.siliconMineCost && state.labor >= BigInt(amt) * BALANCE.siliconMineLaborCost
    );
    this.updateRateDisplay(this.mineRateEl, state.mineActualRate, state.siliconMines > 0n);
  }

  private updateRobotics(state: GameState): void {
    const hasRobotics = state.completedResearch.includes('robotics1');

    if (!hasRobotics) {
      this.roboticsHint.style.display = '';
      this.roboticsContent.style.display = 'none';
      return;
    }

    this.roboticsHint.style.display = 'none';
    this.roboticsContent.style.display = '';

    // Factories
    this.factoryInfoEl.textContent = formatNumber(state.robotFactories);
    const factPriceStr = `${formatMoney(BALANCE.robotFactoryCost)} + ${formatNumber(BALANCE.robotFactoryLaborCost)} labor`;
    this.factoryPriceEl.textContent = `${factPriceStr} ea | ${formatNumber(BALANCE.robotFactoryOutputPerMin)} robots/m`;
    const factoryNum = Math.floor(fromBigInt(state.robotFactories));
    this.factoryBuyGroup.update(factoryNum, (amt) => 
      state.funds >= BigInt(amt) * BALANCE.robotFactoryCost && state.labor >= BigInt(amt) * BALANCE.robotFactoryLaborCost
    );
    this.updateRateDisplay(this.factoryRateEl, state.factoryActualRate, state.robotFactories > 0n);

    // Robots
    const roboProd = mulB(state.robotFactories, BALANCE.robotFactoryOutputPerMin);
    this.robotInfoEl.textContent = formatNumber(state.robots);
    this.robotRateEl.textContent = `(+${formatNumber(roboProd)}/min)`;
    this.robotPriceEl.textContent = `${formatMoney(BALANCE.robotCost)} each`;
    const robotNum = Math.floor(fromBigInt(state.robots));
    this.robotBuyGroup.update(robotNum, (amt) => state.funds >= BigInt(amt) * BALANCE.robotCost);
  }
}
