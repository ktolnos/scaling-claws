import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber } from '../../game/utils.ts';
import { buyGpu, upgradeModel, buyDatacenter, setApiPrice, buyAds, setApiAllocation, improveApi, unlockApi } from '../../game/systems/ComputeSystem.ts';
import { BulkBuyGroup, getBuyTiers } from '../components/BulkBuyGroup.ts';

export class ComputePanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private modelNameEl!: HTMLSpanElement;
  // private modelIntelEl!: HTMLSpanElement; // REMOVED
  private gpuCountEl!: HTMLSpanElement;
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
  private upgradeInfo?: HTMLElement;
  private datacenterRows: HTMLElement[] = [];
  private apiSection!: HTMLDivElement;

  // API sub-elements
  private apiLockedRow!: HTMLDivElement;
  private apiUnlockBtn!: HTMLButtonElement;
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
  private apiAdBtn!: HTMLButtonElement;

  private apiImproveRow!: HTMLDivElement;
  private apiImproveBtn!: HTMLButtonElement;
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

    // GPU count
    const gpuRow = document.createElement('div');
    gpuRow.className = 'panel-row';
    const gpuLabel = document.createElement('span');
    gpuLabel.className = 'label';
    gpuLabel.textContent = 'GPUs:';
    this.gpuCountEl = document.createElement('span');
    this.gpuCountEl.className = 'value';
    gpuRow.appendChild(gpuLabel);
    gpuRow.appendChild(this.gpuCountEl);
    body.appendChild(gpuRow);


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

    // Buy GPU buttons
    this.buyGpuRow = document.createElement('div');
    this.buyGpuRow.className = 'panel-row';
    const buyLabel = document.createElement('span');
    buyLabel.className = 'label';
    buyLabel.innerHTML = 'Buy GPU <span style="opacity:0.6;font-size:0.8em">' + formatMoney(BALANCE.gpuCost) + ' each</span>';
    this.buyGpuRow.appendChild(buyLabel);

    this.buyGpuBtnGroup = document.createElement('div');
    this.buyGpuBtnGroup.className = 'bulk-buy-group';
    this.buyGpuRow.appendChild(this.buyGpuBtnGroup);
    body.appendChild(this.buyGpuRow);

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
    this.upgradeBtn.textContent = 'Upgrade';
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
        btn.addEventListener('click', () => buyDatacenter(this.state, i));
        right.appendChild(btn);

        row.appendChild(right);
        this.datacenterSection.appendChild(row);
        this.datacenterRows[i] = row;
    }

    // API Services section
    this.apiSection = document.createElement('div');
    this.apiSection.className = 'panel-section hidden';

    const subDivider = document.createElement('hr');
    subDivider.className = 'panel-divider';
    this.apiSection.appendChild(subDivider);

    const subTitle = document.createElement('div');
    subTitle.className = 'panel-section-title';
    subTitle.textContent = 'API SERVICES';
    this.apiSection.appendChild(subTitle);

    // Locked preview
    this.apiLockedRow = document.createElement('div');
    this.apiLockedRow.style.fontSize = '0.82rem';
    this.apiLockedRow.style.color = 'var(--text-secondary)';
    this.apiLockedRow.style.padding = '4px 0';
    this.apiSection.appendChild(this.apiLockedRow);

    this.apiUnlockBtn = document.createElement('button');
    this.apiUnlockBtn.textContent = `Launch API Service (${BALANCE.apiUnlockCode} Code)`;
    this.apiUnlockBtn.style.width = '100%';
    this.apiUnlockBtn.style.marginTop = '4px';
    this.apiUnlockBtn.style.display = 'none';
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
    this.apiImproveRow.style.marginTop = '4px';
    
    this.apiImproveInfo = document.createElement('span');
    this.apiImproveInfo.className = 'label';
    this.apiImproveRow.appendChild(this.apiImproveInfo);

    this.apiImproveBtn = document.createElement('button');
    this.apiImproveBtn.style.fontSize = '0.72rem';
    this.apiImproveBtn.addEventListener('click', () => improveApi(this.state));
    this.apiImproveRow.appendChild(this.apiImproveBtn);

    this.apiUnlockedContainer.appendChild(this.apiImproveRow);

    // Buy ads
    const adRow = document.createElement('div');
    adRow.className = 'panel-row';
    adRow.style.fontSize = '0.82rem';

    this.apiAdInfo = document.createElement('span');
    this.apiAdInfo.className = 'label';
    adRow.appendChild(this.apiAdInfo);

    this.apiAdBtn = document.createElement('button');
    this.apiAdBtn.textContent = 'Marketing ' + formatMoney(BALANCE.apiAdCost);
    this.apiAdBtn.style.fontSize = '0.72rem';
    this.apiAdBtn.addEventListener('click', () => buyAds(this.state));
    adRow.appendChild(this.apiAdBtn);

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

    this.modelNameEl.textContent = model.name + ' (Intel ' + model.intel + ')';
    // this.modelIntelEl.textContent = model.intel.toFixed(1); // REMOVED
    this.gpuCountEl.textContent = state.gpuCount + ' / ' + state.gpuCapacity + ' capacity';
    
    if (state.isPostGpuTransition) {
      this.unassignedLabelEl.textContent = 'Unassigned Agents:';
      const assignedCount = state.agents.filter(a => a.assignedJob !== 'unassigned').length;
      const unassignedCount = Math.max(0, state.activeAgentCount - assignedCount);
      
      this.unassignedCountEl.textContent = unassignedCount.toString();
      if (unassignedCount > 0) {
        this.unassignedCountEl.style.color = 'var(--accent-green)';
      } else {
        this.unassignedCountEl.style.color = '';
      }
    } else {
      this.unassignedLabelEl.textContent = 'Unassigned Agents:';
      const unassignedCount = state.agents.filter(a => a.assignedJob === 'unassigned').length;
      this.unassignedCountEl.textContent = unassignedCount.toString();
      if (unassignedCount > 0) {
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
    const tiers = getBuyTiers(state.gpuCount);
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
      btn.disabled = state.funds < amt * BALANCE.gpuCost || state.gpuCount >= state.gpuCapacity;
    });

    // Model upgrade
    const nextModelIdx = state.currentModelIndex + 1;
    if (nextModelIdx < BALANCE.models.length) {
      this.upgradeSection.style.display = 'block';
      const nextModel = BALANCE.models[nextModelIdx];
      if (this.upgradeInfo) {
          this.upgradeInfo.innerHTML = 'Upgrade: <strong style="color:var(--accent-green)">' + nextModel.name +
            '</strong> (Intel ' + nextModel.intel + ')';
      }
      if (this.upgradeBtn) {
          const gpuMet = state.gpuCount >= nextModel.minGpus;
          const gpuColor = gpuMet ? '' : 'var(--accent-red)';
          this.upgradeBtn.innerHTML = `Upgrade <span style="color: ${gpuColor}">(Requires ${nextModel.minGpus} GPUs)</span>`;
          this.upgradeBtn.disabled = !gpuMet;
      }
    } else {
      this.upgradeSection.style.display = 'none';
    }

    // Datacenter hint
    if (state.needsDatacenter) {
      this.datacenterHintEl.textContent = 'GPU capacity full! Buy a datacenter to expand.';
      this.datacenterHintEl.style.color = 'var(--accent-red)';
    } else if (state.gpuCount > state.gpuCapacity * 0.8) {
      this.datacenterHintEl.textContent = 'At ' + state.gpuCapacity + ' GPUs you\'ll need a datacenter.';
      this.datacenterHintEl.style.color = 'var(--accent-blue)';
    } else {
      this.datacenterHintEl.textContent = '';
    }

    // Datacenter purchase
    for (let i = 0; i < BALANCE.datacenters.length; i++) {
        const dc = BALANCE.datacenters[i];
        const row = this.datacenterRows[i];
        // Only show if player is near needing it or already has previous tiers
        if (i === 0 || state.datacenters[i] > 0 || state.datacenters[Math.max(0, i - 1)] > 0) {
            row.style.display = 'flex';
            const info = row.querySelector('.label')!;
            const laborMet = state.labor >= dc.laborCost;
            const moneyMet = state.funds >= dc.cost;

            info.innerHTML = `${dc.name} (${formatNumber(dc.gpuCapacity)} GPUs)`;

            const countSpan = row.querySelector('.value')!;
            countSpan.textContent = 'x' + state.datacenters[i];

            const btn = row.querySelector('button')!;
            const moneyColor = moneyMet ? '' : 'var(--accent-red)';
            const laborColor = laborMet ? '' : 'var(--accent-red)';
            btn.innerHTML = `Buy <span style="color: ${moneyColor}">${formatMoney(dc.cost)}</span> <span style="color: ${laborColor}">(${formatNumber(dc.laborCost)} labor)</span>`;
            btn.disabled = !moneyMet || !laborMet;
        } else {
            row.style.display = 'none';
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
        `Intelligence ${BALANCE.apiUnlockIntel.toFixed(1)}+</span> ` +
        `(${state.intelligence.toFixed(1)})`;

      if (intelMet) {
        this.apiUnlockBtn.style.display = 'block';
        this.apiUnlockBtn.disabled = !codeMet;
        const color = codeMet ? 'var(--accent-green)' : 'var(--accent-red)';
        this.apiUnlockBtn.innerHTML = `Launch API Service <span style="color:${color}">(${BALANCE.apiUnlockCode} Code)</span>`;
      } else {
        // Only show code requirement text if button is hidden (i.e. if Intelligence not met)
        html += `<br><span style="color: ${codeMet ? 'var(--accent-green)' : 'var(--accent-red)'}">` +
        `${BALANCE.apiUnlockCode} Code</span> ` +
        `(${Math.floor(state.code)})`;
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
    this.apiInfoEl.textContent = 'Active Users: ' + formatNumber(Math.floor(state.apiUserCount)) +
      ' @ ' + formatMoney(state.apiPrice) + '/min = ' + formatMoney(state.apiIncomePerMin) + '/min';

    // Allocation
    this.apiAllocVal.textContent = state.apiInferenceAllocationPct + '%';
    this.apiAllocMinus.disabled = state.apiInferenceAllocationPct <= 0;
    this.apiAllocPlus.disabled = state.apiInferenceAllocationPct >= 95;

    // Demand Bar
    const capacity = Math.floor(state.apiReservedPflops / BALANCE.apiPflopsPerUser);
    this.apiDemandText.textContent = `Demand: ${formatNumber(state.apiDemand)} / Capacity: ${formatNumber(capacity)} Users`;
    
    const utilization = capacity > 0 ? (state.apiUserCount / capacity) * 100 : 0;
    this.apiDemandBarFill.style.width = Math.min(100, utilization) + '%';
    if (state.apiDemand > capacity) {
        this.apiDemandBarFill.style.background = 'var(--accent-red)'; // Capacity constrained
    } else {
        this.apiDemandBarFill.style.background = 'var(--accent-blue)';
    }

    // Price
    this.apiPriceVal.textContent = formatMoney(state.apiPrice);
    this.priceDecreaseGroup.update(state.apiPrice, (amt) => state.apiPrice - amt >= 0.1);
    this.priceIncreaseGroup.update(state.apiPrice, (amt) => state.apiPrice + amt <= 1000);

    // Ads
    this.apiAdInfo.textContent = 'Awareness: ' + formatNumber(state.apiAwareness);
    this.apiAdBtn.disabled = state.funds < BALANCE.apiAdCost;

    // Improvements
    const nextLevel = state.apiImprovementLevel + 1;
    if (nextLevel < BALANCE.apiImprovementTiers.length) {
        const tier = BALANCE.apiImprovementTiers[nextLevel];
        this.apiImproveRow.style.display = 'flex';
        this.apiImproveInfo.textContent = `Quality: ${state.apiQuality}x`;
        const codeMet = state.code >= tier.cost;
        const codeColor = codeMet ? '' : 'var(--accent-red)';
        this.apiImproveBtn.innerHTML = `Improve API <span style="color: ${codeColor}">(${formatNumber(tier.cost)} Code)</span>`;
        this.apiImproveBtn.disabled = !codeMet;
    } else {
         this.apiImproveRow.style.display = 'none';
    }
  }
}
