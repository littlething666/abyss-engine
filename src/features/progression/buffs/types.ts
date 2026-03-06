import { BuffCondition, BuffModifierType, BuffStackingRule } from '../../types/progression';

export interface BuffDefinition {
  id: string;
  modifierType: BuffModifierType;
  baseMagnitude: number;
  condition: BuffCondition;
  maxUses?: number;
  durationMs?: number;
  categories: BuffCategory[];
  stacking: BuffStackingRule;
  icon: string;
  name: string;
  description: string;
}

export interface BuffInstance {
  buffId: string;
  modifierType: BuffModifierType;
  magnitude: number;
  condition: BuffCondition;
  source: string;
  issuedAt: number;
  instanceId: string;
  stacks: number;
  duration?: number;
  maxUses?: number;
  remainingUses?: number;
  expiresAt?: number;
  stacking: BuffStackingRule;
  icon: string;
  name: string;
  description: string;
}

export type BuffCategory = 'biological' | 'cognitive' | 'quest';
export type BuffConsumeEvent = 'card_reviewed' | 'session_ended';

export interface BuffContext {
  cardsReviewed?: number;
  sessionComplete?: boolean;
  now?: number;
}
