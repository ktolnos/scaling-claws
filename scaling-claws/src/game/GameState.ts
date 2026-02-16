import { BALANCE } from './BalanceConfig.ts';
import type { SubscriptionTier, JobType } from './BalanceConfig.ts';


export interface JobPool {
  totalCount: bigint;         // Total agents in this job
  stuckCount: bigint;         // How many agents are currently stuck
  idleCount: bigint;          // How many agents are idle (no CPU/GPU)
  aggregateProgress: bigint;  // Collective progress tracker
  samples: {                  // Only 4 sample agents for UI display
    progress: number[];       // [0..1, 0..1, 0..1, 0..1]
    stuck: boolean[];         // [bool, bool, bool, bool]
  };
}


export interface ResourceRate {
  label: string;
  ratePerMin: bigint;
}

export interface ResourceBreakdown {
  funds: { income: ResourceRate[]; expense: ResourceRate[] };
  code: { income: ResourceRate[]; expense: ResourceRate[] };
  science: { income: ResourceRate[]; expense: ResourceRate[] };
  labor: { income: ResourceRate[]; expense: ResourceRate[] };
  compute: { label: string; pflops: bigint }[];
}

export interface HumanPool {
  totalCount: bigint;
  aggregateProgress: bigint;
  samples: {
    progress: number[];
  };
}

export interface GameState {
  // Core resources
  funds: bigint;
  totalEarned: bigint;

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
  totalAgents: bigint;
  poolsVersion: number;

  // Human Workers
  humanWorkers: any[];
  humanPools: Record<JobType, HumanPool>;
  nextHumanWorkerId: number;

  // Global Subscription Tier
  subscriptionTier: SubscriptionTier;

  // Hardware (pre-GPU)
  cpuCoresTotal: bigint;
  micMiniCount: bigint;

  // GPU & Compute
  gpuCount: bigint;
  installedGpuCount: bigint;   // computed: min(gpuCount, gpuCapacity)
  totalPflops: bigint;         // computed
  currentModelIndex: number;   // index into BALANCE.models
  freeCompute: bigint;         // computed
  isPostGpuTransition: boolean;

  // Datacenters: count per tier [small, medium, large, mega]
  datacenters: bigint[];
  gpuCapacity: bigint;         // computed from datacenters
  needsDatacenter: boolean;    // computed: gpuCount approaching capacity

  // Labor
  labor: bigint;               // stockpile
  laborPerMin: bigint;         // computed

  // Energy
  gridPowerKW: bigint;
  gasPlants: bigint;
  nuclearPlants: bigint;
  solarFarms: bigint;
  solarPanels: bigint;
  powerDemandMW: bigint;       // computed
  powerSupplyMW: bigint;       // computed
  powerThrottle: number;       // 0..1, 1 = no throttle

  // Training
  trainingData: bigint;           // TB of training data owned
  trainingDataPurchases: number;  // for price escalation
  trainingAllocationPct: number;  // 0-100, step 5
  trainingAllocatedPflops: bigint; // computed
  currentFineTuneIndex: number;   // -1 = none active, index into BALANCE.fineTunes
  fineTuneProgress: bigint;       // PFLOPS-hrs completed
  completedFineTunes: number[];   // indices of completed fine-tunes
  ariesModelIndex: number;        // -1 = none, index into BALANCE.ariesModels
  ariesProgress: bigint;          // PFLOPS-hrs into current Aries run

  // Code & Science (produced by jobs, consumed by training/research)
  code: bigint;
  codePerMin: bigint;
  science: bigint;
  sciencePerMin: bigint;

  // Research
  completedResearch: string[];
  synthDataRate: bigint;          // computed
  algoEfficiencyBonus: number;    // computed: multiplier for training speed
  gpuFlopsBonus: number;          // computed: multiplier for GPU PFLOPS

  // Supply Chain
  lithoMachines: bigint;
  waferFabs: bigint;
  siliconMines: bigint;
  robotFactories: bigint;
  robots: bigint;
  gpuProductionPerMin: bigint;    // computed
  silicon: bigint;                // silicon stockpile
  siliconProductionPerMin: bigint;
  siliconDemandPerMin: bigint;
  wafers: bigint;                 // pending wafers → GPU production
  waferProductionPerMin: bigint;
  waferDemandPerMin: bigint;
  lithoActualRate: number;
  fabActualRate: number;
  mineActualRate: number;
  factoryActualRate: number;

  // API Services
  apiUnlocked: boolean;
  apiUserCount: bigint;
  apiPrice: number;        // Price factor (affects demand)
  apiDemand: bigint;       // Computed demand
  apiAwareness: number;    // Awareness level
  apiReservedPflops: bigint; // Computed PFLOPS used
  apiIncomePerMin: bigint; // Computed income
  apiInferenceAllocationPct: number; // 0-100
  apiUserSynthRate: bigint; // Computed per-user synth rate
  apiImprovementLevel: number; // Index of current tier
  apiQuality: number;      // Current quality multiplier

  // Space
  rockets: bigint;
  satellites: bigint;
  lunarBase: boolean;
  lunarRobots: bigint;
  lunarGPUs: bigint;
  lunarSolarPanels: bigint;
  lunarMassDriverRate: number;    // computed
  mercuryBase: boolean;
  mercuryRobots: bigint;
  mercuryMiningRate: number;      // computed
  spaceUnlocked: boolean;         // computed
  launchCostBonus: number;        // computed from research

  // Energy — separate grids
  lunarPowerDemandMW: bigint;     // computed
  lunarPowerSupplyMW: bigint;     // computed
  lunarPowerThrottle: number;     // 0..1
  orbitalPowerMW: bigint;         // computed
  totalEnergyMW: bigint;          // computed

  // Job tracking
  completedTasks: bigint;
  unlockedJobs: JobType[];
  automatedJobs: JobType[];

  // Manager tracking
  managerCount: bigint;

  // Computed per tick (for UI display)
  incomePerMin: bigint;
  expensePerMin: bigint;
  humanSalaryPerMin: bigint;     // computed
  intelligence: number;
  agentEfficiency: number;
  stuckCount: bigint;
  activeAgentCount: bigint;
  usedCores: bigint;

  // Flavor text
  pendingFlavorTexts: string[];
  shownFlavorTexts: string[];
}


import { toBigInt, scaleBigInt } from './utils.ts';

export function createInitialState(): GameState {
  const now = Date.now();
  return {
    funds: toBigInt(BALANCE.startingFunds),
    totalEarned: 0n,

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

    cpuCoresTotal: toBigInt(BALANCE.startingCpuCores),
    micMiniCount: 0n,

    // GPU & Compute
    gpuCount: 0n,
    installedGpuCount: 0n,
    totalPflops: 0n,
    currentModelIndex: 0,
    freeCompute: 0n,
    isPostGpuTransition: false,

    // Datacenters
    datacenters: [0n, 0n, 0n, 0n],
    gpuCapacity: scaleBigInt(32n),
    needsDatacenter: false,

    // Labor
    labor: 0n,
    laborPerMin: 0n,

    // Energy
    gridPowerKW: 0n,
    gasPlants: 0n,
    nuclearPlants: 0n,
    solarFarms: 0n,
    solarPanels: 0n,
    powerDemandMW: 0n,
    powerSupplyMW: 0n,
    powerThrottle: 1,

    // Training
    trainingData: 0n,
    trainingDataPurchases: 0,
    trainingAllocationPct: 0,
    trainingAllocatedPflops: 0n,
    currentFineTuneIndex: -1,
    fineTuneProgress: 0n,
    completedFineTunes: [],
    ariesModelIndex: -1,
    ariesProgress: 0n,

    // Code & Science
    code: 0n,
    codePerMin: 0n,
    science: 0n,
    sciencePerMin: 0n,

    // Research
    completedResearch: [],
    synthDataRate: 0n,
    algoEfficiencyBonus: 1,
    gpuFlopsBonus: 1,

    // Supply Chain
    lithoMachines: 0n,
    waferFabs: 0n,
    siliconMines: 0n,
    robotFactories: 0n,
    robots: 0n,
    gpuProductionPerMin: 0n,
    silicon: 0n,
    siliconProductionPerMin: 0n,
    siliconDemandPerMin: 0n,
    wafers: 0n,
    waferProductionPerMin: 0n,
    waferDemandPerMin: 0n,
    lithoActualRate: 0,
    fabActualRate: 0,
    mineActualRate: 0,
    factoryActualRate: 0,

    // Space
    rockets: 0n,
    satellites: 0n,
    lunarBase: false,
    lunarRobots: 0n,
    lunarGPUs: 0n,
    lunarSolarPanels: 0n,
    lunarMassDriverRate: 0,
    mercuryBase: false,
    mercuryRobots: 0n,
    mercuryMiningRate: 0,
    spaceUnlocked: false,
    launchCostBonus: 1,

    // Energy — separate grids
    lunarPowerDemandMW: 0n,
    lunarPowerSupplyMW: 0n,
    lunarPowerThrottle: 1,
    orbitalPowerMW: 0n,
    totalEnergyMW: 0n,

    // API Services
    apiUnlocked: false,
    apiUserCount: 0n,
    apiPrice: 35,
    apiDemand: 0n,
    apiAwareness: 0,
    apiReservedPflops: 0n,
    apiIncomePerMin: 0n,
    apiInferenceAllocationPct: 0,
    apiUserSynthRate: 0n,
    apiImprovementLevel: -1,
    apiQuality: 1,

    completedTasks: 0n,
    unlockedJobs: ['unassigned', 'sixxerBasic'],
    automatedJobs: [],

    managerCount: 0n,

    incomePerMin: 0n,
    expensePerMin: 0n,
    humanSalaryPerMin: 0n,
    intelligence: BALANCE.tiers.basic.intel,
    agentEfficiency: 1,
    stuckCount: 0n,
    activeAgentCount: toBigInt(1),
    usedCores: toBigInt(1),

    pendingFlavorTexts: [],
    shownFlavorTexts: [],

    // Agent pools (new structure)
    agentPools: initializeAgentPools(),
    totalAgents: toBigInt(1),
    poolsVersion: 1,
  };
}


export function initializeJobPool(): JobPool {
  return {
    totalCount: 0n,
    stuckCount: 0n,
    idleCount: 0n,
    aggregateProgress: 0n,
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
  pools['unassigned'].totalCount = toBigInt(1);

  return pools as Record<JobType, JobPool>;
}

function initializeHumanPools(): Record<JobType, HumanPool> {
  const pools: Record<string, HumanPool> = {};
  const allJobTypes = Object.keys(BALANCE.jobs) as JobType[];

  for (const jobType of allJobTypes) {
    pools[jobType] = {
      totalCount: 0n,
      aggregateProgress: 0n,
      samples: {
        progress: [0, 0, 0, 0],
      },
    };
  }

  return pools as Record<JobType, HumanPool>;
}

export function getTotalAssignedAgents(state: GameState): bigint {
  return state.totalAgents - state.agentPools['unassigned'].totalCount;
}

// NOTE: DO NOT add migrations here. The game is in active development and breaking changes to saves are currently acceptable.

