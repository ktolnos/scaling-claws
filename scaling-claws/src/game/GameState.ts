import { BALANCE, getGpuTargetPrice } from './BalanceConfig.ts';
import type { SubscriptionTier, JobType } from './BalanceConfig.ts';
import { toBigInt, scaleBigInt } from './utils.ts';

export interface JobPool {
  totalCount: bigint;         // Total agents in this job
  stuckCount: bigint;         // How many agents are currently stuck
  idleCount: bigint;          // How many agents are idle (no CPU/GPU)
  aggregateProgress: bigint;  // Collective progress tracker
  samples: {                  // Only 4 sample agents for UI display
    progress: number[];       // [0..1, 0..1, 0..1, 0..1]
    stuck: boolean[];         // [bool, bool, bool, bool]
  };
}

export interface ResourceRate {
  label: string;
  ratePerMin: bigint;
}

export interface ResourceBreakdown {
  funds: { income: ResourceRate[]; expense: ResourceRate[] };
  code: { income: ResourceRate[]; expense: ResourceRate[] };
  science: { income: ResourceRate[]; expense: ResourceRate[] };
  labor: { income: ResourceRate[]; expense: ResourceRate[] };
  compute: { label: string; pflops: bigint }[];
}

export interface HumanPool {
  totalCount: bigint;
  aggregateProgress: bigint;
  samples: {
    progress: number[];
  };
}

export type LocationId = 'earth' | 'moon' | 'mercury';
export type SupplyResourceId = 'material' | 'solarPanels' | 'robots' | 'gpus' | 'rockets' | 'gpuSatellites' | 'labor';
export type FacilityId =
  | 'earthMaterialMine'
  | 'earthSolarFactory'
  | 'earthRobotFactory'
  | 'earthGpuFactory'
  | 'earthRocketFactory'
  | 'earthGpuSatelliteFactory'
  | 'moonMaterialMine'
  | 'moonSolarFactory'
  | 'moonRobotFactory'
  | 'moonGpuFactory'
  | 'moonGpuSatelliteFactory'
  | 'moonMassDriver'
  | 'mercuryMaterialMine'
  | 'mercuryRobotFactory'
  | 'mercuryDysonSwarmFacility';
export type TransportRouteId = 'earthOrbit' | 'earthMoon' | 'moonOrbit' | 'moonMercury' | 'mercurySun';
export type TransportPayloadId = 'gpuSatellites' | 'gpus' | 'solarPanels' | 'robots';

export interface LocationResourceState {
  material: bigint;
  solarPanels: bigint;
  robots: bigint;
  gpus: bigint;
  rockets: bigint;
  gpuSatellites: bigint;
  labor: bigint;
  installedGpus: bigint;
  installedSolarPanels: bigint;
}

export interface LocationRateState {
  material: bigint;
  solarPanels: bigint;
  robots: bigint;
  gpus: bigint;
  rockets: bigint;
  gpuSatellites: bigint;
  labor: bigint;
}

export interface LocationFacilityState {
  earthMaterialMine: bigint;
  earthSolarFactory: bigint;
  earthRobotFactory: bigint;
  earthGpuFactory: bigint;
  earthRocketFactory: bigint;
  earthGpuSatelliteFactory: bigint;
  moonMaterialMine: bigint;
  moonSolarFactory: bigint;
  moonRobotFactory: bigint;
  moonGpuFactory: bigint;
  moonGpuSatelliteFactory: bigint;
  moonMassDriver: bigint;
  mercuryMaterialMine: bigint;
  mercuryRobotFactory: bigint;
  mercuryDysonSwarmFacility: bigint;
}

export interface LocationFacilityRateState {
  earthMaterialMine: number;
  earthSolarFactory: number;
  earthRobotFactory: number;
  earthGpuFactory: number;
  earthRocketFactory: number;
  earthGpuSatelliteFactory: number;
  moonMaterialMine: number;
  moonSolarFactory: number;
  moonRobotFactory: number;
  moonGpuFactory: number;
  moonGpuSatelliteFactory: number;
  moonMassDriver: number;
  mercuryMaterialMine: number;
  mercuryRobotFactory: number;
  mercuryDysonSwarmFacility: number;
}

export interface TransportBatch {
  route: TransportRouteId;
  payload: TransportPayloadId;
  amount: bigint;
  deliveredAt: number;
}

export interface GameState {
  // Core resources
  funds: bigint;
  totalEarned: bigint;

  // Resource Breakdown for UI
  resourceBreakdown: ResourceBreakdown;

  // Time
  tickCount: number;
  time: number; // simulation time in milliseconds

  // AI Agent Pools
  agentPools: Record<JobType, JobPool>;
  totalAgents: bigint;

  // Human Workers
  humanPools: Record<JobType, HumanPool>;

  // Global Subscription Tier
  subscriptionTier: SubscriptionTier;

  // Hardware (pre-GPU)
  cpuCoresTotal: bigint;
  micMiniCount: bigint;

  // GPU & Compute
  gpuMarketPrice: bigint;      // current Earth GPU market price per unit
  installedGpuCount: bigint;   // computed: min(earth GPUs, gpuCapacity)
  totalPflops: bigint;         // Compute used for gameplay allocation (Earth + Moon + Mercury + orbital)
  earthPflops: bigint;         // computed
  moonPflops: bigint;          // computed
  mercuryPflops: bigint;       // computed
  orbitalPflops: bigint;       // computed
  currentModelIndex: number;   // index into BALANCE.models
  freeCompute: bigint;         // computed
  isPostGpuTransition: boolean;

  // Datacenters: count per tier [small, medium, large, mega]
  datacenters: bigint[];
  gpuCapacity: bigint;         // computed
  needsDatacenter: boolean;    // computed: Earth GPU count approaching capacity

  // Labor
  laborPerMin: bigint;         // computed Earth labor production rate

  // Multi-location supply state
  locationResources: Record<LocationId, LocationResourceState>;
  locationProductionPerMin: Record<LocationId, LocationRateState>;
  locationConsumptionPerMin: Record<LocationId, LocationRateState>;
  locationFacilities: Record<LocationId, LocationFacilityState>;
  locationFacilityRates: Record<LocationId, LocationFacilityRateState>;
  pausedFacilities: Record<FacilityId, boolean>;

  // Energy
  gridPowerKW: bigint;
  gasPlants: bigint;
  nuclearPlants: bigint;
  powerDemandMW: bigint;       // computed
  powerSupplyMW: bigint;       // computed
  powerThrottle: number;       // 0..1, 1 = no throttle

  // Training
  trainingData: bigint;           // GB of training data owned
  trainingDataPurchases: number;  // total GB purchased from market (used for purchase cap)
  trainingAllocationPct: number;  // 0-100, step 5
  trainingAllocatedPflops: bigint; // computed
  currentFineTuneIndex: number;   // -1 = none active, index into BALANCE.fineTunes
  fineTuneProgress: bigint;       // PFLOPS-hrs completed
  completedFineTunes: number[];   // indices of completed fine-tunes
  ariesModelIndex: number;        // -1 = none, index into BALANCE.ariesModels
  ariesProgress: bigint;          // PFLOPS-hrs into current Aries run

  // Code & Science (produced by jobs, consumed by training/research)
  code: bigint;
  codePerMin: bigint;
  science: bigint;
  sciencePerMin: bigint;

  // Research
  completedResearch: string[];
  synthDataRate: bigint;          // computed
  algoEfficiencyBonus: number;    // computed: multiplier for training speed
  gpuFlopsBonus: number;          // computed: multiplier for GPU PFLOPS

  // New Logistics
  logisticsOrders: Record<string, bigint>;
  logisticsSent: Record<string, bigint>;
  logisticsInTransit: Record<string, bigint>;
  logisticsAutoQueue: Record<string, boolean>;
  transportBatches: TransportBatch[];
  earthLaunchCarry: number;
  moonLaunchCarry: number;
  mercuryLaunchCarry: number;
  rocketLossPct: number;

  // API Services
  apiUnlocked: boolean;
  apiUserCount: bigint;
  apiPrice: number;
  apiAutoPriceEnabled: boolean;
  computeAutoAllocationEnabled: boolean;
  apiDemand: bigint;
  apiAwareness: number;
  apiReservedPflops: bigint;
  apiIncomePerMin: bigint;
  apiInferenceAllocationPct: number;
  apiUserSynthRate: bigint;
  apiImprovementLevel: number; // optimization upgrade count
  apiQuality: number; // inference efficiency multiplier (higher => fewer PFLOPS/user)

  // Space - Orbit
  satellites: bigint;
  orbitalPowerMW: bigint;
  dysonSwarmSatellites: bigint;
  dysonSwarmPowerMW: bigint;
  spaceUnlocked: boolean;
  launchCostBonus: number;

  // Mercury progress
  mercuryMassMined: bigint;
  mercuryMassTotal: bigint;

  // Energy — separate grids
  lunarPowerDemandMW: bigint;
  lunarPowerSupplyMW: bigint;
  lunarPowerThrottle: number;
  mercuryPowerDemandMW: bigint;
  mercuryPowerSupplyMW: bigint;
  mercuryPowerThrottle: number;
  totalEnergyMW: bigint;

  // Job tracking
  completedTasks: bigint;
  unlockedJobs: JobType[];
  automatedJobs: JobType[];

  // Manager tracking
  managerCount: bigint;
  nudgeBuffer: bigint;

  // Computed per tick (for UI display)
  incomePerMin: bigint;
  expensePerMin: bigint;
  humanSalaryPerMin: bigint;
  intelligence: number;
  agentEfficiency: number;
  stuckCount: bigint;
  activeAgentCount: bigint;
  usedCores: bigint;

  // End state
  gameWon: boolean;

  // Flavor text
  pendingFlavorTexts: string[];
  shownFlavorTexts: string[];

  // UI state - GameState is the single source of truth for UI persistence.
  // Do not mirror this state in separate UI manager fields.
  openedTabs: Record<string, boolean>;
  tabAlerts: Record<string, boolean>;
  selectedTabId: string | null;
}

function createEmptyLocationResources(): LocationResourceState {
  return {
    material: 0n,
    solarPanels: 0n,
    robots: 0n,
    gpus: 0n,
    rockets: 0n,
    gpuSatellites: 0n,
    labor: 0n,
    installedGpus: 0n,
    installedSolarPanels: 0n,
  };
}

function createEmptyLocationRates(): LocationRateState {
  return {
    material: 0n,
    solarPanels: 0n,
    robots: 0n,
    gpus: 0n,
    rockets: 0n,
    gpuSatellites: 0n,
    labor: 0n,
  };
}

function createEmptyLocationFacilities(): LocationFacilityState {
  return {
    earthMaterialMine: 0n,
    earthSolarFactory: 0n,
    earthRobotFactory: 0n,
    earthGpuFactory: 0n,
    earthRocketFactory: 0n,
    earthGpuSatelliteFactory: 0n,
    moonMaterialMine: 0n,
    moonSolarFactory: 0n,
    moonRobotFactory: 0n,
    moonGpuFactory: 0n,
    moonGpuSatelliteFactory: 0n,
    moonMassDriver: 0n,
    mercuryMaterialMine: 0n,
    mercuryRobotFactory: 0n,
    mercuryDysonSwarmFacility: 0n,
  };
}

function createEmptyFacilityRates(): LocationFacilityRateState {
  return {
    earthMaterialMine: 0,
    earthSolarFactory: 0,
    earthRobotFactory: 0,
    earthGpuFactory: 0,
    earthRocketFactory: 0,
    earthGpuSatelliteFactory: 0,
    moonMaterialMine: 0,
    moonSolarFactory: 0,
    moonRobotFactory: 0,
    moonGpuFactory: 0,
    moonGpuSatelliteFactory: 0,
    moonMassDriver: 0,
    mercuryMaterialMine: 0,
    mercuryRobotFactory: 0,
    mercuryDysonSwarmFacility: 0,
  };
}

function createInitialLogisticsMap(): Record<string, bigint> {
  return {
    'earthOrbit:gpuSatellites': 0n,
    'earthMoon:gpus': 0n,
    'earthMoon:solarPanels': 0n,
    'earthMoon:robots': 0n,
    'moonOrbit:gpuSatellites': 0n,
    'moonMercury:robots': 0n,
    'mercurySun:gpuSatellites': 0n,
  };
}

function createInitialLogisticsAutoQueueMap(): Record<string, boolean> {
  return {
    'earthOrbit:gpuSatellites': false,
    'earthMoon:gpus': false,
    'earthMoon:solarPanels': false,
    'earthMoon:robots': false,
    'moonOrbit:gpuSatellites': false,
    'moonMercury:robots': false,
    // Preserve existing behavior where Mercury-produced satellites auto-flow to the Sun route.
    'mercurySun:gpuSatellites': true,
  };
}

function createInitialPausedFacilities(): Record<FacilityId, boolean> {
  return {
    earthMaterialMine: false,
    earthSolarFactory: false,
    earthRobotFactory: false,
    earthGpuFactory: false,
    earthRocketFactory: false,
    earthGpuSatelliteFactory: false,
    moonMaterialMine: false,
    moonSolarFactory: false,
    moonRobotFactory: false,
    moonGpuFactory: false,
    moonGpuSatelliteFactory: false,
    moonMassDriver: false,
    mercuryMaterialMine: false,
    mercuryRobotFactory: false,
    mercuryDysonSwarmFacility: false,
  };
}

export function createInitialState(): GameState {
  const locationResources: Record<LocationId, LocationResourceState> = {
    earth: createEmptyLocationResources(),
    moon: createEmptyLocationResources(),
    mercury: createEmptyLocationResources(),
  };

  const locationProductionPerMin: Record<LocationId, LocationRateState> = {
    earth: createEmptyLocationRates(),
    moon: createEmptyLocationRates(),
    mercury: createEmptyLocationRates(),
  };

  const locationConsumptionPerMin: Record<LocationId, LocationRateState> = {
    earth: createEmptyLocationRates(),
    moon: createEmptyLocationRates(),
    mercury: createEmptyLocationRates(),
  };

  const locationFacilities: Record<LocationId, LocationFacilityState> = {
    earth: createEmptyLocationFacilities(),
    moon: createEmptyLocationFacilities(),
    mercury: createEmptyLocationFacilities(),
  };

  const locationFacilityRates: Record<LocationId, LocationFacilityRateState> = {
    earth: createEmptyFacilityRates(),
    moon: createEmptyFacilityRates(),
    mercury: createEmptyFacilityRates(),
  };

  return {
    funds: toBigInt(BALANCE.startingFunds),
    totalEarned: 0n,

    resourceBreakdown: {
      funds: { income: [], expense: [] },
      code: { income: [], expense: [] },
      science: { income: [], expense: [] },
      labor: { income: [], expense: [] },
      compute: [],
    },

    tickCount: 0,
    time: 0,

    humanPools: initializeHumanPools(),

    subscriptionTier: 'basic',

    cpuCoresTotal: toBigInt(BALANCE.startingCpuCores),
    micMiniCount: 0n,

    // GPU & Compute
    gpuMarketPrice: getGpuTargetPrice(locationResources.earth.gpus),
    installedGpuCount: 0n,
    totalPflops: 0n,
    earthPflops: 0n,
    moonPflops: 0n,
    mercuryPflops: 0n,
    orbitalPflops: 0n,
    currentModelIndex: 0,
    freeCompute: 0n,
    isPostGpuTransition: false,

    // Datacenters
    datacenters: [0n, 0n, 0n, 0n],
    gpuCapacity: scaleBigInt(128n),
    needsDatacenter: false,

    // Labor
    laborPerMin: 0n,

    // Multi-location
    locationResources,
    locationProductionPerMin,
    locationConsumptionPerMin,
    locationFacilities,
    locationFacilityRates,
    pausedFacilities: createInitialPausedFacilities(),

    // Energy
    gridPowerKW: 0n,
    gasPlants: 0n,
    nuclearPlants: 0n,
    powerDemandMW: 0n,
    powerSupplyMW: 0n,
    powerThrottle: 1,

    // Training
    trainingData: 0n,
    trainingDataPurchases: 0,
    trainingAllocationPct: 0,
    trainingAllocatedPflops: 0n,
    currentFineTuneIndex: -1,
    fineTuneProgress: 0n,
    completedFineTunes: [],
    ariesModelIndex: -1,
    ariesProgress: 0n,

    // Code & Science
    code: 0n,
    codePerMin: 0n,
    science: 0n,
    sciencePerMin: 0n,

    // Research
    completedResearch: [],
    synthDataRate: 0n,
    algoEfficiencyBonus: 1,
    gpuFlopsBonus: 1,

    logisticsOrders: createInitialLogisticsMap(),
    logisticsSent: createInitialLogisticsMap(),
    logisticsInTransit: createInitialLogisticsMap(),
    logisticsAutoQueue: createInitialLogisticsAutoQueueMap(),
    transportBatches: [],
    earthLaunchCarry: 0,
    moonLaunchCarry: 0,
    mercuryLaunchCarry: 0,
    rocketLossPct: 1,

    // Space
    satellites: 0n,
    dysonSwarmSatellites: 0n,
    dysonSwarmPowerMW: 0n,
    mercuryMassMined: 0n,
    mercuryMassTotal: BALANCE.mercuryBaseMassTotal,

    spaceUnlocked: false,
    launchCostBonus: 1,

    // Energy — separate grids
    lunarPowerDemandMW: 0n,
    lunarPowerSupplyMW: 0n,
    lunarPowerThrottle: 1,
    mercuryPowerDemandMW: 0n,
    mercuryPowerSupplyMW: 0n,
    mercuryPowerThrottle: 1,
    orbitalPowerMW: 0n,
    totalEnergyMW: 0n,

    // API Services
    apiUnlocked: false,
    apiUserCount: 0n,
    apiPrice: BALANCE.apiStartingPrice,
    apiAutoPriceEnabled: false,
    computeAutoAllocationEnabled: false,
    apiDemand: 0n,
    apiAwareness: 0,
    apiReservedPflops: 0n,
    apiIncomePerMin: 0n,
    apiInferenceAllocationPct: 0,
    apiUserSynthRate: 0n,
    apiImprovementLevel: -1,
    apiQuality: 1,

    completedTasks: 0n,
    unlockedJobs: ['unassigned', 'sixxerBasic'],
    automatedJobs: [],

    managerCount: 0n,
    nudgeBuffer: 0n,

    incomePerMin: 0n,
    expensePerMin: 0n,
    humanSalaryPerMin: 0n,
    intelligence: BALANCE.tiers.basic.intel,
    agentEfficiency: 1,
    stuckCount: 0n,
    activeAgentCount: toBigInt(1),
    usedCores: toBigInt(1),

    gameWon: false,

    pendingFlavorTexts: [],
    shownFlavorTexts: [],
    openedTabs: {},
    tabAlerts: {},
    selectedTabId: null,

    // Agent pools (new structure)
    agentPools: initializeAgentPools(),
    totalAgents: toBigInt(1),
  };
}

function initializeJobPool(): JobPool {
  return {
    totalCount: 0n,
    stuckCount: 0n,
    idleCount: 0n,
    aggregateProgress: 0n,
    samples: {
      progress: [0, 0, 0, 0],
      stuck: [false, false, false, false],
    },
  };
}

function initializeAgentPools(): Record<JobType, JobPool> {
  const pools: Record<string, JobPool> = {};
  const allJobTypes = Object.keys(BALANCE.jobs) as JobType[];

  for (const jobType of allJobTypes) {
    pools[jobType] = initializeJobPool();
  }

  // Start with 1 agent in unassigned
  pools['unassigned'].totalCount = toBigInt(1);

  return pools as Record<JobType, JobPool>;
}

function initializeHumanPools(): Record<JobType, HumanPool> {
  const pools: Record<string, HumanPool> = {};
  const allJobTypes = Object.keys(BALANCE.jobs) as JobType[];

  for (const jobType of allJobTypes) {
    pools[jobType] = {
      totalCount: 0n,
      aggregateProgress: 0n,
      samples: {
        progress: [0, 0, 0, 0],
      },
    };
  }

  return pools as Record<JobType, HumanPool>;
}

export function getTotalAssignedAgents(state: GameState): bigint {
  return state.totalAgents - state.agentPools['unassigned'].totalCount;
}

// NOTE: DO NOT add migrations here. The game is in active development and breaking changes to saves are currently acceptable.

