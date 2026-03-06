import { Buff, BuffModifierType } from '../../types/progression';
import { BUFF_CATALOG } from './buffs/buffDefinitions';
import { BuffEngine } from './buffs/buffEngine';

export type BuffVisual = {
  modifierType: BuffModifierType;
  icon: string;
  name: string;
};

const BUFF_VISUAL_ORDER: BuffModifierType[] = [
  'growth_speed',
  'xp_multiplier',
  'clarity_boost',
  'mana_boost',
];

const DEFAULT_VISUALS: Record<BuffModifierType, BuffVisual> = {
  growth_speed: { modifierType: 'growth_speed', icon: '🚀', name: 'Growth Speed' },
  xp_multiplier: { modifierType: 'xp_multiplier', icon: '⚡', name: 'XP Multiplier' },
  clarity_boost: { modifierType: 'clarity_boost', icon: '💡', name: 'Clarity' },
  mana_boost: { modifierType: 'mana_boost', icon: '🪄', name: 'Mana' },
};

export function getBuffVisual(modifierType: BuffModifierType): BuffVisual {
  const definition = Object.values(BUFF_CATALOG).find((entry) => entry.modifierType === modifierType);
  if (!definition) {
    return DEFAULT_VISUALS[modifierType];
  }
  return {
    modifierType,
    icon: definition.icon,
    name: definition.name,
  };
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

export function groupBuffsByType(buffs: readonly Buff[]): Buff[] {
  const grouped = new Map<BuffModifierType, Buff[]>();

  for (const buff of buffs) {
    const existing = grouped.get(buff.modifierType);
    if (!existing) {
      grouped.set(buff.modifierType, [buff]);
      continue;
    }
    existing.push(buff);
  }

  return BUFF_VISUAL_ORDER.map((modifierType) => {
    const groupedBuffs = grouped.get(modifierType);
    if (!groupedBuffs) {
      return null;
    }
    const totalMagnitude = BuffEngine.get().getDisplayModifierTotal(modifierType, groupedBuffs);
    return {
      ...groupedBuffs[0],
      magnitude: totalMagnitude,
    };
  }).filter((buff): buff is Buff => Boolean(buff));
}

export interface GroupedBuffSummary {
  modifierType: BuffModifierType;
  totalMagnitude: number;
  buffs: Buff[];
}

export function groupBuffsByTypeWithSources(buffs: readonly Buff[]): GroupedBuffSummary[] {
  const grouped = new Map<BuffModifierType, GroupedBuffSummary>();

  for (const buff of buffs) {
    const existing = grouped.get(buff.modifierType);
    if (!existing) {
      grouped.set(buff.modifierType, {
        modifierType: buff.modifierType,
        totalMagnitude: BuffEngine.get().getDisplayModifierTotal(buff.modifierType, [buff]),
        buffs: [buff],
      });
      continue;
    }
    existing.totalMagnitude = BuffEngine.get().getDisplayModifierTotal(
      buff.modifierType,
      [...existing.buffs, buff],
    );
    existing.buffs.push(buff);
  }

  return BUFF_VISUAL_ORDER
    .map((modifierType) => grouped.get(modifierType))
    .filter((buff): buff is GroupedBuffSummary => Boolean(buff));
}

export function getAllBuffVisuals(): BuffVisual[] {
  return BUFF_VISUAL_ORDER.map((modifierType) => getBuffVisual(modifierType));
}
