import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber } from '../../game/utils.ts';
import { buyGridBlock, sellGridBlock, buyGasPlant, buyNuclearPlant, buySolarFarm, buySolarPanel } from '../../game/systems/EnergySystem.ts';
import { getBuyTiers } from '../components/BulkBuyGroup.ts';

interface PlantRowRefs {
  row: HTMLDivElement;
  info: HTMLSpanElement;
  btn: HTMLButtonElement;
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
  private gridBuyBtn!: HTMLButtonElement;
  private gridSellBtn!: HTMLButtonElement;

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
    btn.addEventListener('click', onClick);
    row.appendChild(btn);

    parent.appendChild(row);
    return { row, info, btn };
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
    const nextGridCost = (state.gridBlocksOwned + 1) * BALANCE.gridCostPerBlockPerMin;
    const gridMoneyMet = state.funds >= nextGridCost;
    const gridMoneyColor = gridMoneyMet ? '' : 'var(--accent-red)';
    this.gridBuyBtn.innerHTML = `+5 MW <span style="color: ${gridMoneyColor}">${formatMoney(BALANCE.gridCostPerBlockPerMin)}/min</span>`;
    this.gridBuyBtn.disabled = !gridMoneyMet;
    this.gridSellBtn.disabled = state.gridBlocksOwned <= 0;

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

    refs.info.innerHTML = `${name}: ${count} ${mwText}`;
    
    const moneyColor = moneyMet ? '' : 'var(--accent-red)';
    const laborColor = laborMet ? '' : 'var(--accent-red)';
    refs.btn.innerHTML = `Build <span style="color: ${moneyColor}">${formatMoney(config.cost)}</span> <span style="color: ${laborColor}">(${formatNumber(config.laborCost)} labor)</span>`;
    refs.btn.disabled = !moneyMet || !laborMet;
  }
}

function formatMW(mw: number): string {
  if (mw < 1) return (mw * 1000).toFixed(0) + ' kW';
  if (mw < 1000) return mw.toFixed(1) + ' MW';
  return (mw / 1000).toFixed(1) + ' GW';
}
