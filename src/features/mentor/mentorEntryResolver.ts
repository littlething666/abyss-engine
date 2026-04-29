import type { MentorTriggerPayload } from './mentorTypes';

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
   * Live phase of the most relevant subject-generation pipeline, derived
   * from `activeSubjectGenerationStatus` in the contentGeneration feature.
   * `null` when no subject pipeline is active or recently failed.
   */
  subjectGenerationPhase: 'topics' | 'edges' | 'failed' | null;

  /**
   * Cleaned subject label for the active or failed pipeline
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
}

export interface MentorEntryDecision {
  trigger:
    | 'subject:generation-failed'
    | 'subject:generation-started'
    | 'onboarding:pre-first-subject'
    | 'mentor-bubble:clicked';
  payload: MentorTriggerPayload;
}

/**
 * Pure function. Picks the most relevant trigger to enqueue when the mentor
 * bubble (or the Quick Actions "Mentor" item) is activated and the overlay
 * is closed with an empty queue.
 *
 * Priority order matches the contextual-entry plan:
 *   1. subject:generation-failed    — a recent pipeline needs attention
 *   2. subject:generation-started   — a pipeline is currently running (topics/edges)
 *   3. onboarding:pre-first-subject — the player has not started their first subject
 *   4. mentor-bubble:clicked        — generic chatter fallback
 *
 * Keeping the resolver pure makes it directly unit-testable from plain
 * context, with no zustand/dom dependencies. The caller
 * (`tryEnqueueMentorEntry`) is responsible for the overlay/queue guards.
 */
export function resolveMentorEntry(
  context: MentorEntryContext,
): MentorEntryDecision {
  const phase = context.subjectGenerationPhase;

  if (phase === 'failed') {
    const subjectName = context.subjectGenerationLabel ?? '';
    return {
      trigger: 'subject:generation-failed',
      payload: subjectName ? { subjectName } : {},
    };
  }

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
