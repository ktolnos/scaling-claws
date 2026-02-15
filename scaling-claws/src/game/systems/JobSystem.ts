import type { GameState } from '../GameState.ts';
import { BALANCE, JOB_ORDER, getStuckRate } from '../BalanceConfig.ts';
import type { JobType } from '../BalanceConfig.ts';

const FLAVOR_TEXTS_EARLY = [
  '"Your first Sixxer task: \'Rewrite my cat\'s Instagram bio.\' $6 is $6."',
  '"Agent stuck. It\'s been thinking about a regex problem for 45 seconds."',
  '"The Manager agent nudged a stuck coder. It said \'try a different approach.\' Shockingly, it worked."',
];

const FLAVOR_TEXTS_MIC_MINI = [
  '"Your third Mic-mini. Your desk is becoming a server rack."',
];

/** Unstick one stuck agent. Returns true if one was found. */
function nudgeOneAgent(state: GameState): boolean {
  for (const agent of state.agents) {
    if (agent.isStuck && !agent.isIdle) {
      agent.isStuck = false;
      return true;
    }
  }
  return false;
}

/** Apply resource production for a completed task. */
function applyProduction(state: GameState, resource: string, amount: number, completions: number): void {
  const total = amount * completions;
  switch (resource) {
    case 'funds':
      state.funds += total;
      state.totalEarned += total;
      break;
    case 'code':
      state.code += total;
      break;
    case 'science':
      state.science += total;
      break;
    case 'labor':
      state.labor += total;
      break;
    case 'nudge':
      for (let i = 0; i < completions; i++) nudgeOneAgent(state);
      break;
  }
}

export function tickJobs(state: GameState, dtMs: number): void {
  const intel = state.intelligence;

  // 1. Recompute unlocked jobs from current state
  const unlocked: JobType[] = ['unassigned'];
  for (const jobType of JOB_ORDER) {
    const jobConfig = BALANCE.jobs[jobType];
    let visible = intel >= jobConfig.unlockAtIntel;

    // Manager unlocks when you have 3+ agents
    if (jobType === 'manager' && state.agents.length >= 3) {
      visible = true;
    }

    if (visible) {
      unlocked.push(jobType);
    }
  }
  state.unlockedJobs = unlocked;

  const stuckRate = getStuckRate(intel);

  // Count managers
  state.managerCount = state.agents.filter(a => a.assignedJob === 'manager').length;

  let stuckCount = 0;
  let completedThisTick = 0;

  // Rate accumulators for UI display
  let fundsIncomePerMin = 0;
  let codePerMin = 0;
  let sciencePerMin = 0;
  let laborPerMin = 0;

  // --- Process AI Agents ---
  for (const agent of state.agents) {
    if (agent.isIdle) continue;

    const jobConfig = BALANCE.jobs[agent.assignedJob];
    if (jobConfig.timeMs <= 0) continue;

    if (agent.isStuck) {
      stuckCount++;
      continue;
    }

    // Advance progress (scales with efficiency and intelligence)
    const taskTime = agent.taskTimeMs;
    const intelScale = state.intelligence;
    agent.progress += (dtMs / taskTime) * state.agentEfficiency * intelScale;

    // Task complete
    if (agent.progress >= 1) {
      const completions = Math.floor(agent.progress);
      agent.progress -= completions;
      completedThisTick += completions;

      applyProduction(state, jobConfig.produces.resource, jobConfig.produces.amount, completions);

      state.completedTasks += completions;

      // First task flavor text
      if (!state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[0])) {
        state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[0]);
      }

      // Roll for stuck on new task
      if (Math.random() < stuckRate) {
        agent.isStuck = true;
        stuckCount++;
        if (state.completedTasks < 5 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[1])) {
          state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[1]);
        }
      }

      agent.taskTimeMs = jobConfig.timeMs;
    }

    // Accumulate rate for display
    const { resource, amount } = jobConfig.produces;
    const effectiveRate = amount * (60000 / jobConfig.timeMs) * state.agentEfficiency * intelScale;
    if (resource === 'funds') fundsIncomePerMin += effectiveRate;
    else if (resource === 'code') codePerMin += effectiveRate;
    else if (resource === 'science') sciencePerMin += effectiveRate;
    else if (resource === 'labor') laborPerMin += effectiveRate;
  }

  state.stuckCount = stuckCount;

  // --- Process Human Workers ---
  let humanSalaryPerMin = 0;
  for (const worker of state.humanWorkers) {
    const jobConfig = BALANCE.jobs[worker.assignedJob];
    if (jobConfig.timeMs <= 0) continue;

    // Human workers progress at fixed rate (no intel/efficiency scaling)
    worker.progress += dtMs / worker.taskTimeMs;

    if (worker.progress >= 1) {
      const completions = Math.floor(worker.progress);
      worker.progress -= completions;
      completedThisTick += completions;

      applyProduction(state, jobConfig.produces.resource, jobConfig.produces.amount, completions);
      state.completedTasks += completions;

      worker.taskTimeMs = jobConfig.timeMs;
    }

    // Accumulate rate for display
    const { resource, amount } = jobConfig.produces;
    const effectiveRate = amount * (60000 / jobConfig.timeMs);
    if (resource === 'funds') fundsIncomePerMin += effectiveRate;
    else if (resource === 'code') codePerMin += effectiveRate;
    else if (resource === 'science') sciencePerMin += effectiveRate;
    else if (resource === 'labor') laborPerMin += effectiveRate;

    // Accumulate salary
    if (jobConfig.salaryPerMin) {
      humanSalaryPerMin += jobConfig.salaryPerMin;
    }
  }

  // Update computed rates
  state.incomePerMin = fundsIncomePerMin;
  state.codePerMin = codePerMin;
  state.sciencePerMin = sciencePerMin;
  state.laborPerMin = laborPerMin;
  state.humanSalaryPerMin = humanSalaryPerMin;

  // Milestone flavor texts
  if (state.managerCount > 0 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[2])) {
    state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[2]);
  }
  if (state.micMiniCount >= 3 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_MIC_MINI[0])) {
    state.pendingFlavorTexts.push(FLAVOR_TEXTS_MIC_MINI[0]);
  }
}

// --- Public actions ---

export function nudgeAgent(state: GameState): boolean {
  return nudgeOneAgent(state);
}

/** Check if an AI agent can be assigned to a given job. */
function canAssignAiAgent(state: GameState, jobType: JobType): boolean {
  if (!state.unlockedJobs.includes(jobType)) return false;
  const jobConfig = BALANCE.jobs[jobType];
  if (jobConfig.workerType !== 'ai') return false;
  if (state.intelligence < jobConfig.unlockAtIntel) return false;
  if (jobConfig.agentIntelReq && state.intelligence < jobConfig.agentIntelReq) return false;
  if (jobConfig.agentResearchReq) {
    for (const req of jobConfig.agentResearchReq) {
      if (!state.completedResearch.includes(req)) return false;
    }
  }
  return true;
}

export function incrementJobAssignments(state: GameState, targetJob: JobType): boolean {
  if (!canAssignAiAgent(state, targetJob)) return false;

  const assignedCount = state.agents.filter(a => a.assignedJob !== 'unassigned').length;
  if (assignedCount >= state.activeAgentCount) return false;

  const candidate = state.agents.find(a => a.assignedJob === 'unassigned');
  if (!candidate) return false;

  candidate.assignedJob = targetJob;
  candidate.progress = 0;
  candidate.isStuck = false;
  candidate.taskTimeMs = BALANCE.jobs[targetJob].timeMs;
  return true;
}

export function decrementJobAssignments(state: GameState, sourceJob: JobType): boolean {
  const candidate = state.agents.find(a => a.assignedJob === sourceJob);
  if (!candidate) return false;

  candidate.assignedJob = 'unassigned';
  candidate.progress = 0;
  candidate.isStuck = false;
  candidate.taskTimeMs = 0;
  return true;
}

export function assignAllToJob(state: GameState, targetJob: JobType): void {
  if (!canAssignAiAgent(state, targetJob)) return;

  const assignedCount = state.agents.filter(a => a.assignedJob !== 'unassigned').length;
  let remainingSlots = state.activeAgentCount - assignedCount;

  for (const agent of state.agents) {
    if (remainingSlots <= 0) break;
    if (agent.assignedJob === 'unassigned') {
      agent.assignedJob = targetJob;
      agent.progress = 0;
      agent.isStuck = false;
      agent.taskTimeMs = BALANCE.jobs[targetJob].timeMs;
      remainingSlots--;
    }
  }
}

export function removeAllFromJob(state: GameState, sourceJob: JobType): void {
  for (const agent of state.agents) {
    if (agent.assignedJob === sourceJob) {
      agent.assignedJob = 'unassigned';
      agent.progress = 0;
      agent.isStuck = false;
      agent.taskTimeMs = 0;
    }
  }
}

/** Assign N unassigned AI agents to a job (for bulk buy). */
export function assignAgentsToJob(state: GameState, targetJob: JobType, count: number): number {
  if (!canAssignAiAgent(state, targetJob)) return 0;

  const assignedCount = state.agents.filter(a => a.assignedJob !== 'unassigned').length;
  const availableSlots = state.activeAgentCount - assignedCount;
  const toAssign = Math.min(count, availableSlots);

  let assigned = 0;
  for (const agent of state.agents) {
    if (assigned >= toAssign) break;
    if (agent.assignedJob === 'unassigned') {
      agent.assignedJob = targetJob;
      agent.progress = 0;
      agent.isStuck = false;
      agent.taskTimeMs = BALANCE.jobs[targetJob].timeMs;
      assigned++;
    }
  }
  return assigned;
}

/** Remove N AI agents from a job back to unassigned. */
export function removeAgentsFromJob(state: GameState, sourceJob: JobType, count: number): number {
  let removed = 0;
  for (const agent of state.agents) {
    if (removed >= count) break;
    if (agent.assignedJob === sourceJob) {
      agent.assignedJob = 'unassigned';
      agent.progress = 0;
      agent.isStuck = false;
      agent.taskTimeMs = 0;
      removed++;
    }
  }
  return removed;
}

// --- Human worker actions ---

export function hireHumanWorker(state: GameState, jobType: JobType): boolean {
  const jobConfig = BALANCE.jobs[jobType];
  if (jobConfig.workerType !== 'human') return false;
  if (state.intelligence < jobConfig.unlockAtIntel) return false;

  const hireCost = jobConfig.hireCost ?? 0;
  if (state.funds < hireCost) return false;

  state.funds -= hireCost;
  state.humanWorkers.push({
    id: state.nextHumanWorkerId++,
    assignedJob: jobType,
    progress: 0,
    taskTimeMs: jobConfig.timeMs,
  });
  return true;
}

export function fireHumanWorker(state: GameState, jobType: JobType): boolean {
  const idx = state.humanWorkers.findIndex(w => w.assignedJob === jobType);
  if (idx === -1) return false;

  state.humanWorkers.splice(idx, 1);
  return true;
}

/** Hire N human workers for a job (for bulk buy). */
export function hireHumanWorkers(state: GameState, jobType: JobType, count: number): number {
  const jobConfig = BALANCE.jobs[jobType];
  if (jobConfig.workerType !== 'human') return 0;
  if (state.intelligence < jobConfig.unlockAtIntel) return 0;

  const hireCost = jobConfig.hireCost ?? 0;
  let hired = 0;
  for (let i = 0; i < count; i++) {
    if (state.funds < hireCost) break;
    state.funds -= hireCost;
    state.humanWorkers.push({
      id: state.nextHumanWorkerId++,
      assignedJob: jobType,
      progress: 0,
      taskTimeMs: jobConfig.timeMs,
    });
    hired++;
  }
  return hired;
}

/** Fire N human workers from a job. */
export function fireHumanWorkers(state: GameState, jobType: JobType, count: number): number {
  let fired = 0;
  for (let i = 0; i < count; i++) {
    const idx = state.humanWorkers.findIndex(w => w.assignedJob === jobType);
    if (idx === -1) break;
    state.humanWorkers.splice(idx, 1);
    fired++;
  }
  return fired;
}
