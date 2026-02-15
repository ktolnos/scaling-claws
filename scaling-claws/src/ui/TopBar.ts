import type { GameState } from '../game/GameState.ts';
import { formatMoney, formatFlops, formatNumber } from '../game/utils.ts';
import { deleteSave } from '../game/SaveManager.ts';

export class TopBar {
  private container: HTMLElement;
  private fundsValueEl!: HTMLSpanElement;
  private fundsIncomeEl!: HTMLSpanElement;
  private fundsExpenseEl!: HTMLSpanElement;
  private intelValueEl!: HTMLSpanElement;
  private efficiencyItem!: HTMLDivElement;
  private flopsItem!: HTMLDivElement;
  private codeItem!: HTMLDivElement;
  private scienceItem!: HTMLDivElement;
  private laborItem!: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';

    // Funds
    const fundsItem = this.createResourceItem('Funds');
    this.fundsValueEl = fundsItem.querySelector('.value')!;
    this.fundsIncomeEl = fundsItem.querySelector('[data-role="income"]')!;
    this.fundsExpenseEl = fundsItem.querySelector('[data-role="expense"]')!;
    this.container.appendChild(fundsItem);

    this.container.appendChild(this.createSeparator());

    // Intelligence
    const intelItem = this.createItem('Intel');
    this.intelValueEl = intelItem.querySelector('.value')!;
    intelItem.querySelector('.rate')!.remove();
    this.container.appendChild(intelItem);

    // Efficiency (hidden initially)
    this.efficiencyItem = this.createItem('Efficiency');
    this.efficiencyItem.classList.add('hidden');
    this.container.appendChild(this.efficiencyItem);

    // FLOPS (hidden initially)
    this.flopsItem = this.createItem('FLOPS');
    this.flopsItem.classList.add('hidden');
    this.container.appendChild(this.flopsItem);

    // Code (hidden initially)
    this.codeItem = this.createResourceItem('Code');
    this.codeItem.classList.add('hidden');
    this.container.appendChild(this.codeItem);

    // Science (hidden initially)
    this.scienceItem = this.createResourceItem('Science');
    this.scienceItem.classList.add('hidden');
    this.container.appendChild(this.scienceItem);

    // Labor (hidden initially)
    this.laborItem = this.createResourceItem('Labor');
    this.laborItem.classList.add('hidden');
    this.container.appendChild(this.laborItem);

    // Spacer to push restart button to the right
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.container.appendChild(spacer);

    // Restart Button
    const restartBtn = document.createElement('button');
    restartBtn.className = 'btn-danger btn-restart';
    restartBtn.textContent = 'Restart Game';
    restartBtn.onclick = () => {
      if (confirm('Are you sure you want to RESTART? All progress will be lost forever.')) {
        deleteSave();
        window.location.reload();
      }
    };
    this.container.appendChild(restartBtn);
  }

  /** Creates a simple item with label + value + rate (for intel, efficiency, flops). */
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

  /** Creates a resource item with label + value + separate income/expense spans. */
  private createResourceItem(label: string): HTMLDivElement {
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

    const rateContainer = document.createElement('span');
    rateContainer.className = 'rate';

    const incomeEl = document.createElement('span');
    incomeEl.dataset.role = 'income';
    incomeEl.style.color = 'var(--accent-green)';
    rateContainer.appendChild(incomeEl);

    const expenseEl = document.createElement('span');
    expenseEl.dataset.role = 'expense';
    expenseEl.style.color = 'var(--accent-red)';
    expenseEl.style.marginLeft = '4px';
    rateContainer.appendChild(expenseEl);

    item.appendChild(rateContainer);
    return item;
  }

  private createSeparator(): HTMLSpanElement {
    const sep = document.createElement('span');
    sep.className = 'top-bar-separator';
    sep.textContent = '|';
    return sep;
  }

  update(state: GameState): void {
    // Funds
    this.fundsValueEl.textContent = formatMoney(state.funds);
    const totalIncome = state.incomePerMin;
    const totalExpense = state.expensePerMin;
    this.fundsIncomeEl.textContent = totalIncome > 0 ? '+' + formatMoney(totalIncome) + '/m' : '';
    this.fundsExpenseEl.textContent = totalExpense > 0 ? '-' + formatMoney(totalExpense) + '/m' : '';

    // Intelligence
    this.intelValueEl.textContent = state.intelligence.toFixed(1);

    // Efficiency: show after GPU transition
    if (state.isPostGpuTransition) {
      this.efficiencyItem.classList.remove('hidden');
      const eff = Math.round(state.agentEfficiency * 100);
      const valueEl = this.efficiencyItem.querySelector('.value')!;
      valueEl.textContent = eff + '%';
      valueEl.className = eff < 100 ? 'value negative' : 'value';
    }

    // FLOPS: show after GPU transition
    if (state.isPostGpuTransition) {
      this.flopsItem.classList.remove('hidden');
      this.flopsItem.querySelector('.value')!.textContent = formatFlops(state.totalPflops);
    }

    // Code: show when player has code or code production
    if (state.code > 0 || state.codePerMin > 0) {
      this.codeItem.classList.remove('hidden');
      this.codeItem.querySelector('.value')!.textContent = formatNumber(state.code);
      const incomeEl = this.codeItem.querySelector('[data-role="income"]') as HTMLSpanElement;
      const expenseEl = this.codeItem.querySelector('[data-role="expense"]') as HTMLSpanElement;
      incomeEl.textContent = state.codePerMin > 0 ? '+' + formatNumber(state.codePerMin) + '/m' : '';
      expenseEl.textContent = '';
    }

    // Science: show when player has science or science production
    if (state.science > 0 || state.sciencePerMin > 0) {
      this.scienceItem.classList.remove('hidden');
      this.scienceItem.querySelector('.value')!.textContent = formatNumber(state.science);
      const incomeEl = this.scienceItem.querySelector('[data-role="income"]') as HTMLSpanElement;
      const expenseEl = this.scienceItem.querySelector('[data-role="expense"]') as HTMLSpanElement;
      incomeEl.textContent = state.sciencePerMin > 0 ? '+' + formatNumber(state.sciencePerMin) + '/m' : '';
      expenseEl.textContent = '';
    }

    // Labor: show when player has labor or labor production
    if (state.labor > 0 || state.laborPerMin > 0 || state.laborConsumedPerMin > 0) {
      this.laborItem.classList.remove('hidden');
      this.laborItem.querySelector('.value')!.textContent = formatNumber(state.labor);
      const incomeEl = this.laborItem.querySelector('[data-role="income"]') as HTMLSpanElement;
      const expenseEl = this.laborItem.querySelector('[data-role="expense"]') as HTMLSpanElement;
      incomeEl.textContent = state.laborPerMin > 0 ? '+' + formatNumber(state.laborPerMin) + '/m' : '';
      expenseEl.textContent = state.laborConsumedPerMin > 0 ? '-' + formatNumber(state.laborConsumedPerMin) + '/m' : '';
    }
  }
}
