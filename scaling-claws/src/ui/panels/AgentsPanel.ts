import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import type { SubscriptionTier } from '../../game/BalanceConfig.ts';
import { formatMoney } from '../../game/utils.ts';
import { buySubscription, buyMicMini, goSelfHosted } from '../../game/systems/ComputeSystem.ts';

export class AgentsPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;
  private onTransition: (() => void) | null;

  // Tier row refs
  private tierRows: Map<SubscriptionTier, {
    countEl: HTMLSpanElement;
    buyBtn: HTMLButtonElement;
  }> = new Map();

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

    // Subscription tiers
    const tiersSection = document.createElement('div');
    tiersSection.className = 'panel-section';

    // Display tiers in user-friendly order: Free, Pro, Ultra, Ultra Max, Ultra Pro Max
    const displayOrder: SubscriptionTier[] = ['free', 'pro', 'ultra', 'ultraMax', 'ultraProMax'];

    for (const tier of displayOrder) {
      const config = BALANCE.tiers[tier];
      const row = document.createElement('div');
      row.className = 'tier-row';

      // Tier name
      const name = document.createElement('span');
      name.className = 'tier-name';
      name.textContent = config.displayName;
      row.appendChild(name);

      // Tier info
      const info = document.createElement('span');
      info.className = 'tier-info';
      const costStr = config.costPerMin > 0 ? formatMoney(config.costPerMin) + '/min' : 'Free';
      const limitStr = config.taskLimitPerDay ? config.taskLimitPerDay + '/day' : 'No limit';
      const coreStr = config.coresPerAgent + ' core' + (config.coresPerAgent > 1 ? 's' : '');
      info.textContent = costStr + '  Intel ' + config.intel + '  ' + limitStr + '  ' + coreStr;
      row.appendChild(info);

      // Count
      const countEl = document.createElement('span');
      countEl.className = 'tier-count';
      countEl.textContent = '0';
      row.appendChild(countEl);

      // Buy button (not for free tier)
      const buyBtn = document.createElement('button');
      if (tier === 'free') {
        buyBtn.textContent = '—';
        buyBtn.disabled = true;
        buyBtn.style.visibility = 'hidden';
        buyBtn.style.width = '34px';
      } else {
        buyBtn.textContent = '+1';
        buyBtn.addEventListener('click', () => {
          buySubscription(this.state, tier);
        });
      }
      row.appendChild(buyBtn);

      tiersSection.appendChild(row);
      this.tierRows.set(tier, { countEl, buyBtn });
    }

    body.appendChild(tiersSection);

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
    micLabel.textContent = 'Mic-mini PCs:';
    this.micMiniCountEl = document.createElement('span');
    this.micMiniCountEl.className = 'value';
    this.micMiniCountEl.textContent = '0';
    micLeft.appendChild(micLabel);
    micLeft.appendChild(this.micMiniCountEl);

    this.micMiniBuyBtn = document.createElement('button');
    this.micMiniBuyBtn.innerHTML = 'Buy <span style="opacity:0.7;font-size:0.8em">' + formatMoney(BALANCE.micMini.cost) + '</span> <span style="color:var(--accent-green);font-size:0.75em">+8 cores</span>';
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
    shDesc.textContent = 'Replace subscriptions with GPUs running DeepKick-405B (Intel 2.5). Eliminates all subscription costs!';

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

    // Warning
    const warning = document.createElement('div');
    warning.className = 'warning-text';
    warning.textContent = 'Paid subs cancel if funds reach $0.';
    warning.style.marginTop = '4px';
    body.appendChild(warning);

    this.el.appendChild(body);
  }

  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  update(state: GameState): void {
    this.state = state;

    // Update tier counts and button states
    const availableCores = state.cpuCoresTotal - state.usedCores;

    for (const [tier, refs] of this.tierRows) {
      const count = state.subscriptions[tier];
      refs.countEl.textContent = count.toString();

      if (tier !== 'free') {
        const config = BALANCE.tiers[tier];
        const canAfford = state.funds >= config.costPerMin;
        const hasCores = availableCores >= config.coresPerAgent;
        refs.buyBtn.disabled = !canAfford || !hasCores;
      }
    }

    // CPU Cores
    this.coresEl.textContent = (state.cpuCoresTotal - state.usedCores) + '/' + state.cpuCoresTotal + ' free';

    // Mic-mini
    this.micMiniCountEl.textContent = state.micMiniCount.toString();
    this.micMiniBuyBtn.disabled = state.funds < BALANCE.micMini.cost;

    // Summary
    const totalAgents = state.agents.length;
    this.totalAgentsEl.textContent = 'Total agents: ' + totalAgents;
    this.totalCostEl.textContent = 'Sub cost: ' + formatMoney(state.expensePerMin) + '/min';

    // Go Self-Hosted: show when player has enough agents and money
    const gpuCost = totalAgents * BALANCE.gpuCost;
    if (!state.isPostGpuTransition && totalAgents >= 3 && state.funds >= gpuCost * 0.5) {
      this.selfHostedSection.classList.remove('hidden');
      this.selfHostedCostEl.textContent = totalAgents + ' GPUs x ' + formatMoney(BALANCE.gpuCost) + ' = ' + formatMoney(gpuCost);
      this.selfHostedBtn.disabled = state.funds < gpuCost;
    } else {
      this.selfHostedSection.classList.add('hidden');
    }
  }
}
