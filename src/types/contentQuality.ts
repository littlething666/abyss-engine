import type { Card, MiniGameType } from './core';

export type CognitiveMode =
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate'
  | 'create';

export type ForbiddenContentPattern =
  | 'trivia-only'
  | 'wording-only'
  | 'duplicate-concept'
  | 'unsupported-by-sources'
  | 'answer-not-in-options';

export type GeneratedCardValidationSeverity = 'warning' | 'critical';

export interface GeneratedCardValidationFailure {
  cardId: string | null;
  index: number;
  code: string;
  message: string;
  severity: GeneratedCardValidationSeverity;
}

export interface GeneratedCardQualityReport {
  emittedCount: number;
  validCount: number;
  invalidCount: number;
  invalidRatio: number;
  duplicateConceptCount: number;
  duplicateConceptRatio: number;
  groundingSourceCount: number;
  hasAuthoritativePrimarySource: boolean;
  failures: GeneratedCardValidationFailure[];
}

export interface ExistingConceptRegistry {
  conceptTargets: string[];
  miniGameItemLabels: string[];
  cardIds: string[];
}

export interface ValidatedGeneratedCard {
  card: Card;
  conceptTarget: string;
  miniGameType?: MiniGameType;
}
