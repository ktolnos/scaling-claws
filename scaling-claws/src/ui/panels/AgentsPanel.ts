import type { GameState } from '../../game/GameState.ts';
import { getTotalAssignedAgents } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE, getNextTier } from '../../game/BalanceConfig.ts';
import { formatNumber, mulB, fromBigInt, toBigInt, divB } from '../../game/utils.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import { flashElement } from '../UIUtils.ts';
import { createPanelDivider, createPanelScaffold } from '../components/PanelScaffold.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';
import { CountBulkBuyControls } from '../components/CountBulkBuyControls.ts';
import { emojiHtml, moneyWithEmojiHtml, resourceLabelHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';

export class AgentsPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;
  private onTransition: (() => void) | null;

  // Subscription Tier Elements
  private subTierNameEl!: HTMLSpanElement;
  private subTierIntelEl!: HTMLSpanElement;
  private subTierCostEl!: HTMLSpanElement;
  private upgradeBtn!: HTMLButtonElement;

  // Agent Controls
  private agentHireControls!: CountBulkBuyControls;
  private unassignedCountEl!: HTMLSpanElement;
  private agentCostEl!: HTMLSpanElement;

  // Other refs
  private coresEl!: HTMLSpanElement;
  private micMiniControls!: CountBulkBuyControls;
  private micMiniBuyMetaEl!: HTMLSpanElement;
  private micMiniBuyGroup!: BulkBuyGroup;
  private totalAgentsEl!: HTMLSpanElement;
  private totalCostEl!: HTMLSpanElement;
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
    
    const tierMeta = document.createElement('div');
    tierMeta.style.fontSize = '0.78rem';
    tierMeta.style.color = 'var(--text-muted)';
    this.subTierIntelEl = document.createElement('span');
    this.subTierCostEl = document.createElement('span');
    this.subTierCostEl.style.marginLeft = '8px';
    
    tierMeta.appendChild(this.subTierIntelEl);
    tierMeta.appendChild(this.subTierCostEl);

    tierValue.appendChild(this.subTierNameEl);
    tierValue.appendChild(tierMeta);
    tierHeader.appendChild(tierLabel);
    tierHeader.appendChild(tierValue);
    tierSection.appendChild(tierHeader);

    const intelHint = document.createElement('div');
    intelHint.style.fontSize = '0.72rem';
    intelHint.style.color = 'var(--text-muted)';
    intelHint.style.marginTop = '4px';
    intelHint.textContent = 'Higher intelligence = faster job completion.';
    tierSection.appendChild(intelHint);

    this.upgradeBtn = document.createElement('button');
    this.upgradeBtn.className = 'btn-buy';
    this.upgradeBtn.style.width = '100%';
    this.upgradeBtn.style.marginTop = '8px';
    this.upgradeBtn.addEventListener('click', () => {
      const next = getNextTier(this.state.subscriptionTier);
      if (next) dispatchGameAction(this.state, { type: 'upgradeTier', tier: next });
    });

    tierSection.appendChild(this.upgradeBtn);
    body.appendChild(tierSection);

    // --- Agent Hiring Details (Moved from JobsPanel) ---
    const agentSection = document.createElement('div');
    agentSection.className = 'section';
    agentSection.style.marginBottom = '12px';
    
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
    }, { prefix: '+', maxedLabel: 'MAXED CPUs' });
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
    agentSection.appendChild(unassignedRow);

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

    agentSection.appendChild(agentRow);
    agentSection.appendChild(this.agentCostEl);
    body.appendChild(agentSection);


    // --- Hardware ---
    // Divider
    body.appendChild(createPanelDivider());

    // CPU Cores
    const coresRow = document.createElement('div');
    coresRow.className = 'panel-row';
    const coresLabel = document.createElement('span');
    coresLabel.className = 'label';
    coresLabel.textContent = 'CPU Cores';
    setHintTarget(coresLabel, 'mechanic.agentCapacity');
    this.coresEl = document.createElement('span');
    this.coresEl.className = 'value';
    coresRow.appendChild(coresLabel);
    coresRow.appendChild(this.coresEl);
    body.appendChild(coresRow);

    // Mic-mini row
    const micRow = document.createElement('div');
    micRow.className = 'panel-row';
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

    micRow.appendChild(micLeft);
    micRow.appendChild(micRight);
    body.appendChild(micRow);

    // Divider
    body.appendChild(createPanelDivider());

    // Summary
    const summary = document.createElement('div');
    summary.className = 'panel-summary';

    const summaryLeft = document.createElement('span');
    this.totalAgentsEl = document.createElement('span');
    summaryLeft.appendChild(this.totalAgentsEl);
    summary.appendChild(summaryLeft);

    this.totalCostEl = document.createElement('span');
    this.totalCostEl.className = 'highlight';
    summary.appendChild(this.totalCostEl);
    body.appendChild(summary);

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
    this.subTierIntelEl.innerHTML = `${resourceLabelHtml('intel')} ${(Math.round(currentTier.intel * 10) / 10).toString()}`;
    this.subTierCostEl.innerHTML = `${moneyWithEmojiHtml(currentTier.cost, 'funds')} upfront`;
    
    // Upgrade Info
    const nextTierType = getNextTier(state.subscriptionTier);
    if (nextTierType) {
      const nextTier = BALANCE.tiers[nextTierType];
      // Updated Text: Upgrade To <Tier Name> ($price/m/agent, X intelligence)
      // "The cost should be paid upfront (upgrade pays for the subscription for 1 minute)"
      
      this.upgradeBtn.style.display = 'block';
      const agentCount = state.totalAgents;
      const deltaCostPerAgent = nextTier.cost - currentTier.cost;
      const upgradeCost = mulB(deltaCostPerAgent, agentCount);
      this.upgradeBtn.innerHTML = `Upgrade to ${nextTier.displayName} (${formatNumber(agentCount)} × Δ${moneyWithEmojiHtml(deltaCostPerAgent, 'funds')} = ${moneyWithEmojiHtml(upgradeCost, 'funds')}, ${resourceLabelHtml('intel')} ${(Math.round(nextTier.intel * 10) / 10).toString()})`;
      
      this.upgradeBtn.disabled = deltaCostPerAgent <= 0n || state.funds < upgradeCost;
      
    } else {
      this.upgradeBtn.style.display = 'none';
    }

    // -- Agent Controls --
    this.agentHireControls.setCount(state.totalAgents);
    const assignedCount = getTotalAssignedAgents(state);
    let unassignedCount = state.agentPools['unassigned'].totalCount;

    if (state.isPostGpuTransition) {
      // In GPU era, unassigned agents are limited by compute slots
      const diff = state.activeAgentCount - assignedCount;
      unassignedCount = diff > 0n ? diff : 0n;
    }

    this.unassignedCountEl.textContent = formatNumber(unassignedCount);
    if (unassignedCount > 0n) {
      this.unassignedCountEl.style.color = 'var(--accent-green)';
    } else {
      this.unassignedCountEl.style.color = '';
    }
    
    const coresPerAgent = toBigInt(currentTier.coresPerAgent);
    const maxAgentsByCpu = Math.floor(fromBigInt(divB(state.cpuCoresTotal, coresPerAgent)));
    this.agentHireControls.bulk.update(
      Math.floor(fromBigInt(state.totalAgents)),
      (amount) => {
        if (amount <= 0) return false;
        const amountB = toBigInt(amount);
        const totalCost = mulB(amountB, currentTier.cost);
        if (state.funds < totalCost) return false;

        if (state.isPostGpuTransition) {
          return state.totalAgents + amountB <= state.installedGpuCount;
        }

        const requiredCores = mulB(state.totalAgents + amountB, coresPerAgent);
        return requiredCores <= state.cpuCoresTotal;
      },
      !state.isPostGpuTransition ? maxAgentsByCpu : null,
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
    );

    // Summary
    const totalAgents = state.totalAgents;
    this.totalAgentsEl.textContent = 'Total agents: ' + formatNumber(totalAgents);
    this.totalCostEl.innerHTML = `Income potential: ${moneyWithEmojiHtml(state.incomePerMin, 'funds')}/min`;

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
