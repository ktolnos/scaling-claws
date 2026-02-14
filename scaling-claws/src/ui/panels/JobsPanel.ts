import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatRate } from '../../game/utils.ts';
import { ProgressBar } from '../components/ProgressBar.ts';
import { nudgeAgent } from '../../game/systems/JobSystem.ts';

const MAX_VISIBLE_AGENTS = 12;

export class JobsPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  // Cached DOM refs
  private jobTitleEl!: HTMLSpanElement;
  private jobInfoEl!: HTMLSpanElement;
  private agentBarsContainer!: HTMLDivElement;
  private agentBars: { bar: ProgressBar; labelEl: HTMLSpanElement }[] = [];
  private coresEl!: HTMLSpanElement;
  private completedEl!: HTMLSpanElement;
  private incomeEl!: HTMLSpanElement;
  private nudgeBtn!: HTMLButtonElement;
  private stuckCountEl!: HTMLSpanElement;
  private managerEl!: HTMLDivElement;
  private managerCountEl!: HTMLSpanElement;
  private manager2CountEl!: HTMLSpanElement;

  constructor(state: GameState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.build();
  }

  private build(): void {
    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'JOBS';
    this.el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';

    // Job title row
    const jobRow = document.createElement('div');
    jobRow.className = 'panel-row';
    this.jobTitleEl = document.createElement('span');
    this.jobTitleEl.className = 'label';
    this.jobTitleEl.style.fontWeight = '600';
    this.jobInfoEl = document.createElement('span');
    this.jobInfoEl.className = 'value';
    this.jobInfoEl.style.fontSize = '0.78rem';
    jobRow.appendChild(this.jobTitleEl);
    jobRow.appendChild(this.jobInfoEl);
    body.appendChild(jobRow);

    // Agent progress bars
    this.agentBarsContainer = document.createElement('div');
    this.agentBarsContainer.className = 'agent-bar-container';
    body.appendChild(this.agentBarsContainer);

    // Divider
    body.appendChild(this.createDivider());

    // Cores row
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

    // Completed tasks row
    const completedRow = document.createElement('div');
    completedRow.className = 'panel-row';
    const completedLabel = document.createElement('span');
    completedLabel.className = 'label';
    completedLabel.textContent = 'Completed';
    this.completedEl = document.createElement('span');
    this.completedEl.className = 'value';
    completedRow.appendChild(completedLabel);
    completedRow.appendChild(this.completedEl);
    body.appendChild(completedRow);

    // Manager row (hidden initially)
    this.managerEl = document.createElement('div');
    this.managerEl.className = 'panel-row hidden';
    const managerLabel = document.createElement('span');
    managerLabel.className = 'label';
    managerLabel.textContent = 'Managers';
    const managerValues = document.createElement('span');
    managerValues.className = 'value';
    managerValues.style.fontSize = '0.78rem';
    this.managerCountEl = document.createElement('span');
    this.manager2CountEl = document.createElement('span');
    managerValues.appendChild(this.managerCountEl);
    managerValues.appendChild(this.manager2CountEl);
    this.managerEl.appendChild(managerLabel);
    this.managerEl.appendChild(managerValues);
    body.appendChild(this.managerEl);

    // Summary row
    const summary = document.createElement('div');
    summary.className = 'panel-summary';
    this.incomeEl = document.createElement('span');
    this.incomeEl.className = 'highlight';

    // Nudge section
    const nudgeSection = document.createElement('span');
    nudgeSection.style.display = 'flex';
    nudgeSection.style.alignItems = 'center';
    nudgeSection.style.gap = '6px';
    this.stuckCountEl = document.createElement('span');
    this.stuckCountEl.style.fontSize = '0.78rem';
    this.nudgeBtn = document.createElement('button');
    this.nudgeBtn.className = 'btn-nudge';
    this.nudgeBtn.textContent = 'Nudge';
    this.nudgeBtn.addEventListener('click', () => {
      nudgeAgent(this.state);
    });
    nudgeSection.appendChild(this.stuckCountEl);
    nudgeSection.appendChild(this.nudgeBtn);

    summary.appendChild(this.incomeEl);
    summary.appendChild(nudgeSection);
    body.appendChild(summary);

    this.el.appendChild(body);
  }

  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  update(state: GameState): void {
    this.state = state;
    const jobConfig = BALANCE.jobs[state.bestJobType];

    // Job title
    this.jobTitleEl.textContent = jobConfig.displayName;
    this.jobInfoEl.textContent = formatMoney(jobConfig.reward) + '/task  ' + (jobConfig.timeMs / 1000) + 's  Intel ' + jobConfig.intelReq;

    // Agent progress bars
    const visibleAgents = state.agents.slice(0, MAX_VISIBLE_AGENTS);
    this.syncAgentBars(visibleAgents);

    // Cores
    this.coresEl.textContent = (state.cpuCoresTotal - state.usedCores) + '/' + state.cpuCoresTotal + ' free';

    // Completed
    this.completedEl.textContent = state.completedTasks.toString();

    // Income
    this.incomeEl.textContent = 'Job income: ' + formatRate(state.incomePerMin);

    // Stuck / Nudge
    if (state.stuckCount > 0) {
      this.stuckCountEl.textContent = state.stuckCount + ' stuck';
      this.stuckCountEl.style.color = 'var(--accent-red)';
      this.nudgeBtn.disabled = false;
    } else {
      this.stuckCountEl.textContent = '';
      this.nudgeBtn.disabled = true;
    }

    // Managers
    if (state.managerCount > 0 || state.managerSquaredCount > 0) {
      this.managerEl.classList.remove('hidden');
      this.managerCountEl.textContent = 'Mgr: ' + state.managerCount;
      if (state.managerSquaredCount > 0) {
        this.manager2CountEl.textContent = '  Mgr\u00B2: ' + state.managerSquaredCount;
      }
    }

    // Show summary if many agents: switch from bars to compact summary
    if (state.agents.length > MAX_VISIBLE_AGENTS) {
      const overflowCount = state.agents.length - MAX_VISIBLE_AGENTS;
      const lastBar = this.agentBarsContainer.lastElementChild;
      if (lastBar && !lastBar.classList.contains('overflow-note')) {
        const note = document.createElement('div');
        note.className = 'overflow-note';
        note.style.fontSize = '0.72rem';
        note.style.color = 'var(--text-muted)';
        note.textContent = '...and ' + overflowCount + ' more agents';
        this.agentBarsContainer.appendChild(note);
      }
    }
  }

  private syncAgentBars(agents: { id: number; progress: number; isStuck: boolean; isIdle: boolean; tier: string }[]): void {
    // Ensure we have the right number of bars
    while (this.agentBars.length < agents.length) {
      const row = document.createElement('div');
      row.className = 'agent-bar-row';

      const label = document.createElement('span');
      label.className = 'agent-bar-label';
      row.appendChild(label);

      const bar = new ProgressBar();
      row.appendChild(bar.el);

      this.agentBarsContainer.appendChild(row);
      this.agentBars.push({ bar, labelEl: label });
    }

    // Remove extra bars
    while (this.agentBars.length > agents.length) {
      const removed = this.agentBars.pop()!;
      removed.bar.el.parentElement?.remove();
    }

    // Remove overflow note if present
    const overflowNote = this.agentBarsContainer.querySelector('.overflow-note');
    if (overflowNote) overflowNote.remove();

    // Update bars
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const { bar, labelEl } = this.agentBars[i];

      labelEl.textContent = 'Agent ' + (i + 1);
      if (agent.isIdle) {
        labelEl.style.color = 'var(--text-muted)';
        bar.update(0, false);
      } else {
        labelEl.style.color = agent.isStuck ? 'var(--accent-red)' : 'var(--text-muted)';
        bar.update(agent.progress, agent.isStuck);
      }
    }
  }
}
