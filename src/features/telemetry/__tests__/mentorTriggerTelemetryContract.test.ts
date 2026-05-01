import { describe, expect, it } from 'vitest';

import { MENTOR_TRIGGER_IDS } from '@/types/mentorTriggers';

import {
  MentorChoiceSelectedPayloadSchema,
  MentorDialogCompletedPayloadSchema,
  MentorDialogShownPayloadSchema,
  MentorDialogSkippedPayloadSchema,
  MentorOnboardingCompletedPayloadSchema,
} from '@/features/telemetry/types';

describe('mentor telemetry contract vs MENTOR_TRIGGER_IDS', () => {
  const base = {
    source: 'canned' as const,
    voiceId: 'witty-sarcastic' as const,
  };

  it.each(MENTOR_TRIGGER_IDS.map((triggerId) => [triggerId]))(
    'mentor-dialog:shown accepts trigger %s',
    (triggerId) => {
      const parsed = MentorDialogShownPayloadSchema.safeParse({
        ...base,
        triggerId,
        planId: 'plan-1',
      });
      expect(parsed.success).toBe(true);
    },
  );

  it.each(MENTOR_TRIGGER_IDS.map((triggerId) => [triggerId]))(
    'mentor-dialog:skipped accepts trigger %s',
    (triggerId) => {
      const parsed = MentorDialogSkippedPayloadSchema.safeParse({
        ...base,
        triggerId,
        charsRevealed: 0,
        totalChars: 10,
      });
      expect(parsed.success).toBe(true);
    },
  );

  it.each(MENTOR_TRIGGER_IDS.map((triggerId) => [triggerId]))(
    'mentor-dialog:completed accepts trigger %s',
    (triggerId) => {
      const parsed = MentorDialogCompletedPayloadSchema.safeParse({
        ...base,
        triggerId,
        planId: 'plan-1',
        durationMs: 0,
        outcome: 'closed',
      });
      expect(parsed.success).toBe(true);
    },
  );

  it.each(MENTOR_TRIGGER_IDS.map((triggerId) => [triggerId]))(
    'mentor-choice:selected accepts trigger %s',
    (triggerId) => {
      const parsed = MentorChoiceSelectedPayloadSchema.safeParse({
        ...base,
        triggerId,
        planId: 'plan-1',
        choiceId: 'c1',
      });
      expect(parsed.success).toBe(true);
    },
  );

  it.each(MENTOR_TRIGGER_IDS.map((triggerId) => [triggerId]))(
    'mentor-onboarding:completed accepts trigger %s',
    (triggerId) => {
      const parsed = MentorOnboardingCompletedPayloadSchema.safeParse({
        ...base,
        triggerId,
        nameLength: 4,
      });
      expect(parsed.success).toBe(true);
    },
  );
});
