/**
 * Balancing conventions:
 * - 1 minute of real time = 1 month in game for all time-based calculations (job times, research times, salaries, etc.)
 * - 1 material = 1 ton (1000kg) of raw materials (unenriched ore) ~= 25-50 USD
 * - 1 labor = 1 person-month of labor ~= 4k USD
 * - 1 data = 1 gigabyte of data
 * - 1 nudge = 1 person-month of management
 * - 1 code = 1 person-month of coding
 * - 1 science = 1 person-month of research
 */

import { scaleBigInt, toBigInt } from '../utils.ts';
import { RESEARCH_CONFIGS } from './ResearchConfigs.ts';
import { ARIES_MODELS, FINE_TUNES, INTELLIGENCE_LEVELS, MODELS, SUBSCRIPTION_TIERS } from './TrainingConfigs.ts';
import {
  DYSON_SWARM_FACILITY_LABOR_REQ_PER_MONTH,
  DYSON_SWARM_FACILITY_MATERIAL_REQ_PER_MONTH,
  DYSON_SWARM_FACILITY_OUTPUT_PER_MONTH,
  GPU_POWER_MW_PER_UNIT,
  GPU_SATELLITE_FACTORY_OUTPUT_PER_MONTH,
  GPU_SATELLITE_GPU_REQ_PER_MONTH,
  GPU_SATELLITE_SOLAR_PANEL_REQ_PER_MONTH,
  MEGA_DATACENTER_GPU_CAPACITY,
  MEGA_DATACENTER_LIMIT,
  MOON_GPU_DATACENTER_GPUS_PER_BUILD,
  MOON_GPU_DATACENTER_LIMIT,
  SOLAR_FARM_LIMIT,
  SOLAR_FARM_PANELS,
  SOLAR_OUTPUT_MULTIPLIER_EARTH,
  SOLAR_OUTPUT_MULTIPLIER_MERCURY,
  SOLAR_OUTPUT_MULTIPLIER_MOON,
  SOLAR_OUTPUT_MULTIPLIER_SPACE_SSO,
  SOLAR_PANEL_POWER_MW,
  USD_PER_LABOR,
  USD_PER_MATERIAL,
  VON_NEUMANN_PROBE_LABOR_REQ_PER_MONTH,
  VON_NEUMANN_PROBE_MATERIAL_REQ_PER_MONTH,
  VON_NEUMANN_PROBE_OUTPUT_PER_MONTH,
  usdToMaterial,
} from './Internal.ts';
import type { DatacenterConfig, JobConfig, JobType, PowerPlantConfig, ResearchCostResource } from './Types.ts';

export const BALANCE = {
  startingFunds: 0,
  startingCpuCores: 8,
  tickIntervalMs: 100,
  uiUpdateIntervalMs: 200,
  autoSaveIntervalMs: 30000,
  agentControlUnlockIntel: INTELLIGENCE_LEVELS.PLUS,

  usdPerMaterial: USD_PER_MATERIAL,
  usdPerLabor: USD_PER_LABOR,

  tiers: SUBSCRIPTION_TIERS,

  jobs: {
    sixxerBasic:      { produces: { resource: 'funds', amount: toBigInt(6) },   timeMs: 5_000, unlockAtIntel: INTELLIGENCE_LEVELS.BASIC, agentIntelReq: INTELLIGENCE_LEVELS.BASIC, workerType: 'ai', displayName: 'Sixxer Basic' } as JobConfig,
    sixxerEnterprise: { produces: { resource: 'funds', amount: toBigInt(300) }, timeMs: 10_000, unlockAtIntel: INTELLIGENCE_LEVELS.ULTRA_MAX, agentIntelReq: INTELLIGENCE_LEVELS.ULTRA_MAX, workerType: 'ai', displayName: 'Sixxer Enterprise' } as JobConfig,
    manager:          { produces: { resource: 'nudge', amount: toBigInt(1) },   timeMs: 1_000, unlockAtIntel: INTELLIGENCE_LEVELS.ULTRA, agentIntelReq: INTELLIGENCE_LEVELS.ULTRA, workerType: 'ai', displayName: 'Agent Manager', stuckProbability: 0 } as JobConfig,
    aiSWE:            { produces: { resource: 'code', amount: toBigInt(1) },    timeMs: 60_000, unlockAtIntel: INTELLIGENCE_LEVELS.ARIES_1, agentIntelReq: INTELLIGENCE_LEVELS.ARIES_1, workerType: 'ai', displayName: 'AI Coder' } as JobConfig,
    aiResearcher:     { produces: { resource: 'science', amount: toBigInt(1) }, timeMs: 60_000, unlockAtIntel: INTELLIGENCE_LEVELS.ARIES_2, agentIntelReq: INTELLIGENCE_LEVELS.ARIES_2, workerType: 'ai', displayName: 'AI Researcher' } as JobConfig,
    aiDataSynthesizer:{ produces: { resource: 'data', amount: toBigInt(10) },   timeMs: 60_000, unlockAtIntel: INTELLIGENCE_LEVELS.ARIES_1, agentIntelReq: INTELLIGENCE_LEVELS.ARIES_1, agentResearchReq: ['syntheticData1'], workerType: 'ai', displayName: 'AI Data Synthesizer' } as JobConfig,
    robotWorker:      { produces: { resource: 'labor', amount: 0n },            timeMs: 3000, unlockAtIntel: INTELLIGENCE_LEVELS.NONE, agentIntelReq: INTELLIGENCE_LEVELS.NONE, agentResearchReq: ['robotics1'], workerType: 'human', displayName: 'Robot Worker' } as JobConfig,
    humanSWE:         { produces: { resource: 'code', amount: toBigInt(0.1) },  timeMs: 6_000, unlockAtIntel: INTELLIGENCE_LEVELS.DEEPKICK_647B, agentIntelReq: INTELLIGENCE_LEVELS.NONE, workerType: 'human', displayName: 'Human Coder', salaryPerMin: toBigInt(11_000), hireCost: toBigInt(500) } as JobConfig,
    humanResearcher:  { produces: { resource: 'science', amount: toBigInt(0.1) }, timeMs: 6_000, unlockAtIntel: INTELLIGENCE_LEVELS.DEEPKICK_MATH, agentIntelReq: INTELLIGENCE_LEVELS.NONE, workerType: 'human', displayName: 'Human Researcher', salaryPerMin: toBigInt(12_000), hireCost: toBigInt(1000) } as JobConfig,
    humanWorker:      { produces: { resource: 'labor', amount: toBigInt(0.1) }, timeMs: 6_000, unlockAtIntel: INTELLIGENCE_LEVELS.DEEPKICK_1_2T, agentIntelReq: INTELLIGENCE_LEVELS.NONE, workerType: 'human', displayName: 'Human Worker', salaryPerMin: toBigInt(4_000), hireCost: toBigInt(300) } as JobConfig,
    unassigned: {
      produces: { resource: 'funds', amount: 0n },
      timeMs: 0,
      unlockAtIntel: INTELLIGENCE_LEVELS.NONE,
      displayName: 'Unassigned',
      workerType: 'ai',
      agentIntelReq: INTELLIGENCE_LEVELS.NONE,
    } as JobConfig,
  } as Record<JobType, JobConfig>,

  humanPopulation: {
    totalPeople: 8_000_000_000,
    workforceShare: 0.62,
    talentShareByJob: {
      humanWorker: 0.3,
      humanSWE: 0.01,
      humanResearcher: 0.002,
    },
    salaryPressure: {
      exponentByJob: {
        humanWorker: 1.2,
        humanSWE: 2.5,
        humanResearcher: 3.5,
      },
      totalWorkforceExponent: 2.0,
      totalWorkforceActivationShare: 0.5,
    },
  },

  micMini: {
    cost: toBigInt(500),
    coresAdded: scaleBigInt(4n),
    displayName: 'Muck-mini PC',
    limit: 20,
  },

  agentHireCost: toBigInt(24),
  selfHostedUnlockIntel: INTELLIGENCE_LEVELS.ULTRA_PRO_MAX,
  selfHostedGpuCount: scaleBigInt(4n),
  selfHostedAgentGrant: scaleBigInt(128n),
  baseAgentsPerGpu: toBigInt(32),
  gpuFixedPrice: toBigInt(32_000),
  gpuPriceVariationPct: 0.2,
  gpuPriceMaxChangePerSecondPct: 0.04,
  gpuBuyLimit: 500_000_000,
  pflopsPerGpu: 2.0,
  gpuPowerMW: GPU_POWER_MW_PER_UNIT,

  models: MODELS,

  datacenterThreshold: scaleBigInt(512n),
  datacenters: [
    { name: 'Small Datacenter', cost: toBigInt(20_000_000), gpuCapacity: scaleBigInt(2_000n), laborCost: toBigInt(150), limit: 100 } as DatacenterConfig,
    { name: 'Medium Datacenter', cost: toBigInt(180_000_000), gpuCapacity: scaleBigInt(32_000n), laborCost: toBigInt(30_000), limit: 500 } as DatacenterConfig,
    { name: 'Large Datacenter', cost: toBigInt(600_000_000), gpuCapacity: scaleBigInt(128_000n), laborCost: toBigInt(120_000), limit: 1000 } as DatacenterConfig,
    { name: 'Mega Datacenter', cost: toBigInt(3_000_000_000), gpuCapacity: scaleBigInt(BigInt(MEGA_DATACENTER_GPU_CAPACITY)), laborCost: toBigInt(1_200_000), limit: MEGA_DATACENTER_LIMIT } as DatacenterConfig,
  ] as DatacenterConfig[],

  gridPowerKWCost: 500,
  gridPowerKWLimit: 1_000_000,
  powerPlants: {
    gas:     { name: 'Gas Plant', cost: toBigInt(160_000_000), outputMW: toBigInt(200), laborCost: toBigInt(3_000), limit: 500 } as PowerPlantConfig,
    nuclear: { name: 'Nuclear Plant', cost: toBigInt(6_000_000_000), outputMW: toBigInt(1000), laborCost: toBigInt(1_000_000), limit: 50 } as PowerPlantConfig,
  },

  solarPanelMW: SOLAR_PANEL_POWER_MW,
  solarOutputMultiplierEarth: SOLAR_OUTPUT_MULTIPLIER_EARTH,
  solarOutputMultiplierMoon: SOLAR_OUTPUT_MULTIPLIER_MOON,
  solarOutputMultiplierMercury: SOLAR_OUTPUT_MULTIPLIER_MERCURY,
  solarOutputMultiplierSpaceSso: SOLAR_OUTPUT_MULTIPLIER_SPACE_SSO,
  solarFarmPanelsPerFarm: SOLAR_FARM_PANELS,
  solarFarmLimit: SOLAR_FARM_LIMIT,
  earthSolarFarmLaborCost: toBigInt(100_000),
  moonSolarFarmLaborCost: toBigInt(1_000_000),
  moonGpuDatacenterGpusPerBuild: MOON_GPU_DATACENTER_GPUS_PER_BUILD,
  moonGpuDatacenterLimit: MOON_GPU_DATACENTER_LIMIT,
  moonGpuDatacenterLaborCost: toBigInt(10_000),

  trainingResourceBaseCostByResource: {
    code: toBigInt(200),
    science: toBigInt(200),
  } as Record<ResearchCostResource, bigint>,
  researchResourceBaseCostByResource: {
    code: toBigInt(1),
    science: toBigInt(1),
  } as Record<ResearchCostResource, bigint>,
  fineTunes: FINE_TUNES,
  ariesModels: ARIES_MODELS,
  trainingUnlockIntel: INTELLIGENCE_LEVELS.DEEPKICK_2_8T,
  dataPurchaseLimitGB: 1_000_000,

  researchUnlockIntel: INTELLIGENCE_LEVELS.DEEPKICK_MATH,
  research: RESEARCH_CONFIGS,

  robotImportCost: toBigInt(60_000),
  robotWorkerBuyLimit: 100_000_000,

  materialMineBuildMaterialCost: 0n,
  materialMineBuildLaborCost: toBigInt(3_000),
  materialMineLaborReq: toBigInt(125),
  materialMineOutput: toBigInt(20_000),
  materialMineLimit: 10_000_000,

  gpuFactoryBuildMaterialCost: usdToMaterial(1_500_000_000),
  gpuFactoryLaborCost: toBigInt(50_000),
  gpuFactoryLimit: 10_000,
  gpuFactoryOutput: toBigInt(80_000),
  gpuFactoryMaterialReq: toBigInt(400_000),

  solarFactoryBuildMaterialCost: usdToMaterial(25_000_000),
  solarFactoryLaborCost: toBigInt(2_000),
  solarFactoryLimit: 50_000,
  solarFactoryOutput: toBigInt(120_000),
  solarFactoryMaterialReq: toBigInt(54_000),

  robotFactoryBuildMaterialCost: usdToMaterial(150_000_000),
  robotFactoryLaborCost: toBigInt(9_000),
  robotFactoryLimit: 100_000,
  robotFactoryOutput: toBigInt(2_000),
  robotFactoryMaterialReq: toBigInt(6_000),

  rocketFactoryBuildMaterialCost: usdToMaterial(1_500_000_000),
  rocketFactoryLaborCost: toBigInt(35_000),
  rocketFactoryLimit: 50_000,
  rocketFactoryOutput: 6,
  rocketFactoryMaterialReq: toBigInt(30_000),

  gpuSatelliteFactoryBuildMaterialCost: usdToMaterial(10_000_000),
  gpuSatelliteFactoryLimit: 1_000_000,
  gpuSatelliteFactoryOutput: GPU_SATELLITE_FACTORY_OUTPUT_PER_MONTH,
  gpuSatelliteFactorySolarPanelReq: toBigInt(GPU_SATELLITE_SOLAR_PANEL_REQ_PER_MONTH),
  gpuSatelliteFactoryGpuReq: toBigInt(GPU_SATELLITE_GPU_REQ_PER_MONTH),

  dysonSwarmFacilityBuildMaterialCost: usdToMaterial(10_000_000),
  dysonSwarmFacilityLimit: 1_000_000,
  dysonSwarmFacilityOutput: DYSON_SWARM_FACILITY_OUTPUT_PER_MONTH,
  dysonSwarmFacilityMaterialReq: toBigInt(DYSON_SWARM_FACILITY_MATERIAL_REQ_PER_MONTH),
  dysonSwarmFacilityLaborReq: toBigInt(DYSON_SWARM_FACILITY_LABOR_REQ_PER_MONTH),

  probeFactoryBuildMaterialCost: usdToMaterial(500_000_000),
  probeFactoryBuildLaborCost: toBigInt(25_000),
  probeFactoryLimit: 1,
  probeFactoryOutput: VON_NEUMANN_PROBE_OUTPUT_PER_MONTH,
  probeFactoryMaterialReq: toBigInt(VON_NEUMANN_PROBE_MATERIAL_REQ_PER_MONTH),
  probeFactoryLaborReq: toBigInt(VON_NEUMANN_PROBE_LABOR_REQ_PER_MONTH),

  locationResourceStockpileCap: scaleBigInt(1_000_000_000_000_000n),
  locationResourceStockpileCapLabel: '1P',
  mercuryMaterialStockpileCap: scaleBigInt(1_000_000_000_000_000_000_000_000n),
  mercuryMaterialStockpileCapLabel: '1Sx',

  moonFacilityCostMultiplier: 2.2,
  moonFacilityLaborMultiplier: 1.6,
  mercuryFacilityCostMultiplier: 4.0,
  mercuryFacilityLaborMultiplier: 2.0,

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
    mercuryProbeFactory: 1,
  },

  rocketCapacityLowOrbit: 100 * 1000,
  rocketCapacityLunar: 10 * 1000,
  rocketCapacityMoonMercury: 200 * 1000,
  rocketCapacityMercury: 200 * 1000,
  massDriverLaunchesPerMin: 10_000,
  massDriverCapacityMultiplier: 12,
  routeEarthOrbitTransitMs: 1_000,
  routeEarthMoonTransitMs: 3_000,
  routeMoonMercuryTransitMs: 3_000,
  earthRocketReturnMs: 12_000,
  moonRocketReturnMs: 420_000,
  robotWeight: 100,
  solarPanelWeight: 30,
  gpuWeight: 8,
  gpuSatelliteWeight: 6_000,

  mercuryBaseMassTotal: scaleBigInt(330_000_000_000_000_000_000n),
  robotLaborPerMinBase: toBigInt(1),

  apiUnlockIntel: INTELLIGENCE_LEVELS.DEEPKICK_647B,
  apiUnlockCode: toBigInt(1),
  apiStartingPrice: 50,
  apiPflopsPerUser: 0.0001,
  apiAdCost: toBigInt(100_000),
  apiAdCostExponent: 1.2,
  apiAdAwarenessBoost: 20000,
  apiImproveCodeCost: toBigInt(1),
  apiImproveCostExponent: 1.2,
  apiImproveEfficiencyBoost: 0.1,
  apiImprovePurchaseLimit: 999,
  apiDemandCapUsers: 6_000_000_000,
  apiUserSynthBase: 1000n,
};
