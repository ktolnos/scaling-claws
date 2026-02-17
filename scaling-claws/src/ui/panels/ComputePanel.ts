import type { GameState } from '../../game/GameState.ts';
import { getTotalAssignedAgents } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber, fromBigInt, toBigInt, divB, scaleB } from '../../game/utils.ts';
import { buyGpu, upgradeModel, buyDatacenter, setApiPrice, buyAds, setApiAllocation, improveApi, unlockApi } from '../../game/systems/ComputeSystem.ts';
import { BulkBuyGroup, getBuyTiers } from '../components/BulkBuyGroup.ts';

export class ComputePanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private modelNameEl!: HTMLSpanElement;
  // private modelIntelEl!: HTMLSpanElement; // REMOVED
  private gpuCountEl!: HTMLSpanElement;
  private installedGpuRow!: HTMLDivElement;
  private installedGpuCountEl!: HTMLSpanElement;
  private unassignedCountEl!: HTMLSpanElement;
  private unassignedLabelEl!: HTMLSpanElement;
  private freeComputeEl!: HTMLSpanElement;

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
  private datacenterRows: { row: HTMLElement; btnText: HTMLSpanElement; btnMoney: HTMLSpanElement; btnLabor: HTMLSpanElement; btn: HTMLButtonElement }[] = [];
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
  
  private apiAllocRow!: HTMLDivElement;
  private apiAllocMinus!: HTMLButtonElement;
  private apiAllocVal!: HTMLSpanElement;
  private apiAllocPlus!: HTMLButtonElement;

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
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.build();
  }

  private build(): void {
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'COMPUTE';
    this.el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';

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

    // Intel row REMOVED

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

    // Agents Compute Allocation
    const agentsAllocRow = document.createElement('div');
    agentsAllocRow.className = 'panel-row';
    const agentsAllocLabel = document.createElement('span');
    agentsAllocLabel.className = 'label';
    agentsAllocLabel.textContent = 'Agents Compute Allocation:';
    this.freeComputeEl = document.createElement('span'); // Reusing freeComputeEl variable for this
    this.freeComputeEl.className = 'value';
    agentsAllocRow.appendChild(agentsAllocLabel);
    agentsAllocRow.appendChild(this.freeComputeEl);
    body.appendChild(agentsAllocRow);

    body.appendChild(this.createDivider());

    // GPUs buttons with count display
    this.buyGpuRow = document.createElement('div');
    this.buyGpuRow.className = 'panel-row';
    const buyLabel = document.createElement('span');
    buyLabel.className = 'label';
    buyLabel.style.display = 'flex';
    buyLabel.style.flexDirection = 'column';
    buyLabel.style.gap = '2px';

    const topPart = document.createElement('div');
    topPart.innerHTML = 'GPUs: ';
    this.gpuCountEl = document.createElement('span');
    this.gpuCountEl.className = 'value';
    this.gpuCountEl.style.fontWeight = 'bold';
    topPart.appendChild(this.gpuCountEl);
    buyLabel.appendChild(topPart);

    const pricePart = document.createElement('div');
    pricePart.style.opacity = '0.6';
    pricePart.style.fontSize = '0.72rem';
    pricePart.textContent = `${formatMoney(BALANCE.gpuCost)} each`;
    buyLabel.appendChild(pricePart);

    this.buyGpuRow.appendChild(buyLabel);

    this.buyGpuBtnGroup = document.createElement('div');
    this.buyGpuBtnGroup.className = 'bulk-buy-group';
    this.buyGpuRow.appendChild(this.buyGpuBtnGroup);
    body.appendChild(this.buyGpuRow);

    // Installed GPUs Row
    this.installedGpuRow = document.createElement('div');
    this.installedGpuRow.className = 'panel-row';
    this.installedGpuRow.style.fontSize = '0.85rem';
    this.installedGpuRow.style.color = 'var(--text-secondary)';
    
    const installedLabel = document.createElement('span');
    installedLabel.className = 'label';
    installedLabel.textContent = 'Installed GPUs:';
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

    body.appendChild(this.createDivider());

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

        const info = document.createElement('span');
        info.className = 'label';
        row.appendChild(info);

        const right = document.createElement('span');
        right.style.display = 'flex';
        right.style.gap = '4px';
        right.style.alignItems = 'center';

        const countSpan = document.createElement('span');
        countSpan.className = 'value';
        right.appendChild(countSpan);

        const btn = document.createElement('button');
        btn.style.fontSize = '0.75rem';
        
        const btnText = document.createElement('span');
        btnText.textContent = 'Buy ';
        btn.appendChild(btnText);
        
        const btnMoney = document.createElement('span');
        btn.appendChild(btnMoney);
        
        const btnSpace = document.createTextNode(' ');
        btn.appendChild(btnSpace);
        
        const btnLabor = document.createElement('span');
        btn.appendChild(btnLabor);
        
        btn.addEventListener('click', () => buyDatacenter(this.state, i));
        right.appendChild(btn);

        row.appendChild(right);
        this.datacenterSection.appendChild(row);
        this.datacenterRows[i] = { row, btnText, btnMoney, btnLabor, btn };
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

    // Allocation Controls
    this.apiAllocRow = document.createElement('div');
    this.apiAllocRow.className = 'panel-row';
    this.apiAllocRow.style.fontSize = '0.82rem';
    
    const allocLabel = document.createElement('span');
    allocLabel.className = 'label';
    allocLabel.textContent = 'Inference Allocation:';
    this.apiAllocRow.appendChild(allocLabel);

    const allocControls = document.createElement('span');
    allocControls.style.display = 'flex';
    allocControls.style.gap = '4px';
    allocControls.style.alignItems = 'center';

    this.apiAllocMinus = document.createElement('button');
    this.apiAllocMinus.textContent = '-5%';
    this.apiAllocMinus.style.fontSize = '0.72rem';
    this.apiAllocMinus.addEventListener('click', () => {
        setApiAllocation(this.state, this.state.apiInferenceAllocationPct - 5);
    });
    allocControls.appendChild(this.apiAllocMinus);

    this.apiAllocVal = document.createElement('span');
    this.apiAllocVal.className = 'value';
    this.apiAllocVal.style.minWidth = '36px';
    this.apiAllocVal.style.textAlign = 'center';
    allocControls.appendChild(this.apiAllocVal);

    this.apiAllocPlus = document.createElement('button');
    this.apiAllocPlus.textContent = '+5%';
    this.apiAllocPlus.style.fontSize = '0.72rem';
    this.apiAllocPlus.id = 'api-alloc-plus-btn'; // Add ID for flashing
    this.apiAllocPlus.addEventListener('click', () => {
        const success = setApiAllocation(this.state, this.state.apiInferenceAllocationPct + 5);
        if (!success) {
             // Flash Training Allocation controls
             // Dispatch event to notify TrainingPanel
             const event = new CustomEvent('flash-training-allocation');
             document.dispatchEvent(event);
        }
    });
    allocControls.appendChild(this.apiAllocPlus);

    // Listen for flash event from TrainingPanel
    document.addEventListener('flash-api-allocation', () => {
        this.apiAllocVal.classList.remove('flash-red');
        void this.apiAllocVal.offsetWidth;
        this.apiAllocVal.classList.add('flash-red');
    });

    this.apiAllocRow.appendChild(allocControls);
    this.apiUnlockedContainer.appendChild(this.apiAllocRow);

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
    priceLabel.textContent = 'Price API:';
    priceRow.appendChild(priceLabel);

    const priceControls = document.createElement('span');
    priceControls.style.display = 'flex';
    priceControls.style.gap = '4px';
    priceControls.style.alignItems = 'center';

    this.priceDecreaseGroup = new BulkBuyGroup((amt) => {
      setApiPrice(this.state, this.state.apiPrice - amt);
    }, '-$');
    priceControls.appendChild(this.priceDecreaseGroup.el);

    this.apiPriceVal = document.createElement('span');
    this.apiPriceVal.className = 'value';
    this.apiPriceVal.style.minWidth = '48px';
    this.apiPriceVal.style.textAlign = 'center';
    priceControls.appendChild(this.apiPriceVal);

    this.priceIncreaseGroup = new BulkBuyGroup((amt) => {
      setApiPrice(this.state, this.state.apiPrice + amt);
    }, '+$');
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
    improveLabel.innerHTML = `Optimization <span style="opacity:0.6;font-size:0.8em">(${formatNumber(BALANCE.apiImproveCodeCost)} Code)</span>:`;
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
    marketingLabel.innerHTML = `Marketing <span style="opacity:0.6;font-size:0.8em">${formatMoney(BALANCE.apiAdCost)}</span>:`;
    adControls.appendChild(marketingLabel);

    this.apiAdBtnGroup = new BulkBuyGroup((amt) => buyAds(this.state, amt));
    adControls.appendChild(this.apiAdBtnGroup.el);

    adRow.appendChild(adControls);

    this.apiUnlockedContainer.appendChild(adRow);
    this.apiSection.appendChild(this.apiUnlockedContainer);

    body.appendChild(this.apiSection);

    this.el.appendChild(body);
  }

  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  update(state: GameState): void {
    this.state = state;

    const model = BALANCE.models[state.currentModelIndex];

    this.modelNameEl.textContent = model.name + ' (Intel ' + (Math.round(model.intel * 10) / 10).toString() + ')';
    this.gpuCountEl.textContent = formatNumber(state.gpuCount);

    if (state.isPostGpuTransition) {
      this.installedGpuRow.style.display = 'flex';
      const installedPct = state.gpuCount > 0n ? Number(state.installedGpuCount * 100n / state.gpuCount) : 100;
      this.installedGpuCountEl.textContent = `${formatNumber(state.installedGpuCount)} (${installedPct}%) (Capacity: ${formatNumber(state.gpuCapacity)})`;
      if (state.installedGpuCount < state.gpuCount) {
        this.installedGpuCountEl.style.color = 'var(--accent-red)';
      } else {
        this.installedGpuCountEl.style.color = '';
      }
    } else {
      this.installedGpuRow.style.display = 'none';
    }
    
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

    // Display Agents Compute Allocation %
    // Reuse freeComputeEl
    const agentsAllocPct = Math.max(0, 100 - state.trainingAllocationPct - state.apiInferenceAllocationPct);
    const efficiencyPct = Math.round(state.agentEfficiency * 100);
    this.freeComputeEl.textContent = `${agentsAllocPct}% (Eff: ${efficiencyPct}%)`;
    
    if (efficiencyPct < 100) {
      this.freeComputeEl.style.color = 'var(--accent-red)'; // or orange
    } else {
      this.freeComputeEl.style.color = '';
    }

    // GPU buy buttons — rebuild if tiers changed, then update enabled state
    const gpuNum = Math.floor(fromBigInt(state.gpuCount));
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
            '</strong> (Intel ' + (Math.round(nextModel.intel * 10) / 10).toString() + ')';
      }
      if (this.upgradeBtn && this.upgradeBtnReq) {
          // nextModel.minGpus is already scaled in BalanceConfig
          const gpuMet = state.gpuCount >= nextModel.minGpus;
          const gpuColor = gpuMet ? '' : 'var(--accent-red)';
          this.upgradeBtnReq.textContent = `(Requires ${formatNumber(nextModel.minGpus)} GPUs)`;
          this.upgradeBtnReq.style.color = gpuColor;
          this.upgradeBtn.disabled = !gpuMet;
      }
    } else {
      this.upgradeSection.style.display = 'none';
    }

    // Datacenter hint
    if (state.gpuCount > state.installedGpuCount) {
      this.datacenterHintEl.textContent = 'Unutilized GPUs! Buy datacenters to install them.';
      this.datacenterHintEl.style.color = 'var(--accent-red)';
    } else if (state.gpuCount > scaleB(state.gpuCapacity, 0.8)) {
      this.datacenterHintEl.textContent = 'At ' + formatNumber(state.gpuCapacity) + ' GPUs you\'ll need a datacenter.';
      this.datacenterHintEl.style.color = 'var(--accent-blue)';
    } else if (state.gpuCapacity > state.gpuCount * 2n) {
      this.datacenterHintEl.textContent = 'Hint: GPUs must be bought separately from datacenters.';
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
            const info = refs.row.querySelector('.label')!;
            const laborMet = state.labor >= dc.laborCost;
            const moneyMet = state.funds >= dc.cost;

            info.textContent = `${dc.name} (${formatNumber(dc.gpuCapacity)} GPUs)`;

            const countSpan = refs.row.querySelector('.value')!;
            countSpan.textContent = 'x' + formatNumber(state.datacenters[i]);

            const btn = refs.btn;
            const moneyColor = moneyMet ? '' : 'var(--accent-red)';
            const laborColor = laborMet ? '' : 'var(--accent-red)';
            
            refs.btnMoney.textContent = formatMoney(dc.cost);
            refs.btnMoney.style.color = moneyColor;
            refs.btnLabor.textContent = `+ ${formatNumber(dc.laborCost)} labor`;
            refs.btnLabor.style.color = laborColor;
            
            btn.disabled = !moneyMet || !laborMet;
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
        this.apiUnlockBtnReq.textContent = `(${formatNumber(BALANCE.apiUnlockCode)} Code)`;
        this.apiUnlockBtnReq.style.color = color;
      } else {
        // Only show code requirement text if button is hidden (i.e. if Intelligence not met)
        html += `<br><span style="color: ${codeMet ? 'var(--accent-green)' : 'var(--accent-red)'}">` +
        `${formatNumber(BALANCE.apiUnlockCode)} Code</span> ` +
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
    this.apiInfoEl.textContent = 'Active Users: ' + formatNumber(state.apiUserCount) +
      ' @ ' + formatMoney(state.apiPrice) + '/min = ' + formatMoney(state.apiIncomePerMin) + '/min';

    // Allocation
    this.apiAllocVal.textContent = state.apiInferenceAllocationPct + '%';
    this.apiAllocMinus.disabled = state.apiInferenceAllocationPct <= 0;
    this.apiAllocPlus.disabled = state.apiInferenceAllocationPct >= 95;

    // Demand Bar
    const capacity = divB(state.apiReservedPflops, toBigInt(BALANCE.apiPflopsPerUser));
    this.apiDemandText.textContent = `Demand: ${formatNumber(state.apiDemand)} / Capacity: ${formatNumber(capacity)} Users`;
    
    const utilization = capacity > 0n ? Number(state.apiUserCount * 100n / capacity) : 0;
    this.apiDemandBarFill.style.width = Math.min(100, utilization) + '%';
    if (state.apiDemand > capacity) {
        this.apiDemandBarFill.style.background = 'var(--accent-red)'; // Capacity constrained
    } else {
        this.apiDemandBarFill.style.background = 'var(--accent-blue)';
    }

    // Price
    this.apiPriceVal.textContent = formatMoney(state.apiPrice);
    this.priceDecreaseGroup.update(state.apiPrice, (amt) => state.apiPrice - amt >= 0.1);
    this.priceIncreaseGroup.update(state.apiPrice, () => true);

    // Ads
    this.apiAdInfo.textContent = 'Awareness: ' + formatNumber(state.apiAwareness);
    this.apiAdBtnGroup.update(state.apiAwareness, (amt) => state.funds >= BigInt(amt) * BALANCE.apiAdCost);

    // Improvements
    this.apiImproveInfo.textContent = `Quality: ${(Math.round(state.apiQuality * 10) / 10).toString()}x`;
    this.apiImproveBtnGroup.update(state.apiImprovementLevel, (amt) => state.code >= BigInt(amt) * BALANCE.apiImproveCodeCost);
  }
}
