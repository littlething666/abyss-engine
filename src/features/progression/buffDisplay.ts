import { Buff, BuffModifierType } from '../../types/progression';

export type BuffVisual = {
  modifierType: BuffModifierType;
  icon: string;
  name: string;
};

const BUFF_VISUALS: Record<BuffModifierType, BuffVisual> = {
  growth_speed: {
    modifierType: 'growth_speed',
    icon: '🚀',
    name: 'Growth Speed',
  },
  xp_multiplier: {
    modifierType: 'xp_multiplier',
    icon: '⚡',
    name: 'XP Multiplier',
  },
  clarity_boost: {
    modifierType: 'clarity_boost',
    icon: '💡',
    name: 'Clarity',
  },
  mana_boost: {
    modifierType: 'mana_boost',
    icon: '🪄',
    name: 'Mana',
  },
};

export const BUFF_VISUAL_ORDER: BuffModifierType[] = [
  'growth_speed',
  'xp_multiplier',
  'clarity_boost',
  'mana_boost',
];

export function getBuffVisual(modifierType: BuffModifierType): BuffVisual {
  return BUFF_VISUALS[modifierType];
}

export function getBuffIcon(modifierType: BuffModifierType): string {
  return getBuffVisual(modifierType).icon;
}

export function getBuffDisplayName(buffOrType: Buff | BuffModifierType): string {
  const modifierType = typeof buffOrType === 'string' ? buffOrType : buffOrType.modifierType;
  return getBuffVisual(modifierType).name;
}

export function getBuffSummary(buff: Buff): string {
  const name = getBuffDisplayName(buff);
  return `${buff.magnitude.toFixed(2)}x ${name}`;
}

export function getAllBuffVisuals(): BuffVisual[] {
  return BUFF_VISUAL_ORDER.map((modifierType) => BUFF_VISUALS[modifierType]);
}

