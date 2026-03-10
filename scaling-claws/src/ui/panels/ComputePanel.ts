import type { GameState } from '../../game/GameState.ts';
import { getTotalAssignedAgents } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import {
  BALANCE,
  getApiOptimalPrice,
  getApiPflopsPerUser,
  getAgentsRequiredAllocationPct,
  isApiAutoPricingUnlocked,
  isComputeAutoAllocationUnlocked,
} from '../../game/BalanceConfig.ts';
import { formatNumber, formatMoney, fromBigInt, toBigInt, divB, scaleB, mulB, scaleBigInt } from '../../game/utils.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import { BulkBuyGroup, getVisibleBuyTiers } from '../components/BulkBuyGroup.ts';
import { CountBulkBuyControls } from '../components/CountBulkBuyControls.ts';
import { createPanelDivider, createPanelScaffold } from '../components/PanelScaffold.ts';
import { UI_EMOJI, emojiHtml, moneyWithEmojiHtml, resourceLabelHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { flashElement } from '../UIUtils.ts';

interface TrainingProgressRefs {
  container: HTMLDivElement;
  label: HTMLDivElement;
  barFill: HTMLDivElement;
  batchBarFill: HTMLDivElement;
  detail: HTMLDivElement;
}

interface TrainingNextRefs {
  container: HTMLDivElement;
  info: HTMLDivElement;
  reqs: HTMLDivElement;
  btn: HTMLButtonElement;
}

export class ComputePanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private modelNameEl!: HTMLSpanElement;
  private gpuStatusEl!: HTMLSpanElement;
  private gpuStockBarFill!: HTMLDivElement;
  private computeAllocationWrap!: HTMLDivElement;
  private allocAgentsPctEl!: HTMLSpanElement;
  private allocAgentsNeedEl!: HTMLSpanElement;
  private allocInferenceLabelEl!: HTMLDivElement;
  private allocInferencePctEl!: HTMLSpanElement;
  private allocTrainingLabelEl!: HTMLDivElement;
  private allocTrainingPctEl!: HTMLSpanElement;
  private allocSliderTrack!: HTMLDivElement;
  private allocSegAgents!: HTMLDivElement;
  private allocSegInference!: HTMLDivElement;
  private allocSegTraining!: HTMLDivElement;
  private allocHandleLeft!: HTMLButtonElement;
  private allocHandleRight!: HTMLButtonElement;
  private computeAutoAllocRow!: HTMLDivElement;
  private computeAutoAllocBtn!: HTMLButtonElement;
  private activeAllocHandle: 'left' | 'right' | null = null;
  private readonly onAllocPointerMove = (ev: PointerEvent) => this.handleAllocationPointerMove(ev);
  private readonly onAllocPointerUp = () => this.stopAllocationDrag();

  private buyGpuRow!: HTMLDivElement;
  private buyGpuControls!: CountBulkBuyControls;
  private gpuPricePart!: HTMLSpanElement;
  private upgradeSection!: HTMLDivElement;
  private datacenterDivider!: HTMLHRElement;
  private datacenterSection!: HTMLDivElement;
  private datacenterHintEl!: HTMLDivElement;
  private apiDivider!: HTMLHRElement;
  private trainingSection!: HTMLDivElement;
  private trainingProgressRefs!: TrainingProgressRefs;
  private trainingNextRefs!: TrainingNextRefs;
  private trainingAllocHint!: HTMLDivElement;
  private trainingAllocHintMsg!: HTMLSpanElement;
  private trainingAllocHintBtn!: HTMLButtonElement;
  private nextTrainingType: 'ft' | 'aries' | null = null;
  private nextTrainingIdx: number = -1;

  private upgradeBtn?: HTMLButtonElement;
  private upgradeBtnReq?: HTMLSpanElement;
  private upgradeInfo?: HTMLElement;
  private datacenterRows: {
    row: HTMLElement;
    info: HTMLSpanElement;
    costMoney: HTMLSpanElement;
    costLabor: HTMLSpanElement;
    count: HTMLSpanElement;
    bulk: BulkBuyGroup;
  }[] = [];
  private apiSection!: HTMLDivElement;

  // API sub-elements
  private apiLockedRow!: HTMLDivElement;
  private apiUnlockBtn!: HTMLButtonElement;
  private apiUnlockBtnReq!: HTMLSpanElement;
  private apiUnlockedContainer!: HTMLDivElement;
  private apiInfoEl!: HTMLSpanElement;
  private apiDataInfoEl!: HTMLSpanElement;
  private priceDecreaseGroup!: BulkBuyGroup;
  private apiPriceVal!: HTMLSpanElement;
  private priceIncreaseGroup!: BulkBuyGroup;
  private apiAutoPriceRow!: HTMLDivElement;
  private apiAutoPriceBtn!: HTMLButtonElement;
  
  private apiDemandBar!: HTMLDivElement;
  private apiDemandBarFill!: HTMLDivElement;
  private apiDemandText!: HTMLDivElement;

  private apiAdInfo!: HTMLSpanElement;
  private apiAdCostEl!: HTMLSpanElement;
  private apiAdBtnGroup!: BulkBuyGroup;

  private apiImproveRow!: HTMLDivElement;
  private apiImproveBtnGroup!: BulkBuyGroup;
  private apiImproveInfo!: HTMLSpanElement;
  private apiImproveCostEl!: HTMLSpanElement;

  constructor(state: GameState) {
    this.state = state;
    const { panel } = createPanelScaffold('COMPUTE');
    this.el = panel;
    this.build();
  }

  private build(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    // Model info
    const modelRow = document.createElement('div');
    modelRow.className = 'panel-row';
    const modelLabel = document.createElement('span');
    modelLabel.className = 'label';
    modelLabel.textContent = 'Model:';
    setHintTarget(modelLabel, 'resource.intel');
    this.modelNameEl = document.createElement('span');
    this.modelNameEl.className = 'value';
    this.modelNameEl.style.fontWeight = '600';
    modelRow.appendChild(modelLabel);
    modelRow.appendChild(this.modelNameEl);
    body.appendChild(modelRow);

    // Unified compute allocation slider
    this.computeAllocationWrap = document.createElement('div');
    this.computeAllocationWrap.className = 'compute-allocation-wrap hidden';
    this.computeAllocationWrap.style.width = '100%';

    const allocLabelsRow = document.createElement('div');
    allocLabelsRow.className = 'compute-allocation-labels';

    const agentsLabel = document.createElement('div');
    agentsLabel.className = 'compute-allocation-label compute-allocation-label-agents';
    agentsLabel.innerHTML = '<span class="name">Agents</span>';
    this.allocAgentsPctEl = document.createElement('span');
    this.allocAgentsPctEl.className = 'pct';
    agentsLabel.appendChild(this.allocAgentsPctEl);
    this.allocAgentsNeedEl = document.createElement('span');
    this.allocAgentsNeedEl.className = 'need';
    agentsLabel.appendChild(this.allocAgentsNeedEl);
    allocLabelsRow.appendChild(agentsLabel);

    this.allocInferenceLabelEl = document.createElement('div');
    this.allocInferenceLabelEl.className = 'compute-allocation-label compute-allocation-label-inference';
    this.allocInferenceLabelEl.innerHTML = '<span class="name">Inference</span>';
    this.allocInferencePctEl = document.createElement('span');
    this.allocInferencePctEl.className = 'pct';
    this.allocInferenceLabelEl.appendChild(this.allocInferencePctEl);
    allocLabelsRow.appendChild(this.allocInferenceLabelEl);

    this.allocTrainingLabelEl = document.createElement('div');
    this.allocTrainingLabelEl.className = 'compute-allocation-label compute-allocation-label-training';
    this.allocTrainingLabelEl.innerHTML = '<span class="name">Training</span>';
    this.allocTrainingPctEl = document.createElement('span');
    this.allocTrainingPctEl.className = 'pct';
    this.allocTrainingLabelEl.appendChild(this.allocTrainingPctEl);
    allocLabelsRow.appendChild(this.allocTrainingLabelEl);

    this.computeAllocationWrap.appendChild(allocLabelsRow);

    this.allocSliderTrack = document.createElement('div');
    this.allocSliderTrack.className = 'compute-allocation-slider';
    this.allocSliderTrack.style.width = '100%';

    this.allocSegAgents = document.createElement('div');
    this.allocSegAgents.className = 'compute-allocation-segment compute-allocation-segment-agents';
    this.allocSliderTrack.appendChild(this.allocSegAgents);

    this.allocSegInference = document.createElement('div');
    this.allocSegInference.className = 'compute-allocation-segment compute-allocation-segment-inference';
    this.allocSliderTrack.appendChild(this.allocSegInference);

    this.allocSegTraining = document.createElement('div');
    this.allocSegTraining.className = 'compute-allocation-segment compute-allocation-segment-training';
    this.allocSliderTrack.appendChild(this.allocSegTraining);

    this.allocHandleLeft = document.createElement('button');
    this.allocHandleLeft.type = 'button';
    this.allocHandleLeft.className = 'compute-allocation-handle';
    this.allocHandleLeft.addEventListener('pointerdown', (ev) => this.startAllocationDrag('left', ev));
    this.allocSliderTrack.appendChild(this.allocHandleLeft);

    this.allocHandleRight = document.createElement('button');
    this.allocHandleRight.type = 'button';
    this.allocHandleRight.className = 'compute-allocation-handle';
    this.allocHandleRight.addEventListener('pointerdown', (ev) => this.startAllocationDrag('right', ev));
    this.allocSliderTrack.appendChild(this.allocHandleRight);

    this.computeAllocationWrap.appendChild(this.allocSliderTrack);

    this.computeAutoAllocRow = document.createElement('div');
    this.computeAutoAllocRow.className = 'panel-row api-auto-price-row';
    this.computeAutoAllocRow.style.fontSize = '0.82rem';
    this.computeAutoAllocRow.style.paddingTop = '2px';

    const autoAllocLabel = document.createElement('span');
    autoAllocLabel.className = 'label';
    autoAllocLabel.textContent = 'Auto Allocation:';
    this.computeAutoAllocRow.appendChild(autoAllocLabel);

    this.computeAutoAllocBtn = document.createElement('button');
    this.computeAutoAllocBtn.type = 'button';
    this.computeAutoAllocBtn.className = 'api-auto-price-toggle';
    this.computeAutoAllocBtn.setAttribute('aria-label', 'Toggle compute auto allocation');
    this.computeAutoAllocBtn.setAttribute('aria-pressed', 'false');
    this.computeAutoAllocBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const currentlyPressed = this.computeAutoAllocBtn.getAttribute('aria-pressed') === 'true';
      dispatchGameAction(this.state, {
        type: 'setComputeAutoAllocation',
        enabled: !currentlyPressed,
      });
    });
    this.computeAutoAllocRow.appendChild(this.computeAutoAllocBtn);
    this.computeAllocationWrap.appendChild(this.computeAutoAllocRow);
    body.appendChild(this.computeAllocationWrap);

    this.datacenterDivider = createPanelDivider();
    body.appendChild(this.datacenterDivider);

    // GPUs buttons with count display
    this.buyGpuRow = document.createElement('div');
    this.buyGpuRow.className = 'panel-row';
    const buyLabel = document.createElement('span');
    buyLabel.className = 'label';
    buyLabel.style.display = 'flex';
    buyLabel.style.flexDirection = 'column';
    buyLabel.style.alignItems = 'flex-start';
    buyLabel.style.gap = '2px';

    const topPart = document.createElement('span');
    topPart.innerHTML = `${resourceLabelHtml('gpus', 'GPUs')}`;
    setHintTarget(topPart, 'resource.gpus');
    buyLabel.appendChild(topPart);

    this.gpuPricePart = document.createElement('span');
    this.gpuPricePart.style.color = 'var(--text-secondary)';
    this.gpuPricePart.style.fontSize = '0.72rem';
    buyLabel.appendChild(this.gpuPricePart);

    this.buyGpuRow.appendChild(buyLabel);

    this.buyGpuControls = new CountBulkBuyControls((amt) => {
      dispatchGameAction(this.state, { type: 'buyGpu', amount: amt });
    }, { prefix: '+', maxedLabel: 'NO SPACE' });
    this.buyGpuRow.appendChild(this.buyGpuControls.el);
    body.appendChild(this.buyGpuRow);

    const gpuStatusRow = document.createElement('div');
    gpuStatusRow.style.width = '100%';
    gpuStatusRow.style.fontSize = '0.72rem';
    gpuStatusRow.style.color = 'var(--text-secondary)';
    gpuStatusRow.style.marginTop = '-2px';
    this.gpuStatusEl = document.createElement('span');
    gpuStatusRow.appendChild(this.gpuStatusEl);
    body.appendChild(gpuStatusRow);

    document.addEventListener('flash-gpu-capacity', () => {
      flashElement(this.gpuStatusEl);
    });

    const gpuStockBar = document.createElement('div');
    gpuStockBar.className = 'progress-bar';
    gpuStockBar.style.width = '100%';
    gpuStockBar.style.height = '10px';
    this.gpuStockBarFill = document.createElement('div');
    this.gpuStockBarFill.className = 'progress-bar-fill';
    this.gpuStockBarFill.style.background = 'var(--accent-blue)';
    gpuStockBar.appendChild(this.gpuStockBarFill);
    body.appendChild(gpuStockBar);

    // Datacenter warnings: keep directly under stock/capacity bar to reduce eye travel.
    // Reserve vertical space even when no warning is active to avoid layout jumps.
    this.datacenterHintEl = document.createElement('div');
    this.datacenterHintEl.className = 'warning-text compute-datacenter-hint';
    this.datacenterHintEl.style.color = 'var(--accent-blue)';
    this.datacenterHintEl.style.visibility = 'hidden';
    this.datacenterHintEl.textContent = '\u00a0';
    body.appendChild(this.datacenterHintEl);

    // Model upgrade section
    this.upgradeSection = document.createElement('div');
    this.upgradeSection.className = 'panel-section';
    body.appendChild(this.upgradeSection);

    // PRE-BUILD UPGRADE ROW
    const uRow = document.createElement('div');
    uRow.className = 'panel-row';
    uRow.style.padding = '4px 0';
    this.upgradeInfo = document.createElement('span');
    this.upgradeInfo.className = 'label';
    uRow.appendChild(this.upgradeInfo);
    this.upgradeBtn = document.createElement('button');
    this.upgradeBtn.appendChild(document.createTextNode('Upgrade '));
    this.upgradeBtnReq = document.createElement('span');
    this.upgradeBtn.appendChild(this.upgradeBtnReq);

    this.upgradeBtn.addEventListener('click', () => {
      const nextIdx = this.state.currentModelIndex + 1;
      if (nextIdx < BALANCE.models.length) {
        dispatchGameAction(this.state, { type: 'upgradeModel', modelIndex: nextIdx });
      }
    });
    uRow.appendChild(this.upgradeBtn);
    this.upgradeSection.appendChild(uRow);

    body.appendChild(createPanelDivider());

    // Datacenter buy section
    this.datacenterSection = document.createElement('div');
    this.datacenterSection.className = 'panel-section';
    body.appendChild(this.datacenterSection);

    // PRE-BUILD DATACENTER ROWS
    for (let i = 0; i < BALANCE.datacenters.length; i++) {
        const row = document.createElement('div');
        row.className = 'panel-row';
        row.style.fontSize = '0.82rem';
        row.style.display = 'none'; // hidden by default

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.flexDirection = 'column';
        left.style.gap = '2px';

        const info = document.createElement('span');
        info.className = 'label';
        setHintTarget(info, 'mechanic.datacenters');
        left.appendChild(info);

        const costInfo = document.createElement('span');
        costInfo.style.fontSize = '0.68rem';
        costInfo.style.color = 'var(--text-muted)';
        const costMoney = document.createElement('span');
        const costLabor = document.createElement('span');
        costInfo.appendChild(costMoney);
        costInfo.appendChild(document.createTextNode(' + '));
        costInfo.appendChild(costLabor);
        left.appendChild(costInfo);

        row.appendChild(left);

        const controls = new CountBulkBuyControls((amt) => {
          dispatchGameAction(this.state, { type: 'buyDatacenter', tier: i, amount: amt });
        }, { prefix: '+' });

        row.appendChild(controls.el);
        this.datacenterSection.appendChild(row);
        this.datacenterRows[i] = { row, info, costMoney, costLabor, count: controls.countEl, bulk: controls.bulk };
    }

    body.appendChild(createPanelDivider());

    this.trainingSection = document.createElement('div');
    this.trainingSection.className = 'panel-section hidden';

    const trainingTitle = document.createElement('div');
    trainingTitle.className = 'panel-section-title';
    trainingTitle.textContent = 'TRAINING';
    this.trainingSection.appendChild(trainingTitle);

    this.trainingProgressRefs = this.buildTrainingProgressView(this.trainingSection);
    this.trainingNextRefs = this.buildTrainingNextView(this.trainingSection);
    this.buildTrainingAllocationHint(this.trainingSection);

    body.appendChild(this.trainingSection);

    // API Services section
    this.apiSection = document.createElement('div');
    this.apiSection.className = 'panel-section hidden';

    this.apiDivider = document.createElement('hr');
    this.apiDivider.className = 'panel-divider';
    this.apiSection.appendChild(this.apiDivider);

    const subTitle = document.createElement('div');
    subTitle.className = 'panel-section-title api-services';
    subTitle.textContent = 'API SERVICES';
    setHintTarget(subTitle, 'mechanic.apiServices');
    this.apiSection.appendChild(subTitle);

    // Locked preview
    this.apiLockedRow = document.createElement('div');
    this.apiLockedRow.style.fontSize = '0.82rem';
    this.apiLockedRow.style.color = 'var(--text-secondary)';
    this.apiLockedRow.style.padding = '4px 0';
    this.apiSection.appendChild(this.apiLockedRow);

    this.apiUnlockBtn = document.createElement('button');
    this.apiUnlockBtn.style.width = '100%';
    this.apiUnlockBtn.style.marginTop = '4px';
    this.apiUnlockBtn.style.display = 'none';
    
    const apiUnlockMainText = document.createElement('span');
    apiUnlockMainText.textContent = 'Launch API Service ';
    this.apiUnlockBtn.appendChild(apiUnlockMainText);
    
    this.apiUnlockBtnReq = document.createElement('span');
    this.apiUnlockBtn.appendChild(this.apiUnlockBtnReq);
    
    this.apiUnlockBtn.addEventListener('click', () => {
      dispatchGameAction(this.state, { type: 'unlockApi' });
    });
    this.apiSection.appendChild(this.apiUnlockBtn);

    // Unlocked content container
    this.apiUnlockedContainer = document.createElement('div');
    this.apiUnlockedContainer.style.display = 'none';

    // Users count + income
    const userRow = document.createElement('div');
    userRow.className = 'panel-row';
    userRow.style.fontSize = '0.82rem';
    this.apiInfoEl = document.createElement('span');
    this.apiInfoEl.className = 'label';
    userRow.appendChild(this.apiInfoEl);
    this.apiUnlockedContainer.appendChild(userRow);

    const dataRow = document.createElement('div');
    dataRow.className = 'panel-row';
    dataRow.style.fontSize = '0.82rem';
    this.apiDataInfoEl = document.createElement('span');
    this.apiDataInfoEl.className = 'label';
    dataRow.appendChild(this.apiDataInfoEl);
    this.apiUnlockedContainer.appendChild(dataRow);

    // Demand Progress Bar
    const demandContainer = document.createElement('div');
    demandContainer.style.padding = '4px 0';
    
    this.apiDemandText = document.createElement('div');
    this.apiDemandText.style.fontSize = '0.75rem';
    this.apiDemandText.style.marginBottom = '2px';
    demandContainer.appendChild(this.apiDemandText);

    this.apiDemandBar = document.createElement('div');
    this.apiDemandBar.className = 'progress-bar';
    this.apiDemandBarFill = document.createElement('div');
    this.apiDemandBarFill.className = 'progress-bar-fill';
    this.apiDemandBarFill.style.background = 'var(--accent-blue)';
    this.apiDemandBar.appendChild(this.apiDemandBarFill);
    demandContainer.appendChild(this.apiDemandBar);
    
    this.apiUnlockedContainer.appendChild(demandContainer);

    // Price controls
    const priceRow = document.createElement('div');
    priceRow.className = 'panel-row';
    priceRow.style.fontSize = '0.82rem';

    const priceLabel = document.createElement('span');
    priceLabel.className = 'label';
    priceLabel.innerHTML = `${resourceLabelHtml('funds', 'Price API')}:`;
    setHintTarget(priceLabel, 'mechanic.apiServices');
    priceRow.appendChild(priceLabel);

    const priceControls = document.createElement('span');
    priceControls.style.display = 'flex';
    priceControls.style.gap = '4px';
    priceControls.style.alignItems = 'center';

    this.priceDecreaseGroup = new BulkBuyGroup((amt) => {
      dispatchGameAction(this.state, { type: 'setApiPrice', price: this.state.apiPrice - amt });
    }, `-${UI_EMOJI.money}`);
    priceControls.appendChild(this.priceDecreaseGroup.el);

    this.apiPriceVal = document.createElement('span');
    this.apiPriceVal.className = 'value';
    this.apiPriceVal.style.minWidth = '48px';
    this.apiPriceVal.style.textAlign = 'center';
    priceControls.appendChild(this.apiPriceVal);

    this.priceIncreaseGroup = new BulkBuyGroup((amt) => {
      dispatchGameAction(this.state, { type: 'setApiPrice', price: this.state.apiPrice + amt });
    }, `+${UI_EMOJI.money}`);
    priceControls.appendChild(this.priceIncreaseGroup.el);

    priceRow.appendChild(priceControls);
    this.apiUnlockedContainer.appendChild(priceRow);

    this.apiAutoPriceRow = document.createElement('div');
    this.apiAutoPriceRow.className = 'panel-row';
    this.apiAutoPriceRow.classList.add('api-auto-price-row');
    this.apiAutoPriceRow.style.fontSize = '0.82rem';

    const autoPriceLabel = document.createElement('span');
    autoPriceLabel.className = 'label';
    autoPriceLabel.textContent = 'Auto Price:';
    this.apiAutoPriceRow.appendChild(autoPriceLabel);

    this.apiAutoPriceBtn = document.createElement('button');
    this.apiAutoPriceBtn.type = 'button';
    this.apiAutoPriceBtn.className = 'api-auto-price-toggle';
    this.apiAutoPriceBtn.setAttribute('aria-label', 'Toggle API auto pricing');
    this.apiAutoPriceBtn.setAttribute('aria-pressed', 'false');
    this.apiAutoPriceBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const currentlyPressed = this.apiAutoPriceBtn.getAttribute('aria-pressed') === 'true';
      dispatchGameAction(this.state, {
        type: 'setApiAutoPrice',
        enabled: !currentlyPressed,
      });
    });
    this.apiAutoPriceRow.appendChild(this.apiAutoPriceBtn);
    this.apiUnlockedContainer.appendChild(this.apiAutoPriceRow);

    // Optimize API
    this.apiImproveRow = document.createElement('div');
    this.apiImproveRow.className = 'panel-row';
    this.apiImproveRow.style.fontSize = '0.82rem';
    
    this.apiImproveInfo = document.createElement('span');
    this.apiImproveInfo.className = 'label';
    this.apiImproveRow.appendChild(this.apiImproveInfo);

    const improveControls = document.createElement('span');
    improveControls.style.display = 'flex';
    improveControls.style.gap = '4px';
    improveControls.style.alignItems = 'center';

    const improveLabel = document.createElement('span');
    improveLabel.textContent = 'Optimization ';
    this.apiImproveCostEl = document.createElement('span');
    this.apiImproveCostEl.style.color = 'var(--text-secondary)';
    this.apiImproveCostEl.style.fontSize = '0.8em';
    this.apiImproveCostEl.innerHTML = `(${formatNumber(BALANCE.apiImproveCodeCost)} ${emojiHtml('code')} Code)`;
    improveLabel.appendChild(this.apiImproveCostEl);
    improveLabel.appendChild(document.createTextNode(':'));
    improveControls.appendChild(improveLabel);

    this.apiImproveBtnGroup = new BulkBuyGroup((amt) => {
      dispatchGameAction(this.state, { type: 'improveApi', amount: amt });
    });
    improveControls.appendChild(this.apiImproveBtnGroup.el);

    this.apiImproveRow.appendChild(improveControls);

    this.apiUnlockedContainer.appendChild(this.apiImproveRow);

    // Buy ads
    const adRow = document.createElement('div');
    adRow.className = 'panel-row';
    adRow.style.fontSize = '0.82rem';

    this.apiAdInfo = document.createElement('span');
    this.apiAdInfo.className = 'label';
    adRow.appendChild(this.apiAdInfo);

    const adControls = document.createElement('span');
    adControls.style.display = 'flex';
    adControls.style.gap = '4px';
    adControls.style.alignItems = 'center';

    const marketingLabel = document.createElement('span');
    marketingLabel.textContent = 'Marketing ';
    this.apiAdCostEl = document.createElement('span');
    this.apiAdCostEl.style.color = 'var(--text-secondary)';
    this.apiAdCostEl.style.fontSize = '0.8em';
    this.apiAdCostEl.innerHTML = moneyWithEmojiHtml(BALANCE.apiAdCost, 'funds');
    marketingLabel.appendChild(this.apiAdCostEl);
    marketingLabel.appendChild(document.createTextNode(':'));
    adControls.appendChild(marketingLabel);

    this.apiAdBtnGroup = new BulkBuyGroup((amt) => {
      dispatchGameAction(this.state, { type: 'buyAds', amount: amt });
    });
    adControls.appendChild(this.apiAdBtnGroup.el);

    adRow.appendChild(adControls);

    this.apiUnlockedContainer.appendChild(adRow);
    this.apiSection.appendChild(this.apiUnlockedContainer);

    body.appendChild(this.apiSection);

  }

  private buildTrainingProgressView(parent: HTMLElement): TrainingProgressRefs {
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

    const batchBar = document.createElement('div');
    batchBar.className = 'progress-bar';
    batchBar.style.height = '4px';
    batchBar.style.marginTop = '2px';
    const batchBarFill = document.createElement('div');
    batchBarFill.className = 'progress-bar-fill';
    batchBarFill.style.background = 'var(--accent-purple)';
    batchBarFill.style.opacity = '0.7';
    batchBar.appendChild(batchBarFill);
    container.appendChild(batchBar);

    const detail = document.createElement('div');
    detail.style.fontSize = '0.72rem';
    detail.style.color = 'var(--text-muted)';
    container.appendChild(detail);

    parent.appendChild(container);
    return { container, label, barFill, batchBarFill, detail };
  }

  private getTrainingProgressHundredths(progress: bigint, required: bigint): number {
    if (required <= 0n) return 0;
    const hundredths = Number((progress * 10000n) / required);
    return Math.max(0, Math.min(10000, hundredths));
  }

  private updateActiveTrainingProgress(name: string, progress: bigint, required: bigint): void {
    const totalHundredths = this.getTrainingProgressHundredths(progress, required);
    const wholePct = Math.floor(totalHundredths / 100);
    const batchPct = wholePct >= 100 ? 100 : (totalHundredths % 100);

    this.trainingProgressRefs.container.style.display = '';
    this.trainingNextRefs.container.style.display = 'none';
    this.trainingProgressRefs.label.textContent = `Training: ${name} ${wholePct}%`;
    this.trainingProgressRefs.barFill.style.width = `${wholePct}%`;
    this.trainingProgressRefs.batchBarFill.style.width = `${batchPct}%`;
    this.trainingProgressRefs.detail.innerHTML =
      `${formatNumber(progress)} ${emojiHtml('flops')} / ${formatNumber(required)} PFLOPS-hrs`;
  }

  private buildTrainingNextView(parent: HTMLElement): TrainingNextRefs {
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

  private buildTrainingAllocationHint(parent: HTMLElement): void {
    this.trainingAllocHint = document.createElement('div');
    this.trainingAllocHint.className = 'warning-text';
    this.trainingAllocHint.style.fontSize = '0.72rem';
    this.trainingAllocHint.style.display = 'none';
    this.trainingAllocHint.style.alignItems = 'center';
    this.trainingAllocHint.style.gap = '8px';

    this.trainingAllocHintMsg = document.createElement('span');
    this.trainingAllocHintMsg.textContent = 'Set training allocation above 0% to train!';
    this.trainingAllocHint.appendChild(this.trainingAllocHintMsg);

    this.trainingAllocHintBtn = document.createElement('button');
    this.trainingAllocHintBtn.type = 'button';
    this.trainingAllocHintBtn.className = 'btn-primary';
    this.trainingAllocHintBtn.style.fontSize = '0.68rem';
    this.trainingAllocHintBtn.style.padding = '1px 6px';
    this.trainingAllocHintBtn.textContent = 'Set 10%';
    this.trainingAllocHintBtn.addEventListener('click', () => {
      const currentInference = this.state.apiUnlocked ? this.state.apiInferenceAllocationPct : 0;
      const targetTraining = Math.max(1, Math.min(10, 100 - currentInference));
      const targetInference = Math.max(0, Math.min(currentInference, 100 - targetTraining));
      this.setUnifiedAllocations(targetTraining, targetInference);
      this.updateUnifiedAllocationUi(this.state);
    });
    this.trainingAllocHint.appendChild(this.trainingAllocHintBtn);

    parent.appendChild(this.trainingAllocHint);
  }

  private isTrainingAllocationUnlocked(state: GameState): boolean {
    return state.intelligence >= BALANCE.trainingUnlockIntel;
  }

  private toStepPct(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private getAgentsAllocationPct(state: GameState): number {
    return Math.max(0, 100 - state.trainingAllocationPct - state.apiInferenceAllocationPct);
  }

  private getAgentsRequiredPct(state: GameState): number {
    return getAgentsRequiredAllocationPct(state.totalPflops, getTotalAssignedAgents(state));
  }

  private getLoadRatio(used: bigint, capacity: bigint): number {
    if (capacity <= 0n) {
      return used > 0n ? Number.POSITIVE_INFINITY : 0;
    }
    return fromBigInt(used) / fromBigInt(capacity);
  }

  private getLoadColor(ratio: number, normalColor = 'var(--accent-blue)'): string {
    if (ratio > 2) return 'var(--accent-red)';
    if (ratio > 1) return 'var(--accent-gold)';
    return normalColor;
  }

  private getLoadPctLabel(ratio: number): string {
    if (!Number.isFinite(ratio)) return 'inf%';
    return `${Math.round(ratio * 100)}%`;
  }

  private getDataUnitForValue(valueGb: bigint): 'MB' | 'GB' | 'TB' {
    if (valueGb < scaleBigInt(1n)) return 'MB';
    if (valueGb >= scaleBigInt(1000n)) return 'TB';
    return 'GB';
  }

  private toDataUnitFromGb(valueGb: bigint, unit: 'MB' | 'GB' | 'TB'): bigint {
    if (unit === 'MB') return mulB(valueGb, toBigInt(1000));
    if (unit === 'TB') return divB(valueGb, toBigInt(1000));
    return valueGb;
  }

  private setUnifiedAllocations(trainingPct: number, inferencePct: number): void {
    dispatchGameAction(this.state, {
      type: 'setComputeAllocations',
      trainingPct,
      inferencePct,
    });
  }

  private updateUnifiedAllocationUi(state: GameState): void {
    const trainingUnlocked = this.isTrainingAllocationUnlocked(state);
    const inferenceUnlocked = state.apiUnlocked;
    if (!trainingUnlocked && !inferenceUnlocked) {
      this.computeAllocationWrap.classList.add('hidden');
      return;
    }

    this.computeAllocationWrap.classList.remove('hidden');

    const agentsPct = this.getAgentsAllocationPct(state);
    const inferencePct = inferenceUnlocked ? state.apiInferenceAllocationPct : 0;
    const trainingPct = trainingUnlocked ? state.trainingAllocationPct : 0;
    const agentsNeedPct = this.getAgentsRequiredPct(state);

    this.allocAgentsPctEl.textContent = `${agentsPct}%`;
    this.allocAgentsNeedEl.textContent = `(Req ${agentsNeedPct}%)`;
    this.allocAgentsNeedEl.style.color = agentsPct < agentsNeedPct ? 'var(--accent-red)' : '';
    this.allocInferencePctEl.textContent = `${inferencePct}%`;
    this.allocTrainingPctEl.textContent = `${trainingPct}%`;

    this.allocSegAgents.style.left = '0%';
    this.allocSegAgents.style.width = `${agentsPct}%`;
    this.allocSegInference.style.left = `${agentsPct}%`;
    this.allocSegInference.style.width = `${inferencePct}%`;
    this.allocSegTraining.style.left = `${agentsPct + inferencePct}%`;
    this.allocSegTraining.style.width = `${trainingPct}%`;

    this.allocHandleLeft.style.left = `${agentsPct}%`;
    this.allocHandleRight.style.left = `${agentsPct + inferencePct}%`;

    this.allocInferenceLabelEl.classList.toggle('hidden', !inferenceUnlocked);
    this.allocTrainingLabelEl.classList.toggle('hidden', !trainingUnlocked);
    this.allocInferenceLabelEl.classList.toggle('compute-allocation-label-inference-solo', inferenceUnlocked && !trainingUnlocked);

    const dual = trainingUnlocked && inferenceUnlocked;
    this.allocHandleLeft.style.display = '';
    this.allocHandleRight.style.display = dual ? '' : 'none';

    const autoAllocationUnlocked = isComputeAutoAllocationUnlocked(state.completedResearch);
    this.computeAutoAllocRow.style.display = autoAllocationUnlocked ? '' : 'none';
    this.computeAutoAllocBtn.classList.toggle('is-on', autoAllocationUnlocked && state.computeAutoAllocationEnabled);
    this.computeAutoAllocBtn.setAttribute(
      'aria-pressed',
      autoAllocationUnlocked && state.computeAutoAllocationEnabled ? 'true' : 'false',
    );

    const manualAllocationEnabled = !(autoAllocationUnlocked && state.computeAutoAllocationEnabled);
    this.allocSliderTrack.style.opacity = manualAllocationEnabled ? '' : '0.5';
    this.allocSliderTrack.style.pointerEvents = manualAllocationEnabled ? '' : 'none';
    if (!manualAllocationEnabled && this.activeAllocHandle !== null) {
      this.stopAllocationDrag();
    }
  }

  private startAllocationDrag(handle: 'left' | 'right', ev: PointerEvent): void {
    if (this.state.computeAutoAllocationEnabled) return;
    const trainingUnlocked = this.isTrainingAllocationUnlocked(this.state);
    const inferenceUnlocked = this.state.apiUnlocked;
    const dual = trainingUnlocked && inferenceUnlocked;
    if (!trainingUnlocked && !inferenceUnlocked) return;
    if (!dual && handle === 'right') return;
    ev.preventDefault();

    const agentsPct = this.getAgentsAllocationPct(this.state);
    const inferencePct = inferenceUnlocked ? this.state.apiInferenceAllocationPct : 0;
    const leftBoundary = agentsPct;
    const rightBoundary = agentsPct + inferencePct;

    let selectedHandle: 'left' | 'right' = handle;
    // Keep autoselection at extremes when merged handle choice would be pinned.
    if (dual) {
      if (selectedHandle === 'right' && leftBoundary >= 100) selectedHandle = 'left';
      if (selectedHandle === 'left' && rightBoundary <= 0) selectedHandle = 'right';
    }

    this.activeAllocHandle = selectedHandle;
    document.body.classList.add('compute-allocation-dragging');
    window.addEventListener('pointermove', this.onAllocPointerMove);
    window.addEventListener('pointerup', this.onAllocPointerUp);
    this.handleAllocationPointerMove(ev);
  }

  private stopAllocationDrag(): void {
    this.activeAllocHandle = null;
    document.body.classList.remove('compute-allocation-dragging');
    window.removeEventListener('pointermove', this.onAllocPointerMove);
    window.removeEventListener('pointerup', this.onAllocPointerUp);
  }

  private handleAllocationPointerMove(ev: PointerEvent): void {
    if (!this.activeAllocHandle) return;
    const rect = this.allocSliderTrack.getBoundingClientRect();
    if (rect.width <= 0) return;
    const rawPct = ((ev.clientX - rect.left) / rect.width) * 100;
    const pointerPct = this.toStepPct(Math.max(0, Math.min(100, rawPct)));
    const trainingUnlocked = this.isTrainingAllocationUnlocked(this.state);
    const inferenceUnlocked = this.state.apiUnlocked;
    const agentsPct = this.getAgentsAllocationPct(this.state);
    const inferencePct = inferenceUnlocked ? this.state.apiInferenceAllocationPct : 0;

    if (trainingUnlocked && inferenceUnlocked) {
      const minInferencePct = 1;
      let leftBoundary = Math.max(0, Math.min(100 - minInferencePct, agentsPct));
      let rightBoundary = Math.max(minInferencePct, Math.min(100, agentsPct + inferencePct));

      if (this.activeAllocHandle === 'left') {
        leftBoundary = Math.max(0, Math.min(100 - minInferencePct, pointerPct));
        if (leftBoundary >= rightBoundary - minInferencePct) {
          rightBoundary = Math.min(100, leftBoundary + minInferencePct);
          leftBoundary = rightBoundary - minInferencePct;
        }
      } else {
        rightBoundary = Math.max(minInferencePct, Math.min(100, pointerPct));
        if (rightBoundary <= leftBoundary + minInferencePct) {
          leftBoundary = Math.max(0, rightBoundary - minInferencePct);
          rightBoundary = leftBoundary + minInferencePct;
        }
      }

      const newInference = rightBoundary - leftBoundary;
      const newTraining = 100 - rightBoundary;
      this.setUnifiedAllocations(newTraining, newInference);
      this.updateUnifiedAllocationUi(this.state);
      return;
    }

    if (trainingUnlocked) {
      const newTraining = this.toStepPct(100 - pointerPct);
      this.setUnifiedAllocations(newTraining, 0);
      this.updateUnifiedAllocationUi(this.state);
      return;
    }

    if (inferenceUnlocked) {
      const newInference = this.toStepPct(100 - pointerPct);
      this.setUnifiedAllocations(0, newInference);
      this.updateUnifiedAllocationUi(this.state);
    }
  }

  private getCurrentModelName(state: GameState): string {
    if (state.ariesModelIndex >= 0) {
      return BALANCE.ariesModels[state.ariesModelIndex].name;
    }
    if (state.currentFineTuneIndex >= 0) {
      return BALANCE.fineTunes[state.currentFineTuneIndex].name;
    }
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

  private updateTrainingSection(state: GameState): void {
    const trainingUnlocked = state.intelligence >= BALANCE.trainingUnlockIntel;
    this.trainingSection.classList.toggle('hidden', !trainingUnlocked);
    if (!trainingUnlocked) return;

    if (state.currentFineTuneIndex >= 0) {
      const ft = BALANCE.fineTunes[state.currentFineTuneIndex];
      this.updateActiveTrainingProgress(ft.name, state.fineTuneProgress, ft.pflopsHrs);
    } else if (state.ariesModelIndex >= 0) {
      const am = BALANCE.ariesModels[state.ariesModelIndex];
      this.updateActiveTrainingProgress(am.name, state.ariesProgress, am.pflopsHrs);
    } else {
      this.trainingProgressRefs.container.style.display = 'none';
      const nextFT = this.getNextFineTune(state);
      if (nextFT !== null) {
        const ft = BALANCE.fineTunes[nextFT];
        this.trainingNextRefs.container.style.display = '';
        this.trainingNextRefs.info.innerHTML = `${ft.name} (${resourceLabelHtml('intel')} ${ft.intel})`;
        this.trainingNextRefs.info.style.color = 'var(--accent-green)';
        this.trainingNextRefs.info.style.fontWeight = 'bold';

        const dataBlocking = state.trainingData < ft.dataGB;
        const dataStr = `<span style="${dataBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(ft.dataGB)} ${emojiHtml('data')} GB data</span>`;
        let reqHtml = `${formatNumber(ft.pflopsHrs)} ${emojiHtml('flops')} PFLOPS-hrs + ${dataStr}`;
        if (ft.codeReq > 0n) {
          const codeBlocking = state.code < ft.codeReq;
          reqHtml += ` + <span style="${codeBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(ft.codeReq)} ${emojiHtml('code')} Code</span>`;
        }
        if (ft.scienceReq > 0n) {
          const scienceBlocking = state.science < ft.scienceReq;
          reqHtml += ` + <span style="${scienceBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(ft.scienceReq)} ${emojiHtml('science')} Science</span>`;
        }
        this.trainingNextRefs.reqs.innerHTML = reqHtml;
        this.trainingNextRefs.btn.textContent = 'Start Fine-tune';
        this.nextTrainingType = 'ft';
        this.nextTrainingIdx = nextFT;
        this.trainingNextRefs.btn.disabled = state.trainingData < ft.dataGB ||
          (ft.codeReq > 0n && state.code < ft.codeReq) ||
          (ft.scienceReq > 0n && state.science < ft.scienceReq);
      } else {
        const nextAries = this.getNextAries(state);
        if (nextAries !== null) {
          const am = BALANCE.ariesModels[nextAries];
          this.trainingNextRefs.container.style.display = '';
          this.trainingNextRefs.info.innerHTML = `${am.name} (${resourceLabelHtml('intel')} ~${am.intel})`;
          this.trainingNextRefs.info.style.color = 'var(--accent-purple)';
          this.trainingNextRefs.info.style.fontWeight = 'bold';

          const dataBlocking = state.trainingData < am.dataGB;
          const dataStr = `<span style="${dataBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(am.dataGB)} ${emojiHtml('data')} GB data</span>`;
          let reqHtml = `${formatNumber(am.pflopsHrs)} ${emojiHtml('flops')} PFLOPS-hrs + ${dataStr}`;
          if (am.codeReq > 0n) {
            const codeBlocking = state.code < am.codeReq;
            reqHtml += ` + <span style="${codeBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(am.codeReq)} ${emojiHtml('code')} Code</span>`;
          }
          if (am.scienceReq > 0n) {
            const scienceBlocking = state.science < am.scienceReq;
            reqHtml += ` + <span style="${scienceBlocking ? 'color: var(--accent-red);' : ''}">${formatNumber(am.scienceReq)} ${emojiHtml('science')} Science</span>`;
          }
          this.trainingNextRefs.reqs.innerHTML = reqHtml;
          this.trainingNextRefs.btn.textContent = 'Start Training';
          this.nextTrainingType = 'aries';
          this.nextTrainingIdx = nextAries;
          this.trainingNextRefs.btn.disabled = state.trainingData < am.dataGB ||
            (am.codeReq > 0n && state.code < am.codeReq) ||
            (am.scienceReq > 0n && state.science < am.scienceReq);
        } else {
          this.trainingNextRefs.container.style.display = 'none';
          this.nextTrainingType = null;
        }
      }
    }

    const runActive = state.currentFineTuneIndex >= 0 || state.ariesModelIndex >= 0;
    const stalledByAllocation = runActive && state.trainingAllocationPct === 0;
    this.trainingAllocHint.style.display = stalledByAllocation ? 'flex' : 'none';
  }

  update(state: GameState): void {
    this.state = state;
    const earthGpuCount = state.locationResources.earth.gpus;
    const modelName = this.getCurrentModelName(state);
    this.modelNameEl.innerHTML = `${modelName} (${resourceLabelHtml('intel')} ${(Math.round(state.intelligence * 10) / 10).toString()})`;
    this.buyGpuControls.setCount(earthGpuCount);
    this.gpuPricePart.textContent = `Cost: ${formatMoney(state.gpuMarketPrice)} each`;

    const allInstallable = earthGpuCount <= state.gpuCapacity;
    const shownInstalled = allInstallable ? earthGpuCount : state.installedGpuCount;
    const installedPct = earthGpuCount > 0n ? Number(shownInstalled * 100n / earthGpuCount) : 100;
    const stockLoadRatio = this.getLoadRatio(earthGpuCount, state.gpuCapacity);
    const stockColor = this.getLoadColor(stockLoadRatio);
    const stockPctColor = stockLoadRatio > 1 ? stockColor : 'var(--text-secondary)';
    const stockPct = this.getLoadPctLabel(stockLoadRatio);
    const installedPctLow = installedPct < 50;
    const installedPctColor = installedPctLow ? 'var(--accent-red)' : '';
    this.gpuStockBarFill.style.width = `${Math.min(100, Math.max(0, stockLoadRatio * 100))}%`;
    this.gpuStockBarFill.style.background = stockColor;
    const installedSegment = installedPct >= 100
      ? ''
      : ` | Installed ${formatNumber(shownInstalled)} (` +
        `<span style="color:${installedPctColor}">${installedPct}%</span>)`;
    this.gpuStatusEl.innerHTML =
      `Stock ${formatNumber(earthGpuCount)} / Capacity ${formatNumber(state.gpuCapacity)} ` +
      `(<span style="color:${stockPctColor}">${stockPct}</span>)${installedSegment}`;

    this.updateUnifiedAllocationUi(state);

    const gpuOwned = Math.floor(fromBigInt(earthGpuCount));
    const gpuSpaceLimit = Math.floor(fromBigInt(state.gpuCapacity));
    this.buyGpuControls.bulk.update(
      gpuOwned,
      (amt) => {
        if (amt <= 0) return false;
        const amountB = toBigInt(amt);
        if (earthGpuCount + amountB > state.gpuCapacity) return false;
        return state.funds >= BigInt(amt) * state.gpuMarketPrice;
      },
      gpuSpaceLimit,
      () => {
        flashElement(this.buyGpuControls.countEl);
      },
    );

    // Model upgrade
    const nextModelIdx = state.currentModelIndex + 1;
    if (nextModelIdx < BALANCE.models.length) {
      this.upgradeSection.style.display = 'block';
      const nextModel = BALANCE.models[nextModelIdx];
      if (this.upgradeInfo) {
          this.upgradeInfo.innerHTML = 'Upgrade: <strong style="color:var(--accent-green)">' + nextModel.name +
            '</strong> (' + resourceLabelHtml('intel') + ' ' + (Math.round(nextModel.intel * 10) / 10).toString() + ')';
      }
      if (this.upgradeBtn && this.upgradeBtnReq) {
          // Model upgrades are gated by installed GPUs (not stock).
          const gpuMet = state.installedGpuCount >= nextModel.minGpus;
          const gpuColor = gpuMet ? '' : 'var(--accent-red)';
      this.upgradeBtnReq.innerHTML = `(Requires ${formatNumber(nextModel.minGpus)} installed ${emojiHtml('gpus')} GPUs)`;
          this.upgradeBtnReq.style.color = gpuColor;
          this.upgradeBtn.disabled = !gpuMet;
      }
    } else {
      this.upgradeSection.style.display = 'none';
    }

    const workersUnlocked = state.unlockedJobs.includes('humanWorker');
    this.datacenterDivider.style.display = workersUnlocked ? '' : 'none';
    this.datacenterSection.style.display = workersUnlocked ? '' : 'none';
    this.apiDivider.style.display = workersUnlocked ? '' : 'none';

    if (!workersUnlocked) {
      this.datacenterHintEl.style.display = 'none';
      this.datacenterHintEl.style.visibility = 'hidden';
      this.datacenterHintEl.textContent = '\u00a0';
    } else {
      const allDatacentersMaxed = BALANCE.datacenters.length > 0 && BALANCE.datacenters.every((dc, i) => {
        const limit = dc.limit ?? 0;
        return limit > 0 && state.datacenters[i] >= toBigInt(limit);
      });
      const hasAnyDatacenter = state.datacenters.some((count) => count > 0n);

      // Datacenter hint
      if (allDatacentersMaxed) {
        this.datacenterHintEl.style.display = 'none';
        this.datacenterHintEl.style.visibility = 'hidden';
        this.datacenterHintEl.textContent = '\u00a0';
      } else if (earthGpuCount > state.gpuCapacity) {
        this.datacenterHintEl.style.display = '';
        this.datacenterHintEl.style.visibility = 'visible';
        this.datacenterHintEl.innerHTML = `Unutilized ${resourceLabelHtml('gpus')}! Buy datacenters to install them.`;
        this.datacenterHintEl.style.color = 'var(--accent-red)';
      } else if (earthGpuCount > scaleB(state.gpuCapacity, 0.8)) {
        this.datacenterHintEl.style.display = '';
        this.datacenterHintEl.style.visibility = 'visible';
        this.datacenterHintEl.innerHTML = `At ${formatNumber(state.gpuCapacity)} ${emojiHtml('gpus')} GPUs you'll need a datacenter.`;
        this.datacenterHintEl.style.color = 'var(--accent-blue)';
      } else if (state.gpuCapacity > earthGpuCount * 2n && hasAnyDatacenter) {
        this.datacenterHintEl.style.display = '';
        this.datacenterHintEl.style.visibility = 'visible';
        this.datacenterHintEl.innerHTML = `Hint: ${resourceLabelHtml('gpus', 'GPUs')} must be bought separately from datacenters.`;
        this.datacenterHintEl.style.color = 'var(--accent-blue)';
      } else {
        this.datacenterHintEl.style.display = '';
        this.datacenterHintEl.style.visibility = 'hidden';
        this.datacenterHintEl.textContent = '\u00a0';
      }

      // Datacenter purchase
      for (let i = 0; i < BALANCE.datacenters.length; i++) {
          const dc = BALANCE.datacenters[i];
          const refs = this.datacenterRows[i];
          // Only show if player is near needing it or already has previous tiers
          if (i === 0 || state.datacenters[i] > 0n || state.datacenters[Math.max(0, i - 1)] > 0n) {
              refs.row.style.display = 'flex';
              const earthLabor = state.locationResources.earth.labor;
              const owned = Math.floor(fromBigInt(state.datacenters[i]));
              const limit = dc.limit ?? 0;
              const maxQuantity = limit > 0 ? limit : null;
              const visibleTiers = getVisibleBuyTiers(owned, maxQuantity);
              const smallestTier = visibleTiers[0] ?? 0;
              const tierScale = toBigInt(smallestTier);
              const moneyNeed = smallestTier > 0 ? mulB(tierScale, dc.cost) : 0n;
              const laborNeed = smallestTier > 0 ? mulB(tierScale, dc.laborCost) : 0n;
              const laborMet = earthLabor >= laborNeed;
              const moneyMet = state.funds >= moneyNeed;

              refs.info.innerHTML = `${dc.name} (${formatNumber(dc.gpuCapacity)} ${emojiHtml('gpus')})`;
              refs.count.textContent = 'x' + formatNumber(state.datacenters[i]);

              const moneyColor = moneyMet ? 'var(--text-muted)' : 'var(--accent-red)';
              const laborColor = laborMet ? 'var(--text-muted)' : 'var(--accent-red)';
              refs.costMoney.innerHTML = moneyWithEmojiHtml(dc.cost, 'funds');
              refs.costMoney.style.color = moneyColor;
              refs.costLabor.innerHTML = `${formatNumber(dc.laborCost)} ${emojiHtml('labor')} labor`;
              refs.costLabor.style.color = laborColor;
              
              refs.bulk.update(owned, (amt) => {
                const amtB = toBigInt(amt);
                const moneyOk = state.funds >= mulB(amtB, dc.cost);
                const laborOk = earthLabor >= mulB(amtB, dc.laborCost);
                return moneyOk && laborOk;
              }, maxQuantity, (amt) => {
                const amtB = toBigInt(amt);
                const moneyOk = state.funds >= mulB(amtB, dc.cost);
                const laborOk = earthLabor >= mulB(amtB, dc.laborCost);
                if (!moneyOk) flashElement(refs.costMoney);
                if (!laborOk) flashElement(refs.costLabor);
                if (moneyOk && laborOk) flashElement(refs.count);
              });
          } else {
              refs.row.style.display = 'none';
          }
      }
    }


    // API Services selling
    this.updateTrainingSection(state);
    this.updateApiServices(state);
  }

  private updateApiServices(state: GameState): void {
    // Show preview if near unlock or unlocked
    const shouldShowPreview = state.intelligence >= BALANCE.apiUnlockIntel * 0.5; 
    
    if (!shouldShowPreview) {
      this.apiSection.classList.add('hidden');
      return;
    }

    this.apiSection.classList.remove('hidden');

    if (!state.apiUnlocked) {
      // Show locked preview
      this.apiLockedRow.style.display = '';
      this.apiUnlockedContainer.style.display = 'none';

      const intelMet = state.intelligence >= BALANCE.apiUnlockIntel;
      const codeMet = state.code >= BALANCE.apiUnlockCode;

      let html = `Sell API access to monetize your model.<br><br>` +
        `<span style="color: ${intelMet ? 'var(--accent-green)' : 'var(--accent-red)'}">` +
        `Intelligence ${(Math.round(BALANCE.apiUnlockIntel * 10) / 10).toString()}+</span> ` +
        `(${(Math.round(state.intelligence * 10) / 10).toString()})`;

      if (intelMet) {
        this.apiUnlockBtn.style.display = 'block';
        this.apiUnlockBtn.disabled = !codeMet;
        const color = codeMet ? 'var(--accent-green)' : 'var(--accent-red)';
        this.apiUnlockBtnReq.innerHTML = `(${formatNumber(BALANCE.apiUnlockCode)} ${emojiHtml('code')} Code)`;
        this.apiUnlockBtnReq.style.color = color;
      } else {
        // Only show code requirement text if button is hidden (i.e. if Intelligence not met)
        html += `<br><span style="color: ${codeMet ? 'var(--accent-green)' : 'var(--accent-red)'}">` +
        `${formatNumber(BALANCE.apiUnlockCode)} ${emojiHtml('code')} Code</span> ` +
        `(${formatNumber(state.code)})`;
        this.apiUnlockBtn.style.display = 'none';
      }
      
      this.apiLockedRow.innerHTML = html;
      return;
    }

    // Unlocked
    this.apiLockedRow.style.display = 'none';
    this.apiUnlockBtn.style.display = 'none';
    this.apiUnlockedContainer.style.display = '';

    // Active Users & Income
    this.apiInfoEl.innerHTML = `${resourceLabelHtml('users', 'Active Users')}: ${formatNumber(state.apiUserCount)} ` +
      `@ ${moneyWithEmojiHtml(state.apiPrice, 'funds')}/min = ${moneyWithEmojiHtml(state.apiIncomePerMin, 'funds')}/min`;

    const apiDataPerMin = mulB(state.apiUserCount, state.apiUserSynthRate);
    const aiSynthDataPerMin = state.synthDataRate > apiDataPerMin
      ? state.synthDataRate - apiDataPerMin
      : 0n;
    const dataQtyUnit = this.getDataUnitForValue(state.trainingData);
    const dataQty = this.toDataUnitFromGb(state.trainingData, dataQtyUnit);
    const dataPerMinUnit = this.getDataUnitForValue(apiDataPerMin);
    const dataPerMin = this.toDataUnitFromGb(apiDataPerMin, dataPerMinUnit);
    const dataPerUserUnit = this.getDataUnitForValue(state.apiUserSynthRate);
    const dataPerUser = this.toDataUnitFromGb(state.apiUserSynthRate, dataPerUserUnit);
    const aiSynthDataPerMinUnit = this.getDataUnitForValue(aiSynthDataPerMin);
    const aiSynthDataPerMinDisplay = this.toDataUnitFromGb(aiSynthDataPerMin, aiSynthDataPerMinUnit);
    this.apiDataInfoEl.innerHTML =
      `${emojiHtml('data')} Data <b>${formatNumber(dataQty)}</b> ${dataQtyUnit} ` +
      `+${formatNumber(dataPerMin)} ${dataPerMinUnit} / m ` +
      `(${formatNumber(state.apiUserCount)} Users x ${formatNumber(dataPerUser)} ${dataPerUserUnit}/m` +
      ` + ${formatNumber(aiSynthDataPerMinDisplay)} ${aiSynthDataPerMinUnit}/m AI Data Synthesizers)`;

    // Demand Bar
    const pflopsPerUser = getApiPflopsPerUser(state.apiQuality);
    const capacity = divB(state.apiReservedPflops, toBigInt(pflopsPerUser));
    const effectiveCapacityUsers = Math.min(fromBigInt(capacity), BALANCE.apiDemandCapUsers);
    const optimalPrice = getApiOptimalPrice(
      state.apiAwareness,
      state.intelligence,
      effectiveCapacityUsers,
    );
    const nearOptimalPrice = Math.abs(state.apiPrice - optimalPrice) <= Math.max(0.1, optimalPrice) * 0.1;
    const demandLoadRatio = this.getLoadRatio(state.apiDemand, capacity);
    const demandColor = nearOptimalPrice ? 'var(--accent-green)' : this.getLoadColor(demandLoadRatio);
    const demandPctColor = demandLoadRatio > 1 ? demandColor : 'var(--text-secondary)';
    this.apiDemandText.innerHTML =
      `Demand: ${formatNumber(state.apiDemand)} / ${resourceLabelHtml('users', 'Capacity')}: ${formatNumber(capacity)} Users ` +
      `(<span style="color:${demandPctColor}">${this.getLoadPctLabel(demandLoadRatio)}</span>)`;

    this.apiDemandBarFill.style.width = `${Math.min(100, Math.max(0, demandLoadRatio * 100))}%`;
    this.apiDemandBarFill.style.background = demandColor;

    // Price
    this.apiPriceVal.innerHTML = moneyWithEmojiHtml(state.apiPrice, 'funds');
    const autoPricingUnlocked = isApiAutoPricingUnlocked(state.completedResearch);
    const autoPricingEnabled = autoPricingUnlocked && state.apiAutoPriceEnabled;
    const manualPriceEnabled = !autoPricingEnabled;
    this.priceDecreaseGroup.el.style.opacity = manualPriceEnabled ? '' : '0.45';
    this.priceDecreaseGroup.el.style.pointerEvents = manualPriceEnabled ? '' : 'none';
    this.priceIncreaseGroup.el.style.opacity = manualPriceEnabled ? '' : '0.45';
    this.priceIncreaseGroup.el.style.pointerEvents = manualPriceEnabled ? '' : 'none';

    this.priceDecreaseGroup.update(state.apiPrice, (amt) => manualPriceEnabled && state.apiPrice - amt >= 1, null, () => {
      flashElement(this.apiPriceVal);
    });
    this.priceIncreaseGroup.update(state.apiPrice, () => manualPriceEnabled, null, () => {
      flashElement(this.apiPriceVal);
    });

    this.apiAutoPriceRow.style.display = autoPricingUnlocked ? '' : 'none';
    this.apiAutoPriceBtn.classList.toggle('is-on', autoPricingEnabled);
    this.apiAutoPriceBtn.setAttribute('aria-pressed', autoPricingEnabled ? 'true' : 'false');

    // Ads
    this.apiAdInfo.innerHTML = `Awareness: ${formatNumber(state.apiAwareness)}`;
    this.apiAdBtnGroup.update(state.apiAwareness, (amt) => state.funds >= BigInt(amt) * BALANCE.apiAdCost, null, () => {
      flashElement(this.apiAdCostEl);
    });

    // Improvements
    this.apiImproveInfo.innerHTML =
      `Inference Cost: ${formatNumber(pflopsPerUser)} PFLOPS/user` +
      `<br><span style="color:var(--text-muted);font-size:0.8em">${(Math.round(state.apiQuality * 10) / 10).toString()}x efficiency</span>`;
    this.apiImproveBtnGroup.update(
      state.apiImprovementLevel,
      (amt) => state.code >= BigInt(amt) * BALANCE.apiImproveCodeCost,
      BALANCE.apiImprovePurchaseLimit - 1,
      () => {
        flashElement(this.apiImproveCostEl);
      },
    );
  }
}
