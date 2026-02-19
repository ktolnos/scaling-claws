import type { GameState } from '../../game/GameState.ts';
import { getTotalAssignedAgents } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatNumber, formatMoney, fromBigInt, toBigInt, divB, scaleB, mulB } from '../../game/utils.ts';
import { buyGpu, upgradeModel, buyDatacenter, setApiPrice, buyAds, improveApi, unlockApi, setComputeAllocations } from '../../game/systems/ComputeSystem.ts';
import { BulkBuyGroup, getBuyTiers } from '../components/BulkBuyGroup.ts';
import { createPanelDivider, createPanelScaffold } from '../components/PanelScaffold.ts';
import { UI_EMOJI, emojiHtml, moneyWithEmojiHtml, resourceLabelHtml } from '../emoji.ts';

export class ComputePanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private modelNameEl!: HTMLSpanElement;
  private gpuCountEl!: HTMLSpanElement;
  private gpuStatusEl!: HTMLSpanElement;
  private installedGpuRow!: HTMLDivElement;
  private installedGpuCountEl!: HTMLSpanElement;
  private unassignedCountEl!: HTMLSpanElement;
  private unassignedLabelEl!: HTMLSpanElement;
  private agentEfficiencyEl!: HTMLDivElement;
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
  private activeAllocHandle: 'left' | 'right' | null = null;
  private readonly onAllocPointerMove = (ev: PointerEvent) => this.handleAllocationPointerMove(ev);
  private readonly onAllocPointerUp = () => this.stopAllocationDrag();

  private buyGpuRow!: HTMLDivElement;
  private buyGpuBtnGroup!: HTMLDivElement;
  private lastGpuTiers: string = '';
  private upgradeSection!: HTMLDivElement;
  private datacenterSection!: HTMLDivElement;
  private datacenterHintEl!: HTMLDivElement;

  private upgradeBtn?: HTMLButtonElement;
  private upgradeBtnText?: HTMLSpanElement;
  private upgradeBtnReq?: HTMLSpanElement;
  private upgradeInfo?: HTMLElement;
  private datacenterRows: { row: HTMLElement; info: HTMLSpanElement; costInfo: HTMLSpanElement; count: HTMLSpanElement; bulk: BulkBuyGroup }[] = [];
  private apiSection!: HTMLDivElement;

  // API sub-elements
  private apiLockedRow!: HTMLDivElement;
  private apiUnlockBtn!: HTMLButtonElement;
  private apiUnlockBtnReq!: HTMLSpanElement;
  private apiUnlockedContainer!: HTMLDivElement;
  private apiInfoEl!: HTMLSpanElement;
  private priceDecreaseGroup!: BulkBuyGroup;
  private apiPriceVal!: HTMLSpanElement;
  private priceIncreaseGroup!: BulkBuyGroup;
  
  private apiDemandBar!: HTMLDivElement;
  private apiDemandBarFill!: HTMLDivElement;
  private apiDemandText!: HTMLDivElement;

  private apiAdInfo!: HTMLSpanElement;
  private apiAdBtnGroup!: BulkBuyGroup;

  private apiImproveRow!: HTMLDivElement;
  private apiImproveBtnGroup!: BulkBuyGroup;
  private apiImproveInfo!: HTMLSpanElement;

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
    this.modelNameEl = document.createElement('span');
    this.modelNameEl.className = 'value';
    this.modelNameEl.style.fontWeight = '600';
    modelRow.appendChild(modelLabel);
    modelRow.appendChild(this.modelNameEl);
    body.appendChild(modelRow);

    // Unassigned Agents
    const unassignedRow = document.createElement('div');
    unassignedRow.className = 'panel-row';
    this.unassignedLabelEl = document.createElement('span');
    this.unassignedLabelEl.className = 'label';
    this.unassignedLabelEl.textContent = 'Unassigned Agents:';
    this.unassignedCountEl = document.createElement('span');
    this.unassignedCountEl.className = 'value';
    this.unassignedCountEl.style.fontWeight = '600';
    unassignedRow.appendChild(this.unassignedLabelEl);
    unassignedRow.appendChild(this.unassignedCountEl);
    body.appendChild(unassignedRow);

    this.agentEfficiencyEl = document.createElement('div');
    this.agentEfficiencyEl.style.fontSize = '0.72rem';
    this.agentEfficiencyEl.style.color = 'var(--text-secondary)';
    this.agentEfficiencyEl.style.marginTop = '-2px';
    this.agentEfficiencyEl.style.marginBottom = '2px';
    body.appendChild(this.agentEfficiencyEl);

    // Flash listeners
    document.addEventListener('flash-unassigned', () => {
      this.unassignedCountEl.classList.remove('flash-red');
      void this.unassignedCountEl.offsetWidth; // trigger reflow
      this.unassignedCountEl.classList.add('flash-red');
    });

    document.addEventListener('flash-gpu-capacity', () => {
      this.unassignedCountEl.classList.remove('flash-red');
      void this.unassignedCountEl.offsetWidth; // trigger reflow
      this.unassignedCountEl.classList.add('flash-red');
    });

    // Unified compute allocation slider
    this.computeAllocationWrap = document.createElement('div');
    this.computeAllocationWrap.className = 'compute-allocation-wrap hidden';

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
    body.appendChild(this.computeAllocationWrap);

    body.appendChild(createPanelDivider());

    // GPUs buttons with count display
    this.buyGpuRow = document.createElement('div');
    this.buyGpuRow.className = 'panel-row';
    const buyLabel = document.createElement('span');
    buyLabel.className = 'label';
    buyLabel.style.display = 'flex';
    buyLabel.style.flexDirection = 'column';
    buyLabel.style.gap = '2px';

    const topPart = document.createElement('div');
    topPart.innerHTML = `${resourceLabelHtml('gpus', 'GPUs')}`;
    buyLabel.appendChild(topPart);

    const statusPart = document.createElement('div');
    statusPart.style.color = 'var(--text-secondary)';
    statusPart.style.fontSize = '0.72rem';
    this.gpuStatusEl = document.createElement('span');
    statusPart.appendChild(this.gpuStatusEl);
    buyLabel.appendChild(statusPart);

    const pricePart = document.createElement('div');
    pricePart.style.color = 'var(--text-secondary)';
    pricePart.style.fontSize = '0.72rem';
    pricePart.textContent = `Cost: ${formatMoney(BALANCE.gpuCost)} each`;
    buyLabel.appendChild(pricePart);

    this.buyGpuRow.appendChild(buyLabel);

    const gpuControls = document.createElement('div');
    gpuControls.style.display = 'flex';
    gpuControls.style.alignItems = 'center';
    gpuControls.style.gap = '4px';

    this.gpuCountEl = document.createElement('span');
    this.gpuCountEl.className = 'value';
    this.gpuCountEl.style.minWidth = '36px';
    this.gpuCountEl.style.textAlign = 'right';
    this.gpuCountEl.style.fontWeight = 'bold';
    gpuControls.appendChild(this.gpuCountEl);

    this.buyGpuBtnGroup = document.createElement('div');
    this.buyGpuBtnGroup.className = 'bulk-buy-group';
    gpuControls.appendChild(this.buyGpuBtnGroup);
    this.buyGpuRow.appendChild(gpuControls);
    body.appendChild(this.buyGpuRow);

    // Installed GPUs Row
    this.installedGpuRow = document.createElement('div');
    this.installedGpuRow.className = 'panel-row';
    this.installedGpuRow.style.fontSize = '0.85rem';
    this.installedGpuRow.style.color = 'var(--text-secondary)';
    
    const installedLabel = document.createElement('span');
    installedLabel.className = 'label';
    installedLabel.innerHTML = 'Installed GPUs';
    this.installedGpuRow.appendChild(installedLabel);
    
    this.installedGpuCountEl = document.createElement('span');
    this.installedGpuCountEl.className = 'value';
    this.installedGpuRow.appendChild(this.installedGpuCountEl);
    body.appendChild(this.installedGpuRow);

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
    this.upgradeBtnText = document.createElement('span');
    this.upgradeBtnText.textContent = 'Upgrade ';
    this.upgradeBtn.appendChild(this.upgradeBtnText);
    this.upgradeBtnReq = document.createElement('span');
    this.upgradeBtn.appendChild(this.upgradeBtnReq);

    this.upgradeBtn.addEventListener('click', () => {
      const nextIdx = this.state.currentModelIndex + 1;
      if (nextIdx < BALANCE.models.length) {
        upgradeModel(this.state, nextIdx);
      }
    });
    uRow.appendChild(this.upgradeBtn);
    this.upgradeSection.appendChild(uRow);

    body.appendChild(createPanelDivider());

    // Datacenter hint / buy section
    this.datacenterHintEl = document.createElement('div');
    this.datacenterHintEl.style.fontSize = '0.82rem';
    this.datacenterHintEl.style.color = 'var(--accent-blue)';
    body.appendChild(this.datacenterHintEl);

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
        left.appendChild(info);

        const costInfo = document.createElement('span');
        costInfo.style.fontSize = '0.68rem';
        costInfo.style.color = 'var(--text-muted)';
        left.appendChild(costInfo);

        row.appendChild(left);

        const right = document.createElement('span');
        right.style.display = 'flex';
        right.style.gap = '4px';
        right.style.alignItems = 'center';

        const countSpan = document.createElement('span');
        countSpan.className = 'value';
        right.appendChild(countSpan);

        const bulk = new BulkBuyGroup((amt) => {
          for (let k = 0; k < amt; k++) {
            if (!buyDatacenter(this.state, i)) break;
          }
        }, '+');
        right.appendChild(bulk.el);

        row.appendChild(right);
        this.datacenterSection.appendChild(row);
        this.datacenterRows[i] = { row, info, costInfo, count: countSpan, bulk };
    }

    // API Services section
    this.apiSection = document.createElement('div');
    this.apiSection.className = 'panel-section hidden';

    const subDivider = document.createElement('hr');
    subDivider.className = 'panel-divider';
    this.apiSection.appendChild(subDivider);

    const subTitle = document.createElement('div');
    subTitle.className = 'panel-section-title api-services';
    subTitle.textContent = 'API SERVICES';
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
    
    this.apiUnlockBtn.addEventListener('click', () => unlockApi(this.state));
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
    priceRow.appendChild(priceLabel);

    const priceControls = document.createElement('span');
    priceControls.style.display = 'flex';
    priceControls.style.gap = '4px';
    priceControls.style.alignItems = 'center';

    this.priceDecreaseGroup = new BulkBuyGroup((amt) => {
      setApiPrice(this.state, this.state.apiPrice - amt);
    }, `-${UI_EMOJI.money}`);
    priceControls.appendChild(this.priceDecreaseGroup.el);

    this.apiPriceVal = document.createElement('span');
    this.apiPriceVal.className = 'value';
    this.apiPriceVal.style.minWidth = '48px';
    this.apiPriceVal.style.textAlign = 'center';
    priceControls.appendChild(this.apiPriceVal);

    this.priceIncreaseGroup = new BulkBuyGroup((amt) => {
      setApiPrice(this.state, this.state.apiPrice + amt);
    }, `+${UI_EMOJI.money}`);
    priceControls.appendChild(this.priceIncreaseGroup.el);

    priceRow.appendChild(priceControls);
    this.apiUnlockedContainer.appendChild(priceRow);

    // Improve API
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
    improveLabel.innerHTML = `Optimization <span style="color:var(--text-secondary);font-size:0.8em">(${formatNumber(BALANCE.apiImproveCodeCost)} ${emojiHtml('code')} Code)</span>:`;
    improveControls.appendChild(improveLabel);

    this.apiImproveBtnGroup = new BulkBuyGroup((amt) => improveApi(this.state, amt));
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
    marketingLabel.innerHTML = `Marketing <span style="color:var(--text-secondary);font-size:0.8em">${moneyWithEmojiHtml(BALANCE.apiAdCost, 'funds')}</span>:`;
    adControls.appendChild(marketingLabel);

    this.apiAdBtnGroup = new BulkBuyGroup((amt) => buyAds(this.state, amt));
    adControls.appendChild(this.apiAdBtnGroup.el);

    adRow.appendChild(adControls);

    this.apiUnlockedContainer.appendChild(adRow);
    this.apiSection.appendChild(this.apiUnlockedContainer);

    body.appendChild(this.apiSection);

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
    const assignedAgents = getTotalAssignedAgents(state);
    if (assignedAgents <= 0n) return 0;

    // Match the displayed unassigned logic in GPU era:
    // unassigned = max(activeAgentCount - assignedAgents, 0)
    // We want the highest allocation percent where this becomes 0.
    const pflopsPerAgent = toBigInt(BALANCE.pflopsPerGpu);
    for (let pct = 100; pct >= 0; pct--) {
      const allocatedPflops = mulB(state.totalPflops, toBigInt(pct)) / 100n;
      const activeAgentsAtPct = divB(allocatedPflops, pflopsPerAgent);
      if (activeAgentsAtPct <= assignedAgents) return pct;
    }
    return 0;
  }

  private updateAgentEfficiencyDisplay(state: GameState): void {
    const efficiencyPct = Math.max(0, Math.round(state.agentEfficiency * 100));
    const assignedAgents = getTotalAssignedAgents(state);
    const pflopsNeeded = scaleB(assignedAgents, BALANCE.pflopsPerGpu);
    const computeAllocPct = pflopsNeeded > 0n
      ? Math.max(0, Math.min(100, Math.round(fromBigInt(divB(state.freeCompute, pflopsNeeded)) * 100)))
      : 100;
    const powerPct = Math.max(0, Math.min(100, Math.round(state.powerThrottle * 100)));
    const efficiencyColor = efficiencyPct === 100 ? 'var(--text-primary)' : 'var(--accent-red)';
    const reasons: Array<{ label: string; pct: number }> = [];
    if (computeAllocPct < 100) reasons.push({ label: 'Compute Allocation', pct: computeAllocPct });
    if (powerPct < 100) reasons.push({ label: 'Insufficient⚡', pct: powerPct });

    let breakdown = '';
    if (reasons.length === 1) {
      breakdown = ` (${reasons[0].label})`;
    } else if (reasons.length >= 2) {
      breakdown = ` (${reasons[0].pct}% ${reasons[0].label} x ${reasons[1].pct}% ${reasons[1].label})`;
    }

    this.agentEfficiencyEl.innerHTML = `Agents Efficiency: <span style="color:${efficiencyColor}">${efficiencyPct}%</span>${breakdown}`;
  }

  private setUnifiedAllocations(trainingPct: number, inferencePct: number): void {
    setComputeAllocations(this.state, trainingPct, inferencePct);
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
  }

  private startAllocationDrag(handle: 'left' | 'right', ev: PointerEvent): void {
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
    const trainingPct = trainingUnlocked ? this.state.trainingAllocationPct : 0;

    if (trainingUnlocked && inferenceUnlocked) {
      if (this.activeAllocHandle === 'left') {
        const rightBoundary = Math.max(0, Math.min(100, agentsPct + inferencePct));
        const newAgents = Math.max(0, Math.min(rightBoundary, pointerPct));
        const newInference = rightBoundary - newAgents;
        const newTraining = trainingPct;
        this.setUnifiedAllocations(newTraining, newInference);
        this.updateUnifiedAllocationUi(this.state);
        return;
      }

      const leftBoundary = Math.max(0, Math.min(100, agentsPct));
      const newRight = Math.max(leftBoundary, Math.min(100, pointerPct));
      const newInference = newRight - leftBoundary;
      const newTraining = 100 - newRight;
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

  update(state: GameState): void {
    this.state = state;
    const earthGpuCount = state.locationResources.earth.gpus;

    const model = BALANCE.models[state.currentModelIndex];

    this.modelNameEl.innerHTML = `${model.name} (${resourceLabelHtml('intel')} ${(Math.round(model.intel * 10) / 10).toString()})`;
    this.gpuCountEl.textContent = 'x' + formatNumber(earthGpuCount);

    const allInstallable = earthGpuCount <= state.gpuCapacity;
    const shownInstalled = allInstallable ? earthGpuCount : state.installedGpuCount;
    const installedPct = earthGpuCount > 0n ? Number(shownInstalled * 100n / earthGpuCount) : 100;
    const stockLow = state.gpuCapacity > 0n && (earthGpuCount * 2n < state.gpuCapacity);
    const capacityReached = earthGpuCount >= state.gpuCapacity;
    const installedPctLow = installedPct < 50;
    const stockColor = stockLow ? 'var(--accent-blue)' : '';
    const capacityColor = capacityReached ? 'var(--accent-red)' : '';
    const installedPctColor = installedPctLow ? 'var(--accent-red)' : '';
    this.gpuStatusEl.innerHTML =
      `Stock <span style="color:${stockColor}">${formatNumber(earthGpuCount)}</span> | ` +
      `Installed ${formatNumber(shownInstalled)} (` +
      `<span style="color:${installedPctColor}">${installedPct}%</span>) | ` +
      `Capacity <span style="color:${capacityColor}">${formatNumber(state.gpuCapacity)}</span>`;

    // Replaced by compact status line under GPUs row.
    this.installedGpuRow.style.display = 'none';
    
    if (state.isPostGpuTransition) {
      this.unassignedLabelEl.textContent = 'Unassigned Agents:';
      const assignedCount = getTotalAssignedAgents(state);
      const diff = state.activeAgentCount - assignedCount;
      const unassignedCount = diff > 0n ? diff : 0n;
      
      this.unassignedCountEl.textContent = formatNumber(unassignedCount);
      if (unassignedCount > 0n) {
        this.unassignedCountEl.style.color = 'var(--accent-green)';
      } else {
        this.unassignedCountEl.style.color = '';
      }
    } else {
      this.unassignedLabelEl.textContent = 'Unassigned Agents:';
      const unassignedCount = state.agentPools['unassigned'].totalCount;
      this.unassignedCountEl.textContent = formatNumber(unassignedCount);
      if (unassignedCount > 0n) {
        this.unassignedCountEl.style.color = 'var(--accent-green)';
      } else {
        this.unassignedCountEl.style.color = '';
      }
    }

    this.updateAgentEfficiencyDisplay(state);
    this.updateUnifiedAllocationUi(state);

    // GPU buy buttons — rebuild if tiers changed, then update enabled state
    const gpuNum = Math.floor(fromBigInt(earthGpuCount));
    const tiers = getBuyTiers(gpuNum);
    const tiersKey = tiers.join(',');
    if (tiersKey !== this.lastGpuTiers) {
      this.lastGpuTiers = tiersKey;
      this.buyGpuBtnGroup.innerHTML = '';
      for (const amt of tiers) {
        const btn = document.createElement('button');
        btn.textContent = '+' + formatNumber(amt);
        btn.dataset.amount = amt.toString();
        btn.addEventListener('click', () => buyGpu(this.state, amt));
        this.buyGpuBtnGroup.appendChild(btn);
      }
    }
    const gpuBtns = this.buyGpuBtnGroup.querySelectorAll('button');
    gpuBtns.forEach(btn => {
      const amt = parseInt(btn.dataset.amount ?? '1');
      btn.disabled = state.funds < BigInt(amt) * BALANCE.gpuCost;
    });

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
          // nextModel.minGpus is already scaled in BalanceConfig
          const gpuMet = earthGpuCount >= nextModel.minGpus;
          const gpuColor = gpuMet ? '' : 'var(--accent-red)';
      this.upgradeBtnReq.innerHTML = `(Requires ${formatNumber(nextModel.minGpus)} ${emojiHtml('gpus')} GPUs)`;
          this.upgradeBtnReq.style.color = gpuColor;
          this.upgradeBtn.disabled = !gpuMet;
      }
    } else {
      this.upgradeSection.style.display = 'none';
    }

    // Datacenter hint
    if (earthGpuCount > state.gpuCapacity) {
      this.datacenterHintEl.innerHTML = `Unutilized ${resourceLabelHtml('gpus')}! Buy datacenters to install them.`;
      this.datacenterHintEl.style.color = 'var(--accent-red)';
    } else if (earthGpuCount > scaleB(state.gpuCapacity, 0.8)) {
      this.datacenterHintEl.innerHTML = `At ${formatNumber(state.gpuCapacity)} ${emojiHtml('gpus')} GPUs you'll need a datacenter.`;
      this.datacenterHintEl.style.color = 'var(--accent-blue)';
    } else if (state.gpuCapacity > earthGpuCount * 2n) {
      this.datacenterHintEl.innerHTML = `Hint: ${resourceLabelHtml('gpus', 'GPUs')} must be bought separately from datacenters.`;
      this.datacenterHintEl.style.color = 'var(--accent-blue)';
    } else {
      this.datacenterHintEl.textContent = '';
    }

    // Datacenter purchase
    for (let i = 0; i < BALANCE.datacenters.length; i++) {
        const dc = BALANCE.datacenters[i];
        const refs = this.datacenterRows[i];
        // Only show if player is near needing it or already has previous tiers
        if (i === 0 || state.datacenters[i] > 0n || state.datacenters[Math.max(0, i - 1)] > 0n) {
            refs.row.style.display = 'flex';
            const earthLabor = state.locationResources.earth.labor;
            const laborMet = earthLabor >= dc.laborCost;
            const moneyMet = state.funds >= dc.cost;

            refs.info.innerHTML = `${dc.name} (${formatNumber(dc.gpuCapacity)} ${emojiHtml('gpus')})`;
            refs.count.textContent = 'x' + formatNumber(state.datacenters[i]);

            const moneyColor = moneyMet ? 'var(--text-muted)' : 'var(--accent-red)';
            const laborColor = laborMet ? 'var(--text-muted)' : 'var(--accent-red)';
            refs.costInfo.innerHTML =
              `<span style="color:${moneyColor}">${moneyWithEmojiHtml(dc.cost, 'funds')}</span>` +
              ` + ` +
              `<span style="color:${laborColor}">${formatNumber(dc.laborCost)} ${emojiHtml('labor')} labor</span>`;
            
            const limit = dc.limit ?? 0;
            refs.bulk.update(Math.floor(fromBigInt(state.datacenters[i])), (amt) => {
              const amtB = toBigInt(amt);
              const moneyOk = state.funds >= mulB(amtB, dc.cost);
              const laborOk = earthLabor >= mulB(amtB, dc.laborCost);
              return moneyOk && laborOk;
            }, limit > 0 ? limit : null);
        } else {
            refs.row.style.display = 'none';
        }
    }


    // API Services selling
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

    // Demand Bar
    const capacity = divB(state.apiReservedPflops, toBigInt(BALANCE.apiPflopsPerUser));
    this.apiDemandText.innerHTML = `Demand: ${formatNumber(state.apiDemand)} / ${resourceLabelHtml('users', 'Capacity')}: ${formatNumber(capacity)} Users`;
    
    const utilization = capacity > 0n ? Number(state.apiUserCount * 100n / capacity) : 0;
    this.apiDemandBarFill.style.width = Math.min(100, utilization) + '%';
    if (state.apiDemand > capacity) {
        this.apiDemandBarFill.style.background = 'var(--accent-red)'; // Capacity constrained
    } else {
        this.apiDemandBarFill.style.background = 'var(--accent-blue)';
    }

    // Price
    this.apiPriceVal.innerHTML = moneyWithEmojiHtml(state.apiPrice, 'funds');
    this.priceDecreaseGroup.update(state.apiPrice, (amt) => state.apiPrice - amt >= 0.1);
    this.priceIncreaseGroup.update(state.apiPrice, () => true);

    // Ads
    this.apiAdInfo.innerHTML = `Awareness: ${formatNumber(state.apiAwareness)}`;
    this.apiAdBtnGroup.update(state.apiAwareness, (amt) => state.funds >= BigInt(amt) * BALANCE.apiAdCost);

    // Improvements
    this.apiImproveInfo.innerHTML = `Quality: ${(Math.round(state.apiQuality * 10) / 10).toString()}x`;
    this.apiImproveBtnGroup.update(state.apiImprovementLevel, (amt) => state.code >= BigInt(amt) * BALANCE.apiImproveCodeCost);
  }
}
