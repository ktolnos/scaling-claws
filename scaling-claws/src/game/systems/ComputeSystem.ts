import type { GameState } from '../GameState.ts';
import { getTotalAssignedAgents } from '../GameState.ts';
import { BALANCE, getBestModel, getTotalGpuCapacity, JOB_ORDER } from '../BalanceConfig.ts';
import type { SubscriptionTier } from '../BalanceConfig.ts';
import { toBigInt, divB, mulB, scaleB, fromBigInt, scaleBigInt } from '../utils.ts';

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
  
  if (state.humanSalaryPerMin > 0n) {
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
  state.installedGpuCount = state.gpuCount < state.gpuCapacity ? state.gpuCount : state.gpuCapacity;
  
  // totalPflops = GPUs * pflopsPerGpu * bonus * throttle
  // gpuCount is scaled, pflopsPerGpu is number? 
  // Let's check BALANCE again. pflopsPerGpu is 2.0 (number).
  let pflops = scaleB(state.installedGpuCount, BALANCE.pflopsPerGpu);
  pflops = scaleB(pflops, state.gpuFlopsBonus);
  pflops = scaleB(pflops, state.powerThrottle);
  state.totalPflops = pflops;

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
  const trainingPct = toBigInt(state.trainingAllocationPct);
  const inferencePct = state.apiUnlocked ? toBigInt(state.apiInferenceAllocationPct) : 0n;
  
  state.trainingAllocatedPflops = divB(mulB(state.totalPflops, trainingPct), 100n);
  state.apiReservedPflops = divB(mulB(state.totalPflops, inferencePct), 100n);
  
  // Calculate "Rest" of compute (available for Agents and Synth Data)
  const restPflops = state.totalPflops - state.trainingAllocatedPflops - state.apiReservedPflops;
  state.freeCompute = restPflops < 0n ? 0n : restPflops; 

  const agentsAllocatedPflops = state.freeCompute;

  // Poplate Compute Breakdown
  if (state.trainingAllocatedPflops > 0n) {
    state.resourceBreakdown.compute.push({ label: 'Training', pflops: state.trainingAllocatedPflops });
  }
  if (state.apiReservedPflops > 0n) {
    state.resourceBreakdown.compute.push({ label: 'API Services', pflops: state.apiReservedPflops });
  }
  if (agentsAllocatedPflops > 0n) {
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
  const pflopsNeeded = scaleB(assignedAgents, BALANCE.pflopsPerGpu);
  
  let computeEfficiency = 1.0;
  if (pflopsNeeded > 0n) {
     computeEfficiency = Math.min(1.0, Number(agentsAllocatedPflops) / Number(pflopsNeeded));
  }

  state.agentEfficiency = state.powerThrottle * computeEfficiency;

  // Labor consumption from facilities - REMOVED (Ongoing labor costs removed)

  // API Services
  if (state.apiUnlocked) {
    // Demand calculation (Economics based)
    const effectiveAwareness = BALANCE.apiBaseAwareness + state.apiAwareness;
    
    const demand = Math.pow(effectiveAwareness, BALANCE.apiAwarenessElasticity) * 
      state.apiQuality *
      (Math.pow(state.intelligence, BALANCE.intelligenceElasticity) / 
       Math.pow(state.apiPrice, BALANCE.apiPriceElasticity)) * 
      BALANCE.apiDemandScale;
    
    state.apiDemand = toBigInt(demand);

    // Available capacity for users
    const capacityUsers = divB(state.apiReservedPflops, toBigInt(BALANCE.apiPflopsPerUser));

    // Active users limited by demand and capacity
    state.apiUserCount = state.apiDemand < capacityUsers ? state.apiDemand : capacityUsers;

    // Synth Data from API users
    state.apiUserSynthRate = BALANCE.apiUserSynthBase; 
    state.synthDataRate = mulB(state.apiUserCount, state.apiUserSynthRate);
    state.trainingData += mulB(state.synthDataRate, toBigInt(dtMs)) / 60000n;

    // Income
    state.apiIncomePerMin = mulB(state.apiUserCount, toBigInt(state.apiPrice)); 
    
    if (state.apiIncomePerMin > 0n) {
      state.resourceBreakdown.funds.income.push({ label: 'API Services', ratePerMin: state.apiIncomePerMin });
    }

    const income = mulB(state.apiIncomePerMin, toBigInt(dtMs)) / 60000n;
    state.funds += income;
    state.totalEarned += income;
  } else {
    state.synthDataRate = 0n;
  }

  // Expenses: human salaries + grid power
  if (state.humanSalaryPerMin > 0n) {
    state.resourceBreakdown.funds.expense.push({ label: 'Human Salaries', ratePerMin: state.humanSalaryPerMin });
  }

  let totalExpensePerMin = state.humanSalaryPerMin;
  const gridCost = mulB(state.gridPowerKW, toBigInt(BALANCE.gridPowerCostPerKWPerMin));
  if (gridCost > 0n) {
    totalExpensePerMin += gridCost;
    state.resourceBreakdown.funds.expense.push({ label: 'Grid Power', ratePerMin: gridCost });
  }
  state.expensePerMin = totalExpensePerMin;

  // Deduct costs
  const cost = mulB(totalExpensePerMin, toBigInt(dtMs)) / 60000n;
  state.funds -= cost;

  if (state.funds < 0n) {
    state.funds = 0n;
  }
}

function allocateCores(state: GameState): void {
  const totalCores = state.cpuCoresTotal; // assumed scaled
  const coresPerAgent = toBigInt(BALANCE.tiers[state.subscriptionTier].coresPerAgent);
  const maxAgents = divB(totalCores, coresPerAgent);

  let remainingSlots = maxAgents;

  // Allocate by job priority
  for (const jobType of JOB_ORDER) {
    const pool = state.agentPools[jobType];
    if (!pool) continue;

    if (remainingSlots >= pool.totalCount) {
      pool.idleCount = 0n;
      remainingSlots -= pool.totalCount;
    } else {
      pool.idleCount = pool.totalCount - remainingSlots;
      remainingSlots = 0n;
      break;
    }
  }

  const unassignedPool = state.agentPools['unassigned'];
  if (remainingSlots >= unassignedPool.totalCount) {
    unassignedPool.idleCount = 0n;
    remainingSlots -= unassignedPool.totalCount;
  } else {
    unassignedPool.idleCount = unassignedPool.totalCount - remainingSlots;
    remainingSlots = 0n;
  }

  const allocatedAgents = maxAgents - remainingSlots;
  state.usedCores = mulB(allocatedAgents, coresPerAgent);
  state.activeAgentCount = allocatedAgents;
}

function allocateGpuSlots(state: GameState, agentsAllocatedPflops: bigint): void {
  const maxActiveAgents = divB(agentsAllocatedPflops, toBigInt(BALANCE.pflopsPerGpu));

  let remainingSlots = maxActiveAgents;

  for (const jobType of JOB_ORDER) {
    const pool = state.agentPools[jobType];
    if (!pool) continue;

    if (remainingSlots >= pool.totalCount) {
      pool.idleCount = 0n;
      remainingSlots -= pool.totalCount;
    } else {
      pool.idleCount = pool.totalCount - remainingSlots;
      remainingSlots = 0n;
      break;
    }
  }

  const unassignedPool = state.agentPools['unassigned'];
  if (remainingSlots >= unassignedPool.totalCount) {
    unassignedPool.idleCount = 0n;
    remainingSlots -= unassignedPool.totalCount;
  } else {
    unassignedPool.idleCount = unassignedPool.totalCount - remainingSlots;
    remainingSlots = 0n;
  }

  state.activeAgentCount = maxActiveAgents - remainingSlots;
}

// --- Actions ---

export function hireAgent(state: GameState): boolean {
  const tierConfig = BALANCE.tiers[state.subscriptionTier];

  if (!state.isPostGpuTransition) {
    if (mulB(state.totalAgents + scaleBigInt(1n), toBigInt(tierConfig.coresPerAgent)) > state.cpuCoresTotal) {
      return false;
    }
  } else {
    if (state.totalAgents >= state.installedGpuCount) {
      return false;
    }
  }

  if (state.funds < tierConfig.cost) {
    return false;
  }

  state.funds -= tierConfig.cost;

  const unassignedPool = state.agentPools['unassigned'];
  unassignedPool.totalCount += scaleBigInt(1n);
  state.totalAgents += scaleBigInt(1n);

  if (unassignedPool.totalCount <= scaleBigInt(4n)) {
    const idx = Math.floor(fromBigInt(unassignedPool.totalCount)) - 1;
    unassignedPool.samples.progress[idx] = 0;
    unassignedPool.samples.stuck[idx] = false;
  }

  return true;
}

export function decreaseAgents(state: GameState): boolean {
  if (state.totalAgents <= 0n) return false;

  const unassignedPool = state.agentPools['unassigned'];
  if (unassignedPool.totalCount > 0n) {
    unassignedPool.totalCount -= scaleBigInt(1n);
    state.totalAgents -= scaleBigInt(1n);

    if (unassignedPool.totalCount < scaleBigInt(4n)) {
      unassignedPool.samples.progress[Math.floor(fromBigInt(unassignedPool.totalCount))] = 0;
      unassignedPool.samples.stuck[Math.floor(fromBigInt(unassignedPool.totalCount))] = false;
    }

    return true;
  }

  return false;
}

export function upgradeTier(state: GameState, tier: SubscriptionTier): boolean {
  const nextConfig = BALANCE.tiers[tier];
  const upgradeCost = mulB(nextConfig.cost, state.totalAgents);

  if (state.funds < upgradeCost) {
    return false;
  }

  state.funds -= upgradeCost;
  state.subscriptionTier = tier;

  return true;
}

export function buyMicMini(state: GameState): boolean {
  if (state.micMiniCount >= scaleBigInt(7n)) return false;
  if (state.funds < BALANCE.micMini.cost) return false;

  state.funds -= BALANCE.micMini.cost;
  state.micMiniCount += scaleBigInt(1n);
  state.cpuCoresTotal += BALANCE.micMini.coresAdded;

  return true;
}

export function goSelfHosted(state: GameState): boolean {
  const minGpus = BALANCE.models[0].minGpus;
  const agentCount = state.totalAgents;
  const gpuCount = minGpus > agentCount ? minGpus : agentCount;
  const totalCost = mulB(gpuCount, BALANCE.gpuCost);

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
  const amountB = toBigInt(amount);
  const cost = mulB(amountB, BALANCE.gpuCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.gpuCount += amountB;

  // Auto-add agents for new GPUs
  const agentsToAdd = state.gpuCount - state.totalAgents;
  if (agentsToAdd > 0n) {
    const unassignedPool = state.agentPools['unassigned'];
    const oldCount = unassignedPool.totalCount;

    unassignedPool.totalCount += agentsToAdd;
    state.totalAgents += agentsToAdd;

    for (let i = Math.floor(fromBigInt(oldCount)); i < Math.min(Math.floor(fromBigInt(oldCount + agentsToAdd)), 4); i++) {
      unassignedPool.samples.progress[i] = 0;
      unassignedPool.samples.stuck[i] = false;
    }
  }

  if (state.gpuCount <= amountB) {
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
  state.datacenters[tier] += scaleBigInt(1n);
  state.gpuCapacity = getTotalGpuCapacity(state.datacenters);

  return true;
}


// --- API Actions ---

export function setApiPrice(state: GameState, price: number): void {
  // Price is in $, can go from very low to high
  state.apiPrice = Math.max(0.1, Math.round(price * 10) / 10);
}

export function buyAds(state: GameState, amount: number = 1): boolean {
  const amountB = toBigInt(amount);
  const totalCost = mulB(amountB, BALANCE.apiAdCost);
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
  const amountB = toBigInt(amount);
  const totalCost = mulB(amountB, BALANCE.apiImproveCodeCost);
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
