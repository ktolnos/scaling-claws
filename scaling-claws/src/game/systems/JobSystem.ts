import type { GameState } from '../GameState.ts';
import { BALANCE, getBestJobType, getStuckRate } from '../BalanceConfig.ts';

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
  const bestJob = getBestJobType(intel);
  state.bestJobType = bestJob;
  const jobConfig = BALANCE.jobs[bestJob];
  const stuckRate = getStuckRate(intel);

  // Manager auto-nudge budget for this tick
  let managerNudgeBudget = state.managerCount * BALANCE.managerNudgesPerMin * (dtMs / 60000);
  // Manager² auto-nudge managers (simplified: they provide additional nudges)
  managerNudgeBudget += state.managerSquaredCount * BALANCE.managerSquaredNudgesPerMin * (dtMs / 60000);

  let stuckCount = 0;
  let completedThisTick = 0;
  let incomeThisTick = 0;

  for (const agent of state.agents) {
    if (agent.isIdle) {
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
    agent.progress += dtMs / taskTime;

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

      // Update task time for current best job
      agent.taskTimeMs = jobConfig.timeMs;
    }
  }

  state.stuckCount = stuckCount;

  // Calculate income per minute from job completions
  const activeWorking = state.agents.filter(a => !a.isIdle && !a.isStuck).length;
  const avgCompletionsPerMin = activeWorking * (60000 / jobConfig.timeMs);
  state.incomePerMin = avgCompletionsPerMin * jobConfig.reward;

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
