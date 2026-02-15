import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber } from '../../game/utils.ts';
import {
  buyLithoMachine, buyWaferBatch, buildFab,
  buildSiliconMine, buildRobotFactory, buyRobot,
} from '../../game/systems/SupplySystem.ts';
import { getBuyTiers } from '../components/BulkBuyGroup.ts';

interface SimpleRowRefs {
  info: HTMLSpanElement;
  btn: HTMLButtonElement;
  btnMoney: HTMLSpanElement;
  btnLabor?: HTMLSpanElement;
}

interface BulkRowRefs {
  info: HTMLSpanElement;
  btnGroup: HTMLDivElement;
  lastTiers: string;
}

export class SupplyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  // GPU Production
  private lithoRefs!: SimpleRowRefs;
  private waferRefs!: BulkRowRefs;
  private waferPriceHint!: HTMLDivElement;
  private gpuOutputEl!: HTMLDivElement;

  // Facilities
  private fabRefs!: SimpleRowRefs;
  private mineRefs!: SimpleRowRefs;

  // Robotics
  private roboticsHint!: HTMLDivElement;
  private roboticsContent!: HTMLDivElement;
  private factoryRefs!: SimpleRowRefs;
  private robotRefs!: BulkRowRefs;

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

    this.lithoRefs = this.buildSimpleRow(gpuSection, () => buyLithoMachine(this.state));
    this.waferRefs = this.buildBulkRow(gpuSection);

    this.waferPriceHint = document.createElement('div');
    this.waferPriceHint.style.fontSize = '0.72rem';
    this.waferPriceHint.style.color = 'var(--text-muted)';
    gpuSection.appendChild(this.waferPriceHint);

    this.gpuOutputEl = document.createElement('div');
    this.gpuOutputEl.style.fontSize = '0.82rem';
    this.gpuOutputEl.style.color = 'var(--accent-green)';
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

    this.fabRefs = this.buildSimpleRow(fabSection, () => buildFab(this.state));
    this.mineRefs = this.buildSimpleRow(fabSection, () => buildSiliconMine(this.state));

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

    this.factoryRefs = this.buildSimpleRow(this.roboticsContent, () => buildRobotFactory(this.state));
    this.robotRefs = this.buildBulkRow(this.roboticsContent);

    roboticsSection.appendChild(this.roboticsContent);
    body.appendChild(roboticsSection);

    this.el.appendChild(body);
  }

  private buildSimpleRow(parent: HTMLElement, onClick: () => void): SimpleRowRefs {
    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.fontSize = '0.82rem';

    const info = document.createElement('span');
    info.className = 'label';
    row.appendChild(info);

    const btn = document.createElement('button');
    btn.style.fontSize = '0.72rem';
    
    const btnText = document.createElement('span');
    btnText.textContent = 'Buy ';
    btn.appendChild(btnText);
    
    const btnMoney = document.createElement('span');
    btn.appendChild(btnMoney);
    
    const btnSpace = document.createTextNode(' ');
    btn.appendChild(btnSpace);
    
    const btnLabor = document.createElement('span');
    btn.appendChild(btnLabor);

    btn.addEventListener('click', onClick);
    row.appendChild(btn);

    parent.appendChild(row);
    return { info, btn, btnMoney, btnLabor };
  }

  private buildBulkRow(parent: HTMLElement): BulkRowRefs {
    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.fontSize = '0.82rem';

    const info = document.createElement('span');
    info.className = 'label';
    row.appendChild(info);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'bulk-buy-group';
    row.appendChild(btnGroup);

    parent.appendChild(row);
    return { info, btnGroup, lastTiers: '' };
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
    this.lithoRefs.info.textContent = 'Lithography machines: ' + state.lithoMachines;
    const lithoMoneyMet = state.funds >= BALANCE.lithoMachineCost;
    const lithoMoneyColor = lithoMoneyMet ? '' : 'var(--accent-red)';
    this.lithoRefs.btnMoney.textContent = formatMoney(BALANCE.lithoMachineCost);
    this.lithoRefs.btnMoney.style.color = lithoMoneyColor;
    this.lithoRefs.btn.disabled = !lithoMoneyMet;

    // Wafer batches
    this.waferRefs.info.textContent = 'Wafer batches: ' + formatNumber(Math.floor(state.waferBatches));

    const tiers = getBuyTiers(Math.floor(state.waferBatches));
    const tiersKey = tiers.join(',');
    if (tiersKey !== this.waferRefs.lastTiers) {
      this.waferRefs.lastTiers = tiersKey;
      this.waferRefs.btnGroup.innerHTML = '';
      for (const amt of tiers) {
        const btn = document.createElement('button');
        btn.textContent = '+' + formatNumber(amt);
        btn.style.fontSize = '0.72rem';
        btn.dataset.amount = amt.toString();
        btn.title = formatMoney(amt * BALANCE.waferBatchCost);
        btn.addEventListener('click', () => buyWaferBatch(this.state, amt));
        this.waferRefs.btnGroup.appendChild(btn);
      }
    }
    this.waferRefs.btnGroup.querySelectorAll('button').forEach(b => {
      const amt = parseInt((b as HTMLElement).dataset.amount ?? '1');
      (b as HTMLButtonElement).disabled = state.funds < amt * BALANCE.waferBatchCost;
    });

    this.waferPriceHint.textContent = formatMoney(BALANCE.waferBatchCost) + '/batch (' + BALANCE.waferBatchGpus + ' GPUs each)';

    if (state.gpuProductionPerMin > 0) {
      this.gpuOutputEl.textContent = 'GPU output: ' + formatNumber(state.gpuProductionPerMin) + '/min';
      this.gpuOutputEl.style.display = '';
    } else {
      this.gpuOutputEl.style.display = 'none';
    }
  }

  private updateFacilities(state: GameState): void {
    // Fabs
    const fabLaborMet = state.labor >= BALANCE.fabLaborCost;
    const fabMoneyMet = state.funds >= BALANCE.fabCost;
    this.fabRefs.info.textContent = 'Wafer fabs: ' + state.waferFabs;
    
    const fabMoneyColor = fabMoneyMet ? '' : 'var(--accent-red)';
    const fabLaborColor = fabLaborMet ? '' : 'var(--accent-red)';
    
    this.fabRefs.btnMoney.textContent = formatMoney(BALANCE.fabCost);
    this.fabRefs.btnMoney.style.color = fabMoneyColor;
    if (this.fabRefs.btnLabor) {
      this.fabRefs.btnLabor.textContent = ` + ${formatNumber(BALANCE.fabLaborCost)} labor`;
      this.fabRefs.btnLabor.style.color = fabLaborColor;
    }
    this.fabRefs.btn.disabled = !fabMoneyMet || !fabLaborMet;

    // Mines
    const mineLaborMet = state.labor >= BALANCE.siliconMineLaborCost;
    const mineMoneyMet = state.funds >= BALANCE.siliconMineCost;
    this.mineRefs.info.textContent = 'Silicon mines: ' + state.siliconMines;

    const mineMoneyColor = mineMoneyMet ? '' : 'var(--accent-red)';
    const mineLaborColor = mineLaborMet ? '' : 'var(--accent-red)';
    
    this.mineRefs.btnMoney.textContent = formatMoney(BALANCE.siliconMineCost);
    this.mineRefs.btnMoney.style.color = mineMoneyColor;
    if (this.mineRefs.btnLabor) {
      this.mineRefs.btnLabor.textContent = ` + ${formatNumber(BALANCE.siliconMineLaborCost)} labor`;
      this.mineRefs.btnLabor.style.color = mineLaborColor;
    }
    this.mineRefs.btn.disabled = !mineMoneyMet || !mineLaborMet;
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
    const factLaborMet = state.labor >= BALANCE.robotFactoryLaborCost;
    const factMoneyMet = state.funds >= BALANCE.robotFactoryCost;
    this.factoryRefs.info.textContent = 'Robot factories: ' + state.robotFactories;
    
    const factMoneyColor = factMoneyMet ? '' : 'var(--accent-red)';
    const factLaborColor = factLaborMet ? '' : 'var(--accent-red)';
    
    this.factoryRefs.btnMoney.textContent = formatMoney(BALANCE.robotFactoryCost);
    this.factoryRefs.btnMoney.style.color = factMoneyColor;
    if (this.factoryRefs.btnLabor) {
      this.factoryRefs.btnLabor.textContent = ` + ${formatNumber(BALANCE.robotFactoryLaborCost)} labor`;
      this.factoryRefs.btnLabor.style.color = factLaborColor;
    }
    this.factoryRefs.btn.disabled = !factMoneyMet || !factLaborMet;

    // Robots
    let robotText = 'Robots: ' + formatNumber(Math.floor(state.robots));
    if (state.robotFactories > 0) {
      robotText += ' (+' + formatNumber(state.robotFactories * BALANCE.robotFactoryOutputPerMin) + '/min)';
    }
    this.robotRefs.info.textContent = robotText;

    const tiers = getBuyTiers(Math.floor(state.robots));
    const tiersKey = tiers.join(',');
    if (tiersKey !== this.robotRefs.lastTiers) {
      this.robotRefs.lastTiers = tiersKey;
      this.robotRefs.btnGroup.innerHTML = '';
      for (const amt of tiers) {
        const btn = document.createElement('button');
        btn.textContent = '+' + formatNumber(amt);
        btn.style.fontSize = '0.72rem';
        btn.dataset.amount = amt.toString();
        btn.title = formatMoney(amt * BALANCE.robotCost);
        btn.addEventListener('click', () => buyRobot(this.state, amt));
        this.robotRefs.btnGroup.appendChild(btn);
      }
    }
    this.robotRefs.btnGroup.querySelectorAll('button').forEach(b => {
      const amt = parseInt((b as HTMLElement).dataset.amount ?? '1');
      (b as HTMLButtonElement).disabled = state.funds < amt * BALANCE.robotCost;
    });
  }
}
