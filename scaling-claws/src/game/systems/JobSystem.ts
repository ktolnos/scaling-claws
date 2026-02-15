import type { GameState } from '../GameState.ts';
import { getTotalAssignedAgents } from '../GameState.ts';
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
  // Iterate jobs in priority order
  for (const jobType of JOB_ORDER) {
    const pool = state.agentPools[jobType];
    if (!pool) continue;

    // Check if any agents are stuck in this job
    if (pool.stuckCount > 0) {
      // Decrement stuck count (aggregate nudge)
      pool.stuckCount = Math.max(0, pool.stuckCount - 1);

      // Also nudge first stuck sample agent for visual feedback
      for (let i = 0; i < 4; i++) {
        if (pool.samples.stuck[i]) {
          pool.samples.stuck[i] = false;
          break; // Only nudge one sample
        }
      }

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
    
    const isObsolete = jobConfig.obsoleteAtIntel !== undefined && intel >= jobConfig.obsoleteAtIntel;
    
    if (isObsolete) {
      if (!state.automatedJobs.includes(jobType)) {
        state.automatedJobs.push(jobType);
        // UNASSIGN ALL
        if (jobConfig.workerType === 'ai') {
          removeAllFromJob(state, jobType);
        } else {
          // Fire all human workers for this job
          const humanCount = state.humanWorkers.filter(w => w.assignedJob === jobType).length;
          if (humanCount > 0) {
            fireHumanWorkers(state, jobType, humanCount);
          }
        }
      }
      continue; // Obsolete jobs are not unlocked for manual assignment
    }

    let visible = intel >= jobConfig.unlockAtIntel;

    // Manager unlocks when you have 3+ agents
    if (jobType === 'manager' && state.totalAgents >= 3) {
      visible = true;
    }

    if (visible) {
      unlocked.push(jobType);
    }
  }
  state.unlockedJobs = unlocked;

  const stuckRate = getStuckRate(intel);

  // Count managers
  state.managerCount = state.agentPools['manager'].totalCount;

  let completedThisTick = 0;

  // Rate accumulators for UI display
  let fundsIncomePerMin = 0;
  let codePerMin = 0;
  let sciencePerMin = 0;
  let laborPerMin = 0;

  // --- Process AI Agents (AGGREGATE PROCESSING) ---
  for (const [jobType, pool] of Object.entries(state.agentPools)) {
    if (pool.totalCount === 0) continue;

    const jobConfig = BALANCE.jobs[jobType as JobType];
    if (jobConfig.timeMs <= 0) continue;

    const taskTime = jobConfig.timeMs;
    const intelScale = state.intelligence;
    const progressPerTick = (dtMs / taskTime) * state.agentEfficiency * intelScale;
    const activeAgents = pool.totalCount - pool.idleCount;
    const sampleCount = Math.min(4, pool.totalCount);
    const nonSampleActive = Math.max(0, activeAgents - sampleCount);

    // 1. Snapshot pre-update sample stuck to derive non-sample stuck
    let prevSampleStuck = 0;
    for (let i = 0; i < sampleCount; i++) {
      if (pool.samples.stuck[i]) prevSampleStuck++;
    }
    let restStuck = Math.min(Math.max(0, pool.stuckCount - prevSampleStuck), nonSampleActive);

    // 2. Advance sample agents, roll stuck on task completion
    const effectiveStuckRate = stuckRate * (jobConfig.stuckProbability ?? 1.0);
    let sampleStuck = 0;
    for (let i = 0; i < 4; i++) {
      if (i >= pool.totalCount) {
        pool.samples.progress[i] = 0;
        pool.samples.stuck[i] = false;
        continue;
      }
      if (!pool.samples.stuck[i]) {
        pool.samples.progress[i] += progressPerTick;
        if (pool.samples.progress[i] >= 1) {
          pool.samples.progress[i] -= Math.floor(pool.samples.progress[i]);
          if (Math.random() < effectiveStuckRate) pool.samples.stuck[i] = true;
        }
      }
      if (pool.samples.stuck[i]) sampleStuck++;
    }

    // 3. Aggregate progress for all working agents
    const workingAgents = activeAgents - sampleStuck - restStuck;

    if (workingAgents > 0) {
      pool.aggregateProgress += progressPerTick * workingAgents;

      const completions = Math.floor(pool.aggregateProgress);
      if (completions > 0) {
        pool.aggregateProgress -= completions;
        completedThisTick += completions;
        state.completedTasks += completions;

        applyProduction(state, jobConfig.produces.resource, jobConfig.produces.amount, completions);

        if (state.completedTasks === 1 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[0])) {
          state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[0]);
        }

        // Roll stuck for non-sample agents (proportional to their share of work)
        const nonSampleWorking = nonSampleActive - restStuck;
        if (nonSampleWorking > 0) {
          const share = nonSampleWorking / workingAgents;
          const newlyStuck = Math.floor(completions * effectiveStuckRate * share + Math.random());
          restStuck = Math.min(restStuck + newlyStuck, nonSampleActive);
        }

        if ((sampleStuck + restStuck) > 0 && state.completedTasks < 5 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[1])) {
          state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[1]);
        }
      }

      // Per-minute rates for UI
      const { resource, amount } = jobConfig.produces;
      const effectiveRate = amount * (60000 / taskTime) * state.agentEfficiency * intelScale * workingAgents;
      if (resource === 'funds') {
        fundsIncomePerMin += effectiveRate;
        state.resourceBreakdown.funds.income.push({ label: jobConfig.displayName, ratePerMin: effectiveRate });
      } else if (resource === 'code') {
        codePerMin += effectiveRate;
        state.resourceBreakdown.code.income.push({ label: jobConfig.displayName, ratePerMin: effectiveRate });
      } else if (resource === 'science') {
        sciencePerMin += effectiveRate;
        state.resourceBreakdown.science.income.push({ label: jobConfig.displayName, ratePerMin: effectiveRate });
      } else if (resource === 'labor') {
        laborPerMin += effectiveRate;
        state.resourceBreakdown.labor.income.push({ label: jobConfig.displayName, ratePerMin: effectiveRate });
      }
    }

    // 4. Total stuck = samples + rest
    pool.stuckCount = sampleStuck + restStuck;
  }

  state.stuckCount = 0;
  for (const pool of Object.values(state.agentPools)) {
    state.stuckCount += pool.stuckCount;
  }

  // --- Process Human Workers ---
  let humanSalaryPerMin = 0;
  // Group human workers by job to avoid redundant breakdown rows
  const humanJobCounts = new Map<JobType, number>();
  for (const worker of state.humanWorkers) {
    humanJobCounts.set(worker.assignedJob, (humanJobCounts.get(worker.assignedJob) || 0) + 1);
  }

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

    // Accumulate salary
    if (jobConfig.salaryPerMin) {
      humanSalaryPerMin += jobConfig.salaryPerMin;
    }
  }

  // Add human production to breakdown
  for (const [jobType, count] of humanJobCounts.entries()) {
    const jobConfig = BALANCE.jobs[jobType];
    const { resource, amount } = jobConfig.produces;
    const effectiveRate = amount * (60000 / jobConfig.timeMs) * count;
    const label = `${jobConfig.displayName} (x${count})`;

    if (resource === 'funds') {
      fundsIncomePerMin += effectiveRate;
      state.resourceBreakdown.funds.income.push({ label, ratePerMin: effectiveRate });
    } else if (resource === 'code') {
      codePerMin += effectiveRate;
      state.resourceBreakdown.code.income.push({ label, ratePerMin: effectiveRate });
    } else if (resource === 'science') {
      sciencePerMin += effectiveRate;
      state.resourceBreakdown.science.income.push({ label, ratePerMin: effectiveRate });
    } else if (resource === 'labor') {
      laborPerMin += effectiveRate;
      state.resourceBreakdown.labor.income.push({ label, ratePerMin: effectiveRate });
    }
  }

  // Update computed rates
  state.incomePerMin = fundsIncomePerMin + (state.apiUnlocked ? state.apiIncomePerMin : 0);
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

  const assignedCount = getTotalAssignedAgents(state);
  if (assignedCount >= state.activeAgentCount) return false;

  const unassignedPool = state.agentPools['unassigned'];
  if (unassignedPool.totalCount === 0) return false;

  const targetPool = state.agentPools[targetJob];

  // Simple count updates (O(1))
  unassignedPool.totalCount--;
  targetPool.totalCount++;

  // Update idle count proportionally (agents keep idle status)
  if (unassignedPool.idleCount > 0) {
    const idleFraction = unassignedPool.idleCount / (unassignedPool.totalCount + 1);
    if (Math.random() < idleFraction) {
      unassignedPool.idleCount--;
      targetPool.idleCount++;
    }
  }

  return true;
}

export function decrementJobAssignments(state: GameState, sourceJob: JobType): boolean {
  const targetPool = state.agentPools[sourceJob];
  if (targetPool.totalCount === 0) return false;

  const unassignedPool = state.agentPools['unassigned'];

  // Simple count updates (O(1))
  targetPool.totalCount--;
  unassignedPool.totalCount++;

  // Update idle count proportionally
  if (targetPool.idleCount > 0) {
    const idleFraction = targetPool.idleCount / (targetPool.totalCount + 1);
    if (Math.random() < idleFraction) {
      targetPool.idleCount--;
      unassignedPool.idleCount++;
    }
  }

  // Update stuck count proportionally (can't have more stuck than total)
  if (targetPool.stuckCount > targetPool.totalCount) {
    const excess = targetPool.stuckCount - targetPool.totalCount;
    targetPool.stuckCount -= excess;
  }

  return true;
}

export function assignAllToJob(state: GameState, targetJob: JobType): void {
  if (!canAssignAiAgent(state, targetJob)) return;

  const assignedCount = getTotalAssignedAgents(state);
  const remainingSlots = state.activeAgentCount - assignedCount;

  const unassignedPool = state.agentPools['unassigned'];
  const targetPool = state.agentPools[targetJob];

  const toMove = Math.min(unassignedPool.totalCount, remainingSlots);
  if (toMove <= 0) return;

  // Bulk transfer (O(1))
  targetPool.totalCount += toMove;
  unassignedPool.totalCount -= toMove;

  // Transfer proportional idle count
  const idleToMove = Math.floor((unassignedPool.idleCount / (unassignedPool.totalCount + toMove)) * toMove);
  targetPool.idleCount += idleToMove;
  unassignedPool.idleCount -= idleToMove;
}

export function removeAllFromJob(state: GameState, sourceJob: JobType): void {
  const targetPool = state.agentPools[sourceJob];
  const unassignedPool = state.agentPools['unassigned'];
  const count = targetPool.totalCount;

  if (count === 0) return;

  // Bulk transfer (O(1))
  unassignedPool.totalCount += count;
  targetPool.totalCount = 0;

  // Transfer idle count
  unassignedPool.idleCount += targetPool.idleCount;
  targetPool.idleCount = 0;

  // Reset stuck count and aggregate progress
  targetPool.stuckCount = 0;
  targetPool.aggregateProgress = 0;

  // Reset samples
  for (let i = 0; i < 4; i++) {
    targetPool.samples.progress[i] = 0;
    targetPool.samples.stuck[i] = false;
  }
}

/** Assign N unassigned AI agents to a job (for bulk buy). */
export function assignAgentsToJob(state: GameState, targetJob: JobType, count: number): number {
  if (!canAssignAiAgent(state, targetJob)) return 0;

  const assignedCount = getTotalAssignedAgents(state);
  const availableSlots = state.activeAgentCount - assignedCount;

  const unassignedPool = state.agentPools['unassigned'];
  const targetPool = state.agentPools[targetJob];

  const toAssign = Math.min(count, availableSlots, unassignedPool.totalCount);
  if (toAssign <= 0) return 0;

  // Bulk transfer (O(1))
  targetPool.totalCount += toAssign;
  unassignedPool.totalCount -= toAssign;

  // Transfer proportional idle count
  const idleToMove = Math.floor((unassignedPool.idleCount / (unassignedPool.totalCount + toAssign)) * toAssign);
  targetPool.idleCount += idleToMove;
  unassignedPool.idleCount -= idleToMove;

  return toAssign;
}

/** Remove N AI agents from a job back to unassigned. */
export function removeAgentsFromJob(state: GameState, sourceJob: JobType, count: number): number {
  const targetPool = state.agentPools[sourceJob];
  const unassignedPool = state.agentPools['unassigned'];

  const toRemove = Math.min(count, targetPool.totalCount);
  if (toRemove <= 0) return 0;

  // Bulk transfer (O(1))
  unassignedPool.totalCount += toRemove;
  targetPool.totalCount -= toRemove;

  // Transfer proportional idle count
  const idleToMove = Math.floor((targetPool.idleCount / (targetPool.totalCount + toRemove)) * toRemove);
  unassignedPool.idleCount += idleToMove;
  targetPool.idleCount -= idleToMove;

  // Update stuck count (can't have more stuck than total)
  if (targetPool.stuckCount > targetPool.totalCount) {
    const excess = targetPool.stuckCount - targetPool.totalCount;
    targetPool.stuckCount -= excess;
  }

  return toRemove;
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
