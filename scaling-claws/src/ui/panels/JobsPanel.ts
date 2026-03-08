import { getTotalAssignedAgents } from '../../game/GameState.ts';
import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import {
  BALANCE,
  getGpuSatellitePflopsPerUnit,
  getHumanWorkforceRemaining,
  getHumanSalaryPerMin,
  getNextTier,
} from '../../game/BalanceConfig.ts';
import type { HumanJobType, JobType } from '../../game/BalanceConfig.ts';
import { formatNumber, fromBigInt, scaleBigInt, mulB, divB, scaleB, toBigInt } from '../../game/utils.ts';
import { ProgressBar } from '../components/ProgressBar.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';
import { CountBulkBuyControls } from '../components/CountBulkBuyControls.ts';
import { createPanelDivider, createPanelScaffold } from '../components/PanelScaffold.ts';
import { flashElement } from '../UIUtils.ts';
import { moneyWithEmojiHtml, resourceLabelHtml, emojiHtml } from '../emoji.ts';
import { setHintTarget } from '../hints/HintUtils.ts';
import { getJobOutputAmount, getRobotLaborPerMin } from '../../game/systems/JobRules.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';

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
  removeGroup?: BulkBuyGroup;
}

export class JobsPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;
  private onTransition: (() => void) | null;
  private lastSortOrder: string = '';

  private summaryUnassignedCountEl!: HTMLSpanElement;
  private summaryAgentEfficiencyEl!: HTMLDivElement;

  private jobListEl!: HTMLDivElement;
  private jobRows: Map<JobType, JobRowRefs> = new Map();

  // Nudge
  private nudgeBtn!: HTMLButtonElement;
  private stuckCountEl!: HTMLSpanElement;

  // Subscription-era controls
  private legacyControlsSection!: HTMLDivElement;
  private subTierNameEl!: HTMLDivElement;
  private upgradeBtn!: HTMLButtonElement;
  private agentHireControls!: CountBulkBuyControls;
  private agentCostEl!: HTMLDivElement;
  private coresRow!: HTMLDivElement;
  private coresEl!: HTMLSpanElement;
  private micMiniRow!: HTMLDivElement;
  private micMiniControls!: CountBulkBuyControls;
  private micMiniBuyMetaEl!: HTMLSpanElement;
  private micMiniBuyGroup!: BulkBuyGroup;
  private selfHostedSection!: HTMLDivElement;
  private selfHostedCostEl!: HTMLDivElement;
  private selfHostedBtn!: HTMLButtonElement;

  constructor(state: GameState, onTransition?: () => void) {
    this.state = state;
    this.onTransition = onTransition ?? null;
    const { panel } = createPanelScaffold('JOBS');
    this.el = panel;
    this.build();
  }

  private build(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;

    const summarySection = document.createElement('div');
    summarySection.className = 'panel-section';

    const unassignedRow = document.createElement('div');
    unassignedRow.className = 'panel-row';
    const unassignedLabel = document.createElement('span');
    unassignedLabel.className = 'label';
    unassignedLabel.textContent = 'Unassigned Agents';
    setHintTarget(unassignedLabel, 'mechanic.agentCapacity');
    this.summaryUnassignedCountEl = document.createElement('span');
    this.summaryUnassignedCountEl.className = 'value';
    this.summaryUnassignedCountEl.style.fontWeight = '600';
    unassignedRow.appendChild(unassignedLabel);
    unassignedRow.appendChild(this.summaryUnassignedCountEl);
    summarySection.appendChild(unassignedRow);

    this.summaryAgentEfficiencyEl = document.createElement('div');
    this.summaryAgentEfficiencyEl.style.fontSize = '0.74rem';
    this.summaryAgentEfficiencyEl.style.color = 'var(--text-secondary)';
    this.summaryAgentEfficiencyEl.style.marginTop = '-2px';
    summarySection.appendChild(this.summaryAgentEfficiencyEl);

    body.appendChild(summarySection);
    body.appendChild(createPanelDivider());

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
      dispatchGameAction(this.state, { type: 'nudgeAgent' });
    });

    nudgeRow.appendChild(this.stuckCountEl);
    nudgeRow.appendChild(this.nudgeBtn);
    body.appendChild(nudgeRow);

    body.appendChild(createPanelDivider());
    this.buildLegacyControls(body);

    // Flash listener for auto-firing
    document.addEventListener('flash-job', (e: any) => {
      const jobType = e.detail?.jobType as JobType;
      if (jobType) {
        const refs = this.jobRows.get(jobType);
        if (refs) flashElement(refs.row);
      }
    });

    document.addEventListener('flash-unassigned', () => {
      flashElement(this.summaryUnassignedCountEl);
    });

    document.addEventListener('flash-gpu-capacity', () => {
      flashElement(this.summaryUnassignedCountEl);
    });
  }

  private buildLegacyControls(parent: HTMLElement): void {
    this.legacyControlsSection = document.createElement('div');
    this.legacyControlsSection.className = 'panel-section';
    this.legacyControlsSection.style.marginTop = '4px';

    const subTitle = document.createElement('div');
    subTitle.className = 'panel-section-title';
    subTitle.textContent = 'SUBSCRIPTION ERA';
    this.legacyControlsSection.appendChild(subTitle);

    const tierRow = document.createElement('div');
    tierRow.className = 'panel-row';
    const tierLabel = document.createElement('span');
    tierLabel.className = 'label';
    tierLabel.textContent = 'Subscription Tier';
    setHintTarget(tierLabel, 'mechanic.jobs');
    this.subTierNameEl = document.createElement('div');
    this.subTierNameEl.className = 'value';
    tierRow.appendChild(tierLabel);
    tierRow.appendChild(this.subTierNameEl);
    this.legacyControlsSection.appendChild(tierRow);

    this.upgradeBtn = document.createElement('button');
    this.upgradeBtn.style.width = '100%';
    this.upgradeBtn.style.marginTop = '4px';
    this.upgradeBtn.addEventListener('click', () => {
      const next = getNextTier(this.state.subscriptionTier);
      if (next) dispatchGameAction(this.state, { type: 'upgradeTier', tier: next });
    });
    this.legacyControlsSection.appendChild(this.upgradeBtn);

    const hireRow = document.createElement('div');
    hireRow.className = 'panel-row';
    hireRow.style.marginTop = '6px';
    const hireLabel = document.createElement('span');
    hireLabel.className = 'label';
    hireLabel.textContent = 'Active Agents';
    setHintTarget(hireLabel, 'mechanic.agentCapacity');
    this.agentHireControls = new CountBulkBuyControls((amount) => {
      const actionResult = dispatchGameAction(this.state, { type: 'hireAgent', amount });
      const hired = typeof actionResult.info.performed === 'number' ? actionResult.info.performed : 0;
      if (hired < amount) {
        flashElement(this.coresEl);
      }
    }, { prefix: '+' });
    hireRow.appendChild(hireLabel);
    hireRow.appendChild(this.agentHireControls.el);
    this.legacyControlsSection.appendChild(hireRow);

    this.agentCostEl = document.createElement('div');
    this.agentCostEl.style.textAlign = 'right';
    this.agentCostEl.style.fontSize = '0.75rem';
    this.agentCostEl.style.color = 'var(--text-muted)';
    this.agentCostEl.style.marginTop = '2px';
    this.legacyControlsSection.appendChild(this.agentCostEl);

    this.coresRow = document.createElement('div');
    this.coresRow.className = 'panel-row';
    this.coresRow.style.marginTop = '4px';
    const coresLabel = document.createElement('span');
    coresLabel.className = 'label';
    coresLabel.textContent = 'CPU Cores';
    setHintTarget(coresLabel, 'mechanic.agentCapacity');
    this.coresEl = document.createElement('span');
    this.coresEl.className = 'value';
    this.coresRow.appendChild(coresLabel);
    this.coresRow.appendChild(this.coresEl);
    this.legacyControlsSection.appendChild(this.coresRow);

    this.micMiniRow = document.createElement('div');
    this.micMiniRow.className = 'panel-row';
    const micLeft = document.createElement('span');
    micLeft.className = 'label';
    micLeft.textContent = `${BALANCE.micMini.displayName}:`;
    setHintTarget(micLeft, 'infra.micMini');

    const micRight = document.createElement('span');
    micRight.style.display = 'flex';
    micRight.style.flexDirection = 'column';
    micRight.style.alignItems = 'flex-end';
    micRight.style.gap = '2px';

    this.micMiniBuyMetaEl = document.createElement('span');
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
    this.legacyControlsSection.appendChild(this.micMiniRow);

    this.selfHostedSection = document.createElement('div');
    this.selfHostedSection.style.padding = '8px';
    this.selfHostedSection.style.marginTop = '6px';
    this.selfHostedSection.style.border = '1px solid var(--accent-green)';
    this.selfHostedSection.style.borderRadius = '4px';
    this.selfHostedSection.style.background = 'rgba(78, 204, 163, 0.05)';

    const shTitle = document.createElement('div');
    shTitle.style.fontWeight = '600';
    shTitle.style.marginBottom = '4px';
    shTitle.style.color = 'var(--accent-green)';
    shTitle.textContent = 'Go self-hosted';
    this.selfHostedSection.appendChild(shTitle);

    const shDesc = document.createElement('div');
    shDesc.style.fontSize = '0.78rem';
    shDesc.style.color = 'var(--text-secondary)';
    shDesc.style.marginBottom = '6px';
    shDesc.textContent = 'Replace subscriptions with GPUs running DeepKick-405B (Intel 3.0).';
    this.selfHostedSection.appendChild(shDesc);

    this.selfHostedCostEl = document.createElement('div');
    this.selfHostedCostEl.style.fontSize = '0.82rem';
    this.selfHostedCostEl.style.marginBottom = '6px';
    this.selfHostedSection.appendChild(this.selfHostedCostEl);

    this.selfHostedBtn = document.createElement('button');
    this.selfHostedBtn.className = 'btn-primary';
    this.selfHostedBtn.textContent = 'Go Self-Hosted';
    this.selfHostedBtn.addEventListener('click', () => {
      const actionResult = dispatchGameAction(this.state, { type: 'goSelfHosted' });
      if (actionResult.ok && this.onTransition) {
        this.onTransition();
      }
    });
    this.selfHostedSection.appendChild(this.selfHostedBtn);

    this.legacyControlsSection.appendChild(this.selfHostedSection);
    parent.appendChild(this.legacyControlsSection);
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

    let removeGroup: BulkBuyGroup | undefined;
    if (!isRobotWorker) {
      removeGroup = new BulkBuyGroup(
        (amount) => {
          if (isHuman) {
            dispatchGameAction(this.state, { type: 'fireHumanWorkers', jobType, amount });
          } else {
            dispatchGameAction(this.state, { type: 'removeAgentsFromJob', jobType, amount });
          }
        },
        '-',
        'vertical'
      );
      controlsBlock.appendChild(removeGroup.el);
    }

    // Count
    const countEl = document.createElement('span');
    countEl.style.minWidth = '28px';
    countEl.style.textAlign = 'center';
    countEl.style.fontSize = '0.82rem';
    countEl.style.fontWeight = '600';
    countEl.textContent = '0';
    controlsBlock.appendChild(countEl);

    // Add group
    const addMaxedLabel = isHuman && !isRobotWorker
      ? 'MAX HUMANS'
      : (isRobotWorker ? 'SOLD\nOUT' : 'MAXED');
    const addGroup = new BulkBuyGroup(
      (amount) => {
        if (isRobotWorker) {
          dispatchGameAction(this.state, { type: 'buyRobotWorkers', amount });
        } else if (isHuman) {
          dispatchGameAction(this.state, { type: 'hireHumanWorkers', jobType, amount });
        } else {
          const actionResult = dispatchGameAction(this.state, { type: 'assignAgentsToJob', jobType, amount });
          const assigned = typeof actionResult.info.performed === 'number' ? actionResult.info.performed : 0;
          if (assigned === 0 && this.state.agentPools['unassigned'].totalCount <= 0n) {
            document.dispatchEvent(new CustomEvent('flash-unassigned'));
          }
        }
      },
      '+',
      'vertical',
      addMaxedLabel,
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

  private getTotalPaidHumanWorkers(state: GameState): bigint {
    let total = 0n;
    for (const jt of Object.keys(BALANCE.jobs) as JobType[]) {
      const config = BALANCE.jobs[jt];
      if (config.workerType !== 'human' || !config.salaryPerMin) continue;
      total += state.humanPools[jt].totalCount;
    }
    return total;
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

  private getGlobalPowerEfficiencyPct(state: GameState): number {
    if (!state.isPostGpuTransition) return 100;

    let earthRawPflops = scaleB(state.installedGpuCount, BALANCE.pflopsPerGpu);
    earthRawPflops = scaleB(earthRawPflops, state.gpuFlopsBonus);

    let moonRawPflops = scaleB(state.locationResources.moon.installedGpus, BALANCE.pflopsPerGpu);
    moonRawPflops = scaleB(moonRawPflops, state.gpuFlopsBonus);

    const mercuryInstalled = state.locationResources?.mercury?.installedGpus ?? 0n;
    let mercuryRawPflops = scaleB(mercuryInstalled, BALANCE.pflopsPerGpu);
    mercuryRawPflops = scaleB(mercuryRawPflops, state.gpuFlopsBonus);

    const orbitalSatellites = state.satellites + state.dysonSwarmSatellites;
    let orbitalRawPflops = mulB(orbitalSatellites, getGpuSatellitePflopsPerUnit());
    orbitalRawPflops = scaleB(orbitalRawPflops, state.gpuFlopsBonus);

    const rawTotalPflops = earthRawPflops + moonRawPflops + mercuryRawPflops + orbitalRawPflops;
    if (rawTotalPflops <= 0n) return 100;

    const powerRatio = fromBigInt(divB(state.totalPflops, rawTotalPflops));
    return Math.max(0, Math.min(100, Math.round(powerRatio * 100)));
  }

  private updateTopSummary(state: GameState): void {
    const unassignedCount = state.agentPools['unassigned'].totalCount;
    this.summaryUnassignedCountEl.textContent = formatNumber(unassignedCount);
    this.summaryUnassignedCountEl.style.color = unassignedCount > 0n ? 'var(--accent-green)' : '';

    const efficiencyPct = Math.max(0, Math.round(state.agentEfficiency * 100));
    const efficiencyColor = efficiencyPct === 100 ? 'var(--text-primary)' : 'var(--accent-red)';
    const assignedAgents = getTotalAssignedAgents(state);
    const pflopsNeeded = scaleB(assignedAgents, BALANCE.pflopsPerGpu);
    const computeAllocPct = pflopsNeeded > 0n
      ? Math.max(0, Math.min(100, Math.round(fromBigInt(divB(state.freeCompute, pflopsNeeded)) * 100)))
      : 100;
    const powerPct = this.getGlobalPowerEfficiencyPct(state);
    const reasons: Array<{ label: string; pct: number }> = [];
    if (computeAllocPct < 100) reasons.push({ label: 'Compute Allocation', pct: computeAllocPct });
    if (powerPct < 100) reasons.push({ label: 'Insufficient⚡', pct: powerPct });

    let breakdown = '';
    if (reasons.length === 1) {
      breakdown = ` (${reasons[0].label})`;
    } else if (reasons.length >= 2) {
      breakdown = ` (${reasons[0].pct}% ${reasons[0].label} x ${reasons[1].pct}% ${reasons[1].label})`;
    }

    this.summaryAgentEfficiencyEl.innerHTML =
      `Agents Efficiency: <span style="color:${efficiencyColor}">${efficiencyPct}%</span>${breakdown}`;
  }

  private updateLegacyControls(state: GameState): void {
    const showLegacyControls = !state.isPostGpuTransition;
    this.legacyControlsSection.style.display = showLegacyControls ? '' : 'none';
    if (!showLegacyControls) return;

    const currentTier = BALANCE.tiers[state.subscriptionTier];
    this.subTierNameEl.textContent = currentTier.displayName;

    const nextTierType = getNextTier(state.subscriptionTier);
    if (nextTierType) {
      const nextTier = BALANCE.tiers[nextTierType];
      const agentCount = state.totalAgents;
      const deltaCostPerAgent = nextTier.cost - currentTier.cost;
      const upgradeCost = mulB(deltaCostPerAgent, agentCount);
      const currentIntel = (Math.round(currentTier.intel * 10) / 10).toString();
      const nextIntel = (Math.round(nextTier.intel * 10) / 10).toString();
      this.upgradeBtn.style.display = '';
      this.upgradeBtn.innerHTML =
        `<div>Upgrade to ${nextTier.displayName} (${moneyWithEmojiHtml(upgradeCost, 'funds')})</div>` +
        `<div style="font-size:0.82em;opacity:0.9">${emojiHtml('intel')}Intel ${currentIntel} ${emojiHtml('route')} ${nextIntel}</div>`;
      this.upgradeBtn.disabled = deltaCostPerAgent <= 0n || state.funds < upgradeCost;
    } else {
      this.upgradeBtn.style.display = 'none';
    }

    this.agentHireControls.setCount(state.totalAgents);
    const coresPerAgent = toBigInt(currentTier.coresPerAgent);
    const showAgentControls = state.intelligence >= BALANCE.agentControlUnlockIntel;
    const showCpuCores = showAgentControls && state.totalAgents >= toBigInt(2);
    const nextAgent = state.totalAgents + toBigInt(1);
    const cpuLimitReached = mulB(nextAgent, coresPerAgent) > state.cpuCoresTotal;
    const showMicMiniControls = showAgentControls && (cpuLimitReached || state.micMiniCount > 0n);

    this.agentHireControls.el.style.display = showAgentControls ? '' : 'none';
    this.agentCostEl.style.display = showAgentControls ? '' : 'none';
    this.coresRow.style.display = showCpuCores ? '' : 'none';
    this.micMiniRow.style.display = showMicMiniControls ? '' : 'none';

    this.agentHireControls.bulk.update(
      Math.floor(fromBigInt(state.totalAgents)),
      (amount) => {
        if (amount <= 0) return false;
        const amountB = toBigInt(amount);
        const totalCost = mulB(amountB, currentTier.cost);
        if (state.funds < totalCost) return false;
        const requiredCores = mulB(state.totalAgents + amountB, coresPerAgent);
        return requiredCores <= state.cpuCoresTotal;
      },
      undefined,
      () => {
        flashElement(this.coresEl);
      },
    );

    this.agentCostEl.innerHTML = `${moneyWithEmojiHtml(currentTier.cost, 'funds')} per agent`;

    const coresFree = state.cpuCoresTotal - state.usedCores;
    this.coresEl.textContent = `${formatNumber(coresFree)}/${formatNumber(state.cpuCoresTotal)} free`;
    this.coresEl.style.color = coresFree <= 0n ? 'var(--accent-red)' : '';

    this.micMiniControls.setCount(state.micMiniCount);
    const micMiniOwned = Math.floor(fromBigInt(state.micMiniCount));
    const micMiniCoresAdded = formatNumber(BALANCE.micMini.coresAdded);
    this.micMiniBuyMetaEl.innerHTML =
      `Buy ${BALANCE.micMini.displayName}: ${moneyWithEmojiHtml(BALANCE.micMini.cost, 'funds')} ` +
      `<span style="font-size:0.8em;color:var(--text-secondary)">+${micMiniCoresAdded} cores</span>`;
    this.micMiniBuyGroup.update(
      micMiniOwned,
      (amount) => {
        if (amount <= 0) return false;
        if (micMiniOwned + amount > BALANCE.micMini.limit) return false;
        return state.funds >= mulB(toBigInt(amount), BALANCE.micMini.cost);
      },
      BALANCE.micMini.limit,
      () => {
        flashElement(this.micMiniBuyMetaEl);
      },
    );

    const totalAgents = state.totalAgents;
    const minGpus = BALANCE.models[0].minGpus;
    const gpuCount = minGpus > totalAgents ? minGpus : totalAgents;
    const gpuUnitPrice = state.gpuMarketPrice;
    const gpuCost = mulB(gpuCount, gpuUnitPrice);
    if (state.intelligence >= BALANCE.selfHostedUnlockIntel) {
      this.selfHostedSection.style.display = '';
      this.selfHostedCostEl.innerHTML =
        `${formatNumber(gpuCount)} ${emojiHtml('gpus')} GPUs x ${moneyWithEmojiHtml(gpuUnitPrice, 'funds')} = ${moneyWithEmojiHtml(gpuCost, 'funds')}`;
      this.selfHostedBtn.disabled = state.funds < gpuCost;
    } else {
      this.selfHostedSection.style.display = 'none';
    }
  }

  update(state: GameState): void {
    this.state = state;
    this.updateTopSummary(state);
    this.updateLegacyControls(state);
    const totalPaidHumanWorkers = this.getTotalPaidHumanWorkers(state);
    const remainingWorkforce = getHumanWorkforceRemaining(totalPaidHumanWorkers);

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
        baseLine = `<span class="job-reward-main">${formatNumber(perRobotPerMin)} ${resourceLabelHtml('labor')} / m</span>`;
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
      const productionTotalClass = totalProductionPerMin === 0n
        ? 'job-reward-total-prod job-reward-total-prod-zero'
        : 'job-reward-total-prod';
      const productionTotalLine = `<span class="${productionTotalClass}">${this.formatProductionTotal(resource, totalProductionPerMin)}</span>`;

      let salaryLine = '';
      let totalsLine = productionTotalLine;
      if (isRobotWorker) {
        salaryLine = `<span class="job-reward-salary">Price: ${moneyWithEmojiHtml(BALANCE.robotImportCost, 'funds')}</span>`;
      } else if (isHuman && config.salaryPerMin) {
        const totalSalary = getHumanSalaryPerMin(jobType as HumanJobType, workerCount, totalPaidHumanWorkers);
        const perPersonSalary = workerCount > 0n ? divB(totalSalary, workerCount) : config.salaryPerMin;
        salaryLine = `<span class="job-reward-salary">Salary: ${moneyWithEmojiHtml(perPersonSalary, 'funds')} / m</span>`;
        const salaryTotalClass = totalSalary === 0n
          ? 'job-reward-total-salary job-reward-total-salary-zero'
          : 'job-reward-total-salary';
        totalsLine += ` <span class="job-reward-total-sep">|</span> <span class="${salaryTotalClass}">-${moneyWithEmojiHtml(totalSalary, 'funds')}/m</span>`;
      }

      if (baseLine) {
        refs.rewardEl.innerHTML = baseLine + salaryLine + `<span class="job-reward-totals">${totalsLine}</span>`;
      }

      // Requirements
      let requirementsMet = true;
      if (!isHuman && !isRobotWorker) {
        const agentEligible = state.intelligence >= config.agentIntelReq &&
          (!config.agentResearchReq || config.agentResearchReq.every(r => state.completedResearch.includes(r)));

        if (!agentEligible) {
          refs.reqEl.innerHTML = `(req ${resourceLabelHtml('intel')} ${config.agentIntelReq})`;
          refs.reqEl.style.display = 'block';
          requirementsMet = false;
        } else {
          refs.reqEl.textContent = '';
          refs.reqEl.style.display = 'none';
        }
      } else if (isHuman && !isRobotWorker) {
        if (remainingWorkforce <= 0n) {
          refs.reqEl.innerHTML = '(global workforce exhausted)';
          refs.reqEl.style.display = 'block';
        } else {
          refs.reqEl.textContent = '';
          refs.reqEl.style.display = 'none';
        }
      } else {
        refs.reqEl.textContent = '';
        refs.reqEl.style.display = 'none';
      }
      refs.row.classList.toggle('job-row-locked', !requirementsMet);

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
        }, BALANCE.robotWorkerBuyLimit, () => {
          flashElement(refs.countEl);
        });
        refs.removeGroup?.update(countNum, (amount) => countNum >= amount, null, () => {
          flashElement(refs.countEl);
        });
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
        const maxForThisRow = count + remainingWorkforce;
        const maxForThisRowNum = Math.floor(fromBigInt(maxForThisRow));
        refs.addGroup.update(countNum, (amount) => {
          if (amount <= 0) return false;
          if (state.intelligence < config.unlockAtIntel) return false;
          if (remainingWorkforce <= 0n) return false;

          const amountB = toBigInt(amount);
          if (amountB > remainingWorkforce) return false;

          const hireCost = config.hireCost ?? 0n;
          const totalHireCost = mulB(amountB, hireCost);
          return state.funds >= totalHireCost;
        }, Math.max(countNum, maxForThisRowNum), () => {
          flashElement(refs.countEl);
        });
        refs.removeGroup?.update(countNum, (amount) => countNum >= amount, null, () => {
          flashElement(refs.countEl);
        });
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

        refs.addGroup.update(countNum, (amount) => {
          if (amount <= 0) return false;
          if (!agentEligible) return false;
          return unassignedHired >= toBigInt(amount);
        }, null, () => {
          if (state.agentPools['unassigned'].totalCount <= 0n) {
            document.dispatchEvent(new CustomEvent('flash-unassigned'));
            return;
          }
          flashElement(refs.countEl);
        });
        refs.removeGroup?.update(countNum, (amount) => countNum >= amount, null, () => {
          flashElement(refs.countEl);
        });
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
