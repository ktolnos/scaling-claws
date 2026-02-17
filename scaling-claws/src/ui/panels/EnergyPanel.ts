import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber, formatMW, fromBigInt, mulB, toBigInt, scaleBigInt } from '../../game/utils.ts';
import { buyGridPower, sellGridPower, buyGasPlant, buyNuclearPlant } from '../../game/systems/EnergySystem.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';

interface PlantRowRefs {
  row: HTMLDivElement;
  info: HTMLSpanElement;
  btn: HTMLButtonElement;
  btnMoney: HTMLSpanElement;
  btnLabor: HTMLSpanElement;
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
  
  // Solar Info
  private solarInfoRow!: HTMLDivElement;
  private solarInfoEl!: HTMLSpanElement;

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

    // Power: Supply / Demand
    const powerRow = document.createElement('div');
    powerRow.className = 'panel-row';
    const powerLabel = document.createElement('span');
    powerLabel.className = 'label';
    powerLabel.textContent = 'Power:';
    powerRow.appendChild(powerLabel);

    const powerValues = document.createElement('div');
    powerValues.className = 'value';
    
    powerValues.appendChild(document.createTextNode('Supply '));
    this.supplyEl = document.createElement('span');
    powerValues.appendChild(this.supplyEl);
    
    powerValues.appendChild(document.createTextNode(' / Demand '));
    this.demandEl = document.createElement('span');
    powerValues.appendChild(this.demandEl);

    powerRow.appendChild(powerValues);
    body.appendChild(powerRow);

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
    gridLabel.innerHTML = `Grid Capacity <span style="font-size:0.8em;opacity:0.6">(${formatMoney(BALANCE.gridPowerKWCost)}/KW)</span>:`;
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

    // Power plants
    const plantsSection = document.createElement('div');
    plantsSection.className = 'panel-section';

    this.gasRow = this.buildPlantRow(plantsSection, () => buyGasPlant(this.state));
    this.nuclearRow = this.buildPlantRow(plantsSection, () => buyNuclearPlant(this.state));

    body.appendChild(plantsSection);
    
    // Solar Display (No buying)
    this.solarInfoRow = document.createElement('div');
    this.solarInfoRow.className = 'panel-row';
    this.solarInfoRow.style.fontSize = '0.82rem';
    this.solarInfoRow.style.marginTop = '4px';
    this.solarInfoEl = document.createElement('span');
    this.solarInfoEl.className = 'label';
    this.solarInfoEl.style.width = '100%';
    this.solarInfoEl.style.textAlign = 'center';
    this.solarInfoRow.appendChild(this.solarInfoEl);
    
    body.appendChild(this.solarInfoRow);

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
    this.gridEl.textContent = formatMW(gridKW / 1000n);
    
    const gridKWNum = Math.floor(fromBigInt(gridKW));
    this.gridBuyGroup.update(gridKWNum, (amt) => {
      const amtB = scaleBigInt(BigInt(amt));
      // One-time cost
      const cost = mulB(amtB, toBigInt(BALANCE.gridPowerKWCost));
      return state.funds >= cost;
    });
    this.gridSellGroup.update(gridKWNum, (amt) => gridKWNum >= amt);

    // Power plants
    // Need current counts vs limits
    const gasLimit = BALANCE.powerPlants.gas.limit || 0;
    const nukeLimit = BALANCE.powerPlants.nuclear.limit || 0;
    
    this.updatePlantRow(this.gasRow, 'Gas Plant', formatNumber(state.gasPlants), BALANCE.powerPlants.gas, state.labor, gasLimit, state.gasPlants);
    this.updatePlantRow(this.nuclearRow, 'Nuclear Plant', formatNumber(state.nuclearPlants), BALANCE.powerPlants.nuclear, state.labor, nukeLimit, state.nuclearPlants);

    // Solar Display
    if (state.solarPanels > 0n) {
        const solarMW = mulB(state.solarPanels, toBigInt(BALANCE.solarPanelMW));
        this.solarInfoEl.textContent = `Solar Array: ${formatNumber(state.solarPanels)} panels (${formatMW(solarMW)})`;
        this.solarInfoRow.style.display = '';
    } else {
        this.solarInfoRow.style.display = 'none';
    }
  }

  private updatePlantRow(refs: PlantRowRefs, name: string, countStr: string, config: { cost: bigint; outputMW: bigint; laborCost: bigint }, currentLabor: bigint, limit: number, currentCount: bigint): void {
    const mwText = config.outputMW > 0n ? '+' + formatMW(config.outputMW) : '';
    const laborMet = currentLabor >= config.laborCost;
    const moneyMet = this.state.funds >= config.cost;
    
    const limitReached = currentCount >= toBigInt(limit);
    
    let label = `${name}: ${mwText} ${countStr}`;
    if (limitReached) {
        label += ' (MAX)';
    } else {
        label += ` / ${formatNumber(limit)}`;
    }
    refs.info.textContent = label;
    refs.info.style.color = limitReached ? 'var(--text-muted)' : '';
    
    const moneyColor = moneyMet ? '' : 'var(--accent-red)';
    const laborColor = laborMet ? '' : 'var(--accent-red)';
    
    refs.btnMoney.textContent = formatMoney(config.cost);
    refs.btnMoney.style.color = moneyColor;
    refs.btnLabor.textContent = ` + ${formatNumber(config.laborCost)} labor`;
    refs.btnLabor.style.color = laborColor;
    
    refs.btn.disabled = !moneyMet || !laborMet || limitReached;
  }
}
