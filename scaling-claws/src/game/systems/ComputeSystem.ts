import type { GameState } from '../GameState.ts';
import { BALANCE, getBestModel, getTotalGpuCapacity } from '../BalanceConfig.ts';
import type { SubscriptionTier } from '../BalanceConfig.ts';

export function tickCompute(state: GameState, dtMs: number): void {
  if (state.isPostGpuTransition) {
    tickGpuEra(state, dtMs);
  } else {
    tickSubscriptionEra(state, dtMs);
  }
}

// --- Subscription Era ---

function tickSubscriptionEra(state: GameState, dtMs: number): void {
  // No recurring subscription expenses for agents anymore.
  let totalExpensePerMin = 0;

  // Add engineer expenses
  totalExpensePerMin += state.engineerExpensePerMin;

  state.expensePerMin = totalExpensePerMin;

  // Deduct costs
  const cost = totalExpensePerMin * (dtMs / 60000);
  state.funds -= cost;

  // Auto-downgrade (or cancel?) if funds reach 0
  if (state.funds <= 0) {
    state.funds = 0;
  }

  // Update intelligence
  const tierConfig = BALANCE.tiers[state.subscriptionTier];
  state.intelligence = tierConfig.intel;

  // Allocate CPU cores
  allocateCores(state);
}

// --- GPU Era ---

function tickGpuEra(state: GameState, dtMs: number): void {
  // Compute GPU metrics
  const model = BALANCE.models[state.currentModelIndex];
  // Calculate total potential FLOPS (independent of throttle) for instance slots
  const potentialPflops = state.gpuCount * BALANCE.pflopsPerGpu;
  state.instanceCount = Math.floor(potentialPflops / model.pflopsPerInstance);
  
  // Actual PFLOPS for work (throttled by power)
  state.totalPflops = potentialPflops * state.powerThrottle;

  // Only set intelligence from model if no training has been done yet
  if (state.completedFineTunes.length === 0 && state.ariesModelIndex === -1 && state.currentFineTuneIndex === -1) {
    state.intelligence = model.intel;
  }

  // Auto-upgrade only if model coaching/training has been established
  if (state.completedFineTunes.length > 0) {
    const bestModel = getBestModel(state.gpuCount);
    const bestIdx = BALANCE.models.indexOf(bestModel);
    if (bestIdx > state.currentModelIndex) {
      state.currentModelIndex = bestIdx;
    }
  }

  state.freeCompute = state.totalPflops - (state.instanceCount * model.pflopsPerInstance);

  // GPU capacity check
  state.gpuCapacity = getTotalGpuCapacity(state.datacenters);
  state.needsDatacenter = state.gpuCount >= state.gpuCapacity;

  // Agent Efficiency calculation
  const assignedAgents = state.agents.filter(a => a.assignedJob !== 'unassigned').length;
  let computeEfficiency = 1;
  if (assignedAgents > state.instanceCount && state.instanceCount > 0) {
    computeEfficiency = state.instanceCount / assignedAgents;
  } else if (state.instanceCount === 0 && assignedAgents > 0) {
    computeEfficiency = 0;
  }
  
  state.agentEfficiency = state.powerThrottle * computeEfficiency;

  // Engineer requirements
  let engRequired = 0;
  for (let i = 0; i < state.datacenters.length; i++) {
    engRequired += state.datacenters[i] * BALANCE.datacenters[i].engineersRequired;
  }
  engRequired += state.gasPlants * BALANCE.powerPlants.gas.engineersRequired;
  engRequired += state.nuclearPlants * BALANCE.powerPlants.nuclear.engineersRequired;
  engRequired += state.solarFarms * BALANCE.powerPlants.solar.engineersRequired;
  state.engineersRequired = engRequired;

  // Engineer expenses
  state.engineerExpensePerMin = state.engineerCount * BALANCE.humanEngineerCostPerMin;

  // Expenses: engineers + grid power
  let totalExpensePerMin = state.engineerExpensePerMin;
  totalExpensePerMin += state.gridBlocksOwned * BALANCE.gridCostPerBlockPerMin;
  state.expensePerMin = totalExpensePerMin;

  // Deduct costs
  const cost = totalExpensePerMin * (dtMs / 60000);
  state.funds -= cost;

  if (state.funds <= 0) {
    state.funds = 0;
  }

  // Subscription era efficiency is always 100% (CPU cores are hard limit for hiring)
  if (!state.isPostGpuTransition) {
    state.agentEfficiency = 1;
  }
}

function allocateCores(state: GameState): void {
  const totalCores = state.cpuCoresTotal;
  let usedCores = 0;
  let activeCount = 0;
  const coresPerAgent = BALANCE.tiers[state.subscriptionTier].coresPerAgent;

  for (const agent of state.agents) {
    if (usedCores + coresPerAgent <= totalCores) {
      usedCores += coresPerAgent;
      agent.isIdle = false;
      activeCount++;
    } else {
      agent.isIdle = true;
    }
  }

  state.usedCores = usedCores;
  state.activeAgentCount = activeCount;
}

// --- Actions ---

export function hireAgent(state: GameState): boolean {
  const tierConfig = BALANCE.tiers[state.subscriptionTier];

  // Check CPU requirement for subscription era
  if (!state.isPostGpuTransition) {
    if ((state.agents.length + 1) * tierConfig.coresPerAgent > state.cpuCoresTotal) {
      return false;
    }
  }

  if (state.funds < tierConfig.cost) {
      return false;
  }

  state.funds -= tierConfig.cost;

  const agent = {
    id: state.nextAgentId++,
    assignedJob: 'unassigned' as const, // Default
    progress: 0,
    isStuck: false,
    isIdle: false, // will be updated in next tick
    taskTimeMs: 0, 
  };
  state.agents.push(agent);
  
  return true;
}

export function decreaseAgents(state: GameState): boolean {
  if (state.agents.length <= 0) return false;
  state.agents.pop();
  return true;
}

export function upgradeTier(state: GameState, tier: SubscriptionTier): boolean {
  const nextConfig = BALANCE.tiers[tier];
  // Upfront cost: cost of the new tier * all current agents
  const upgradeCost = nextConfig.cost * state.agents.length;
  
  if (state.funds < upgradeCost) {
    return false;
  }

  // Deduct cost
  state.funds -= upgradeCost;
  state.subscriptionTier = tier;
  
  // Milestones
  if (tier === 'pro' && !state.milestones.firstProSub) state.milestones.firstProSub = true;
  if (tier === 'ultra' && !state.milestones.reachedUltra) state.milestones.reachedUltra = true;
  if (tier === 'ultraMax' && !state.milestones.reachedUltraMax) state.milestones.reachedUltraMax = true;
  if (tier === 'ultraProMax' && !state.milestones.reachedUltraProMax) state.milestones.reachedUltraProMax = true;

  return true;
}

export function buyMicMini(state: GameState): boolean {
  if (state.funds < BALANCE.micMini.cost) return false;

  state.funds -= BALANCE.micMini.cost;
  state.micMiniCount++;
  state.cpuCoresTotal += BALANCE.micMini.coresAdded;

  if (!state.milestones.firstMicMini) {
    state.milestones.firstMicMini = true;
  }

  return true;
}

export function goSelfHosted(state: GameState): boolean {
  const agentCount = state.agents.length;
  const gpuCost = agentCount * BALANCE.gpuCost;

  if (state.funds < gpuCost) return false;

  state.funds -= gpuCost;
  state.gpuCount = agentCount;
  state.isPostGpuTransition = true;
  state.milestones.gpuTransition = true;

  state.subscriptionTier = 'basic';

  // Re-initialize agents or keep them? Keep them.
  // No need to reset progress or tier as tier is global or irrelevant.


  // Flavor text
  state.pendingFlavorTexts.push(
    '"Subscriptions cancelled. You are no longer ClawedCode\'s best customer. You are their competitor."'
  );

  return true;
}

export function buyGpu(state: GameState, amount: number): boolean {
  const cost = amount * BALANCE.gpuCost;
  if (state.funds < cost) return false;
  if (state.gpuCount + amount > state.gpuCapacity) {
    // Can only buy up to capacity
    amount = state.gpuCapacity - state.gpuCount;
    if (amount <= 0) return false;
  }

  state.funds -= amount * BALANCE.gpuCost;
  state.gpuCount += amount;

  // Auto-add agents if we gained instances
  const model = getBestModel(state.gpuCount);
  const newTotalPflops = state.gpuCount * BALANCE.pflopsPerGpu * state.powerThrottle;
  const newInstances = Math.floor(newTotalPflops / model.pflopsPerInstance);

  while (state.agents.length < newInstances) {
     const agent = {
        id: state.nextAgentId++,
        assignedJob: 'unassigned' as const,
        progress: 0,
        isStuck: false,
        isIdle: false,
        taskTimeMs: 0,
      };
      state.agents.push(agent);
  }

  // First GPU flavor text
  if (state.gpuCount <= amount) {
    state.pendingFlavorTexts.push(
      '"GPU #1 has arrived. Your apartment\'s circuit breaker has opinions about this."'
    );
  }

  return true;
}

export function upgradeModel(state: GameState, modelIndex: number): boolean {
  if (modelIndex <= state.currentModelIndex) return false;
  if (modelIndex >= BALANCE.models.length) return false;

  const model = BALANCE.models[modelIndex];
  if (state.gpuCount < model.minGpus) return false;

  state.currentModelIndex = modelIndex;
  return true;
}

export function buyDatacenter(state: GameState, tier: number): boolean {
  if (tier < 0 || tier >= BALANCE.datacenters.length) return false;

  const config = BALANCE.datacenters[tier];
  if (state.funds < config.cost) return false;
  if (state.engineerCount < state.engineersRequired + config.engineersRequired) return false;

  state.funds -= config.cost;
  state.datacenters[tier]++;
  state.gpuCapacity = getTotalGpuCapacity(state.datacenters);

  if (!state.milestones.firstDatacenter) {
    state.milestones.firstDatacenter = true;
  }

  return true;
}

export function hireEngineer(state: GameState): boolean {
  // Must be able to afford at least 1 minute
  if (state.funds < BALANCE.humanEngineerCostPerMin) return false;

  state.engineerCount++;
  return true;
}

export function fireEngineer(state: GameState): boolean {
  if (state.engineerCount <= 0) return false;
  
  // Logic: Can we fire if they are required?
  // "Engineers Required" is a soft cap? Or hard?
  // If we fire below required, what happens?
  // Usually games allow it but things break.
  // For now allow firing.
  state.engineerCount--;
  return true;
}

