import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import type { ResearchId } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber } from '../../game/utils.ts';
import {
  buyTrainingData, startFineTune, startAriesTraining,
  setTrainingAllocation,
} from '../../game/systems/TrainingSystem.ts';
import {
  getAvailableResearch, purchaseResearch, setSynthDataAllocation,
} from '../../game/systems/ResearchSystem.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';

// --- Pre-built sub-section refs ---

interface TrainingProgressRefs {
  container: HTMLDivElement;
  label: HTMLDivElement;
  barFill: HTMLDivElement;
  detail: HTMLDivElement;
}

interface TrainingNextRefs {
  container: HTMLDivElement;
  info: HTMLDivElement;
  reqs: HTMLDivElement;
  btn: HTMLButtonElement;
}

interface AllocationRefs {
  row: HTMLDivElement;
  minusBtn: HTMLButtonElement;
  pctLabel: HTMLSpanElement;
  plusBtn: HTMLButtonElement;
  hint: HTMLDivElement;
}

interface DataRefs {
  info: HTMLSpanElement;
  bulkBuy: BulkBuyGroup;
}

export class TrainingPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private currentModelEl!: HTMLSpanElement;

  // Training section
  private progressRefs!: TrainingProgressRefs;
  private nextRefs!: TrainingNextRefs;
  private lastTrainingMode: string = '';

  // Data section
  private dataRefs!: DataRefs;

  // Allocation
  private allocRefs!: AllocationRefs;

  // Research
  private researchSection!: HTMLDivElement;
  private synthRow!: HTMLDivElement;
  private synthInfo!: HTMLSpanElement;
  private synthOffBtn!: HTMLButtonElement;
  private synthIncBtn!: HTMLButtonElement;
  private researchListEl!: HTMLDivElement;
  private researchDoneEl!: HTMLDivElement;
  private researchRows: Map<ResearchId, { row: HTMLDivElement; btn: HTMLButtonElement }> = new Map();

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

    // Training section title
    const trainTitle = document.createElement('div');
    trainTitle.className = 'panel-section-title';
    trainTitle.textContent = 'TRAINING';
    body.appendChild(trainTitle);

    // Training: progress view (hidden by default)
    this.progressRefs = this.buildProgressView(body);

    // Training: next action view (hidden by default)
    this.nextRefs = this.buildNextView(body);

    // Data section
    this.dataRefs = this.buildDataSection(body);

    // Allocation section
    this.allocRefs = this.buildAllocationSection(body);

    // Research section
    this.researchSection = document.createElement('div');
    this.researchSection.className = 'panel-section hidden';
    this.buildResearchSection(this.researchSection);
    body.appendChild(this.researchSection);

    this.el.appendChild(body);
  }

  // --- Build helpers ---

  private buildProgressView(parent: HTMLElement): TrainingProgressRefs {
    const container = document.createElement('div');
    container.style.padding = '4px 0';
    container.style.display = 'none';

    const label = document.createElement('div');
    label.style.fontSize = '0.82rem';
    container.appendChild(label);

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const barFill = document.createElement('div');
    barFill.className = 'progress-bar-fill';
    barFill.style.background = 'var(--accent-purple)';
    bar.appendChild(barFill);
    container.appendChild(bar);

    const detail = document.createElement('div');
    detail.style.fontSize = '0.72rem';
    detail.style.color = 'var(--text-muted)';
    container.appendChild(detail);

    parent.appendChild(container);
    return { container, label, barFill, detail };
  }

  private buildNextView(parent: HTMLElement): TrainingNextRefs {
    const container = document.createElement('div');
    container.style.fontSize = '0.82rem';
    container.style.padding = '4px 0';
    container.style.display = 'none';

    const info = document.createElement('div');
    container.appendChild(info);

    const reqs = document.createElement('div');
    reqs.style.color = 'var(--text-secondary)';
    reqs.style.fontSize = '0.75rem';
    container.appendChild(reqs);

    const btn = document.createElement('button');
    btn.style.marginTop = '4px';
    container.appendChild(btn);

    parent.appendChild(container);
    return { container, info, reqs, btn };
  }

  private buildDataSection(parent: HTMLElement): DataRefs {
    const section = document.createElement('div');
    section.className = 'panel-section';

    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.fontSize = '0.82rem';

    const info = document.createElement('span');
    info.className = 'label';
    row.appendChild(info);

    const bulkBuy = new BulkBuyGroup((amount) => buyTrainingData(this.state, amount));
    row.appendChild(bulkBuy.el);

    section.appendChild(row);
    parent.appendChild(section);
    return { info, bulkBuy };
  }

  private buildAllocationSection(parent: HTMLElement): AllocationRefs {
    const section = document.createElement('div');
    section.className = 'panel-section';

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
    minusBtn.addEventListener('click', () => {
        setTrainingAllocation(this.state, this.state.trainingAllocationPct - 5);
    });
    controls.appendChild(minusBtn);

    const pctLabel = document.createElement('span');
    pctLabel.className = 'value';
    pctLabel.style.minWidth = '36px';
    pctLabel.style.textAlign = 'center';
    controls.appendChild(pctLabel);

    const plusBtn = document.createElement('button');
    plusBtn.textContent = '+5%';
    plusBtn.style.fontSize = '0.75rem';
    plusBtn.addEventListener('click', () => {
        const success = setTrainingAllocation(this.state, this.state.trainingAllocationPct + 5);
        if (!success) {
             // Flash API Allocation controls
             const event = new CustomEvent('flash-api-allocation');
             document.dispatchEvent(event);
        }
    });
    controls.appendChild(plusBtn);

    // Listen for flash event from ComputePanel
    document.addEventListener('flash-training-allocation', () => {
        pctLabel.classList.remove('flash-red');
        void pctLabel.offsetWidth;
        pctLabel.classList.add('flash-red');
    });

    row.appendChild(controls);
    section.appendChild(row);

    const hint = document.createElement('div');
    hint.style.fontSize = '0.72rem';
    hint.style.color = 'var(--accent-red)';
    hint.style.display = 'none';
    hint.textContent = 'Set allocation above 0% to train!';
    section.appendChild(hint);

    parent.appendChild(section);
    return { row, minusBtn, pctLabel, plusBtn, hint };
  }

  private buildResearchSection(container: HTMLDivElement): void {
    const divider = this.createDivider();
    container.appendChild(divider);

    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = 'RESEARCH';
    container.appendChild(title);

    // Synth data row (hidden initially)
    this.synthRow = document.createElement('div');
    this.synthRow.className = 'panel-row';
    this.synthRow.style.fontSize = '0.82rem';
    this.synthRow.style.display = 'none';

    this.synthInfo = document.createElement('span');
    this.synthInfo.className = 'label';
    this.synthRow.appendChild(this.synthInfo);

    const synthBtns = document.createElement('span');
    synthBtns.style.display = 'flex';
    synthBtns.style.gap = '3px';

    this.synthOffBtn = document.createElement('button');
    this.synthOffBtn.textContent = 'Off';
    this.synthOffBtn.style.fontSize = '0.72rem';
    this.synthOffBtn.addEventListener('click', () => setSynthDataAllocation(this.state, 0));
    synthBtns.appendChild(this.synthOffBtn);

    this.synthIncBtn = document.createElement('button');
    this.synthIncBtn.style.fontSize = '0.72rem';
    this.synthIncBtn.addEventListener('click', () => {
      const incStep = Math.max(5, Math.round(this.state.freeCompute * 0.1));
      setSynthDataAllocation(this.state, this.state.synthDataAllocPflops + incStep);
    });
    synthBtns.appendChild(this.synthIncBtn);

    this.synthRow.appendChild(synthBtns);
    container.appendChild(this.synthRow);

    // Research list container
    this.researchListEl = document.createElement('div');
    container.appendChild(this.researchListEl);

    // Completed research
    this.researchDoneEl = document.createElement('div');
    this.researchDoneEl.style.fontSize = '0.72rem';
    this.researchDoneEl.style.color = 'var(--text-muted)';
    this.researchDoneEl.style.padding = '4px 0';
    container.appendChild(this.researchDoneEl);
  }

  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  // --- Update ---

  update(state: GameState): void {
    this.state = state;

    this.currentModelEl.textContent = this.getCurrentModelName(state) + ' (Intel ' + state.intelligence.toFixed(1) + ')';

    this.updateTraining(state);
    this.updateData(state);
    this.updateAllocation(state);
    this.updateResearch(state);
  }

  private getCurrentModelName(state: GameState): string {
    for (let i = BALANCE.ariesModels.length - 1; i >= 0; i--) {
      if (state.intelligence >= BALANCE.ariesModels[i].intel) {
        return BALANCE.ariesModels[i].name;
      }
    }
    for (let i = BALANCE.fineTunes.length - 1; i >= 0; i--) {
      if (state.completedFineTunes.includes(i)) {
        return BALANCE.fineTunes[i].name;
      }
    }
    return BALANCE.models[state.currentModelIndex].name;
  }

  private updateTraining(state: GameState): void {
    if (state.currentFineTuneIndex >= 0) {
      // Show progress
      const ft = BALANCE.fineTunes[state.currentFineTuneIndex];
      const pct = Math.min(100, (state.fineTuneProgress / ft.pflopsHrs) * 100);
      this.progressRefs.container.style.display = '';
      this.nextRefs.container.style.display = 'none';
      this.progressRefs.label.innerHTML = 'Training: <strong>' + ft.name + '</strong> ' + pct.toFixed(1) + '%';
      this.progressRefs.barFill.style.width = pct + '%';
      this.progressRefs.detail.textContent = formatNumber(state.fineTuneProgress) + ' / ' + formatNumber(ft.pflopsHrs) + ' PFLOPS-hrs';
    } else if (state.ariesModelIndex >= 0) {
      const am = BALANCE.ariesModels[state.ariesModelIndex];
      const pct = Math.min(100, (state.ariesProgress / am.pflopsHrs) * 100);
      this.progressRefs.container.style.display = '';
      this.nextRefs.container.style.display = 'none';
      this.progressRefs.label.innerHTML = 'Training: <strong>' + am.name + '</strong> ' + pct.toFixed(1) + '%';
      this.progressRefs.barFill.style.width = pct + '%';
      this.progressRefs.detail.textContent = formatNumber(state.ariesProgress) + ' / ' + formatNumber(am.pflopsHrs) + ' PFLOPS-hrs';
    } else {
      this.progressRefs.container.style.display = 'none';
      // Show next available
      const nextFT = this.getNextFineTune(state);
      if (nextFT !== null) {
        const ft = BALANCE.fineTunes[nextFT];
        this.nextRefs.container.style.display = '';
        this.nextRefs.info.innerHTML = '<strong style="color:var(--accent-green)">' + ft.name + '</strong> (Intel ' + ft.intel + ')';
        let reqText = formatNumber(ft.pflopsHrs) + ' PFLOPS-hrs + ' + formatNumber(ft.dataTB) + ' TB data';
        if (ft.codeReq > 0) reqText += ' + ' + ft.codeReq + ' Code';
        this.nextRefs.reqs.textContent = reqText;
        this.nextRefs.btn.textContent = 'Start Fine-tune';

        // Rebind click — use a mode key to avoid stale closures
        const mode = 'ft-' + nextFT;
        if (this.lastTrainingMode !== mode) {
          this.lastTrainingMode = mode;
          const newBtn = this.nextRefs.btn.cloneNode(true) as HTMLButtonElement;
          this.nextRefs.btn.replaceWith(newBtn);
          this.nextRefs.btn = newBtn;
          newBtn.addEventListener('click', () => startFineTune(this.state, nextFT));
        }

        const canStart = state.trainingData >= ft.dataTB && (ft.codeReq === 0 || state.code >= ft.codeReq);
        this.nextRefs.btn.disabled = !canStart;
      } else {
        const nextAries = this.getNextAries(state);
        if (nextAries !== null) {
          const am = BALANCE.ariesModels[nextAries];
          this.nextRefs.container.style.display = '';
          this.nextRefs.info.innerHTML = '<strong style="color:var(--accent-purple)">' + am.name + '</strong> (Intel ~' + am.intel + ')';
          let reqText = formatNumber(am.pflopsHrs) + ' PFLOPS-hrs + ' + formatNumber(am.dataTB) + ' TB data';
          if (am.codeReq > 0) reqText += ' + ' + am.codeReq + ' Code';
          this.nextRefs.reqs.textContent = reqText;
          this.nextRefs.btn.textContent = 'Start Training';

          const mode = 'aries-' + nextAries;
          if (this.lastTrainingMode !== mode) {
            this.lastTrainingMode = mode;
            const newBtn = this.nextRefs.btn.cloneNode(true) as HTMLButtonElement;
            this.nextRefs.btn.replaceWith(newBtn);
            this.nextRefs.btn = newBtn;
            newBtn.addEventListener('click', () => startAriesTraining(this.state, nextAries));
          }

          const canStart = state.trainingData >= am.dataTB && (am.codeReq === 0 || state.code >= am.codeReq);
          this.nextRefs.btn.disabled = !canStart;
        } else {
          this.nextRefs.container.style.display = 'none';
        }
      }
    }
  }

  private updateData(state: GameState): void {
    const pricePerTB = BALANCE.dataBaseCostPerTB * Math.pow(1 + BALANCE.dataEscalationRate, state.trainingDataPurchases);
    this.dataRefs.info.innerHTML = 'Data: ' + formatNumber(state.trainingData) + ' TB <span style="font-size:0.75em;color:var(--text-muted)">Cost: ' + formatMoney(pricePerTB) + '/TB</span>';

    this.dataRefs.bulkBuy.update(state.trainingData, (amount) => {
      return state.funds >= amount * pricePerTB;
    });
  }

  private updateAllocation(state: GameState): void {
    this.allocRefs.pctLabel.textContent = state.trainingAllocationPct + '%';
    this.allocRefs.minusBtn.disabled = state.trainingAllocationPct <= 0;
    this.allocRefs.plusBtn.disabled = state.trainingAllocationPct >= 95;

    if (state.trainingAllocationPct === 0 && (state.currentFineTuneIndex >= 0 || state.ariesModelIndex >= 0)) {
      this.allocRefs.hint.style.display = '';
      this.allocRefs.pctLabel.style.color = 'var(--accent-red)';
    } else {
      this.allocRefs.hint.style.display = 'none';
      this.allocRefs.pctLabel.style.color = '';
    }
  }

  private updateResearch(state: GameState): void {
    if (state.intelligence < BALANCE.researchUnlockIntel) {
      this.researchSection.classList.add('hidden');
      return;
    }
    this.researchSection.classList.remove('hidden');

    // Synth data
    if (state.synthDataUnlocked) {
      this.synthRow.style.display = '';
      let synthText = 'Synth Data: ' + formatNumber(state.synthDataRate) + ' TB/min';
      if (state.synthDataAllocPflops > 0) {
        synthText += ' (' + formatNumber(state.synthDataAllocPflops) + ' PFLOPS)';
      }
      this.synthInfo.textContent = synthText;
      this.synthOffBtn.disabled = state.synthDataAllocPflops === 0;

      const incStep = Math.max(5, Math.round(state.freeCompute * 0.1));
      this.synthIncBtn.textContent = '+' + formatNumber(incStep) + ' PFLOPS';
      this.synthIncBtn.disabled = state.freeCompute <= 0;
    } else {
      this.synthRow.style.display = 'none';
    }

    // Available research — reconcile existing rows
    const available = getAvailableResearch(state);
    const availableIds = new Set(available.map(r => r.id));

    // Remove rows for research no longer available
    for (const [id, refs] of this.researchRows) {
      if (!availableIds.has(id)) {
        refs.row.remove();
        this.researchRows.delete(id);
      }
    }

    // Add/update rows for available research
    for (const r of available) {
      let refs = this.researchRows.get(r.id);
      if (!refs) {
        const row = document.createElement('div');
        row.className = 'panel-row';
        row.style.fontSize = '0.82rem';
        row.style.padding = '3px 0';

        const info = document.createElement('span');
        info.className = 'label';
        info.innerHTML = '<strong>' + r.name + '</strong> <span style="font-size:0.72rem;color:var(--text-secondary)">' + r.description + '</span>';
        row.appendChild(info);

        const btn = document.createElement('button');
        btn.textContent = formatNumber(r.cost) + ' Science';
        btn.style.fontSize = '0.72rem';
        btn.addEventListener('click', () => purchaseResearch(this.state, r.id));
        row.appendChild(btn);

        this.researchListEl.appendChild(row);
        refs = { row, btn };
        this.researchRows.set(r.id, refs);
      }
      refs.btn.disabled = state.science < r.cost;
    }

    // Completed research
    if (state.completedResearch.length > 0) {
      const names = state.completedResearch.map(id => {
        const cfg = BALANCE.research.find(r => r.id === id);
        return cfg ? cfg.name : id;
      });
      this.researchDoneEl.textContent = 'Done: ' + names.join(' · ');
      this.researchDoneEl.style.display = '';
    } else {
      this.researchDoneEl.style.display = 'none';
    }
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
