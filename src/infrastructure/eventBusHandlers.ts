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
import { useCrystalTrialStore } from '@/features/crystalTrial/crystalTrialStore';
import { generateTrialQuestions } from '@/features/crystalTrial/generateTrialQuestions';
import {
  resolveCrystalTrialPregenerateLevels,
  busMayStartTrialPregeneration,
} from '@/features/crystalTrial';
import { useProgressionStore } from '@/features/progression/progressionStore';
import { calculateLevelFromXP } from '@/features/progression/progressionUtils';
import { pubSubClient } from './pubsub';

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

    // Track cooldown card reviews for Crystal Trial
    const trialStore = useCrystalTrialStore.getState();
    const ref = { subjectId: e.subjectId, topicId: e.topicId };
    if (trialStore.getTrialStatus(ref) === 'cooldown') {
      trialStore.recordCooldownCardReview(ref);

      // Check if cooldown is now complete — trigger question regeneration for retry
      if (trialStore.isCooldownComplete(ref, Date.now())) {
        trialStore.clearCooldown(ref);

        // Trigger question regeneration for the retry
        const crystal = useProgressionStore.getState().activeCrystals.find(
          (c) => c.subjectId === ref.subjectId && c.topicId === ref.topicId,
        );
        if (crystal) {
          const currentLevel = calculateLevelFromXP(crystal.xp);
          void generateTrialQuestions({
            chat: getChatCompletionsRepositoryForSurface('crystalTrial'),
            deckRepository,
            subjectId: ref.subjectId,
            topicId: ref.topicId,
            currentLevel,
          });
        }
      }
    }
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
      .notifyLevelUp({ subjectId: e.subjectId, topicId: e.topicId }, e.isDialogOpen);

    // UPDATED: Expansion now runs for L1 through L3 (was L2-L3 only).
    // L1 level-up creates difficulty 2 cards, L2 creates diff 3, L3 creates diff 4.
    const expansionKey = topicRefKey({ subjectId: e.subjectId, topicId: e.topicId });
    if (e.to >= 1 && e.to <= 3) {
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

  // Crystal Trial: background pre-generation triggered on positive XP gains
  appEventBus.on('crystal:trial-pregenerate', (e) => {
    const trialStore = useCrystalTrialStore.getState();
    const ref = { subjectId: e.subjectId, topicId: e.topicId };

    const status = trialStore.getTrialStatus(ref);
    if (!busMayStartTrialPregeneration(status)) {
      return;
    }

    trialStore.startPregeneration({
      subjectId: e.subjectId,
      topicId: e.topicId,
      targetLevel: e.targetLevel,
    });

    void generateTrialQuestions({
      chat: getChatCompletionsRepositoryForSurface('crystalTrial'),
      deckRepository,
      subjectId: e.subjectId,
      topicId: e.topicId,
      currentLevel: e.currentLevel,
    });

    telemetry.log('crystal_trial_pregeneration_started', {
      subjectId: e.subjectId,
      topicId: e.topicId,
      targetLevel: e.targetLevel,
    });
  });

  // Crystal Trial: completed (pass or fail)
  // NOTE: On pass, the trial is NOT cleared here. It stays in 'passed' status
  // so the modal can display results. clearTrial() is called from the modal's
  // handleLevelUp callback after the user clicks the Level Up button and XP
  // is applied to cross the level boundary.
  appEventBus.on('crystal:trial-completed', (e) => {
    telemetry.log(
      'crystal_trial_completed',
      {
        subjectId: e.subjectId,
        topicId: e.topicId,
        targetLevel: e.targetLevel,
        passed: e.passed,
        score: e.score,
        trialId: e.trialId,
      },
      { subjectId: e.subjectId, topicId: e.topicId },
    );

    // On failure, trial status is already set to 'cooldown' by submitTrial().
    // On pass, trial status is already set to 'passed' by submitTrial().
    // clearTrial for passed trials is handled by the modal's Level Up button.
  });

  // Card pool change detection: invalidate pre-generated trials
  pubSubClient.on('cards-updated', (msg) => {
    if (!msg.subjectId || !msg.topicId) {
      return;
    }
    const ref = { subjectId: msg.subjectId, topicId: msg.topicId };
    const trialStore = useCrystalTrialStore.getState();
    const status = trialStore.getTrialStatus(ref);
    // Topic-scoped: refresh when generating or ready (`awaiting_player`), not during `in_progress`.
    if (status === 'pregeneration' || status === 'awaiting_player') {
      // Atomic invalidation + regeneration: look up crystal level and create new trial in one store update
      const levels = resolveCrystalTrialPregenerateLevels(
        ref,
        useProgressionStore.getState().activeCrystals,
      );
      if (!levels) {
        return;
      }
      const { currentLevel } = levels;

      trialStore.invalidateAndRegenerate(ref, {
        subjectId: ref.subjectId,
        topicId: ref.topicId,
        targetLevel: levels.targetLevel,
      });

      // Now trigger the LLM generation (trial already exists in store in pregeneration state)
      void generateTrialQuestions({
        chat: getChatCompletionsRepositoryForSurface('crystalTrial'),
        deckRepository,
        subjectId: ref.subjectId,
        topicId: ref.topicId,
        currentLevel,
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
