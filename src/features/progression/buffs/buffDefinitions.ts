import { BuffDefinition, BuffSection } from './types';

export const BUFF_CATALOG: Record<string, BuffDefinition> = {
  clarity_focus: {
    id: 'clarity_focus',
    modifierType: 'xp_multiplier',
    baseMagnitude: 1.15,
    condition: 'next_10_cards',
    maxUses: 10,
    durationMs: 30 * 60 * 1000,
    categories: ['biological', 'cognitive'],
    stacking: 'multiplicative',
    icon: '⚡',
    name: 'Clarity Focus',
    description: 'Sharp mind from optimized conditions.',
  },
  clarity_focus_high: {
    id: 'clarity_focus_high',
    modifierType: 'clarity_boost',
    baseMagnitude: 1.25,
    condition: 'session_end',
    durationMs: 30 * 60 * 1000,
    categories: ['quest'],
    stacking: 'multiplicative',
    icon: '💡',
    name: 'Clarity Focus High',
    description: 'Crystal intent sharpens session-level clarity.',
  },
  ritual_growth: {
    id: 'ritual_growth',
    modifierType: 'growth_speed',
    baseMagnitude: 1.15,
    condition: 'session_end',
    durationMs: 30 * 60 * 1000,
    categories: ['quest'],
    stacking: 'additive',
    icon: '🚀',
    name: 'Ritual Growth',
    description: 'Quest-complete ritual increases growth trajectory.',
  },
} as const;

export function getSectionBuffs(section: BuffSection): BuffDefinition[] {
  return Object.values(BUFF_CATALOG)
    .filter((definition) => definition.categories.includes(section));
}

export function getBuffDefinition(defId: string): BuffDefinition | undefined {
  return BUFF_CATALOG[defId];
}
