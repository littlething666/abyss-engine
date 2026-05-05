import {
  buildCrystalTrialSnapshot,
  buildSubjectGraphTopicsSnapshot,
  buildTopicExpansionSnapshot,
  buildTopicMiniGameCardsSnapshot,
  buildTopicStudyCardsSnapshot,
  buildTopicTheorySnapshot,
  contentHash,
  crystalTrialSchemaVersion,
  subjectGraphTopicsSchemaVersion,
  topicExpansionCardsSchemaVersion,
  topicMiniGameCategorySortSchemaVersion,
  topicMiniGameMatchPairsSchemaVersion,
  topicMiniGameSequenceBuildSchemaVersion,
  topicStudyCardsSchemaVersion,
  topicTheorySchemaVersion,
} from '@/features/generationContracts';
import { MAX_CARD_DIFFICULTY, TRIAL_QUESTION_COUNT } from '@/features/crystalTrial/crystalTrialConfig';
import { useCrystalTrialStore } from '@/features/crystalTrial/crystalTrialStore';
import { resolveStrategy } from '@/features/subjectGeneration';
import type { MiniGameType } from '@/types/core';
import type { TopicPipelineRetryContext } from '@/types/contentGeneration';
import type { IDeckRepository, RunInput } from '@/types/repository';
import type { StudyChecklist } from '@/types/studyChecklist';

import { buildExistingConceptRegistry } from './quality/buildExistingConceptRegistry';
import { loadTheoryPayloadFromTopicDetails } from './pipelines/loadTheoryPayloadFromTopicDetails';

const PROMPT_TEMPLATE_VERSION = 'v1';

function miniGameSchemaVersion(kind: MiniGameType): number {
  switch (kind) {
    case 'CATEGORY_SORT':
      return topicMiniGameCategorySortSchemaVersion;
    case 'SEQUENCE_BUILD':
      return topicMiniGameSequenceBuildSchemaVersion;
    case 'MATCH_PAIRS':
      return topicMiniGameMatchPairsSchemaVersion;
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

export type TopicContentGenerationRequest = {
  subjectId: string;
  topicId: string;
  enableReasoning: boolean;
  forceRegenerate: boolean;
  stage?: 'theory' | 'study-cards' | 'mini-games' | 'full';
  retryContext?: TopicPipelineRetryContext;
  resumeFromStage?: 'theory' | 'study-cards' | 'mini-games' | 'full';
  miniGameKindsOverride?: MiniGameType[];
};

export async function prepareTopicContentRunInput(
  deck: IDeckRepository,
  modelId: string,
  capturedAt: string,
  req: TopicContentGenerationRequest,
): Promise<Extract<RunInput, { pipelineKind: 'topic-content' }>> {
  const stage = req.stage ?? 'full';
  const graph = await deck.getSubjectGraph(req.subjectId);
  const node = graph.nodes.find((n) => n.topicId === req.topicId);
  if (!node) {
    throw new Error(`Topic "${req.topicId}" not found in subject graph`);
  }

  const manifest = await deck.getManifest({ includePregeneratedCurriculums: true });
  const subject = manifest.subjects.find((s) => s.id === req.subjectId);
  const contentBrief = subject?.metadata?.strategy?.content?.contentBrief?.trim() || undefined;

  const legacyBase = {
    enableReasoning: req.enableReasoning,
    forceRegenerate: req.forceRegenerate,
    retryContext: req.retryContext,
    resumeFromStage: req.resumeFromStage,
  } as const;

  if (stage === 'full') {
    const snapshot = buildTopicTheorySnapshot({
      subjectId: req.subjectId,
      topicId: req.topicId,
      schemaVersion: topicTheorySchemaVersion,
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
      modelId,
      capturedAt,
      topicTitle: node.title,
      learningObjective: node.learningObjective,
      contentBrief,
    });
    return {
      pipelineKind: 'topic-content',
      subjectId: req.subjectId,
      topicId: req.topicId,
      snapshot,
      topicContentLegacyOptions: {
        ...legacyBase,
        legacyStage: 'full',
      },
    };
  }

  if (stage === 'theory') {
    const snapshot = buildTopicTheorySnapshot({
      subjectId: req.subjectId,
      topicId: req.topicId,
      schemaVersion: topicTheorySchemaVersion,
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
      modelId,
      capturedAt,
      topicTitle: node.title,
      learningObjective: node.learningObjective,
      contentBrief,
    });
    return {
      pipelineKind: 'topic-content',
      subjectId: req.subjectId,
      topicId: req.topicId,
      snapshot,
      topicContentLegacyOptions: {
        ...legacyBase,
        legacyStage: 'theory',
      },
    };
  }

  const details = await deck.getTopicDetails(req.subjectId, req.topicId);
  const theory = loadTheoryPayloadFromTopicDetails(details);

  if (stage === 'study-cards') {
    const targetDifficulty = 1;
    const snapshot = buildTopicStudyCardsSnapshot({
      subjectId: req.subjectId,
      topicId: req.topicId,
      schemaVersion: topicStudyCardsSchemaVersion,
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
      modelId,
      capturedAt,
      theoryExcerpt: theory.theory,
      syllabusQuestions: theory.coreQuestionsByDifficulty[targetDifficulty],
      targetDifficulty,
      groundingSourceCount: theory.groundingSources.length,
      hasAuthoritativePrimarySource: theory.groundingSources.some((s) => s.trustLevel === 'high'),
    });
    return {
      pipelineKind: 'topic-content',
      subjectId: req.subjectId,
      topicId: req.topicId,
      snapshot,
      topicContentLegacyOptions: {
        ...legacyBase,
        legacyStage: 'study-cards',
      },
    };
  }

  // mini-games (possibly narrowed to a single game type for job-level retry)
  const miniKinds = req.miniGameKindsOverride ?? (['CATEGORY_SORT', 'SEQUENCE_BUILD', 'MATCH_PAIRS'] as const);
  const primaryKind = miniKinds[0] ?? 'CATEGORY_SORT';
  const pipelineKind =
    primaryKind === 'CATEGORY_SORT'
      ? ('topic-mini-game-category-sort' as const)
      : primaryKind === 'SEQUENCE_BUILD'
        ? ('topic-mini-game-sequence-build' as const)
        : ('topic-mini-game-match-pairs' as const);
  const targetDifficulty = 1;
  const snapshot = buildTopicMiniGameCardsSnapshot({
    pipelineKind,
    subjectId: req.subjectId,
    topicId: req.topicId,
    schemaVersion: miniGameSchemaVersion(primaryKind),
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    modelId,
    capturedAt,
    theoryExcerpt: theory.theory,
    syllabusQuestions: theory.coreQuestionsByDifficulty[targetDifficulty],
    targetDifficulty,
    groundingSourceCount: theory.groundingSources.length,
    hasAuthoritativePrimarySource: theory.groundingSources.some((s) => s.trustLevel === 'high'),
  });
  return {
    pipelineKind: 'topic-content',
    subjectId: req.subjectId,
    topicId: req.topicId,
    snapshot,
    topicContentLegacyOptions: {
      ...legacyBase,
      legacyStage: 'mini-games',
      miniGameKindsOverride: req.miniGameKindsOverride,
    },
  };
}

export async function prepareSubjectGraphTopicsRunInput(
  deck: IDeckRepository,
  modelId: string,
  capturedAt: string,
  subjectId: string,
  checklist: StudyChecklist,
  opts?: { orchestratorRetryOf?: string },
): Promise<Extract<RunInput, { pipelineKind: 'subject-graph' }>> {
  const strategy = resolveStrategy(checklist);
  const snapshot = buildSubjectGraphTopicsSnapshot({
    subjectId,
    schemaVersion: subjectGraphTopicsSchemaVersion,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    modelId,
    capturedAt,
    checklist: {
      topic_name: checklist.topicName,
      ...(checklist.studyGoal !== undefined ? { study_goal: checklist.studyGoal } : {}),
      ...(checklist.priorKnowledge !== undefined ? { prior_knowledge: checklist.priorKnowledge } : {}),
      ...(checklist.learningStyle !== undefined ? { learning_style: checklist.learningStyle } : {}),
      ...(checklist.focusAreas !== undefined ? { focus_areas: checklist.focusAreas } : {}),
    },
    strategyBrief: {
      total_tiers: strategy.graph.totalTiers,
      topics_per_tier: strategy.graph.topicsPerTier,
      audience_brief: strategy.graph.audienceBrief,
      domain_brief: strategy.graph.domainBrief,
      focus_constraints: strategy.graph.focusConstraints,
    },
  });
  return {
    pipelineKind: 'subject-graph',
    subjectId,
    stage: 'topics',
    snapshot,
    ...(opts?.orchestratorRetryOf !== undefined
      ? { subjectGraphLegacyOptions: { orchestratorRetryOf: opts.orchestratorRetryOf } }
      : {}),
  };
}

export async function prepareTopicExpansionRunInput(
  deck: IDeckRepository,
  modelId: string,
  capturedAt: string,
  subjectId: string,
  topicId: string,
  nextLevel: 1 | 2 | 3,
  enableReasoning: boolean,
  opts?: { retryOf?: string },
): Promise<Extract<RunInput, { pipelineKind: 'topic-expansion' }>> {
  const difficulty = nextLevel + 1;
  const [details, existingCards] = await Promise.all([
    deck.getTopicDetails(subjectId, topicId),
    deck.getTopicCards(subjectId, topicId),
  ]);
  const bucketKey = difficulty as 2 | 3 | 4;
  const bucket = details.coreQuestionsByDifficulty?.[bucketKey];
  if (!bucket?.length) {
    throw new Error(`No syllabus questions for difficulty bucket ${bucketKey}`);
  }

  const graph = await deck.getSubjectGraph(subjectId);
  const node = graph.nodes.find((n) => n.topicId === topicId);
  const topicTitle = node?.title ?? details.title;

  const theoryExcerpt =
    details.theory.trim().length > 12000
      ? `${details.theory.trim().slice(0, 12000)}\n\n…`
      : details.theory.trim();

  const registry = buildExistingConceptRegistry(existingCards);

  const snapshot = buildTopicExpansionSnapshot({
    subjectId,
    topicId,
    schemaVersion: topicExpansionCardsSchemaVersion,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    modelId,
    capturedAt,
    nextLevel,
    difficulty,
    theoryExcerpt,
    syllabusQuestions: bucket,
    existingCardIds: registry.cardIds,
    existingConceptStems: registry.conceptTargets,
    groundingSourceCount: details.groundingSources?.length ?? 0,
  });

  return {
    pipelineKind: 'topic-expansion',
    subjectId,
    topicId,
    nextLevel,
    snapshot,
    topicExpansionLegacyOptions: {
      enableReasoning,
      retryOf: opts?.retryOf,
    },
  };
}

export async function prepareCrystalTrialRunInput(
  deck: IDeckRepository,
  modelId: string,
  capturedAt: string,
  subjectId: string,
  topicId: string,
  currentLevel: number,
  opts?: { retryOf?: string },
): Promise<Extract<RunInput, { pipelineKind: 'crystal-trial' }>> {
  const ref = { subjectId, topicId };
  const trialStore = useCrystalTrialStore.getState();
  const existingTrial = trialStore.getCurrentTrial(ref);
  const targetLevel = existingTrial?.targetLevel ?? currentLevel + 1;

  const [graph, allCards] = await Promise.all([
    deck.getSubjectGraph(subjectId),
    deck.getTopicCards(subjectId, topicId),
  ]);
  const node = graph.nodes.find((n) => n.topicId === topicId);
  if (!node) {
    throw new Error(`Topic "${topicId}" not found in subject graph`);
  }

  const targetDifficulty = Math.min(currentLevel + 1, MAX_CARD_DIFFICULTY);
  let levelCards = allCards.filter((c) => c.difficulty === targetDifficulty);
  if (levelCards.length === 0) {
    levelCards = allCards.filter((c) => c.difficulty === MAX_CARD_DIFFICULTY);
  }
  if (levelCards.length === 0) {
    throw new Error(`No cards at difficulty ${targetDifficulty}`);
  }

  const cardPoolHash = await contentHash({
    cardIds: levelCards.map((c) => c.id).sort(),
  });

  const manifest = await deck.getManifest({ includePregeneratedCurriculums: true });
  const subject = manifest.subjects.find((s) => s.id === subjectId);
  const contentBrief = subject?.metadata?.strategy?.content?.contentBrief?.trim() || undefined;

  const snapshot = buildCrystalTrialSnapshot({
    subjectId,
    topicId,
    schemaVersion: crystalTrialSchemaVersion,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    modelId,
    capturedAt,
    currentLevel,
    targetLevel,
    cardPoolHash,
    questionCount: TRIAL_QUESTION_COUNT,
    contentBrief,
  });

  return {
    pipelineKind: 'crystal-trial',
    subjectId,
    topicId,
    currentLevel,
    snapshot,
    ...(opts?.retryOf !== undefined ? { crystalTrialLegacyOptions: { retryOf: opts.retryOf } } : {}),
  };
}
