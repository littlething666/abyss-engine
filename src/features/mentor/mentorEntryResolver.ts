import type { MentorTriggerPayload } from './mentorTypes';

/**
 * Resolved mentor trigger when the player opens the mentor entry point while a
 * canonical generation failure needs attention.
 */
export interface MentorFailureEntryPayload {
  trigger:
    | 'subject:generation-failed'
    | 'topic-content:generation-failed'
    | 'topic-expansion:generation-failed'
    | 'crystal-trial:generation-failed'
    | 'content-generation:retry-failed';
  payload: MentorTriggerPayload;
}

/**
 * Plain, mentor-owned context for selecting the right entry-point trigger
 * when the mentor bubble or "Mentor" Quick Action is activated.
 *
 * Intentionally primitive so callers in presentation/composition layers can
 * gather it from whatever stores they already read without leaking
 * cross-feature types into the mentor module.
 */
export interface MentorEntryContext {
  /**
   * Active subject-graph LLM stage for nexus pips / generation-started copy.
   * `null` when no subject-graph job is actively running.
   */
  subjectGraphActiveStage: 'topics' | 'edges' | null;

  /**
   * Cleaned subject label for the active subject-graph pipeline
   * (no "New subject:" prefix). May be null if the label is unavailable.
   */
  subjectGenerationLabel: string | null;

  /** Persisted player name from the mentor store, or null if not yet set. */
  playerName: string | null;

  /**
   * `null` when the player has not yet enqueued their first subject
   * generation. Acts as the gate for `onboarding:pre-first-subject`.
   */
  firstSubjectGenerationEnqueuedAt: number | null;

  /**
   * When set, the nexus bubble is in alert for this failure and a click
   * should enqueue this trigger (including `failureKey` for acknowledgement).
   */
  mentorFailureEntry: MentorFailureEntryPayload | null;
}

export interface MentorEntryDecision {
  trigger:
    | 'subject:generation-failed'
    | 'subject:generation-started'
    | 'onboarding:pre-first-subject'
    | 'topic-content:generation-failed'
    | 'topic-expansion:generation-failed'
    | 'crystal-trial:generation-failed'
    | 'content-generation:retry-failed'
    | 'mentor-bubble:clicked';
  payload: MentorTriggerPayload;
}

/**
 * Pure function. Picks the most relevant trigger to enqueue when the mentor
 * bubble (or the Quick Actions "Mentor" item) is activated and the overlay
 * is closed with an empty queue.
 *
 * Priority order:
 *   1. Canonical generation failure (highest-priority unacknowledged surface)
 *   2. subject:generation-started — subject graph LLM work in flight
 *   3. onboarding:pre-first-subject — the player has not started their first subject
 *   4. mentor-bubble:clicked — generic chatter fallback
 */
export function resolveMentorEntry(context: MentorEntryContext): MentorEntryDecision {
  if (context.mentorFailureEntry) {
    return {
      trigger: context.mentorFailureEntry.trigger,
      payload: context.mentorFailureEntry.payload,
    };
  }

  const phase = context.subjectGraphActiveStage;

  if (phase === 'topics' || phase === 'edges') {
    const subjectName = context.subjectGenerationLabel ?? '';
    const payload: MentorTriggerPayload = { stage: phase };
    if (subjectName) payload.subjectName = subjectName;
    return { trigger: 'subject:generation-started', payload };
  }

  if (context.firstSubjectGenerationEnqueuedAt === null) {
    return { trigger: 'onboarding:pre-first-subject', payload: {} };
  }

  return { trigger: 'mentor-bubble:clicked', payload: {} };
}
