import type { GameState } from '../GameState.ts';
import { BALANCE, TIER_ORDER, getIntelFromSubscriptions, getBestModel, getTotalGpuCapacity } from '../BalanceConfig.ts';
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
  // Calculate subscription expenses
  let totalExpensePerMin = 0;
  for (const tier of TIER_ORDER) {
    const count = state.subscriptions[tier];
    if (count > 0) {
      totalExpensePerMin += count * BALANCE.tiers[tier].costPerMin;
    }
  }

  // Add engineer expenses
  totalExpensePerMin += state.engineerExpensePerMin;

  state.expensePerMin = totalExpensePerMin;

  // Deduct costs
  const cost = totalExpensePerMin * (dtMs / 60000);
  state.funds -= cost;

  // Auto-cancel if funds reach 0
  if (state.funds <= 0) {
    state.funds = 0;
    cancelAllPaidSubs(state);
  }

  // Update intelligence from best active tier
  state.intelligence = getIntelFromSubscriptions(state.subscriptions);

  // Allocate CPU cores
  allocateCores(state);
}

// --- GPU Era ---

function tickGpuEra(state: GameState, dtMs: number): void {
  // Compute GPU metrics
  const model = getBestModel(state.gpuCount);
  state.currentModelIndex = BALANCE.models.indexOf(model);
  state.totalPflops = state.gpuCount * BALANCE.pflopsPerGpu * state.powerThrottle;
  state.instanceCount = Math.floor(state.totalPflops / model.pflopsPerInstance);
  state.intelligence = model.intel;
  state.freeCompute = state.totalPflops - (state.instanceCount * model.pflopsPerInstance);

  // GPU capacity check
  state.gpuCapacity = getTotalGpuCapacity(state.datacenters);
  state.needsDatacenter = state.gpuCount >= state.gpuCapacity;

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

  // Set active agents: limited by instances
  state.activeAgentCount = Math.min(state.agents.length, state.instanceCount);
  for (let i = 0; i < state.agents.length; i++) {
    state.agents[i].isIdle = i >= state.instanceCount;
  }
}

function cancelAllPaidSubs(state: GameState): void {
  for (const tier of TIER_ORDER) {
    if (tier === 'free') continue;
    state.subscriptions[tier] = 0;
  }
  state.agents = state.agents.filter(a => a.tier === 'free');
  state.expensePerMin = 0;
}

function allocateCores(state: GameState): void {
  const totalCores = state.cpuCoresTotal;
  let usedCores = 0;
  let activeCount = 0;

  const tierPriority: Record<SubscriptionTier, number> = {
    ultraProMax: 5,
    ultraMax: 4,
    ultra: 3,
    pro: 2,
    free: 1,
  };

  const sorted = [...state.agents].sort(
    (a, b) => tierPriority[b.tier] - tierPriority[a.tier]
  );

  for (const agent of state.agents) {
    agent.isIdle = true;
  }

  for (const agent of sorted) {
    const coresNeeded = BALANCE.tiers[agent.tier].coresPerAgent;
    if (usedCores + coresNeeded <= totalCores) {
      usedCores += coresNeeded;
      const actual = state.agents.find(a => a.id === agent.id);
      if (actual) {
        actual.isIdle = false;
        activeCount++;
      }
    }
  }

  state.usedCores = usedCores;
  state.activeAgentCount = activeCount;
}

// --- Actions ---

export function buySubscription(state: GameState, tier: SubscriptionTier): boolean {
  if (tier === 'free') return false;

  const config = BALANCE.tiers[tier];
  const coresNeeded = config.coresPerAgent;
  const availableCores = state.cpuCoresTotal - state.usedCores;

  if (availableCores < coresNeeded) return false;
  if (state.funds < config.costPerMin) return false;

  state.subscriptions[tier]++;

  const agent = {
    id: state.nextAgentId++,
    tier,
    progress: 0,
    isStuck: false,
    isIdle: false,
    taskTimeMs: BALANCE.jobs[state.bestJobType].timeMs,
  };
  state.agents.push(agent);

  if (tier === 'pro' && !state.milestones.firstProSub) {
    state.milestones.firstProSub = true;
  }
  if (tier === 'ultra' && !state.milestones.reachedUltra) {
    state.milestones.reachedUltra = true;
  }
  if (tier === 'ultraMax' && !state.milestones.reachedUltraMax) {
    state.milestones.reachedUltraMax = true;
  }
  if (tier === 'ultraProMax' && !state.milestones.reachedUltraProMax) {
    state.milestones.reachedUltraProMax = true;
  }

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

  // Cancel all subscriptions
  for (const tier of TIER_ORDER) {
    state.subscriptions[tier] = 0;
  }

  // Convert all agents to generic GPU-backed agents
  const newAgents = [];
  for (let i = 0; i < agentCount; i++) {
    newAgents.push({
      id: state.nextAgentId++,
      tier: 'free' as SubscriptionTier, // tier is irrelevant post-transition
      progress: 0,
      isStuck: false,
      isIdle: false,
      taskTimeMs: BALANCE.jobs[state.bestJobType].timeMs,
    });
  }
  state.agents = newAgents;

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
    state.agents.push({
      id: state.nextAgentId++,
      tier: 'free' as SubscriptionTier,
      progress: 0,
      isStuck: false,
      isIdle: false,
      taskTimeMs: BALANCE.jobs[state.bestJobType].timeMs,
    });
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
