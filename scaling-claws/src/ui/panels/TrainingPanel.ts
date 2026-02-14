import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber } from '../../game/utils.ts';
import {
  buyTrainingData, startFineTune, startAriesTraining,
  setTrainingAllocation, hireSoftwareDev, hireAIResearcher,
} from '../../game/systems/TrainingSystem.ts';

export class TrainingPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private currentModelEl!: HTMLSpanElement;
  private trainingSection!: HTMLDivElement;
  private dataSection!: HTMLDivElement;
  private allocationSection!: HTMLDivElement;
  private staffSection!: HTMLDivElement;
  private researchSection!: HTMLDivElement;

  constructor(state: GameState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.build();
  }

  private build(): void {
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'TRAINING & RESEARCH';
    this.el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';

    // Current model
    const modelRow = document.createElement('div');
    modelRow.className = 'panel-row';
    const modelLabel = document.createElement('span');
    modelLabel.className = 'label';
    modelLabel.textContent = 'Current model:';
    this.currentModelEl = document.createElement('span');
    this.currentModelEl.className = 'value';
    this.currentModelEl.style.fontWeight = '600';
    modelRow.appendChild(modelLabel);
    modelRow.appendChild(this.currentModelEl);
    body.appendChild(modelRow);

    body.appendChild(this.createDivider());

    // Training section (fine-tunes / Aries)
    const trainTitle = document.createElement('div');
    trainTitle.className = 'panel-section-title';
    trainTitle.textContent = 'TRAINING';
    body.appendChild(trainTitle);

    this.trainingSection = document.createElement('div');
    this.trainingSection.className = 'panel-section';
    body.appendChild(this.trainingSection);

    // Data section
    this.dataSection = document.createElement('div');
    this.dataSection.className = 'panel-section';
    body.appendChild(this.dataSection);

    // Allocation
    this.allocationSection = document.createElement('div');
    this.allocationSection.className = 'panel-section';
    body.appendChild(this.allocationSection);

    body.appendChild(this.createDivider());

    // Staff section (devs, researchers)
    const staffTitle = document.createElement('div');
    staffTitle.className = 'panel-section-title';
    staffTitle.textContent = 'STAFF';
    body.appendChild(staffTitle);

    this.staffSection = document.createElement('div');
    this.staffSection.className = 'panel-section';
    body.appendChild(this.staffSection);

    // Research section
    this.researchSection = document.createElement('div');
    this.researchSection.className = 'panel-section hidden';
    body.appendChild(this.researchSection);

    this.el.appendChild(body);
  }

  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  update(state: GameState): void {
    this.state = state;

    // Current model name
    this.currentModelEl.textContent = this.getCurrentModelName(state) + ' (Intel ' + state.intelligence.toFixed(1) + ')';

    this.updateTraining(state);
    this.updateData(state);
    this.updateAllocation(state);
    this.updateStaff(state);
    this.updateResearch(state);
  }

  private getCurrentModelName(state: GameState): string {
    // Check Aries first (highest priority)
    for (let i = BALANCE.ariesModels.length - 1; i >= 0; i--) {
      if (state.intelligence >= BALANCE.ariesModels[i].intel) {
        return BALANCE.ariesModels[i].name;
      }
    }
    // Check fine-tunes
    for (let i = BALANCE.fineTunes.length - 1; i >= 0; i--) {
      if (state.completedFineTunes.includes(i)) {
        return BALANCE.fineTunes[i].name;
      }
    }
    // Base DeepKick model
    return BALANCE.models[state.currentModelIndex].name;
  }

  private updateTraining(state: GameState): void {
    this.trainingSection.innerHTML = '';

    // Active training progress
    if (state.currentFineTuneIndex >= 0) {
      const ft = BALANCE.fineTunes[state.currentFineTuneIndex];
      const pct = Math.min(100, (state.fineTuneProgress / ft.pflopsHrs) * 100);
      this.addProgressRow(ft.name, pct, ft.pflopsHrs, state.fineTuneProgress);
    } else if (state.ariesModelIndex >= 0) {
      const am = BALANCE.ariesModels[state.ariesModelIndex];
      const pct = Math.min(100, (state.ariesProgress / am.pflopsHrs) * 100);
      this.addProgressRow(am.name, pct, am.pflopsHrs, state.ariesProgress);
    } else {
      // Show next available training
      const nextFT = this.getNextFineTune(state);
      if (nextFT !== null) {
        const ft = BALANCE.fineTunes[nextFT];
        const row = document.createElement('div');
        row.style.fontSize = '0.82rem';
        row.style.padding = '4px 0';

        const info = document.createElement('div');
        info.innerHTML = '<strong style="color:var(--accent-green)">' + ft.name + '</strong> (Intel ' + ft.intel + ')';
        row.appendChild(info);

        const reqs = document.createElement('div');
        reqs.style.color = 'var(--text-secondary)';
        reqs.style.fontSize = '0.75rem';
        reqs.textContent = formatNumber(ft.pflopsHrs) + ' PFLOPS-hrs + ' + formatNumber(ft.dataTB) + ' TB data';
        if (ft.codeReq > 0) reqs.textContent += ' + ' + ft.codeReq + ' Code';
        row.appendChild(reqs);

        const btn = document.createElement('button');
        btn.textContent = 'Start Fine-tune';
        btn.style.marginTop = '4px';
        const canStart = state.trainingData >= ft.dataTB && (ft.codeReq === 0 || state.code >= ft.codeReq) && state.trainingAllocationPct > 0;
        btn.disabled = !canStart;
        btn.addEventListener('click', () => startFineTune(this.state, nextFT));
        row.appendChild(btn);

        this.trainingSection.appendChild(row);
      } else {
        // Show next Aries model
        const nextAries = this.getNextAries(state);
        if (nextAries !== null) {
          const am = BALANCE.ariesModels[nextAries];
          const row = document.createElement('div');
          row.style.fontSize = '0.82rem';
          row.style.padding = '4px 0';

          const info = document.createElement('div');
          info.innerHTML = '<strong style="color:var(--accent-purple)">' + am.name + '</strong> (Intel ~' + am.intel + ')';
          row.appendChild(info);

          const reqs = document.createElement('div');
          reqs.style.color = 'var(--text-secondary)';
          reqs.style.fontSize = '0.75rem';
          reqs.textContent = formatNumber(am.pflopsHrs) + ' PFLOPS-hrs + ' + formatNumber(am.dataTB) + ' TB data';
          if (am.codeReq > 0) reqs.textContent += ' + ' + am.codeReq + ' Code';
          row.appendChild(reqs);

          const btn = document.createElement('button');
          btn.textContent = 'Start Training';
          btn.style.marginTop = '4px';
          const canStart = state.trainingData >= am.dataTB && (am.codeReq === 0 || state.code >= am.codeReq) && state.trainingAllocationPct > 0;
          btn.disabled = !canStart;
          btn.addEventListener('click', () => startAriesTraining(this.state, nextAries));
          row.appendChild(btn);

          this.trainingSection.appendChild(row);
        }
      }
    }
  }

  private addProgressRow(name: string, pct: number, total: number, current: number): void {
    const row = document.createElement('div');
    row.style.padding = '4px 0';

    const label = document.createElement('div');
    label.style.fontSize = '0.82rem';
    label.innerHTML = 'Training: <strong>' + name + '</strong> ' + pct.toFixed(1) + '%';
    row.appendChild(label);

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    fill.style.width = pct + '%';
    fill.style.background = 'var(--accent-purple)';
    bar.appendChild(fill);
    row.appendChild(bar);

    const detail = document.createElement('div');
    detail.style.fontSize = '0.72rem';
    detail.style.color = 'var(--text-muted)';
    detail.textContent = formatNumber(current) + ' / ' + formatNumber(total) + ' PFLOPS-hrs';
    row.appendChild(detail);

    this.trainingSection.appendChild(row);
  }

  private updateData(state: GameState): void {
    this.dataSection.innerHTML = '';

    const pricePerTB = BALANCE.dataBaseCostPerTB * Math.pow(1 + BALANCE.dataEscalationRate, state.trainingDataPurchases);

    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.fontSize = '0.82rem';

    const info = document.createElement('span');
    info.className = 'label';
    info.textContent = 'Data: ' + formatNumber(state.trainingData) + ' TB';
    row.appendChild(info);

    const btn = document.createElement('button');
    const batchTB = Math.max(10, Math.round(state.trainingData * 0.1) || 10);
    const batchCost = batchTB * pricePerTB;
    btn.textContent = 'Buy ' + formatNumber(batchTB) + ' TB ' + formatMoney(batchCost);
    btn.style.fontSize = '0.75rem';
    btn.disabled = state.funds < batchCost;
    btn.addEventListener('click', () => buyTrainingData(this.state, batchTB));
    row.appendChild(btn);

    this.dataSection.appendChild(row);
  }

  private updateAllocation(state: GameState): void {
    this.allocationSection.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'panel-row';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'Training allocation:';
    row.appendChild(label);

    const controls = document.createElement('span');
    controls.style.display = 'flex';
    controls.style.gap = '4px';
    controls.style.alignItems = 'center';

    const minusBtn = document.createElement('button');
    minusBtn.textContent = '-5%';
    minusBtn.style.fontSize = '0.75rem';
    minusBtn.disabled = state.trainingAllocationPct <= 0;
    minusBtn.addEventListener('click', () => setTrainingAllocation(this.state, state.trainingAllocationPct - 5));

    const pctLabel = document.createElement('span');
    pctLabel.className = 'value';
    pctLabel.textContent = state.trainingAllocationPct + '%';
    pctLabel.style.minWidth = '36px';
    pctLabel.style.textAlign = 'center';

    const plusBtn = document.createElement('button');
    plusBtn.textContent = '+5%';
    plusBtn.style.fontSize = '0.75rem';
    plusBtn.disabled = state.trainingAllocationPct >= 95;
    plusBtn.addEventListener('click', () => setTrainingAllocation(this.state, state.trainingAllocationPct + 5));

    controls.appendChild(minusBtn);
    controls.appendChild(pctLabel);
    controls.appendChild(plusBtn);
    row.appendChild(controls);

    this.allocationSection.appendChild(row);

    if (state.trainingAllocationPct === 0 && (state.currentFineTuneIndex >= 0 || state.ariesModelIndex >= 0)) {
      const hint = document.createElement('div');
      hint.style.fontSize = '0.72rem';
      hint.style.color = 'var(--accent-red)';
      hint.textContent = 'Set allocation above 0% to train!';
      this.allocationSection.appendChild(hint);
    }
  }

  private updateStaff(state: GameState): void {
    this.staffSection.innerHTML = '';

    // Software Devs
    const devRow = document.createElement('div');
    devRow.className = 'panel-row';
    devRow.style.fontSize = '0.82rem';

    const devInfo = document.createElement('span');
    devInfo.className = 'label';
    devInfo.textContent = 'Software Devs: ' + state.humanSoftwareDevs + ' human, ' + state.aiSoftwareDevs + ' AI → ' + formatNumber(state.codePerMin) + ' Code/min';
    devRow.appendChild(devInfo);

    const devBtns = document.createElement('span');
    devBtns.style.display = 'flex';
    devBtns.style.gap = '3px';

    const hireHumanBtn = document.createElement('button');
    hireHumanBtn.textContent = '+Human';
    hireHumanBtn.style.fontSize = '0.72rem';
    hireHumanBtn.disabled = state.funds < BALANCE.humanDevCostPerMin;
    hireHumanBtn.addEventListener('click', () => hireSoftwareDev(this.state, false));
    devBtns.appendChild(hireHumanBtn);

    if (state.intelligence >= 4.0) {
      const hireAIBtn = document.createElement('button');
      hireAIBtn.textContent = '+AI';
      hireAIBtn.style.fontSize = '0.72rem';
      hireAIBtn.addEventListener('click', () => hireSoftwareDev(this.state, true));
      devBtns.appendChild(hireAIBtn);
    }

    devRow.appendChild(devBtns);
    this.staffSection.appendChild(devRow);

    // Code display
    const codeRow = document.createElement('div');
    codeRow.className = 'panel-row';
    codeRow.style.fontSize = '0.82rem';
    const codeLabel = document.createElement('span');
    codeLabel.className = 'label';
    codeLabel.textContent = 'Code:';
    const codeVal = document.createElement('span');
    codeVal.className = 'value';
    codeVal.textContent = formatNumber(state.code);
    codeRow.appendChild(codeLabel);
    codeRow.appendChild(codeVal);
    this.staffSection.appendChild(codeRow);

    // AI Researchers (if Intel >= 12)
    if (state.intelligence >= 12.0 || state.aiResearchers > 0) {
      const resRow = document.createElement('div');
      resRow.className = 'panel-row';
      resRow.style.fontSize = '0.82rem';

      const resInfo = document.createElement('span');
      resInfo.className = 'label';
      resInfo.textContent = 'AI Researchers: ' + state.aiResearchers + ' → ' + formatNumber(state.sciencePerMin) + ' Science/min';
      resRow.appendChild(resInfo);

      const resBtn = document.createElement('button');
      resBtn.textContent = '+Researcher';
      resBtn.style.fontSize = '0.72rem';
      resBtn.disabled = state.intelligence < 12.0;
      resBtn.addEventListener('click', () => hireAIResearcher(this.state));
      resRow.appendChild(resBtn);

      this.staffSection.appendChild(resRow);

      // Science display
      const sciRow = document.createElement('div');
      sciRow.className = 'panel-row';
      sciRow.style.fontSize = '0.82rem';
      const sciLabel = document.createElement('span');
      sciLabel.className = 'label';
      sciLabel.textContent = 'Science:';
      const sciVal = document.createElement('span');
      sciVal.className = 'value';
      sciVal.style.color = 'var(--accent-blue)';
      sciVal.textContent = formatNumber(state.science);
      sciRow.appendChild(sciLabel);
      sciRow.appendChild(sciVal);
      this.staffSection.appendChild(sciRow);
    }
  }

  private updateResearch(_state: GameState): void {
    // Research tree will be implemented in Milestone 4
    // For now, just show science accumulation
  }

  private getNextFineTune(state: GameState): number | null {
    for (let i = 0; i < BALANCE.fineTunes.length; i++) {
      if (!state.completedFineTunes.includes(i)) return i;
    }
    return null;
  }

  private getNextAries(state: GameState): number | null {
    for (let i = 0; i < BALANCE.ariesModels.length; i++) {
      const am = BALANCE.ariesModels[i];
      if (state.intelligence < am.intel) return i;
    }
    return null;
  }
}
