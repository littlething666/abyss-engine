import { topicRefKey } from '@/lib/topicRef';
import { useCrystalContentCelebrationStore } from '@/store/crystalContentCelebrationStore';
import type { AppEventMap } from './eventBus';
import { appEventBus } from './eventBus';
import { telemetry } from '@/features/telemetry';
import { crystalCeremonyStore } from '@/features/progression/crystalCeremonyStore';
import { deckRepository, deckWriter } from './di';
import { getChatCompletionsRepositoryForSurface } from './llmInferenceRegistry';
import { runExpansionJob } from '@/features/contentGeneration/jobs/runExpansionJob';
import type { ContentGenerationAbortReason } from '@/types/contentGenerationAbort';
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
  isCrystalTrialAvailableForPlayer,
} from '@/features/crystalTrial';
import { useProgressionStore } from '@/features/progression/progressionStore';
import { calculateLevelFromXP } from '@/features/progression/progressionUtils';
import {
  handleMentorTrigger,
  MENTOR_VOICE_ID,
  useMentorStore,
} from '@/features/mentor';
import { pubSubClient } from './pubsub';

const expansionSupersededAbortReason: ContentGenerationAbortReason = {
  kind: 'superseded',
  source: 'expansion-replaced',
};

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
    'mentor:first-subject-generation-enqueued',
    {
      triggerId: 'onboarding:pre-first-subject',
      source: 'canned',
      voiceId: MENTOR_VOICE_ID,
    },
    { subjectId },
  );
}

function assertStudyPanelHistoryContext(
  e: AppEventMap['study-panel:history-applied'],
): asserts e is AppEventMap['study-panel:history-applied'] & { subjectId: string; topicId: string; sessionId: string } {
  if (!e.subjectId?.trim() || !e.topicId?.trim() || !e.sessionId?.trim()) {
    throw new Error(
      `study-panel:history-applied (${e.action}) requires non-empty subjectId, topicId and sessionId`,
    );
  }
}

if (!g.__abyssEventBusHandlersRegistered) {
  g.__abyssEventBusHandlersRegistered = true;

  const activeExpansionJobs = new Map<string, AbortController>();

  // Module-scoped dedupe for the post-curriculum onboarding trigger.
  // Ensures `onboarding:subject-unlock-first-crystal` fires at most once per
  // subjectId across regenerates (a player who regenerates a subject's
  // curriculum without unlocking any topic should NOT see the same
  // "open Discovery" prod twice). Falling back to `subject:generated`
  // keeps the celebration line for subjects already engaged with.
  const firedSubjectUnlockFirstCrystal = new Set<string>();

  appEventBus.on('card:reviewed', (e) => {
    telemetry.log(
      'study-card:reviewed',
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
      'xp:gained',
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
      'xp:gained',
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

  appEventBus.on('topic-content:generation-requested', (e) => {
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

  appEventBus.on('subject-graph:generation-requested', (e) => {
    const subjectName = e.checklist.topicName.trim() || e.subjectId;
    recordFirstSubjectGenerationEnqueued(e.subjectId);
    // The bus enqueue is always the topics stage of the subject pipeline;
    // explicit stage lets the mentor rule engine select stage-specific copy.
    handleMentorTrigger('subject:generation-started', { subjectName, stage: 'topics' });

    // Failure-event emission is now owned by the orchestrator so retry-driven
    // executions (which bypass this handler) also produce a terminal
    // `subject-graph:generation-failed` event. The handler chain that turns
    // that event into a mentor trigger + telemetry is registered below as a
    // `subject-graph:generation-failed` listener.
    const stageBindings = resolveSubjectGenerationStageBindings();
    const orchestrator = createSubjectGenerationOrchestrator();
    void orchestrator.execute(
      { subjectId: e.subjectId, checklist: e.checklist },
      { stageBindings, writer: deckWriter },
    );
  });

  appEventBus.on('subject-graph:generated', (e) => {
    void (async () => {
      const subjectName = await resolveSubjectDisplayName(e.subjectId);

      // Phase D: the success toast is gone; the celebration / onboarding
      // mentor lines below are the user-facing surface for completed
      // curricula.
      //
      // Branch: if no topic from this subject has been unlocked yet, fire the
      // contextual onboarding prod (scoped to this subject so DiscoveryModal
      // pre-filters); otherwise fire the generic celebration line.
      // The dedupe set guards against re-fires across regenerates within the
      // same session — once shown, the player won't see this prod again for
      // the same subjectId regardless of subsequent generations.
      const hasAnyUnlockedInSubject = useProgressionStore
        .getState()
        .activeCrystals.some((c) => c.subjectId === e.subjectId);
      const alreadyFiredOnboarding = firedSubjectUnlockFirstCrystal.has(e.subjectId);
      if (!hasAnyUnlockedInSubject && !alreadyFiredOnboarding) {
        firedSubjectUnlockFirstCrystal.add(e.subjectId);
        handleMentorTrigger('onboarding:subject-unlock-first-crystal', {
          subjectName,
          subjectId: e.subjectId,
        });
      } else {
        handleMentorTrigger('subject:generated', { subjectName });
      }
    })();

    telemetry.log(
      'subject-graph:generated',
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

  appEventBus.on('subject-graph:generation-failed', (e) => {
    // Phase D: the failure toast is gone. The mentor failure dialog
    // (priority 82) carries the player-facing surface; the rule engine
    // always exposes an `open_generation_hud` choice so the player can
    // jump to retry controls.
    handleMentorTrigger('subject:generation-failed', {
      subjectName: e.subjectName,
      stage: e.stage,
      pipelineId: e.pipelineId,
    });

    telemetry.log(
      'subject-graph:generation-failed',
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

  appEventBus.on('subject-graph:validation-failed', (e) => {
    console.error(
      `[subject-graph:validation-failed] subject=${e.subjectId} stage=${e.stage} ` +
        `model=${e.boundModel} retryCount=${e.retryCount}: ${e.error}`,
    );
    console.groupCollapsed(`[subject-graph:validation-failed] details (${e.subjectId})`);
    console.error(e);
    console.groupEnd();

    telemetry.log(
      'subject-graph:validation-failed',
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
      'crystal:leveled',
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
      prev?.abort(expansionSupersededAbortReason);
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
    handleMentorTrigger('crystal:leveled', { from: e.from, to: e.to });
  });

  // Crystal Trial: background pre-generation triggered on positive XP gains
  appEventBus.on('crystal-trial:pregeneration-requested', (e) => {
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

    telemetry.log('crystal-trial:pregeneration-started', {
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
  appEventBus.on('crystal-trial:completed', (e) => {
    telemetry.log(
      'crystal-trial:completed',
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

  // ---- Mentor side-effect: trial-availability watcher ----
  //
  // Fires `crystal-trial:available-for-player` exactly once per topic per
  // false→true transition of `isCrystalTrialAvailableForPlayer(status, xp)`.
  // The predicate combines BOTH the trial-store status (must be
  // `awaiting_player`) AND the progression-store XP (must be at the
  // band cap), so a trial that is prepared but XP-deficient does NOT
  // fire — the player would see a mentor announcement they cannot act
  // on. This watcher subscribes to both stores so availability reached
  // by either path (pregeneration completing, or player catching up XP
  // after pregeneration was already done) triggers the announcement.
  //
  // Set membership is local to this module so we never re-fire on
  // unrelated state changes (cooldown counters, other trials, XP gains
  // in already-available crystals). Falling out of availability (e.g.
  // trial moved to `in_progress` when the modal opens) silently drops
  // the key from the set; the next true transition re-fires.
  const availableKeys = new Set<string>();

  function recomputeTrialAvailability(): void {
    const trials = useCrystalTrialStore.getState().trials;
    const activeCrystals = useProgressionStore.getState().activeCrystals;
    const xpByKey = new Map<string, number>();
    for (const crystal of activeCrystals) {
      xpByKey.set(topicRefKey(crystal), crystal.xp);
    }

    const seen = new Set<string>();
    for (const [key, trial] of Object.entries(trials)) {
      if (!trial) continue;
      seen.add(key);
      const xp = xpByKey.get(key) ?? 0;
      const isAvailable = isCrystalTrialAvailableForPlayer(trial.status, xp);
      const wasAvailable = availableKeys.has(key);
      if (isAvailable && !wasAvailable) {
        availableKeys.add(key);
        handleMentorTrigger('crystal-trial:available-for-player', {
          topic: trial.topicId,
        });
      } else if (!isAvailable && wasAvailable) {
        availableKeys.delete(key);
      }
    }

    // Drop keys whose trials disappeared from the store entirely (e.g.
    // `clearTrial` after a passed trial). Without this, a recreated trial
    // for the same topic key could skip the false→true edge.
    for (const key of availableKeys) {
      if (!seen.has(key)) availableKeys.delete(key);
    }
  }

  useCrystalTrialStore.subscribe(recomputeTrialAvailability);
  useProgressionStore.subscribe(recomputeTrialAvailability);

  // ---- Phase C: content-generation terminal events → mentor triggers ----
  //
  // Runners (`runTopicGenerationPipeline`, `runExpansionJob`,
  // `generateTrialQuestions`, retry orchestration) own emission of these
  // terminal events; this section just turns them into mentor side
  // effects. Topic-ready dedupe (per-pipelineId + 4h per
  // (subjectId, topicId)) and failure CTA wiring live in the rule engine,
  // so each handler stays thin.

  appEventBus.on('topic-content:generation-completed', (e) => {
    // Only the full-pipeline success surfaces the topic-ready prod.
    // Partial-stage successes (theory / study-cards / mini-games) are
    // progress signals owned by the generation HUD; surfacing them as
    // mentor dialogs would create noise the player cannot act on.
    if (e.stage !== 'full') return;
    handleMentorTrigger('topic-content:generation-ready', {
      subjectId: e.subjectId,
      topicId: e.topicId,
      topicLabel: e.topicLabel,
      pipelineId: e.pipelineId,
    });
  });

  appEventBus.on('topic-content:generation-failed', (e) => {
    console.error(
      `[topic-content:generation-failed] subject=${e.subjectId} topic=${e.topicId} ` +
        `stage=${e.stage}: ${e.errorMessage}`,
    );
    handleMentorTrigger('topic-content:generation-failed', {
      subjectId: e.subjectId,
      topicId: e.topicId,
      topicLabel: e.topicLabel,
      errorMessage: e.errorMessage,
    });
  });

  appEventBus.on('topic-expansion:generation-failed', (e) => {
    console.error(
      `[topic-expansion:generation-failed] subject=${e.subjectId} topic=${e.topicId} ` +
        `level=${e.level}: ${e.errorMessage}`,
    );
    handleMentorTrigger('topic-expansion:generation-failed', {
      subjectId: e.subjectId,
      topicId: e.topicId,
      topicLabel: e.topicLabel,
      level: e.level,
      errorMessage: e.errorMessage,
    });
  });

  appEventBus.on('crystal-trial:generation-failed', (e) => {
    console.error(
      `[crystal-trial:generation-failed] subject=${e.subjectId} topic=${e.topicId} ` +
        `level=${e.level}: ${e.errorMessage}`,
    );
    handleMentorTrigger('crystal-trial:generation-failed', {
      subjectId: e.subjectId,
      topicId: e.topicId,
      topicLabel: e.topicLabel,
      level: e.level,
      errorMessage: e.errorMessage,
    });
  });

  appEventBus.on('content-generation:retry-failed', (e) => {
    console.error(
      `[content-generation:retry-failed] subject=${e.subjectId} jobLabel=${e.jobLabel}: ` +
        `${e.errorMessage}`,
    );
    handleMentorTrigger('content-generation:retry-failed', {
      subjectId: e.subjectId,
      topicId: e.topicId,
      topicLabel: e.topicLabel,
      jobLabel: e.jobLabel,
      errorMessage: e.errorMessage,
    });
  });

  // Card pool change detection: invalidate pre-generated trials.
  // Subscribes to the renamed v1 pubsub event `topic-cards:updated` published
  // by `deckContentWriter.persistTopicContentBundle(...)`.
  pubSubClient.on('topic-cards:updated', (msg) => {
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
      'study-session:completed',
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
    handleMentorTrigger('session:completed', {
      correctRate: e.correctRate,
      totalAttempts: e.totalAttempts,
    });
  });

  appEventBus.on('attunement-ritual:submitted', (e) => {
    telemetry.log(
      'attunement-ritual:submitted',
      {
        harmonyScore: e.harmonyScore,
        readinessBucket: e.readinessBucket,
        checklistKeys: e.checklistKeys,
        buffsGranted: e.buffsGranted.map((b) => b.buffId),
      },
      { subjectId: e.subjectId, topicId: e.topicId },
    );
  });

  appEventBus.on('study-panel:history-applied', (e) => {
    assertStudyPanelHistoryContext(e);

    if (e.action === 'submit') {
      telemetry.log(
        'study-session:started',
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
        'study-panel:undo-applied',
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
        'study-panel:redo-applied',
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
