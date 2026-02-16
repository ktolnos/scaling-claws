import type { GameState } from '../game/GameState.ts';
import { formatMoney, formatFlops, formatNumber, formatMW } from '../game/utils.ts';
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
  private energyItem!: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';
    
    // Detailed Breakdown Panel (Hidden initially)
    const breakdownPanel = document.createElement('div');
    breakdownPanel.id = 'top-bar-breakdown';
    breakdownPanel.className = 'hidden';
    this.container.appendChild(breakdownPanel);

    // Funds
    const fundsItem = this.createResourceItem('Funds');
    fundsItem.dataset.resource = 'funds';
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
    this.flopsItem.dataset.resource = 'compute';
    this.flopsItem.classList.add('hidden');
    this.container.appendChild(this.flopsItem);

    // Code (hidden initially)
    this.codeItem = this.createResourceItem('Code');
    this.codeItem.dataset.resource = 'code';
    this.codeItem.classList.add('hidden');
    this.container.appendChild(this.codeItem);

    // Science (hidden initially)
    this.scienceItem = this.createResourceItem('Science');
    this.scienceItem.dataset.resource = 'science';
    this.scienceItem.classList.add('hidden');
    this.container.appendChild(this.scienceItem);

    // Labor (hidden initially)
    this.laborItem = this.createResourceItem('Labor');
    this.laborItem.dataset.resource = 'labor';
    this.laborItem.classList.add('hidden');
    this.container.appendChild(this.laborItem);

    // Energy (hidden initially, shows once space unlocks)
    this.energyItem = this.createItem('Energy');
    this.energyItem.classList.add('hidden');
    this.container.appendChild(this.energyItem);

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

    // Hover logic for expansion
    this.container.onmouseenter = () => {
      this.container.classList.add('is-expanded');
      breakdownPanel.classList.remove('hidden');
    };
    this.container.onmouseleave = () => {
      this.container.classList.remove('is-expanded');
      breakdownPanel.classList.add('hidden');
    };
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
    this.fundsIncomeEl.textContent = totalIncome > 0n ? '+' + formatMoney(totalIncome) + '/m' : '';
    this.fundsExpenseEl.textContent = totalExpense > 0n ? '-' + formatMoney(totalExpense) + '/m' : '';

    // Intelligence
    this.intelValueEl.textContent = (Math.round(state.intelligence * 10) / 10).toString();

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
    if (state.code > 0n || state.codePerMin > 0n) {
      this.codeItem.classList.remove('hidden');
      this.codeItem.querySelector('.value')!.textContent = formatNumber(state.code);
      const incomeEl = this.codeItem.querySelector('[data-role="income"]') as HTMLSpanElement;
      const expenseEl = this.codeItem.querySelector('[data-role="expense"]') as HTMLSpanElement;
      incomeEl.textContent = state.codePerMin > 0n ? '+' + formatNumber(state.codePerMin) + '/m' : '';
      expenseEl.textContent = '';
    }

    // Science: show when player has science or science production
    if (state.science > 0n || state.sciencePerMin > 0n) {
      this.scienceItem.classList.remove('hidden');
      this.scienceItem.querySelector('.value')!.textContent = formatNumber(state.science);
      const incomeEl = this.scienceItem.querySelector('[data-role="income"]') as HTMLSpanElement;
      const expenseEl = this.scienceItem.querySelector('[data-role="expense"]') as HTMLSpanElement;
      incomeEl.textContent = state.sciencePerMin > 0n ? '+' + formatNumber(state.sciencePerMin) + '/m' : '';
      expenseEl.textContent = '';
    }

    // Labor: show when player has labor or labor production
    if (state.labor > 0n || state.laborPerMin > 0n) {
      this.laborItem.classList.remove('hidden');
      this.laborItem.querySelector('.value')!.textContent = formatNumber(state.labor);
      const incomeEl = this.laborItem.querySelector('[data-role="income"]') as HTMLSpanElement;
      const expenseEl = this.laborItem.querySelector('[data-role="expense"]') as HTMLSpanElement;
      incomeEl.textContent = state.laborPerMin > 0n ? '+' + formatNumber(state.laborPerMin) + '/m' : '';
      expenseEl.textContent = '';
    }

    // Energy: show once space is unlocked (separate grids become interesting)
    if (state.spaceUnlocked) {
      this.energyItem.classList.remove('hidden');
      const valueEl = this.energyItem.querySelector('.value')!;
      valueEl.textContent = formatMW(state.totalEnergyMW);
      const rateEl = this.energyItem.querySelector('.rate')!;
      rateEl.textContent = '';
    }


    // Update Breakdown Panel
    const breakdownEl = this.container.querySelector('#top-bar-breakdown')!;
    if (this.container.classList.contains('is-expanded')) {
       this.renderBreakdown(breakdownEl, state);
    }
  }

  private renderBreakdown(container: Element, state: GameState): void {
    let html = '<div class="breakdown-grid">';
    
    // Funds
    html += this.renderBreakdownSection('Funds ($/min)', state.resourceBreakdown.funds, formatMoney);
    
    // Code
    html += this.renderBreakdownSection('Code (u/min)', state.resourceBreakdown.code, (v) => formatNumber(v));
    
    // Science
    html += this.renderBreakdownSection('Science (u/min)', state.resourceBreakdown.science, (v) => formatNumber(v));
    
    // Labor
    html += this.renderBreakdownSection('Labor (u/min)', state.resourceBreakdown.labor, (v) => formatNumber(v));


    // Energy
    if (state.spaceUnlocked) {
      html += '<div class="breakdown-section">';
      html += '<div class="section-title">Energy</div>';
      html += `<div class="breakdown-row"><span class="label">Earth</span><span class="value">${formatMW(state.powerSupplyMW)} supply / ${formatMW(state.powerDemandMW)} demand</span></div>`;
      if (state.lunarBase) {
        html += `<div class="breakdown-row"><span class="label">Lunar</span><span class="value">${formatMW(state.lunarPowerSupplyMW)} supply / ${formatMW(state.lunarPowerDemandMW)} demand</span></div>`;
      }
      if (state.satellites > 0n) {
        html += `<div class="breakdown-row"><span class="label">Orbital</span><span class="value">${formatMW(state.orbitalPowerMW)} (self-sufficient)</span></div>`;
      }
      html += '</div>';
    }

    // Compute
    if (state.isPostGpuTransition) {
      html += '<div class="breakdown-section">';
      html += '<div class="section-title">Compute (PFLOPS)</div>';
      for (const item of state.resourceBreakdown.compute) {
        const pflopsNum = typeof item.pflops === 'bigint' ? Number(item.pflops) / 1_000_000 : item.pflops;
        html += `<div class="breakdown-row"><span class="label">${item.label}</span><span class="value">${(Math.round(pflopsNum * 10) / 10).toString()}</span></div>`;
      }

      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  private renderBreakdownSection(title: string, data: { income: any[], expense: any[] }, formatter: (v: bigint) => string): string {
    if (data.income.length === 0 && data.expense.length === 0) return '';
    
    let html = '<div class="breakdown-section">';
    html += `<div class="section-title">${title}</div>`;
    
    for (const item of data.income) {
      html += `<div class="breakdown-row"><span class="label">${item.label}</span><span class="value income">+${formatter(item.ratePerMin)}</span></div>`;
    }
    for (const item of data.expense) {
      html += `<div class="breakdown-row"><span class="label">${item.label}</span><span class="value expense">-${formatter(item.ratePerMin)}</span></div>`;
    }
    
    html += '</div>';
    return html;
  }
}
