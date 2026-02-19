import type { GameState } from '../game/GameState.ts';
import { formatFlops, formatNumber, formatMW } from '../game/utils.ts';
import { deleteSave } from '../game/SaveManager.ts';
import { emojiHtml, locationLabelHtml, moneyWithEmojiHtml, resourceLabelHtml } from './emoji.ts';

export class TopBar {
  private container: HTMLElement;
  private fundsValueEl!: HTMLSpanElement;
  private fundsIncomeEl!: HTMLSpanElement;
  private fundsExpenseEl!: HTMLSpanElement;
  private intelValueEl!: HTMLSpanElement;
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

    const breakdownPanel = document.createElement('div');
    breakdownPanel.id = 'top-bar-breakdown';
    breakdownPanel.className = 'hidden';
    this.container.appendChild(breakdownPanel);

    const fundsItem = this.createResourceItem('Funds', 'funds');
    fundsItem.dataset.resource = 'funds';
    this.fundsValueEl = fundsItem.querySelector('.value')!;
    this.fundsIncomeEl = fundsItem.querySelector('[data-role="income"]')!;
    this.fundsExpenseEl = fundsItem.querySelector('[data-role="expense"]')!;
    this.container.appendChild(fundsItem);

    this.container.appendChild(this.createSeparator());

    const intelItem = this.createItem('Intel', 'intel');
    this.intelValueEl = intelItem.querySelector('.value')!;
    intelItem.querySelector('.rate')!.remove();
    this.container.appendChild(intelItem);

    this.flopsItem = this.createItem('FLOPS', 'flops');
    this.flopsItem.dataset.resource = 'compute';
    this.flopsItem.classList.add('hidden');
    this.container.appendChild(this.flopsItem);

    this.codeItem = this.createResourceItem('Code', 'code');
    this.codeItem.dataset.resource = 'code';
    this.codeItem.classList.add('hidden');
    this.container.appendChild(this.codeItem);

    this.scienceItem = this.createResourceItem('Science', 'science');
    this.scienceItem.dataset.resource = 'science';
    this.scienceItem.classList.add('hidden');
    this.container.appendChild(this.scienceItem);

    this.laborItem = this.createResourceItem('Labor', 'labor');
    this.laborItem.dataset.resource = 'labor';
    this.laborItem.classList.add('hidden');
    this.container.appendChild(this.laborItem);

    this.energyItem = this.createItem('Energy', 'energy');
    this.energyItem.classList.add('hidden');
    this.container.appendChild(this.energyItem);

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.container.appendChild(spacer);

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

    this.container.onmouseenter = () => {
      this.container.classList.add('is-expanded');
      breakdownPanel.classList.remove('hidden');
    };
    this.container.onmouseleave = () => {
      this.container.classList.remove('is-expanded');
      breakdownPanel.classList.add('hidden');
    };
  }

  private createItem(label: string, emojiKey?: Parameters<typeof emojiHtml>[0]): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'top-bar-item';

    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.innerHTML = emojiKey ? `${emojiHtml(emojiKey)} ${label}:` : `${label}:`;
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

  private createResourceItem(label: string, emojiKey?: Parameters<typeof emojiHtml>[0]): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'top-bar-item';

    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.innerHTML = emojiKey ? `${emojiHtml(emojiKey)} ${label}:` : `${label}:`;
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
    this.fundsValueEl.innerHTML = moneyWithEmojiHtml(state.funds, 'funds');
    this.fundsIncomeEl.innerHTML = state.incomePerMin > 0n ? '+' + moneyWithEmojiHtml(state.incomePerMin, 'funds') + '/m' : '';
    this.fundsExpenseEl.innerHTML = state.expensePerMin > 0n ? '-' + moneyWithEmojiHtml(state.expensePerMin, 'funds') + '/m' : '';

    this.intelValueEl.textContent = (Math.round(state.intelligence * 10) / 10).toString();

    if (state.isPostGpuTransition) {
      this.flopsItem.classList.remove('hidden');
      const totalFlops = state.totalPflopsDisplay > 0n ? state.totalPflopsDisplay : state.totalPflops;
      this.flopsItem.querySelector('.value')!.textContent = formatFlops(totalFlops);
    }

    if (state.code > 0n || state.codePerMin > 0n) {
      this.codeItem.classList.remove('hidden');
      this.codeItem.querySelector('.value')!.textContent = formatNumber(state.code);
      const incomeEl = this.codeItem.querySelector('[data-role="income"]') as HTMLSpanElement;
      const expenseEl = this.codeItem.querySelector('[data-role="expense"]') as HTMLSpanElement;
      incomeEl.textContent = state.codePerMin > 0n ? '+' + formatNumber(state.codePerMin) + '/m' : '';
      expenseEl.textContent = '';
    }

    if (state.science > 0n || state.sciencePerMin > 0n) {
      this.scienceItem.classList.remove('hidden');
      this.scienceItem.querySelector('.value')!.textContent = formatNumber(state.science);
      const incomeEl = this.scienceItem.querySelector('[data-role="income"]') as HTMLSpanElement;
      const expenseEl = this.scienceItem.querySelector('[data-role="expense"]') as HTMLSpanElement;
      incomeEl.textContent = state.sciencePerMin > 0n ? '+' + formatNumber(state.sciencePerMin) + '/m' : '';
      expenseEl.textContent = '';
    }

    // Aggregate labor across Earth/Moon/Mercury
    const earthLabor = state.locationResources?.earth?.labor ?? state.labor;
    const moonLabor = state.locationResources?.moon?.labor ?? 0n;
    const mercuryLabor = state.locationResources?.mercury?.labor ?? 0n;
    const totalLabor = earthLabor + moonLabor + mercuryLabor;

    const moonLaborIncome = state.locationProductionPerMin?.moon?.labor ?? 0n;
    const mercuryLaborIncome = state.locationProductionPerMin?.mercury?.labor ?? 0n;
    const totalLaborIncome = state.laborPerMin + moonLaborIncome + mercuryLaborIncome;

    if (totalLabor > 0n || totalLaborIncome > 0n) {
      this.laborItem.classList.remove('hidden');
      this.laborItem.querySelector('.value')!.textContent = formatNumber(totalLabor);
      const incomeEl = this.laborItem.querySelector('[data-role="income"]') as HTMLSpanElement;
      const expenseEl = this.laborItem.querySelector('[data-role="expense"]') as HTMLSpanElement;
      incomeEl.textContent = totalLaborIncome > 0n ? '+' + formatNumber(totalLaborIncome) + '/m' : '';
      expenseEl.textContent = '';
    }

    if (state.isPostGpuTransition) {
      this.energyItem.classList.remove('hidden');
      const valueEl = this.energyItem.querySelector('.value')!;
      valueEl.textContent = formatMW(state.totalEnergyMW);
      this.energyItem.querySelector('.rate')!.textContent = '';
    }

    const breakdownEl = this.container.querySelector('#top-bar-breakdown')!;
    if (this.container.classList.contains('is-expanded')) {
      this.renderBreakdown(breakdownEl, state);
    }
  }

  private renderBreakdown(container: Element, state: GameState): void {
    let html = '<div class="breakdown-grid">';

    html += this.renderBreakdownSection(`${resourceLabelHtml('funds')} (${emojiHtml('funds')}/min)`, state.resourceBreakdown.funds, (v) => moneyWithEmojiHtml(v, 'funds'));
    html += this.renderBreakdownSection(`${resourceLabelHtml('code')} (u/min)`, state.resourceBreakdown.code, (v) => formatNumber(v));
    html += this.renderBreakdownSection(`${resourceLabelHtml('science')} (u/min)`, state.resourceBreakdown.science, (v) => formatNumber(v));
    html += this.renderBreakdownSection(`${resourceLabelHtml('labor')} (u/min)`, state.resourceBreakdown.labor, (v) => formatNumber(v));

    if (state.isPostGpuTransition) {
      html += '<div class="breakdown-section">';
      html += `<div class="section-title">${resourceLabelHtml('energy')} by Location</div>`;
      html += `<div class="breakdown-row"><span class="label">${locationLabelHtml('earth')}</span><span class="value">Supply ${formatMW(state.powerSupplyMW)} / Demand ${formatMW(state.powerDemandMW)}</span></div>`;
      html += `<div class="breakdown-row"><span class="label">${locationLabelHtml('moon')}</span><span class="value">Supply ${formatMW(state.lunarPowerSupplyMW)} / Demand ${formatMW(state.lunarPowerDemandMW)}</span></div>`;
      html += `<div class="breakdown-row"><span class="label">${locationLabelHtml('mercury')}</span><span class="value">Supply ${formatMW(state.mercuryPowerSupplyMW + (state.dysonSwarmPowerMW ?? 0n))} / Demand ${formatMW(state.mercuryPowerDemandMW)}</span></div>`;
      html += `<div class="breakdown-row"><span class="label">${locationLabelHtml('orbit', 'Space (Orbit)')}</span><span class="value">${formatMW(state.orbitalPowerMW)}</span></div>`;
      html += '</div>';

      html += '<div class="breakdown-section">';
      html += `<div class="section-title">${resourceLabelHtml('flops')} by Location</div>`;
      html += `<div class="breakdown-row"><span class="label">${locationLabelHtml('earth')}</span><span class="value">${formatFlops(state.earthPflops)}</span></div>`;
      html += `<div class="breakdown-row"><span class="label">${locationLabelHtml('moon')}</span><span class="value">${formatFlops(state.moonPflops)}</span></div>`;
      html += `<div class="breakdown-row"><span class="label">${locationLabelHtml('mercury')}</span><span class="value">${formatFlops(state.mercuryPflops)}</span></div>`;
      html += `<div class="breakdown-row"><span class="label">${locationLabelHtml('orbit', 'Space (Orbit)')}</span><span class="value">${formatFlops(state.orbitalPflops)}</span></div>`;
      html += `<div class="breakdown-row"><span class="label">Total</span><span class="value">${formatFlops(state.totalPflopsDisplay > 0n ? state.totalPflopsDisplay : state.totalPflops)}</span></div>`;
      html += '</div>';

      html += '<div class="breakdown-section">';
      html += `<div class="section-title">${resourceLabelHtml('flops', 'Compute Allocation')} (Earth Runtime)</div>`;
      for (const item of state.resourceBreakdown.compute) {
        const pflopsNum = typeof item.pflops === 'bigint' ? Number(item.pflops) / 1_000_000 : item.pflops;
        html += `<div class="breakdown-row"><span class="label">${item.label}</span><span class="value">${(Math.round(pflopsNum * 10) / 10).toString()}</span></div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  private renderBreakdownSection(title: string, data: { income: any[]; expense: any[] }, formatter: (v: bigint) => string): string {
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
