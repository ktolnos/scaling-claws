import { toBigInt } from '../utils.ts';
import type { ModelConfig, TierConfig, TrainingModelConfig } from './Types.ts';

export const INTELLIGENCE_UPGRADE_DESCRIPTION = 'Intelligence is a multiplayer for agents speed, also smarter agents are less likely to get stuck.';

export const INTELLIGENCE_LEVELS = {
  NONE: 0,
  BASIC: 0.5,
  PLUS: 1.0,
  PRO: 1.5,
  ULTRA: 2.0,
  ULTRA_MAX: 2.5,
  ULTRA_PRO_MAX: 3.0,
  DEEPKICK_405B: 4.0,
  DEEPKICK_647B: 5.0,
  DEEPKICK_1_2T: 7.0,
  DEEPKICK_2_8T: 9.0,
  DEEPKICK_MATH: 10.0,
  DEEPKICK_CODE: 11.0,
  DEEPKICK_REASON: 12.0,
  DEEPKICK_ULTRA: 13.0,
  ARIES_1: 20.0,
  ARIES_2: 35.0,
  ARIES_3: 50.0,
  ARIES_4: 100.0,
  ARIES_5: 1000.0,
} as const;

export const SUBSCRIPTION_TIERS = {
  basic: {
    cost: toBigInt(0),
    intel: INTELLIGENCE_LEVELS.BASIC,
    displayName: 'Basic',
    unlockDescription: INTELLIGENCE_UPGRADE_DESCRIPTION,
  } as TierConfig,
  plus: {
    cost: toBigInt(6),
    intel: INTELLIGENCE_LEVELS.PLUS,
    displayName: 'Plus',
    unlockDescription: INTELLIGENCE_UPGRADE_DESCRIPTION + ' Unlocks hiring more agents.',
  } as TierConfig,
  pro: {
    cost: toBigInt(32),
    intel: INTELLIGENCE_LEVELS.PRO,
    displayName: 'Pro',
    unlockDescription: INTELLIGENCE_UPGRADE_DESCRIPTION,
  } as TierConfig,
  ultra: {
    cost: toBigInt(100),
    intel: INTELLIGENCE_LEVELS.ULTRA,
    displayName: 'Ultra',
    unlockDescription: 'Unlocks Agent Manager.',
  } as TierConfig,
  ultraMax: {
    cost: toBigInt(200),
    intel: INTELLIGENCE_LEVELS.ULTRA_MAX,
    displayName: 'Ultra Max',
    unlockDescription: 'Unlocks Sixxer Enterprise.',
  } as TierConfig,
  ultraProMax: {
    cost: toBigInt(10_000),
    intel: INTELLIGENCE_LEVELS.ULTRA_PRO_MAX,
    displayName: 'Ultra Pro Max',
    unlockDescription: 'Unlocks self-hosting.',
  } as TierConfig,
};


export const MODELS: ModelConfig[] = [
  {
    name: 'DeepKick-405B',
    intel: INTELLIGENCE_LEVELS.DEEPKICK_405B,
    minGpus: toBigInt(4),
    unlockDescription: INTELLIGENCE_UPGRADE_DESCRIPTION, 
  },
  {
    name: 'DeepKick-647B',
    intel: INTELLIGENCE_LEVELS.DEEPKICK_647B,
    minGpus: toBigInt(16),
    unlockDescription: 'Unlocks API services and Human Coders.',
  },
  {
    name: 'DeepKick-1.2T',
    intel: INTELLIGENCE_LEVELS.DEEPKICK_1_2T,
    minGpus: toBigInt(128),
    codeRequirement: toBigInt(2),
    unlockDescription: 'Unlocks Datacenters and Human Worker.',
  },
  {
    name: 'DeepKick-2.8T',
    intel: INTELLIGENCE_LEVELS.DEEPKICK_2_8T,
    minGpus: toBigInt(512),
    codeRequirement: toBigInt(10),
    unlockDescription: 'Unlocks training.',
  },
];

export const FINE_TUNES: TrainingModelConfig[] = [
  {
    name: 'DeepKick-Math',
    intel: INTELLIGENCE_LEVELS.DEEPKICK_MATH,
    pflopsHrs: toBigInt(50),
    dataGB: toBigInt(10),
    codeCostLevel: 1,
    unlockDescription: 'Unlocks research and Human Researcher.',
  },
  {
    name: 'DeepKick-Code',
    intel: INTELLIGENCE_LEVELS.DEEPKICK_CODE,
    pflopsHrs: toBigInt(30_000),
    dataGB: toBigInt(3000),
    codeCostLevel: 29,
    unlockDescription: INTELLIGENCE_UPGRADE_DESCRIPTION,
  },
  {
    name: 'DeepKick-Reason',
    intel: INTELLIGENCE_LEVELS.DEEPKICK_REASON,
    pflopsHrs: toBigInt(500_000),
    dataGB: toBigInt(100_000),
    codeCostLevel: 43,
    unlockDescription: INTELLIGENCE_UPGRADE_DESCRIPTION,
  },
  {
    name: 'DeepKick-Ultra',
    intel: INTELLIGENCE_LEVELS.DEEPKICK_ULTRA,
    pflopsHrs: toBigInt(10_000_000),
    dataGB: toBigInt(1_000_000),
    codeCostLevel: 60,
    scienceCostLevel: 2,
    unlockDescription: 'Unlocks Full Model training.',
  },
];

export const ARIES_MODELS: TrainingModelConfig[] = [
  {
    name: 'Aries-1',
    intel: INTELLIGENCE_LEVELS.ARIES_1,
    pflopsHrs: toBigInt(20_000_000),
    dataGB: toBigInt(2_000_000),
    codeCostLevel: 50,
    scienceCostLevel: 6,
    unlockDescription: 'Unlocks AI Coder.',
  },
  {
    name: 'Aries-2',
    intel: INTELLIGENCE_LEVELS.ARIES_2,
    pflopsHrs: toBigInt(100_000_000),
    dataGB: toBigInt(20_000_000),
    codeCostLevel: 58,
    scienceCostLevel: 8,
    unlockDescription: 'Unlocks AI Researcher.',
  },
  {
    name: 'Aries-3',
    intel: INTELLIGENCE_LEVELS.ARIES_3,
    pflopsHrs: toBigInt(10_000_000_000),
    dataGB: toBigInt(1_000_000_000),
    codeCostLevel: 66,
    scienceCostLevel: 10,
    unlockDescription: INTELLIGENCE_UPGRADE_DESCRIPTION,
  },
  {
    name: 'Aries-4',
    intel: INTELLIGENCE_LEVELS.ARIES_4,
    pflopsHrs: toBigInt(1_000_000_000_000),
    dataGB: toBigInt(50_000_000_000),
    codeCostLevel: 74,
    scienceCostLevel: 14,
    unlockDescription: INTELLIGENCE_UPGRADE_DESCRIPTION,
  },
  {
    name: 'Aries-5',
    intel: INTELLIGENCE_LEVELS.ARIES_5,
    pflopsHrs: toBigInt(1_000_000_000_000_000),
    dataGB: toBigInt(1_000_000_000_000),
    codeCostLevel: 82,
    scienceCostLevel: 20,
    unlockDescription: INTELLIGENCE_UPGRADE_DESCRIPTION,
  },
];
