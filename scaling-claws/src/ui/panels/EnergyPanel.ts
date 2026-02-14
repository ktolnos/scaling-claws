import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber } from '../../game/utils.ts';
import { buyGridBlock, sellGridBlock, buyGasPlant, buyNuclearPlant, buySolarFarm, buySolarPanel } from '../../game/systems/EnergySystem.ts';

export class EnergyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private demandEl!: HTMLSpanElement;
  private supplyEl!: HTMLSpanElement;
  private throttleEl!: HTMLDivElement;
  private gridEl!: HTMLSpanElement;
  private gridBuyBtn!: HTMLButtonElement;
  private gridSellBtn!: HTMLButtonElement;

  private plantsSection!: HTMLDivElement;
  private solarSection!: HTMLDivElement;

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
    const gridLabel = document.createElement('span');
    gridLabel.className = 'label';
    gridLabel.textContent = 'Grid contract:';
    this.gridEl = document.createElement('span');
    this.gridEl.className = 'value';

    const gridBtns = document.createElement('span');
    gridBtns.style.display = 'flex';
    gridBtns.style.gap = '4px';
    gridBtns.style.alignItems = 'center';

    this.gridSellBtn = document.createElement('button');
    this.gridSellBtn.textContent = '-5 MW';
    this.gridSellBtn.style.fontSize = '0.75rem';
    this.gridSellBtn.addEventListener('click', () => sellGridBlock(this.state));

    this.gridBuyBtn = document.createElement('button');
    this.gridBuyBtn.style.fontSize = '0.75rem';
    this.gridBuyBtn.addEventListener('click', () => buyGridBlock(this.state));

    gridBtns.appendChild(this.gridSellBtn);
    gridBtns.appendChild(this.gridEl);
    gridBtns.appendChild(this.gridBuyBtn);
    gridRow.appendChild(gridLabel);
    gridRow.appendChild(gridBtns);
    body.appendChild(gridRow);

    body.appendChild(this.createDivider());

    // Power plants
    this.plantsSection = document.createElement('div');
    this.plantsSection.className = 'panel-section';
    body.appendChild(this.plantsSection);

    // Solar section
    this.solarSection = document.createElement('div');
    this.solarSection.className = 'panel-section';
    body.appendChild(this.solarSection);

    // Footer note
    const note = document.createElement('div');
    note.style.fontSize = '0.72rem';
    note.style.color = 'var(--text-muted)';
    note.style.marginTop = '4px';
    note.textContent = 'Surplus = wasted. Deficit → GPUs throttle.';
    body.appendChild(note);

    this.el.appendChild(body);
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
    const gridMW = state.gridBlocksOwned * BALANCE.gridBlockMW;
    this.gridEl.textContent = formatMW(gridMW);
    this.gridBuyBtn.textContent = '+5 MW ' + formatMoney(BALANCE.gridCostPerBlockPerMin) + '/min';
    this.gridSellBtn.disabled = state.gridBlocksOwned <= 0;

    // Power plants
    this.plantsSection.innerHTML = '';
    const engAvailable = state.engineerCount - state.engineersRequired;

    // Gas plant
    this.addPlantRow('Gas Plant', state.gasPlants, BALANCE.powerPlants.gas,
      engAvailable, () => buyGasPlant(this.state));

    // Nuclear
    this.addPlantRow('Nuclear Plant', state.nuclearPlants, BALANCE.powerPlants.nuclear,
      engAvailable, () => buyNuclearPlant(this.state));

    // Solar farm
    this.addPlantRow('Solar Farm', state.solarFarms, BALANCE.powerPlants.solar,
      engAvailable, () => buySolarFarm(this.state));

    // Solar panels
    this.solarSection.innerHTML = '';
    if (state.solarFarms > 0) {
      const panelRow = document.createElement('div');
      panelRow.className = 'panel-row';
      panelRow.style.fontSize = '0.82rem';

      const panelInfo = document.createElement('span');
      panelInfo.className = 'label';
      panelInfo.textContent = 'Solar panels: ' + formatNumber(state.solarPanels) + ' (' + formatMW(state.solarPanels * BALANCE.solarPanelMW) + ')';
      panelRow.appendChild(panelInfo);

      const panelBtns = document.createElement('div');
      panelBtns.className = 'bulk-buy-group';
      for (const amt of [1, 10, 100]) {
        const btn = document.createElement('button');
        btn.textContent = '+' + amt;
        btn.disabled = state.funds < amt * BALANCE.solarPanelCost;
        btn.addEventListener('click', () => buySolarPanel(this.state, amt));
        panelBtns.appendChild(btn);
      }
      panelRow.appendChild(panelBtns);
      this.solarSection.appendChild(panelRow);
    }
  }

  private addPlantRow(name: string, count: number, config: { cost: number; outputMW: number; engineersRequired: number }, engAvailable: number, onBuy: () => void): void {
    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.fontSize = '0.82rem';

    const info = document.createElement('span');
    info.className = 'label';
    const mwText = config.outputMW > 0 ? '+' + config.outputMW + ' MW' : '+panels MW';
    
    const engMet = engAvailable >= config.engineersRequired;
    const engText = `<span style="color: ${engMet ? 'inherit' : 'var(--accent-red)'}">(requires ${config.engineersRequired} engineers)</span>`;
    
    info.innerHTML = `${name}: ${count}  ${mwText}  ${engText}`;
    row.appendChild(info);

    const btn = document.createElement('button');
    btn.textContent = 'Build ' + formatMoney(config.cost);
    btn.style.fontSize = '0.75rem';
    btn.disabled = this.state.funds < config.cost || engAvailable < config.engineersRequired;
    btn.addEventListener('click', onBuy);
    row.appendChild(btn);

    this.plantsSection.appendChild(row);
  }
}

function formatMW(mw: number): string {
  if (mw < 1) return (mw * 1000).toFixed(0) + ' kW';
  if (mw < 1000) return mw.toFixed(1) + ' MW';
  return (mw / 1000).toFixed(1) + ' GW';
}
