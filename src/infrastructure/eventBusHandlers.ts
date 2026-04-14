import { topicRefKey } from '@/lib/topicRef';
import type { AppEventMap } from './eventBus';
import { appEventBus } from './eventBus';
import { telemetry } from '@/features/telemetry';
import { crystalCeremonyStore } from '@/features/progression/crystalCeremonyStore';
import { deckRepository, deckWriter } from './di';
import { getChatCompletionsRepositoryForSurface } from './llmInferenceRegistry';
import { runExpansionJob } from '@/features/contentGeneration/jobs/runExpansionJob';
import { runTopicGenerationPipeline } from '@/features/contentGeneration/pipelines/runTopicGenerationPipeline';
import { createSubjectGenerationOrchestrator } from '@/features/subjectGeneration';
import { resolveModelForSurface } from './llmInferenceSurfaceProviders';

const g = globalThis as typeof globalThis & {
  __abyssEventBusHandlersRegistered?: boolean;
};

function assertStudyPanelHistoryContext(
  e: AppEventMap['study-panel:history'],
): asserts e is AppEventMap['study-panel:history'] & { subjectId: string; topicId: string; sessionId: string } {
  if (!e.subjectId?.trim() || !e.topicId?.trim() || !e.sessionId?.trim()) {
    throw new Error(
      `study-panel:history (${e.action}) requires non-empty subjectId, topicId and sessionId`,
    );
  }
}

if (!g.__abyssEventBusHandlersRegistered) {
  g.__abyssEventBusHandlersRegistered = true;

  const activeExpansionJobs = new Map<string, AbortController>();

  appEventBus.on('card:reviewed', (e) => {
    telemetry.log(
      'study_card_reviewed',
      {
        cardId: e.cardId,
        rating: e.rating,
        isCorrect: e.isCorrect,
        difficulty: e.difficulty,
        timeTakenMs: e.timeTakenMs,
        buffMultiplier: e.buffMultiplier,
      },
      { subjectId: e.subjectId, topicId: e.topicId, sessionId: e.sessionId },
    );
    telemetry.log(
      'xp_gained',
      {
        amount: e.buffedReward,
        subjectId: e.subjectId,
        topicId: e.topicId,
        sessionId: e.sessionId,
        cardId: e.cardId,
      },
      { subjectId: e.subjectId, topicId: e.topicId, sessionId: e.sessionId },
    );
  });

  appEventBus.on('xp:gained', (e) => {
    telemetry.log(
      'xp_gained',
      {
        amount: e.amount,
        subjectId: e.subjectId,
        topicId: e.topicId,
        sessionId: e.sessionId,
        cardId: e.cardId,
      },
      { subjectId: e.subjectId, topicId: e.topicId, sessionId: e.sessionId },
    );
  });

  appEventBus.on('topic:generation-pipeline', (e) => {
    void runTopicGenerationPipeline({
      chat: getChatCompletionsRepositoryForSurface('topicContent'),
      deckRepository,
      writer: deckWriter,
      subjectId: e.subjectId,
      topicId: e.topicId,
      enableThinking: e.enableThinking ?? false,
      forceRegenerate: e.forceRegenerate,
      stage: e.stage,
    });
  });

  appEventBus.on('subject:generation-pipeline', (e) => {
    const chat = getChatCompletionsRepositoryForSurface('subjectGeneration');
    const model = resolveModelForSurface('subjectGeneration');
    const orchestrator = createSubjectGenerationOrchestrator();
    void orchestrator.execute(
      { subjectId: e.subjectId, checklist: e.checklist },
      { chat, writer: deckWriter, model, enableThinking: false },
    );
  });

  appEventBus.on('crystal:leveled', (e) => {
    telemetry.log(
      'level_up',
      {
        subjectId: e.subjectId,
        topicId: e.topicId,
        fromLevel: e.from,
        toLevel: e.to,
      },
      { subjectId: e.subjectId, topicId: e.topicId },
    );

    crystalCeremonyStore
      .getState()
      .notifyLevelUp({ subjectId: e.subjectId, topicId: e.topicId }, e.isStudyPanelOpen);

    const expansionKey = topicRefKey({ subjectId: e.subjectId, topicId: e.topicId });
    if (e.to >= 2 && e.to <= 3) {
      const prev = activeExpansionJobs.get(expansionKey);
      prev?.abort();
      const ac = new AbortController();
      activeExpansionJobs.set(expansionKey, ac);
      void runExpansionJob({
        chat: getChatCompletionsRepositoryForSurface('topicContent'),
        deckRepository,
        writer: deckWriter,
        subjectId: e.subjectId,
        topicId: e.topicId,
        nextLevel: e.to,
        enableThinking: false,
        signal: ac.signal,
      }).finally(() => {
        activeExpansionJobs.delete(expansionKey);
      });
    }
  });

  appEventBus.on('session:completed', (e) => {
    telemetry.log(
      'study_session_complete',
      {
        sessionId: e.sessionId,
        subjectId: e.subjectId,
        topicId: e.topicId,
        totalAttempts: e.totalAttempts,
        correctRate: e.correctRate,
        sessionDurationMs: e.sessionDurationMs,
      },
      { subjectId: e.subjectId, topicId: e.topicId, sessionId: e.sessionId },
    );
  });

  appEventBus.on('ritual:submitted', (e) => {
    telemetry.log(
      'attunement_ritual_submitted',
      {
        harmonyScore: e.harmonyScore,
        readinessBucket: e.readinessBucket,
        checklistKeys: e.checklistKeys,
        buffsGranted: e.buffsGranted.map((b) => b.buffId),
      },
      { subjectId: e.subjectId, topicId: e.topicId },
    );
  });

  appEventBus.on('study-panel:history', (e) => {
    assertStudyPanelHistoryContext(e);

    if (e.action === 'submit') {
      telemetry.log(
        'study_session_start',
        {
          sessionId: e.sessionId,
          subjectId: e.subjectId,
          topicId: e.topicId,
        },
        { sessionId: e.sessionId, subjectId: e.subjectId, topicId: e.topicId },
      );
    }
    if (e.action === 'undo') {
      telemetry.log(
        'study_undo',
        {
          subjectId: e.subjectId,
          topicId: e.topicId,
          sessionId: e.sessionId,
          undoCount: e.undoCount,
          redoCount: e.redoCount,
        },
        { sessionId: e.sessionId, subjectId: e.subjectId, topicId: e.topicId },
      );
    }
    if (e.action === 'redo') {
      telemetry.log(
        'study_redo',
        {
          subjectId: e.subjectId,
          topicId: e.topicId,
          sessionId: e.sessionId,
          undoCount: e.undoCount,
          redoCount: e.redoCount,
        },
        { sessionId: e.sessionId, subjectId: e.subjectId, topicId: e.topicId },
      );
    }
  });
}
