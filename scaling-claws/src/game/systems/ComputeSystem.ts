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

function tickSubscriptionEra(state: GameState, _dtMs: number): void {
  // Human salary expenses (from jobs)
  state.expensePerMin = state.humanSalaryPerMin;

  // Update intelligence
  const tierConfig = BALANCE.tiers[state.subscriptionTier];
  state.intelligence = tierConfig.intel;

  // Allocate CPU cores
  allocateCores(state);
}

// --- GPU Era ---

function tickGpuEra(state: GameState, dtMs: number): void {
  // Compute GPU metrics (apply GPU architecture research bonus)
  state.totalPflops = state.gpuCount * BALANCE.pflopsPerGpu * state.gpuFlopsBonus * state.powerThrottle;

  // Only set intelligence from model if no training has been done yet
  if (state.completedFineTunes.length === 0 && state.ariesModelIndex === -1 && state.currentFineTuneIndex === -1) {
    const model = BALANCE.models[state.currentModelIndex];
    state.intelligence = model.intel;
  }

  // Auto-upgrade model
  if (state.completedFineTunes.length > 0) {
    const bestModel = getBestModel(state.gpuCount);
    const bestIdx = BALANCE.models.indexOf(bestModel);
    if (bestIdx > state.currentModelIndex) {
      state.currentModelIndex = bestIdx;
    }
  }

  // Allocation Logic (Percentages)
  const trainingPct = state.trainingAllocationPct;
  const inferencePct = state.apiInferenceAllocationPct;
  // Constraint check (just in case they got out of sync, though setters should prevent this)
  // const totalAllocatedPct = Math.min(100, trainingPct + inferencePct);
  
  state.trainingAllocatedPflops = Math.floor(state.totalPflops * (trainingPct / 100));
  state.apiReservedPflops = Math.floor(state.totalPflops * (inferencePct / 100));
  
  // Calculate "Rest" of compute (available for Agents and Synth Data)
  const restPflops = Math.max(0, state.totalPflops - state.trainingAllocatedPflops - state.apiReservedPflops);
  state.freeCompute = restPflops; 

  // Synth Data consumes from this rest
  if (state.synthDataUnlocked && state.synthDataAllocPflops > restPflops) {
    state.synthDataAllocPflops = restPflops;
  }
  // If not unlocked, force 0
  if (!state.synthDataUnlocked) {
    state.synthDataAllocPflops = 0;
  }

  const agentsAllocatedPflops = Math.max(0, restPflops - state.synthDataAllocPflops);

  // GPU capacity check
  state.gpuCapacity = getTotalGpuCapacity(state.datacenters);
  state.needsDatacenter = state.gpuCount >= state.gpuCapacity;

  // Agent Efficiency
  // 1 Agent requires 1 GPU worth of compute (pflopsPerGpu) to run at 100% efficiency
  state.activeAgentCount = Math.floor(agentsAllocatedPflops / BALANCE.pflopsPerGpu);
  
  const assignedAgents = state.agents.filter(a => a.assignedJob !== 'unassigned').length;
  const pflopsNeeded = assignedAgents * BALANCE.pflopsPerGpu;
  
  let computeEfficiency = 1;
  if (pflopsNeeded > 0) {
     computeEfficiency = Math.min(1, agentsAllocatedPflops / pflopsNeeded);
  }

  state.agentEfficiency = state.powerThrottle * computeEfficiency;

  // Labor consumption from facilities
  let laborConsumedPerMin = 0;
  for (let i = 0; i < state.datacenters.length; i++) {
    laborConsumedPerMin += state.datacenters[i] * BALANCE.datacenters[i].laborPerMin;
  }
  laborConsumedPerMin += state.gasPlants * BALANCE.powerPlants.gas.laborPerMin;
  laborConsumedPerMin += state.nuclearPlants * BALANCE.powerPlants.nuclear.laborPerMin;
  laborConsumedPerMin += state.solarFarms * BALANCE.powerPlants.solar.laborPerMin;
  laborConsumedPerMin += state.waferFabs * BALANCE.fabLaborPerMin;
  laborConsumedPerMin += state.siliconMines * BALANCE.siliconMineLaborPerMin;
  laborConsumedPerMin += state.robotFactories * BALANCE.robotFactoryLaborPerMin;
  state.laborConsumedPerMin = laborConsumedPerMin;

  // Deduct labor
  state.labor -= laborConsumedPerMin * (dtMs / 60000);
  if (state.labor < 0) state.labor = 0;

  // API Services
  if (state.apiUnlocked) {
    // Demand calculation (Economics based)
    // Quality = API improvement multiplier * model intelligence
    const totalQuality = state.apiQuality * state.intelligence;
    const effectiveAwareness = BALANCE.apiBaseAwareness + state.apiAwareness;
    
    // Demand = (Awareness) * (Quality^a / Price^b) * Scale
    const demand = effectiveAwareness * 
      (Math.pow(totalQuality, BALANCE.apiQualityElasticity) / 
       Math.pow(state.apiPrice, BALANCE.apiPriceElasticity)) * 
      BALANCE.apiDemandScale;
    
    state.apiDemand = Math.floor(demand);

    // Reserved PFLOPS based on allocation (already calculated above)
    // state.apiReservedPflops = ... 
    
    // Available capacity for users
    const capacityUsers = Math.floor(state.apiReservedPflops / BALANCE.apiPflopsPerUser);

    // Active users limited by demand and capacity
    state.apiUserCount = Math.min(state.apiDemand, capacityUsers);

    // Income
    state.apiIncomePerMin = state.apiUserCount * state.apiPrice * 60; 
    
    state.funds += state.apiIncomePerMin * (dtMs / 60000);
  }

  // Expenses: human salaries + grid power
  let totalExpensePerMin = state.humanSalaryPerMin;
  totalExpensePerMin += state.gridBlocksOwned * BALANCE.gridCostPerBlockPerMin;
  state.expensePerMin = totalExpensePerMin;

  // Deduct costs
  const cost = totalExpensePerMin * (dtMs / 60000);
  state.funds -= cost;

  if (state.funds <= 0) {
    state.funds = 0;
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

  // Check hardware capacity
  if (!state.isPostGpuTransition) {
    if ((state.agents.length + 1) * tierConfig.coresPerAgent > state.cpuCoresTotal) {
      return false;
    }
  } else {
    if (state.agents.length >= state.gpuCount) {
      return false;
    }
  }

  if (state.funds < tierConfig.cost) {
    return false;
  }

  state.funds -= tierConfig.cost;

  const agent = {
    id: state.nextAgentId++,
    assignedJob: 'unassigned' as const,
    progress: 0,
    isStuck: false,
    isIdle: false,
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
  const upgradeCost = nextConfig.cost * state.agents.length;

  if (state.funds < upgradeCost) {
    return false;
  }

  state.funds -= upgradeCost;
  state.subscriptionTier = tier;

  return true;
}

export function buyMicMini(state: GameState): boolean {
  if (state.funds < BALANCE.micMini.cost) return false;

  state.funds -= BALANCE.micMini.cost;
  state.micMiniCount++;
  state.cpuCoresTotal += BALANCE.micMini.coresAdded;

  return true;
}

export function goSelfHosted(state: GameState): boolean {
  const agentCount = state.agents.length;
  const gpuCost = agentCount * BALANCE.gpuCost;

  if (state.funds < gpuCost) return false;

  state.funds -= gpuCost;
  state.gpuCount = agentCount;
  state.isPostGpuTransition = true;

  state.subscriptionTier = 'basic';

  state.pendingFlavorTexts.push(
    '"Subscriptions cancelled. You are no longer ClawedCode\'s best customer. You are their competitor."'
  );

  return true;
}

export function buyGpu(state: GameState, amount: number): boolean {
  const cost = amount * BALANCE.gpuCost;
  if (state.funds < cost) return false;
  if (state.gpuCount + amount > state.gpuCapacity) {
    amount = state.gpuCapacity - state.gpuCount;
    if (amount <= 0) return false;
  }

  state.funds -= amount * BALANCE.gpuCost;
  state.gpuCount += amount;

  // Auto-add agents for new GPUs
  while (state.agents.length < state.gpuCount) {
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
  if (state.labor < config.laborCost) return false;

  state.funds -= config.cost;
  state.labor -= config.laborCost;
  state.datacenters[tier]++;
  state.gpuCapacity = getTotalGpuCapacity(state.datacenters);

  return true;
}

// --- API Actions ---

export function setApiPrice(state: GameState, price: number): void {
  // Price is in $, can go from very low to high
  state.apiPrice = Math.max(0.1, Math.round(price * 10) / 10);
}

export function buyAds(state: GameState): boolean {
  if (state.funds < BALANCE.apiAdCost) return false;
  state.funds -= BALANCE.apiAdCost;
  state.apiAwareness += BALANCE.apiAdAwarenessBoost;
  return true;
}

export function setApiAllocation(state: GameState, pct: number): boolean {
  const newPct = Math.max(0, Math.min(100, pct));
  const trainingPct = state.trainingAllocationPct;
  
  if (newPct + trainingPct > 100) {
    return false;
  }
  
  state.apiInferenceAllocationPct = newPct;
  return true;
}

export function improveApi(state: GameState): boolean {
  const nextLevel = state.apiImprovementLevel + 1;
  if (nextLevel >= BALANCE.apiImprovementTiers.length) return false;

  const tier = BALANCE.apiImprovementTiers[nextLevel];
  if (state.code < tier.cost) return false;

  state.code -= tier.cost;
  state.apiImprovementLevel = nextLevel;
  state.apiQuality = tier.multiplier;
  
  return true;
}

export function unlockApi(state: GameState): boolean {
  if (state.apiUnlocked) return false;
  if (state.intelligence < BALANCE.apiUnlockIntel) return false;
  if (state.code < BALANCE.apiUnlockCode) return false;

  state.code -= BALANCE.apiUnlockCode;
  state.apiUnlocked = true;
  return true;
}
