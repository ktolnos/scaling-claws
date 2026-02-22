import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import {
  BALANCE,
  getTrainingDataPricePerGB,
  getTrainingDataPurchaseCost,
  getTrainingDataRemainingPurchaseCapGB,
} from '../../game/BalanceConfig.ts';
import type { ResearchId } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber } from '../../game/utils.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import {
  getAvailableResearch, canPurchaseResearch,
} from '../../game/systems/ResearchSystem.ts';
import { CountBulkBuyControls } from '../components/CountBulkBuyControls.ts';
import { createPanelDivider, createPanelScaffold } from '../components/PanelScaffold.ts';
import { emojiHtml, resourceLabelHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';

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
  section: HTMLDivElement;
  plusBtn: HTMLButtonElement;
  hint: HTMLDivElement;
}

interface DataRefs {
  info: HTMLSpanElement;
  controls: CountBulkBuyControls;
}

export class TrainingPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private currentModelEl!: HTMLSpanElement;

  // Training section
  private progressRefs!: TrainingProgressRefs;
  private nextRefs!: TrainingNextRefs;
  private nextTrainingType: 'ft' | 'aries' | null = null;
  private nextTrainingIdx: number = -1;

  // Data section
  private dataRefs!: DataRefs;

  // Allocation
  private allocRefs!: AllocationRefs;

  // Research
  private researchSection!: HTMLDivElement;
  private researchListEl!: HTMLDivElement;
  private researchRows: Map<ResearchId, { row: HTMLDivElement; btn: HTMLButtonElement }> = new Map();

  constructor(state: GameState) {
    this.state = state;
    const { panel } = createPanelScaffold('TRAINING & RESEARCH');
    this.el = panel;
    this.build();
  }

  private build(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    // Current model
    const modelRow = document.createElement('div');
    modelRow.className = 'panel-row';
    const modelLabel = document.createElement('span');
    modelLabel.className = 'label';
    modelLabel.innerHTML = 'Current Model:' // `${resourceLabelHtml('intel', 'Current model')}:`;
    this.currentModelEl = document.createElement('span');
    this.currentModelEl.className = 'value';
    this.currentModelEl.style.fontWeight = '600';
    modelRow.appendChild(modelLabel);
    modelRow.appendChild(this.currentModelEl);
    body.appendChild(modelRow);

    body.appendChild(createPanelDivider());

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
    btn.className = 'btn-primary';
    btn.style.marginTop = '4px';
    btn.addEventListener('click', () => {
      if (this.nextTrainingType === 'ft') {
        dispatchGameAction(this.state, { type: 'startFineTune', index: this.nextTrainingIdx });
      } else if (this.nextTrainingType === 'aries') {
        dispatchGameAction(this.state, { type: 'startAriesTraining', index: this.nextTrainingIdx });
      }
    });
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

    const controls = new CountBulkBuyControls((amount) => {
      dispatchGameAction(this.state, { type: 'buyTrainingData', amountGB: amount });
    }, { countPrefix: '' });
    row.appendChild(controls.el);

    section.appendChild(row);
    parent.appendChild(section);
    return { info, controls };
  }

  private buildAllocationSection(parent: HTMLElement): AllocationRefs {
    const section = document.createElement('div');
    section.className = 'panel-section';
    section.style.display = 'none';

    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';

    const hint = document.createElement('div');
    hint.style.fontSize = '0.72rem';
    hint.style.color = 'var(--accent-red)';
    hint.style.display = 'none';
    hint.textContent = 'Set allocation above 0% to train!';
    row.appendChild(hint);

    const controls = document.createElement('span');
    controls.style.display = 'flex';
    controls.style.gap = '4px';
    controls.style.alignItems = 'center';

    const plusBtn = document.createElement('button');
    plusBtn.textContent = '+10%';
    plusBtn.style.fontSize = '0.75rem';
    plusBtn.addEventListener('click', () => {
        const nextTrainingPct = Math.min(100, this.state.trainingAllocationPct + 10);
        const remainingPct = Math.max(0, 100 - nextTrainingPct);
        const nextInferencePct = Math.min(this.state.apiInferenceAllocationPct, remainingPct);
        const actionResult = dispatchGameAction(this.state, {
          type: 'setComputeAllocations',
          trainingPct: nextTrainingPct,
          inferencePct: nextInferencePct,
        });
        const success = actionResult.ok;
        if (!success) {
          plusBtn.classList.remove('flash-red');
          void plusBtn.offsetWidth;
          plusBtn.classList.add('flash-red');
        }
    });
    controls.appendChild(plusBtn);

    row.appendChild(controls);
    section.appendChild(row);

    parent.appendChild(section);
    return { section, plusBtn, hint };
  }

  private buildResearchSection(container: HTMLDivElement): void {
    const divider = createPanelDivider();
    container.appendChild(divider);

    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = 'RESEARCH';
    container.appendChild(title);

    // Research list container
    this.researchListEl = document.createElement('div');
    container.appendChild(this.researchListEl);
  }

  // --- Update ---

  update(state: GameState): void {
    this.state = state;

    this.currentModelEl.innerHTML = `${this.getCurrentModelName(state)} (${resourceLabelHtml('intel')} ${(Math.round(state.intelligence * 10) / 10).toString()})`;

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
      const pct = Math.min(100, Number(state.fineTuneProgress * 1000n / ft.pflopsHrs) / 10.0);
      this.progressRefs.container.style.display = '';
      this.nextRefs.container.style.display = 'none';
      this.progressRefs.label.textContent = `Training: ${ft.name} ${(Math.round(pct * 10) / 10).toString()}%`;
      this.progressRefs.barFill.style.width = pct + '%';
      this.progressRefs.detail.innerHTML = `${formatNumber(state.fineTuneProgress)} ${emojiHtml('flops')} / ${formatNumber(ft.pflopsHrs)} PFLOPS-hrs`;
    } else if (state.ariesModelIndex >= 0) {
      const am = BALANCE.ariesModels[state.ariesModelIndex];
      const pct = Math.min(100, Number(state.ariesProgress * 1000n / am.pflopsHrs) / 10.0);
      this.progressRefs.container.style.display = '';
      this.nextRefs.container.style.display = 'none';
      this.progressRefs.label.textContent = `Training: ${am.name} ${(Math.round(pct * 10) / 10).toString()}%`;
      this.progressRefs.barFill.style.width = pct + '%';
      this.progressRefs.detail.innerHTML = `${formatNumber(state.ariesProgress)} ${emojiHtml('flops')} / ${formatNumber(am.pflopsHrs)} PFLOPS-hrs`;
    } else {
      this.progressRefs.container.style.display = 'none';
      // Show next available
      const nextFT = this.getNextFineTune(state);
      if (nextFT !== null) {
        const ft = BALANCE.fineTunes[nextFT];
        this.nextRefs.container.style.display = '';
        this.nextRefs.info.innerHTML = `${ft.name} (${resourceLabelHtml('intel')} ${ft.intel})`;
        this.nextRefs.info.style.color = 'var(--accent-green)';
        this.nextRefs.info.style.fontWeight = 'bold';
        
        const dataBlocking = state.trainingData < ft.dataGB;
        const dataStr = `<span style="${dataBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(ft.dataGB)} ${emojiHtml('data')} GB data</span>`;
        let reqHtml = `${formatNumber(ft.pflopsHrs)} ${emojiHtml('flops')} PFLOPS-hrs + ${dataStr}`;
        if (ft.codeReq > 0) {
          const codeBlocking = state.code < ft.codeReq;
          reqHtml += ` + <span style="${codeBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(ft.codeReq)} ${emojiHtml('code')} Code</span>`;
        }
        if (ft.scienceReq > 0) {
          const scienceBlocking = state.science < ft.scienceReq;
          reqHtml += ` + <span style="${scienceBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(ft.scienceReq)} ${emojiHtml('science')} Science</span>`;
        }
        this.nextRefs.reqs.innerHTML = reqHtml;
        this.nextRefs.btn.textContent = 'Start Fine-tune';

        this.nextTrainingType = 'ft';
        this.nextTrainingIdx = nextFT;

        const canStart = state.trainingData >= ft.dataGB && (ft.codeReq === 0n || state.code >= ft.codeReq) && (ft.scienceReq === 0n || state.science >= ft.scienceReq);
        this.nextRefs.btn.disabled = !canStart;
      } else {
        const nextAries = this.getNextAries(state);
        if (nextAries !== null) {
          const am = BALANCE.ariesModels[nextAries];
          this.nextRefs.container.style.display = '';
          this.nextRefs.info.innerHTML = `${am.name} (${resourceLabelHtml('intel')} ~${am.intel})`;
          this.nextRefs.info.style.color = 'var(--accent-purple)';
          this.nextRefs.info.style.fontWeight = 'bold';
          
          const dataBlocking = state.trainingData < am.dataGB;
          const dataStr = `<span style="${dataBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(am.dataGB)} ${emojiHtml('data')} GB data</span>`;
          let reqHtml = `${formatNumber(am.pflopsHrs)} ${emojiHtml('flops')} PFLOPS-hrs + ${dataStr}`;
          if (am.codeReq > 0) {
            const codeBlocking = state.code < am.codeReq;
            reqHtml += ` + <span style="${codeBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(am.codeReq)} ${emojiHtml('code')} Code</span>`;
          }
          if (am.scienceReq > 0) {
            const scienceBlocking = state.science < am.scienceReq;
            reqHtml += ` + <span style="${scienceBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(am.scienceReq)} ${emojiHtml('science')} Science</span>`;
          }
          this.nextRefs.reqs.innerHTML = reqHtml;
          this.nextRefs.btn.textContent = 'Start Training';

          this.nextTrainingType = 'aries';
          this.nextTrainingIdx = nextAries;

          const canStart = state.trainingData >= am.dataGB && (am.codeReq === 0n || state.code >= am.codeReq) && (am.scienceReq === 0n || state.science >= am.scienceReq);
          this.nextRefs.btn.disabled = !canStart;
        } else {
          this.nextRefs.container.style.display = 'none';
          this.nextTrainingType = null;
        }
      }
    }
  }

  private updateData(state: GameState): void {
    const pricePerGB = getTrainingDataPricePerGB();
    const purchasedGB = Math.max(0, Math.floor(state.trainingDataPurchases));
    const remainingCapGB = getTrainingDataRemainingPurchaseCapGB(purchasedGB);

    let dataText = `${resourceLabelHtml('data', 'Data')} (GB)`;
    if (state.synthDataRate > 0) {
      dataText += ` [+${formatNumber(state.synthDataRate)} GB/m]`;
    }
    dataText += ` <span style="color:var(--text-muted)">Cost: ${formatMoney(pricePerGB)}/GB</span>`;
    this.dataRefs.info.innerHTML = dataText;
    this.dataRefs.controls.setCount(state.trainingData);

    this.dataRefs.controls.bulk.update(
      purchasedGB,
      (amount) => amount <= remainingCapGB && state.funds >= getTrainingDataPurchaseCost(amount),
      BALANCE.dataPurchaseLimitGB,
    );
  }

  private updateAllocation(state: GameState): void {
    const runActive = state.currentFineTuneIndex >= 0 || state.ariesModelIndex >= 0;
    const stalledByAllocation = runActive && state.trainingAllocationPct === 0;

    this.allocRefs.section.style.display = stalledByAllocation ? '' : 'none';
    this.allocRefs.plusBtn.disabled = state.trainingAllocationPct >= 100;

    if (stalledByAllocation) {
      this.allocRefs.hint.style.display = '';
    } else {
      this.allocRefs.hint.style.display = 'none';
    }
  }

  private updateResearch(state: GameState): void {
    if (state.intelligence < BALANCE.researchUnlockIntel) {
      this.researchSection.classList.add('hidden');
      return;
    }
    this.researchSection.classList.remove('hidden');



    // Available research sorted by science requirement (cost), then name.
    const available = getAvailableResearch(state)
      .sort((a, b) => {
        if (a.cost < b.cost) return -1;
        if (a.cost > b.cost) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6);
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
        row.style.alignItems = 'flex-start';

        const info = document.createElement('div');
        info.className = 'label';
        info.style.display = 'flex';
        info.style.flexDirection = 'column';
        info.style.gap = '1px';
        info.style.flex = '1';
        info.style.minWidth = '0';
        if (r.id.startsWith('algoEfficiency')) {
          setHintTarget(info, 'research.algoEfficiency');
        }

        const nameEl = document.createElement('strong');
        nameEl.textContent = r.name;
        nameEl.style.lineHeight = '1.2';

        const descEl = document.createElement('div');
        descEl.style.fontSize = '0.72rem';
        descEl.style.color = 'var(--text-secondary)';
        descEl.style.lineHeight = '1.25';
        descEl.textContent = r.description;
        info.appendChild(nameEl);
        info.appendChild(descEl);
        row.appendChild(info);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.fontSize = '0.72rem';
        btn.style.width = '132px';
        btn.style.flex = '0 0 132px';
        btn.style.textAlign = 'center';
        btn.style.whiteSpace = 'nowrap';
        row.appendChild(btn);

        this.researchListEl.appendChild(row);
        refs = { row, btn };
        this.researchRows.set(r.id, refs);
      }
      refs.btn.innerHTML = `${formatNumber(r.cost)} ${emojiHtml('science')} Science`;
      const rowBtn = refs.btn;
      refs.btn.onclick = () => {
        const actionResult = dispatchGameAction(this.state, { type: 'purchaseResearch', id: r.id });
        const ok = actionResult.ok;
        if (!ok) {
          rowBtn.classList.remove('flash-red');
          void rowBtn.offsetWidth;
          rowBtn.classList.add('flash-red');
          return;
        }
        // Refresh immediately to avoid stale button states between UI ticks.
        this.updateResearch(this.state);
      };
      refs.btn.disabled = !canPurchaseResearch(state, r.id);
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
