import { toBigInt, scaleBigInt, mulB } from './utils.ts';

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

  // Revised Supply Chain Techs
  materialProcessing: 'materialProcessing', // Unlock Mines
  solarTechnology: 'solarTechnology',       // Unlock Solar Factory
  robotics1: 'robotics1',                   // Unlock Robot Factory
  chipManufacturing: 'chipManufacturing',   // Unlock GPU Factory
  rocketry: 'rocketry',                     // Unlock Rocket Factory
  reusableRockets: 'reusableRockets',       // Rockets return
  orbitalLogistics: 'orbitalLogistics',     // GPU Satellites

  robotics2: 'robotics2',
  robotics3: 'robotics3',

  spaceSystems1: 'spaceSystems1', // Satellites renaming/adjusting?
  spaceSystems2: 'spaceSystems2', // Moon
  spaceSystems3: 'spaceSystems3', // Mercury

  nuclearFusion1: 'nuclearFusion1',
  selfReplicating: 'selfReplicating',
} as const;

export type ResearchId = typeof ResearchIds[keyof typeof ResearchIds];

export interface ResearchConfig {
  id: ResearchId;
  name: string;
  cost: bigint;         // Science cost
  prereqs: ResearchId[];
  description: string;
}

export interface TierConfig {
  cost: bigint;
  intel: number;
  coresPerAgent: number;
  displayName: string;
}

export interface JobConfig {
  produces: { resource: ResourceType; amount: bigint };
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
  salaryPerMin?: bigint;
  /** One-time cost to hire a human worker (human jobs only). */
  hireCost?: bigint;
  /** Multiplier for the global stuck rate (0 = never gets stuck). */
  stuckProbability?: number;
  /** Intel threshold at which this job is automated and hidden. */
  obsoleteAtIntel?: number;
}

export interface ModelConfig {
  name: string;
  intel: number;
  minGpus: bigint;
}

export interface DatacenterConfig {
  name: string;
  cost: bigint;
  gpuCapacity: bigint;
  laborCost: bigint;      // upfront labor to build
}

export interface PowerPlantConfig {
  name: string;
  cost: bigint;
  outputMW: bigint;       // output in MW
  laborCost: bigint;      // upfront labor to build
  limit?: number;         // Earth limit
}

export interface TrainingModelConfig {
  name: string;
  intel: number;
  pflopsHrs: bigint;
  dataTB: bigint;
  codeReq: bigint;
  scienceReq: bigint;
}

export const BALANCE = {
  startingFunds: 10000000000000,
  startingCpuCores: 4,
  homePowerMW: 0.02, // 20 KW
  tickIntervalMs: 50,
  uiUpdateIntervalMs: 200,
  autoSaveIntervalMs: 30000,

  tiers: {
    basic:         { cost: toBigInt(10),       intel: 0.5,  coresPerAgent: 1, displayName: 'Basic' } as TierConfig,
    pro:          { cost: toBigInt(30),       intel: 1.0, coresPerAgent: 1, displayName: 'Pro' } as TierConfig,
    ultra:        { cost: toBigInt(50),       intel: 1.5, coresPerAgent: 1, displayName: 'Ultra' } as TierConfig,
    ultraMax:     { cost: toBigInt(100),      intel: 2.0, coresPerAgent: 1, displayName: 'Ultra Max' } as TierConfig,
    ultraProMax:  { cost: toBigInt(200),      intel: 2.5, coresPerAgent: 1, displayName: 'Ultra Pro Max' } as TierConfig,
  } as Record<SubscriptionTier, TierConfig>,

  jobs: {
    // --- AI Jobs ---
    sixxerBasic:      { produces: { resource: 'funds', amount: toBigInt(6) },     timeMs: 2000,  unlockAtIntel: 0.5, agentIntelReq: 0.5, workerType: 'ai', displayName: 'Sixxer Basic', obsoleteAtIntel: 9.0 } as JobConfig,
    sixxerStandard:   { produces: { resource: 'funds', amount: toBigInt(18) },    timeMs: 3000,  unlockAtIntel: 0.5, agentIntelReq: 1.0, workerType: 'ai', displayName: 'Sixxer Standard', obsoleteAtIntel: 10.0 } as JobConfig,
    sixxerAdvanced:   { produces: { resource: 'funds', amount: toBigInt(50) },    timeMs: 4000,  unlockAtIntel: 1.0, agentIntelReq: 1.5, workerType: 'ai', displayName: 'Sixxer Advanced', obsoleteAtIntel: 11.0 } as JobConfig,
    sixxerEnterprise: { produces: { resource: 'funds', amount: toBigInt(200) },   timeMs: 5500,  unlockAtIntel: 1.5, agentIntelReq: 2.0, workerType: 'ai', displayName: 'Sixxer Enterprise', obsoleteAtIntel: 14.0 } as JobConfig,
    manager:          { produces: { resource: 'nudge', amount: toBigInt(1) },     timeMs: 1000,  unlockAtIntel: 1.5, agentIntelReq: 2.5, workerType: 'ai', displayName: 'Agent Manager', stuckProbability: 0 } as JobConfig,
    aiSWE:            { produces: { resource: 'code', amount: toBigInt(0.5) },   timeMs: 3000,  unlockAtIntel: 11.0, agentIntelReq: 14.0, workerType: 'ai', displayName: 'AI Coder' } as JobConfig,
    aiResearcher:     { produces: { resource: 'science', amount: toBigInt(0.1) }, timeMs: 5000,  unlockAtIntel: 14.0, agentIntelReq: 16.0, workerType: 'ai', displayName: 'AI Researcher' } as JobConfig,
    robotWorker:      { produces: { resource: 'labor', amount: toBigInt(5) },     timeMs: 3000,  unlockAtIntel: 15.0, agentIntelReq: 17.0, agentResearchReq: ['robotics2'], workerType: 'ai', displayName: 'Robot Worker' } as JobConfig,
    // --- Human Jobs ---
    humanSWE:         { produces: { resource: 'code', amount: toBigInt(0.15) },  timeMs: 3000,  unlockAtIntel: 3.0, agentIntelReq: 0, workerType: 'human', displayName: 'Human Coder', salaryPerMin: toBigInt(3000), hireCost: toBigInt(500) } as JobConfig,
    humanResearcher:  { produces: { resource: 'science', amount: toBigInt(0.5) },timeMs: 5000,  unlockAtIntel: 11.0, agentIntelReq: 0, workerType: 'human', displayName: 'Human Researcher', salaryPerMin: toBigInt(5000), hireCost: toBigInt(1000) } as JobConfig,
    humanWorker:      { produces: { resource: 'labor', amount: toBigInt(5) },     timeMs: 5000,  unlockAtIntel: 5.0, agentIntelReq: 0, workerType: 'human', displayName: 'Human Worker', salaryPerMin: toBigInt(2000), hireCost: toBigInt(300) } as JobConfig,
    // --- Special ---
    unassigned: {
      produces: { resource: 'funds', amount: 0n },
      timeMs: 0,
      unlockAtIntel: 0,
      displayName: 'Unassigned',
      workerType: 'ai',
      agentIntelReq: 0,
    } as JobConfig,
  } as Record<JobType, JobConfig>,


  micMini: {
    cost: toBigInt(500),
    coresAdded: scaleBigInt(4n),
    displayName: 'Muck-mini PC',
  },

  // GPU & Compute
  selfHostedUnlockIntel: 2.5,
  gpuCost: toBigInt(3000),
  pflopsPerGpu: 2.0,
  gpuPowerMW: 0.0004, // 400W per GPU = 0.0004 MW

  models: [
    { name: 'DeepKick-405B',  intel: 3.0,  minGpus: scaleBigInt(32n) },
    { name: 'DeepKick-647B',  intel: 5.0,  minGpus: scaleBigInt(64n) },
    { name: 'DeepKick-1.2T',  intel: 7.0,  minGpus: scaleBigInt(128n) },
    { name: 'DeepKick-2.8T',  intel: 9.0,  minGpus: scaleBigInt(256n) },
  ] as ModelConfig[],

  // Datacenters
  datacenterThreshold: scaleBigInt(128n),
  datacenters: [
    { name: 'Small Datacenter',  cost: toBigInt(100_000),    gpuCapacity: scaleBigInt(256n),      laborCost: toBigInt(120) },
    { name: 'Medium Datacenter', cost: toBigInt(2_000_000),  gpuCapacity: scaleBigInt(4_096n),    laborCost: toBigInt(300) },
    { name: 'Large Datacenter',  cost: scaleBigInt(30_000_000n), gpuCapacity: scaleBigInt(65_536n),   laborCost: toBigInt(720) },
    { name: 'Mega Datacenter',   cost: scaleBigInt(500_000_000n), gpuCapacity: scaleBigInt(1_000_000n), laborCost: toBigInt(1800) },
  ] as DatacenterConfig[],

  // Energy
  gridPowerKWCost: 500, // One-time cost per KW

  powerPlants: {
    gas:     { name: 'Gas Plant',     cost: toBigInt(1_500_000),  outputMW: toBigInt(50),  laborCost: toBigInt(500), limit: 10000 } as PowerPlantConfig,
    nuclear: { name: 'Nuclear Plant', cost: toBigInt(1_200_000_000), outputMW: toBigInt(1000), laborCost: toBigInt(18000), limit: 500 } as PowerPlantConfig,
    solar:   { name: 'Solar Farm',    cost: toBigInt(800_000),   outputMW: 0n,   laborCost: toBigInt(60), limit: 20 } as PowerPlantConfig,
  },

  solarPanelCost: toBigInt(400),
  solarPanelMW: 0.01, // 10kW per panel

  // Training
  fineTunes: [
    { name: 'DeepKick-Math',   intel: 10.0,  pflopsHrs: toBigInt(50),    dataTB: toBigInt(1),   codeReq: toBigInt(200),   scienceReq: 0n },
    { name: 'DeepKick-Code',   intel: 11.0,  pflopsHrs: toBigInt(150),   dataTB: toBigInt(4),   codeReq: toBigInt(400),   scienceReq: 0n },
    { name: 'DeepKick-Reason', intel: 12.0,  pflopsHrs: toBigInt(500),   dataTB: toBigInt(16),  codeReq: toBigInt(800),   scienceReq: 0n },
    { name: 'DeepKick-Ultra',  intel: 13.0, pflopsHrs: toBigInt(2000),  dataTB: toBigInt(64),  codeReq: toBigInt(1600),  scienceReq: 0n },
  ] as TrainingModelConfig[],

  ariesModels: [
    { name: 'Aries-1', intel: 14.0, pflopsHrs: toBigInt(10_000),     dataTB: toBigInt(500),     codeReq: toBigInt(20_000),   scienceReq: toBigInt(100) },
    { name: 'Aries-2', intel: 18.5, pflopsHrs: toBigInt(50_000),     dataTB: toBigInt(2_000),    codeReq: toBigInt(40_000),   scienceReq: toBigInt(2000) },
    { name: 'Aries-3', intel: 25.0, pflopsHrs: toBigInt(250_000),    dataTB: toBigInt(10_000),   codeReq: toBigInt(80_000),   scienceReq: toBigInt(8000) },
    { name: 'Aries-4', intel: 35.0, pflopsHrs: toBigInt(2_000_000),  dataTB: toBigInt(50_000),   codeReq: toBigInt(160_000),  scienceReq: toBigInt(40000) },
    { name: 'Aries-5', intel: 50.0, pflopsHrs: toBigInt(20_000_000), dataTB: toBigInt(250_000), codeReq: toBigInt(320_000),  scienceReq: toBigInt(100000) },
  ] as TrainingModelConfig[],

  trainingUnlockIntel: 9.0,     // Intel threshold to unlock training panel

  dataBaseCostPerTB: toBigInt(200),
  dataEscalationRate: 0.15, // +15% per purchase

  // Research
  researchUnlockIntel: 11.0,

  // Research tree
  research: [
    // Algo Efficiency
    { id: 'algoEfficiency1', name: 'Algo Efficiency I',   cost: toBigInt(200),     prereqs: [],                  description: 'Training 25% faster' },
    { id: 'algoEfficiency2', name: 'Algo Efficiency II',  cost: toBigInt(800),     prereqs: ['algoEfficiency1'],  description: 'Training 25% faster' },
    { id: 'algoEfficiency3', name: 'Algo Efficiency III', cost: toBigInt(3000),    prereqs: ['algoEfficiency2'],  description: 'Training 25% faster' },
    { id: 'algoEfficiency4', name: 'Algo Efficiency IV',  cost: toBigInt(15000),   prereqs: ['algoEfficiency3'],  description: 'Training 25% faster' },
    // Synth Data
    { id: 'synthData1', name: 'API Data I',   cost: toBigInt(300),    prereqs: [],             description: 'API Users generate synth data' },
    { id: 'synthData2', name: 'API Data II',  cost: toBigInt(2000),   prereqs: ['synthData1'], description: 'Synth data per API user +100%' },
    { id: 'synthData3', name: 'API Data III', cost: toBigInt(20000),  prereqs: ['synthData2'], description: 'Synth data per API user +100%' },
    // GPU Architecture
    { id: 'gpuArch1', name: 'GPU Architecture v1', cost: toBigInt(400),    prereqs: ['chipManufacturing'],           description: 'GPUs +50% FLOPS' },
    { id: 'gpuArch2', name: 'GPU Architecture v2', cost: toBigInt(3000),  prereqs: ['gpuArch1'], description: 'GPUs +50% FLOPS' },
    { id: 'gpuArch3', name: 'GPU Architecture v3', cost: toBigInt(25000), prereqs: ['gpuArch2'], description: 'GPUs +100% FLOPS' },
    // Solar Efficiency
    { id: 'solarEfficiency1', name: 'Solar Efficiency I',  cost: toBigInt(500),   prereqs: ['solarTechnology'],                   description: 'Solar +50% output' },
    { id: 'solarEfficiency2', name: 'Solar Efficiency II', cost: toBigInt(5000),  prereqs: ['solarEfficiency1'], description: 'Solar +100% output' },

    // Supply Chain (New)
    { id: 'materialProcessing', name: 'Material Processing', cost: toBigInt(200), prereqs: [], description: 'Unlock Mines' },
    { id: 'solarTechnology', name: 'Solar Technology', cost: toBigInt(400), prereqs: ['materialProcessing'], description: 'Unlock Solar Factory' },
    { id: 'robotics1', name: 'Robotics I',   cost: toBigInt(500),    prereqs: ['materialProcessing'], description: 'Unlock Robot Factory' },
    { id: 'chipManufacturing', name: 'Chip Manufacturing', cost: toBigInt(800), prereqs: ['materialProcessing'], description: 'Unlock GPU Factory' },
    { id: 'rocketry', name: 'Rocketry', cost: toBigInt(2000), prereqs: ['materialProcessing'], description: 'Unlock Rocket Factory' },
    { id: 'orbitalLogistics', name: 'Orbital Logistics', cost: toBigInt(5000), prereqs: ['rocketry'], description: 'Launch Satellites' },

    { id: 'reusableRockets', name: 'Reusable Rockets', cost: toBigInt(10000), prereqs: ['rocketry'], description: 'Rockets return after launch' },

    { id: 'robotics2', name: 'Robotics II',  cost: toBigInt(3000),   prereqs: ['robotics1'],   description: 'Robots replace physical staff' },
    { id: 'robotics3', name: 'Robotics III', cost: toBigInt(30000),  prereqs: ['robotics2'],   description: 'Self-maintaining robots' },

    { id: 'spaceSystems1', name: 'Space Systems I',   cost: toBigInt(5000),   prereqs: ['orbitalLogistics'],  description: 'Advanced satellites' },
    { id: 'spaceSystems2', name: 'Space Systems II',  cost: toBigInt(30000),  prereqs: ['spaceSystems1'],  description: 'Lunar Base' },
    { id: 'spaceSystems3', name: 'Space Systems III', cost: toBigInt(200000), prereqs: ['spaceSystems2'],  description: 'Mercury Base' },

    { id: 'nuclearFusion1', name: 'Nuclear Fusion I', cost: toBigInt(20_000), prereqs: [], description: 'Fusion power plants' },
    { id: 'selfReplicating', name: 'Self-Replicating Systems', cost: scaleBigInt(1_000_000_000_000_000n), prereqs: ['spaceSystems3', 'robotics3'], description: 'Von Neumann probes' },
  ] as ResearchConfig[],

  // Supply Chain (Overhauled)
  // Costs to BUY (Import)
  materialCost: toBigInt(100),
  solarPanelImportCost: toBigInt(500),
  robotImportCost: toBigInt(1000),
  rocketImportCost: toBigInt(100_000),
  gpuImportCost: toBigInt(2000),
  gpuSatelliteImportCost: toBigInt(5000),

  // Facilities
  // Mines
  materialMineCost: toBigInt(5000),
  materialMineLaborCost: toBigInt(10),
  materialMineOutput: toBigInt(20), // per min (Combined efficiency)
  materialMineLimit: 200,

  // Factories
  // GPU Factory: Material -> GPU
  gpuFactoryCost: toBigInt(50_000),
  gpuFactoryLaborCost: toBigInt(200),
  gpuFactoryLimit: 50,
  gpuFactoryOutput: toBigInt(1), // 1 GPU/min
  gpuFactoryMaterialReq: toBigInt(20), // 20 Material per GPU

  // Solar Factory: Material -> Solar Panel
  solarFactoryCost: toBigInt(10_000),
  solarFactoryLaborCost: toBigInt(50),
  solarFactoryLimit: 50,
  solarFactoryOutput: toBigInt(1), // 1 Panel/min
  solarFactoryMaterialReq: toBigInt(10),

  // Robot Factory: Material -> Robot
  robotFactoryCost: toBigInt(20_000),
  robotFactoryLaborCost: toBigInt(100),
  robotFactoryLimit: 50,
  robotFactoryOutput: toBigInt(1), // 1 Robot/min
  robotFactoryMaterialReq: toBigInt(20),

  // Rocket Factory: Material -> Rocket
  rocketFactoryCost: toBigInt(500_000),
  rocketFactoryLaborCost: toBigInt(500),
  rocketFactoryLimit: 10,
  rocketFactoryOutput: 0.1, // 0.1 Rocket/min (1 every 10 min)
  rocketFactoryMaterialReq: toBigInt(1000), // (consumes rate per min based on output) => 1000 material per rocket * 0.1 = 100 material/min

  // GPU Satellite Factory: Material + GPU -> GPU Satellite
  gpuSatelliteFactoryCost: toBigInt(500_000),
  gpuSatelliteFactoryLaborCost: toBigInt(500),
  gpuSatelliteFactoryLimit: 20,
  gpuSatelliteFactoryOutput: 0.2, // 1 every 5 min
  gpuSatelliteFactoryMaterialReq: toBigInt(500), // per item => 100/min
  gpuSatelliteFactoryGpuReq: toBigInt(10), // per item => 2/min

  // Space Logistics
  rocketCapacityLowOrbit: 100 * 1000, // kg
  rocketCapacityLunar: 10 * 1000, // kg

  // Weights (kg)
  robotWeight: 100,
  solarPanelWeight: 50,
  gpuWeight: 10,
  gpuSatelliteWeight: 1000, // 1 Ton

  // Space
  satellitePowerMW: 5.0,
  lunarBaseCost: toBigInt(50_000_000),
  lunarBaseLaborCost: toBigInt(1200),
  lunarBaseCodeCost: toBigInt(500),

  mercuryBaseCost: toBigInt(200_000_000),
  mercuryBaseLaborCost: toBigInt(3000),
  mercuryBaseCodeCost: toBigInt(2000),

  // Moon Facilities
  moonMineCostLabor: toBigInt(100),
  moonMineOutput: toBigInt(100), // Material/min

  moonFactoryCostLabor: toBigInt(500),
  moonFactoryMaterialCost: toBigInt(10_000),

  moonDatacenterCostLabor: toBigInt(1000),
  moonDatacenterMaterialCost: toBigInt(50_000),

  moonMassDriverCostLabor: toBigInt(2000),
  moonMassDriverMaterialCost: toBigInt(100_000),
  moonMassDriverPayloadRate: 1000, // kg/min per driver

  // Mercury
  mercuryMassDriverCostLabor: toBigInt(5000),
  mercuryMassDriverMaterialCost: toBigInt(500_000),

  // API Services
  apiUnlockIntel: 5.0,
  apiUnlockCode: toBigInt(200),

  apiPflopsPerUser: 0.01, // PFLOPS needed per active user

  apiAdCost: toBigInt(1),
  apiAdAwarenessBoost: 1,

  apiPriceElasticity: 3.0,
  intelligenceElasticity: 3,
  apiAwarenessElasticity: 0.7,
  apiBaseAwareness: 200, // Starting awareness
  apiDemandScale: 1000, // Global scale factor (increased to compensate for awareness elasticity)

  apiImproveCodeCost: toBigInt(100),
  apiImproveQualityBoost: 0.1,

  // API Services
  apiUserSynthBase: 100n,
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
export function getBestModel(gpuCount: bigint): ModelConfig {
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
export function getTotalGpuCapacity(datacenters: bigint[]): bigint {
  let total = BALANCE.datacenterThreshold; // Pre-datacenter allowance
  for (let i = 0; i < datacenters.length; i++) {
    total += mulB(datacenters[i], BALANCE.datacenters[i].gpuCapacity);
  }
  return total;
}
