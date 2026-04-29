import { topicRefKey } from '@/lib/topicRef';
import { useCrystalContentCelebrationStore } from '@/store/crystalContentCelebrationStore';
import type { AppEventMap } from './eventBus';
import { appEventBus } from './eventBus';
import { telemetry } from '@/features/telemetry';
import { crystalCeremonyStore } from '@/features/progression/crystalCeremonyStore';
import { deckRepository, deckWriter } from './di';
import { getChatCompletionsRepositoryForSurface } from './llmInferenceRegistry';
import { runExpansionJob } from '@/features/contentGeneration/jobs/runExpansionJob';
import { runTopicGenerationPipeline } from '@/features/contentGeneration/pipelines/runTopicGenerationPipeline';
import {
  createSubjectGenerationOrchestrator,
  resolveSubjectGenerationStageBindings,
} from '@/features/subjectGeneration';
import { resolveEnableReasoningForSurface } from './llmInferenceSurfaceProviders';
import { useCrystalTrialStore } from '@/features/crystalTrial/crystalTrialStore';
import { generateTrialQuestions } from '@/features/crystalTrial/generateTrialQuestions';
import {
  resolveCrystalTrialPregenerateLevels,
  busMayStartTrialPregeneration,
} from '@/features/crystalTrial';
import { useProgressionStore } from '@/features/progression/progressionStore';
import { calculateLevelFromXP } from '@/features/progression/progressionUtils';
import {
  handleMentorTrigger,
  MENTOR_VOICE_ID,
  useMentorStore,
} from '@/features/mentor';
import { pubSubClient } from './pubsub';
import { toast } from '@/infrastructure/toast';

const g = globalThis as typeof globalThis & {
  __abyssEventBusHandlersRegistered?: boolean;
};

async function resolveSubjectDisplayName(subjectId: string): Promise<string> {
  try {
    const manifest = await deckRepository.getManifest({ includePregeneratedCurriculums: true });
    const subject = manifest.subjects.find((s) => s.id === subjectId);
    return subject?.name?.trim() || subjectId;
  } catch {
    return subjectId;
  }
}

/**
 * Sole owner of the `firstSubjectGenerationEnqueuedAt` mentor milestone.
 * Idempotent across all entry paths (Quick Action → IncrementalSubjectModal,
 * Discovery empty-state CTA, command palette, mentor onboarding CTA), since
 * the bus event is the single chokepoint downstream of
 * `triggerSubjectGeneration`. Records the timestamp + telemetry exactly
 * once; subsequent calls no-op.
 */
function recordFirstSubjectGenerationEnqueued(subjectId: string): void {
  const mentor = useMentorStore.getState();
  if (mentor.firstSubjectGenerationEnqueuedAt !== null) {
    return;
  }

  const atMs = Date.now();
  mentor.markFirstSubjectGenerationEnqueued(atMs);
  telemetry.log(
    'mentor_first_subject_generation_enqueued',
    {
      triggerId: 'onboarding.pre_first_subject',
      source: 'canned',
      voiceId: MENTOR_VOICE_ID,
    },
    { subjectId },
  );
}

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
        ...(e.coarseChoice !== undefined ? { coarseChoice: e.coarseChoice } : {}),
        ...(e.hintUsed !== undefined ? { hintUsed: e.hintUsed } : {}),
        ...(e.appliedBucket !== undefined ? { appliedBucket: e.appliedBucket } : {}),
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
      enableReasoning: e.enableReasoning ?? resolveEnableReasoningForSurface('topicContent'),
      forceRegenerate: e.forceRegenerate,
      stage: e.stage,
    });
  });

  appEventBus.on('subject:generation-pipeline', (e) => {
    const subjectName = e.checklist.topicName.trim() || e.subjectId;
    recordFirstSubjectGenerationEnqueued(e.subjectId);
    // The bus enqueue is always the topics stage of the subject pipeline;
    // explicit stage lets the mentor rule engine select stage-specific copy.
    handleMentorTrigger('subject.generation.started', { subjectName, stage: 'topics' });

    const stageBindings = resolveSubjectGenerationStageBindings();
    const orchestrator = createSubjectGenerationOrchestrator();
    void orchestrator
      .execute({ subjectId: e.subjectId, checklist: e.checklist }, { stageBindings, writer: deckWriter })
      .then((result) => {
        if (result.ok) return;
        appEventBus.emit('subjectGraph.generationFailed', {
          subjectId: e.subjectId,
          subjectName,
          pipelineId: result.pipelineId,
          stage: result.stage,
          error: result.error,
        });
      });
  });

  appEventBus.on('subjectGraph.generated', (e) => {
    void (async () => {
      const subjectName = await resolveSubjectDisplayName(e.subjectId);
      toast.success(`Curriculum generated: ${subjectName}`);
      handleMentorTrigger('subject.generated', { subjectName });
    })();

    telemetry.log(
      'subject_graph_generated',
      {
        subjectId: e.subjectId,
        boundModel: e.boundModel,
        stageADurationMs: e.stageADurationMs,
        stageBDurationMs: e.stageBDurationMs,
        retryCount: e.retryCount,
        topicCount: e.lattice.topics.length,
        ...(e.prereqEdgesCorrectionApplied
          ? {
              prereqEdgesCorrectionApplied: true,
              prereqEdgesCorrectionRemovedCount: e.prereqEdgesCorrectionRemovedCount,
              prereqEdgesCorrectionAddedCount: e.prereqEdgesCorrectionAddedCount,
              prereqEdgesCorrection: e.prereqEdgesCorrection,
            }
          : {}),
      },
      { subjectId: e.subjectId },
    );
  });

  appEventBus.on('subjectGraph.generationFailed', (e) => {
    void (async () => {
      toast.error(`Curriculum generation needs attention: ${e.subjectName}`);
      handleMentorTrigger('subject.generation.failed', {
        subjectName: e.subjectName,
        stage: e.stage,
        pipelineId: e.pipelineId,
      });
    })();

    telemetry.log(
      'subject_graph_generation_failed',
      {
        subjectId: e.subjectId,
        subjectName: e.subjectName,
        pipelineId: e.pipelineId,
        stage: e.stage,
        error: e.error,
      },
      { subjectId: e.subjectId },
    );
  });

  appEventBus.on('subjectGraph.validationFailed', (e) => {
    console.error(
      `[subjectGraph.validationFailed] subject=${e.subjectId} stage=${e.stage} ` +
        `model=${e.boundModel} retryCount=${e.retryCount}: ${e.error}`,
    );
    console.groupCollapsed(`[subjectGraph.validationFailed] details (${e.subjectId})`);
    console.error(e);
    console.groupEnd();

    telemetry.log(
      'subject_graph_validation_failed',
      {
        subjectId: e.subjectId,
        stage: e.stage,
        error: e.error,
        offendingTopicIds: e.offendingTopicIds,
        boundModel: e.boundModel,
        retryCount: e.retryCount,
        stageDurationMs: e.stageDurationMs,
        hasLatticeSnapshot: Boolean(e.latticeSnapshot),
      },
      { subjectId: e.subjectId },
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
        enableReasoning: resolveEnableReasoningForSurface('topicContent'),
        signal: ac.signal,
      }).finally(() => {
        activeExpansionJobs.delete(expansionKey);
      });
    }

    // Mentor side-effect: forward level-up to the mentor rule engine. Cooldown
    // and one-shot suppression are enforced by the engine + mentor store.
    handleMentorTrigger('crystal.leveled', { from: e.from, to: e.to });
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

  // Mentor side-effect: crystal-trial `awaiting_player` transition watcher.
  // The store holds `trials: Record<topicRefKey, CrystalTrial>` so we diff
  // each entry against the previous snapshot and only fire on a real
  // transition (prev !== awaiting_player && next === awaiting_player). This
  // avoids re-firing on unrelated state changes (cooldown counters, other
  // trials). Registration sits inside the existing
  // `__abyssEventBusHandlersRegistered` guard so it is set up exactly once.
  useCrystalTrialStore.subscribe((next, prev) => {
    const prevTrials = prev.trials;
    const nextTrials = next.trials;
    if (prevTrials === nextTrials) return;
    for (const key of Object.keys(nextTrials)) {
      const nextTrial = nextTrials[key];
      if (!nextTrial || nextTrial.status !== 'awaiting_player') continue;
      const prevTrial = prevTrials[key];
      if (prevTrial && prevTrial.status === 'awaiting_player') continue;
      handleMentorTrigger('crystal.trial.awaiting', { topic: nextTrial.topicId });
    }
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

    // Mentor side-effect: forward session completion to the mentor rule
    // engine. Cooldown/one-shot suppression handled downstream.
    handleMentorTrigger('session.completed', {
      correctRate: e.correctRate,
      totalAttempts: e.totalAttempts,
    });
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

  appEventBus.on('study-panel:opened', () => {
    const session = useProgressionStore.getState().currentSession;
    if (!session) {
      return;
    }
    const key = topicRefKey({ subjectId: session.subjectId, topicId: session.topicId });
    useCrystalContentCelebrationStore.getState().dismissPending(key);
  });
}
