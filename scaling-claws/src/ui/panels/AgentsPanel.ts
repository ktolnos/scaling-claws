import type { GameState } from '../../game/GameState.ts';
import { getTotalAssignedAgents } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE, getNextTier } from '../../game/BalanceConfig.ts';
import { formatMoney } from '../../game/utils.ts';
import { buyMicMini, goSelfHosted, upgradeTier, hireAgent } from '../../game/systems/ComputeSystem.ts';
import { flashElement } from '../UIUtils.ts';

export class AgentsPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;
  private onTransition: (() => void) | null;

  // Subscription Tier Elements
  private subTierNameEl!: HTMLSpanElement;
  private subTierIntelEl!: HTMLSpanElement;
  private subTierCostEl!: HTMLSpanElement;
  private nextTierInfoEl!: HTMLDivElement;
  private upgradeBtn!: HTMLButtonElement;

  // Agent Controls
  private agentCountEl!: HTMLSpanElement;
  private unassignedCountEl!: HTMLSpanElement; // NEW
  private agentCostEl!: HTMLSpanElement;
  private incBtn!: HTMLButtonElement;

  // Other refs
  private coresEl!: HTMLSpanElement;
  private micMiniCountEl!: HTMLSpanElement;
  private micMiniBuyBtn!: HTMLButtonElement;
  private totalAgentsEl!: HTMLSpanElement;
  private totalCostEl!: HTMLSpanElement;
  private selfHostedSection!: HTMLDivElement;
  private selfHostedCostEl!: HTMLSpanElement;
  private selfHostedBtn!: HTMLButtonElement;

  constructor(state: GameState, onTransition?: () => void) {
    this.state = state;
    this.onTransition = onTransition ?? null;
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.build();
  }

  private build(): void {
    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'AGENTS';
    this.el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';

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

    // Next Tier / Upgrade
    this.nextTierInfoEl = document.createElement('div');
    // Using a button, so this div might just hold extra info properly or we put button inside
    this.nextTierInfoEl.style.display = 'none'; // Hidden, button will have text

    this.upgradeBtn = document.createElement('button');
    this.upgradeBtn.className = 'btn-buy';
    this.upgradeBtn.style.width = '100%';
    this.upgradeBtn.style.marginTop = '8px';
    this.upgradeBtn.addEventListener('click', () => {
      const next = getNextTier(this.state.subscriptionTier);
      if (next) upgradeTier(this.state, next);
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
    
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.alignItems = 'center';

    this.agentCountEl = document.createElement('span');
    this.agentCountEl.className = 'value';
    this.agentCountEl.style.minWidth = '24px';
    this.agentCountEl.style.textAlign = 'center';
    
    this.incBtn = document.createElement('button');
    this.incBtn.className = 'btn-mini';
    this.incBtn.style.minWidth = '100px';
    this.incBtn.addEventListener('click', () => {
      if (!hireAgent(this.state)) {
        // Flash appropriate constraint indicator
        if (this.state.isPostGpuTransition) {
          // At GPU stage: need more GPU instances (show in ComputePanel)
          document.dispatchEvent(new CustomEvent('flash-gpu-capacity'));
        } else {
          // At subscription stage: need more CPU cores
          flashElement(this.coresEl);
        }
      }
    });

    controls.appendChild(this.agentCountEl);
    controls.appendChild(this.incBtn);
    
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
    body.appendChild(this.createDivider());

    // CPU Cores
    const coresRow = document.createElement('div');
    coresRow.className = 'panel-row';
    const coresLabel = document.createElement('span');
    coresLabel.className = 'label';
    coresLabel.textContent = 'CPU Cores';
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
    micLabel.textContent = 'Muck-mini PCs:';
    this.micMiniCountEl = document.createElement('span');
    this.micMiniCountEl.className = 'value';
    this.micMiniCountEl.textContent = '0';
    micLeft.appendChild(micLabel);
    micLeft.appendChild(this.micMiniCountEl);

    this.micMiniBuyBtn = document.createElement('button');
    this.micMiniBuyBtn.innerHTML = 'Buy ' + formatMoney(BALANCE.micMini.cost) + ' <span style="font-size:0.8em;opacity:0.8">+8 cores</span>';
    this.micMiniBuyBtn.className = 'btn-mini';
    this.micMiniBuyBtn.style.minWidth = '120px';
    this.micMiniBuyBtn.addEventListener('click', () => {
      buyMicMini(this.state);
    });

    micRow.appendChild(micLeft);
    micRow.appendChild(this.micMiniBuyBtn);
    body.appendChild(micRow);

    // Divider
    body.appendChild(this.createDivider());

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
      if (goSelfHosted(this.state) && this.onTransition) {
        this.onTransition();
      }
    });

    this.selfHostedSection.appendChild(shTitle);
    this.selfHostedSection.appendChild(shDesc);
    this.selfHostedSection.appendChild(this.selfHostedCostEl);
    this.selfHostedSection.appendChild(this.selfHostedBtn);
    body.appendChild(this.selfHostedSection);

    this.el.appendChild(body);
  }

  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  update(state: GameState): void {
    this.state = state;
    
    // -- Subscription Tier --
    const currentTier = BALANCE.tiers[state.subscriptionTier];
    this.subTierNameEl.textContent = currentTier.displayName;
    this.subTierIntelEl.textContent = `Intel ${(Math.round(currentTier.intel * 10) / 10).toString()}`;
    this.subTierCostEl.textContent = `$${currentTier.cost} upfront`;
    
    // Upgrade Info
    const nextTierType = getNextTier(state.subscriptionTier);
    if (nextTierType) {
      const nextTier = BALANCE.tiers[nextTierType];
      // Updated Text: Upgrade To <Tier Name> ($price/m/agent, X intelligence)
      // "The cost should be paid upfront (upgrade pays for the subscription for 1 minute)"
      
      this.upgradeBtn.style.display = 'block';
      const agentCount = state.totalAgents;
      const upgradeCost = nextTier.cost * agentCount;
      this.upgradeBtn.textContent = `Upgrade to ${nextTier.displayName} (${agentCount}×${formatMoney(nextTier.cost)} = ${formatMoney(upgradeCost)}, ${(Math.round(nextTier.intel * 10) / 10).toString()} Intel)`;
      
      this.upgradeBtn.disabled = state.funds < upgradeCost;
      
    } else {
      this.upgradeBtn.style.display = 'none';
      // Or show "Max Tier" text? Removed nextTierInfoEl usage essentially, reusing button area or just hiding.
      // If hiding, maybe show text.
    }

    // -- Agent Controls --
    this.agentCountEl.textContent = state.totalAgents.toString();
    const assignedCount = getTotalAssignedAgents(state);
    let unassignedCount = state.agentPools['unassigned'].totalCount;

    if (state.isPostGpuTransition) {
      // In GPU era, unassigned agents are limited by compute slots
      unassignedCount = Math.max(0, state.activeAgentCount - assignedCount);
    }

    this.unassignedCountEl.textContent = unassignedCount.toString();
    if (unassignedCount > 0) {
      this.unassignedCountEl.style.color = 'var(--accent-green)';
    } else {
      this.unassignedCountEl.style.color = '';
    }
    
    this.incBtn.textContent = `Hire (${formatMoney(currentTier.cost)})`;
    this.incBtn.disabled = state.funds < currentTier.cost;

    this.agentCostEl.textContent = `$${currentTier.cost} per agent`;

    // CPU Cores
    const coresFree = state.cpuCoresTotal - state.usedCores;
    this.coresEl.textContent = coresFree + '/' + state.cpuCoresTotal + ' free';
    if (coresFree < 0) this.coresEl.style.color = 'var(--accent-red)';
    else this.coresEl.style.color = '';

    // Mic-mini
    this.micMiniCountEl.textContent = state.micMiniCount.toString();
    if (state.micMiniCount >= 7) {
      this.micMiniBuyBtn.disabled = true;
      this.micMiniBuyBtn.textContent = 'MAX REACHED';
    } else {
      this.micMiniBuyBtn.disabled = state.funds < BALANCE.micMini.cost;
      this.micMiniBuyBtn.innerHTML = 'Buy ' + formatMoney(BALANCE.micMini.cost) + ' <span style="font-size:0.8em;opacity:0.8">+8 cores</span>';
    }

    // Summary
    const totalAgents = state.totalAgents;
    this.totalAgentsEl.textContent = 'Total agents: ' + totalAgents;
    this.totalCostEl.textContent = 'Income potential: ' + formatMoney(state.incomePerMin) + '/min';

    // Go Self-Hosted
    const minGpus = BALANCE.models[0].minGpus;
    const gpuCount = Math.max(minGpus, totalAgents);
    const gpuCost = gpuCount * BALANCE.gpuCost;
    if (!state.isPostGpuTransition && state.intelligence >= BALANCE.selfHostedUnlockIntel) {
      this.selfHostedSection.classList.remove('hidden');
      this.selfHostedCostEl.textContent = gpuCount + ' GPUs x ' + formatMoney(BALANCE.gpuCost) + ' = ' + formatMoney(gpuCost);
      this.selfHostedBtn.disabled = state.funds < gpuCost;
    } else {
      this.selfHostedSection.classList.add('hidden');
    }
  }
}
