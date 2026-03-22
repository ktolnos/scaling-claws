import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import {
  BALANCE,
  getFacilityProductionMultiplier,
  getJobProductionMultiplier,
} from '../../game/BalanceConfig.ts';
import type { ResearchConfig, ResearchId } from '../../game/BalanceConfig.ts';
import { divB, formatNumber, formatNumberOneDecimal, mulB, toBigInt } from '../../game/utils.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import {
  getAvailableResearch,
  canPurchaseResearch,
  getResearchCurrentCost,
} from '../../game/systems/ResearchSystem.ts';
import { createPanelScaffold } from '../components/PanelScaffold.ts';
import { emojiHtml } from '../emoji.ts';
import type { UiEmojiKey } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { flashElement } from '../UIUtils.ts';

const RESEARCH_ICON_BY_ID: Record<ResearchId, UiEmojiKey> = {
  algoEfficiency1: 'flops',
  agentMultiplexing1: 'gpus',
  algoEfficiency2: 'flops',
  algoEfficiency3: 'flops',
  algoEfficiency4: 'flops',
  apiAutoPricing: 'users',
  computeAutoAllocation: 'flops',
  synthData2: 'data',
  synthData3: 'data',
  syntheticData1: 'data',
  syntheticData2: 'data',
  syntheticData3: 'data',
  gpuArch1: 'gpus',
  gpuArch2: 'gpus',
  gpuArch3: 'gpus',
  solarTechnology: 'solarPanels',
  chipManufacturing: 'gpus',
  codeProductivity1: 'code',
  robotics1: 'robots',
  robotFactoryEngineering1: 'robots',
  moonRobotics: 'moon',
  mercuryRobotics: 'mercury',
  rocketry: 'rockets',
  payloadToMoon: 'moon',
  payloadToMercury: 'mercury',
  moonMineEngineering: 'moon',
  moonChipManufacturing: 'moon',
  moonMassDrivers: 'moon',
  researchProductivity1: 'science',
  reusableRockets1: 'rockets',
  reusableRockets2: 'rockets',
  reusableRockets3: 'rockets',
  robotics2: 'robots',
  robotics3: 'robots',
  facilityThroughput1: 'supply',
  facilityThroughput2: 'supply',
  jobThroughput1: 'code',
  jobThroughput2: 'code',
  vonNeumannProbes: 'probes',
};

export class TrainingPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private unlockHintEl!: HTMLDivElement;
  private researchSection!: HTMLDivElement;
  private researchListEl!: HTMLDivElement;
  private researchRows: Map<ResearchId, {
    row: HTMLDivElement;
    btn: HTMLButtonElement;
    titleEl: HTMLSpanElement;
    descEl: HTMLDivElement;
    metricEl: HTMLDivElement;
    costAmountEl: HTMLSpanElement;
    costIconEl: HTMLSpanElement;
    costLabelEl: HTMLSpanElement;
  }> = new Map();

  constructor(state: GameState) {
    this.state = state;
    const { panel } = createPanelScaffold('RESEARCH');
    this.el = panel;
    this.build();
  }

  private build(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    this.unlockHintEl = document.createElement('div');
    this.unlockHintEl.className = 'warning-text';
    this.unlockHintEl.style.color = 'var(--text-secondary)';
    body.appendChild(this.unlockHintEl);

    this.researchSection = document.createElement('div');
    this.researchSection.className = 'panel-section hidden';

    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = 'RESEARCH';
    this.researchSection.appendChild(title);

    this.researchListEl = document.createElement('div');
    this.researchListEl.className = 'research-card-list';
    this.researchSection.appendChild(this.researchListEl);

    body.appendChild(this.researchSection);
  }

  update(state: GameState): void {
    this.state = state;
    this.updateResearch(state);
  }

  private updateResearch(state: GameState): void {
    if (state.intelligence < BALANCE.researchUnlockIntel) {
      this.researchSection.classList.add('hidden');
      this.unlockHintEl.style.display = '';
      this.unlockHintEl.textContent = `Research unlocks at Intelligence ${formatNumberOneDecimal(BALANCE.researchUnlockIntel)}`;
      return;
    }

    this.researchSection.classList.remove('hidden');
    this.unlockHintEl.style.display = 'none';

    const available = getAvailableResearch(state)
      .sort((a, b) => a.minLevel - b.minLevel)
      .slice(0, 9);
    const availableIds = new Set(available.map((r) => r.id));

    for (const [id, refs] of this.researchRows) {
      if (!availableIds.has(id)) {
        refs.row.remove();
        this.researchRows.delete(id);
      }
    }

    for (const r of available) {
      let refs = this.researchRows.get(r.id);
      if (!refs) {
        const row = document.createElement('div');
        row.className = 'research-card';

        const header = document.createElement('div');
        header.className = 'research-card-header';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'research-card-icon';
        const iconEl = document.createElement('span');
        iconEl.innerHTML = emojiHtml(RESEARCH_ICON_BY_ID[r.id]);
        iconEl.setAttribute('aria-hidden', 'true');
        iconWrap.appendChild(iconEl);
        header.appendChild(iconWrap);

        const info = document.createElement('div');
        info.className = 'research-card-info';
        if (r.id.startsWith('algoEfficiency')) {
          setHintTarget(info, 'research.algoEfficiency');
        }

        const nameEl = document.createElement('strong');
        nameEl.className = 'research-card-title';
        const nameTextEl = document.createElement('span');
        nameEl.appendChild(nameTextEl);

        const descEl = document.createElement('div');
        descEl.className = 'research-card-desc';
        descEl.textContent = r.description;
        const metricEl = document.createElement('div');
        metricEl.className = 'research-card-meta';
        info.appendChild(nameEl);
        info.appendChild(descEl);
        info.appendChild(metricEl);
        header.appendChild(info);
        row.appendChild(header);

        const footer = document.createElement('div');
        footer.className = 'research-card-footer';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-primary research-card-btn';
        btn.addEventListener('click', () => {
          const actionResult = dispatchGameAction(this.state, { type: 'purchaseResearch', id: r.id });
          if (!actionResult.ok) {
            flashElement(btn);
            return;
          }
          this.update(this.state);
        });
        const costAmountEl = document.createElement('span');
        const costIconEl = document.createElement('span');
        const costLabelEl = document.createElement('span');
        btn.appendChild(costAmountEl);
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(costIconEl);
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(costLabelEl);
        footer.appendChild(btn);
        row.appendChild(footer);

        this.researchListEl.appendChild(row);
        refs = { row, btn, titleEl: nameTextEl, descEl, metricEl, costAmountEl, costIconEl, costLabelEl };
        this.researchRows.set(r.id, refs);
      }

      const titleText = this.getResearchDisplayTitle(r);
      if (refs.titleEl.textContent !== titleText) refs.titleEl.textContent = titleText;

      if (refs.descEl.textContent !== r.description) refs.descEl.textContent = r.description;

      const previewHtml = this.getResearchEffectPreviewHtml(state, r.id);
      const metricDisplay = previewHtml ? '' : 'none';
      if (refs.metricEl.style.display !== metricDisplay) refs.metricEl.style.display = metricDisplay;
      if (refs.metricEl.innerHTML !== previewHtml) refs.metricEl.innerHTML = previewHtml;

      const currentCost = getResearchCurrentCost(state, r.id);
      const costResource = r.costResource ?? 'science';
      const costLabel = costResource === 'code' ? 'Code' : 'Science';
      const costAmount = formatNumber(currentCost);
      if (refs.costAmountEl.textContent !== costAmount) refs.costAmountEl.textContent = costAmount;
      const costIcon = emojiHtml(costResource);
      if (refs.costIconEl.innerHTML !== costIcon) refs.costIconEl.innerHTML = costIcon;
      if (refs.costLabelEl.textContent !== costLabel) refs.costLabelEl.textContent = costLabel;
      const disabled = !canPurchaseResearch(state, r.id);
      if (refs.btn.disabled !== disabled) refs.btn.disabled = disabled;
    }
  }

  private getResearchDisplayTitle(research: ResearchConfig): string {
    if (
      research.quantityBase === undefined &&
      research.quantityLabel === undefined &&
      research.quantityEmoji === undefined &&
      research.quantityUnit === undefined
    ) {
      return research.name;
    }

    const deltaPct = this.getResearchDeltaPercent(research.quantityMultiplierPerLevel);
    if (deltaPct === 0) return research.name;
    return `${research.name} ${deltaPct > 0 ? '+' : ''}${this.formatSignedPercent(deltaPct)}`;
  }

  private getResearchDeltaPercent(multiplier: number): number {
    return Math.round((multiplier - 1) * 1000) / 10;
  }

  private formatSignedPercent(value: number): string {
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
  }

  private formatPercentValue(value: number): string {
    const pct = value * 100;
    return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
  }

  private getDataUnitForValue(valueGb: bigint): 'MB' | 'GB' | 'TB' {
    if (valueGb < toBigInt(1)) return 'MB';
    if (valueGb >= toBigInt(1000)) return 'TB';
    return 'GB';
  }

  private toDataUnitFromGb(valueGb: bigint, unit: 'MB' | 'GB' | 'TB'): bigint {
    if (unit === 'MB') return mulB(valueGb, toBigInt(1000));
    if (unit === 'TB') return divB(valueGb, toBigInt(1000));
    return valueGb;
  }

  private getResearchEffectPreviewHtml(state: GameState, id: ResearchId): string {
    const research = BALANCE.research.find((entry) => entry.id === id);
    if (!research?.effect) return '';

    const multiplier = research.quantityMultiplierPerLevel;
    const route = ` ${emojiHtml('route')} `;
    switch (research.effect.type) {
      case 'algoEfficiency': {
        const current = state.algoEfficiencyBonus;
        return `${this.formatPercentValue(current)}${route}${this.formatPercentValue(current * multiplier)}`;
      }
      case 'agentsPerGpu': {
        const current = state.agentsPerGpu;
        const next = current * BigInt(Math.round(multiplier));
        return `${formatNumber(current)} agents/GPU${route}${formatNumber(next)} agents/GPU`;
      }
      case 'apiUserSynthRate': {
        const current = state.apiUserSynthRate;
        const next = current * BigInt(Math.round(multiplier));
        const unit = this.getDataUnitForValue(next > current ? next : current);
        const currentDisplay = this.toDataUnitFromGb(current, unit);
        const nextDisplay = this.toDataUnitFromGb(next, unit);
        return `${formatNumberOneDecimal(currentDisplay)} ${unit}/user/m${route}${formatNumberOneDecimal(nextDisplay)} ${unit}/user/m`;
      }
      case 'gpuFlops': {
        const current = state.gpuFlopsBonus;
        return `${this.formatPercentValue(current)}${route}${this.formatPercentValue(current * multiplier)}`;
      }
      case 'rocketLoss': {
        const current = state.rocketLossPct;
        return `${this.formatPercentValue(current)}${route}${this.formatPercentValue(current * multiplier)}`;
      }
      case 'jobProduction': {
        const sampleJob = research.effect.jobs[0];
        const current = getJobProductionMultiplier(state.researchLevels, sampleJob);
        return `${this.formatPercentValue(current)}${route}${this.formatPercentValue(current * multiplier)}`;
      }
      case 'facilityProduction': {
        const sampleFacility = research.effect.facilities[0];
        const current = getFacilityProductionMultiplier(state.researchLevels, sampleFacility);
        return `${this.formatPercentValue(current)}${route}${this.formatPercentValue(current * multiplier)}`;
      }
      default:
        return '';
    }
  }
}
