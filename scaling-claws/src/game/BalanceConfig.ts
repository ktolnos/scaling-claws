/**
 * Balancing conventions:
 * - 1 minute of real time = 1 month in game for all time-based calculations (job times, research times, salaries, etc.)
 * - 1 material = 1 tonn of raw materials (unenriched ore)
 * - All prices are in dollars
 * - The game strives to have realistic numbers when possible.
 * - bigint is used for all large numbers. All bigints are scaled by default to allow for fixed-point precision (see utils.ts for details). If a number is not scaled, it should be noted in a comment.
 * - This is not an idle game when played optimally. No wait times > 10 seconds.
 * - new mechanics should be introcued gradually to the player.
 * - the bottlneck resource should change throughout the game. The player should see the way to remove the bottleneck. E.g. if the bottleneck is money, the player should see the job that produces more money (even if it is locked), if the bottleneck is data, the player should see a research that increases data generation, etc. 
 * - No research should be useless, each research should exist to solve some bottleneck. E.g. if the player is never constrained by the data, the synthetic data research would be useless. This should be resolved by adjusting data requirements in such a way that the player is constrained by the data when the research is unlocked. This applies to all research.
 */

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
  data: 'data',
  nudge: 'nudge',
} as const;

export type ResourceType = typeof ResourceTypes[keyof typeof ResourceTypes];

export const JobTypes = {
  // AI jobs
  sixxerBasic: 'sixxerBasic',
  sixxerStandard: 'sixxerStandard',
  sixxerAdvanced: 'sixxerAdvanced',
  sixxerEnterprise: 'sixxerEnterprise',
  manager: 'manager',
  aiSWE: 'aiSWE',
  aiResearcher: 'aiResearcher',
  aiDataSynthesizer: 'aiDataSynthesizer',
  robotWorker: 'robotWorker',
  // Human jobs
  humanSWE: 'humanSWE',
  humanResearcher: 'humanResearcher',
  humanWorker: 'humanWorker',
  // Special
  unassigned: 'unassigned',
} as const;

export type JobType = typeof JobTypes[keyof typeof JobTypes];
export type FacilityProductionId =
  | 'materialMine'
  | 'solarFactory'
  | 'robotFactory'
  | 'gpuFactory'
  | 'rocketFactory'
  | 'gpuSatelliteFactory'
  | 'massDriver';

/** Display order for jobs in the UI. */
export const JOB_ORDER: JobType[] = [
  'sixxerBasic', 'sixxerStandard', 'sixxerAdvanced', 'sixxerEnterprise',
  'manager',
  'robotWorker', 'humanWorker', 'humanResearcher', 'humanSWE',
  'aiSWE', 'aiResearcher', 'aiDataSynthesizer',
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
  syntheticData1: 'syntheticData1',
  syntheticData2: 'syntheticData2',
  syntheticData3: 'syntheticData3',
  gpuArch1: 'gpuArch1',
  gpuArch2: 'gpuArch2',
  gpuArch3: 'gpuArch3',
  solarEfficiency1: 'solarEfficiency1',
  solarEfficiency2: 'solarEfficiency2',

  // Earth production
  materialProcessing: 'materialProcessing',
  solarTechnology: 'solarTechnology',
  chipManufacturing: 'chipManufacturing',
  robotics1: 'robotics1',
  rocketry: 'rocketry',
  orbitalLogistics: 'orbitalLogistics',

  // Space payload unlocks
  payloadToMoon: 'payloadToMoon',
  payloadToMercury: 'payloadToMercury',

  // Moon building unlocks
  moonMineEngineering: 'moonMineEngineering',
  moonSolarManufacturing: 'moonSolarManufacturing',
  moonChipManufacturing: 'moonChipManufacturing',
  moonSatelliteManufacturing: 'moonSatelliteManufacturing',
  moonRocketry: 'moonRocketry',
  moonMassDrivers: 'moonMassDrivers',

  // Rocket reusability tiers
  reusableRockets1: 'reusableRockets1',
  reusableRockets2: 'reusableRockets2',
  reusableRockets3: 'reusableRockets3',

  robotics2: 'robotics2',
  robotics3: 'robotics3',
  facilityThroughput1: 'facilityThroughput1',
  facilityThroughput2: 'facilityThroughput2',
  jobThroughput1: 'jobThroughput1',
  jobThroughput2: 'jobThroughput2',

  vonNeumannProbes: 'vonNeumannProbes',
} as const;

export type ResearchId = typeof ResearchIds[keyof typeof ResearchIds];

export interface ResearchConfig {
  id: ResearchId;
  name: string;
  cost: bigint;
  prereqs: ResearchId[];
  description: string;
  productionBoosts?: {
    jobs?: Partial<Record<JobType, number>>;
    facilities?: Partial<Record<FacilityProductionId, number>>;
  };
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
  unlockAtIntel: number;
  displayName: string;
  workerType: 'ai' | 'human';
  agentIntelReq: number;
  agentResearchReq?: ResearchId[];
  salaryPerMin?: bigint;
  hireCost?: bigint;
  stuckProbability?: number;
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
  laborCost: bigint;
  limit?: number;
}

export interface PowerPlantConfig {
  name: string;
  cost: bigint;
  outputMW: bigint;
  laborCost: bigint;
  limit?: number;
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
  homePowerMW: 0.02,
  tickIntervalMs: 100,
  uiUpdateIntervalMs: 200,
  autoSaveIntervalMs: 30000,

  tiers: {
    basic:         { cost: toBigInt(10),  intel: 0.5, coresPerAgent: 1, displayName: 'Basic' } as TierConfig,
    pro:           { cost: toBigInt(30),  intel: 1.0, coresPerAgent: 1, displayName: 'Pro' } as TierConfig,
    ultra:         { cost: toBigInt(50),  intel: 1.5, coresPerAgent: 1, displayName: 'Ultra' } as TierConfig,
    ultraMax:      { cost: toBigInt(100), intel: 2.0, coresPerAgent: 1, displayName: 'Ultra Max' } as TierConfig,
    ultraProMax:   { cost: toBigInt(200), intel: 2.5, coresPerAgent: 1, displayName: 'Ultra Pro Max' } as TierConfig,
  } as Record<SubscriptionTier, TierConfig>,

  jobs: {
    // AI
    sixxerBasic:      { produces: { resource: 'funds', amount: toBigInt(6) },     timeMs: 2000, unlockAtIntel: 0.5, agentIntelReq: 0.5, workerType: 'ai', displayName: 'Sixxer Basic', obsoleteAtIntel: 9.0 } as JobConfig,
    sixxerStandard:   { produces: { resource: 'funds', amount: toBigInt(18) },    timeMs: 3000, unlockAtIntel: 0.5, agentIntelReq: 1.0, workerType: 'ai', displayName: 'Sixxer Standard', obsoleteAtIntel: 10.0 } as JobConfig,
    sixxerAdvanced:   { produces: { resource: 'funds', amount: toBigInt(50) },    timeMs: 4000, unlockAtIntel: 1.0, agentIntelReq: 1.5, workerType: 'ai', displayName: 'Sixxer Advanced', obsoleteAtIntel: 11.0 } as JobConfig,
    sixxerEnterprise: { produces: { resource: 'funds', amount: toBigInt(200) },   timeMs: 5500, unlockAtIntel: 1.5, agentIntelReq: 2.0, workerType: 'ai', displayName: 'Sixxer Enterprise', obsoleteAtIntel: 14.0 } as JobConfig,
    manager:          { produces: { resource: 'nudge', amount: toBigInt(1) },     timeMs: 1000, unlockAtIntel: 1.5, agentIntelReq: 2.5, workerType: 'ai', displayName: 'Agent Manager', stuckProbability: 0 } as JobConfig,
    aiSWE:            { produces: { resource: 'code', amount: toBigInt(0.5) },    timeMs: 3000, unlockAtIntel: 11.0, agentIntelReq: 14.0, workerType: 'ai', displayName: 'AI Coder' } as JobConfig,
    aiResearcher:     { produces: { resource: 'science', amount: toBigInt(0.1) }, timeMs: 5000, unlockAtIntel: 14.0, agentIntelReq: 16.0, workerType: 'ai', displayName: 'AI Researcher' } as JobConfig,
    aiDataSynthesizer:{ produces: { resource: 'data', amount: toBigInt(1.0) },    timeMs: 4000, unlockAtIntel: 11.0, agentIntelReq: 11.0, agentResearchReq: ['syntheticData1'], workerType: 'ai', displayName: 'AI Data Synthesizer' } as JobConfig,
    robotWorker:      { produces: { resource: 'labor', amount: 0n },              timeMs: 3000, unlockAtIntel: 0,  agentIntelReq: 0, workerType: 'human', displayName: 'Robot Worker' } as JobConfig,

    // Human
    humanSWE:         { produces: { resource: 'code', amount: toBigInt(0.15) },   timeMs: 3000, unlockAtIntel: 3.0,  agentIntelReq: 0, workerType: 'human', displayName: 'Human Coder', salaryPerMin: toBigInt(3000), hireCost: toBigInt(500) } as JobConfig,
    humanResearcher:  { produces: { resource: 'science', amount: toBigInt(0.5) }, timeMs: 5000, unlockAtIntel: 11.0, agentIntelReq: 0, workerType: 'human', displayName: 'Human Researcher', salaryPerMin: toBigInt(5000), hireCost: toBigInt(1000) } as JobConfig,
    humanWorker:      { produces: { resource: 'labor', amount: toBigInt(5) },     timeMs: 5000, unlockAtIntel: 5.0,  agentIntelReq: 0, workerType: 'human', displayName: 'Human Worker', salaryPerMin: toBigInt(2000), hireCost: toBigInt(300) } as JobConfig,

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
  gpuPowerMW: 0.0004,

  models: [
    { name: 'DeepKick-405B', intel: 3.0, minGpus: scaleBigInt(32n) },
    { name: 'DeepKick-647B', intel: 5.0, minGpus: scaleBigInt(64n) },
    { name: 'DeepKick-1.2T', intel: 7.0, minGpus: scaleBigInt(128n) },
    { name: 'DeepKick-2.8T', intel: 9.0, minGpus: scaleBigInt(256n) },
  ] as ModelConfig[],

  // Datacenters
  datacenterThreshold: scaleBigInt(128n),
  datacenters: [
    { name: 'Small Datacenter',  cost: toBigInt(100_000),       gpuCapacity: scaleBigInt(256n),      laborCost: toBigInt(120),  limit: 20000 } as DatacenterConfig,
    { name: 'Medium Datacenter', cost: toBigInt(2_000_000),     gpuCapacity: scaleBigInt(4_096n),    laborCost: toBigInt(300),  limit: 5000 } as DatacenterConfig,
    { name: 'Large Datacenter',  cost: scaleBigInt(30_000_000n), gpuCapacity: scaleBigInt(65_536n),  laborCost: toBigInt(720),  limit: 1000 } as DatacenterConfig,
    { name: 'Mega Datacenter',   cost: scaleBigInt(500_000_000n), gpuCapacity: scaleBigInt(1_000_000n), laborCost: toBigInt(1800), limit: 300 } as DatacenterConfig,
  ] as DatacenterConfig[],

  // Energy
  gridPowerKWCost: 500,
  gridPowerKWLimit: 20_000_000,
  powerPlants: {
    gas:     { name: 'Gas Plant',     cost: toBigInt(1_500_000),      outputMW: toBigInt(50),   laborCost: toBigInt(500),   limit: 10000 } as PowerPlantConfig,
    nuclear: { name: 'Nuclear Plant', cost: toBigInt(1_200_000_000),  outputMW: toBigInt(1000), laborCost: toBigInt(18000), limit: 500 } as PowerPlantConfig,
    solar:   { name: 'Solar Farm',    cost: toBigInt(800_000),        outputMW: 0n,             laborCost: toBigInt(60),    limit: 20 } as PowerPlantConfig,
  },

  solarPanelCost: toBigInt(400),
  solarPanelMW: 0.01,
  earthSolarInstallLaborCost: toBigInt(0.1),
  moonInstallLaborCost: toBigInt(0.1),
  earthSolarInstallLimit: scaleBigInt(5_000_000n),
  moonSolarInstallLimit: scaleBigInt(1_000_000_000_000n),
  moonGpuInstallLimit: scaleBigInt(1_000_000_000_000n),

  // Training
  fineTunes: [
    { name: 'DeepKick-Math',   intel: 10.0, pflopsHrs: toBigInt(50),     dataTB: toBigInt(1),    codeReq: toBigInt(200),   scienceReq: 0n },
    { name: 'DeepKick-Code',   intel: 11.0, pflopsHrs: toBigInt(150),    dataTB: toBigInt(4),    codeReq: toBigInt(400),   scienceReq: 0n },
    { name: 'DeepKick-Reason', intel: 12.0, pflopsHrs: toBigInt(500),    dataTB: toBigInt(16),   codeReq: toBigInt(800),   scienceReq: 0n },
    { name: 'DeepKick-Ultra',  intel: 13.0, pflopsHrs: toBigInt(2000),   dataTB: toBigInt(64),   codeReq: toBigInt(1600),  scienceReq: 0n },
  ] as TrainingModelConfig[],

  ariesModels: [
    { name: 'Aries-1', intel: 14.0, pflopsHrs: toBigInt(10_000),     dataTB: toBigInt(500),      codeReq: toBigInt(20_000),  scienceReq: toBigInt(100) },
    { name: 'Aries-2', intel: 18.5, pflopsHrs: toBigInt(50_000),     dataTB: toBigInt(2_000),    codeReq: toBigInt(40_000),  scienceReq: toBigInt(2000) },
    { name: 'Aries-3', intel: 25.0, pflopsHrs: toBigInt(250_000),    dataTB: toBigInt(10_000),   codeReq: toBigInt(80_000),  scienceReq: toBigInt(8000) },
    { name: 'Aries-4', intel: 35.0, pflopsHrs: toBigInt(2_000_000),  dataTB: toBigInt(50_000),   codeReq: toBigInt(160_000), scienceReq: toBigInt(40000) },
    { name: 'Aries-5', intel: 50.0, pflopsHrs: toBigInt(20_000_000), dataTB: toBigInt(250_000),  codeReq: toBigInt(320_000), scienceReq: toBigInt(100000) },
  ] as TrainingModelConfig[],

  trainingUnlockIntel: 9.0,
  dataBaseCostPerTB: toBigInt(200),
  dataEscalationRate: 0.15,

  // Research
  researchUnlockIntel: 11.0,
  research: [
    // Algorithms and API
    { id: 'algoEfficiency1', name: 'Algo Efficiency I',   cost: toBigInt(200),    prereqs: [],                   description: 'Training 25% faster' },
    { id: 'algoEfficiency2', name: 'Algo Efficiency II',  cost: toBigInt(800),    prereqs: ['algoEfficiency1'],  description: 'Training 25% faster' },
    { id: 'algoEfficiency3', name: 'Algo Efficiency III', cost: toBigInt(3000),   prereqs: ['algoEfficiency2'],  description: 'Training 25% faster' },
    { id: 'algoEfficiency4', name: 'Algo Efficiency IV',  cost: toBigInt(15000),  prereqs: ['algoEfficiency3'],  description: 'Training 25% faster' },

    { id: 'synthData1', name: 'API Data Generation I',   cost: toBigInt(300),   prereqs: [],             description: 'API users generate training data' },
    { id: 'synthData2', name: 'API Data Generation II',  cost: toBigInt(2000),  prereqs: ['synthData1'], description: 'API user data generation x2' },
    { id: 'synthData3', name: 'API Data Generation III', cost: toBigInt(20000), prereqs: ['synthData2'], description: 'API user data generation x2' },
    { id: 'syntheticData1', name: 'Synthetic Data I',    cost: toBigInt(1200),  prereqs: ['synthData1'], description: 'Unlock AI Data Synthesizer job' },
    {
      id: 'syntheticData2',
      name: 'Synthetic Data II',
      cost: toBigInt(6000),
      prereqs: ['syntheticData1'],
      description: 'AI Data Synthesizer output x2',
      productionBoosts: { jobs: { aiDataSynthesizer: 2 } },
    },
    {
      id: 'syntheticData3',
      name: 'Synthetic Data III',
      cost: toBigInt(30000),
      prereqs: ['syntheticData2'],
      description: 'AI Data Synthesizer output x2',
      productionBoosts: { jobs: { aiDataSynthesizer: 2 } },
    },

    // Earth industrial start (pick order)
    { id: 'materialProcessing',   name: 'Material Processing',    cost: toBigInt(200),   prereqs: [],                    description: 'Unlock Earth material mines' },
    { id: 'solarTechnology',      name: 'Solar Manufacturing',    cost: toBigInt(450),   prereqs: ['materialProcessing'], description: 'Unlock Earth solar factories and installation' },
    { id: 'chipManufacturing',    name: 'Chip Manufacturing',     cost: toBigInt(500),   prereqs: ['materialProcessing'], description: 'Unlock Earth GPU factories' },
    { id: 'robotics1',            name: 'Robotics I',             cost: toBigInt(500),   prereqs: ['materialProcessing'], description: 'Unlock Earth robot factories. Robots generate labor where deployed.' },

    // Second wave
    { id: 'orbitalLogistics',     name: 'Satellite Manufacturing', cost: toBigInt(1600), prereqs: ['solarTechnology', 'chipManufacturing'], description: 'Unlock Earth GPU satellite factories and orbital deployment UI' },
    { id: 'rocketry',             name: 'Rocketry',               cost: toBigInt(2000),  prereqs: ['materialProcessing'], description: 'Unlock Earth rocket factories' },

    // Transport and lunar expansion
    { id: 'payloadToMoon',        name: 'Lunar Transport',        cost: toBigInt(7000),  prereqs: ['rocketry', 'orbitalLogistics'], description: 'Unlock Earth->Moon logistics and Moon installation UI' },
    { id: 'moonMineEngineering',  name: 'Moon Mines',             cost: toBigInt(9000),  prereqs: ['payloadToMoon'], description: 'Unlock Moon material mines' },
    { id: 'moonSolarManufacturing', name: 'Moon Solar Plants',    cost: toBigInt(11000), prereqs: ['payloadToMoon'], description: 'Unlock Moon solar factories' },
    { id: 'moonChipManufacturing',  name: 'Moon Chip Fabs',       cost: toBigInt(12000), prereqs: ['payloadToMoon'], description: 'Unlock Moon GPU factories' },
    { id: 'moonSatelliteManufacturing', name: 'Moon Satellite Fabs', cost: toBigInt(13000), prereqs: ['payloadToMoon', 'orbitalLogistics'], description: 'Unlock Moon GPU satellite factories' },
    { id: 'moonRocketry',         name: 'Moon Rocketry',          cost: toBigInt(15000), prereqs: ['payloadToMoon', 'rocketry'], description: 'Unlock Moon rocket factories' },
    { id: 'moonMassDrivers',      name: 'Moon Mass Drivers',      cost: toBigInt(18000), prereqs: ['payloadToMoon', 'moonRocketry'], description: 'Unlock Moon mass drivers (more launches, larger payload)' },

    // Mercury and endgame
    { id: 'payloadToMercury',     name: 'Mercury Transport',      cost: toBigInt(35000), prereqs: ['payloadToMoon', 'moonMassDrivers'], description: 'Unlock Moon->Mercury logistics and all Mercury buildings' },

    // Rocket reuse tiers
    { id: 'reusableRockets1',     name: 'Reusable Rockets I',     cost: toBigInt(9000),  prereqs: ['rocketry'], description: 'Reduce rocket losses after launch' },
    { id: 'reusableRockets2',     name: 'Reusable Rockets II',    cost: toBigInt(30000), prereqs: ['reusableRockets1'], description: 'Further reduce rocket losses' },
    { id: 'reusableRockets3',     name: 'Reusable Rockets III',   cost: toBigInt(120000), prereqs: ['reusableRockets2'], description: 'Most rockets are recovered' },

    // Robotics scaling
    {
      id: 'robotics2',
      name: 'Robotics II',
      cost: toBigInt(3000),
      prereqs: ['robotics1'],
      description: 'Robots generate 2x labor',
      productionBoosts: { jobs: { robotWorker: 2 } },
    },
    {
      id: 'robotics3',
      name: 'Robotics III',
      cost: toBigInt(30000),
      prereqs: ['robotics2'],
      description: 'Robots generate 4x labor',
      productionBoosts: { jobs: { robotWorker: 2 } },
    },

    {
      id: 'facilityThroughput1',
      name: 'Facility Throughput I',
      cost: toBigInt(80000),
      prereqs: ['payloadToMercury'],
      description: 'All industrial facilities produce 50% more',
      productionBoosts: {
        facilities: {
          materialMine: 1.5,
          solarFactory: 1.5,
          robotFactory: 1.5,
          gpuFactory: 1.5,
          rocketFactory: 1.5,
          gpuSatelliteFactory: 1.5,
        },
      },
    },
    {
      id: 'facilityThroughput2',
      name: 'Facility Throughput II',
      cost: toBigInt(300000),
      prereqs: ['facilityThroughput1'],
      description: 'All industrial facilities produce 100% more',
      productionBoosts: {
        facilities: {
          materialMine: 2,
          solarFactory: 2,
          robotFactory: 2,
          gpuFactory: 2,
          rocketFactory: 2,
          gpuSatelliteFactory: 2,
        },
      },
    },
    {
      id: 'jobThroughput1',
      name: 'Workforce Throughput I',
      cost: toBigInt(90000),
      prereqs: ['payloadToMercury', 'syntheticData3'],
      description: 'All late-game jobs produce 50% more',
      productionBoosts: {
        jobs: {
          humanWorker: 1.5,
          humanResearcher: 1.5,
          humanSWE: 1.5,
          aiSWE: 1.5,
          aiResearcher: 1.5,
          aiDataSynthesizer: 1.5,
          robotWorker: 1.5,
          manager: 1.5,
        },
      },
    },
    {
      id: 'jobThroughput2',
      name: 'Workforce Throughput II',
      cost: toBigInt(350000),
      prereqs: ['jobThroughput1'],
      description: 'All late-game jobs produce 100% more',
      productionBoosts: {
        jobs: {
          humanWorker: 2,
          humanResearcher: 2,
          humanSWE: 2,
          aiSWE: 2,
          aiResearcher: 2,
          aiDataSynthesizer: 2,
          robotWorker: 2,
          manager: 2,
        },
      },
    },

    { id: 'vonNeumannProbes',     name: 'Von Neumann Probes',     cost: scaleBigInt(1_000_000_000_000_000n), prereqs: ['payloadToMercury', 'robotics3'], description: 'Unlock endgame probe launch' },

    // Compute techs
    { id: 'gpuArch1', name: 'GPU Architecture v1', cost: toBigInt(400),    prereqs: ['chipManufacturing'], description: 'GPUs +50% FLOPS' },
    { id: 'gpuArch2', name: 'GPU Architecture v2', cost: toBigInt(3000),   prereqs: ['gpuArch1'], description: 'GPUs +50% FLOPS' },
    { id: 'gpuArch3', name: 'GPU Architecture v3', cost: toBigInt(25000),  prereqs: ['gpuArch2'], description: 'GPUs +100% FLOPS' },
    {
      id: 'solarEfficiency1',
      name: 'Solar Efficiency I',
      cost: toBigInt(500),
      prereqs: ['solarTechnology'],
      description: 'Solar factory output +50%',
      productionBoosts: { facilities: { solarFactory: 1.5 } },
    },
    {
      id: 'solarEfficiency2',
      name: 'Solar Efficiency II',
      cost: toBigInt(5000),
      prereqs: ['solarEfficiency1'],
      description: 'Solar factory output +100%',
      productionBoosts: { facilities: { solarFactory: 2 } },
    },
  ] as ResearchConfig[],

  // Supply chain costs
  materialCost: toBigInt(100),
  solarPanelImportCost: toBigInt(500),
  robotImportCost: toBigInt(1000),
  robotWorkerBuyLimit: 10_000_000,
  rocketImportCost: toBigInt(100_000),
  gpuImportCost: toBigInt(2000),
  gpuSatelliteImportCost: toBigInt(5000),

  // Facilities (Earth baseline)
  materialMineCost: 0n,
  materialMineLaborCost: toBigInt(10),
  materialMineLaborReq: toBigInt(200),
  materialMineOutput: toBigInt(2000),
  materialMineLimit: 10_000_000,

  gpuFactoryCost: toBigInt(50_000),
  gpuFactoryLaborCost: toBigInt(200),
  gpuFactoryLimit: 50,
  gpuFactoryOutput: toBigInt(100),
  gpuFactoryMaterialReq: toBigInt(2000),

  solarFactoryCost: toBigInt(10_000),
  solarFactoryLaborCost: toBigInt(50),
  solarFactoryLimit: 50,
  solarFactoryOutput: toBigInt(100),
  solarFactoryMaterialReq: toBigInt(1000),

  robotFactoryCost: toBigInt(20_000),
  robotFactoryLaborCost: toBigInt(100),
  robotFactoryLimit: 50,
  robotFactoryOutput: toBigInt(100),
  robotFactoryMaterialReq: toBigInt(2000),

  rocketFactoryCost: toBigInt(500_000),
  rocketFactoryLaborCost: toBigInt(500),
  rocketFactoryLimit: 10,
  rocketFactoryOutput: 10,
  rocketFactoryMaterialReq: toBigInt(100000),

  gpuSatelliteFactoryCost: toBigInt(500_000),
  gpuSatelliteFactoryLaborCost: toBigInt(500),
  gpuSatelliteFactoryLimit: 20,
  gpuSatelliteFactoryOutput: 20,
  gpuSatelliteFactoryMaterialReq: toBigInt(50000),
  gpuSatelliteFactoryGpuReq: toBigInt(1000),

  // Soft stockpile caps to prevent overcommitting one production line.
  locationResourceStockpileCap: scaleBigInt(1_000_000_000_000_000n), // 1P
  locationResourceStockpileCapLabel: '1P',
  mercuryMaterialStockpileCap: scaleBigInt(1_000_000_000_000_000_000_000_000n), // 1Z
  mercuryMaterialStockpileCapLabel: '1Sx',

  // Location multipliers and limits
  moonFacilityCostMultiplier: 2.2,
  moonFacilityLaborMultiplier: 1.6,
  mercuryFacilityCostMultiplier: 4.0,
  mercuryFacilityLaborMultiplier: 2.0,

  moonFacilityLimits: {
    materialMine: 5000,
    solarFactory: 3000,
    robotFactory: 3000,
    gpuFactory: 3000,
    rocketFactory: 2000,
    gpuSatelliteFactory: 1500,
    massDriver: 1000,
  },

  // Mercury is effectively unlimited for this stage
  mercuryFacilityUnlimited: true,

  // Space logistics
  rocketCapacityLowOrbit: 100 * 1000,
  rocketCapacityLunar: 10 * 1000,
  rocketCapacityMercury: 20 * 1000,

  earthLaunchesPerMin: 120,
  moonLaunchesPerMin: 90,
  massDriverLaunchesPerMin: 180,
  massDriverCapacityMultiplier: 12,

  // Transit timing assumes 1 min game time ~= 30 days real time.
  // Earth -> Moon is ~3 days, so ~6 seconds in game time.
  routeEarthOrbitTransitMs: 1_000,
  routeEarthMoonTransitMs: 6_000,
  routeMoonMercuryTransitMs: 180_000,

  earthRocketReturnMs: 12_000,
  moonRocketReturnMs: 220_000,

  rocketLossNoReuse: 1.0,
  rocketLossReusable1: 0.7,
  rocketLossReusable2: 0.4,
  rocketLossReusable3: 0.1,

  // Weights (kg)
  robotWeight: 100,
  solarPanelWeight: 50,
  gpuWeight: 1000,
  gpuSatelliteWeight: 1000,

  // Space power/mining
  satellitePowerMW: 5.0,
  mercuryBaseMassTotal: scaleBigInt(1_000_000_000_000_000_000_000n), // 1Z
  mercuryMiningPerRobotPerMin: toBigInt(1200),

  // Robot labor by location
  robotLaborPerMinBase: toBigInt(20),

  // API Services
  apiUnlockIntel: 5.0,
  apiUnlockCode: toBigInt(200),
  apiPflopsPerUser: 0.01,
  apiAdCost: toBigInt(1),
  apiAdAwarenessBoost: 1,
  apiPriceElasticity: 3.0,
  intelligenceElasticity: 3,
  apiAwarenessElasticity: 0.7,
  apiBaseAwareness: 200,
  apiDemandScale: 1000,
  apiImproveCodeCost: toBigInt(100),
  apiImproveQualityBoost: 0.1,
  apiUserSynthBase: 100n,
};

/**
 * Stuck rate: probability an agent gets stuck on a given task.
 */
export function getStuckRate(intel: number): number {
  return 1.2 * Math.min(0.5, 0.5 * Math.pow(1 / intel, 1));
}

/** Get next tier in sequence, or null if maxed. */
export function getNextTier(current: SubscriptionTier): SubscriptionTier | null {
  const idx = TIER_ORDER.indexOf(current);
  if (idx > 0) return TIER_ORDER[idx - 1];
  return null;
}

/** Best model allowed by owned GPUs. */
export function getBestModel(gpuCount: bigint): ModelConfig {
  let best = BALANCE.models[0];
  for (const model of BALANCE.models) {
    if (gpuCount >= model.minGpus) best = model;
  }
  return best;
}

/** Total GPU capacity from datacenters. */
export function getTotalGpuCapacity(datacenters: bigint[]): bigint {
  let total = BALANCE.datacenterThreshold;
  for (let i = 0; i < datacenters.length; i++) {
    total += mulB(datacenters[i], BALANCE.datacenters[i].gpuCapacity);
  }
  return total;
}

const RESEARCH_BY_ID: Record<string, ResearchConfig> = Object.fromEntries(
  BALANCE.research.map((research) => [research.id, research]),
) as Record<string, ResearchConfig>;

export function getJobProductionMultiplier(completedResearch: string[], jobType: JobType): number {
  let multiplier = 1;
  for (const researchId of completedResearch) {
    const research = RESEARCH_BY_ID[researchId];
    const boost = research?.productionBoosts?.jobs?.[jobType];
    if (boost !== undefined) multiplier *= boost;
  }
  return multiplier;
}

export function getFacilityProductionMultiplier(
  completedResearch: string[],
  facilityId: FacilityProductionId,
): number {
  let multiplier = 1;
  for (const researchId of completedResearch) {
    const research = RESEARCH_BY_ID[researchId];
    const boost = research?.productionBoosts?.facilities?.[facilityId];
    if (boost !== undefined) multiplier *= boost;
  }
  return multiplier;
}
