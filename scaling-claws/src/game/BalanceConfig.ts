/**
 * Balancing conventions:
 * - 1 minute of real time = 1 month in game for all time-based calculations (job times, research times, salaries, etc.)
 * - 1 material = 1 ton (1000kg) of raw materials (unenriched ore) ~= 25-50 USD
 * - 1 labor = 1 person-month of labor ~= 4k USD
 * - 1 data = 1 gigabyte of data
 * - 1 nudge = 1 person-month of management
 * - 1 code = 1 person-month of coding
 * - 1 science = 1 person-month of research
 * - Fund-denominated prices are in dollars; supply-chain build costs explicitly use resource units in field names
 * - The game strives to have realistic numbers when possible. Real life is balanced. If real life numbers don't work in game, try to change the econimics such that they do.
 * - bigint is used for all large numbers. All bigints are scaled by default to allow for fixed-point precision (see utils.ts for details). If a number is not scaled, it should be noted in a comment.
 * - This is not an idle game when played optimally. No wait times > 10 seconds.
 * - new mechanics should be introcued gradually to the player.
 * - the bottlneck resource should change throughout the game. The player should see the way to remove the bottleneck. E.g. if the bottleneck is money, the player should see the job that produces more money (even if it is locked), if the bottleneck is data, the player should see a research that increases data generation, etc. 
 * - No research should be useless, each research should exist to solve some bottleneck. E.g. if the player is never constrained by the data, the synthetic data research would be useless. This should be resolved by adjusting data requirements in such a way that the player is constrained by the data when the research is unlocked. This applies to all research.
 */

import { toBigInt, scaleBigInt, mulB, fromBigInt, scaleB, divB } from './utils.ts';

const USD_PER_MATERIAL = 40; // midpoint of 25-50 USD/ton proxy
const USD_PER_LABOR = 4_000; // 1 labor = 1 person-month

function usdToMaterial(usd: number): bigint {
  return toBigInt(usd / USD_PER_MATERIAL);
}

const GPU_POWER_MW_PER_UNIT = 0.002;
const SOLAR_PANEL_POWER_MW = 0.0006;
const SOLAR_OUTPUT_MULTIPLIER_EARTH = 1.0;
const SOLAR_OUTPUT_MULTIPLIER_MOON = 1.35;
const SOLAR_OUTPUT_MULTIPLIER_MERCURY = 3.2;
const SOLAR_OUTPUT_MULTIPLIER_SPACE_SSO = 3.8;
const SOLAR_FARM_PANELS = 1_000_000;
const TARGET_EARTH_SOLAR_POWER_TW = 3;
const TARGET_EARTH_SOLAR_POWER_MW = TARGET_EARTH_SOLAR_POWER_TW * 1_000_000;
const MAX_EARTH_SOLAR_PANELS = Math.round(
  TARGET_EARTH_SOLAR_POWER_MW / (SOLAR_PANEL_POWER_MW * SOLAR_OUTPUT_MULTIPLIER_EARTH),
);
const SOLAR_FARM_LIMIT = Math.round(MAX_EARTH_SOLAR_PANELS / SOLAR_FARM_PANELS);
const MEGA_DATACENTER_GPU_CAPACITY = 1_000_000;
const MEGA_DATACENTER_LIMIT = Math.round(
  TARGET_EARTH_SOLAR_POWER_MW / (GPU_POWER_MW_PER_UNIT * MEGA_DATACENTER_GPU_CAPACITY),
);
const MOON_GPU_DATACENTER_GPUS_PER_BUILD = 1_000_000;
const MOON_MAX_SOLAR_POWER_MW = MAX_EARTH_SOLAR_PANELS * SOLAR_PANEL_POWER_MW * SOLAR_OUTPUT_MULTIPLIER_MOON;
const MOON_GPU_DATACENTER_LIMIT = Math.round(
  MOON_MAX_SOLAR_POWER_MW / (GPU_POWER_MW_PER_UNIT * MOON_GPU_DATACENTER_GPUS_PER_BUILD),
);
const ALGO_EFFICIENCY_MULTIPLIER = 1.3;
const API_USER_SYNTH_BASE_RATE = 1000n;
const API_USER_SYNTH_RATE_MULTIPLIER = 2;
const API_USER_SYNTH_RATE_MULTIPLIER_B = 2n;
const ROCKET_LOSS_NO_REUSE = 1.0;
const ROCKET_LOSS_REUSABLE_1 = 0.5;
const ROCKET_LOSS_REUSABLE_2 = 0.1;
const ROCKET_LOSS_REUSABLE_3 = 0.01;
const GPU_SATELLITE_FACTORY_OUTPUT_PER_MONTH = 6;
const GPU_SATELLITE_GPU_REQ_PER_MONTH = 300;
const GPU_SATELLITE_SOLAR_PANEL_REQ_PER_MONTH = Math.round(
  (GPU_SATELLITE_GPU_REQ_PER_MONTH * GPU_POWER_MW_PER_UNIT) / (SOLAR_PANEL_POWER_MW * SOLAR_OUTPUT_MULTIPLIER_SPACE_SSO),
);
const DYSON_SWARM_FACILITY_OUTPUT_PER_MONTH = GPU_SATELLITE_FACTORY_OUTPUT_PER_MONTH;
const DYSON_SWARM_FACILITY_MATERIAL_REQ_PER_MONTH = 2_000;
const DYSON_SWARM_FACILITY_LABOR_REQ_PER_MONTH = 200;

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
export type HumanJobType = 'humanSWE' | 'humanResearcher' | 'humanWorker';
export type FacilityProductionId =
  | 'materialMine'
  | 'solarFactory'
  | 'robotFactory'
  | 'gpuFactory'
  | 'rocketFactory'
  | 'gpuSatelliteFactory'
  | 'dysonSwarmFacility'
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
  apiAutoPricing: 'apiAutoPricing',
  computeAutoAllocation: 'computeAutoAllocation',
  synthData2: 'synthData2',
  synthData3: 'synthData3',
  syntheticData1: 'syntheticData1',
  syntheticData2: 'syntheticData2',
  syntheticData3: 'syntheticData3',
  gpuArch1: 'gpuArch1',
  gpuArch2: 'gpuArch2',
  gpuArch3: 'gpuArch3',

  // Earth production
  solarTechnology: 'solarTechnology',
  chipManufacturing: 'chipManufacturing',
  robotics1: 'robotics1',
  robotFactoryEngineering1: 'robotFactoryEngineering1',
  moonRobotics: 'moonRobotics',
  mercuryRobotics: 'mercuryRobotics',
  rocketry: 'rocketry',

  // Space payload unlocks
  payloadToMoon: 'payloadToMoon',
  payloadToMercury: 'payloadToMercury',

  // Moon building unlocks
  moonMineEngineering: 'moonMineEngineering',
  moonChipManufacturing: 'moonChipManufacturing',
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
export type ResearchCostResource = Extract<ResourceType, 'code' | 'science'>;
export type ResearchQuantityEmoji = 'code' | 'science' | 'labor' | 'data' | 'flops' | 'energy' | 'rockets';

export interface InfiniteResearchConfig {
  initialLevel: number;
  priceExponentPerLevel: number;
  quantityMultiplierPerLevel: number;
  quantityLabel: string;
  quantityBase: number;
  quantityEmoji: ResearchQuantityEmoji;
  quantityUnit?: string;
}

export interface ResearchConfig {
  id: ResearchId;
  name: string;
  cost: bigint;
  costResource?: ResearchCostResource;
  infinite?: InfiniteResearchConfig;
  prereqs: ResearchId[];
  description: string;
  algoEfficiencyMultiplier?: number;
  apiUserSynthRateMultiplier?: bigint;
  gpuFlopsMultiplier?: number;
  rocketLossPct?: number;
  rocketLossMultiplier?: number;
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
  // UI progression gate for first-time visibility of agent-hiring + CPU controls.
  agentControlUnlockIntel: 1.0,

  // Internal mental-math anchors for resource <-> fiat conversions.
  usdPerMaterial: USD_PER_MATERIAL,
  usdPerLabor: USD_PER_LABOR,

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
    aiSWE:            { produces: { resource: 'code', amount: toBigInt(1) },    timeMs: 60_000, unlockAtIntel: 11.0, agentIntelReq: 20, workerType: 'ai', displayName: 'AI Coder' } as JobConfig,
    aiResearcher:     { produces: { resource: 'science', amount: toBigInt(1) }, timeMs: 60_000, unlockAtIntel: 20.0, agentIntelReq: 30, workerType: 'ai', displayName: 'AI Researcher' } as JobConfig,
    aiDataSynthesizer:{ produces: { resource: 'data', amount: toBigInt(10) },    timeMs: 60_000, unlockAtIntel: 20.0, agentIntelReq: 20.0, agentResearchReq: ['syntheticData1'], workerType: 'ai', displayName: 'AI Data Synthesizer' } as JobConfig,
    robotWorker:      { produces: { resource: 'labor', amount: 0n },              timeMs: 3000, unlockAtIntel: 0,  agentIntelReq: 0, agentResearchReq: ['robotics1'], workerType: 'human', displayName: 'Robot Worker' } as JobConfig,

    // Human
    // 1 real-time minute = 1 in-game month. Salary constants are therefore monthly.
    // Rounded from BLS annual medians / 12:
    // - Software Developers: ~$133k/year -> ~$11k/month
    // - Computer & Information Research Scientists: ~$141k/year -> ~$12k/month
    // - Construction Laborers/Helpers: ~$46k/year -> ~$4k/month
    humanSWE:         { produces: { resource: 'code', amount: toBigInt(0.1) },   timeMs: 6_000, unlockAtIntel: 3.0,  agentIntelReq: 0, workerType: 'human', displayName: 'Human Coder', salaryPerMin: toBigInt(11_000), hireCost: toBigInt(500) } as JobConfig,
    humanResearcher:  { produces: { resource: 'science', amount: toBigInt(0.1) }, timeMs: 6_000, unlockAtIntel: 10.0, agentIntelReq: 0, workerType: 'human', displayName: 'Human Researcher', salaryPerMin: toBigInt(12_000), hireCost: toBigInt(1000) } as JobConfig,
    humanWorker:      { produces: { resource: 'labor', amount: toBigInt(0.1) },     timeMs: 6_000, unlockAtIntel: 7.0,  agentIntelReq: 0, workerType: 'human', displayName: 'Human Worker', salaryPerMin: toBigInt(4_000), hireCost: toBigInt(300) } as JobConfig,

    unassigned: {
      produces: { resource: 'funds', amount: 0n },
      timeMs: 0,
      unlockAtIntel: 0,
      displayName: 'Unassigned',
      workerType: 'ai',
      agentIntelReq: 0,
    } as JobConfig,
  } as Record<JobType, JobConfig>,

  // Population and labor-market constraints.
  // Shares are relative to workforce-size population, not total population.
  humanPopulation: {
    totalPeople: 8_000_000_000,
    workforceShare: 0.62,
    talentShareByJob: {
      humanWorker: 0.3,
      humanSWE: 0.01,
      humanResearcher: 0.002,
    } as Record<HumanJobType, number>,
    // Below the talent share threshold wages stay at competitive market rates.
    // Above threshold wages increase exponentially by role shortage difficulty.
    // Additional global pressure starts once >50% of workforce is hired.
    salaryPressure: {
      exponentByJob: {
        humanWorker: 1.2,
        humanSWE: 2.5,
        humanResearcher: 3.5,
      } as Record<HumanJobType, number>,
      totalWorkforceExponent: 2.0,
      totalWorkforceActivationShare: 0.5,
    },
  },

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
  gpuBuyLimit: 500_000_000,
  pflopsPerGpu: 2.0,
  // Bundle power target: ~2 kW per GPU unit (card + shared infra overhead).
  gpuPowerMW: GPU_POWER_MW_PER_UNIT,

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
    { name: 'Small Datacenter',  cost: toBigInt(6_000_000),     gpuCapacity: scaleBigInt(256n),      laborCost: toBigInt(12),    limit: 100 } as DatacenterConfig,
    { name: 'Medium Datacenter', cost: toBigInt(75_000_000),    gpuCapacity: scaleBigInt(4_096n),    laborCost: toBigInt(360),  limit: 500 } as DatacenterConfig,
    { name: 'Large Datacenter',  cost: toBigInt(100_000_000),  gpuCapacity: scaleBigInt(65_536n),   laborCost: toBigInt(70_000), limit: 1000 } as DatacenterConfig,
    { name: 'Mega Datacenter',   cost: toBigInt(1_000_000_000), gpuCapacity: scaleBigInt(BigInt(MEGA_DATACENTER_GPU_CAPACITY)), laborCost: toBigInt(3_000_000), limit: MEGA_DATACENTER_LIMIT } as DatacenterConfig,
  ] as DatacenterConfig[],

  // Energy
  gridPowerKWCost: 500,
  gridPowerKWLimit: 1_000_000,
  // EIA AEO 2025 overnight capex (2024$/kW) used as baseline:
  // - Advanced combined cycle gas: ~791-875 $/kW
  // - Advanced nuclear: ~7821 $/kW
  // Rounded to clean gameplay values:
  // - Gas plant set to 200 MW at ~$800/kW => ~$160M
  // - Nuclear plant set to 1 GW at ~$8000/kW => ~$8B (labor cost is separate)
  // Labor is one-time build labor in person-months.
  // Approximate staffing programs:
  // - 200 MW CCGT: a few hundred workers over ~2 years -> ~3,000 person-months.
  // - 1 GW nuclear: 8 years * 9000 workers/month * 12 months/year = 864,000 person-months.
  powerPlants: {
    gas:     { name: 'Gas Plant',     cost: toBigInt(160_000_000),     outputMW: toBigInt(200),  laborCost: toBigInt(3_000),  limit: 500 } as PowerPlantConfig,
    nuclear: { name: 'Nuclear Plant', cost: toBigInt(6_000_000_000),   outputMW: toBigInt(1000), laborCost: toBigInt(1_000_000), limit: 50 } as PowerPlantConfig,
  },

  // Modern utility-scale panel baseline (rounded): ~600 W per panel, ~30 kg per panel.
  // Example references: LONGi Hi-MO X10 class modules (~670W, ~28.5kg).
  // `solarPanelMW` is base per-panel output before location multipliers and research bonuses.
  solarPanelMW: SOLAR_PANEL_POWER_MW,
  solarOutputMultiplierEarth: SOLAR_OUTPUT_MULTIPLIER_EARTH,
  solarOutputMultiplierMoon: SOLAR_OUTPUT_MULTIPLIER_MOON,
  solarOutputMultiplierMercury: SOLAR_OUTPUT_MULTIPLIER_MERCURY,
  // Sun-synchronous orbit assumption for Earth-orbit satellite design point.
  solarOutputMultiplierSpaceSso: SOLAR_OUTPUT_MULTIPLIER_SPACE_SSO,
  // Solar farms are discrete builds that consume panel inventory + labor.
  solarFarmPanelsPerFarm: SOLAR_FARM_PANELS,
  solarFarmLimit: SOLAR_FARM_LIMIT,
  earthSolarFarmLaborCost: toBigInt(100_000),
  moonSolarFarmLaborCost: toBigInt(1_000_000),
  moonGpuDatacenterGpusPerBuild: MOON_GPU_DATACENTER_GPUS_PER_BUILD,
  moonGpuDatacenterLimit: MOON_GPU_DATACENTER_LIMIT,
  moonGpuDatacenterLaborCost: toBigInt(10_000),

  // Training
  fineTunes: [
    { name: 'DeepKick-Math',   intel: 10.0, pflopsHrs: toBigInt(50),     dataGB: toBigInt(10),    codeReq: toBigInt(200),   scienceReq: 0n },
    { name: 'DeepKick-Code',   intel: 11.0, pflopsHrs: toBigInt(30_000),    dataGB: toBigInt(3000),    codeReq: toBigInt(30_000),   scienceReq: 0n },
    { name: 'DeepKick-Reason', intel: 12.0, pflopsHrs: toBigInt(500_000),    dataGB: toBigInt(100_000),   codeReq: toBigInt(500_000),   scienceReq: 0n },
    { name: 'DeepKick-Ultra',  intel: 13.0, pflopsHrs: toBigInt(10_000_000),   dataGB: toBigInt(1_000_000),   codeReq: toBigInt(10_000_000),  scienceReq: toBigInt(1_000) },
  ] as TrainingModelConfig[],

  ariesModels: [
    { name: 'Aries-1', intel: 20.0, pflopsHrs: toBigInt(20_000_000),     dataGB: toBigInt(2_000_000),      codeReq: toBigInt(2_000_000),  scienceReq: toBigInt(1_000_000) },
    { name: 'Aries-2', intel: 35.0, pflopsHrs: toBigInt(100_000_000),     dataGB: toBigInt(20_000_000),    codeReq: toBigInt(200_000_000),  scienceReq: toBigInt(10_000_000) },
    { name: 'Aries-3', intel: 50.0, pflopsHrs: toBigInt(10_000_000_000),    dataGB: toBigInt(1_000_000_000),   codeReq: toBigInt(160_000),  scienceReq: toBigInt(100_000) },
    { name: 'Aries-4', intel: 100.0, pflopsHrs: toBigInt(1_000_000_000_000),  dataGB: toBigInt(50_000_000_000),   codeReq: toBigInt(100_000_000), scienceReq: toBigInt(100_000_000_000) },
    { name: 'Aries-5', intel: 1000.0, pflopsHrs: toBigInt(1_000_000_000_000_000), dataGB: toBigInt(1_000_000_000_000),  codeReq: toBigInt(1_000_000_000_000), scienceReq: toBigInt(1_000_000_000_000_000) },
  ] as TrainingModelConfig[],

  trainingUnlockIntel: 9.0,
  dataPurchaseLimitGB: 1_000_000,

  // Research
  researchUnlockIntel: 10.0,
  research: [
    // Algorithms and API
    {
      id: 'algoEfficiency1',
      name: 'Algorithmic Efficiency +30%',
      cost: toBigInt(1),
      costResource: 'code',
      infinite: {
        initialLevel: 0,
        priceExponentPerLevel: 1.2,
        quantityMultiplierPerLevel: ALGO_EFFICIENCY_MULTIPLIER,
        quantityLabel: 'Training Speed',
        quantityBase: 1,
        quantityEmoji: 'flops',
        quantityUnit: 'x',
      },
      prereqs: [],
      description: 'Improvements to training algorithms speed up training.',
      algoEfficiencyMultiplier: ALGO_EFFICIENCY_MULTIPLIER,
    },
    { id: 'apiAutoPricing', name: 'API Auto Pricing',  cost: toBigInt(0.1),   costResource: 'code', prereqs: [], description: 'Unlock automatic API price adjustments' },
    { id: 'computeAutoAllocation', name: 'Compute Auto Allocation', cost: toBigInt(2), costResource: 'code', prereqs: ['apiAutoPricing'], description: 'Unlock automatic compute allocation' },
    {
      id: 'synthData2',
      name: 'API Data Generation (+100%)',
      cost: toBigInt(1000),
      costResource: 'code',
      infinite: {
        initialLevel: 1,
        priceExponentPerLevel: 1.2,
        quantityMultiplierPerLevel: API_USER_SYNTH_RATE_MULTIPLIER,
        quantityLabel: 'API User Data Rate',
        quantityBase: 1000,
        quantityEmoji: 'data',
        quantityUnit: '/m',
      },
      prereqs: [],
      description: 'API user data generation scales infinitely.',
      apiUserSynthRateMultiplier: API_USER_SYNTH_RATE_MULTIPLIER_B,
    },
    {
      id: 'syntheticData1',
      name: 'Synthetic Data',
      cost: toBigInt(20000),
      costResource: 'code',
      prereqs: [],
      description: 'Unlock AI Data Synthesizer job',
    },
    {
      id: 'syntheticData2',
      name: 'Synthetic Data Output (+100%)',
      cost: toBigInt(6_000_000),
      costResource: 'code',
      infinite: {
        initialLevel: 0,
        priceExponentPerLevel: 100,
        quantityMultiplierPerLevel: 2,
        quantityLabel: 'Synthesizer Output',
        quantityBase: 10,
        quantityEmoji: 'data',
        quantityUnit: '/m',
      },
      prereqs: ['syntheticData1'],
      description: 'AI Data Synthesizer output scales infinitely.',
      productionBoosts: { jobs: { aiDataSynthesizer: 2 } },
    },

    // Earth industrial start (pick order)
    { id: 'solarTechnology',      name: 'Solar Manufacturing',    cost: toBigInt(0.1),   prereqs: [],                    description: 'Unlock mining, solar factories, and solar farms' },
    { id: 'chipManufacturing',    name: 'Chip Manufacturing',     cost: toBigInt(2_000),   prereqs: [],   description: 'Unlock Earth GPU factories' },
    {
      id: 'robotics1',
      name: 'Robotics',
      cost: toBigInt(10_000),
      prereqs: ['solarTechnology'],
      description: 'Unlock robot workers.',
      productionBoosts: { jobs: { robotWorker: 0.5 } },
    },
    { id: 'robotFactoryEngineering1', name: 'Robot Factory Engineering I', cost: toBigInt(80_000), prereqs: ['robotics1'], description: 'Unlock Earth robot factories' },

    // Second wave
    { id: 'rocketry',             name: 'Rocketry',               cost: toBigInt(10_000),  prereqs: ['solarTechnology', 'chipManufacturing'],   description: 'Unlock Earth rocket and GPU satellite factories plus orbital deployment UI' },

    // Transport and lunar expansion
    { id: 'payloadToMoon',        name: 'Lunar Transport',        cost: toBigInt(5_000_000),  prereqs: ['rocketry'], description: 'Unlock Earth->Moon logistics and Moon installation UI' },
    { id: 'moonMineEngineering',  name: 'Moon Mining & Solar',    cost: toBigInt(20_000_000),  prereqs: ['payloadToMoon'], description: 'Unlock Moon material mines and solar factories' },
    { id: 'moonChipManufacturing',  name: 'Moon GPU Manufacturing',       cost: toBigInt(20_000_000), prereqs: ['moonMineEngineering'], description: 'Unlock Moon GPU factories' },
    { id: 'moonMassDrivers',      name: 'Moon Mass Drivers',      cost: toBigInt(100_000_000_000), prereqs: ['moonChipManufacturing'], description: 'Unlock Moon GPU satellite factories and mass drivers (more launches, larger payload)' },
    { id: 'moonRobotics', name: 'Moon Robotics', cost: toBigInt(20_000_000), prereqs: ['payloadToMoon', 'robotFactoryEngineering1'], description: 'Unlock Moon robot factories' },

    // Mercury and endgame
    { id: 'payloadToMercury',     name: 'Mercury Transport',      cost: toBigInt(1_500_000_000), prereqs: ['payloadToMoon', 'moonMassDrivers'], description: 'Unlock Moon->Mercury logistics and all Mercury buildings' },
    { id: 'mercuryRobotics', name: 'Mercury Robotics', cost: toBigInt(1_000_000), prereqs: ['payloadToMercury', 'moonRobotics'], description: 'Unlock Mercury robot factories' },

    // Rocket reuse tiers
    {
      id: 'reusableRockets1',
      name: 'Rocket Reusability (+100%)',
      cost: toBigInt(100_000),
      infinite: {
        initialLevel: 0,
        priceExponentPerLevel: 10,
        quantityMultiplierPerLevel: 0.5,
        quantityLabel: 'Rocket Loss',
        quantityBase: 100,
        quantityEmoji: 'rockets',
        quantityUnit: '%',
      },
      prereqs: ['rocketry'],
      description: 'Rocket losses scale down infinitely.',
      rocketLossMultiplier: ROCKET_LOSS_REUSABLE_1,
    },

    // Robotics scaling
    {
      id: 'robotics2',
      name: 'Robot Labor Output (+100%)',
      cost: toBigInt(100_000),
      infinite: {
        initialLevel: 0,
        priceExponentPerLevel: 5,
        quantityMultiplierPerLevel: 2,
        quantityLabel: 'Robot Labor Output',
        quantityBase: 0.5,
        quantityEmoji: 'labor',
        quantityUnit: '/m',
      },
      prereqs: ['robotics1'],
      description: 'Robot labor output scales infinitely.',
      productionBoosts: { jobs: { robotWorker: 2 } },
    },
    {
      id: 'facilityThroughput1',
      name: 'Facility Throughput (+100%)',
      cost: toBigInt(80_000_000),
      infinite: {
        initialLevel: 0,
        priceExponentPerLevel: 100,
        quantityMultiplierPerLevel: 2,
        quantityLabel: 'Facility Output',
        quantityBase: 1,
        quantityEmoji: 'flops',
        quantityUnit: 'x',
      },
      prereqs: ['payloadToMercury'],
      description: 'All industrial facilities scale infinitely.',
      productionBoosts: {
        facilities: {
          materialMine: 2,
          solarFactory: 2,
          robotFactory: 2,
          gpuFactory: 2,
          rocketFactory: 2,
          gpuSatelliteFactory: 2,
          dysonSwarmFacility: 2,
        },
      },
    },
    {
      id: 'jobThroughput1',
      name: 'Workforce Throughput (+50%)',
      cost: toBigInt(900_000_000),
      infinite: {
        initialLevel: 0,
        priceExponentPerLevel: 4,
        quantityMultiplierPerLevel: 1.5,
        quantityLabel: 'AI Job Output',
        quantityBase: 1,
        quantityEmoji: 'code',
        quantityUnit: 'x',
      },
      prereqs: ['payloadToMercury'],
      description: 'All AI job output scales infinitely.',
      productionBoosts: {
        jobs: {
          aiSWE: 1.5,
          aiResearcher: 1.5,
          aiDataSynthesizer: 1.5,
          manager: 1.5,
        },
      },
    },

    { id: 'vonNeumannProbes',     name: 'Von Neumann Probes',     cost: scaleBigInt(1_000_000_000_000n), prereqs: ['payloadToMercury', 'robotics2'], description: 'Unlock endgame probe launch' },

    // Compute techs
    {
      id: 'gpuArch1',
      name: 'GPU Architecture (+50%)',
      cost: toBigInt(4_000),
      infinite: {
        initialLevel: 0,
        priceExponentPerLevel: 10,
        quantityMultiplierPerLevel: 1.5,
        quantityLabel: 'GPU FLOPS',
        quantityBase: 1,
        quantityEmoji: 'flops',
        quantityUnit: 'x',
      },
      prereqs: ['chipManufacturing'],
      description: 'GPU performance scales infinitely.',
      gpuFlopsMultiplier: 1.5,
    },
  ] as ResearchConfig[],

  // Supply chain costs
  robotImportCost: toBigInt(60_000),
  robotWorkerBuyLimit: 100_000_000,

  // Facilities (Earth baseline)
  materialMineBuildMaterialCost: 0n,
  // Keep mines bootstrap-friendly (labor-only capex), but include heavy site-development labor:
  // exploration, overburden removal, haul roads, crushers, and support infra.
  materialMineBuildLaborCost: toBigInt(3_000),
  // Operating labor per minute (= per game-month), i.e. required FTE per mine.
  // 20,000 t/month at 125 person-months -> 160 t per person-month.
  // At 4k USD/labor-month this lands at ~25 USD/ton mined (lower bound of declared 25-50 USD range).
  materialMineLaborReq: toBigInt(125),
  materialMineOutput: toBigInt(20_000),
  // 100 billion t / year. One mine is 20k * 12 = 240k t / year. So 100 billion / 240k = 416,666 mines
  // larger limit for increased demand
  materialMineLimit: 10_000_000,

  // Approximate "single-tool fab module" assumptions:
  // one factory ~= one lithography machine + supporting process/module staff.
  // Throughput and staffing are set from order-of-magnitude real-world fab/tool data.
  gpuFactoryBuildMaterialCost: usdToMaterial(1_500_000_000), // include packaging/test and support-line capex
  gpuFactoryLaborCost: toBigInt(50_000), // higher effective staffing incl. yield/QA/operations overhead
  gpuFactoryLimit: 10_000,              // approx 1/4 of planetary mine capacity
  // Effective shipped units after yield loss, binning, and packaging bottlenecks.
  gpuFactoryOutput: toBigInt(80_000),
  gpuFactoryMaterialReq: toBigInt(400_000), // broader upstream material chain (substrates, high-end components)

  // Utility-scale module line: high-throughput, moderate labor, low mass per panel.
  // 120,000 panels/month at ~0.1 t ore-equivalent per panel.
  solarFactoryBuildMaterialCost: usdToMaterial(25_000_000), // ~$25M module assembly line
  solarFactoryLaborCost: toBigInt(2_000), // module assembly line staffing
  solarFactoryLimit: 50_000,
  solarFactoryOutput: toBigInt(120_000),
  solarFactoryMaterialReq: toBigInt(54_000), // ~15:1 refining ratio

  robotFactoryBuildMaterialCost: usdToMaterial(150_000_000), // ~$150M automotive-scale plant
  robotFactoryLaborCost: toBigInt(9_000),
  robotFactoryLimit: 100_000,
  robotFactoryOutput: toBigInt(2_000),
  robotFactoryMaterialReq: toBigInt(6_000), // includes broader drive electronics + sensors material burden

  rocketFactoryBuildMaterialCost: usdToMaterial(1_500_000_000), // ~$1.5B launch manufacturing complex
  // Labor and material here are monthly operating inputs (not one-time build cost),
  // representing a large, specialized aerospace workforce (e.g. Starbase scale).
  rocketFactoryLaborCost: toBigInt(35_000),
  rocketFactoryLimit: 50_000,
  rocketFactoryOutput: 6,
  // 30,000 ore-equivalent tons / month for 6 rockets / month ~= 5,000 tons per rocket.
  // Interpreted as ore-equivalent bill of materials (including rare/processed materials and amortized industrial chain).
  rocketFactoryMaterialReq: toBigInt(30_000),

  // Fully automated line: bus structure, avionics, thermal/radiation hardening, and integration burden
  // are amortized into factory capex rather than extra per-unit resource channels.
  gpuSatelliteFactoryBuildMaterialCost: usdToMaterial(10_000_000),
  gpuSatelliteFactoryLimit: 1_000_000,
  gpuSatelliteFactoryOutput: GPU_SATELLITE_FACTORY_OUTPUT_PER_MONTH,
  // Solar panels are derived from embedded GPU power draw at a sun-synchronous orbit efficiency point:
  // (300 GPUs/month * 0.002 MW/GPU) / (0.0006 MW/panel * 3.8) ~= 263 panels/month.
  // This keeps satellite power in lock-step with GPU payload balance while accounting for space solar yield.
  gpuSatelliteFactorySolarPanelReq: toBigInt(GPU_SATELLITE_SOLAR_PANEL_REQ_PER_MONTH),
  gpuSatelliteFactoryGpuReq: toBigInt(GPU_SATELLITE_GPU_REQ_PER_MONTH),

  // Mercury-only orbital assembly line for Dyson Swarm satellites.
  // For now this mirrors legacy satellite output speed with simplified direct inputs.
  dysonSwarmFacilityBuildMaterialCost: usdToMaterial(10_000_000),
  dysonSwarmFacilityLimit: 1_000_000,
  dysonSwarmFacilityOutput: DYSON_SWARM_FACILITY_OUTPUT_PER_MONTH,
  dysonSwarmFacilityMaterialReq: toBigInt(DYSON_SWARM_FACILITY_MATERIAL_REQ_PER_MONTH),
  dysonSwarmFacilityLaborReq: toBigInt(DYSON_SWARM_FACILITY_LABOR_REQ_PER_MONTH),

  // Soft stockpile caps to prevent overcommitting one production line.
  locationResourceStockpileCap: scaleBigInt(1_000_000_000_000_000n), // 1P
  locationResourceStockpileCapLabel: '1P',
  mercuryMaterialStockpileCap: scaleBigInt(1_000_000_000_000_000_000_000_000n), // 1Sx
  mercuryMaterialStockpileCapLabel: '1Sx',

  // Location multipliers and limits
  moonFacilityCostMultiplier: 2.2,
  moonFacilityLaborMultiplier: 1.6,
  mercuryFacilityCostMultiplier: 4.0,
  mercuryFacilityLaborMultiplier: 2.0,

  // Location-specific facility limits keep IDs decoupled for future per-location balancing.
  moonFacilityLimits: {
    moonMaterialMine: 100,
    moonSolarFactory: 100,
    moonRobotFactory: 100,
    moonGpuFactory: 100,
    moonGpuSatelliteFactory: 100,
  },
  moonMassDriverLimit: 10_000,

  mercuryFacilityLimits: {
    mercuryMaterialMine: 10_000,
    mercuryRobotFactory: 10_000,
    mercuryDysonSwarmFacility: 10_000,
  },

  // Space logistics
  rocketCapacityLowOrbit: 100 * 1000,
  rocketCapacityLunar: 10 * 1000,
  rocketCapacityMoonMercury: 200 * 1000,
  // Legacy alias. Prefer `rocketCapacityMoonMercury` for clarity.
  // Launching from a small gravity well (Mercury) to heliocentric space allows massive payload gains over Earth
  rocketCapacityMercury: 200 * 1000,

  massDriverLaunchesPerMin: 10_000,
  massDriverCapacityMultiplier: 12,

  // Transit timing assumes 1 min game time ~= 30 days real time.
  // SSO insertion is ~10-15 minutes real, which maps to ~14-21 ms in game.
  routeEarthOrbitTransitMs: 20,
  // Earth -> Moon is ~3 days, so ~6 seconds in game time.
  routeEarthMoonTransitMs: 6_000,
  // Typical transfers are multi-month; rounded to 6 game-months.
  routeMoonMercuryTransitMs: 360_000,

  earthRocketReturnMs: 12_000,
  // Return leg is generally longer than Earth routes; rounded to 7 game-months.
  moonRocketReturnMs: 420_000,

  rocketLossNoReuse: ROCKET_LOSS_NO_REUSE,
  rocketLossReusable1: ROCKET_LOSS_REUSABLE_1,
  rocketLossReusable2: ROCKET_LOSS_REUSABLE_2,
  rocketLossReusable3: ROCKET_LOSS_REUSABLE_3,

  // Payload masses (kg), tuned to realistic order-of-magnitude.
  robotWeight: 100,
  solarPanelWeight: 30,
  // One accelerator + apportioned server/rack overhead.
  gpuWeight: 8,
  // Large assembled power/compute satellite bus.
  gpuSatelliteWeight: 6_000,

  // Space power/mining
  // Mercury mass from NASA/JPL: 3.30103e23 kg = 3.30103e20 metric tons.
  // Rounded to 3.3e20 tons for gameplay readability.
  mercuryBaseMassTotal: scaleBigInt(330_000_000_000_000_000_000n),

  // Robot labor by location
  robotLaborPerMinBase: toBigInt(1),

  // API Services
  apiUnlockIntel: 5.0,
  apiUnlockCode: toBigInt(1),
  apiStartingPrice: 100,
  apiPflopsPerUser: 0.01,
  apiAdCost: toBigInt(1000),
  apiAdAwarenessBoost: 1000,
  apiImproveCodeCost: toBigInt(1),
  apiImproveEfficiencyBoost: 0.1,
  apiImprovePurchaseLimit: 999,
  apiDemandCapUsers: 6_000_000_000,
  apiUserSynthBase: API_USER_SYNTH_BASE_RATE,
};

const RESEARCH_COST_MULTIPLIER = 10_000n;
BALANCE.research = BALANCE.research.map((research) => ({
  ...research,
  cost: research.cost * RESEARCH_COST_MULTIPLIER,
}));

/**
 * Base stuck rate: probability per second that an active agent gets stuck.
 */
export function getStuckRate(intel: number): number {
  return 1 / (intel + 1);
}

/** Maximum global human workforce available to the player model. */
export function getHumanWorkforceCapacity(): bigint {
  return scaleBigInt(BigInt(Math.floor(BALANCE.humanPopulation.totalPeople * BALANCE.humanPopulation.workforceShare)));
}

/** Remaining global human workforce available to hire (scaled worker count). */
export function getHumanWorkforceRemaining(totalHumanWorkers: bigint): bigint {
  return getHumanWorkforceCapacity() - totalHumanWorkers;
}

/**
 * Dynamic monthly salary for a full human pool.
 * Salary is flat up to role competitive threshold, then rises exponentially.
 */
export function getHumanSalaryPerMin(
  jobType: HumanJobType,
  workerCount: bigint,
  totalHumanWorkers: bigint,
): bigint {
  const config = BALANCE.jobs[jobType];
  const baseSalary = config.salaryPerMin!;
  const workforceCap = fromBigInt(getHumanWorkforceCapacity());
  const roleThreshold = workforceCap * BALANCE.humanPopulation.talentShareByJob[jobType];
  const roleWorkers = fromBigInt(workerCount);
  const totalWorkers = fromBigInt(totalHumanWorkers);

  const pressure = BALANCE.humanPopulation.salaryPressure;
  const roleProgressRaw = roleWorkers <= roleThreshold
    ? 0
    : (roleWorkers - roleThreshold) / (workforceCap - roleThreshold);
  const roleProgress = roleProgressRaw * roleProgressRaw * (3 - 2 * roleProgressRaw);

  const activationShare = pressure.totalWorkforceActivationShare;
  const hiredShare = totalWorkers / workforceCap;
  // Global tightness proxy for hired/remaining workforce:
  // above 50% hired, this smoothly ramps from 0..1 toward full saturation.
  const globalProgressRaw = hiredShare <= activationShare
    ? 0
    : (hiredShare - activationShare) / (1 - activationShare);
  const globalProgress = globalProgressRaw * globalProgressRaw * (3 - 2 * globalProgressRaw);

  const exponent =
    pressure.exponentByJob[jobType] * roleProgress +
    pressure.totalWorkforceExponent * globalProgress;
  const unitSalary = scaleB(baseSalary, Math.exp(exponent));
  return mulB(unitSalary, workerCount);
}

/**
 * API demand curve used by ComputeSystem.
 * Kept here so economics live with balance parameters.
 */
export function getApiDemand(
  awareness: number,
  intelligence: number,
  price: number,
): number {
  // Function-local economics constants (kept inline unless shared elsewhere).
  const API_BASE_AWARENESS = 200_000;
  const API_AWARENESS_ELASTICITY = 0.9;
  const INTELLIGENCE_ELASTICITY = 3.0;
  const API_PRICE_ELASTICITY = 3.0;
  const API_DEMAND_SCALE = 3000;

  const effectiveAwareness = Math.max(0, API_BASE_AWARENESS + awareness);
  const safeIntelligence = Math.max(0.01, intelligence);
  const safePrice = Math.max(0.1, price);
  const unconstrainedDemand = (
    Math.pow(effectiveAwareness, API_AWARENESS_ELASTICITY) *
    (Math.pow(safeIntelligence, INTELLIGENCE_ELASTICITY) /
      Math.pow(safePrice, API_PRICE_ELASTICITY)) *
    API_DEMAND_SCALE
  );
  if (unconstrainedDemand <= 0) return 0;

  // Saturation keeps demand asymptotic near world population while never exceeding the hard cap.
  const cap = BALANCE.apiDemandCapUsers;
  const saturatedDemand = (unconstrainedDemand * cap) / (unconstrainedDemand + cap);
  return Math.max(0, Math.min(cap, saturatedDemand));
}

function normalizeApiPriceToStep(price: number): number {
  return Math.max(1, Math.round(price));
}

function getApiRevenueAtPrice(
  awareness: number,
  intelligence: number,
  capacityUsers: number,
  price: number,
): number {
  const safeCapacity = Math.max(0, capacityUsers);
  if (safeCapacity <= 0) return 0;
  const safePrice = normalizeApiPriceToStep(price);
  const demand = getApiDemand(awareness, intelligence, safePrice);
  const activeUsers = Math.min(safeCapacity, demand);
  return activeUsers * safePrice;
}

/**
 * Approximate revenue-maximizing API price (USD / user / min) for current market state.
 * Uses numeric search and returns a value aligned to UI/action $1 price steps.
 */
export function getApiOptimalPrice(
  awareness: number,
  intelligence: number,
  capacityUsers: number,
): number {
  const safeCapacity = Math.max(0, capacityUsers);
  if (safeCapacity <= 0) return 1;

  const minPrice = 1;
  const maxSearchPrice = 1_000_000;

  // Expand upper bound until revenue stops increasing.
  let right = minPrice;
  let prevRevenue = getApiRevenueAtPrice(awareness, intelligence, safeCapacity, right);
  while (right < maxSearchPrice) {
    const next = right * 2;
    const nextRevenue = getApiRevenueAtPrice(awareness, intelligence, safeCapacity, next);
    right = next;
    if (nextRevenue <= prevRevenue) break;
    prevRevenue = nextRevenue;
  }

  let left = minPrice;
  for (let i = 0; i < 40; i++) {
    const m1 = left + (right - left) / 3;
    const m2 = right - (right - left) / 3;
    const r1 = getApiRevenueAtPrice(awareness, intelligence, safeCapacity, m1);
    const r2 = getApiRevenueAtPrice(awareness, intelligence, safeCapacity, m2);
    if (r1 < r2) {
      left = m1;
    } else {
      right = m2;
    }
  }

  const center = (left + right) / 2;
  const base = normalizeApiPriceToStep(center);
  let bestPrice = base;
  let bestRevenue = getApiRevenueAtPrice(awareness, intelligence, safeCapacity, base);

  // Check nearby rounded prices to avoid missing the stepped-price optimum.
  for (let stepOffset = -8; stepOffset <= 8; stepOffset++) {
    const candidate = normalizeApiPriceToStep(base + stepOffset);
    const revenue = getApiRevenueAtPrice(awareness, intelligence, safeCapacity, candidate);
    if (revenue > bestRevenue) {
      bestRevenue = revenue;
      bestPrice = candidate;
    }
  }

  return bestPrice;
}

/** Effective inference cost after API optimization (PFLOPS per active user). */
export function getApiPflopsPerUser(apiEfficiency: number): number {
  return BALANCE.apiPflopsPerUser / apiEfficiency;
}

/** Minimum whole-percent compute allocation needed to run assigned agents. */
export function getAgentsRequiredAllocationPct(totalPflops: bigint, assignedAgents: bigint): number {
  if (assignedAgents <= 0n) return 0;
  if (totalPflops <= 0n) return 100;
  const pflopsPerAgent = toBigInt(BALANCE.pflopsPerGpu);
  for (let pct = 0; pct <= 100; pct++) {
    const allocatedPflops = mulB(totalPflops, toBigInt(pct)) / 100n;
    const activeAgentsAtPct = divB(allocatedPflops, pflopsPerAgent);
    if (activeAgentsAtPct >= assignedAgents) return pct;
  }
  return 100;
}

function getGpuSatelliteOutputDivisor(): bigint {
  return BigInt(Math.max(1, Math.floor(BALANCE.gpuSatelliteFactoryOutput)));
}

/** Embedded GPU-equivalent compute payload per produced GPU satellite. */
export function getGpuSatelliteGpuEquivalentPerUnit(): bigint {
  return BALANCE.gpuSatelliteFactoryGpuReq / getGpuSatelliteOutputDivisor();
}

/** PFLOPS provided per produced GPU satellite. */
export function getGpuSatellitePflopsPerUnit(): bigint {
  return scaleB(getGpuSatelliteGpuEquivalentPerUnit(), BALANCE.pflopsPerGpu);
}

/** MW supplied per produced GPU satellite, aligned to embedded GPU-equivalent power demand. */
export function getGpuSatellitePowerMWPerUnit(): number {
  return fromBigInt(getGpuSatelliteGpuEquivalentPerUnit()) * BALANCE.gpuPowerMW;
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

export function getAlgoEfficiencyResearchMultiplier(completedResearch: string[]): number {
  let multiplier = 1;
  for (const researchId of completedResearch) {
    const research = RESEARCH_BY_ID[researchId];
    const boost = research?.algoEfficiencyMultiplier;
    if (boost !== undefined) multiplier *= boost;
  }
  return multiplier;
}

export function getApiUserSynthRateFromResearch(completedResearch: string[]): bigint {
  const baseRate = BALANCE.apiUserSynthBase;
  let multiplier = 1n;
  for (const researchId of completedResearch) {
    const research = RESEARCH_BY_ID[researchId];
    if (!research) continue;

    const rateMultiplier = research.apiUserSynthRateMultiplier;
    if (rateMultiplier !== undefined) multiplier *= rateMultiplier;
  }
  return baseRate * multiplier;
}

export function isApiAutoPricingUnlocked(completedResearch: string[]): boolean {
  return completedResearch.includes(ResearchIds.apiAutoPricing);
}

export function isComputeAutoAllocationUnlocked(completedResearch: string[]): boolean {
  return completedResearch.includes(ResearchIds.computeAutoAllocation);
}

/**
 * Total GPU FLOPS multiplier from completed research.
 * Data-driven: any research entry with `gpuFlopsMultiplier` applies.
 */
export function getGpuFlopsResearchMultiplier(completedResearch: string[]): number {
  let multiplier = 1;
  for (const researchId of completedResearch) {
    const research = RESEARCH_BY_ID[researchId];
    const boost = research?.gpuFlopsMultiplier;
    if (boost !== undefined) multiplier *= boost;
  }
  return multiplier;
}

export function getRocketLossPctFromResearch(completedResearch: string[]): number {
  let rocketLossPct = BALANCE.rocketLossNoReuse;
  for (const researchId of completedResearch) {
    const research = RESEARCH_BY_ID[researchId];
    const lossMultiplier = research?.rocketLossMultiplier;
    if (lossMultiplier !== undefined) {
      rocketLossPct *= lossMultiplier;
    }
    const candidate = research?.rocketLossPct;
    if (candidate !== undefined && candidate < rocketLossPct) {
      rocketLossPct = candidate;
    }
  }
  return rocketLossPct;
}

export type SolarOutputEnvironment = 'earth' | 'moon' | 'mercury' | 'spaceSso';

export function getSolarPanelEnvironmentMultiplier(environment: SolarOutputEnvironment): number {
  if (environment === 'moon') return BALANCE.solarOutputMultiplierMoon;
  if (environment === 'mercury') return BALANCE.solarOutputMultiplierMercury;
  if (environment === 'spaceSso') return BALANCE.solarOutputMultiplierSpaceSso;
  return BALANCE.solarOutputMultiplierEarth;
}

/** Effective per-panel MW including location multipliers. */
export function getSolarPanelPowerMW(environment: SolarOutputEnvironment, _completedResearch: string[]): number {
  return (
    BALANCE.solarPanelMW *
    getSolarPanelEnvironmentMultiplier(environment)
  );
}
