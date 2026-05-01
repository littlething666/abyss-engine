import type { MentorTriggerId } from '@/types/mentorTriggers';

export const MENTOR_GENERATION_FAILURE_TRIGGER_IDS = [
  'subject:generation-failed',
  'topic-content:generation-failed',
  'topic-expansion:generation-failed',
  'crystal-trial:generation-failed',
  'content-generation:retry-failed',
] as const;

export type MentorGenerationFailureTriggerId =
  (typeof MENTOR_GENERATION_FAILURE_TRIGGER_IDS)[number];

export function isMentorGenerationFailureTrigger(
  id: MentorTriggerId,
): id is MentorGenerationFailureTriggerId {
  return (MENTOR_GENERATION_FAILURE_TRIGGER_IDS as readonly MentorTriggerId[]).includes(id);
}
