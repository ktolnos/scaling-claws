import { BALANCE } from './BalanceConfig.ts';
import type { SubscriptionTier, JobType, ResearchId } from './BalanceConfig.ts';

export interface AgentState {
  id: number;
  assignedJob: JobType;
  progress: number;       // 0..1
  isStuck: boolean;
  isIdle: boolean;        // no CPU core / GPU instance available
  taskTimeMs: number;     // total time for current task
}

export interface GameState {
  // Core resources
  funds: number;
  totalEarned: number;

  // Time
  tickCount: number;
  lastTickTime: number;
  gameStartTime: number;

  // Agents
  agents: AgentState[];
  nextAgentId: number;

  // Global Subscription Tier
  subscriptionTier: SubscriptionTier;

  // Hardware (pre-GPU)
  cpuCoresTotal: number;
  micMiniCount: number;

  // GPU & Compute
  gpuCount: number;
  totalPflops: number;         // computed: gpuCount * pflopsPerGpu
  currentModelIndex: number;   // index into BALANCE.models
  instanceCount: number;       // computed: floor(totalPflops / model.pflopsPerInstance)
  freeCompute: number;         // computed: total - (instances * perInstance) - training
  isPostGpuTransition: boolean;

  // Datacenters: count per tier [small, medium, large, mega]
  datacenters: number[];
  gpuCapacity: number;         // computed from datacenters
  needsDatacenter: boolean;    // computed: gpuCount approaching capacity

  // Engineers
  engineerCount: number;       // humans hired
  engineersRequired: number;   // computed: total needed for all facilities
  engineerExpensePerMin: number; // computed

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

  // Code & Science
  code: number;
  codePerMin: number;             // computed
  humanSoftwareDevs: number;
  aiSoftwareDevs: number;
  science: number;
  sciencePerMin: number;          // computed
  aiResearchers: number;

  // Research
  completedResearch: ResearchId[];
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

  // Subscription selling
  subSellingUnlocked: boolean;
  subscriberCount: number;
  subscriberPrice: number;        // $/min per subscriber
  subscriberDemand: number;       // computed: how many want to subscribe
  subscriberAwareness: number;    // affects demand
  subscriberReservedPflops: number; // computed: PFLOPS reserved for subs
  subscriberIncomePerMin: number; // computed

  // Job tracking
  completedTasks: number;
  unlockedJobs: JobType[];
  softwareDevCount: number;           // agents doing AI Coder jobs

  // Manager tracking
  managerCount: number;
  managerSquaredCount: number;

  // Computed per tick (for UI display)
  incomePerMin: number;
  expensePerMin: number;
  intelligence: number;
  agentEfficiency: number;
  stuckCount: number;
  activeAgentCount: number;
  usedCores: number;

  // Flavor text
  pendingFlavorTexts: string[];
  shownFlavorTexts: string[];

  // Milestone flags
  milestones: {
    firstTaskComplete: boolean;
    firstProSub: boolean;
    firstMicMini: boolean;
    reachedUltra: boolean;
    reachedUltraMax: boolean;
    reachedUltraProMax: boolean;
    firstManagerAgent: boolean;
    firstManagerSquared: boolean;
    gpuTransition: boolean;
    firstDatacenter: boolean;
    firstGasPlant: boolean;
    firstNuclearPlant: boolean;
    firstSolarFarm: boolean;
    trainingUnlocked: boolean;
    researchUnlocked: boolean;
    supplyChainUnlocked: boolean;
    subSellingUnlocked: boolean;
  };
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

    subscriptionTier: 'basic',

    cpuCoresTotal: BALANCE.startingCpuCores,
    micMiniCount: 0,

    // GPU & Compute
    gpuCount: 0,
    totalPflops: 0,
    currentModelIndex: 0,
    instanceCount: 0,
    freeCompute: 0,
    isPostGpuTransition: false,

    // Datacenters
    datacenters: [0, 0, 0, 0],
    gpuCapacity: 32,
    needsDatacenter: false,

    // Engineers
    engineerCount: 0,
    engineersRequired: 0,
    engineerExpensePerMin: 0,

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
    humanSoftwareDevs: 0,
    aiSoftwareDevs: 0,
    science: 0,
    sciencePerMin: 0,
    aiResearchers: 0,

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

    // Subscription selling
    subSellingUnlocked: false,
    subscriberCount: 0,
    subscriberPrice: 35,
    subscriberDemand: 0,
    subscriberAwareness: 0,
    subscriberReservedPflops: 0,
    subscriberIncomePerMin: 0,

    completedTasks: 0,
    unlockedJobs: ['unassigned', 'sixxerBasic'],
    softwareDevCount: 0,

    managerCount: 0,
    managerSquaredCount: 0,

    incomePerMin: 0,
    expensePerMin: 0,
    intelligence: BALANCE.tiers.basic.intel,
    agentEfficiency: 1,
    stuckCount: 0,
    activeAgentCount: 1,
    usedCores: 1,

    pendingFlavorTexts: [],
    shownFlavorTexts: [],

    milestones: {
      firstTaskComplete: false,
      firstProSub: false,
      firstMicMini: false,
      reachedUltra: false,
      reachedUltraMax: false,
      reachedUltraProMax: false,
      firstManagerAgent: false,
      firstManagerSquared: false,
      gpuTransition: false,
      firstDatacenter: false,
      firstGasPlant: false,
      firstNuclearPlant: false,
      firstSolarFarm: false,
      trainingUnlocked: false,
      researchUnlocked: false,
      supplyChainUnlocked: false,
      subSellingUnlocked: false,
    },
  };
}
