import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber, formatFlops } from '../../game/utils.ts';
import { buyGpu, upgradeModel, buyDatacenter, hireEngineer } from '../../game/systems/ComputeSystem.ts';

export class ComputePanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  private modelNameEl!: HTMLSpanElement;
  private modelIntelEl!: HTMLSpanElement;
  private gpuCountEl!: HTMLSpanElement;
  private totalFlopsEl!: HTMLSpanElement;
  private instancesEl!: HTMLSpanElement;
  private freeComputeEl!: HTMLSpanElement;

  private buyGpuBtns!: HTMLDivElement;
  private upgradeSection!: HTMLDivElement;
  private datacenterSection!: HTMLDivElement;
  private engineerSection!: HTMLDivElement;
  private datacenterHintEl!: HTMLDivElement;

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

    // Total FLOPS
    const flopsRow = document.createElement('div');
    flopsRow.className = 'panel-row';
    const flopsLabel = document.createElement('span');
    flopsLabel.className = 'label';
    flopsLabel.textContent = 'Total compute:';
    this.totalFlopsEl = document.createElement('span');
    this.totalFlopsEl.className = 'value';
    flopsRow.appendChild(flopsLabel);
    flopsRow.appendChild(this.totalFlopsEl);
    body.appendChild(flopsRow);

    // Instances
    const instRow = document.createElement('div');
    instRow.className = 'panel-row';
    const instLabel = document.createElement('span');
    instLabel.className = 'label';
    instLabel.textContent = 'Instances:';
    this.instancesEl = document.createElement('span');
    this.instancesEl.className = 'value';
    instRow.appendChild(instLabel);
    instRow.appendChild(this.instancesEl);
    body.appendChild(instRow);

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

    body.appendChild(this.createDivider());

    // Datacenter hint / buy section
    this.datacenterHintEl = document.createElement('div');
    this.datacenterHintEl.style.fontSize = '0.82rem';
    this.datacenterHintEl.style.color = 'var(--accent-blue)';
    body.appendChild(this.datacenterHintEl);

    this.datacenterSection = document.createElement('div');
    this.datacenterSection.className = 'panel-section';
    body.appendChild(this.datacenterSection);

    // Engineer section
    this.engineerSection = document.createElement('div');
    this.engineerSection.className = 'panel-section';
    body.appendChild(this.engineerSection);

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
    this.totalFlopsEl.textContent = formatFlops(state.totalPflops);
    this.instancesEl.textContent = state.instanceCount + ' (' + formatFlops(model.pflopsPerInstance) + '/inst)';
    this.freeComputeEl.textContent = formatFlops(state.freeCompute);

    // GPU buy buttons enable/disable
    const btns = this.buyGpuBtns.querySelectorAll('button');
    btns.forEach(btn => {
      const amt = parseInt(btn.dataset.amount ?? '1');
      btn.disabled = state.funds < amt * BALANCE.gpuCost || state.gpuCount >= state.gpuCapacity;
    });

    // Model upgrade
    this.upgradeSection.innerHTML = '';
    const nextModelIdx = state.currentModelIndex + 1;
    if (nextModelIdx < BALANCE.models.length) {
      const nextModel = BALANCE.models[nextModelIdx];
      const row = document.createElement('div');
      row.className = 'panel-row';
      row.style.padding = '4px 0';

      const info = document.createElement('span');
      info.className = 'label';
      info.innerHTML = 'Upgrade: <strong style="color:var(--accent-green)">' + nextModel.name +
        '</strong> (Intel ' + nextModel.intel + ') — Requires ' + nextModel.minGpus + ' GPUs';
      row.appendChild(info);

      const btn = document.createElement('button');
      btn.textContent = 'Upgrade';
      btn.disabled = state.gpuCount < nextModel.minGpus;
      btn.addEventListener('click', () => upgradeModel(this.state, nextModelIdx));
      row.appendChild(btn);

      this.upgradeSection.appendChild(row);
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
    this.datacenterSection.innerHTML = '';
    // Show next purchasable datacenter tier
    for (let i = 0; i < BALANCE.datacenters.length; i++) {
      const dc = BALANCE.datacenters[i];
      // Only show if player is near needing it or already has previous tiers
      if (i === 0 || state.datacenters[i] > 0 || state.datacenters[Math.max(0, i - 1)] > 0) {
        const row = document.createElement('div');
        row.className = 'panel-row';
        row.style.fontSize = '0.82rem';

        const info = document.createElement('span');
        info.className = 'label';
        info.textContent = dc.name + ' (' + formatNumber(dc.gpuCapacity) + ' GPUs) ' + dc.engineersRequired + ' Eng';
        row.appendChild(info);

        const right = document.createElement('span');
        right.style.display = 'flex';
        right.style.gap = '4px';
        right.style.alignItems = 'center';

        const countSpan = document.createElement('span');
        countSpan.className = 'value';
        countSpan.textContent = 'x' + state.datacenters[i];
        right.appendChild(countSpan);

        const btn = document.createElement('button');
        btn.textContent = 'Buy ' + formatMoney(dc.cost);
        btn.style.fontSize = '0.75rem';
        const engAvailable = state.engineerCount - state.engineersRequired;
        btn.disabled = state.funds < dc.cost || engAvailable < dc.engineersRequired;
        btn.addEventListener('click', () => buyDatacenter(this.state, i));
        right.appendChild(btn);

        row.appendChild(right);
        this.datacenterSection.appendChild(row);
      }
    }

    // Engineers
    this.engineerSection.innerHTML = '';
    if (state.isPostGpuTransition) {
      const engRow = document.createElement('div');
      engRow.className = 'panel-row';
      const engInfo = document.createElement('span');
      engInfo.className = 'label';
      engInfo.textContent = 'Engineers: ' + state.engineerCount + '/' + state.engineersRequired + ' needed';
      engRow.appendChild(engInfo);

      const engBtn = document.createElement('button');
      engBtn.textContent = 'Hire ' + formatMoney(BALANCE.humanEngineerCostPerMin) + '/min';
      engBtn.style.fontSize = '0.75rem';
      engBtn.disabled = state.funds < BALANCE.humanEngineerCostPerMin;
      engBtn.addEventListener('click', () => hireEngineer(this.state));
      engRow.appendChild(engBtn);

      this.engineerSection.appendChild(engRow);
    }
  }
}
