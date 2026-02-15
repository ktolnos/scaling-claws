import type { GameState } from '../GameState.ts';
import { getTotalAssignedAgents } from '../GameState.ts';
import { BALANCE, getBestModel, getTotalGpuCapacity, JOB_ORDER } from '../BalanceConfig.ts';
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
  
  if (state.humanSalaryPerMin > 0) {
    state.resourceBreakdown.funds.expense.push({ label: 'Human Salaries', ratePerMin: state.humanSalaryPerMin });
  }

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
  const inferencePct = state.apiUnlocked ? state.apiInferenceAllocationPct : 0;
  // Constraint check (just in case they got out of sync, though setters should prevent this)
  // const totalAllocatedPct = Math.min(100, trainingPct + inferencePct);
  
  state.trainingAllocatedPflops = Math.floor(state.totalPflops * (trainingPct / 100));
  state.apiReservedPflops = Math.floor(state.totalPflops * (inferencePct / 100));
  
  // Calculate "Rest" of compute (available for Agents and Synth Data)
  const restPflops = Math.max(0, state.totalPflops - state.trainingAllocatedPflops - state.apiReservedPflops);
  state.freeCompute = restPflops; 

  const agentsAllocatedPflops = restPflops;

  // Poplate Compute Breakdown
  if (state.trainingAllocatedPflops > 0) {
    state.resourceBreakdown.compute.push({ label: 'Training', pflops: state.trainingAllocatedPflops });
  }
  if (state.apiReservedPflops > 0) {
    state.resourceBreakdown.compute.push({ label: 'API Services', pflops: state.apiReservedPflops });
  }
  if (agentsAllocatedPflops > 0) {
    state.resourceBreakdown.compute.push({ label: 'AI Agents', pflops: agentsAllocatedPflops });
  }

  // GPU capacity check
  state.gpuCapacity = getTotalGpuCapacity(state.datacenters);
  state.needsDatacenter = state.gpuCount >= state.gpuCapacity;

  // Allocate GPU slots to agent pools
  allocateGpuSlots(state, agentsAllocatedPflops);

  // Agent Efficiency
  // 1 Agent requires 1 GPU worth of compute (pflopsPerGpu) to run at 100% efficiency
  const assignedAgents = getTotalAssignedAgents(state);
  const pflopsNeeded = assignedAgents * BALANCE.pflopsPerGpu;
  
  let computeEfficiency = 1;
  if (pflopsNeeded > 0) {
     computeEfficiency = Math.min(1, agentsAllocatedPflops / pflopsNeeded);
  }

  state.agentEfficiency = state.powerThrottle * computeEfficiency;

  // Labor consumption from facilities
  let laborConsumedPerMin = 0;
  for (let i = 0; i < state.datacenters.length; i++) {
    const rate = state.datacenters[i] * BALANCE.datacenters[i].laborPerMin;
    if (rate > 0) {
      laborConsumedPerMin += rate;
      state.resourceBreakdown.labor.expense.push({ label: BALANCE.datacenters[i].name, ratePerMin: rate });
    }
  }
  
  const facilityLabor = [
    { label: 'Gas Plants', count: state.gasPlants, rate: BALANCE.powerPlants.gas.laborPerMin },
    { label: 'Nuclear Plants', count: state.nuclearPlants, rate: BALANCE.powerPlants.nuclear.laborPerMin },
    { label: 'Solar Farms', count: state.solarFarms, rate: BALANCE.powerPlants.solar.laborPerMin },
    { label: 'Chip Fabs', count: state.waferFabs, rate: BALANCE.fabLaborPerMin },
    { label: 'Silicon Mines', count: state.siliconMines, rate: BALANCE.siliconMineLaborPerMin },
    { label: 'Robot Factories', count: state.robotFactories, rate: BALANCE.robotFactoryLaborPerMin },
  ];

  for (const f of facilityLabor) {
    if (f.count > 0) {
      const totalRate = f.count * f.rate;
      laborConsumedPerMin += totalRate;
      state.resourceBreakdown.labor.expense.push({ label: f.label, ratePerMin: totalRate });
    }
  }
  state.laborConsumedPerMin = laborConsumedPerMin;

  // Deduct labor
  state.labor -= laborConsumedPerMin * (dtMs / 60000);
  if (state.labor < 0) state.labor = 0;

  // API Services
  if (state.apiUnlocked) {
    // Demand calculation (Economics based)
    // Quality = API improvement multiplier * model intelligence
    const effectiveAwareness = BALANCE.apiBaseAwareness + state.apiAwareness;
    
    // Demand = (Awareness) * (Quality^a / Price^b) * Scale
    const demand = effectiveAwareness * state.apiQuality *
      (Math.pow(state.intelligence, BALANCE.intelligenceElasticity) / 
       Math.pow(state.apiPrice, BALANCE.apiPriceElasticity)) * 
      BALANCE.apiDemandScale;
    
    state.apiDemand = Math.floor(demand);

    // Reserved PFLOPS based on allocation (already calculated above)
    // state.apiReservedPflops = ... 
    
    // Available capacity for users
    const capacityUsers = Math.floor(state.apiReservedPflops / BALANCE.apiPflopsPerUser);

    // Active users limited by demand and capacity
    state.apiUserCount = Math.min(state.apiDemand, capacityUsers);

    // Synth Data from API users
    state.synthDataRate = state.apiUserCount * state.apiUserSynthRate;
    state.trainingData += state.synthDataRate * (dtMs / 60000);

    // Income
    state.apiIncomePerMin = state.apiUserCount * state.apiPrice; 
    
    if (state.apiIncomePerMin > 0) {
      state.resourceBreakdown.funds.income.push({ label: 'API Services', ratePerMin: state.apiIncomePerMin });
    }

    state.funds += state.apiIncomePerMin * (dtMs / 60000);
    state.totalEarned += state.apiIncomePerMin * (dtMs / 60000);
  } else {
    state.synthDataRate = 0;
  }

  // Expenses: human salaries + grid power
  if (state.humanSalaryPerMin > 0) {
    state.resourceBreakdown.funds.expense.push({ label: 'Human Salaries', ratePerMin: state.humanSalaryPerMin });
  }

  let totalExpensePerMin = state.humanSalaryPerMin;
  const gridCost = state.gridPowerKW * BALANCE.gridPowerCostPerKWPerMin;
  if (gridCost > 0) {
    totalExpensePerMin += gridCost;
    state.resourceBreakdown.funds.expense.push({ label: 'Grid Power', ratePerMin: gridCost });
  }
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
  const coresPerAgent = BALANCE.tiers[state.subscriptionTier].coresPerAgent;
  const maxAgents = Math.floor(totalCores / coresPerAgent);

  let remainingSlots = maxAgents;

  // Allocate by job priority (O(job types))
  for (const jobType of JOB_ORDER) {
    const pool = state.agentPools[jobType];
    if (!pool) continue;

    if (remainingSlots >= pool.totalCount) {
      // All agents in this job get cores
      pool.idleCount = 0;
      remainingSlots -= pool.totalCount;
    } else {
      // Partial allocation
      pool.idleCount = pool.totalCount - remainingSlots;
      remainingSlots = 0;
      break;
    }
  }

  // Also allocate remaining slots to unassigned pool
  const unassignedPool = state.agentPools['unassigned'];
  if (remainingSlots >= unassignedPool.totalCount) {
    unassignedPool.idleCount = 0;
    remainingSlots -= unassignedPool.totalCount;
  } else {
    unassignedPool.idleCount = unassignedPool.totalCount - remainingSlots;
    remainingSlots = 0;
  }

  const allocatedAgents = maxAgents - remainingSlots;
  state.usedCores = allocatedAgents * coresPerAgent;
  state.activeAgentCount = allocatedAgents;
}

function allocateGpuSlots(state: GameState, agentsAllocatedPflops: number): void {
  // In GPU era, agents are limited by available PFLOPS
  const maxActiveAgents = Math.floor(agentsAllocatedPflops / BALANCE.pflopsPerGpu);

  let remainingSlots = maxActiveAgents;

  // Allocate by job priority (O(job types))
  for (const jobType of JOB_ORDER) {
    const pool = state.agentPools[jobType];
    if (!pool) continue;

    if (remainingSlots >= pool.totalCount) {
      // All agents in this job get GPU slots
      pool.idleCount = 0;
      remainingSlots -= pool.totalCount;
    } else {
      // Partial allocation
      pool.idleCount = pool.totalCount - remainingSlots;
      remainingSlots = 0;
      break;
    }
  }

  // Also allocate remaining slots to unassigned pool
  const unassignedPool = state.agentPools['unassigned'];
  if (remainingSlots >= unassignedPool.totalCount) {
    unassignedPool.idleCount = 0;
    remainingSlots -= unassignedPool.totalCount;
  } else {
    unassignedPool.idleCount = unassignedPool.totalCount - remainingSlots;
    remainingSlots = 0;
  }

  state.activeAgentCount = maxActiveAgents - remainingSlots;
}

// --- Actions ---

export function hireAgent(state: GameState): boolean {
  const tierConfig = BALANCE.tiers[state.subscriptionTier];

  // Check hardware capacity
  if (!state.isPostGpuTransition) {
    if ((state.totalAgents + 1) * tierConfig.coresPerAgent > state.cpuCoresTotal) {
      return false;
    }
  } else {
    if (state.totalAgents >= state.gpuCount) {
      return false;
    }
  }

  if (state.funds < tierConfig.cost) {
    return false;
  }

  state.funds -= tierConfig.cost;

  // Add to unassigned pool (O(1))
  const unassignedPool = state.agentPools['unassigned'];
  unassignedPool.totalCount++;
  state.totalAgents++;

  // Initialize sample agents if this is one of the first 4
  if (unassignedPool.totalCount <= 4) {
    const idx = unassignedPool.totalCount - 1;
    unassignedPool.samples.progress[idx] = 0;
    unassignedPool.samples.stuck[idx] = false;
  }

  return true;
}

export function decreaseAgents(state: GameState): boolean {
  if (state.totalAgents <= 0) return false;

  // Remove from unassigned pool (O(1))
  const unassignedPool = state.agentPools['unassigned'];
  if (unassignedPool.totalCount > 0) {
    unassignedPool.totalCount--;
    state.totalAgents--;

    // Clear sample if we removed one of the displayed agents
    if (unassignedPool.totalCount < 4) {
      unassignedPool.samples.progress[unassignedPool.totalCount] = 0;
      unassignedPool.samples.stuck[unassignedPool.totalCount] = false;
    }

    return true;
  }

  return false;
}

export function upgradeTier(state: GameState, tier: SubscriptionTier): boolean {
  const nextConfig = BALANCE.tiers[tier];
  const upgradeCost = nextConfig.cost * state.totalAgents;

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
  const minGpus = BALANCE.models[0].minGpus;
  const agentCount = state.totalAgents;
  const gpuCount = Math.max(minGpus, agentCount);
  const totalCost = gpuCount * BALANCE.gpuCost;

  if (state.funds < totalCost) return false;

  state.funds -= totalCost;
  state.gpuCount = gpuCount;
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

  // Auto-add agents for new GPUs (O(1))
  const agentsToAdd = state.gpuCount - state.totalAgents;
  if (agentsToAdd > 0) {
    const unassignedPool = state.agentPools['unassigned'];
    const oldCount = unassignedPool.totalCount;

    unassignedPool.totalCount += agentsToAdd;
    state.totalAgents += agentsToAdd;

    // Initialize sample agents if needed (first 4 only)
    for (let i = oldCount; i < Math.min(oldCount + agentsToAdd, 4); i++) {
      unassignedPool.samples.progress[i] = 0;
      unassignedPool.samples.stuck[i] = false;
    }
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

export function buyAds(state: GameState, amount: number = 1): boolean {
  const totalCost = amount * BALANCE.apiAdCost;
  if (state.funds < totalCost) return false;
  state.funds -= totalCost;
  state.apiAwareness += amount * BALANCE.apiAdAwarenessBoost;
  return true;
}

export function setApiAllocation(state: GameState, pct: number): boolean {
  if (!state.apiUnlocked) return false;
  const newPct = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
  const trainingPct = state.trainingAllocationPct;
  
  if (newPct + trainingPct > 100) {
    return false;
  }
  
  state.apiInferenceAllocationPct = newPct;
  return true;
}

export function improveApi(state: GameState, amount: number = 1): boolean {
  const totalCost = amount * BALANCE.apiImproveCodeCost;
  if (state.code < totalCost) return false;

  state.code -= totalCost;
  state.apiImprovementLevel += amount;
  state.apiQuality += amount * BALANCE.apiImproveQualityBoost;
  
  return true;
}

export function unlockApi(state: GameState): boolean {
  if (state.apiUnlocked) return false;
  if (state.intelligence < BALANCE.apiUnlockIntel) return false;
  if (state.code < BALANCE.apiUnlockCode) return false;

  state.code -= BALANCE.apiUnlockCode;
  state.apiUnlocked = true;
  state.apiInferenceAllocationPct = 5;
  return true;
}
