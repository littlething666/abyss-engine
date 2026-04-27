import type { GenerationStrategy } from '@/types/generationStrategy';
import type { LearningStyle, StudyChecklist } from '@/types/studyChecklist';
import { STUDY_CHECKLIST_DEFAULTS } from '@/types/studyChecklist';
import { buildContentBrief } from './buildContentBrief';
import { buildGraphBrief } from './buildGraphBrief';
import type { ContentDefaults } from './strategyDefaults';
import { STRATEGY_DEFAULTS } from './strategyDefaults';

function normalizeWeights(mix: ContentDefaults['cardMix']): ContentDefaults['cardMix'] {
  const sum = mix.flashcardWeight + mix.choiceWeight + mix.miniGameWeight;
  if (sum <= 0) {
    return { flashcardWeight: 1 / 3, choiceWeight: 1 / 3, miniGameWeight: 1 / 3 };
  }
  return {
    flashcardWeight: mix.flashcardWeight / sum,
    choiceWeight: mix.choiceWeight / sum,
    miniGameWeight: mix.miniGameWeight / sum,
  };
}

function normalizeModeWeights(
  mix: ContentDefaults['cognitiveModeMix'],
): ContentDefaults['cognitiveModeMix'] {
  const entries = Object.entries(mix).filter(([, value]) => typeof value === 'number' && value > 0);
  const sum = entries.reduce((acc, [, value]) => acc + value, 0);
  if (sum <= 0) {
    return { understand: 0.4, apply: 0.35, analyze: 0.25 };
  }
  return Object.fromEntries(entries.map(([mode, value]) => [mode, value / sum])) as ContentDefaults['cognitiveModeMix'];
}

function applyStyleToCardMix(
  style: LearningStyle,
  defaults: ContentDefaults['cardMix'],
): ContentDefaults['cardMix'] {
  if (style === 'balanced') {
    return { ...defaults };
  }
  if (style === 'theory-heavy') {
    return normalizeWeights({
      flashcardWeight: defaults.flashcardWeight + 0.08,
      choiceWeight: defaults.choiceWeight - 0.04,
      miniGameWeight: defaults.miniGameWeight - 0.04,
    });
  }
  return normalizeWeights({
    flashcardWeight: defaults.flashcardWeight - 0.06,
    choiceWeight: defaults.choiceWeight + 0.03,
    miniGameWeight: defaults.miniGameWeight + 0.03,
  });
}

export function resolveStrategy(checklist: StudyChecklist): GenerationStrategy {
  const goal = checklist.studyGoal ?? STUDY_CHECKLIST_DEFAULTS.studyGoal;
  const knowledge = checklist.priorKnowledge ?? STUDY_CHECKLIST_DEFAULTS.priorKnowledge;
  const style = checklist.learningStyle ?? STUDY_CHECKLIST_DEFAULTS.learningStyle;
  const defaults = STRATEGY_DEFAULTS[goal][knowledge];

  const contentBrief = buildContentBrief({ goal, knowledge, style, topicName: checklist.topicName });

  return {
    graph: {
      totalTiers: 3,
      topicsPerTier: 5,
      audienceBrief: buildGraphBrief({ goal, knowledge, style, topicName: checklist.topicName }),
      domainBrief: checklist.topicName,
      focusConstraints: checklist.focusAreas ?? '',
    },
    content: {
      theoryDepth: defaults.theoryDepth,
      cardMix: applyStyleToCardMix(style, defaults.cardMix),
      difficultyBias: defaults.difficultyBias,
      cognitiveModeMix: normalizeModeWeights(defaults.cognitiveModeMix),
      forbiddenPatterns: defaults.forbiddenPatterns,
      contentBrief,
    },
  };
}
