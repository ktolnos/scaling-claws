import type { GameState } from '../game/GameState.ts';
import { formatMoney, formatRate, formatFlops, formatNumber } from '../game/utils.ts';

export class TopBar {
  private container: HTMLElement;
  private fundsValueEl!: HTMLSpanElement;
  private fundsRateEl!: HTMLSpanElement;
  private intelValueEl!: HTMLSpanElement;
  private flopsItem!: HTMLDivElement;
  private codeItem!: HTMLDivElement;
  private scienceItem!: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';

    // Funds
    const fundsItem = this.createItem('Funds');
    this.fundsValueEl = fundsItem.querySelector('.value')!;
    this.fundsRateEl = fundsItem.querySelector('.rate')!;
    this.container.appendChild(fundsItem);

    this.container.appendChild(this.createSeparator());

    // Intelligence
    const intelItem = this.createItem('Intel');
    this.intelValueEl = intelItem.querySelector('.value')!;
    intelItem.querySelector('.rate')!.remove();
    this.container.appendChild(intelItem);

    // FLOPS (hidden initially)
    this.flopsItem = this.createItem('FLOPS');
    this.flopsItem.classList.add('hidden');
    this.container.appendChild(this.flopsItem);

    // Code (hidden initially)
    this.codeItem = this.createItem('Code');
    this.codeItem.classList.add('hidden');
    this.container.appendChild(this.codeItem);

    // Science (hidden initially)
    this.scienceItem = this.createItem('Science');
    this.scienceItem.classList.add('hidden');
    this.container.appendChild(this.scienceItem);
  }

  private createItem(label: string): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'top-bar-item';

    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = label + ':';
    item.appendChild(labelEl);

    const valueEl = document.createElement('span');
    valueEl.className = 'value';
    valueEl.textContent = '0';
    item.appendChild(valueEl);

    const rateEl = document.createElement('span');
    rateEl.className = 'rate';
    item.appendChild(rateEl);

    return item;
  }

  private createSeparator(): HTMLSpanElement {
    const sep = document.createElement('span');
    sep.className = 'top-bar-separator';
    sep.textContent = '|';
    return sep;
  }

  update(state: GameState): void {
    const netRate = state.incomePerMin - state.expensePerMin;
    this.fundsValueEl.textContent = formatMoney(state.funds);
    this.fundsRateEl.textContent = '(' + formatRate(netRate) + ')';
    this.fundsRateEl.className = netRate >= 0 ? 'rate' : 'rate negative';

    this.intelValueEl.textContent = state.intelligence.toFixed(1);

    // FLOPS: show after GPU transition
    if (state.isPostGpuTransition) {
      this.flopsItem.classList.remove('hidden');
      this.flopsItem.querySelector('.value')!.textContent = formatFlops(state.totalPflops);
    }

    // Code: show when player has devs or code
    if (state.code > 0 || state.humanSoftwareDevs > 0 || state.aiSoftwareDevs > 0) {
      this.codeItem.classList.remove('hidden');
      this.codeItem.querySelector('.value')!.textContent = formatNumber(state.code);
      const codeRate = this.codeItem.querySelector('.rate')!;
      if (state.codePerMin > 0) {
        codeRate.textContent = '+' + formatNumber(state.codePerMin) + '/min';
      } else {
        codeRate.textContent = '';
      }
    }

    // Science: show when player has researchers or science
    if (state.science > 0 || state.aiResearchers > 0) {
      this.scienceItem.classList.remove('hidden');
      this.scienceItem.querySelector('.value')!.textContent = formatNumber(state.science);
      const sciRate = this.scienceItem.querySelector('.rate')!;
      if (state.sciencePerMin > 0) {
        sciRate.textContent = '+' + formatNumber(state.sciencePerMin) + '/min';
      } else {
        sciRate.textContent = '';
      }
    }
  }
}
