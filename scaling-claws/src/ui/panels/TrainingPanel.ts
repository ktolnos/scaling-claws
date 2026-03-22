import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE, getResearchCurrentLevel, getResearchMaxLevel } from '../../game/BalanceConfig.ts';
import type { ResearchId } from '../../game/BalanceConfig.ts';
import { formatNumber } from '../../game/utils.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import {
  getAvailableResearch,
  canPurchaseResearch,
  getResearchCurrentCost,
  getResearchQuantityPreview,
} from '../../game/systems/ResearchSystem.ts';
import { createPanelScaffold } from '../components/PanelScaffold.ts';
import { emojiHtml } from '../emoji.ts';
import type { UiEmojiKey } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { flashElement } from '../UIUtils.ts';

const RESEARCH_ICON_BY_ID: Record<ResearchId, UiEmojiKey> = {
  algoEfficiency1: 'flops',
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
      this.unlockHintEl.textContent = `Research unlocks at Intelligence ${(Math.round(BALANCE.researchUnlockIntel * 10) / 10).toString()}`;
      return;
    }

    this.researchSection.classList.remove('hidden');
    this.unlockHintEl.style.display = 'none';

    const available = getAvailableResearch(state)
      .sort((a, b) => {
        const costA = getResearchCurrentCost(state, a.id);
        const costB = getResearchCurrentCost(state, b.id);
        if (costA < costB) return -1;
        if (costA > costB) return 1;
        return a.name.localeCompare(b.name);
      })
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
        nameEl.style.display = 'inline-flex';
        nameEl.style.alignItems = 'center';
        nameEl.style.gap = '6px';
        nameEl.style.lineHeight = '1.2';
        const iconEl = document.createElement('span');
        iconEl.innerHTML = emojiHtml(RESEARCH_ICON_BY_ID[r.id]);
        iconEl.setAttribute('aria-hidden', 'true');
        const nameTextEl = document.createElement('span');
        nameTextEl.textContent = r.name;
        nameEl.appendChild(iconEl);
        nameEl.appendChild(nameTextEl);

        const descEl = document.createElement('div');
        descEl.style.fontSize = '0.72rem';
        descEl.style.color = 'var(--text-secondary)';
        descEl.style.lineHeight = '1.25';
        descEl.textContent = r.description;
        const metricEl = document.createElement('div');
        metricEl.style.fontSize = '0.7rem';
        metricEl.style.color = 'var(--text-muted)';
        metricEl.style.lineHeight = '1.2';
        metricEl.style.marginTop = '2px';
        info.appendChild(nameEl);
        info.appendChild(descEl);
        info.appendChild(metricEl);
        row.appendChild(info);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.fontSize = '0.72rem';
        btn.style.width = '132px';
        btn.style.flex = '0 0 132px';
        btn.style.textAlign = 'center';
        btn.style.whiteSpace = 'nowrap';
        const costAmountEl = document.createElement('span');
        const costIconEl = document.createElement('span');
        const costLabelEl = document.createElement('span');
        btn.appendChild(costAmountEl);
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(costIconEl);
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(costLabelEl);
        row.appendChild(btn);

        this.researchListEl.appendChild(row);
        refs = { row, btn, descEl, metricEl, costAmountEl, costIconEl, costLabelEl };
        this.researchRows.set(r.id, refs);
      }

      refs.descEl.textContent = r.description;
      const quantityPreview = getResearchQuantityPreview(state, r.id);
      const currentLevel = getResearchCurrentLevel(state.researchLevels, r.id);
      const maxLevel = getResearchMaxLevel(r);
      const nextLevel = Math.min(currentLevel + 1, maxLevel);
      const levelText = Number.isFinite(maxLevel)
        ? `Lv ${currentLevel} -> ${nextLevel}/${maxLevel}`
        : `Lv ${currentLevel} -> ${currentLevel + 1}`;
      if (quantityPreview) {
        refs.metricEl.style.display = '';
        refs.metricEl.innerHTML =
          `${levelText} | ${quantityPreview.label}: ` +
          `${emojiHtml(quantityPreview.emoji)} ${formatNumber(quantityPreview.current)}${quantityPreview.unit} ` +
          `-> ${emojiHtml(quantityPreview.emoji)} ${formatNumber(quantityPreview.next)}${quantityPreview.unit}`;
      } else {
        refs.metricEl.style.display = '';
        refs.metricEl.textContent = levelText;
      }

      const currentCost = getResearchCurrentCost(state, r.id);
      const costResource = r.costResource ?? 'science';
      const costLabel = costResource === 'code' ? 'Code' : 'Science';
      refs.costAmountEl.textContent = formatNumber(currentCost);
      refs.costIconEl.innerHTML = emojiHtml(costResource);
      refs.costLabelEl.textContent = costLabel;
      const rowBtn = refs.btn;
      refs.btn.onclick = () => {
        const actionResult = dispatchGameAction(this.state, { type: 'purchaseResearch', id: r.id });
        if (!actionResult.ok) {
          flashElement(rowBtn);
          return;
        }
        this.updateResearch(this.state);
      };
      refs.btn.disabled = !canPurchaseResearch(state, r.id);
    }
  }
}
