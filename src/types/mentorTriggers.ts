/**
 * Canonical mentor trigger identifiers — single source of truth for
 * dialog plans, telemetry payloads, and event-bus mentor side-effects.
 */

export const MENTOR_TRIGGER_IDS = [
  'onboarding:pre-first-subject',
  'onboarding:subject-unlock-first-crystal',
  'session:completed',
  'crystal:leveled',
  'crystal-trial:available-for-player',
  'subject:generation-started',
  'subject:generated',
  'subject:generation-failed',
  'mentor-bubble:clicked',
  'topic-content:generation-failed',
  'topic-content:generation-ready',
  'topic-expansion:generation-failed',
  'crystal-trial:generation-failed',
  'content-generation:retry-failed',
] as const;

export type MentorTriggerId = (typeof MENTOR_TRIGGER_IDS)[number];
