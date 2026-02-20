import type { GameState } from '../../game/GameState.ts';
import { getTotalAssignedAgents } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import type { JobType } from '../../game/BalanceConfig.ts';
import { formatNumber, fromBigInt, scaleBigInt, mulB, divB, scaleB, toBigInt } from '../../game/utils.ts';
import { ProgressBar } from '../components/ProgressBar.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';
import { createPanelScaffold } from '../components/PanelScaffold.ts';
import { flashElement } from '../UIUtils.ts';
import { moneyWithEmojiHtml, resourceLabelHtml, emojiHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { getJobOutputAmount, getRobotLaborPerMin } from '../../game/systems/JobRules.ts';
import {
  nudgeAgent,
  assignAgentsToJob, removeAgentsFromJob,
  hireHumanWorkers, fireHumanWorkers,
  buyRobotWorkers, fireRobotWorkers,
} from '../../game/systems/JobSystem.ts';

const MAX_PROGRESS_BARS = 4;
const JOB_HINT_ID: Record<JobType, string> = {
  sixxerBasic: 'job.sixxerBasic',
  sixxerEnterprise: 'job.sixxerEnterprise',
  manager: 'job.manager',
  aiSWE: 'job.aiSWE',
  aiResearcher: 'job.aiResearcher',
  aiDataSynthesizer: 'job.aiDataSynthesizer',
  robotWorker: 'job.robotWorker',
  humanWorker: 'job.humanWorker',
  humanResearcher: 'job.humanResearcher',
  humanSWE: 'job.humanSWE',
  unassigned: 'mechanic.jobs',
};

interface JobRowRefs {
  row: HTMLDivElement;
  reqEl: HTMLSpanElement;
  rewardEl: HTMLSpanElement;
  countEl: HTMLSpanElement;
  progressContainer: HTMLDivElement;
  progressBars: ProgressBar[];
  overflowEl: HTMLSpanElement;
  addGroup: BulkBuyGroup;
  removeGroup: BulkBuyGroup;
}

export class JobsPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;
  private lastSortOrder: string = '';

  private jobListEl!: HTMLDivElement;
  private jobRows: Map<JobType, JobRowRefs> = new Map();

  // Nudge
  private nudgeBtn!: HTMLButtonElement;
  private stuckCountEl!: HTMLSpanElement;

  constructor(state: GameState) {
    this.state = state;
    const { panel } = createPanelScaffold('JOBS');
    this.el = panel;
    this.build();
  }

  private build(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    this.jobListEl = document.createElement('div');
    this.jobListEl.className = 'job-list';
    body.appendChild(this.jobListEl);

    // Nudge footer
    const nudgeRow = document.createElement('div');
    nudgeRow.className = 'panel-row';
    nudgeRow.style.marginTop = '12px';
    nudgeRow.style.display = 'flex';
    nudgeRow.style.justifyContent = 'flex-end';
    nudgeRow.style.alignItems = 'center';
    nudgeRow.style.gap = '8px';

    this.stuckCountEl = document.createElement('span');
    this.stuckCountEl.style.fontSize = '0.8rem';
    setHintTarget(this.stuckCountEl, 'mechanic.stuck');

    this.nudgeBtn = document.createElement('button');
    this.nudgeBtn.className = 'btn-nudge';
    this.nudgeBtn.textContent = 'Nudge';
    this.nudgeBtn.addEventListener('click', () => {
      nudgeAgent(this.state);
    });

    nudgeRow.appendChild(this.stuckCountEl);
    nudgeRow.appendChild(this.nudgeBtn);
    body.appendChild(nudgeRow);

    // Flash listener for auto-firing
    document.addEventListener('flash-job', (e: any) => {
      const jobType = e.detail?.jobType as JobType;
      if (jobType) {
        const refs = this.jobRows.get(jobType);
        if (refs) flashElement(refs.row);
      }
    });
  }

  private createJobRow(jobType: JobType): JobRowRefs {
    const config = BALANCE.jobs[jobType];
    const isRobotWorker = jobType === 'robotWorker';
    const isHuman = config.workerType === 'human';

    const row = document.createElement('div');
    row.className = 'job-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.padding = '4px 6px';
    row.style.marginBottom = '4px';
    row.style.backgroundColor = 'rgba(255,255,255,0.03)';
    row.style.borderRadius = '6px';
    row.style.gap = '6px';

    // Left block: title + reward + requirements (fixed width reduced)
    const infoBlock = document.createElement('div');
    infoBlock.style.flex = '0 0 115px';
    infoBlock.style.display = 'flex';
    infoBlock.style.flexDirection = 'column';
    infoBlock.style.overflow = 'hidden';

    const name = document.createElement('span');
    name.textContent = config.displayName;
    setHintTarget(name, JOB_HINT_ID[jobType] ?? 'mechanic.jobs');
    name.style.fontWeight = '500';
    name.style.fontSize = '0.82rem';
    name.style.whiteSpace = 'nowrap';
    name.style.textOverflow = 'ellipsis';
    name.style.overflow = 'hidden';
    if (isRobotWorker) {
      name.style.color = 'var(--text-primary)';
    } else if (isHuman) {
      name.style.color = 'var(--accent-yellow, #e8c547)';
    }
    infoBlock.appendChild(name);

    const rewardEl = document.createElement('span');
    rewardEl.style.fontSize = '0.74rem';
    rewardEl.style.display = 'flex';
    rewardEl.style.flexDirection = 'column';
    rewardEl.style.gap = '1px';
    infoBlock.appendChild(rewardEl);

    const reqEl = document.createElement('span');
    reqEl.style.color = 'var(--accent-red)';
    reqEl.style.fontSize = '0.72rem';
    infoBlock.appendChild(reqEl);

    row.appendChild(infoBlock);

    // Middle block: progress bars (flexible)
    const progressContainer = document.createElement('div');
    progressContainer.style.flex = '1';
    progressContainer.style.display = 'flex';
    progressContainer.style.flexDirection = 'column';
    progressContainer.style.gap = '2px';
    progressContainer.style.minWidth = '0';
    progressContainer.style.overflow = 'hidden';

    const progressBars: ProgressBar[] = [];
    for (let i = 0; i < MAX_PROGRESS_BARS; i++) {
      const bar = new ProgressBar();
      bar.el.style.height = '4px';
      bar.el.style.flex = 'none';
      bar.el.style.display = 'none';
      progressContainer.appendChild(bar.el);
      progressBars.push(bar);
    }

    const overflowEl = document.createElement('span');
    overflowEl.style.fontSize = '0.66rem';
    overflowEl.style.color = 'var(--text-secondary)';
    overflowEl.style.display = 'none';
    progressContainer.appendChild(overflowEl);

    row.appendChild(progressContainer);

    // Right block: controls (fixed width)
    const controlsBlock = document.createElement('div');
    controlsBlock.style.flex = '0 0 auto';
    controlsBlock.style.display = 'flex';
    controlsBlock.style.alignItems = 'center';
    controlsBlock.style.gap = '4px';

    // Remove group
    const removeGroup = new BulkBuyGroup(
      (amount) => {
        if (isRobotWorker) {
          fireRobotWorkers(this.state, amount);
        } else if (isHuman) {
          fireHumanWorkers(this.state, jobType, amount);
        } else {
          removeAgentsFromJob(this.state, jobType, amount);
        }
      },
      '-',
      'vertical'
    );
    controlsBlock.appendChild(removeGroup.el);

    // Count
    const countEl = document.createElement('span');
    countEl.style.minWidth = '28px';
    countEl.style.textAlign = 'center';
    countEl.style.fontSize = '0.82rem';
    countEl.style.fontWeight = '600';
    countEl.textContent = '0';
    controlsBlock.appendChild(countEl);

    // Add group
    const addGroup = new BulkBuyGroup(
      (amount) => {
        if (isRobotWorker) {
          buyRobotWorkers(this.state, amount);
        } else if (isHuman) {
          hireHumanWorkers(this.state, jobType, amount);
        } else {
          const assigned = assignAgentsToJob(this.state, jobType, amount);
          if (assigned === 0) {
            document.dispatchEvent(new CustomEvent('flash-unassigned'));
          }
        }
      },
      '+',
      'vertical'
    );
    controlsBlock.appendChild(addGroup.el);

    row.appendChild(controlsBlock);
    this.jobListEl.appendChild(row);

    return {
      row, reqEl, rewardEl, countEl,
      progressContainer, progressBars, overflowEl,
      addGroup, removeGroup,
    };
  }

  private getJobProductionPerMin(state: GameState, jobType: JobType): bigint {
    if (jobType === 'robotWorker') {
      const earthRobots = state.locationResources.earth.robots;
      const perRobotPerMin = getRobotLaborPerMin(state);
      return mulB(perRobotPerMin, earthRobots);
    }

    const config = BALANCE.jobs[jobType];
    if (config.timeMs <= 0) return 0n;
    const outputAmount = getJobOutputAmount(state, jobType, config.produces.amount);

    const singlePerMin = divB(mulB(outputAmount, scaleBigInt(60000n)), toBigInt(config.timeMs));
    if (config.workerType === 'human') {
      const count = state.humanPools[jobType].totalCount;
      return mulB(singlePerMin, count);
    }

    const pool = state.agentPools[jobType];
    const active = pool.totalCount - pool.idleCount;
    const working = active > pool.stuckCount ? active - pool.stuckCount : 0n;
    if (working <= 0n) return 0n;

    let effectivePerAgent = scaleB(singlePerMin, state.agentEfficiency * state.intelligence);
    effectivePerAgent = mulB(effectivePerAgent, working);
    return effectivePerAgent;
  }

  private formatProductionTotal(resource: string, amountPerMin: bigint): string {
    if (resource === 'funds') {
      return `+${moneyWithEmojiHtml(amountPerMin, 'funds')}/m`;
    }
    if (resource === 'code' || resource === 'science' || resource === 'labor' || resource === 'data' || resource === 'nudge') {
      return `+${formatNumber(amountPerMin)} ${emojiHtml(resource)}/m`;
    }
    return `+${formatNumber(amountPerMin)}/m`;
  }

  update(state: GameState): void {
    this.state = state;

    // AI agents and human workers are already grouped in pools (no grouping needed!)

    // Remove rows for locked or automated jobs
    for (const [jobType, refs] of this.jobRows) {
      const isUnlocked = state.unlockedJobs.includes(jobType);
      const isAutomated = state.automatedJobs.includes(jobType);

      if (!isUnlocked) {
        if (isAutomated && !refs.row.classList.contains('automated-swipe')) {
          // Play animation
          refs.row.classList.add('automated-swipe');
          // Remove after animation
          setTimeout(() => {
            if (this.jobRows.has(jobType)) {
              refs.row.remove();
              this.jobRows.delete(jobType);
            }
          }, 1200);
        } else if (!isAutomated) {
          // Just remove if it's not automated (maybe it was just hidden by some other logic)
          refs.row.remove();
          this.jobRows.delete(jobType);
        }
      }
    }

    const sortedJobs = state.unlockedJobs
      .filter(j => j !== 'unassigned')
      .sort((a, b) => {
        if (a === 'robotWorker' && b !== 'robotWorker') return 1;
        if (b === 'robotWorker' && a !== 'robotWorker') return -1;
        return BALANCE.jobs[a].unlockAtIntel - BALANCE.jobs[b].unlockAtIntel;
      });

    for (const jobType of sortedJobs) {
      const config = BALANCE.jobs[jobType];
      const isRobotWorker = jobType === 'robotWorker';
      const isHuman = config.workerType === 'human';
      const workerCount = isRobotWorker
        ? state.locationResources.earth.robots
        : (isHuman ? state.humanPools[jobType].totalCount : state.agentPools[jobType].totalCount);

      let refs = this.jobRows.get(jobType);
      if (!refs) {
        refs = this.createJobRow(jobType);
        this.jobRows.set(jobType, refs);
      }

      // Reward/resource display
      const { resource, amount } = config.produces;
      const outputAmount = getJobOutputAmount(state, jobType, amount);
      let baseLine = '';
      if (isRobotWorker) {
        const perRobotPerMin = getRobotLaborPerMin(state);
        baseLine = `<span class="job-reward-main">${formatNumber(perRobotPerMin)} ${resourceLabelHtml('labor')} / m per robot</span>`;
      } else if (resource === 'funds' && amount > 0) {
        baseLine = `<span class="job-reward-main">${moneyWithEmojiHtml(outputAmount, 'funds')} / ${config.timeMs / 1000}s</span>`;
      } else if (resource !== 'nudge' && amount > 0) {
        baseLine = `<span class="job-reward-main">${formatNumber(outputAmount)} ${resourceLabelHtml(resource)} / ${config.timeMs / 1000}s</span>`;
      } else if (resource === 'nudge') {
        baseLine = `<span class="job-reward-main">${resourceLabelHtml('nudge')} / ${config.timeMs / 1000}s</span>`;
      } else {
        refs.rewardEl.textContent = '';
      }

      // Salary and total production lines
      const totalProductionPerMin = this.getJobProductionPerMin(state, jobType);
      const productionTotalLine = `<span class="job-reward-total-prod">${this.formatProductionTotal(resource, totalProductionPerMin)}</span>`;

      let salaryLine = '';
      let totalsLine = productionTotalLine;
      if (isRobotWorker) {
        salaryLine = `<span class="job-reward-salary">Price: ${moneyWithEmojiHtml(BALANCE.robotImportCost, 'funds')} per robot</span>`;
      } else if (isHuman && config.salaryPerMin) {
        salaryLine = `<span class="job-reward-salary">Salary: ${moneyWithEmojiHtml(config.salaryPerMin, 'funds')} / m per person</span>`;
        const totalSalary = mulB(config.salaryPerMin, workerCount);
        totalsLine += ` <span class="job-reward-total-sep">|</span> <span class="job-reward-total-salary">-${moneyWithEmojiHtml(totalSalary, 'funds')}/m</span>`;
      }

      if (baseLine) {
        refs.rewardEl.innerHTML = baseLine + salaryLine + `<span class="job-reward-totals">${totalsLine}</span>`;
      }

      // Requirements
      if (!isHuman && !isRobotWorker) {
        const agentEligible = state.intelligence >= config.agentIntelReq &&
          (!config.agentResearchReq || config.agentResearchReq.every(r => state.completedResearch.includes(r)));

        if (!agentEligible) {
          refs.reqEl.innerHTML = `(req ${resourceLabelHtml('intel')} ${config.agentIntelReq})`;
          refs.reqEl.style.display = 'block';
        } else {
          refs.reqEl.textContent = '';
          refs.reqEl.style.display = 'none';
        }
      } else {
        refs.reqEl.textContent = '';
        refs.reqEl.style.display = 'none';
      }

      // Worker count and progress bars
      if (isRobotWorker) {
        const count = workerCount;
        refs.countEl.textContent = formatNumber(count);

        for (let i = 0; i < MAX_PROGRESS_BARS; i++) {
          refs.progressBars[i].el.style.display = 'none';
        }
        refs.overflowEl.style.display = 'none';

        const countNum = Math.floor(fromBigInt(count));
        refs.addGroup.update(countNum, (amount) => {
          const totalCost = mulB(toBigInt(amount), BALANCE.robotImportCost);
          return state.completedResearch.includes('robotics1') && state.funds >= totalCost;
        }, BALANCE.robotWorkerBuyLimit);
        refs.removeGroup.update(countNum, (amount) => countNum >= amount);
      } else if (isHuman) {
        const pool = state.humanPools[jobType];
        const count = workerCount;
        refs.countEl.textContent = formatNumber(count);

        // Update progress bars
        const barsToShow = Math.min(Math.floor(fromBigInt(count)), MAX_PROGRESS_BARS);
        for (let i = 0; i < MAX_PROGRESS_BARS; i++) {
          if (i < barsToShow) {
            refs.progressBars[i].el.style.display = '';
            refs.progressBars[i].update(pool.samples.progress[i], false);
          } else {
            refs.progressBars[i].el.style.display = 'none';
          }
        }

        // Overflow
        const maxBarsB = scaleBigInt(BigInt(MAX_PROGRESS_BARS));
        if (count > maxBarsB) {
          refs.overflowEl.textContent = '...' + formatNumber(count - maxBarsB) + ' more';
          refs.overflowEl.style.display = '';
        } else {
          refs.overflowEl.style.display = 'none';
        }

        // BulkBuy groups
        const countNum = Math.floor(fromBigInt(count));
        refs.addGroup.update(countNum, (_amount) => {
          const hireCost = config.hireCost ?? 0n;
          return state.funds >= hireCost && state.intelligence >= config.unlockAtIntel;
        });
        refs.removeGroup.update(countNum, (amount) => countNum >= amount);
      } else {
        // AI job - use agentPools directly
        const pool = state.agentPools[jobType];
        const count = workerCount;
        refs.countEl.textContent = formatNumber(count);

        // Show sample progress bars (always 4 or fewer)
        const barsToShow = Math.min(Math.floor(fromBigInt(count)), MAX_PROGRESS_BARS);
        for (let i = 0; i < MAX_PROGRESS_BARS; i++) {
          if (i < barsToShow) {
            refs.progressBars[i].el.style.display = '';

            // Determine if sample should show as idle
            // (idle fraction applies to samples statistically)
            const isIdle = count > 0n && pool.idleCount > 0n && (fromBigInt(pool.idleCount) / fromBigInt(count)) > 0.5;

            if (isIdle) {
              refs.progressBars[i].update(0, false);
              refs.progressBars[i].el.style.opacity = '0.5';
            } else {
              refs.progressBars[i].el.style.opacity = '1';
              // Use sample agent data
              refs.progressBars[i].update(
                pool.samples.progress[i],
                pool.samples.stuck[i]
              );
            }
          } else {
            refs.progressBars[i].el.style.display = 'none';
          }
        }

        const maxBarsB = scaleBigInt(BigInt(MAX_PROGRESS_BARS));
        if (count > maxBarsB) {
          refs.overflowEl.textContent = '...' + formatNumber(count - maxBarsB) + ' more';
          refs.overflowEl.style.display = '';
        } else {
          refs.overflowEl.style.display = 'none';
        }

        const countNum = Math.floor(fromBigInt(count));
        const agentEligible = state.intelligence >= config.agentIntelReq &&
          (!config.agentResearchReq || config.agentResearchReq.every(r => state.completedResearch.includes(r)));

        const unassignedHired = state.agentPools['unassigned'].totalCount;
        const assignedCount = getTotalAssignedAgents(state);
        const availableSlots = state.activeAgentCount - assignedCount;

        refs.addGroup.update(countNum, (_amount) => agentEligible && unassignedHired > 0n && availableSlots > 0n);
        refs.removeGroup.update(countNum, (amount) => countNum >= amount);
      }
    }

    // Reorder DOM when sort order changes
    const sortKey = sortedJobs.join(',');
    if (sortKey !== this.lastSortOrder) {
      this.lastSortOrder = sortKey;
      for (const jobType of sortedJobs) {
        const refs = this.jobRows.get(jobType);
        if (refs) {
          this.jobListEl.appendChild(refs.row);
        }
      }
    }

    // Nudge
    if (state.stuckCount > 0) {
      this.stuckCountEl.textContent = formatNumber(state.stuckCount) + ' stuck';
      this.stuckCountEl.style.color = 'var(--accent-red)';
      this.nudgeBtn.disabled = false;
    } else {
      this.stuckCountEl.textContent = 'All running';
      this.stuckCountEl.style.color = 'var(--text-secondary)';
      this.nudgeBtn.disabled = true;
    }
  }
}
