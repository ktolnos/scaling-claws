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

export interface HumanWorkerState {
  id: number;
  assignedJob: JobType;   // always a human job type
  progress: number;       // 0..1
  taskTimeMs: number;
}

export interface GameState {
  // Core resources
  funds: number;
  totalEarned: number;

  // Time
  tickCount: number;
  lastTickTime: number;
  gameStartTime: number;

  // AI Agents
  agents: AgentState[];
  nextAgentId: number;

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
  gridBlocksOwned: number;     // each block = 5 MW
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
  synthDataUnlocked: boolean;     // Synth Data I completed
  synthDataRate: number;          // computed: TB/min from synth data
  synthDataAllocPflops: number;   // PFLOPS used for synth data generation
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
  apiImprovementLevel: number; // Index of current tier
  apiQuality: number;      // Current quality multiplier

  // Job tracking
  completedTasks: number;
  unlockedJobs: JobType[];

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

    tickCount: 0,
    lastTickTime: now,
    gameStartTime: now,

    agents: [{
      id: 0,
      assignedJob: 'unassigned',
      progress: 0,
      isStuck: false,
      isIdle: false,
      taskTimeMs: 2000,
    }],
    nextAgentId: 1,

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
    gridBlocksOwned: 0,
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
    synthDataUnlocked: false,
    synthDataRate: 0,
    synthDataAllocPflops: 0,
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
    apiImprovementLevel: -1,
    apiQuality: 1,

    completedTasks: 0,
    unlockedJobs: ['unassigned', 'sixxerBasic'],

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
  };
}
