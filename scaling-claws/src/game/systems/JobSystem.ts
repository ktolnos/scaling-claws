import type { GameState } from '../GameState.ts';
import { getTotalAssignedAgents } from '../GameState.ts';
import { BALANCE, JOB_ORDER, getStuckRate } from '../BalanceConfig.ts';
import type { JobType } from '../BalanceConfig.ts';
import { toBigInt, fromBigInt, mulB, divB, scaleB, scaleBigInt } from '../utils.ts';
import { getJobOutputAmount } from './JobRules.ts';

const FLAVOR_TEXTS_EARLY = [
  '"Your first Sixxer task: \'Rewrite my cat\'s Instagram bio.\' $6 is $6."',
  '"Agent stuck. It\'s been thinking about a regex problem for 45 seconds."',
  '"The Manager agent nudged a stuck coder. It said \'try a different approach.\' Shockingly, it worked."',
];

const FLAVOR_TEXTS_MIC_MINI = [
  '"Your third Mic-mini. Your desk is becoming a server rack."',
];

function floorWholeAgents(value: bigint): bigint {
  const oneAgent = scaleBigInt(1n);
  if (value <= 0n) return 0n;
  return (value / oneAgent) * oneAgent;
}

/** Unstick stuck agents in bulk. */
function nudgeAgents(state: GameState, count: bigint): void {
  let remaining = count;
  for (const pool of Object.values(state.agentPools)) {
    if (remaining <= 0n) break;
    if (!pool || pool.stuckCount <= 0n) continue;

    const stuckBefore = pool.stuckCount;
    const toUnstick = remaining < stuckBefore ? remaining : stuckBefore;
    pool.stuckCount = stuckBefore - toUnstick;
    remaining -= toUnstick;

    // Visual feedback for samples:
    // unstick sampled agents proportionally, not always-first.
    const toUnstickRaw = Math.floor(fromBigInt(toUnstick));
    if (toUnstickRaw <= 0) continue;

    const stuckBeforeRaw = Math.max(1, Math.floor(fromBigInt(stuckBefore)));
    const stuckSampleIndices: number[] = [];
    for (let i = 0; i < 4; i++) {
      if (pool.samples.stuck[i]) stuckSampleIndices.push(i);
    }
    if (stuckSampleIndices.length <= 0) continue;

    const expectedSampleUnsticks = (toUnstickRaw * stuckSampleIndices.length) / stuckBeforeRaw;
    let sampleUnsticks = Math.floor(expectedSampleUnsticks + Math.random());
    if (sampleUnsticks > stuckSampleIndices.length) sampleUnsticks = stuckSampleIndices.length;
    if (sampleUnsticks <= 0) continue;

    // Tiny set (max 4), so Fisher-Yates is cheap and keeps visual state unbiased.
    for (let i = stuckSampleIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = stuckSampleIndices[i];
      stuckSampleIndices[i] = stuckSampleIndices[j];
      stuckSampleIndices[j] = tmp;
    }
    for (let i = 0; i < sampleUnsticks; i++) {
      pool.samples.stuck[stuckSampleIndices[i]] = false;
    }
  }
}

/** Apply resource production for a completed task. completionsRaw is the number of whole tasks. */
function applyProduction(state: GameState, resource: string, amount: bigint, completionsRaw: bigint): void {
  const total = amount * completionsRaw;
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
      state.locationResources.earth.labor += total;
      break;
    case 'data':
      state.trainingData += total;
      break;
    case 'nudge':
      // Apply nudges after all jobs finish this tick so managers can clear newly stuck agents too.
      state.nudgeBuffer += total;
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
          const humanPool = state.humanPools[jobType];
          if (humanPool && humanPool.totalCount > 0n) {
            fireHumanWorkers(state, jobType, Number(humanPool.totalCount));
          }
        }
      }
      continue; // Obsolete jobs are not unlocked for manual assignment
    }

    let visible = intel >= jobConfig.unlockAtIntel;
    if (jobType === 'robotWorker') {
      visible = visible && state.completedResearch.includes('robotics1');
    }
    if (visible && jobConfig.agentResearchReq && jobConfig.agentResearchReq.length > 0) {
      visible = jobConfig.agentResearchReq.every((id) => state.completedResearch.includes(id));
    }

    if (visible) {
      unlocked.push(jobType);
    }
  }
  state.unlockedJobs = unlocked;

  const stuckRatePerSecond = getStuckRate(intel);

  // Count managers
  state.managerCount = state.agentPools['manager'].totalCount;

  let completedThisTick = 0n;

  // Rate accumulators for UI display
  let fundsIncomePerMin = 0n;
  let codePerMin = 0n;
  let sciencePerMin = 0n;
  let laborPerMin = 0n;
  let dataPerMin = 0n;

  // --- Unified Worker Processing ---
  let humanSalaryPerMin = 0n;

  for (const jobType of JOB_ORDER) {
    const jobConfig = BALANCE.jobs[jobType];
    if (jobConfig.timeMs <= 0) continue;

    const aiPool = state.agentPools[jobType];
    const humanPool = state.humanPools[jobType];

    // 1. Process AI Agents
    if (aiPool && aiPool.totalCount > 0n) {
      // Agent counts are discrete. Quantize any legacy fractional state from old saves.
      aiPool.idleCount = floorWholeAgents(aiPool.idleCount);
      aiPool.stuckCount = floorWholeAgents(aiPool.stuckCount);
      if (aiPool.idleCount > aiPool.totalCount) aiPool.idleCount = aiPool.totalCount;
      if (aiPool.stuckCount > aiPool.totalCount) aiPool.stuckCount = aiPool.totalCount;

      const outputAmount = getJobOutputAmount(state, jobType, jobConfig.produces.amount);
      const taskTime = jobConfig.timeMs;
      // Progress per tick for ONE agent, scaled
      const progressPerTickScaled = scaleB(toBigInt(state.agentEfficiency * intel * dtMs), 1.0 / taskTime);

      const activeAgents = aiPool.totalCount > aiPool.idleCount ? aiPool.totalCount - aiPool.idleCount : 0n;
      const sampleCountScaled = aiPool.totalCount < scaleBigInt(4n) ? aiPool.totalCount : scaleBigInt(4n);
      const sampleCount = Math.floor(fromBigInt(sampleCountScaled));
      const activeSampleCountScaled = activeAgents < sampleCountScaled ? activeAgents : sampleCountScaled;
      const activeSampleCount = Math.floor(fromBigInt(activeSampleCountScaled));
      const nonSampleActive = activeAgents - activeSampleCountScaled < 0n ? 0n : activeAgents - activeSampleCountScaled;

      // Snapshot pre-update sample stuck to derive non-sample stuck
      let prevSampleStuck = 0n;
      for (let i = 0; i < activeSampleCount; i++) {
        if (aiPool.samples.stuck[i]) prevSampleStuck++;
      }
      let restStuck = aiPool.stuckCount - scaleBigInt(prevSampleStuck);
      if (restStuck < 0n) restStuck = 0n;
      if (restStuck > nonSampleActive) restStuck = nonSampleActive;

      // Convert per-second hazard into per-tick probability:
      // p_tick = 1 - (1 - p_sec)^(dt_seconds)
      const effectiveStuckRatePerSecond = Math.max(
        0,
        Math.min(1, stuckRatePerSecond * state.agentEfficiency * (jobConfig.stuckProbability ?? 1.0)),
      );
      const stuckRollPerTick = 1 - Math.pow(1 - effectiveStuckRatePerSecond, dtMs / 1000);

      // Advance sampled active agents. Reward credits for sampled agents are event-based
      // (only when their sampled task actually crosses completion).
      let sampleStuck = 0n;
      let sampleCompletionsRaw = 0n;
      for (let i = 0; i < 4; i++) {
        if (i >= sampleCount) {
          aiPool.samples.progress[i] = 0;
          aiPool.samples.stuck[i] = false;
          continue;
        }
        const isSampleActive = i < activeSampleCount;
        if (!isSampleActive) {
          aiPool.samples.progress[i] = 0;
          aiPool.samples.stuck[i] = false;
          continue;
        }
        if (!aiPool.samples.stuck[i]) {
          aiPool.samples.progress[i] += fromBigInt(progressPerTickScaled); 
          const wholeTasks = Math.floor(aiPool.samples.progress[i]);
          if (wholeTasks > 0) {
            aiPool.samples.progress[i] -= wholeTasks;
            sampleCompletionsRaw += BigInt(wholeTasks);
          }
          if (Math.random() < stuckRollPerTick) aiPool.samples.stuck[i] = true;
        }
        if (aiPool.samples.stuck[i]) sampleStuck += scaleBigInt(1n);
      }

      const sampleWorking = activeSampleCountScaled > sampleStuck ? activeSampleCountScaled - sampleStuck : 0n;
      const nonSampleWorking = nonSampleActive > restStuck ? nonSampleActive - restStuck : 0n;

      // Aggregate progress only for non-sampled workers.
      if (nonSampleWorking > 0n) {
        aiPool.aggregateProgress += mulB(progressPerTickScaled, nonSampleWorking);
      }

      const nonSampleCompletionsRaw = aiPool.aggregateProgress / scaleBigInt(1n);
      if (nonSampleCompletionsRaw > 0n) {
        aiPool.aggregateProgress -= nonSampleCompletionsRaw * scaleBigInt(1n);
      }

      const completions = sampleCompletionsRaw + nonSampleCompletionsRaw;
      if (completions > 0n) {
        completedThisTick += completions;
        state.completedTasks += completions;
        applyProduction(state, jobConfig.produces.resource, outputAmount, completions);

        // Milestone flavor texts
        if (state.completedTasks === 1n && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[0])) {
          state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[0]);
        }
      }

      // Roll stuck for non-sample agents based on elapsed time (independent of completions).
      if (nonSampleWorking > 0n && stuckRollPerTick > 0) {
        const expectedNewlyStuck = fromBigInt(nonSampleWorking) * stuckRollPerTick;
        const newlyStuck = scaleBigInt(BigInt(Math.floor(expectedNewlyStuck + Math.random())));
        restStuck += newlyStuck;
        if (restStuck > nonSampleActive) restStuck = nonSampleActive;
      }

      if ((sampleStuck + restStuck) > 0n && state.completedTasks < 5n && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[1])) {
        state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[1]);
      }

      // Rates for UI
      const workingAgents = sampleWorking + nonSampleWorking;
      if (workingAgents > 0n) {
        let effectiveRate = divB(mulB(outputAmount, scaleBigInt(60000n)), toBigInt(taskTime));
        effectiveRate = scaleB(effectiveRate, state.agentEfficiency * intel);
        effectiveRate = mulB(effectiveRate, workingAgents);

        updateBreakdown(state, jobConfig, jobType, effectiveRate, false);
        if (jobConfig.produces.resource === 'funds') fundsIncomePerMin += effectiveRate;
        else if (jobConfig.produces.resource === 'code') codePerMin += effectiveRate;
        else if (jobConfig.produces.resource === 'science') sciencePerMin += effectiveRate;
        else if (jobConfig.produces.resource === 'labor') laborPerMin += effectiveRate;
        else if (jobConfig.produces.resource === 'data') dataPerMin += effectiveRate;
      }
      aiPool.stuckCount = sampleStuck + restStuck;
    }

    // 2. Process Human Workers
    if (humanPool && humanPool.totalCount > 0n) {
      const outputAmount = getJobOutputAmount(state, jobType, jobConfig.produces.amount);
      const progressPerTickScaled = scaleB(toBigInt(dtMs), 1.0 / jobConfig.timeMs);
      
      humanPool.aggregateProgress += mulB(progressPerTickScaled, humanPool.totalCount);

      const completions = humanPool.aggregateProgress / scaleBigInt(1n);
      if (completions > 0n) {
        humanPool.aggregateProgress -= completions * scaleBigInt(1n);
        completedThisTick += completions;
        state.completedTasks += completions;
        applyProduction(state, jobConfig.produces.resource, outputAmount, completions);
      }

      // Update sample progress for UI
      for (let i = 0; i < Math.min(Number(humanPool.totalCount), 4); i++) {
        humanPool.samples.progress[i] += fromBigInt(progressPerTickScaled); // Convert scaled BigInt to Number for sample progress
        if (humanPool.samples.progress[i] >= 1) {
          humanPool.samples.progress[i] -= Math.floor(humanPool.samples.progress[i]);
        }
      }

      // Salary
      if (jobConfig.salaryPerMin) humanSalaryPerMin += mulB(jobConfig.salaryPerMin, humanPool.totalCount);

      // Rates for UI
      let effectiveRate = divB(mulB(outputAmount, scaleBigInt(60000n)), toBigInt(jobConfig.timeMs));
      effectiveRate = mulB(effectiveRate, humanPool.totalCount);
      updateBreakdown(state, jobConfig, jobType, effectiveRate, true);
      if (jobConfig.produces.resource === 'funds') fundsIncomePerMin += effectiveRate;
      else if (jobConfig.produces.resource === 'code') codePerMin += effectiveRate;
      else if (jobConfig.produces.resource === 'science') sciencePerMin += effectiveRate;
      else if (jobConfig.produces.resource === 'labor') laborPerMin += effectiveRate;
      else if (jobConfig.produces.resource === 'data') dataPerMin += effectiveRate;
    }
  }

  // Global stuck count sync
  let stuckBeforeNudges = 0n;
  for (const pool of Object.values(state.agentPools)) stuckBeforeNudges += pool.stuckCount;
  state.stuckCount = stuckBeforeNudges;

  // Keep a small carryover window so manager output can smooth random spikes in stuck agents.
  const managerPool = state.agentPools['manager'];
  const activeManagers = managerPool.totalCount - managerPool.idleCount;
  const managerCfg = BALANCE.jobs['manager'];
  const oneNudge = scaleBigInt(1n);
  let managerNudgesPerMin = divB(mulB(managerCfg.produces.amount, scaleBigInt(60000n)), toBigInt(managerCfg.timeMs));
  managerNudgesPerMin = scaleB(managerNudgesPerMin, state.agentEfficiency * intel);
  managerNudgesPerMin = mulB(managerNudgesPerMin, activeManagers > 0n ? activeManagers : 0n);
  const nudgeBufferCapRaw = (managerNudgesPerMin * 5n) / 60n; // ~5s carryover
  const nudgeBufferCap = (nudgeBufferCapRaw / oneNudge) * oneNudge;
  if (state.nudgeBuffer > nudgeBufferCap) {
    state.nudgeBuffer = nudgeBufferCap;
  }

  // Spend buffered nudges after all stuck rolls have been processed.
  if (state.stuckCount > 0n && state.nudgeBuffer > 0n) {
    const toSpendRaw = state.nudgeBuffer < state.stuckCount ? state.nudgeBuffer : state.stuckCount;
    const toSpend = (toSpendRaw / oneNudge) * oneNudge;
    if (toSpend > 0n) {
      nudgeAgents(state, toSpend);
      state.nudgeBuffer -= toSpend;
    }

    let stuckAfterNudges = 0n;
    for (const pool of Object.values(state.agentPools)) stuckAfterNudges += pool.stuckCount;
    state.stuckCount = stuckAfterNudges;
  }

  // Update computed rates
  state.incomePerMin = fundsIncomePerMin + (state.apiUnlocked ? state.apiIncomePerMin : 0n);
  state.codePerMin = codePerMin;
  state.sciencePerMin = sciencePerMin;
  const robotLaborEarthPerMin = state.locationProductionPerMin?.earth?.labor ?? 0n;
  if (state.locationProductionPerMin?.earth) {
    state.locationProductionPerMin.earth.labor += laborPerMin;
  }
  state.laborPerMin = laborPerMin + robotLaborEarthPerMin;
  const apiDataPerMin = state.apiUnlocked ? mulB(state.apiUserCount, state.apiUserSynthRate) : 0n;
  state.synthDataRate = apiDataPerMin + dataPerMin;
  state.humanSalaryPerMin = humanSalaryPerMin;

  // --- Auto-Firing Logic ---
  // Recalculate expensePerMin from the fresh humanSalaryPerMin before checking
  state.expensePerMin = humanSalaryPerMin;

  // If expenses exceed income and funds can't cover even 1 minute of the deficit, fire workers
  const netDeficit = state.expensePerMin - state.incomePerMin;
  if (netDeficit > 0n && state.funds < netDeficit) {
    let salaryToCut = netDeficit;
    let anyFired = false;

    // Fire in reverse order of seniority (last jobs first)
    for (let i = JOB_ORDER.length - 1; i >= 0; i--) {
      const jobType = JOB_ORDER[i];
      const config = BALANCE.jobs[jobType];
      if (config.workerType !== 'human' || !config.salaryPerMin) continue;

      const pool = state.humanPools[jobType];
      if (pool.totalCount <= 0n) continue;

      // Ceiling division to get whole workers needed to cover salaryToCut
      const workersNeededCeil = scaleBigInt((salaryToCut + config.salaryPerMin - 1n) / config.salaryPerMin);
      const workersToFire = pool.totalCount < workersNeededCeil ? pool.totalCount : workersNeededCeil;
      
      if (workersToFire > 0n) {
        pool.totalCount -= workersToFire;
        salaryToCut -= mulB(workersToFire, config.salaryPerMin);
        anyFired = true;

        // Visual feedback
        document.dispatchEvent(new CustomEvent('flash-job', { detail: { jobType } }));
      }
      if (salaryToCut <= 0n) break;
    }

    if (anyFired) {
      // Refresh humanSalaryPerMin and expensePerMin for accurate UI
      let newHumanSalary = 0n;
      for (const jt of JOB_ORDER) {
        const pool = state.humanPools[jt];
        const jobConfig = BALANCE.jobs[jt];
        if (jobConfig.salaryPerMin) newHumanSalary += mulB(jobConfig.salaryPerMin, pool?.totalCount || 0n);
      }

      state.humanSalaryPerMin = newHumanSalary;
      state.expensePerMin = newHumanSalary;
    }
  }

  // Milestone flavor texts
  if (state.managerCount > 0n && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[2])) {
    state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[2]);
  }
  if (state.micMiniCount >= scaleBigInt(3n) && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_MIC_MINI[0])) {
    state.pendingFlavorTexts.push(FLAVOR_TEXTS_MIC_MINI[0]);
  }
}

/** Helper to update resource breakdown for UI. */
function updateBreakdown(state: GameState, config: any, jobType: string, rate: bigint, isHuman: boolean): void {
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
  nudgeAgents(state, scaleBigInt(1n));
  
  // Refresh stuck count for return value
  let after = 0n;
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

function removeAllFromJob(state: GameState, sourceJob: JobType): void {
  const targetPool = state.agentPools[sourceJob];
  const unassignedPool = state.agentPools['unassigned'];
  const count = targetPool.totalCount;

  if (count === 0n) return;

  // Bulk transfer (O(1))
  unassignedPool.totalCount += count;
  targetPool.totalCount = 0n;

  // Transfer idle count
  unassignedPool.idleCount += targetPool.idleCount;
  targetPool.idleCount = 0n;

  // Reset stuck count and aggregate progress
  targetPool.stuckCount = 0n;
  targetPool.aggregateProgress = 0n;

  // Reset samples
  for (let i = 0; i < 4; i++) {
    targetPool.samples.progress[i] = 0;
    targetPool.samples.stuck[i] = false;
  }
}

/** Assign N unassigned AI agents to a job (for bulk buy). */
export function assignAgentsToJob(state: GameState, targetJob: JobType, count: number): number {
  if (!canAssignAiAgent(state, targetJob)) return 0;

  const countB = toBigInt(count);
  const assignedCount = getTotalAssignedAgents(state);
  const availableSlots = state.activeAgentCount - assignedCount;

  const unassignedPool = state.agentPools['unassigned'];
  const targetPool = state.agentPools[targetJob];

  let toAssign = countB < availableSlots ? countB : availableSlots;
  toAssign = toAssign < unassignedPool.totalCount ? toAssign : unassignedPool.totalCount;
  
  if (toAssign <= 0n) return 0;

  // Bulk transfer (O(1))
  targetPool.totalCount += toAssign;
  unassignedPool.totalCount -= toAssign;

  // Transfer proportional idle count
  const idleToMove = (unassignedPool.idleCount * toAssign) / (unassignedPool.totalCount + toAssign);
  targetPool.idleCount += idleToMove;
  unassignedPool.idleCount -= idleToMove;

  return Math.floor(fromBigInt(toAssign));
}

/** Remove N AI agents from a job back to unassigned. */
export function removeAgentsFromJob(state: GameState, sourceJob: JobType, count: number): number {
  const countB = toBigInt(count);
  const targetPool = state.agentPools[sourceJob];
  const unassignedPool = state.agentPools['unassigned'];

  const toRemove = countB < targetPool.totalCount ? countB : targetPool.totalCount;
  if (toRemove <= 0n) return 0;

  // Bulk transfer (O(1))
  unassignedPool.totalCount += toRemove;
  targetPool.totalCount -= toRemove;

  // Transfer proportional idle count
  const idleToMove = (targetPool.idleCount * toRemove) / (targetPool.totalCount + toRemove);
  unassignedPool.idleCount += idleToMove;
  targetPool.idleCount -= idleToMove;

  // Update stuck count (can't have more stuck than total)
  if (targetPool.stuckCount > targetPool.totalCount) {
    targetPool.stuckCount = targetPool.totalCount;
  }

  return Math.floor(fromBigInt(toRemove));
}

// --- Human worker actions ---

/** Hire N human workers for a job (for bulk buy). */
export function hireHumanWorkers(state: GameState, jobType: JobType, count: number): number {
  const jobConfig = BALANCE.jobs[jobType];
  if (jobConfig.workerType !== 'human') return 0;
  if (state.intelligence < jobConfig.unlockAtIntel) return 0;

  const countB = BigInt(count);
  const hireCost = jobConfig.hireCost ?? 0n;
  
  // Calculate how many we can afford
  const affordable = hireCost > 0n ? state.funds / hireCost : countB;
  const toHire = countB < affordable ? countB : affordable;

  if (toHire <= 0n) return 0;

  state.funds -= toHire * hireCost;
  
  const pool = state.humanPools[jobType];
  const oldCount = pool.totalCount;
  pool.totalCount += toHire * scaleBigInt(1n);

  // Initialize samples if needed
  const oldNum = Math.floor(fromBigInt(oldCount));
  const newNum = Math.floor(fromBigInt(pool.totalCount));
  for (let i = oldNum; i < Math.min(newNum, 4); i++) {
    pool.samples.progress[i] = 0;
  }

  return Number(toHire);
}

/** Fire N human workers from a job. */
export function fireHumanWorkers(state: GameState, jobType: JobType, count: number): number {
  const countB = toBigInt(count);
  const pool = state.humanPools[jobType];
  const toFire = countB < pool.totalCount ? countB : pool.totalCount;
  pool.totalCount -= toFire;
  return Math.floor(fromBigInt(toFire));
}

export function buyRobotWorkers(state: GameState, count: number): number {
  const countB = toBigInt(count);
  if (countB <= 0n) return 0;
  if (!state.completedResearch.includes('robotics1')) return 0;

  const maxBuyable = toBigInt(BALANCE.robotWorkerBuyLimit);
  const owned = state.locationResources.earth.robots;
  const remaining = maxBuyable > owned ? (maxBuyable - owned) : 0n;
  if (remaining <= 0n) return 0;

  const cappedByLimit = countB < remaining ? countB : remaining;
  const unitCost = BALANCE.robotImportCost;
  const affordable = unitCost > 0n ? divB(state.funds, unitCost) : cappedByLimit;
  const toBuy = cappedByLimit < affordable ? cappedByLimit : affordable;
  if (toBuy <= 0n) return 0;

  state.funds -= mulB(toBuy, unitCost);
  state.locationResources.earth.robots += toBuy;
  return Math.floor(fromBigInt(toBuy));
}

export function fireRobotWorkers(state: GameState, count: number): number {
  const countB = toBigInt(count);
  if (countB <= 0n) return 0;

  const pool = state.locationResources.earth.robots;
  const toFire = countB < pool ? countB : pool;
  if (toFire <= 0n) return 0;

  state.locationResources.earth.robots -= toFire;
  return Math.floor(fromBigInt(toFire));
}


