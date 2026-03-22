export const SubscriptionTiers = {
  basic: 'basic',
  plus: 'plus',
  pro: 'pro',
  ultra: 'ultra',
  ultraMax: 'ultraMax',
  ultraProMax: 'ultraProMax',
} as const;

export type SubscriptionTier = typeof SubscriptionTiers[keyof typeof SubscriptionTiers];

export const TIER_ORDER: SubscriptionTier[] = [
  'ultraProMax', 'ultraMax', 'ultra', 'pro', 'plus', 'basic',
];

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
  sixxerBasic: 'sixxerBasic',
  sixxerEnterprise: 'sixxerEnterprise',
  manager: 'manager',
  aiSWE: 'aiSWE',
  aiResearcher: 'aiResearcher',
  aiDataSynthesizer: 'aiDataSynthesizer',
  robotWorker: 'robotWorker',
  humanSWE: 'humanSWE',
  humanResearcher: 'humanResearcher',
  humanWorker: 'humanWorker',
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
  | 'probeFactory'
  | 'massDriver';

export const JOB_ORDER: JobType[] = [
  'sixxerBasic', 'sixxerEnterprise',
  'manager',
  'robotWorker', 'humanWorker', 'humanResearcher', 'humanSWE',
  'aiSWE', 'aiResearcher', 'aiDataSynthesizer',
];

export const ResearchIds = {
  algoEfficiency1: 'algoEfficiency1',
  agentMultiplexing1: 'agentMultiplexing1',
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
  solarTechnology: 'solarTechnology',
  chipManufacturing: 'chipManufacturing',
  codeProductivity1: 'codeProductivity1',
  robotics1: 'robotics1',
  robotFactoryEngineering1: 'robotFactoryEngineering1',
  moonRobotics: 'moonRobotics',
  mercuryRobotics: 'mercuryRobotics',
  rocketry: 'rocketry',
  payloadToMoon: 'payloadToMoon',
  payloadToMercury: 'payloadToMercury',
  moonMineEngineering: 'moonMineEngineering',
  moonChipManufacturing: 'moonChipManufacturing',
  moonMassDrivers: 'moonMassDrivers',
  researchProductivity1: 'researchProductivity1',
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
export type ResearchLevelState = Partial<Record<ResearchId, number>>;

export type ResearchEffect =
  | { type: 'algoEfficiency' }
  | { type: 'agentsPerGpu' }
  | { type: 'apiUserSynthRate' }
  | { type: 'gpuFlops' }
  | { type: 'rocketLoss' }
  | { type: 'jobProduction'; jobs: JobType[] }
  | { type: 'facilityProduction'; facilities: FacilityProductionId[] };

export interface ResearchConfig {
  id: ResearchId;
  name: string;
  costResource?: ResearchCostResource;
  minLevel: number;
  isInfinite: boolean;
  totalLevels?: number;
  quantityMultiplierPerLevel: number;
  quantityLabel?: string;
  quantityBase?: number;
  quantityEmoji?: ResearchQuantityEmoji;
  quantityUnit?: string;
  prereqs: ResearchId[];
  description: string;
  effect?: ResearchEffect;
}

export interface TierConfig {
  cost: bigint;
  intel: number;
  displayName: string;
  unlockDescription: string;
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
}

export interface ModelConfig {
  name: string;
  intel: number;
  minGpus: bigint;
  codeRequirement?: bigint;
  unlockDescription?: string;
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
  codeCostLevel?: number;
  scienceCostLevel?: number;
  unlockDescription?: string;
}

export interface TrainingResourceRequirement {
  resource: ResearchCostResource;
  level: number;
  cost: bigint;
}

export type SolarOutputEnvironment = 'earth' | 'moon' | 'mercury' | 'spaceSso';
