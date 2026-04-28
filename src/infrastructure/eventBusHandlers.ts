import { activeSubjectGenerationStatus } from '@/features/contentGeneration/activeSubjectGenerationStatus';
import { useContentGenerationStore } from '@/features/contentGeneration/contentGenerationStore';
import { handleMentorTrigger, useMentorStore } from '@/features/mentor';
import { telemetry } from '@/features/telemetry';
import { appEventBus } from '@/infrastructure/appEventBus';
import { useCrystalsStore } from '@/state/crystalsStore';

const g = globalThis as typeof globalThis & {
  __abyssEventBusHandlersRegistered?: boolean;
  __abyssEventBusUnsubscribers?: Array<() => void>;
};

/**
 * First-subject milestone tracking. Persists `firstSubjectGenerationEnqueuedAt`
 * on the mentor store the first time *any* subject generation pipeline
 * begins. The mentor's `onboarding.pre_first_subject` rule consults this
 * value to gate the proactive bootstrap nudge and the bubble / Quick Action
 * resolver path. Telemetry mirrors the rename so dashboards group the new
 * trigger consistently with the persisted flag.
 */
function recordFirstSubjectGenerationEnqueued(): void {
  const mentor = useMentorStore.getState();
  if (mentor.firstSubjectGenerationEnqueuedAt !== null) return;
  const now = Date.now();
  useMentorStore.setState({ firstSubjectGenerationEnqueuedAt: now });
  telemetry.capture('mentor_trigger_fired', {
    triggerId: 'onboarding.pre_first_subject',
    enqueued: true,
    enqueuedAt: now,
  });
}

/**
 * Idempotent mount-time wiring of canonical app event → side-effect
 * subscriptions. Called from MentorBootstrapMount (and any other early-page
 * mount) and guarded so a fast-refresh re-mount does not duplicate handlers.
 *
 * Mentor `appEventBus` subscriptions live here (rather than inside the
 * mentor feature) so the composition root owns wiring across features. The
 * mentor feature exposes `handleMentorTrigger` as the single inbound API.
 */
export function registerAppEventBusHandlers(): void {
  if (g.__abyssEventBusHandlersRegistered) return;
  g.__abyssEventBusHandlersRegistered = true;
  const offs: Array<() => void> = [];

  offs.push(
    appEventBus.on('crystal:leveled', ({ topicId, from, to }) => {
      handleMentorTrigger('crystal.leveled', { topic: topicId, from, to });
    }),
  );

  offs.push(
    appEventBus.on('session:completed', ({ correctRate, totalAttempts }) => {
      handleMentorTrigger('session.completed', { correctRate, totalAttempts });
    }),
  );

  offs.push(
    appEventBus.on('subject:generation-pipeline', (event) => {
      if (event.kind === 'enqueued') {
        recordFirstSubjectGenerationEnqueued();
        // Stage-aware copy: emit topics by default since the pipeline begins
        // in topic generation. The bubble re-entry resolver passes the live
        // stage from ActiveSubjectGenerationStatus when the user clicks back
        // in mid-flight.
        handleMentorTrigger('subject.generation.started', {
          subjectName: event.subjectName,
          stage: 'topics',
        });
      } else if (event.kind === 'complete') {
        handleMentorTrigger('subject.generated', { subjectName: event.subjectName });
      } else if (event.kind === 'failed') {
        handleMentorTrigger('subject.generation.failed', {
          subjectName: event.subjectName,
          ...(event.pipelineId ? { pipelineId: event.pipelineId } : {}),
        });
      }
    }),
  );

  // Crystal trial `awaiting_player` transition watcher. Subscribes to the
  // crystals store and fires `crystal.trial.awaiting` once per topic when
  // its trial state crosses into `awaiting_player`.
  const seenAwaitingTopics = new Set<string>();
  offs.push(
    useCrystalsStore.subscribe((state) => {
      for (const [topicId, crystal] of Object.entries(state.crystals)) {
        if (crystal.trialState === 'awaiting_player' && !seenAwaitingTopics.has(topicId)) {
          seenAwaitingTopics.add(topicId);
          handleMentorTrigger('crystal.trial.awaiting', { topic: topicId });
        }
        if (crystal.trialState !== 'awaiting_player') {
          seenAwaitingTopics.delete(topicId);
        }
      }
    }),
  );

  // Bubble visual mood derives from active generation status; no event bus
  // wiring needed here, but ensure the store is initialized (no-op getState).
  void useContentGenerationStore.getState();
  void activeSubjectGenerationStatus;

  g.__abyssEventBusUnsubscribers = offs;
}

/** Test-only: tear down all subscriptions and reset the registration latch. */
export function __resetAppEventBusHandlersForTests(): void {
  if (g.__abyssEventBusUnsubscribers) {
    for (const off of g.__abyssEventBusUnsubscribers) {
      try {
        off();
      } catch {
        // ignore
      }
    }
    g.__abyssEventBusUnsubscribers = [];
  }
  g.__abyssEventBusHandlersRegistered = false;
}
