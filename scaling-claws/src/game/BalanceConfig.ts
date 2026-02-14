export const SubscriptionTiers = {
  free: 'free',
  pro: 'pro',
  ultra: 'ultra',
  ultraMax: 'ultraMax',
  ultraProMax: 'ultraProMax',
} as const;

export type SubscriptionTier = typeof SubscriptionTiers[keyof typeof SubscriptionTiers];

export const TIER_ORDER: SubscriptionTier[] = [
  'ultraProMax', 'ultraMax', 'ultra', 'pro', 'free',
];

export const JobTypes = {
  sixxerBasic: 'sixxerBasic',
  sixxerStandard: 'sixxerStandard',
  sixxerAdvanced: 'sixxerAdvanced',
  sixxerEnterprise: 'sixxerEnterprise',
  aiCoder: 'aiCoder',
} as const;

export type JobType = typeof JobTypes[keyof typeof JobTypes];

export const JOB_ORDER: JobType[] = [
  'sixxerBasic', 'sixxerStandard', 'sixxerAdvanced', 'sixxerEnterprise', 'aiCoder',
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
  costPerMin: number;
  intel: number;
  taskLimitPerDay: number | null;
  coresPerAgent: number;
  displayName: string;
}

export interface JobConfig {
  reward: number;
  timeMs: number;
  intelReq: number;
  displayName: string;
}

export interface ModelConfig {
  name: string;
  intel: number;
  pflopsPerInstance: number;
  minGpus: number;
}

export interface DatacenterConfig {
  name: string;
  cost: number;
  gpuCapacity: number;
  engineersRequired: number;
}

export interface PowerPlantConfig {
  name: string;
  cost: number;
  outputMW: number;
  engineersRequired: number;
}

export const BALANCE = {
  startingFunds: 0,
  startingCpuCores: 6,
  tickIntervalMs: 100,
  uiUpdateIntervalMs: 500,
  autoSaveIntervalMs: 30000,

  tiers: {
    free:         { costPerMin: 0,   intel: 1.0, taskLimitPerDay: 10,   coresPerAgent: 1, displayName: 'Free' } as TierConfig,
    pro:          { costPerMin: 20,  intel: 1.0, taskLimitPerDay: 50,   coresPerAgent: 1, displayName: 'Pro' } as TierConfig,
    ultra:        { costPerMin: 50,  intel: 1.5, taskLimitPerDay: null,  coresPerAgent: 2, displayName: 'Ultra' } as TierConfig,
    ultraMax:     { costPerMin: 120, intel: 2.0, taskLimitPerDay: null,  coresPerAgent: 4, displayName: 'Ultra Max' } as TierConfig,
    ultraProMax:  { costPerMin: 200, intel: 2.5, taskLimitPerDay: null,  coresPerAgent: 8, displayName: 'Ultra Pro Max' } as TierConfig,
  } as Record<SubscriptionTier, TierConfig>,

  jobs: {
    sixxerBasic:      { reward: 6,     timeMs: 2000,   intelReq: 1.0,  displayName: 'Sixxer Basic' } as JobConfig,
    sixxerStandard:   { reward: 18,    timeMs: 3000,  intelReq: 1.5,  displayName: 'Sixxer Standard' } as JobConfig,
    sixxerAdvanced:   { reward: 50,    timeMs: 4000,  intelReq: 2.0,  displayName: 'Sixxer Advanced' } as JobConfig,
    sixxerEnterprise: { reward: 1000,   timeMs: 5500,  intelReq: 2.5,  displayName: 'Sixxer Enterprise' } as JobConfig,
    aiCoder:          { reward: 2000,  timeMs: 12000, intelReq: 15.0, displayName: 'AI Coder' } as JobConfig,
  } as Record<JobType, JobConfig>,

  micMini: {
    cost: 800,
    coresAdded: 8,
    displayName: 'Mic-mini PC',
  },

  managerNudgesPerMin: 6,
  managerSquaredNudgesPerMin: 10,
  managedAgentsPerManager: 12,
  managedManagersPerManager2: 8,

  // GPU & Compute
  gpuCost: 3000,
  pflopsPerGpu: 2.0,
  gpuPowerMW: 0.0004, // 400W per GPU = 0.0004 MW

  models: [
    { name: 'DeepKick-405B',  intel: 2.5,  pflopsPerInstance: 2.0,  minGpus: 1 },
    { name: 'DeepKick-647B',  intel: 3.5,  pflopsPerInstance: 4.0,  minGpus: 16 },
    { name: 'DeepKick-1.2T',  intel: 5.0,  pflopsPerInstance: 8.0,  minGpus: 48 },
    { name: 'DeepKick-2.8T',  intel: 7.0,  pflopsPerInstance: 16.0, minGpus: 128 },
  ] as ModelConfig[],

  // Datacenters
  datacenterThreshold: 32, // GPUs that trigger datacenter requirement
  datacenters: [
    { name: 'Small Datacenter',  cost: 100_000,     gpuCapacity: 256,    engineersRequired: 2 },
    { name: 'Medium Datacenter', cost: 2_000_000,   gpuCapacity: 4_096,  engineersRequired: 5 },
    { name: 'Large Datacenter',  cost: 30_000_000,  gpuCapacity: 65_536, engineersRequired: 12 },
    { name: 'Mega Datacenter',   cost: 500_000_000, gpuCapacity: 1_000_000, engineersRequired: 30 },
  ] as DatacenterConfig[],

  // Energy
  gridPowerCostPerMWPerMin: 800, // $800/min per 5MW block → $160/MW/min
  gridBlockMW: 5,
  gridCostPerBlockPerMin: 800,

  powerPlants: {
    gas:     { name: 'Gas Plant',     cost: 1_500_000,  outputMW: 50,  engineersRequired: 3 } as PowerPlantConfig,
    nuclear: { name: 'Nuclear Plant', cost: 12_000_000, outputMW: 200, engineersRequired: 3 } as PowerPlantConfig,
    solar:   { name: 'Solar Farm',    cost: 800_000,    outputMW: 0,   engineersRequired: 1 } as PowerPlantConfig, // MW comes from panels
  },

  solarPanelCost: 400,
  solarPanelMW: 0.01, // 10kW per panel

  // Engineers
  humanEngineerCostPerMin: 200,

  // Training
  fineTunes: [
    { name: 'DeepKick-Math',   intel: 6.0,  pflopsHrs: 50,    dataTB: 20,   codeReq: 20 },
    { name: 'DeepKick-Code',   intel: 7.5,  pflopsHrs: 150,   dataTB: 60,   codeReq: 0 },
    { name: 'DeepKick-Reason', intel: 9.0,  pflopsHrs: 500,   dataTB: 200,  codeReq: 0 },
    { name: 'DeepKick-Ultra',  intel: 11.0, pflopsHrs: 2000,  dataTB: 800,  codeReq: 0 },
  ],

  ariesModels: [
    { name: 'Aries-1', intel: 14.0, pflopsHrs: 10_000,     dataTB: 5_000,     codeReq: 100 },
    { name: 'Aries-2', intel: 18.5, pflopsHrs: 50_000,     dataTB: 20_000,    codeReq: 0 },
    { name: 'Aries-3', intel: 25.0, pflopsHrs: 250_000,    dataTB: 100_000,   codeReq: 0 },
    { name: 'Aries-4', intel: 35.0, pflopsHrs: 2_000_000,  dataTB: 500_000,   codeReq: 0 },
    { name: 'Aries-5', intel: 50.0, pflopsHrs: 20_000_000, dataTB: 3_000_000, codeReq: 0 },
  ],

  trainingUnlockDatacenters: 2, // Need 2+ DCs to unlock training
  trainingUnlockCode: 20,       // Need 20 Code for fine-tune pipeline

  dataBaseCostPerTB: 200,
  dataEscalationRate: 0.15, // +15% per purchase

  // Software Devs
  humanDevCostPerMin: 300,
  humanDevCodePerMin: 1,
  aiDevCodePerMinPerIntel: 0.25, // Code/min = intel * this

  // Research
  researchUnlockIntel: 12.0,
  aiResearcherSciencePerMinPerIntel: 1,

  // Research tree
  research: [
    // Algo Efficiency: each tier makes training 25% faster
    { id: 'algoEfficiency1', name: 'Algo Efficiency I',   cost: 200,     prereqs: [],                  description: 'Training 25% faster' },
    { id: 'algoEfficiency2', name: 'Algo Efficiency II',  cost: 800,     prereqs: ['algoEfficiency1'],  description: 'Training 25% faster' },
    { id: 'algoEfficiency3', name: 'Algo Efficiency III', cost: 3_000,   prereqs: ['algoEfficiency2'],  description: 'Training 25% faster' },
    { id: 'algoEfficiency4', name: 'Algo Efficiency IV',  cost: 15_000,  prereqs: ['algoEfficiency3'],  description: 'Training 25% faster' },
    // Synth Data
    { id: 'synthData1', name: 'Synth Data I',   cost: 300,    prereqs: [],             description: 'Unlock synth data (150 Code)' },
    { id: 'synthData2', name: 'Synth Data II',  cost: 2_000,  prereqs: ['synthData1'], description: 'Synth data 2x faster' },
    { id: 'synthData3', name: 'Synth Data III', cost: 20_000, prereqs: ['synthData2'], description: 'Synth data 2x faster' },
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
  waferBatchCost: 3_000,        // $3K per 50-GPU wafer batch
  waferBatchGpus: 50,           // GPUs produced per wafer batch
  fabCost: 8_000_000,
  fabEngineers: 5,
  fabOutputPerMin: 10,          // wafer batches per min per fab
  siliconMineCost: 4_000_000,
  siliconMineEngineers: 4,
  robotFactoryCost: 2_000_000,
  robotFactoryEngineers: 3,
  robotFactoryOutputPerMin: 2,  // robots per min per factory
  robotCost: 5_000,

  // Subscription selling
  subSellingUnlockIntel: 8.0,
  subSellingUnlockCode: 200,
  subscriberPflopsPerSub: 2.0,  // PFLOPS reserved per subscriber
  adCost: 50_000,               // cost of ad campaign
  adAwarenessBoost: 1_500,      // awareness gained per ad
  subscriberGrowthRate: 0.05,   // fraction of (demand - current) that converts per min

  // Synth data
  synthDataPflopsPerTBPerMin: 5, // 5 PFLOPS → 1 TB/min
};

/**
 * Stuck rate: probability an agent gets stuck on a given task.
 * Intel 0.5 → ~25%, Intel 2.5 → ~8%, Intel 10 → ~1%, Intel 50 → ~0.04%
 */
export function getStuckRate(intel: number): number {
  return Math.min(0.35, 0.25 * Math.pow(0.5 / intel, 1.2));
}

/**
 * Get the best job type the player's current intel can handle.
 */
export function getBestJobType(intel: number): JobType {
  let best: JobType = 'sixxerBasic';
  for (const jt of JOB_ORDER) {
    if (intel >= BALANCE.jobs[jt].intelReq) {
      best = jt;
    }
  }
  return best;
}

/**
 * Get the current intelligence from the best subscription tier owned.
 */
export function getIntelFromSubscriptions(subscriptions: Record<SubscriptionTier, number>): number {
  let best = 0;
  for (const tier of TIER_ORDER) {
    if (subscriptions[tier] > 0) {
      best = Math.max(best, BALANCE.tiers[tier].intel);
    }
  }
  return best;
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
