import type { ActiveSubjectGenerationStatus } from '@/features/contentGeneration/activeSubjectGenerationStatus';

import { evaluateTrigger } from './dialogRuleEngine';
import { selectIsOverlayOpen, useMentorStore } from './mentorStore';
import type { MentorTriggerId, MentorTriggerPayload } from './mentorTypes';

/**
 * Plain-data context the bubble / Quick Action collect from cross-feature
 * stores before asking the mentor feature to choose an entry-point dialog.
 *
 * Caller responsibility: read the current values from the relevant stores
 * (mentor store + content generation store) and pass them in. The mentor
 * feature is the policy owner — it decides which trigger to enqueue.
 */
export interface MentorEntryContext {
  subjectGenerationStatus: ActiveSubjectGenerationStatus | null;
  playerName: string | null;
  firstSubjectGenerationEnqueuedAt: number | null;
}

/**
 * Strip the "New subject:" prefix the same way `activeSubjectGenerationStatus`
 * does for the HUD, so mentor copy uses the bare topic name instead of the
 * pipeline label.
 */
function pipelineLabelToSubjectName(label: string): string {
  const prefixed = /^New subject:\s*(.+)$/.exec(label);
  return (prefixed?.[1] ?? label).trim();
}

interface ResolvedEntry {
  trigger: MentorTriggerId;
  payload: MentorTriggerPayload;
}

/**
 * Pick the most relevant mentor trigger for a bubble / Quick Action click.
 *
 * Priority order (highest first):
 *   1. subject.generation.failed — if a failed pipeline is the surfaced
 *      status. The bubble alert pulse is on; the click should land on the
 *      retry guidance, not generic chatter.
 *   2. subject.generation.started — if generation is in progress. Stage is
 *      forwarded so the dialog uses topics/edges-specific copy.
 *   3. onboarding.pre_first_subject — if the player has not yet started a
 *      first subject. Returning players whose `playerName` is already set
 *      still receive guidance; the message builder skips the greet + name
 *      prompt.
 *   4. mentor.bubble.click — generic fallback once first-subject generation
 *      has been recorded and nothing else is active.
 */
function resolveEntry(ctx: MentorEntryContext): ResolvedEntry {
  const status = ctx.subjectGenerationStatus;

  if (status?.phase === 'failed') {
    return {
      trigger: 'subject.generation.failed',
      payload: {
        subjectName: pipelineLabelToSubjectName(status.label),
        ...(status.pipelineId ? { pipelineId: status.pipelineId } : {}),
      },
    };
  }

  if (status && (status.phase === 'topics' || status.phase === 'edges')) {
    return {
      trigger: 'subject.generation.started',
      payload: {
        subjectName: pipelineLabelToSubjectName(status.label),
        stage: status.phase,
        ...(status.pipelineId ? { pipelineId: status.pipelineId } : {}),
      },
    };
  }

  if (ctx.firstSubjectGenerationEnqueuedAt === null) {
    return {
      trigger: 'onboarding.pre_first_subject',
      payload: {},
    };
  }

  return {
    trigger: 'mentor.bubble.click',
    payload: {},
  };
}

/**
 * Snapshot the mentor store fields the resolver needs at click time. Both
 * the bubble (inside R3F) and the HUD Quick Actions item (outside R3F)
 * route through this helper so they always agree on the resolved entry.
 * The caller is responsible for snapshotting the active subject generation
 * status — that read is owned by the contentGeneration feature.
 */
export function readMentorEntryContextFromStores(
  subjectGenerationStatus: ActiveSubjectGenerationStatus | null,
): MentorEntryContext {
  const mentor = useMentorStore.getState();
  return {
    subjectGenerationStatus,
    playerName: mentor.playerName,
    firstSubjectGenerationEnqueuedAt: mentor.firstSubjectGenerationEnqueuedAt,
  };
}

/**
 * Implements the v1 contextual mentor entry rules:
 *
 * - If the overlay is already open: no-op (Pin rule #8).
 * - If `dialogQueue` is non-empty: no-op. The queued plan wins;
 *   `MentorDialogOverlay`'s auto-pop opens its head.
 * - Otherwise: resolve the most relevant trigger from caller-provided
 *   context, evaluate it, enqueue the resulting plan, and record the
 *   plan's cooldown if any.
 *
 * Returns `true` if a new plan was enqueued, `false` otherwise.
 */
export function tryEnqueueMentorEntry(ctx: MentorEntryContext): boolean {
  const store = useMentorStore.getState();
  if (selectIsOverlayOpen(store)) return false;
  if (store.dialogQueue.length > 0) return false;

  const { trigger, payload } = resolveEntry(ctx);
  const plan = evaluateTrigger(trigger, payload);
  if (!plan) return false;

  store.enqueue(plan);
  if (plan.cooldownMs && plan.cooldownMs > 0) {
    store.recordCooldown(trigger, plan.enqueuedAt);
  }
  return true;
}
