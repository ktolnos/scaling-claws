import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber, formatFlops } from '../../game/utils.ts';
import { buyGpu, upgradeModel, buyDatacenter } from '../../game/systems/ComputeSystem.ts';

export class ComputePanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private modelNameEl!: HTMLSpanElement;
  private modelIntelEl!: HTMLSpanElement;
  private gpuCountEl!: HTMLSpanElement;
  private unassignedCountEl!: HTMLSpanElement;
  private unassignedLabelEl!: HTMLSpanElement;
  private freeComputeEl!: HTMLSpanElement;

  private buyGpuBtns!: HTMLDivElement;
  private upgradeSection!: HTMLDivElement;
  private datacenterSection!: HTMLDivElement;
  private datacenterHintEl!: HTMLDivElement;

  private upgradeBtn?: HTMLButtonElement;
  private upgradeInfo?: HTMLElement;
  private datacenterRows: HTMLElement[] = [];

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

    // Intel row
    const intelRow = document.createElement('div');
    intelRow.className = 'panel-row';
    const intelLabel = document.createElement('span');
    intelLabel.className = 'label';
    intelLabel.textContent = 'Intelligence:';
    this.modelIntelEl = document.createElement('span');
    this.modelIntelEl.className = 'value';
    this.modelIntelEl.style.color = 'var(--accent-purple)';
    intelRow.appendChild(intelLabel);
    intelRow.appendChild(this.modelIntelEl);
    body.appendChild(intelRow);

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

    // Flash listener
    document.addEventListener('flash-unassigned', () => {
      this.unassignedCountEl.classList.remove('flash-red');
      void this.unassignedCountEl.offsetWidth; // trigger reflow
      this.unassignedCountEl.classList.add('flash-red');
    });

    // Free compute
    const freeRow = document.createElement('div');
    freeRow.className = 'panel-row';
    const freeLabel = document.createElement('span');
    freeLabel.className = 'label';
    freeLabel.textContent = 'Free compute:';
    this.freeComputeEl = document.createElement('span');
    this.freeComputeEl.className = 'value';
    freeRow.appendChild(freeLabel);
    freeRow.appendChild(this.freeComputeEl);
    body.appendChild(freeRow);

    body.appendChild(this.createDivider());

    // Buy GPU buttons
    this.buyGpuBtns = document.createElement('div');
    this.buyGpuBtns.className = 'panel-row';
    const buyLabel = document.createElement('span');
    buyLabel.className = 'label';
    buyLabel.innerHTML = 'Buy GPU <span style="opacity:0.6;font-size:0.8em">' + formatMoney(BALANCE.gpuCost) + ' each</span>';
    this.buyGpuBtns.appendChild(buyLabel);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'bulk-buy-group';
    for (const amt of [1, 10, 100]) {
      const btn = document.createElement('button');
      btn.textContent = '+' + amt;
      btn.dataset.amount = amt.toString();
      btn.addEventListener('click', () => buyGpu(this.state, amt));
      btnGroup.appendChild(btn);
    }
    this.buyGpuBtns.appendChild(btnGroup);
    body.appendChild(this.buyGpuBtns);

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
    this.modelIntelEl.textContent = model.intel.toFixed(1);
    this.gpuCountEl.textContent = state.gpuCount + ' / ' + state.gpuCapacity + ' capacity';
    
    if (state.isPostGpuTransition) {
      this.unassignedLabelEl.textContent = 'Available Agents:';
      const agentsOnJobs = state.agents.filter(a => a.assignedJob !== 'unassigned').length;
      const available = Math.max(0, state.instanceCount - agentsOnJobs);
      this.unassignedCountEl.textContent = available.toString();
      if (available > 0) {
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

    this.freeComputeEl.textContent = formatFlops(state.freeCompute);

    // GPU buy buttons enable/disable
    const btns = this.buyGpuBtns.querySelectorAll('button');
    btns.forEach(btn => {
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
          this.upgradeBtn.textContent = `Upgrade (Requires ${nextModel.minGpus} GPUs)`;
          this.upgradeBtn.disabled = state.gpuCount < nextModel.minGpus;
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
            const engAvailable = state.engineerCount - state.engineersRequired;
            const engMet = engAvailable >= dc.engineersRequired;
            
            const engText = `<span style="color: ${engMet ? 'inherit' : 'var(--accent-red)'}">(requires ${dc.engineersRequired} engineers)</span>`;
            info.innerHTML = `${dc.name} (${formatNumber(dc.gpuCapacity)} GPUs) ${engText}`;
            
            const countSpan = row.querySelector('.value')!;
            countSpan.textContent = 'x' + state.datacenters[i];
            
            const btn = row.querySelector('button')!;
            btn.textContent = 'Buy ' + formatMoney(dc.cost);
            btn.disabled = state.funds < dc.cost || !engMet;
        } else {
            row.style.display = 'none';
        }
    }
  }
}
