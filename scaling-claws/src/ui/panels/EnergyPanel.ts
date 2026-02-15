import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber, formatMW } from '../../game/utils.ts';
import { buyGridPower, sellGridPower, buyGasPlant, buyNuclearPlant, buySolarFarm, buySolarPanel } from '../../game/systems/EnergySystem.ts';
import { BulkBuyGroup, getBuyTiers } from '../components/BulkBuyGroup.ts';

interface PlantRowRefs {
  row: HTMLDivElement;
  info: HTMLSpanElement;
  btn: HTMLButtonElement;
  btnMoney: HTMLSpanElement;
  btnLabor: HTMLSpanElement;
}

interface SolarPanelRefs {
  row: HTMLDivElement;
  info: HTMLSpanElement;
  btnGroup: HTMLDivElement;
  lastTiers: string;
}

export class EnergyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private demandEl!: HTMLSpanElement;
  private supplyEl!: HTMLSpanElement;
  private throttleEl!: HTMLDivElement;
  private gridEl!: HTMLSpanElement;
  private gridBuyGroup!: BulkBuyGroup;
  private gridSellGroup!: BulkBuyGroup;

  private gasRow!: PlantRowRefs;
  private nuclearRow!: PlantRowRefs;
  private solarFarmRow!: PlantRowRefs;
  private solarPanelRefs!: SolarPanelRefs;

  constructor(state: GameState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.build();
  }

  private build(): void {
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'ENERGY';
    this.el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';

    // Demand / Supply
    const demandRow = document.createElement('div');
    demandRow.className = 'panel-row';
    const demandLabel = document.createElement('span');
    demandLabel.className = 'label';
    demandLabel.textContent = 'Power demand:';
    this.demandEl = document.createElement('span');
    this.demandEl.className = 'value';
    demandRow.appendChild(demandLabel);
    demandRow.appendChild(this.demandEl);
    body.appendChild(demandRow);

    const supplyRow = document.createElement('div');
    supplyRow.className = 'panel-row';
    const supplyLabel = document.createElement('span');
    supplyLabel.className = 'label';
    supplyLabel.textContent = 'Power supply:';
    this.supplyEl = document.createElement('span');
    this.supplyEl.className = 'value';
    supplyRow.appendChild(supplyLabel);
    supplyRow.appendChild(this.supplyEl);
    body.appendChild(supplyRow);

    // Throttle warning
    this.throttleEl = document.createElement('div');
    this.throttleEl.className = 'warning-text';
    this.throttleEl.style.display = 'none';
    body.appendChild(this.throttleEl);

    body.appendChild(this.createDivider());

    // Grid contract
    const gridRow = document.createElement('div');
    gridRow.className = 'panel-row';
    gridRow.style.fontSize = '0.82rem';

    const gridLabel = document.createElement('span');
    gridLabel.className = 'label';
    gridLabel.textContent = 'Grid contract:';
    gridRow.appendChild(gridLabel);

    const gridControls = document.createElement('div');
    gridControls.style.display = 'flex';
    gridControls.style.alignItems = 'center';
    gridControls.style.gap = '6px';

    this.gridSellGroup = new BulkBuyGroup((amt) => sellGridPower(this.state, amt), '-');
    this.gridBuyGroup = new BulkBuyGroup((amt) => buyGridPower(this.state, amt), '+');

    this.gridEl = document.createElement('span');
    this.gridEl.className = 'value';
    this.gridEl.style.fontWeight = 'bold';
    this.gridEl.style.minWidth = '45px';
    this.gridEl.style.textAlign = 'center';

    gridControls.appendChild(this.gridSellGroup.el);
    gridControls.appendChild(this.gridEl);
    gridControls.appendChild(this.gridBuyGroup.el);

    gridRow.appendChild(gridControls);
    body.appendChild(gridRow);

    body.appendChild(this.createDivider());

    // Power plants — pre-build all 3 rows
    const plantsSection = document.createElement('div');
    plantsSection.className = 'panel-section';

    this.gasRow = this.buildPlantRow(plantsSection, () => buyGasPlant(this.state));
    this.nuclearRow = this.buildPlantRow(plantsSection, () => buyNuclearPlant(this.state));
    this.solarFarmRow = this.buildPlantRow(plantsSection, () => buySolarFarm(this.state));

    body.appendChild(plantsSection);

    // Solar panels — pre-build row (hidden until solar farms > 0)
    const solarSection = document.createElement('div');
    solarSection.className = 'panel-section';

    const spRow = document.createElement('div');
    spRow.className = 'panel-row';
    spRow.style.fontSize = '0.82rem';
    spRow.style.display = 'none';

    const spInfo = document.createElement('span');
    spInfo.className = 'label';
    spRow.appendChild(spInfo);

    const spBtnGroup = document.createElement('div');
    spBtnGroup.className = 'bulk-buy-group';
    spRow.appendChild(spBtnGroup);

    solarSection.appendChild(spRow);
    body.appendChild(solarSection);

    this.solarPanelRefs = { row: spRow, info: spInfo, btnGroup: spBtnGroup, lastTiers: '' };

    // Footer note
    const note = document.createElement('div');
    note.style.fontSize = '0.72rem';
    note.style.color = 'var(--text-muted)';
    note.style.marginTop = '4px';
    note.textContent = 'Surplus = wasted. Deficit → GPUs throttle.';
    body.appendChild(note);

    this.el.appendChild(body);
  }

  private buildPlantRow(parent: HTMLElement, onClick: () => void): PlantRowRefs {
    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.fontSize = '0.82rem';

    const info = document.createElement('span');
    info.className = 'label';
    row.appendChild(info);

    const btn = document.createElement('button');
    btn.style.fontSize = '0.75rem';
    
    const btnText = document.createElement('span');
    btnText.textContent = 'Build ';
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
    return { row, info, btn, btnMoney, btnLabor };
  }

  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  update(state: GameState): void {
    this.state = state;

    const demandMW = state.powerDemandMW;
    const supplyMW = state.powerSupplyMW;

    this.demandEl.textContent = formatMW(demandMW);
    this.supplyEl.textContent = formatMW(supplyMW);
    this.supplyEl.style.color = supplyMW >= demandMW ? 'var(--accent-green)' : 'var(--accent-red)';

    // Throttle warning
    if (state.powerThrottle < 1) {
      this.throttleEl.style.display = 'block';
      this.throttleEl.textContent = 'GPUs throttled to ' + Math.round(state.powerThrottle * 100) + '% — need more power!';
    } else {
      this.throttleEl.style.display = 'none';
    }

    // Grid
    const gridKW = state.gridPowerKW;
    this.gridEl.textContent = formatMW(gridKW / 1000);
    
    this.gridBuyGroup.update(gridKW, (amt) => {
      const nextTotalKW = gridKW + amt;
      return state.funds >= nextTotalKW * BALANCE.gridPowerCostPerKWPerMin;
    });
    this.gridSellGroup.update(gridKW, (amt) => gridKW >= amt);

    // Power plants — update in place
    this.updatePlantRow(this.gasRow, 'Gas Plant', state.gasPlants, BALANCE.powerPlants.gas, state.labor);
    this.updatePlantRow(this.nuclearRow, 'Nuclear Plant', state.nuclearPlants, BALANCE.powerPlants.nuclear, state.labor);
    this.updatePlantRow(this.solarFarmRow, 'Solar Farm', state.solarFarms, BALANCE.powerPlants.solar, state.labor);

    // Solar panels
    if (state.solarFarms > 0) {
      this.solarPanelRefs.row.style.display = '';
      this.solarPanelRefs.info.textContent = 'Solar panels: ' + formatNumber(state.solarPanels) + ' (' + formatMW(state.solarPanels * BALANCE.solarPanelMW) + ')';

      // Rebuild buttons only when tiers change
      const tiers = getBuyTiers(state.solarPanels);
      const tiersKey = tiers.join(',');
      if (tiersKey !== this.solarPanelRefs.lastTiers) {
        this.solarPanelRefs.lastTiers = tiersKey;
        this.solarPanelRefs.btnGroup.innerHTML = '';
        for (const amt of tiers) {
          const btn = document.createElement('button');
          btn.textContent = '+' + formatNumber(amt);
          btn.dataset.amount = amt.toString();
          btn.addEventListener('click', () => buySolarPanel(this.state, amt));
          this.solarPanelRefs.btnGroup.appendChild(btn);
        }
      }
      // Update disabled state in place
      this.solarPanelRefs.btnGroup.querySelectorAll('button').forEach(btn => {
        const amt = parseInt(btn.dataset.amount ?? '1');
        (btn as HTMLButtonElement).disabled = state.funds < amt * BALANCE.solarPanelCost;
      });
    } else {
      this.solarPanelRefs.row.style.display = 'none';
    }
  }

  private updatePlantRow(refs: PlantRowRefs, name: string, count: number, config: { cost: number; outputMW: number; laborCost: number }, currentLabor: number): void {
    const mwText = config.outputMW > 0 ? '+' + config.outputMW + ' MW' : '+panels MW';
    const laborMet = currentLabor >= config.laborCost;
    const moneyMet = this.state.funds >= config.cost;

    refs.info.textContent = `${name}: ${count} ${mwText}`;
    
    const moneyColor = moneyMet ? '' : 'var(--accent-red)';
    const laborColor = laborMet ? '' : 'var(--accent-red)';
    
    refs.btnMoney.textContent = formatMoney(config.cost);
    refs.btnMoney.style.color = moneyColor;
    refs.btnLabor.textContent = ` + ${formatNumber(config.laborCost)} labor`;
    refs.btnLabor.style.color = laborColor;
    
    refs.btn.disabled = !moneyMet || !laborMet;
  }
}
