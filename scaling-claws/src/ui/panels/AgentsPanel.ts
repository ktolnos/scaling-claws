import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE, getNextTier } from '../../game/BalanceConfig.ts';
import { formatNumber, formatMoney, mulB, fromBigInt, toBigInt, divB } from '../../game/utils.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import { flashElement } from '../UIUtils.ts';
import { createPanelDivider, createPanelScaffold } from '../components/PanelScaffold.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';
import { CountBulkBuyControls } from '../components/CountBulkBuyControls.ts';
import { UI_EMOJI, emojiHtml, moneyWithEmojiHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';

export class AgentsPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;
  private onTransition: (() => void) | null;

  // Subscription Tier Elements
  private subTierNameEl!: HTMLSpanElement;
  private upgradeBtn!: HTMLButtonElement;
  private upgradeBtnTitleEl!: HTMLDivElement;
  private upgradeBtnIntelEl!: HTMLDivElement;

  // Agent Controls
  private agentSection!: HTMLDivElement;
  private agentHireControls!: CountBulkBuyControls;
  private unassignedCountEl!: HTMLSpanElement;
  private agentCostEl!: HTMLSpanElement;

  // Other refs
  private coresRow!: HTMLDivElement;
  private micMiniRow!: HTMLDivElement;
  private coresEl!: HTMLSpanElement;
  private micMiniControls!: CountBulkBuyControls;
  private micMiniBuyMetaEl!: HTMLSpanElement;
  private micMiniBuyGroup!: BulkBuyGroup;
  private selfHostedSection!: HTMLDivElement;
  private selfHostedCostEl!: HTMLSpanElement;
  private selfHostedBtn!: HTMLButtonElement;

  constructor(state: GameState, onTransition?: () => void) {
    this.state = state;
    this.onTransition = onTransition ?? null;
    const { panel } = createPanelScaffold('AGENTS');
    this.el = panel;
    this.build();
  }

  private build(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    // --- Subscription Tier Section ---
    const tierSection = document.createElement('div');
    tierSection.className = 'section';
    tierSection.style.marginBottom = '12px';
    tierSection.style.borderBottom = '1px solid var(--border-color)';
    tierSection.style.paddingBottom = '8px';

    const tierHeader = document.createElement('div');
    tierHeader.className = 'panel-row';
    const tierLabel = document.createElement('span');
    tierLabel.className = 'label';
    tierLabel.textContent = 'Subscription Tier';
    setHintTarget(tierLabel, 'mechanic.jobs');
    
    const tierValue = document.createElement('div');
    tierValue.style.textAlign = 'right';
    this.subTierNameEl = document.createElement('div');
    this.subTierNameEl.className = 'highlight';
    
    tierValue.appendChild(this.subTierNameEl);
    tierHeader.appendChild(tierLabel);
    tierHeader.appendChild(tierValue);
    tierSection.appendChild(tierHeader);

    const intelHint = document.createElement('div');
    intelHint.style.fontSize = '0.72rem';
    intelHint.style.color = 'var(--text-muted)';
    intelHint.style.marginTop = '4px';
    intelHint.textContent = 'Higher intelligence = faster job completion and less getting stuck.';
    tierSection.appendChild(intelHint);

    this.upgradeBtn = document.createElement('button');
    this.upgradeBtn.className = 'btn-buy';
    this.upgradeBtn.style.width = '100%';
    this.upgradeBtn.style.marginTop = '8px';
    this.upgradeBtnTitleEl = document.createElement('div');
    this.upgradeBtnIntelEl = document.createElement('div');
    this.upgradeBtnIntelEl.style.fontSize = '0.82em';
    this.upgradeBtnIntelEl.style.opacity = '0.9';
    this.upgradeBtn.appendChild(this.upgradeBtnTitleEl);
    this.upgradeBtn.appendChild(this.upgradeBtnIntelEl);
    this.upgradeBtn.addEventListener('click', () => {
      const next = getNextTier(this.state.subscriptionTier);
      if (!next) return;

      const actionResult = dispatchGameAction(this.state, { type: 'upgradeTier', tier: next });
      if (!actionResult.ok) {
        flashElement(this.upgradeBtn);
      }
    });

    tierSection.appendChild(this.upgradeBtn);
    body.appendChild(tierSection);

    // --- Agent Hiring Details (Moved from JobsPanel) ---
    this.agentSection = document.createElement('div');
    this.agentSection.className = 'section';
    this.agentSection.style.marginBottom = '12px';
    
    const agentRow = document.createElement('div');
    agentRow.className = 'panel-row';
    agentRow.style.alignItems = 'center';
    
    const agentLabel = document.createElement('span');
    agentLabel.className = 'label';
    agentLabel.textContent = 'Active Agents';
    setHintTarget(agentLabel, 'mechanic.agentCapacity');
    
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.alignItems = 'center';

    this.agentHireControls = new CountBulkBuyControls((amount) => {
      const actionResult = dispatchGameAction(this.state, { type: 'hireAgent', amount });
      const hired = typeof actionResult.info.performed === 'number' ? actionResult.info.performed : 0;
      if (hired < amount) {
        if (this.state.isPostGpuTransition) {
          document.dispatchEvent(new CustomEvent('flash-gpu-capacity'));
        } else {
          flashElement(this.coresEl);
        }
      }
    }, { prefix: '+' });
    controls.appendChild(this.agentHireControls.el);
    
    agentRow.appendChild(agentLabel);
    agentRow.appendChild(controls);
    
    // --- Unassigned Agents Row ---
    const unassignedRow = document.createElement('div');
    unassignedRow.className = 'panel-row';
    unassignedRow.style.marginTop = '4px';
    unassignedRow.style.fontSize = '0.8rem';
    
    const unassignedLabel = document.createElement('span');
    unassignedLabel.className = 'label';
    unassignedLabel.textContent = 'Unassigned Agents';
    setHintTarget(unassignedLabel, 'mechanic.agentCapacity');
    
    this.unassignedCountEl = document.createElement('span');
    this.unassignedCountEl.className = 'value';
    this.unassignedCountEl.style.fontWeight = '600';
    this.unassignedCountEl.textContent = '0';
    
    unassignedRow.appendChild(unassignedLabel);
    unassignedRow.appendChild(this.unassignedCountEl);
    this.agentSection.appendChild(unassignedRow);

    // Flash listener
    document.addEventListener('flash-unassigned', () => {
      flashElement(this.unassignedCountEl);
    });
    
    this.agentCostEl = document.createElement('div');
    this.agentCostEl.className = 'sub-label';
    this.agentCostEl.style.textAlign = 'right';
    this.agentCostEl.style.fontSize = '0.75rem';
    this.agentCostEl.style.color = 'var(--text-muted)';
    this.agentCostEl.style.marginTop = '4px';

    this.agentSection.appendChild(agentRow);
    this.agentSection.appendChild(this.agentCostEl);
    body.appendChild(this.agentSection);


    // --- Hardware ---
    // Divider
    body.appendChild(createPanelDivider());

    // CPU Cores
    this.coresRow = document.createElement('div');
    this.coresRow.className = 'panel-row';
    const coresLabel = document.createElement('span');
    coresLabel.className = 'label';
    coresLabel.textContent = 'CPU Cores';
    setHintTarget(coresLabel, 'mechanic.agentCapacity');
    this.coresEl = document.createElement('span');
    this.coresEl.className = 'value';
    this.coresRow.appendChild(coresLabel);
    this.coresRow.appendChild(this.coresEl);
    body.appendChild(this.coresRow);

    // Mic-mini row
    this.micMiniRow = document.createElement('div');
    this.micMiniRow.className = 'panel-row';
    const micLeft = document.createElement('span');
    micLeft.style.display = 'flex';
    micLeft.style.alignItems = 'center';
    micLeft.style.gap = '8px';
    const micLabel = document.createElement('span');
    micLabel.className = 'label';
    micLabel.textContent = BALANCE.micMini.displayName + ':';
    setHintTarget(micLabel, 'infra.micMini');
    micLeft.appendChild(micLabel);

    const micRight = document.createElement('span');
    micRight.style.display = 'flex';
    micRight.style.flexDirection = 'column';
    micRight.style.alignItems = 'flex-end';
    micRight.style.gap = '2px';

    this.micMiniBuyMetaEl = document.createElement('span');
    this.micMiniBuyMetaEl.className = 'sub-label';
    this.micMiniBuyMetaEl.style.fontSize = '0.75rem';
    this.micMiniBuyMetaEl.style.color = 'var(--text-muted)';

    this.micMiniControls = new CountBulkBuyControls((amount) => {
      dispatchGameAction(this.state, { type: 'buyMicMini', amount });
    }, { prefix: '+' });
    this.micMiniBuyGroup = this.micMiniControls.bulk;

    micRight.appendChild(this.micMiniBuyMetaEl);
    micRight.appendChild(this.micMiniControls.el);

    this.micMiniRow.appendChild(micLeft);
    this.micMiniRow.appendChild(micRight);
    body.appendChild(this.micMiniRow);

    // Go Self-Hosted section (hidden initially)
    this.selfHostedSection = document.createElement('div');
    this.selfHostedSection.className = 'hidden';
    this.selfHostedSection.style.padding = '8px';
    this.selfHostedSection.style.marginTop = '4px';
    this.selfHostedSection.style.border = '1px solid var(--accent-green)';
    this.selfHostedSection.style.borderRadius = '4px';
    this.selfHostedSection.style.background = 'rgba(78, 204, 163, 0.05)';

    const shTitle = document.createElement('div');
    shTitle.style.fontWeight = '600';
    shTitle.style.marginBottom = '4px';
    shTitle.style.color = 'var(--accent-green)';
    shTitle.textContent = 'Go self-hosted';

    const shDesc = document.createElement('div');
    shDesc.style.fontSize = '0.78rem';
    shDesc.style.color = 'var(--text-secondary)';
    shDesc.style.marginBottom = '6px';
    shDesc.textContent = 'Replace subscriptions with GPUs running DeepKick-405B (Intel 3.0).';

    this.selfHostedCostEl = document.createElement('div');
    this.selfHostedCostEl.style.fontSize = '0.82rem';
    this.selfHostedCostEl.style.marginBottom = '6px';

    this.selfHostedBtn = document.createElement('button');
    this.selfHostedBtn.className = 'btn-primary';
    this.selfHostedBtn.textContent = 'Go Self-Hosted';
    this.selfHostedBtn.addEventListener('click', () => {
      const actionResult = dispatchGameAction(this.state, { type: 'goSelfHosted' });
      if (actionResult.ok && this.onTransition) {
        this.onTransition();
      }
    });

    this.selfHostedSection.appendChild(shTitle);
    this.selfHostedSection.appendChild(shDesc);
    this.selfHostedSection.appendChild(this.selfHostedCostEl);
    this.selfHostedSection.appendChild(this.selfHostedBtn);
    body.appendChild(this.selfHostedSection);
  }

  update(state: GameState): void {
    this.state = state;
    
    // -- Subscription Tier --
    const currentTier = BALANCE.tiers[state.subscriptionTier];
    this.subTierNameEl.textContent = currentTier.displayName;
    
    // Upgrade Info
    const nextTierType = getNextTier(state.subscriptionTier);
    if (nextTierType) {
      const nextTier = BALANCE.tiers[nextTierType];
      
      this.upgradeBtn.style.display = 'block';
      const agentCount = state.totalAgents;
      const deltaCostPerAgent = nextTier.cost - currentTier.cost;
      const upgradeCost = mulB(deltaCostPerAgent, agentCount);
      const currentIntel = (Math.round(currentTier.intel * 10) / 10).toString();
      const nextIntel = (Math.round(nextTier.intel * 10) / 10).toString();
      this.upgradeBtnTitleEl.textContent = `Upgrade to ${nextTier.displayName} (${formatMoney(upgradeCost)})`;
      this.upgradeBtnIntelEl.textContent = `${UI_EMOJI.intel} Intel ${currentIntel} ${UI_EMOJI.route} ${nextIntel}`;
      
      this.upgradeBtn.disabled = deltaCostPerAgent <= 0n || state.funds < upgradeCost;
      
    } else {
      this.upgradeBtn.style.display = 'none';
    }

    // -- Agent Controls --
    this.agentHireControls.setCount(state.totalAgents);
    const unassignedCount = state.agentPools['unassigned'].totalCount;

    this.unassignedCountEl.textContent = formatNumber(unassignedCount);
    if (unassignedCount > 0n) {
      this.unassignedCountEl.style.color = 'var(--accent-green)';
    } else {
      this.unassignedCountEl.style.color = '';
    }
    
    const coresPerAgent = toBigInt(currentTier.coresPerAgent);
    const maxAgentsByPflops = divB(state.totalPflops, toBigInt(BALANCE.pflopsPerGpu));
    const showAgentControls = state.intelligence >= BALANCE.agentControlUnlockIntel;
    this.agentSection.classList.toggle('hidden', !showAgentControls);
    const showCpuCores = showAgentControls && state.totalAgents >= toBigInt(2);
    this.coresRow.classList.toggle('hidden', !showCpuCores);

    const nextAgent = state.totalAgents + toBigInt(1);
    const cpuLimitReached = !state.isPostGpuTransition &&
      mulB(nextAgent, coresPerAgent) > state.cpuCoresTotal;
    const showMicMiniControls = showAgentControls && (cpuLimitReached || state.micMiniCount > 0n);
    this.micMiniRow.classList.toggle('hidden', !showMicMiniControls);

    this.agentHireControls.bulk.update(
      Math.floor(fromBigInt(state.totalAgents)),
      (amount) => {
        if (amount <= 0) return false;
        const amountB = toBigInt(amount);
        const totalCost = mulB(amountB, currentTier.cost);
        if (state.funds < totalCost) return false;

        if (state.isPostGpuTransition) {
          return state.totalAgents + amountB <= maxAgentsByPflops;
        }

        const requiredCores = mulB(state.totalAgents + amountB, coresPerAgent);
        return requiredCores <= state.cpuCoresTotal;
      },
      undefined,
      (amount) => {
        const amountB = toBigInt(amount);
        const totalCost = mulB(amountB, currentTier.cost);
        const blockedByFunds = state.funds < totalCost;
        if (blockedByFunds) {
          document.dispatchEvent(new CustomEvent('flash-funds'));
          return;
        }

        if (state.isPostGpuTransition) {
          document.dispatchEvent(new CustomEvent('flash-gpu-capacity'));
        } else {
          flashElement(this.coresEl);
        }
      },
    );

    this.agentCostEl.innerHTML = `${moneyWithEmojiHtml(currentTier.cost, 'funds')} per agent`;

    // CPU Cores
    const coresFree = state.cpuCoresTotal - state.usedCores;
    this.coresEl.textContent = formatNumber(coresFree) + '/' + formatNumber(state.cpuCoresTotal) + ' free';
    if (coresFree <= 0n) this.coresEl.style.color = 'var(--accent-red)';
    else this.coresEl.style.color = '';

    // Mic-mini
    this.micMiniControls.setCount(state.micMiniCount);
    const micMiniOwned = Math.floor(fromBigInt(state.micMiniCount));
    const micMiniCoresAdded = formatNumber(BALANCE.micMini.coresAdded);
    this.micMiniBuyMetaEl.innerHTML = `Buy ${BALANCE.micMini.displayName}: ${moneyWithEmojiHtml(BALANCE.micMini.cost, 'funds')} <span style="font-size:0.8em;color:var(--text-secondary)">+${micMiniCoresAdded} cores</span>`;
    this.micMiniBuyGroup.update(
      micMiniOwned,
      (amount) => {
        if (amount <= 0) return false;
        if (micMiniOwned + amount > BALANCE.micMini.limit) return false;
        const totalCost = mulB(toBigInt(amount), BALANCE.micMini.cost);
        return state.funds >= totalCost;
      },
      BALANCE.micMini.limit,
      () => {
        flashElement(this.micMiniBuyMetaEl);
      },
    );
    const totalAgents = state.totalAgents;

    // Go Self-Hosted
    const minGpus = BALANCE.models[0].minGpus;
    const gpuCount = minGpus > totalAgents ? minGpus : totalAgents;
    const gpuUnitPrice = state.gpuMarketPrice;
    const gpuCost = mulB(gpuCount, gpuUnitPrice);
    if (!state.isPostGpuTransition && state.intelligence >= BALANCE.selfHostedUnlockIntel) {
      this.selfHostedSection.classList.remove('hidden');
      this.selfHostedCostEl.innerHTML = `${formatNumber(gpuCount)} ${emojiHtml('gpus')} GPUs x ${moneyWithEmojiHtml(gpuUnitPrice, 'funds')} = ${moneyWithEmojiHtml(gpuCost, 'funds')}`;
      this.selfHostedBtn.disabled = state.funds < gpuCost;
    } else {
      this.selfHostedSection.classList.add('hidden');
    }
  }
}
