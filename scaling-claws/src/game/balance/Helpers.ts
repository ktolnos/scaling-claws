import { BALANCE } from './Config.ts';
import { RESEARCH_PRICE_EXPONENT_BY_RESOURCE } from './ResearchConfigs.ts';
import { ResearchIds, TIER_ORDER } from './Types.ts';
import type {
  FacilityProductionId,
  HumanJobType,
  JobType,
  ModelConfig,
  ResearchConfig,
  ResearchCostResource,
  ResearchId,
  ResearchLevelState,
  SolarOutputEnvironment,
  SubscriptionTier,
  TrainingModelConfig,
  TrainingResourceRequirement,
} from './Types.ts';
import { divB, fromBigInt, mulB, scaleB, scaleBigInt, toBigInt } from '../utils.ts';

export function getStuckRate(intel: number): number {
  return 1 / (intel + 1);
}

export function getHumanWorkforceCapacity(): bigint {
  return scaleBigInt(BigInt(Math.floor(BALANCE.humanPopulation.totalPeople * BALANCE.humanPopulation.workforceShare)));
}

export function getHumanWorkforceRemaining(totalHumanWorkers: bigint): bigint {
  return getHumanWorkforceCapacity() - totalHumanWorkers;
}

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

export function getApiDemand(
  awareness: number,
  intelligence: number,
  price: number,
): number {
  const API_BASE_AWARENESS = 200_000;
  const API_BASELINE_AWARENESS_DEMAND = Math.pow(API_BASE_AWARENESS, 0.9);
  const INTELLIGENCE_ELASTICITY = 3.0;
  const API_PRICE_ELASTICITY = 3.0;
  const API_DEMAND_SCALE = 3000;

  const awarenessMultiplier = getApiAwarenessDemandMultiplier(awareness);
  const safeIntelligence = Math.max(0.01, intelligence);
  const safePrice = Math.max(0.1, price);
  const unconstrainedDemand = (
    awarenessMultiplier *
    API_BASELINE_AWARENESS_DEMAND *
    (Math.pow(safeIntelligence, INTELLIGENCE_ELASTICITY) /
      Math.pow(safePrice, API_PRICE_ELASTICITY)) *
    API_DEMAND_SCALE
  );
  if (unconstrainedDemand <= 0) return 0;

  const cap = BALANCE.apiDemandCapUsers;
  const saturatedDemand = (unconstrainedDemand * cap) / (unconstrainedDemand + cap);
  return Math.max(0, Math.min(cap, saturatedDemand));
}

export function getApiAwarenessDemandMultiplier(awareness: number): number {
  const API_BASE_AWARENESS = 200_000;
  return Math.max(0, (API_BASE_AWARENESS + awareness) / API_BASE_AWARENESS);
}

export function getApiAdPurchaseCount(apiAwareness: number): number {
  return Math.max(0, Math.floor(apiAwareness / BALANCE.apiAdAwarenessBoost));
}

export function getApiAdCurrentCost(apiAwareness: number): bigint {
  const purchaseCount = getApiAdPurchaseCount(apiAwareness);
  const growth = Math.pow(BALANCE.apiAdCostExponent, purchaseCount);
  const safeGrowth = Number.isFinite(growth) ? growth : Number.MAX_SAFE_INTEGER;
  return scaleB(BALANCE.apiAdCost, safeGrowth);
}

export function getApiImprovePurchaseCount(apiImprovementLevel: number): number {
  return Math.max(0, apiImprovementLevel + 1);
}

export function getApiImproveCurrentCost(apiImprovementLevel: number): bigint {
  const purchaseCount = getApiImprovePurchaseCount(apiImprovementLevel);
  const growth = Math.pow(BALANCE.apiImproveCostExponent, purchaseCount);
  const safeGrowth = Number.isFinite(growth) ? growth : Number.MAX_SAFE_INTEGER;
  return scaleB(BALANCE.apiImproveCodeCost, safeGrowth);
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

export function getApiOptimalPrice(
  awareness: number,
  intelligence: number,
  capacityUsers: number,
): number {
  const safeCapacity = Math.max(0, capacityUsers);
  if (safeCapacity <= 0) return 1;

  const minPrice = 1;
  const maxSearchPrice = 1_000_000;

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

export function getApiPflopsPerUser(apiEfficiency: number): number {
  return BALANCE.apiPflopsPerUser / apiEfficiency;
}

export function getAgentsRequiredAllocationPct(
  totalPflops: bigint,
  assignedAgents: bigint,
  agentsPerGpu: bigint,
): number {
  if (assignedAgents <= 0n) return 0;
  if (totalPflops <= 0n) return 100;
  const pflopsPerAgent = divB(toBigInt(BALANCE.pflopsPerGpu), agentsPerGpu);
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

export function getGpuSatelliteGpuEquivalentPerUnit(): bigint {
  return BALANCE.gpuSatelliteFactoryGpuReq / getGpuSatelliteOutputDivisor();
}

export function getGpuSatellitePflopsPerUnit(): bigint {
  return scaleB(getGpuSatelliteGpuEquivalentPerUnit(), BALANCE.pflopsPerGpu);
}

export function getGpuSatellitePowerMWPerUnit(): number {
  return fromBigInt(getGpuSatelliteGpuEquivalentPerUnit()) * BALANCE.gpuPowerMW;
}

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

export function getGpuTargetPrice(gpuCount: bigint): bigint {
  void gpuCount;
  return BALANCE.gpuFixedPrice;
}

export function getNextTier(current: SubscriptionTier): SubscriptionTier | null {
  const idx = TIER_ORDER.indexOf(current);
  if (idx > 0) return TIER_ORDER[idx - 1];
  return null;
}

export function getBestModel(gpuCount: bigint): ModelConfig {
  let best = BALANCE.models[0];
  for (const model of BALANCE.models) {
    if (gpuCount >= model.minGpus) best = model;
  }
  return best;
}

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

export function getResearchConfig(id: ResearchId): ResearchConfig | undefined {
  return RESEARCH_BY_ID[id];
}

export function getLevelScaledCost(
  baseCost: bigint,
  resource: ResearchCostResource,
  level: number,
  minLevel: number = 1,
): bigint {
  if (level < minLevel) return 0n;
  const exponent = Math.max(0, level - minLevel);
  const growth = Math.pow(RESEARCH_PRICE_EXPONENT_BY_RESOURCE[resource], exponent);
  const safeGrowth = Number.isFinite(growth) ? growth : Number.MAX_SAFE_INTEGER;
  return scaleB(baseCost, safeGrowth);
}

export function getResearchMaxLevel(config: ResearchConfig): number {
  if (config.isInfinite) return Number.POSITIVE_INFINITY;
  return config.minLevel + Math.max(0, (config.totalLevels ?? 1) - 1);
}

export function getResearchCurrentLevel(researchLevels: ResearchLevelState | undefined, id: ResearchId): number {
  const config = getResearchConfig(id);
  if (!config) return 0;
  return researchLevels?.[id] ?? (config.minLevel - 1);
}

export function getResearchPurchasedLevelCount(researchLevels: ResearchLevelState | undefined, id: ResearchId): number {
  const config = getResearchConfig(id);
  if (!config) return 0;
  const currentLevel = getResearchCurrentLevel(researchLevels, id);
  return Math.max(0, currentLevel - config.minLevel + 1);
}

export function hasCompletedResearch(researchLevels: ResearchLevelState | undefined, id: ResearchId): boolean {
  return getResearchPurchasedLevelCount(researchLevels, id) > 0;
}

export function getCompletedResearchIds(researchLevels: ResearchLevelState | undefined): ResearchId[] {
  return BALANCE.research
    .filter((research) => hasCompletedResearch(researchLevels, research.id))
    .map((research) => research.id);
}

export function getCompletedResearchCount(researchLevels: ResearchLevelState | undefined): number {
  return getCompletedResearchIds(researchLevels).length;
}

export function getTrainingModelResourceRequirements(model: TrainingModelConfig): TrainingResourceRequirement[] {
  const requirements: TrainingResourceRequirement[] = [];
  if ((model.codeCostLevel ?? 0) > 0) {
    const level = model.codeCostLevel!;
    requirements.push({
      resource: 'code',
      level,
      cost: getLevelScaledCost(BALANCE.trainingResourceBaseCostByResource.code, 'code', level),
    });
  }
  if ((model.scienceCostLevel ?? 0) > 0) {
    const level = model.scienceCostLevel!;
    requirements.push({
      resource: 'science',
      level,
      cost: getLevelScaledCost(BALANCE.trainingResourceBaseCostByResource.science, 'science', level),
    });
  }
  return requirements;
}

function getMatchingResearchNumberMultiplier(
  researchLevels: ResearchLevelState | undefined,
  matches: (research: ResearchConfig) => boolean,
): number {
  let multiplier = 1;
  for (const research of BALANCE.research) {
    const purchasedLevels = getResearchPurchasedLevelCount(researchLevels, research.id);
    if (purchasedLevels <= 0 || !matches(research)) continue;
    multiplier *= Math.pow(research.quantityMultiplierPerLevel, purchasedLevels);
  }
  return multiplier;
}

function getMatchingResearchBigIntMultiplier(
  researchLevels: ResearchLevelState | undefined,
  matches: (research: ResearchConfig) => boolean,
): bigint {
  let multiplier = 1n;
  for (const research of BALANCE.research) {
    const purchasedLevels = getResearchPurchasedLevelCount(researchLevels, research.id);
    if (purchasedLevels <= 0 || !matches(research)) continue;
    const perLevelMultiplier = getWholeNumberResearchMultiplier(research);
    multiplier *= perLevelMultiplier ** BigInt(purchasedLevels);
  }
  return multiplier;
}

function getWholeNumberResearchMultiplier(research: ResearchConfig): bigint {
  if (!Number.isInteger(research.quantityMultiplierPerLevel)) {
    throw new Error(`Research ${research.id} requires an integer quantity multiplier`);
  }
  return BigInt(research.quantityMultiplierPerLevel);
}

export function getJobProductionMultiplier(researchLevels: ResearchLevelState | undefined, jobType: JobType): number {
  return getMatchingResearchNumberMultiplier(
    researchLevels,
    (research) => research.effect?.type === 'jobProduction' && research.effect.jobs.includes(jobType),
  );
}

export function getFacilityProductionMultiplier(
  researchLevels: ResearchLevelState | undefined,
  facilityId: FacilityProductionId,
): number {
  return getMatchingResearchNumberMultiplier(
    researchLevels,
    (research) => research.effect?.type === 'facilityProduction' && research.effect.facilities.includes(facilityId),
  );
}

export function getAlgoEfficiencyResearchMultiplier(researchLevels: ResearchLevelState | undefined): number {
  return getMatchingResearchNumberMultiplier(
    researchLevels,
    (research) => research.effect?.type === 'algoEfficiency',
  );
}

export function getApiUserSynthRateFromResearch(researchLevels: ResearchLevelState | undefined): bigint {
  const baseRate = BALANCE.apiUserSynthBase;
  return baseRate * getMatchingResearchBigIntMultiplier(
    researchLevels,
    (research) => research.effect?.type === 'apiUserSynthRate',
  );
}

export function isApiAutoPricingUnlocked(researchLevels: ResearchLevelState | undefined): boolean {
  return hasCompletedResearch(researchLevels, ResearchIds.apiAutoPricing);
}

export function isComputeAutoAllocationUnlocked(researchLevels: ResearchLevelState | undefined): boolean {
  return hasCompletedResearch(researchLevels, ResearchIds.computeAutoAllocation);
}

export function getGpuFlopsResearchMultiplier(researchLevels: ResearchLevelState | undefined): number {
  return getMatchingResearchNumberMultiplier(
    researchLevels,
    (research) => research.effect?.type === 'gpuFlops',
  );
}

export function getAgentsPerGpuResearchMultiplier(researchLevels: ResearchLevelState | undefined): bigint {
  return getMatchingResearchBigIntMultiplier(
    researchLevels,
    (research) => research.effect?.type === 'agentsPerGpu',
  );
}

export function getRocketLossPctFromResearch(researchLevels: ResearchLevelState | undefined): number {
  return getMatchingResearchNumberMultiplier(
    researchLevels,
    (research) => research.effect?.type === 'rocketLoss',
  );
}

export function getSolarPanelEnvironmentMultiplier(environment: SolarOutputEnvironment): number {
  if (environment === 'moon') return BALANCE.solarOutputMultiplierMoon;
  if (environment === 'mercury') return BALANCE.solarOutputMultiplierMercury;
  if (environment === 'spaceSso') return BALANCE.solarOutputMultiplierSpaceSso;
  return BALANCE.solarOutputMultiplierEarth;
}

export function getSolarPanelPowerMW(environment: SolarOutputEnvironment, _researchLevels: ResearchLevelState | undefined): number {
  return BALANCE.solarPanelMW * getSolarPanelEnvironmentMultiplier(environment);
}
