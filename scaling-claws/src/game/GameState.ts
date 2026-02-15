import { BALANCE } from './BalanceConfig.ts';
import type { SubscriptionTier, JobType } from './BalanceConfig.ts';


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

export interface HumanPool {
  totalCount: number;
  aggregateProgress: number;
  samples: {
    progress: number[];
  };
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

  // AI Agents (legacy fields kept for structural reference if needed, but no longer processed)
  agents?: any[];
  nextAgentId?: number;

  // AI Agent Pools (new aggregate structure)
  agentPools: Record<JobType, JobPool>;
  totalAgents: number;
  poolsVersion: number;

  // Human Workers
  humanWorkers: any[];
  humanPools: Record<JobType, HumanPool>;
  nextHumanWorkerId: number;

  // Global Subscription Tier
  subscriptionTier: SubscriptionTier;

  // Hardware (pre-GPU)
  cpuCoresTotal: number;
  micMiniCount: number;

  // GPU & Compute
  gpuCount: number;
  installedGpuCount: number;   // computed: min(gpuCount, gpuCapacity)
  totalPflops: number;         // computed: installedGpuCount * pflopsPerGpu
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
  laborThrottle: number;      // 0..1, 1 = no throttle

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
  silicon: number;                // silicon stockpile
  siliconProductionPerMin: number;
  siliconDemandPerMin: number;
  wafers: number;                 // pending wafers → GPU production
  waferProductionPerMin: number;
  waferDemandPerMin: number;
  lithoActualRate: number;
  fabActualRate: number;
  mineActualRate: number;
  factoryActualRate: number;

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

  // Space
  rockets: number;
  satellites: number;
  lunarBase: boolean;
  lunarRobots: number;
  lunarGPUs: number;
  lunarSolarPanels: number;
  lunarMassDriverRate: number;    // computed
  mercuryBase: boolean;
  mercuryRobots: number;
  mercuryMiningRate: number;      // computed
  spaceUnlocked: boolean;         // computed
  launchCostBonus: number;        // computed from research

  // Energy — separate grids
  lunarPowerDemandMW: number;     // computed
  lunarPowerSupplyMW: number;     // computed
  lunarPowerThrottle: number;     // 0..1
  orbitalPowerMW: number;         // computed (display only)
  totalEnergyMW: number;          // computed: all grids combined

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
    humanPools: initializeHumanPools(),
    nextHumanWorkerId: 0,

    subscriptionTier: 'basic',

    cpuCoresTotal: BALANCE.startingCpuCores,
    micMiniCount: 0,

    // GPU & Compute
    gpuCount: 0,
    installedGpuCount: 0,
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
    laborThrottle: 1,

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
    silicon: 0,
    siliconProductionPerMin: 0,
    siliconDemandPerMin: 0,
    wafers: 0,
    waferProductionPerMin: 0,
    waferDemandPerMin: 0,
    lithoActualRate: 0,
    fabActualRate: 0,
    mineActualRate: 0,
    factoryActualRate: 0,

    // Space
    rockets: 0,
    satellites: 0,
    lunarBase: false,
    lunarRobots: 0,
    lunarGPUs: 0,
    lunarSolarPanels: 0,
    lunarMassDriverRate: 0,
    mercuryBase: false,
    mercuryRobots: 0,
    mercuryMiningRate: 0,
    spaceUnlocked: false,
    launchCostBonus: 1,

    // Energy — separate grids
    lunarPowerDemandMW: 0,
    lunarPowerSupplyMW: 0,
    lunarPowerThrottle: 1,
    orbitalPowerMW: 0,
    totalEnergyMW: 0,

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

function initializeHumanPools(): Record<JobType, HumanPool> {
  const pools: Record<string, HumanPool> = {};
  const allJobTypes = Object.keys(BALANCE.jobs) as JobType[];

  for (const jobType of allJobTypes) {
    pools[jobType] = {
      totalCount: 0,
      aggregateProgress: 0,
      samples: {
        progress: [0, 0, 0, 0],
      },
    };
  }

  return pools as Record<JobType, HumanPool>;
}

export function getTotalAssignedAgents(state: GameState): number {
  return state.totalAgents - state.agentPools['unassigned'].totalCount;
}

// NOTE: DO NOT add migrations here. The game is in active development and breaking changes to saves are currently acceptable.
