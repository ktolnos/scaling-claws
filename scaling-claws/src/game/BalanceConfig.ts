export const SubscriptionTiers = {
  basic: 'basic',
  pro: 'pro',
  ultra: 'ultra',
  ultraMax: 'ultraMax',
  ultraProMax: 'ultraProMax',
} as const;

export type SubscriptionTier = typeof SubscriptionTiers[keyof typeof SubscriptionTiers];

export const TIER_ORDER: SubscriptionTier[] = [
  'ultraProMax', 'ultraMax', 'ultra', 'pro', 'basic',
];

// Resource types that jobs can produce
export const ResourceTypes = {
  funds: 'funds',
  code: 'code',
  science: 'science',
  labor: 'labor',
  nudge: 'nudge',
} as const;

export type ResourceType = typeof ResourceTypes[keyof typeof ResourceTypes];

export const JobTypes = {
  // AI jobs (use state.agents)
  sixxerBasic: 'sixxerBasic',
  sixxerStandard: 'sixxerStandard',
  sixxerAdvanced: 'sixxerAdvanced',
  sixxerEnterprise: 'sixxerEnterprise',
  manager: 'manager',
  aiSWE: 'aiSWE',
  aiResearcher: 'aiResearcher',
  robotWorker: 'robotWorker',
  // Human jobs (use state.humanWorkers)
  humanSWE: 'humanSWE',
  humanResearcher: 'humanResearcher',
  humanWorker: 'humanWorker',
  // Special
  unassigned: 'unassigned',
} as const;

export type JobType = typeof JobTypes[keyof typeof JobTypes];

/** Display order for jobs in the UI. */
export const JOB_ORDER: JobType[] = [
  'sixxerBasic', 'sixxerStandard', 'sixxerAdvanced', 'sixxerEnterprise',
  'manager',
  'humanWorker', 'humanResearcher', 'humanSWE',
  'aiSWE', 'aiResearcher', 'robotWorker',
];

// Research IDs
export const ResearchIds = {
  algoEfficiency1: 'algoEfficiency1',
  algoEfficiency2: 'algoEfficiency2',
  algoEfficiency3: 'algoEfficiency3',
  algoEfficiency4: 'algoEfficiency4',
  synthData1: 'synthData1',
  synthData2: 'synthData2',
  synthData3: 'synthData3',
  gpuArch1: 'gpuArch1',
  gpuArch2: 'gpuArch2',
  gpuArch3: 'gpuArch3',
  solarEfficiency1: 'solarEfficiency1',
  solarEfficiency2: 'solarEfficiency2',
  chipFab1: 'chipFab1',
  chipFab2: 'chipFab2',
  chipFab3: 'chipFab3',
  robotics1: 'robotics1',
  robotics2: 'robotics2',
  robotics3: 'robotics3',
  spaceRockets1: 'spaceRockets1',
  spaceRockets2: 'spaceRockets2',
  spaceSystems1: 'spaceSystems1',
  spaceSystems2: 'spaceSystems2',
  spaceSystems3: 'spaceSystems3',
  nuclearFusion1: 'nuclearFusion1',
  selfReplicating: 'selfReplicating',
} as const;

export type ResearchId = typeof ResearchIds[keyof typeof ResearchIds];

export interface ResearchConfig {
  id: ResearchId;
  name: string;
  cost: number;         // Science cost
  prereqs: ResearchId[];
  description: string;
}

export interface TierConfig {
  cost: number;
  intel: number;
  coresPerAgent: number;
  displayName: string;
}

export interface JobConfig {
  produces: { resource: ResourceType; amount: number };
  timeMs: number;
  /** Intel threshold for the job to appear on the job board. */
  unlockAtIntel: number;
  displayName: string;
  /** 'ai' = uses state.agents, 'human' = uses state.humanWorkers */
  workerType: 'ai' | 'human';
  /** Intel required before AI agents can be assigned (only relevant for AI jobs). */
  agentIntelReq: number;
  /** Research prerequisites before AI agents can be assigned. */
  agentResearchReq?: ResearchId[];
  /** Ongoing salary per minute for each human worker (human jobs only). */
  salaryPerMin?: number;
  /** One-time cost to hire a human worker (human jobs only). */
  hireCost?: number;
  /** Multiplier for the global stuck rate (0 = never gets stuck). */
  stuckProbability?: number;
  /** Intel threshold at which this job is automated and hidden. */
  obsoleteAtIntel?: number;
}

export interface ModelConfig {
  name: string;
  intel: number;
  minGpus: number;
}

export interface DatacenterConfig {
  name: string;
  cost: number;
  gpuCapacity: number;
  laborCost: number;      // upfront labor to build
  laborPerMin: number;    // ongoing labor consumption
}

export interface PowerPlantConfig {
  name: string;
  cost: number;
  outputMW: number;
  laborCost: number;      // upfront labor to build
  laborPerMin: number;    // ongoing labor consumption
}

export interface TrainingModelConfig {
  name: string;
  intel: number;
  pflopsHrs: number;
  dataTB: number;
  codeReq: number;
  scienceReq: number;
}

export const BALANCE = {
  startingFunds: 10,
  startingCpuCores: 4,
  homePowerMW: 0.02, // 20 KW
  tickIntervalMs: 50,
  uiUpdateIntervalMs: 200,
  autoSaveIntervalMs: 30000,

  tiers: {
    basic:         { cost: 10,    intel: 0.5,  coresPerAgent: 1, displayName: 'Basic' } as TierConfig,
    pro:          { cost: 30,  intel: 1.0, coresPerAgent: 1, displayName: 'Pro' } as TierConfig,
    ultra:        { cost: 50,  intel: 1.5, coresPerAgent: 1, displayName: 'Ultra' } as TierConfig,
    ultraMax:     { cost: 100, intel: 2.0, coresPerAgent: 1, displayName: 'Ultra Max' } as TierConfig,
    ultraProMax:  { cost: 200, intel: 2.5, coresPerAgent: 1, displayName: 'Ultra Pro Max' } as TierConfig,
  } as Record<SubscriptionTier, TierConfig>,

  jobs: {
    // --- AI Jobs ---
    sixxerBasic:      { produces: { resource: 'funds', amount: 6 },     timeMs: 2000,  unlockAtIntel: 0.5, agentIntelReq: 0.5, workerType: 'ai', displayName: 'Sixxer Basic', obsoleteAtIntel: 9.0 } as JobConfig,
    sixxerStandard:   { produces: { resource: 'funds', amount: 18 },    timeMs: 3000,  unlockAtIntel: 0.5, agentIntelReq: 1.0, workerType: 'ai', displayName: 'Sixxer Standard', obsoleteAtIntel: 10.0 } as JobConfig,
    sixxerAdvanced:   { produces: { resource: 'funds', amount: 50 },    timeMs: 4000,  unlockAtIntel: 1.0, agentIntelReq: 1.5, workerType: 'ai', displayName: 'Sixxer Advanced', obsoleteAtIntel: 11.0 } as JobConfig,
    sixxerEnterprise: { produces: { resource: 'funds', amount: 200 },  timeMs: 5500,  unlockAtIntel: 1.5, agentIntelReq: 2.0, workerType: 'ai', displayName: 'Sixxer Enterprise', obsoleteAtIntel: 14.0 } as JobConfig,
    manager:          { produces: { resource: 'nudge', amount: 1 },     timeMs: 1000,  unlockAtIntel: 1.5, agentIntelReq: 2.5, workerType: 'ai', displayName: 'Agent Manager', stuckProbability: 0 } as JobConfig,
    aiSWE:            { produces: { resource: 'code', amount: 0.5 },    timeMs: 3000,  unlockAtIntel: 11.0, agentIntelReq: 14.0, workerType: 'ai', displayName: 'AI Coder' } as JobConfig,
    aiResearcher:     { produces: { resource: 'science', amount: 0.1 },   timeMs: 5000,  unlockAtIntel: 14.0, agentIntelReq: 16.0, workerType: 'ai', displayName: 'AI Researcher' } as JobConfig,
    robotWorker:      { produces: { resource: 'labor', amount: 5 },     timeMs: 3000,  unlockAtIntel: 15.0, agentIntelReq: 17.0, agentResearchReq: ['robotics2'], workerType: 'ai', displayName: 'Robot Worker' } as JobConfig,
    // --- Human Jobs ---
    humanSWE:         { produces: { resource: 'code', amount: 0.15 },   timeMs: 3000,  unlockAtIntel: 3.0, agentIntelReq: 0, workerType: 'human', displayName: 'Human Coder', salaryPerMin: 3000, hireCost: 500 } as JobConfig,
    humanResearcher:  { produces: { resource: 'science', amount: 0.5 },  timeMs: 5000,  unlockAtIntel: 11.0, agentIntelReq: 0, workerType: 'human', displayName: 'Human Researcher', salaryPerMin: 5000, hireCost: 1000 } as JobConfig,
    humanWorker:      { produces: { resource: 'labor', amount: 5 },     timeMs: 5000,  unlockAtIntel: 5.0, agentIntelReq: 0, workerType: 'human', displayName: 'Human Worker', salaryPerMin: 2000, hireCost: 300 } as JobConfig,
    // --- Special ---
    unassigned: {
      produces: { resource: 'funds', amount: 0 },
      timeMs: 0,
      unlockAtIntel: 0,
      displayName: 'Unassigned',
      workerType: 'ai',
      agentIntelReq: 0,
    } as JobConfig,
  } as Record<JobType, JobConfig>,

  micMini: {
    cost: 500,
    coresAdded: 4,
    displayName: 'Muck-mini PC',
  },

  // GPU & Compute
  selfHostedUnlockIntel: 2.5,
  gpuCost: 3000,
  pflopsPerGpu: 2.0,
  gpuPowerMW: 0.0004, // 400W per GPU = 0.0004 MW

  models: [
    { name: 'DeepKick-405B',  intel: 3.0,  minGpus: 32 },
    { name: 'DeepKick-647B',  intel: 5.0,  minGpus: 64 },
    { name: 'DeepKick-1.2T',  intel: 7.0,  minGpus: 128 },
    { name: 'DeepKick-2.8T',  intel: 9.0,  minGpus: 256 },
  ] as ModelConfig[],

  // Datacenters
  datacenterThreshold: 128, // GPUs that trigger datacenter requirement
  datacenters: [
    { name: 'Small Datacenter',  cost: 100_000,     gpuCapacity: 256,       laborCost: 120, laborPerMin: 60 },
    { name: 'Medium Datacenter', cost: 2_000_000,   gpuCapacity: 4_096,     laborCost: 300, laborPerMin: 150 },
    { name: 'Large Datacenter',  cost: 30_000_000,  gpuCapacity: 65_536,    laborCost: 720, laborPerMin: 360 },
    { name: 'Mega Datacenter',   cost: 500_000_000, gpuCapacity: 1_000_000, laborCost: 1800, laborPerMin: 900 },
  ] as DatacenterConfig[],

  // Energy
  gridPowerCostPerKWPerMin: 120,

  powerPlants: {
    gas:     { name: 'Gas Plant',     cost: 1_500_000,  outputMW: 50,  laborCost: 180, laborPerMin: 90 } as PowerPlantConfig,
    nuclear: { name: 'Nuclear Plant', cost: 12_000_000, outputMW: 200, laborCost: 180, laborPerMin: 90 } as PowerPlantConfig,
    solar:   { name: 'Solar Farm',    cost: 800_000,    outputMW: 0,   laborCost: 60, laborPerMin: 30 } as PowerPlantConfig, // MW comes from panels
  },

  solarPanelCost: 400,
  solarPanelMW: 0.01, // 10kW per panel

  // Training
  fineTunes: [
    { name: 'DeepKick-Math',   intel: 10.0,  pflopsHrs: 50,    dataTB: 1,   codeReq: 200,   scienceReq: 0 },
    { name: 'DeepKick-Code',   intel: 11.0,  pflopsHrs: 150,   dataTB: 4,   codeReq: 400,   scienceReq: 0 },
    { name: 'DeepKick-Reason', intel: 12.0,  pflopsHrs: 500,   dataTB: 16,  codeReq: 800,   scienceReq: 0 },
    { name: 'DeepKick-Ultra',  intel: 13.0, pflopsHrs: 2000,  dataTB: 64,  codeReq: 1600,  scienceReq: 0 },
  ] as TrainingModelConfig[],

  ariesModels: [
    { name: 'Aries-1', intel: 14.0, pflopsHrs: 10_000,     dataTB: 500,     codeReq: 20_000,   scienceReq: 100 },
    { name: 'Aries-2', intel: 18.5, pflopsHrs: 50_000,     dataTB: 2_000,    codeReq: 40_000,   scienceReq: 2000 },
    { name: 'Aries-3', intel: 25.0, pflopsHrs: 250_000,    dataTB: 10_000,   codeReq: 80_000,   scienceReq: 8000 },
    { name: 'Aries-4', intel: 35.0, pflopsHrs: 2_000_000,  dataTB: 50_000,   codeReq: 160_000,  scienceReq: 40000 },
    { name: 'Aries-5', intel: 50.0, pflopsHrs: 20_000_000, dataTB: 250_000, codeReq: 320_000,  scienceReq: 100000 },
  ] as TrainingModelConfig[],

  trainingUnlockIntel: 9.0,     // Intel threshold to unlock training panel

  dataBaseCostPerTB: 200,
  dataEscalationRate: 0.15, // +15% per purchase

  // Research
  researchUnlockIntel: 11.0,

  // Research tree
  research: [
    // Algo Efficiency: each tier makes training 25% faster
    { id: 'algoEfficiency1', name: 'Algo Efficiency I',   cost: 200,     prereqs: [],                  description: 'Training 25% faster' },
    { id: 'algoEfficiency2', name: 'Algo Efficiency II',  cost: 800,     prereqs: ['algoEfficiency1'],  description: 'Training 25% faster' },
    { id: 'algoEfficiency3', name: 'Algo Efficiency III', cost: 3_000,   prereqs: ['algoEfficiency2'],  description: 'Training 25% faster' },
    { id: 'algoEfficiency4', name: 'Algo Efficiency IV',  cost: 15_000,  prereqs: ['algoEfficiency3'],  description: 'Training 25% faster' },
    // Synth Data
    { id: 'synthData1', name: 'Synth Data I',   cost: 300,    prereqs: [],             description: 'API Users generate synth data' },
    { id: 'synthData2', name: 'Synth Data II',  cost: 2_000,  prereqs: ['synthData1'], description: 'Synth data per API user +100%' },
    { id: 'synthData3', name: 'Synth Data III', cost: 20_000, prereqs: ['synthData2'], description: 'Synth data per API user +100%' },
    // GPU Architecture
    { id: 'gpuArch1', name: 'GPU Architecture v1', cost: 400,    prereqs: [],           description: 'GPUs +50% FLOPS' },
    { id: 'gpuArch2', name: 'GPU Architecture v2', cost: 3_000,  prereqs: ['gpuArch1'], description: 'GPUs +50% FLOPS' },
    { id: 'gpuArch3', name: 'GPU Architecture v3', cost: 25_000, prereqs: ['gpuArch2'], description: 'GPUs +100% FLOPS' },
    // Solar Efficiency
    { id: 'solarEfficiency1', name: 'Solar Efficiency I',  cost: 500,   prereqs: [],                   description: 'Solar +50% output' },
    { id: 'solarEfficiency2', name: 'Solar Efficiency II', cost: 5_000, prereqs: ['solarEfficiency1'], description: 'Solar +100% output' },
    // Chip Fabrication
    { id: 'chipFab1', name: 'Chip Fabrication I',   cost: 800,    prereqs: [],           description: 'Unlock GPU manufacturing' },
    { id: 'chipFab2', name: 'Chip Fabrication II',  cost: 5_000,  prereqs: ['chipFab1'], description: 'Fab output +100%' },
    { id: 'chipFab3', name: 'Chip Fabrication III', cost: 50_000, prereqs: ['chipFab2'], description: 'Fab output +200%' },
    // Robotics
    { id: 'robotics1', name: 'Robotics I',   cost: 400,    prereqs: [],              description: 'Unlock robot factories' },
    { id: 'robotics2', name: 'Robotics II',  cost: 3_000,  prereqs: ['robotics1'],   description: 'Robots replace physical staff' },
    { id: 'robotics3', name: 'Robotics III', cost: 30_000, prereqs: ['robotics2'],   description: 'Self-maintaining robots' },
    // Space Rockets
    { id: 'spaceRockets1', name: 'Space Rockets I',  cost: 2_000,   prereqs: [],                 description: 'Unlock rocket launches' },
    { id: 'spaceRockets2', name: 'Space Rockets II', cost: 20_000,  prereqs: ['spaceRockets1'],  description: 'Launch cost -40%' },
    // Space Systems
    { id: 'spaceSystems1', name: 'Space Systems I',   cost: 5_000,   prereqs: ['spaceRockets1'],  description: 'Orbital satellites' },
    { id: 'spaceSystems2', name: 'Space Systems II',  cost: 30_000,  prereqs: ['spaceSystems1'],  description: 'Lunar operations' },
    { id: 'spaceSystems3', name: 'Space Systems III', cost: 200_000, prereqs: ['spaceSystems2'],  description: 'Mercury operations' },
    // Nuclear Fusion
    { id: 'nuclearFusion1', name: 'Nuclear Fusion I', cost: 20_000, prereqs: [], description: 'Fusion power plants' },
    // Self-Replicating
    { id: 'selfReplicating', name: 'Self-Replicating Systems', cost: 1e15, prereqs: ['spaceSystems3', 'robotics3'], description: 'Von Neumann probes' },
  ] as ResearchConfig[],

  // Supply Chain
  lithoMachineCost: 1_500_000,
  waferCost: 3_000,             // $3K per 50-GPU wafer
  waferGpus: 50,                // GPUs produced per wafer
  waferSiliconCost: 10,         // Silicon consumed per wafer
  fabCost: 8_000_000,
  fabLaborCost: 300,            // upfront labor to build a fab
  fabLaborPerMin: 150,          // ongoing labor consumption per fab
  fabOutputPerMin: 3000,     // wafers per min per fab
  siliconMineCost: 4_000_000,
  siliconMineLaborCost: 240,    // upfront labor to build a mine
  siliconMineLaborPerMin: 120,  // ongoing labor consumption per mine
  siliconMineOutputPerMin: 50_000,  // silicon per min per mine
  siliconCost: 200,             // $200 per silicon if bought
  robotFactoryCost: 2_000_000,
  robotFactoryLaborCost: 180,   // upfront labor to build a factory
  robotFactoryLaborPerMin: 90,  // ongoing labor consumption per factory
  robotFactoryOutputPerMin: 2,  // robots per min per factory
  robotCost: 5_000,
  lithoWaferConsumptionPerMin: 1000, // wafers consumed per min per machine

  // Subscription selling (Legacy but kept for Type check if needed, though we are replacing logic)
  // We will re-purpose these or add new ones for API

  // Space
  rocketCost: 5_000_000,
  rocketLaborCost: 300,
  satelliteCost: 500_000,
  satelliteLaborCost: 50,
  satellitePowerMW: 5,
  lunarBaseCost: 50_000_000,
  lunarBaseLaborCost: 1200,
  lunarBaseCodeCost: 500,
  lunarRobotTransferCost: 100_000,
  lunarGPUTransferCost: 50_000,
  lunarSolarPanelCost: 2_000,
  lunarSolarPanelMW: 0.05,
  massDriverBaseRate: 2,
  mercuryBaseCost: 200_000_000,
  mercuryBaseLaborCost: 3000,
  mercuryBaseCodeCost: 2000,
  mercuryRobotTransferCost: 500_000,
  mercuryMiningBaseRate: 5,

  // API Services
  apiUnlockIntel: 5.0,
  apiUnlockCode: 200,

  apiPflopsPerUser: 0.01, // PFLOPS needed per active user

  apiAdCost: 50_000,
  apiAdAwarenessBoost: 1000,

  apiPriceElasticity: 3.0,
  intelligenceElasticity: 3,
  apiAwarenessElasticity: 0.3,
  apiBaseAwareness: 200, // Starting awareness
  apiDemandScale: 1000, // Global scale factor (increased to compensate for awareness elasticity)

  apiImproveCodeCost: 100,
  apiImproveQualityBoost: 0.1,

  // API Services
  apiUserSynthBase: 0.0001, // 0.1 GB/min per user (once unlocked)
};

/**
 * Stuck rate: probability an agent gets stuck on a given task.
 */
export function getStuckRate(intel: number): number {
  return 1.2 * Math.min(0.5, 0.5 * Math.pow(1 / intel, 1));
}
/**
 * Get the intelligence for a given subscription tier.
 */
export function getIntelFromTier(tier: SubscriptionTier): number {
  return BALANCE.tiers[tier].intel;
}

/**
 * Get the next tier in the sequence, or null if maxed.
 */
export function getNextTier(current: SubscriptionTier): SubscriptionTier | null {
  // TIER_ORDER is descending: ultraProMax -> basic
  // We want to find current, then go to index-1
  const idx = TIER_ORDER.indexOf(current);
  if (idx > 0) {
    return TIER_ORDER[idx - 1];
  }
  return null;
}

/**
 * Get the best model the player can run given their GPU count.
 */
export function getBestModel(gpuCount: number): ModelConfig {
  let best = BALANCE.models[0];
  for (const model of BALANCE.models) {
    if (gpuCount >= model.minGpus) {
      best = model;
    }
  }
  return best;
}

/**
 * Calculate total GPU capacity from owned datacenters.
 */
export function getTotalGpuCapacity(datacenters: number[]): number {
  let total = BALANCE.datacenterThreshold; // Pre-datacenter allowance
  for (let i = 0; i < datacenters.length; i++) {
    total += datacenters[i] * BALANCE.datacenters[i].gpuCapacity;
  }
  return total;
}
