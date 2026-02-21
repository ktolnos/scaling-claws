/**
 * Balancing conventions:
 * - 1 minute of real time = 1 month in game for all time-based calculations (job times, research times, salaries, etc.)
 * - 1 material = 1 ton (1000kg) of raw materials (unenriched ore)
 * - 1 labor = 1 person-month of labor
 * - 1 data = 1 gigabyte of data
 * - 1 nudge = 1 person-month of management
 * - 1 code = 1 person-month of coding
 * - 1 science = 1 person-month of research
 * - All prices are in dollars
 * - The game strives to have realistic numbers when possible. Real life is balanced. If real life numbers don't work in game, try to change the econimics such that they do.
 * - bigint is used for all large numbers. All bigints are scaled by default to allow for fixed-point precision (see utils.ts for details). If a number is not scaled, it should be noted in a comment.
 * - This is not an idle game when played optimally. No wait times > 10 seconds.
 * - new mechanics should be introcued gradually to the player.
 * - the bottlneck resource should change throughout the game. The player should see the way to remove the bottleneck. E.g. if the bottleneck is money, the player should see the job that produces more money (even if it is locked), if the bottleneck is data, the player should see a research that increases data generation, etc. 
 * - No research should be useless, each research should exist to solve some bottleneck. E.g. if the player is never constrained by the data, the synthetic data research would be useless. This should be resolved by adjusting data requirements in such a way that the player is constrained by the data when the research is unlocked. This applies to all research.
 */

import { toBigInt, scaleBigInt, mulB, fromBigInt } from './utils.ts';

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
  'sixxerBasic', 'sixxerEnterprise',
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
  dataGB: bigint;
  codeReq: bigint;
  scienceReq: bigint;
}

export const BALANCE = {
  startingFunds: 0,
  startingCpuCores: 4,
  tickIntervalMs: 100,
  uiUpdateIntervalMs: 200,
  autoSaveIntervalMs: 30000,

  tiers: {
    basic:         { cost: toBigInt(14),  intel: 0.5, coresPerAgent: 1, displayName: 'Basic' } as TierConfig,
    pro:           { cost: toBigInt(20),  intel: 1.0, coresPerAgent: 1, displayName: 'Pro' } as TierConfig,
    ultra:         { cost: toBigInt(25),  intel: 1.5, coresPerAgent: 1, displayName: 'Ultra' } as TierConfig,
    ultraMax:      { cost: toBigInt(60), intel: 2.0, coresPerAgent: 1, displayName: 'Ultra Max' } as TierConfig,
    ultraProMax:   { cost: toBigInt(200), intel: 2.5, coresPerAgent: 1, displayName: 'Ultra Pro Max' } as TierConfig,
  } as Record<SubscriptionTier, TierConfig>,

  jobs: {
    // AI
    sixxerBasic:      { produces: { resource: 'funds', amount: toBigInt(6) },     timeMs: 5_000, unlockAtIntel: 0.5, agentIntelReq: 0.5, workerType: 'ai', displayName: 'Sixxer Basic', obsoleteAtIntel: 9.0 } as JobConfig,
    sixxerEnterprise: { produces: { resource: 'funds', amount: toBigInt(300) },   timeMs: 10_000, unlockAtIntel: 1.5, agentIntelReq: 2.0, workerType: 'ai', displayName: 'Sixxer Enterprise', obsoleteAtIntel: 14.0 } as JobConfig,
    // Unlock manager before enterprise so nudge/automation appears earlier in progression.
    manager:          { produces: { resource: 'nudge', amount: toBigInt(1) },     timeMs: 1_000, unlockAtIntel: 1.0, agentIntelReq: 1.5, workerType: 'ai', displayName: 'Agent Manager', stuckProbability: 0 } as JobConfig,
    aiSWE:            { produces: { resource: 'code', amount: toBigInt(0.1) },    timeMs: 60_000, unlockAtIntel: 11.0, agentIntelReq: 14.0, workerType: 'ai', displayName: 'AI Coder' } as JobConfig,
    aiResearcher:     { produces: { resource: 'science', amount: toBigInt(0.1) }, timeMs: 60_000, unlockAtIntel: 14.0, agentIntelReq: 16.0, workerType: 'ai', displayName: 'AI Researcher' } as JobConfig,
    aiDataSynthesizer:{ produces: { resource: 'data', amount: toBigInt(10) },    timeMs: 60_000, unlockAtIntel: 11.0, agentIntelReq: 11.0, agentResearchReq: ['syntheticData1'], workerType: 'ai', displayName: 'AI Data Synthesizer' } as JobConfig,
    robotWorker:      { produces: { resource: 'labor', amount: 0n },              timeMs: 3000, unlockAtIntel: 0,  agentIntelReq: 0, workerType: 'human', displayName: 'Robot Worker' } as JobConfig,

    // Human
    // 1 real-time minute = 1 in-game month. Salary constants are therefore monthly.
    // Rounded from BLS annual medians / 12:
    // - Software Developers: ~$133k/year -> ~$11k/month
    // - Computer & Information Research Scientists: ~$141k/year -> ~$12k/month
    // - Construction Laborers/Helpers: ~$46k/year -> ~$4k/month
    humanSWE:         { produces: { resource: 'code', amount: toBigInt(0.1) },   timeMs: 6_000, unlockAtIntel: 3.0,  agentIntelReq: 0, workerType: 'human', displayName: 'Human Coder', salaryPerMin: toBigInt(11_000), hireCost: toBigInt(500) } as JobConfig,
    humanResearcher:  { produces: { resource: 'science', amount: toBigInt(0.1) }, timeMs: 6_000, unlockAtIntel: 11.0, agentIntelReq: 0, workerType: 'human', displayName: 'Human Researcher', salaryPerMin: toBigInt(12_000), hireCost: toBigInt(1000) } as JobConfig,
    humanWorker:      { produces: { resource: 'labor', amount: toBigInt(0.1) },     timeMs: 6_000, unlockAtIntel: 5.0,  agentIntelReq: 0, workerType: 'human', displayName: 'Human Worker', salaryPerMin: toBigInt(4_000), hireCost: toBigInt(300) } as JobConfig,

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
    limit: 7,
  },

  // GPU & Compute
  selfHostedUnlockIntel: 2.5,
  // Allow market price to fluctuate within +/-20% around target before mean-reversion is forced.
  gpuPriceVariationPct: 0.2,
  // Max market move speed (fraction of current target price per second).
  gpuPriceMaxChangePerSecondPct: 0.04,
  pflopsPerGpu: 2.0,
  // Bundle power target: ~2 kW per GPU unit (card + shared infra overhead).
  gpuPowerMW: 0.002,

  models: [
    { name: 'DeepKick-405B', intel: 3.0, minGpus: scaleBigInt(32n) },
    { name: 'DeepKick-647B', intel: 5.0, minGpus: scaleBigInt(64n) },
    { name: 'DeepKick-1.2T', intel: 7.0, minGpus: scaleBigInt(128n) },
    { name: 'DeepKick-2.8T', intel: 9.0, minGpus: scaleBigInt(256n) },
  ] as ModelConfig[],

  // Datacenters
  datacenterThreshold: scaleBigInt(200n),
  // Datacenter prices/labor represent building + electrical/mechanical shell only.
  // GPU hardware is purchased separately via market price.
  // laborCost is person-months (1 labor = 1 person-month), one-time build labor.
  // Order-of-magnitude model:
  // - capex labor share ~15-25% for heavy construction programs
  // - loaded construction worker-month blended around ~$15k-$20k
  // Rounded to stable gameplay values.
  datacenters: [
    { name: 'Small Datacenter',  cost: toBigInt(6_000_000),     gpuCapacity: scaleBigInt(256n),      laborCost: toBigInt(12),    limit: 20000 } as DatacenterConfig,
    { name: 'Medium Datacenter', cost: toBigInt(75_000_000),    gpuCapacity: scaleBigInt(4_096n),    laborCost: toBigInt(360),  limit: 5000 } as DatacenterConfig,
    { name: 'Large Datacenter',  cost: toBigInt(1_000_000_000),  gpuCapacity: scaleBigInt(65_536n),   laborCost: toBigInt(7_000), limit: 1000 } as DatacenterConfig,
    { name: 'Mega Datacenter',   cost: toBigInt(10_000_000_000), gpuCapacity: scaleBigInt(1_000_000n), laborCost: toBigInt(300_000), limit: 300 } as DatacenterConfig,
  ] as DatacenterConfig[],

  // Energy
  gridPowerKWCost: 500,
  gridPowerKWLimit: 20_000_000,
  // EIA AEO 2025 overnight capex (2024$/kW) used as baseline:
  // - Advanced combined cycle gas: ~791-875 $/kW
  // - Advanced nuclear: ~7821 $/kW
  // Rounded to clean gameplay values:
  // - Gas plant set to 200 MW at ~$800/kW => ~$160M
  // - Nuclear plant set to 1 GW at ~$8000/kW => ~$8B
  // Labor is one-time build labor in person-months.
  // Approximate staffing programs:
  // - 200 MW CCGT: a few hundred workers over ~2 years -> ~3,000 person-months.
  // - 1 GW nuclear: large multi-year program -> ~60,000 person-months.
  powerPlants: {
    gas:     { name: 'Gas Plant',     cost: toBigInt(160_000_000),     outputMW: toBigInt(200),  laborCost: toBigInt(3_000),  limit: 10000 } as PowerPlantConfig,
    nuclear: { name: 'Nuclear Plant', cost: toBigInt(8_000_000_000),   outputMW: toBigInt(1000), laborCost: toBigInt(60_000), limit: 500 } as PowerPlantConfig,
  },

  // Modern utility-scale panel baseline (rounded): ~600 W per panel, ~30 kg per panel.
  // Example references: LONGi Hi-MO X10 class modules (~670W, ~28.5kg).
  solarPanelMW: 0.0006,
  // Install labor per unit (person-months per installed panel/GPU).
  // Earth utility-scale install is highly mechanized; moon install is harder.
  earthSolarInstallLaborCost: toBigInt(0.003),
  moonInstallLaborCost: toBigInt(0.01),
  earthSolarInstallLimit: scaleBigInt(5_000_000n),
  moonSolarInstallLimit: scaleBigInt(1_000_000_000_000n),
  moonGpuInstallLimit: scaleBigInt(1_000_000_000_000n),

  // Training
  fineTunes: [
    { name: 'DeepKick-Math',   intel: 10.0, pflopsHrs: toBigInt(50),     dataGB: toBigInt(1),    codeReq: toBigInt(20),   scienceReq: 0n },
    { name: 'DeepKick-Code',   intel: 11.0, pflopsHrs: toBigInt(150),    dataGB: toBigInt(30),    codeReq: toBigInt(40),   scienceReq: 0n },
    { name: 'DeepKick-Reason', intel: 12.0, pflopsHrs: toBigInt(500),    dataGB: toBigInt(1000),   codeReq: toBigInt(80),   scienceReq: 0n },
    { name: 'DeepKick-Ultra',  intel: 13.0, pflopsHrs: toBigInt(2000),   dataGB: toBigInt(10000),   codeReq: toBigInt(1600),  scienceReq: 0n },
  ] as TrainingModelConfig[],

  ariesModels: [
    { name: 'Aries-1', intel: 14.0, pflopsHrs: toBigInt(10_000),     dataGB: toBigInt(5_000),      codeReq: toBigInt(20_000),  scienceReq: toBigInt(100) },
    { name: 'Aries-2', intel: 18.5, pflopsHrs: toBigInt(50_000),     dataGB: toBigInt(20_000),    codeReq: toBigInt(40_000),  scienceReq: toBigInt(2000) },
    { name: 'Aries-3', intel: 25.0, pflopsHrs: toBigInt(250_000),    dataGB: toBigInt(100_000),   codeReq: toBigInt(80_000),  scienceReq: toBigInt(8000) },
    { name: 'Aries-4', intel: 35.0, pflopsHrs: toBigInt(2_000_000),  dataGB: toBigInt(500_000),   codeReq: toBigInt(160_000), scienceReq: toBigInt(40000) },
    { name: 'Aries-5', intel: 50.0, pflopsHrs: toBigInt(20_000_000), dataGB: toBigInt(2_500_000),  codeReq: toBigInt(320_000), scienceReq: toBigInt(100000) },
  ] as TrainingModelConfig[],

  trainingUnlockIntel: 9.0,
  dataPurchaseLimitGB: 1_000_000,

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
  robotImportCost: toBigInt(1000),
  robotWorkerBuyLimit: 10_000_000,

  // Facilities (Earth baseline)
  materialMineCost: 0n,
  // One-time setup labor for opening a mine site.
  materialMineLaborCost: toBigInt(200),
  // Operating labor per minute (= per game-month), i.e. required FTE per mine.
  materialMineLaborReq: toBigInt(8),
  materialMineOutput: toBigInt(2000),
  materialMineLimit: 10_000_000,

  gpuFactoryCost: toBigInt(50_000),
  // Operating labor per factory per minute (per month).
  gpuFactoryLaborCost: toBigInt(25),
  gpuFactoryLimit: 50,
  gpuFactoryOutput: toBigInt(100),
  gpuFactoryMaterialReq: toBigInt(2000),

  solarFactoryCost: toBigInt(10_000),
  solarFactoryLaborCost: toBigInt(8),
  solarFactoryLimit: 50,
  // Increased to preserve prior panel-to-satellite production pacing after panel wattage downshift.
  solarFactoryOutput: toBigInt(400),
  solarFactoryMaterialReq: toBigInt(1000),

  robotFactoryCost: toBigInt(20_000),
  robotFactoryLaborCost: toBigInt(20),
  robotFactoryLimit: 50,
  robotFactoryOutput: toBigInt(100),
  robotFactoryMaterialReq: toBigInt(2000),

  rocketFactoryCost: toBigInt(500_000),
  // Labor and material here are monthly operating inputs (not one-time build cost),
  // representing a large, specialized aerospace workforce.
  rocketFactoryLaborCost: toBigInt(600),
  rocketFactoryLimit: 10,
  rocketFactoryOutput: 10,
  // 60,000 ore-equivalent tons / month for 10 rockets / month ~= 6,000 tons per rocket.
  // Interpreted as ore-equivalent bill of materials (including rare/processed materials and amortized industrial chain).
  rocketFactoryMaterialReq: toBigInt(60_000),

  gpuSatelliteFactoryCost: toBigInt(500_000),
  gpuSatelliteFactoryLimit: 20,
  gpuSatelliteFactoryOutput: 20,
  // 200,000 panels / 20 satellites = 10,000 panels per satellite.
  // At 0.0006 MW/panel this is ~6 MW nameplate per satellite, close to satellitePowerMW=5.
  gpuSatelliteFactoryMaterialReq: toBigInt(200_000),
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

  massDriverLaunchesPerMin: 180,
  massDriverCapacityMultiplier: 12,

  // Transit timing assumes 1 min game time ~= 30 days real time.
  // Earth -> Moon is ~3 days, so ~6 seconds in game time.
  routeEarthOrbitTransitMs: 1_000,
  routeEarthMoonTransitMs: 6_000,
  // Typical transfers are multi-month; rounded to 6 game-months.
  routeMoonMercuryTransitMs: 360_000,

  earthRocketReturnMs: 12_000,
  // Return leg is generally longer than Earth routes; rounded to 7 game-months.
  moonRocketReturnMs: 420_000,

  rocketLossNoReuse: 1.0,
  rocketLossReusable1: 0.7,
  rocketLossReusable2: 0.4,
  rocketLossReusable3: 0.1,

  // Weights (kg)
  robotWeight: 100,
  solarPanelWeight: 30,
  // Shipping mass for one GPU bundle (card + fractional host hardware).
  gpuWeight: 200,
  gpuSatelliteWeight: 1000,

  // Space power/mining
  satellitePowerMW: 5.0,
  // Mercury mass from NASA/JPL: 3.30103e23 kg = 3.30103e20 metric tons.
  // Rounded to 3.3e20 tons for gameplay readability.
  mercuryBaseMassTotal: scaleBigInt(330_000_000_000_000_000_000n),

  // Robot labor by location
  robotLaborPerMinBase: toBigInt(20),

  // API Services
  apiUnlockIntel: 5.0,
  apiUnlockCode: toBigInt(1),
  apiStartingPrice: 50,
  apiPflopsPerUser: 0.01,
  apiAdCost: toBigInt(1000),
  apiAdAwarenessBoost: 1000,
  apiImproveCodeCost: toBigInt(1),
  apiImproveQualityBoost: 0.1,
  apiUserSynthBase: 100n,
};

/**
 * Base stuck rate: probability per second that an active agent gets stuck.
 */
export function getStuckRate(intel: number): number {
  return 1 / (intel + 1);
}

/**
 * API demand curve used by ComputeSystem.
 * Kept here so economics live with balance parameters.
 */
export function getApiDemand(
  awareness: number,
  quality: number,
  intelligence: number,
  price: number,
): number {
  // Function-local economics constants (kept inline unless shared elsewhere).
  const API_BASE_AWARENESS = 200_000;
  const API_AWARENESS_ELASTICITY = 0.7;
  const INTELLIGENCE_ELASTICITY = 3.0;
  const API_PRICE_ELASTICITY = 3.0;
  const API_DEMAND_SCALE = 3000;

  const effectiveAwareness = Math.max(0, API_BASE_AWARENESS + awareness);
  const safeQuality = Math.max(0, quality);
  const safeIntelligence = Math.max(0.01, intelligence);
  const safePrice = Math.max(0.1, price);

  return (
    Math.pow(effectiveAwareness, API_AWARENESS_ELASTICITY) *
    safeQuality *
    (Math.pow(safeIntelligence, INTELLIGENCE_ELASTICITY) /
      Math.pow(safePrice, API_PRICE_ELASTICITY)) *
    API_DEMAND_SCALE
  );
}

/**
 * Flat market pricing for purchased data (does not scale with prior purchases).
 */
export function getTrainingDataPricePerGB(): bigint {
  const DATA_PRICE_PER_GB = 200;
  return toBigInt(DATA_PRICE_PER_GB);
}

export function getTrainingDataRemainingPurchaseCapGB(purchasedGB: number): number {
  return Math.max(0, BALANCE.dataPurchaseLimitGB - Math.max(0, Math.floor(purchasedGB)));
}

export function getTrainingDataPurchaseCost(amountGB: number): bigint {
  if (amountGB <= 0) return 0n;
  return mulB(toBigInt(amountGB), getTrainingDataPricePerGB());
}

/**
 * GPU market target price as a function of currently owned Earth GPUs.
 * Starts with hobby crypto-mining/prosumer rigs and shifts toward enterprise accelerators as fleet scales.
 */
export function getGpuTargetPrice(gpuCount: bigint): bigint {
  // Price anchors by scale (USD per game "GPU unit" = card + fractional host/rack/power hardware):
  // - Hobby baseline is informed by consumer GPU MSRPs:
  //   NVIDIA GeForce RTX 3080 ($699, Sep 2020 launch) and RTX 5090 ($1,999, Jan 2025 launch),
  //   then uplifted for system overhead and non-MSRP channel pricing.
  // - Enterprise anchor is informed by NVIDIA DGX A100 launch pricing:
  //   $199,000 for 8x A100 (~$24,875 per accelerator slot incl. server platform).
  // - Higher tiers represent newer enterprise accelerator mixes (H100/B200-class) at larger scales.
  const anchors: Array<{ gpus: number; usd: number }> = [
    { gpus: 1, usd: 3_000 },            // Hobby mining/prosumer workstation blend
    { gpus: 128, usd: 8_000 },         // End of "no dedicated datacenter" phase
    { gpus: 256, usd: 14_000 },         // Small datacenter: mixed pro + enterprise cards
    { gpus: 4_096, usd: 25_000 },       // Medium datacenter: A100/DGX-class economics
    { gpus: 65_536, usd: 32_000 },      // Large datacenter: mostly enterprise accelerators
    { gpus: 1_000_000, usd: 36_000 },   // Mega fleet: top-tier enterprise mix dominates
  ];

  const owned = Math.max(0, fromBigInt(gpuCount));
  if (owned <= anchors[0].gpus) return toBigInt(anchors[0].usd);

  for (let i = 1; i < anchors.length; i++) {
    const left = anchors[i - 1];
    const right = anchors[i];
    if (owned <= right.gpus) {
      // Interpolate in log-space so transitions are smooth across orders of magnitude.
      const leftX = Math.log2(left.gpus);
      const rightX = Math.log2(right.gpus);
      const x = Math.log2(Math.max(1, owned));
      const t = rightX > leftX ? (x - leftX) / (rightX - leftX) : 0;
      const blendedUsd = left.usd + (right.usd - left.usd) * Math.max(0, Math.min(1, t));
      return toBigInt(blendedUsd);
    }
  }

  return toBigInt(anchors[anchors.length - 1].usd);
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
