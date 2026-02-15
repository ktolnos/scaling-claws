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

/** Unstick stuck agents in bulk. */
function nudgeAgents(state: GameState, count: number): void {
  let remaining = count;
  for (const jobType of JOB_ORDER) {
    if (remaining <= 0) break;
    const pool = state.agentPools[jobType];
    if (!pool || pool.stuckCount <= 0) continue;

    const toUnstick = Math.min(remaining, pool.stuckCount);
    pool.stuckCount -= toUnstick;
    remaining -= toUnstick;

    // Visual feedback for samples
    let samplesRemaining = toUnstick;
    for (let i = 0; i < 4; i++) {
      if (samplesRemaining <= 0) break;
      if (pool.samples.stuck[i]) {
        pool.samples.stuck[i] = false;
        samplesRemaining--;
      }
    }
  }
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
      nudgeAgents(state, completions);
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

  // --- Unified Worker Processing ---
  let humanSalaryPerMin = 0;

  for (const jobType of JOB_ORDER) {
    const jobConfig = BALANCE.jobs[jobType];
    if (jobConfig.timeMs <= 0) continue;

    const aiPool = state.agentPools[jobType];
    const humanPool = state.humanPools[jobType];

    // 1. Process AI Agents
    if (aiPool && aiPool.totalCount > 0) {
      const taskTime = jobConfig.timeMs;
      const intelScale = state.intelligence;
      const progressPerTick = (dtMs / taskTime) * state.agentEfficiency * intelScale;
      const activeAgents = aiPool.totalCount - aiPool.idleCount;
      const sampleCount = Math.min(4, aiPool.totalCount);
      const nonSampleActive = Math.max(0, activeAgents - sampleCount);

      // Snapshot pre-update sample stuck to derive non-sample stuck
      let prevSampleStuck = 0;
      for (let i = 0; i < sampleCount; i++) {
        if (aiPool.samples.stuck[i]) prevSampleStuck++;
      }
      let restStuck = Math.min(Math.max(0, aiPool.stuckCount - prevSampleStuck), nonSampleActive);

      // Advance sample agents, roll stuck on task completion
      const effectiveStuckRate = stuckRate * (jobConfig.stuckProbability ?? 1.0);
      let sampleStuck = 0;
      for (let i = 0; i < 4; i++) {
        if (i >= aiPool.totalCount) {
          aiPool.samples.progress[i] = 0;
          aiPool.samples.stuck[i] = false;
          continue;
        }
        if (!aiPool.samples.stuck[i]) {
          aiPool.samples.progress[i] += progressPerTick;
          if (aiPool.samples.progress[i] >= 1) {
            aiPool.samples.progress[i] -= Math.floor(aiPool.samples.progress[i]);
            if (Math.random() < effectiveStuckRate) aiPool.samples.stuck[i] = true;
          }
        }
        if (aiPool.samples.stuck[i]) sampleStuck++;
      }

      // Aggregate progress for all working agents
      const workingAgents = activeAgents - sampleStuck - restStuck;
      if (workingAgents > 0) {
        aiPool.aggregateProgress += progressPerTick * workingAgents;
        const completions = Math.floor(aiPool.aggregateProgress);
        if (completions > 0) {
          aiPool.aggregateProgress -= completions;
          completedThisTick += completions;
          state.completedTasks += completions;
          applyProduction(state, jobConfig.produces.resource, jobConfig.produces.amount, completions);

          // Milestone flavor texts
          if (state.completedTasks === 1 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[0])) {
            state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[0]);
          }

          // Roll stuck for non-sample agents
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

        // Rates for UI
        const effectiveRate = jobConfig.produces.amount * (60000 / taskTime) * state.agentEfficiency * intelScale * workingAgents;
        updateBreakdown(state, jobConfig, jobType, effectiveRate, false);
        if (jobConfig.produces.resource === 'funds') fundsIncomePerMin += effectiveRate;
        else if (jobConfig.produces.resource === 'code') codePerMin += effectiveRate;
        else if (jobConfig.produces.resource === 'science') sciencePerMin += effectiveRate;
        else if (jobConfig.produces.resource === 'labor') laborPerMin += effectiveRate;
      }
      aiPool.stuckCount = sampleStuck + restStuck;
    }

    // 2. Process Human Workers
    if (humanPool && humanPool.totalCount > 0) {
      const progressPerTick = dtMs / jobConfig.timeMs;
      humanPool.aggregateProgress += progressPerTick * humanPool.totalCount;

      const completions = Math.floor(humanPool.aggregateProgress);
      if (completions > 0) {
        humanPool.aggregateProgress -= completions;
        completedThisTick += completions;
        state.completedTasks += completions;
        applyProduction(state, jobConfig.produces.resource, jobConfig.produces.amount, completions);
      }

      // Update sample progress for UI
      for (let i = 0; i < Math.min(humanPool.totalCount, 4); i++) {
        humanPool.samples.progress[i] += progressPerTick;
        if (humanPool.samples.progress[i] >= 1) {
          humanPool.samples.progress[i] -= Math.floor(humanPool.samples.progress[i]);
        }
      }

      // Salary
      if (jobConfig.salaryPerMin) humanSalaryPerMin += jobConfig.salaryPerMin * humanPool.totalCount;

      // Rates for UI
      const effectiveRate = jobConfig.produces.amount * (60000 / jobConfig.timeMs) * humanPool.totalCount;
      updateBreakdown(state, jobConfig, jobType, effectiveRate, true);
      if (jobConfig.produces.resource === 'funds') fundsIncomePerMin += effectiveRate;
      else if (jobConfig.produces.resource === 'code') codePerMin += effectiveRate;
      else if (jobConfig.produces.resource === 'science') sciencePerMin += effectiveRate;
      else if (jobConfig.produces.resource === 'labor') laborPerMin += effectiveRate;
    }
  }

  // Global stuck count sync
  state.stuckCount = 0;
  for (const pool of Object.values(state.agentPools)) state.stuckCount += pool.stuckCount;

  // Update computed rates
  state.incomePerMin = fundsIncomePerMin + (state.apiUnlocked ? state.apiIncomePerMin : 0);
  state.codePerMin = codePerMin;
  state.sciencePerMin = sciencePerMin;
  state.laborPerMin = laborPerMin;
  state.humanSalaryPerMin = humanSalaryPerMin;

  // --- Auto-Firing Logic (Goal 2) ---
  // If we have no money and are losing money, fire human workers to balance the budget
  if (state.funds <= 0 && state.expensePerMin > state.incomePerMin) {
    let salaryToCut = state.expensePerMin - state.incomePerMin;
    let anyFired = false;

    // Fire in reverse order of seniority (last jobs first)
    for (let i = JOB_ORDER.length - 1; i >= 0; i--) {
      const jobType = JOB_ORDER[i];
      const config = BALANCE.jobs[jobType];
      if (config.workerType !== 'human' || !config.salaryPerMin) continue;

      const pool = state.humanPools[jobType];
      if (pool.totalCount <= 0) continue;

      const workersToFire = Math.min(pool.totalCount, Math.ceil(salaryToCut / config.salaryPerMin));
      if (workersToFire > 0) {
        pool.totalCount -= workersToFire;
        salaryToCut -= workersToFire * config.salaryPerMin;
        anyFired = true;

        // Visual feedback
        document.dispatchEvent(new CustomEvent('flash-job', { detail: { jobType } }));
      }
      if (salaryToCut <= 0) break;
    }

    if (anyFired) {
      // Refresh humanSalaryPerMin and expensePerMin for accurate UI and remaining tick logic
      let newHumanSalary = 0;
      for (const jt of JOB_ORDER) {
        const pool = state.humanPools[jt];
        const jobConfig = BALANCE.jobs[jt];
        if (jobConfig.salaryPerMin) newHumanSalary += jobConfig.salaryPerMin * (pool?.totalCount || 0);
      }
      const gridCost = (state.gridPowerKW || 0) * BALANCE.gridPowerCostPerKWPerMin;
      state.humanSalaryPerMin = newHumanSalary;
      state.expensePerMin = newHumanSalary + gridCost;
    }
  }

  // Milestone flavor texts
  if (state.managerCount > 0 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[2])) {
    state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[2]);
  }
  if (state.micMiniCount >= 3 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_MIC_MINI[0])) {
    state.pendingFlavorTexts.push(FLAVOR_TEXTS_MIC_MINI[0]);
  }
}

/** Helper to update resource breakdown for UI. */
function updateBreakdown(state: GameState, config: any, jobType: string, rate: number, isHuman: boolean): void {
  const { resource } = config.produces;
  const label = isHuman ? `${config.displayName} (x${state.humanPools[jobType as JobType].totalCount})` : config.displayName;
  
  const target = (resource === 'funds') ? state.resourceBreakdown.funds.income :
                 (resource === 'code') ? state.resourceBreakdown.code.income :
                 (resource === 'science') ? state.resourceBreakdown.science.income :
                 (resource === 'labor') ? state.resourceBreakdown.labor.income : null;

  if (target) {
    target.push({ label, ratePerMin: rate });
  }
}

// --- Public actions ---

export function nudgeAgent(state: GameState): boolean {
  const before = state.stuckCount;
  nudgeAgents(state, 1);
  
  // Refresh stuck count for return value
  let after = 0;
  for (const pool of Object.values(state.agentPools)) after += pool.stuckCount;
  state.stuckCount = after;

  return after < before;
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
  const pool = state.humanPools[jobType];
  pool.totalCount++;
  
  // Initialize sample if needed
  if (pool.totalCount <= 4) {
    pool.samples.progress[pool.totalCount - 1] = 0;
  }

  return true;
}

export function fireHumanWorker(state: GameState, jobType: JobType): boolean {
  const pool = state.humanPools[jobType];
  if (pool.totalCount <= 0) return false;

  pool.totalCount--;
  return true;
}

/** Hire N human workers for a job (for bulk buy). */
export function hireHumanWorkers(state: GameState, jobType: JobType, count: number): number {
  const jobConfig = BALANCE.jobs[jobType];
  if (jobConfig.workerType !== 'human') return 0;
  if (state.intelligence < jobConfig.unlockAtIntel) return 0;

  const hireCost = jobConfig.hireCost ?? 0;
  
  // Calculate how many we can afford
  const affordable = hireCost > 0 ? Math.floor(state.funds / hireCost) : count;
  const toHire = Math.min(count, affordable);

  if (toHire <= 0) return 0;

  state.funds -= toHire * hireCost;
  const pool = state.humanPools[jobType];
  const oldCount = pool.totalCount;
  pool.totalCount += toHire;

  // Initialize samples if needed
  for (let i = oldCount; i < Math.min(pool.totalCount, 4); i++) {
    pool.samples.progress[i] = 0;
  }

  return toHire;
}

/** Fire N human workers from a job. */
export function fireHumanWorkers(state: GameState, jobType: JobType, count: number): number {
  const pool = state.humanPools[jobType];
  const toFire = Math.min(count, pool.totalCount);
  pool.totalCount -= toFire;
  return toFire;
}
