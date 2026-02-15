import { BALANCE } from './BalanceConfig.ts';
import type { SubscriptionTier, JobType } from './BalanceConfig.ts';

export interface AgentState {
  id: number;
  assignedJob: JobType;
  progress: number;       // 0..1
  isStuck: boolean;
  isIdle: boolean;        // no CPU core / GPU available
  taskTimeMs: number;     // total time for current task
}

export interface JobPool {
  totalCount: number;         // Total agents in this job
  stuckCount: number;         // How many agents are currently stuck
  idleCount: number;          // How many agents are idle (no CPU/GPU)
  aggregateProgress: number;  // Collective progress tracker (0..infinity)
  samples: {                  // Only 4 sample agents for UI display
    progress: number[];       // [0..1, 0..1, 0..1, 0..1]
    stuck: boolean[];         // [bool, bool, bool, bool]
  };
}

export interface HumanWorkerState {
  id: number;
  assignedJob: JobType;   // always a human job type
  progress: number;       // 0..1
  taskTimeMs: number;
}

export interface ResourceRate {
  label: string;
  ratePerMin: number;
}

export interface ResourceBreakdown {
  funds: { income: ResourceRate[]; expense: ResourceRate[] };
  code: { income: ResourceRate[]; expense: ResourceRate[] };
  science: { income: ResourceRate[]; expense: ResourceRate[] };
  labor: { income: ResourceRate[]; expense: ResourceRate[] };
  compute: { label: string; pflops: number }[];
}

export interface GameState {
  // Core resources
  funds: number;
  totalEarned: number;

  // Resource Breakdown for UI
  resourceBreakdown: ResourceBreakdown;

  // Time
  tickCount: number;
  lastTickTime: number;
  gameStartTime: number;

  // AI Agents (legacy - for migration only)
  agents?: AgentState[];
  nextAgentId?: number;

  // AI Agent Pools (new aggregate structure)
  agentPools: Record<JobType, JobPool>;
  totalAgents: number;
  poolsVersion: number;

  // Human Workers
  humanWorkers: HumanWorkerState[];
  nextHumanWorkerId: number;

  // Global Subscription Tier
  subscriptionTier: SubscriptionTier;

  // Hardware (pre-GPU)
  cpuCoresTotal: number;
  micMiniCount: number;

  // GPU & Compute
  gpuCount: number;
  totalPflops: number;         // computed: gpuCount * pflopsPerGpu
  currentModelIndex: number;   // index into BALANCE.models
  freeCompute: number;         // computed: totalPflops - training allocation
  isPostGpuTransition: boolean;

  // Datacenters: count per tier [small, medium, large, mega]
  datacenters: number[];
  gpuCapacity: number;         // computed from datacenters
  needsDatacenter: boolean;    // computed: gpuCount approaching capacity

  // Labor
  labor: number;               // stockpile
  laborPerMin: number;         // computed: production rate from workers
  laborConsumedPerMin: number; // computed: consumption by facilities

  // Energy
  gridPowerKW: number;
  gasPlants: number;
  nuclearPlants: number;
  solarFarms: number;
  solarPanels: number;
  powerDemandMW: number;       // computed from GPUs
  powerSupplyMW: number;       // computed from all sources
  powerThrottle: number;       // 0..1, 1 = no throttle

  // Training
  trainingData: number;           // TB of training data owned
  trainingDataPurchases: number;  // for price escalation
  trainingAllocationPct: number;  // 0-100, step 5
  trainingAllocatedPflops: number; // computed
  currentFineTuneIndex: number;   // -1 = none active, index into BALANCE.fineTunes
  fineTuneProgress: number;       // PFLOPS-hrs completed
  completedFineTunes: number[];   // indices of completed fine-tunes
  ariesModelIndex: number;        // -1 = none, index into BALANCE.ariesModels
  ariesProgress: number;          // PFLOPS-hrs into current Aries run

  // Code & Science (produced by jobs, consumed by training/research)
  code: number;
  codePerMin: number;             // computed: production from jobs
  science: number;
  sciencePerMin: number;          // computed: production from jobs

  // Research
  completedResearch: string[];
  synthDataRate: number;          // computed: TB/min from synth data
  algoEfficiencyBonus: number;    // computed: multiplier for training speed
  gpuFlopsBonus: number;          // computed: multiplier for GPU PFLOPS

  // Supply Chain
  lithoMachines: number;
  waferFabs: number;
  siliconMines: number;
  robotFactories: number;
  robots: number;
  gpuProductionPerMin: number;    // computed: GPUs auto-produced per minute
  waferBatches: number;           // pending wafer batches → GPU production

  // API Services
  apiUnlocked: boolean;
  apiUserCount: number;
  apiPrice: number;        // Price factor (affects demand)
  apiDemand: number;       // Computed demand
  apiAwareness: number;    // Awareness level
  apiReservedPflops: number; // Computed PFLOPS used
  apiIncomePerMin: number; // Computed income
  apiInferenceAllocationPct: number; // 0-100
  apiUserSynthRate: number; // Computed per-user synth rate (TB/min)
  apiImprovementLevel: number; // Index of current tier
  apiQuality: number;      // Current quality multiplier

  // Job tracking
  completedTasks: number;
  unlockedJobs: JobType[];
  automatedJobs: JobType[];

  // Manager tracking
  managerCount: number;

  // Computed per tick (for UI display)
  incomePerMin: number;
  expensePerMin: number;
  humanSalaryPerMin: number;     // computed: total human worker salaries
  intelligence: number;
  agentEfficiency: number;
  stuckCount: number;
  activeAgentCount: number;
  usedCores: number;

  // Flavor text
  pendingFlavorTexts: string[];
  shownFlavorTexts: string[];
}

export function createInitialState(): GameState {
  const now = Date.now();
  return {
    funds: BALANCE.startingFunds,
    totalEarned: 0,

    resourceBreakdown: {
      funds: { income: [], expense: [] },
      code: { income: [], expense: [] },
      science: { income: [], expense: [] },
      labor: { income: [], expense: [] },
      compute: [],
    },

    tickCount: 0,
    lastTickTime: now,
    gameStartTime: now,

    humanWorkers: [],
    nextHumanWorkerId: 0,

    subscriptionTier: 'basic',

    cpuCoresTotal: BALANCE.startingCpuCores,
    micMiniCount: 0,

    // GPU & Compute
    gpuCount: 0,
    totalPflops: 0,
    currentModelIndex: 0,
    freeCompute: 0,
    isPostGpuTransition: false,

    // Datacenters
    datacenters: [0, 0, 0, 0],
    gpuCapacity: 32,
    needsDatacenter: false,

    // Labor
    labor: 0,
    laborPerMin: 0,
    laborConsumedPerMin: 0,

    // Energy
    gridPowerKW: 0,
    gasPlants: 0,
    nuclearPlants: 0,
    solarFarms: 0,
    solarPanels: 0,
    powerDemandMW: 0,
    powerSupplyMW: 0,
    powerThrottle: 1,

    // Training
    trainingData: 0,
    trainingDataPurchases: 0,
    trainingAllocationPct: 0,
    trainingAllocatedPflops: 0,
    currentFineTuneIndex: -1,
    fineTuneProgress: 0,
    completedFineTunes: [],
    ariesModelIndex: -1,
    ariesProgress: 0,

    // Code & Science
    code: 0,
    codePerMin: 0,
    science: 0,
    sciencePerMin: 0,

    // Research
    completedResearch: [],
    synthDataRate: 0,
    algoEfficiencyBonus: 1,
    gpuFlopsBonus: 1,

    // Supply Chain
    lithoMachines: 0,
    waferFabs: 0,
    siliconMines: 0,
    robotFactories: 0,
    robots: 0,
    gpuProductionPerMin: 0,
    waferBatches: 0,

    // API Services
    apiUnlocked: false,
    apiUserCount: 0,
    apiPrice: 35,
    apiDemand: 0,
    apiAwareness: 0,
    apiReservedPflops: 0,
    apiIncomePerMin: 0,
    apiInferenceAllocationPct: 0,
    apiUserSynthRate: 0,
    apiImprovementLevel: -1,
    apiQuality: 1,

    completedTasks: 0,
    unlockedJobs: ['unassigned', 'sixxerBasic'],
    automatedJobs: [],

    managerCount: 0,

    incomePerMin: 0,
    expensePerMin: 0,
    humanSalaryPerMin: 0,
    intelligence: BALANCE.tiers.basic.intel,
    agentEfficiency: 1,
    stuckCount: 0,
    activeAgentCount: 1,
    usedCores: 1,

    pendingFlavorTexts: [],
    shownFlavorTexts: [],

    // Agent pools (new structure)
    agentPools: initializeAgentPools(),
    totalAgents: 1,
    poolsVersion: 1,
  };
}

export function initializeJobPool(): JobPool {
  return {
    totalCount: 0,
    stuckCount: 0,
    idleCount: 0,
    aggregateProgress: 0,
    samples: {
      progress: [0, 0, 0, 0],
      stuck: [false, false, false, false],
    },
  };
}

function initializeAgentPools(): Record<JobType, JobPool> {
  const pools: Record<string, JobPool> = {};
  const allJobTypes = Object.keys(BALANCE.jobs) as JobType[];

  for (const jobType of allJobTypes) {
    pools[jobType] = initializeJobPool();
  }

  // Start with 1 agent in unassigned
  pools['unassigned'].totalCount = 1;

  return pools as Record<JobType, JobPool>;
}

export function getTotalAssignedAgents(state: GameState): number {
  return state.totalAgents - state.agentPools['unassigned'].totalCount;
}

export function migrateAgentsToPoolsV1(state: GameState): void {
  if (state.poolsVersion && state.poolsVersion >= 1) return; // already migrated

  // Initialize empty pools for all job types
  state.agentPools = initializeAgentPools();
  // Reset unassigned to 0 (will be populated from agents array)
  state.agentPools['unassigned'].totalCount = 0;

  // Migrate from legacy agents array
  if (state.agents && state.agents.length > 0) {
    // Group agents by job
    const agentsByJob = new Map<JobType, AgentState[]>();
    for (const agent of state.agents) {
      if (!agentsByJob.has(agent.assignedJob)) {
        agentsByJob.set(agent.assignedJob, []);
      }
      agentsByJob.get(agent.assignedJob)!.push(agent);
    }

    // Convert to pools
    for (const [jobType, agents] of agentsByJob.entries()) {
      const pool = state.agentPools[jobType];
      pool.totalCount = agents.length;

      // Count stuck and idle
      pool.stuckCount = agents.filter(a => a.isStuck).length;
      pool.idleCount = agents.filter(a => a.isIdle).length;

      // Initialize aggregate progress (average of existing progress)
      const avgProgress = agents.reduce((sum, a) => sum + a.progress, 0) / agents.length;
      pool.aggregateProgress = avgProgress;

      // Migrate first 4 agents to samples
      for (let i = 0; i < Math.min(4, agents.length); i++) {
        pool.samples.progress[i] = agents[i].progress;
        pool.samples.stuck[i] = agents[i].isStuck;
      }
    }

    state.totalAgents = state.agents.length;
    delete state.agents; // remove legacy data
    delete state.nextAgentId;
  } else {
    state.totalAgents = 0;
  }

  state.poolsVersion = 1;
}
