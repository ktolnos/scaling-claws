import type { ResourceType } from '../game/BalanceConfig.ts';
import type { LocationId, SupplyResourceId } from '../game/GameState.ts';
import { formatMoney } from '../game/utils.ts';

export const UI_EMOJI = {
  funds: '$',
  intel: '🧠',
  efficiency: '',
  flops: '🧮',
  code: '💻',
  science: '🔬',
  labor: '💪',
  energy: '⚡',
  material: '⛏',
  solarPanels: '🪟',
  robots: '🤖',
  gpus: '🧇',
  rockets: '🚀',
  gpuSatellites: '🛰️',
  data: '🗂️',
  users: '👥',
  supply: '📤',
  demand: '📥',
  earth: '🌍',
  moon: '🌕',
  mercury: '🌑',
  orbit: '💫',
  route: '➜',
  money: '$',
  nudge: '🫸',
} as const;

export type UiEmojiKey = keyof typeof UI_EMOJI;

export type ResourceLabelKey =
  | ResourceType
  | SupplyResourceId
  | 'energy'
  | 'intel'
  | 'efficiency'
  | 'flops'
  | 'data'
  | 'users'
  | 'money'
  | 'supply'
  | 'demand';

const RESOURCE_EMOJI_KEY: Record<ResourceLabelKey, UiEmojiKey> = {
  funds: 'funds',
  code: 'code',
  science: 'science',
  labor: 'labor',
  nudge: 'nudge',
  material: 'material',
  solarPanels: 'solarPanels',
  robots: 'robots',
  gpus: 'gpus',
  rockets: 'rockets',
  gpuSatellites: 'gpuSatellites',
  energy: 'energy',
  intel: 'intel',
  efficiency: 'efficiency',
  flops: 'flops',
  data: 'data',
  users: 'users',
  money: 'money',
  supply: 'supply',
  demand: 'demand',
};

const RESOURCE_LABELS: Record<ResourceLabelKey, string> = {
  funds: 'Funds',
  code: 'Code',
  science: 'Science',
  labor: 'Labor',
  nudge: 'Nudge',
  material: 'Material',
  solarPanels: 'Solar Panels',
  robots: 'Robots',
  gpus: 'GPUs',
  rockets: 'Rockets',
  gpuSatellites: 'GPU Satellites',
  energy: 'Energy',
  intel: 'Intel',
  efficiency: 'Efficiency',
  flops: 'FLOPS',
  data: 'Data',
  users: 'Users',
  money: 'Money',
  supply: 'Supply',
  demand: 'Demand',
};

const LOCATION_EMOJI_KEY: Record<LocationId | 'orbit', UiEmojiKey> = {
  earth: 'earth',
  moon: 'moon',
  mercury: 'mercury',
  orbit: 'orbit',
};

const LOCATION_LABELS: Record<LocationId | 'orbit', string> = {
  earth: 'Earth',
  moon: 'Moon',
  mercury: 'Mercury',
  orbit: 'Orbit',
};

export function emojiHtml(key: UiEmojiKey): string {
  return `<span class="emoji-token">${UI_EMOJI[key]}</span>`;
}

export function labelWithEmojiHtml(key: UiEmojiKey, label: string): string {
  return `${emojiHtml(key)} ${label}`;
}

export function resourceLabelHtml(resource: ResourceLabelKey, overrideLabel?: string): string {
  if (resource === 'efficiency') {
    return overrideLabel ?? RESOURCE_LABELS[resource];
  }
  return labelWithEmojiHtml(RESOURCE_EMOJI_KEY[resource], overrideLabel ?? RESOURCE_LABELS[resource]);
}

export function locationLabelHtml(location: LocationId | 'orbit', overrideLabel?: string): string {
  return labelWithEmojiHtml(LOCATION_EMOJI_KEY[location], overrideLabel ?? LOCATION_LABELS[location]);
}

export function moneyWithEmojiHtml(amount: number | bigint, key: 'money' | 'funds' = 'money'): string {
  const money = formatMoney(amount);
  if (money.startsWith('-$')) {
    return `-${emojiHtml(key)}${money.slice(2)}`;
  }
  if (money.startsWith('$')) {
    return `${emojiHtml(key)}${money.slice(1)}`;
  }
  return `${emojiHtml(key)}${money}`;
}
