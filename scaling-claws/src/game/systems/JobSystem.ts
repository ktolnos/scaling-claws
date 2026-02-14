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

export function tickJobs(state: GameState, dtMs: number): void {
  const intel = state.intelligence;
  
  // 1. Check for job unlocks
  // Display the job whenever the requirement for the previous job in the list is satisfied.
  for (let i = 0; i < JOB_ORDER.length; i++) {
    const jobType = JOB_ORDER[i];
    if (state.unlockedJobs.includes(jobType)) continue;

    const jobConfig = BALANCE.jobs[jobType];

    // Progression logic: unlock job[i] if intel >= job[i-1].intelReq
    let shouldUnlock = false;
    if (i === 0) {
      // First job unlocks by its own intel requirement
      if (intel >= jobConfig.intelReq) {
        shouldUnlock = true;
      }
    } else {
      const prevJobType = JOB_ORDER[i - 1];
      const prevJobConfig = BALANCE.jobs[prevJobType];
      if (intel >= prevJobConfig.intelReq) {
        shouldUnlock = true;
      }
    }

    // Special Engineer unlock logic (datacenter transition)
    if (jobType === 'engineer' && state.isPostGpuTransition) {
      shouldUnlock = true;
    }

    if (shouldUnlock) {
      state.unlockedJobs.push(jobType);
    }
  }

  // Stuck rate depends on intel
  const stuckRate = getStuckRate(intel);

  // Manager auto-nudge budget for this tick
  let managerNudgeBudget = state.managerCount * BALANCE.managerNudgesPerMin * (dtMs / 60000);
  managerNudgeBudget += state.managerSquaredCount * BALANCE.managerSquaredNudgesPerMin * (dtMs / 60000);

  let stuckCount = 0;
  let completedThisTick = 0;
  let incomeThisTick = 0;

  for (const agent of state.agents) {
    if (agent.isIdle) {
      continue;
    }

    const jobConfig = BALANCE.jobs[agent.assignedJob];
    if (jobConfig.timeMs <= 0) {
      continue;
    }

    if (agent.isStuck) {
      // Try manager auto-nudge
      if (managerNudgeBudget >= 1) {
        agent.isStuck = false;
        managerNudgeBudget -= 1;
      } else {
        stuckCount++;
        continue;
      }
    }

    // Advance progress
    const taskTime = agent.taskTimeMs;
    // Note: taskTimeMs is stored on agent, but should it be updated if job changes?
    // Yes, assignJob updates it.
    
    // Scale progress by efficiency and intelligence relative to requirement
    const intelScale = state.intelligence / (jobConfig.intelReq || 1);
    agent.progress += (dtMs / taskTime) * state.agentEfficiency * intelScale;

    // Task complete
    if (agent.progress >= 1) {
      const completions = Math.floor(agent.progress);
      agent.progress -= completions;
      completedThisTick += completions;
      incomeThisTick += jobConfig.reward * completions;

      state.completedTasks += completions;
      state.totalEarned += jobConfig.reward * completions;

      // First task milestone
      if (!state.milestones.firstTaskComplete) {
        state.milestones.firstTaskComplete = true;
        state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[0]);
      }

      // Roll for stuck on new task
      if (Math.random() < stuckRate) {
        agent.isStuck = true;
        stuckCount++;
        // Flavor text for first stuck
        if (state.completedTasks < 5 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[1])) {
          state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[1]);
        }
      }

      // Ensure taskTimeMs is current (in case balance changed or job changed mid-tick?)
      agent.taskTimeMs = jobConfig.timeMs;
    }
  }

  state.stuckCount = stuckCount;

  // Calculate income per minute based on CURRENT assignments
  // Sum up (reward * 60000/time) for each active agent
  let currentIncomePerMin = 0;
  for (const agent of state.agents) {
    if (!agent.isIdle && !agent.isStuck) {
       const jobConf = BALANCE.jobs[agent.assignedJob];
       if (jobConf.timeMs > 0) {
         currentIncomePerMin += jobConf.reward * (60000 / jobConf.timeMs);
       }
    }
  }
  state.incomePerMin = currentIncomePerMin;

  // Add earned income
  state.funds += incomeThisTick;

  // Milestone flavor texts
  if (state.managerCount > 0 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_EARLY[2])) {
    state.pendingFlavorTexts.push(FLAVOR_TEXTS_EARLY[2]);
  }
  if (state.micMiniCount >= 3 && !state.shownFlavorTexts.includes(FLAVOR_TEXTS_MIC_MINI[0])) {
    state.pendingFlavorTexts.push(FLAVOR_TEXTS_MIC_MINI[0]);
  }
}

export function nudgeAgent(state: GameState): boolean {
  for (const agent of state.agents) {
    if (agent.isStuck && !agent.isIdle) {
      agent.isStuck = false;
      return true;
    }
  }
  return false;
}

// Actions

export function setAgentJob(state: GameState, agentId: number, jobType: JobType): boolean {
  const agent = state.agents.find(a => a.id === agentId);
  if (!agent) return false;
  
  // Check unlock
  if (!state.unlockedJobs.includes(jobType)) return false;

  // Check agent requirements (Intel/Research)
  const jobConfig = BALANCE.jobs[jobType];
  if (state.intelligence < jobConfig.intelReq) return false;
  if (jobConfig.agentIntelReq && state.intelligence < jobConfig.agentIntelReq) return false;
  if (jobConfig.agentResearchReq) {
    for (const req of jobConfig.agentResearchReq) {
      if (!state.completedResearch.includes(req)) return false;
    }
  }

  if (agent.assignedJob !== jobType) {
    agent.assignedJob = jobType;
    agent.progress = 0;
    agent.isStuck = false;
    agent.taskTimeMs = BALANCE.jobs[jobType].timeMs;
  }
  return true;
}

export function setAllAgentsJob(state: GameState, jobType: JobType): boolean {
  if (!state.unlockedJobs.includes(jobType)) return false;
  
  const jobConfig = BALANCE.jobs[jobType];
  if (state.intelligence < jobConfig.intelReq) return false;
  if (jobConfig.agentIntelReq && state.intelligence < jobConfig.agentIntelReq) return false;
  if (jobConfig.agentResearchReq) {
    for (const req of jobConfig.agentResearchReq) {
      if (!state.completedResearch.includes(req)) return false;
    }
  }
  
  for (const agent of state.agents) {
    if (agent.assignedJob !== jobType) {
      agent.assignedJob = jobType;
      agent.progress = 0;
      agent.isStuck = false;
      agent.taskTimeMs = BALANCE.jobs[jobType].timeMs;
    }
  }
  return true;
}



export function incrementJobAssignments(state: GameState, targetJob: JobType): boolean {
   if (!state.unlockedJobs.includes(targetJob)) return false;
   
   const jobConfig = BALANCE.jobs[targetJob];
   if (state.intelligence < jobConfig.intelReq) return false;
   if (jobConfig.agentIntelReq && state.intelligence < jobConfig.agentIntelReq) return false;
   if (jobConfig.agentResearchReq) {
     for (const req of jobConfig.agentResearchReq) {
       if (!state.completedResearch.includes(req)) return false;
     }
   }

   // Find agent on UNASSIGNED job.
   const candidate = state.agents.find(a => a.assignedJob === 'unassigned');
   if (!candidate) return false;

   candidate.assignedJob = targetJob;
   candidate.progress = 0;
   candidate.isStuck = false;
   candidate.taskTimeMs = BALANCE.jobs[targetJob].timeMs;
   return true;
}

export function decrementJobAssignments(state: GameState, sourceJob: JobType): boolean {
   // Find agent on this job.
   const candidate = state.agents.find(a => a.assignedJob === sourceJob);
   if (!candidate) return false;

   candidate.assignedJob = 'unassigned';
   candidate.progress = 0;
   candidate.isStuck = false;
   candidate.taskTimeMs = 0;
   return true;
}

export function assignAllToJob(state: GameState, targetJob: JobType): void {
  if (!state.unlockedJobs.includes(targetJob)) return;

  const jobConfig = BALANCE.jobs[targetJob];
  if (state.intelligence < jobConfig.intelReq) return;
  if (jobConfig.agentIntelReq && state.intelligence < jobConfig.agentIntelReq) return;
  if (jobConfig.agentResearchReq) {
    for (const req of jobConfig.agentResearchReq) {
      if (!state.completedResearch.includes(req)) return;
    }
  }

  for (const agent of state.agents) {
    if (agent.assignedJob === 'unassigned') {
      agent.assignedJob = targetJob;
      agent.progress = 0;
      agent.isStuck = false;
      agent.taskTimeMs = BALANCE.jobs[targetJob].timeMs;
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

