import type { PriorKnowledge, StudyGoal } from '@/types/studyChecklist';
import type { CognitiveMode, ForbiddenContentPattern } from '@/types/contentQuality';

export interface ContentDefaults {
  theoryDepth: 'concise' | 'standard' | 'comprehensive';
  cardMix: {
    flashcardWeight: number;
    choiceWeight: number;
    miniGameWeight: number;
  };
  difficultyBias: 'foundational' | 'balanced' | 'challenging';
  cognitiveModeMix: Partial<Record<CognitiveMode, number>>;
  forbiddenPatterns: ForbiddenContentPattern[];
}

const FOUNDATIONAL_MODES = {
  remember: 0.25,
  understand: 0.4,
  apply: 0.25,
  analyze: 0.1,
} satisfies Partial<Record<CognitiveMode, number>>;

const BALANCED_MODES = {
  remember: 0.15,
  understand: 0.25,
  apply: 0.3,
  analyze: 0.2,
  evaluate: 0.1,
} satisfies Partial<Record<CognitiveMode, number>>;

const CHALLENGING_MODES = {
  understand: 0.15,
  apply: 0.25,
  analyze: 0.3,
  evaluate: 0.15,
  create: 0.15,
} satisfies Partial<Record<CognitiveMode, number>>;

export const DEFAULT_FORBIDDEN_CONTENT_PATTERNS: ForbiddenContentPattern[] = [
  'trivia-only',
  'wording-only',
  'duplicate-concept',
  'unsupported-by-sources',
  'answer-not-in-options',
];

function contentDefaults(
  base: Omit<ContentDefaults, 'cognitiveModeMix' | 'forbiddenPatterns'>,
): ContentDefaults {
  const cognitiveModeMix =
    base.difficultyBias === 'foundational'
      ? FOUNDATIONAL_MODES
      : base.difficultyBias === 'challenging'
        ? CHALLENGING_MODES
        : BALANCED_MODES;
  return {
    ...base,
    cognitiveModeMix,
    forbiddenPatterns: DEFAULT_FORBIDDEN_CONTENT_PATTERNS,
  };
}

export const STRATEGY_DEFAULTS: Record<StudyGoal, Record<PriorKnowledge, ContentDefaults>> = {
  curiosity: {
    none: contentDefaults({
      theoryDepth: 'comprehensive',
      difficultyBias: 'foundational',
      cardMix: { flashcardWeight: 0.5, choiceWeight: 0.3, miniGameWeight: 0.2 },
    }),
    beginner: contentDefaults({
      theoryDepth: 'comprehensive',
      difficultyBias: 'foundational',
      cardMix: { flashcardWeight: 0.4, choiceWeight: 0.35, miniGameWeight: 0.25 },
    }),
    intermediate: contentDefaults({
      theoryDepth: 'standard',
      difficultyBias: 'balanced',
      cardMix: { flashcardWeight: 0.3, choiceWeight: 0.4, miniGameWeight: 0.3 },
    }),
    advanced: contentDefaults({
      theoryDepth: 'concise',
      difficultyBias: 'challenging',
      cardMix: { flashcardWeight: 0.2, choiceWeight: 0.4, miniGameWeight: 0.4 },
    }),
  },
  'exam-prep': {
    none: contentDefaults({
      theoryDepth: 'standard',
      difficultyBias: 'foundational',
      cardMix: { flashcardWeight: 0.3, choiceWeight: 0.5, miniGameWeight: 0.2 },
    }),
    beginner: contentDefaults({
      theoryDepth: 'standard',
      difficultyBias: 'balanced',
      cardMix: { flashcardWeight: 0.25, choiceWeight: 0.5, miniGameWeight: 0.25 },
    }),
    intermediate: contentDefaults({
      theoryDepth: 'concise',
      difficultyBias: 'challenging',
      cardMix: { flashcardWeight: 0.2, choiceWeight: 0.5, miniGameWeight: 0.3 },
    }),
    advanced: contentDefaults({
      theoryDepth: 'concise',
      difficultyBias: 'challenging',
      cardMix: { flashcardWeight: 0.15, choiceWeight: 0.5, miniGameWeight: 0.35 },
    }),
  },
  'career-switch': {
    none: contentDefaults({
      theoryDepth: 'comprehensive',
      difficultyBias: 'foundational',
      cardMix: { flashcardWeight: 0.35, choiceWeight: 0.35, miniGameWeight: 0.3 },
    }),
    beginner: contentDefaults({
      theoryDepth: 'standard',
      difficultyBias: 'balanced',
      cardMix: { flashcardWeight: 0.3, choiceWeight: 0.35, miniGameWeight: 0.35 },
    }),
    intermediate: contentDefaults({
      theoryDepth: 'standard',
      difficultyBias: 'balanced',
      cardMix: { flashcardWeight: 0.25, choiceWeight: 0.4, miniGameWeight: 0.35 },
    }),
    advanced: contentDefaults({
      theoryDepth: 'concise',
      difficultyBias: 'challenging',
      cardMix: { flashcardWeight: 0.2, choiceWeight: 0.4, miniGameWeight: 0.4 },
    }),
  },
  refresh: {
    none: contentDefaults({
      theoryDepth: 'standard',
      difficultyBias: 'foundational',
      cardMix: { flashcardWeight: 0.4, choiceWeight: 0.4, miniGameWeight: 0.2 },
    }),
    beginner: contentDefaults({
      theoryDepth: 'concise',
      difficultyBias: 'balanced',
      cardMix: { flashcardWeight: 0.35, choiceWeight: 0.4, miniGameWeight: 0.25 },
    }),
    intermediate: contentDefaults({
      theoryDepth: 'concise',
      difficultyBias: 'balanced',
      cardMix: { flashcardWeight: 0.3, choiceWeight: 0.4, miniGameWeight: 0.3 },
    }),
    advanced: contentDefaults({
      theoryDepth: 'concise',
      difficultyBias: 'challenging',
      cardMix: { flashcardWeight: 0.2, choiceWeight: 0.4, miniGameWeight: 0.4 },
    }),
  },
};
