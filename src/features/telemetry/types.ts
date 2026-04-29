import { z } from 'zod';

export const telemetryVersionSchema = z.literal('v1');

export const TelemetryEventTypeSchema = z.enum([
  'study-session:started',
  'study-card:reviewed',
  'study-panel:undo-applied',
  'study-panel:redo-applied',
  'study-session:completed',
  'attunement-ritual:submitted',
  'attunement-cooldown:checked',
  'crystal:unlocked',
  'xp:gained',
  'crystal:leveled',
  'study-panel:tab-switched',
  'modal:opened',
  'performance:frame-measured',
  'crystal-trial:pregeneration-started',
  'crystal-trial:completed',
  'subject-graph:generated',
  'subject-graph:generation-failed',
  'subject-graph:validation-failed',
  'mentor-dialog:shown',
  'mentor-dialog:skipped',
  'mentor-dialog:completed',
  'mentor-choice:selected',
  'mentor-onboarding:completed',
  'mentor:first-subject-generation-enqueued',
]);

export type TelemetryEventType = z.infer<typeof TelemetryEventTypeSchema>;

export const StudyCardReviewedPayloadSchema = z.object({
  cardId: z.string(),
  rating: z.number().int().min(1).max(4),
  isCorrect: z.boolean(),
  difficulty: z.number().min(1).max(4),
  timeTakenMs: z.number().nonnegative(),
  buffMultiplier: z.number().positive(),
  coarseChoice: z.enum(['forgot', 'recalled']).optional(),
  hintUsed: z.boolean().optional(),
  appliedBucket: z.enum(['fast', 'normal', 'slow', 'forgot']).optional(),
});
export type StudyCardReviewedPayload = z.infer<typeof StudyCardReviewedPayloadSchema>;

export const AttunementRitualSubmittedPayloadSchema = z.object({
  harmonyScore: z.number().min(0).max(100),
  readinessBucket: z.enum(['low', 'medium', 'high']),
  checklistKeys: z.array(z.string()),
  buffsGranted: z.array(z.string()),
});
export type AttunementRitualSubmittedPayload = z.infer<
  typeof AttunementRitualSubmittedPayloadSchema
>;

export const StudySessionStartPayloadSchema = z.object({
  sessionId: z.string(),
  subjectId: z.string(),
  topicId: z.string(),
});
export type StudySessionStartPayload = z.infer<typeof StudySessionStartPayloadSchema>;

export const StudyUndoPayloadSchema = z.object({
  subjectId: z.string(),
  topicId: z.string(),
  sessionId: z.string(),
  undoCount: z.number().int().min(0),
  redoCount: z.number().int().min(0),
});
export type StudyUndoPayload = z.infer<typeof StudyUndoPayloadSchema>;

export const StudyRedoPayloadSchema = z.object({
  subjectId: z.string(),
  topicId: z.string(),
  sessionId: z.string(),
  undoCount: z.number().int().min(0),
  redoCount: z.number().int().min(0),
});
export type StudyRedoPayload = z.infer<typeof StudyRedoPayloadSchema>;

export const StudySessionCompletePayloadSchema = z.object({
  sessionId: z.string(),
  subjectId: z.string(),
  topicId: z.string(),
  totalAttempts: z.number().int().min(0),
  correctRate: z.number().min(0).max(1),
  sessionDurationMs: z.number().nonnegative(),
});
export type StudySessionCompletePayload = z.infer<typeof StudySessionCompletePayloadSchema>;

export const AttunementCooldownPayloadSchema = z.object({
  topicId: z.string(),
  cooldownRemainingMs: z.number().min(0),
});
export type AttunementCooldownPayload = z.infer<typeof AttunementCooldownPayloadSchema>;

export const CrystalUnlockedPayloadSchema = z.object({
  topicId: z.string(),
  topicLevel: z.number().min(1),
  xPGained: z.number().nonnegative(),
});
export type CrystalUnlockedPayload = z.infer<typeof CrystalUnlockedPayloadSchema>;

export const XpGainedPayloadSchema = z.object({
  amount: z.number(),
  subjectId: z.string(),
  topicId: z.string(),
  sessionId: z.string(),
  cardId: z.string(),
});
export type XpGainedPayload = z.infer<typeof XpGainedPayloadSchema>;

export const LevelUpPayloadSchema = z.object({
  subjectId: z.string(),
  topicId: z.string(),
  fromLevel: z.number().int().nonnegative(),
  toLevel: z.number().int().nonnegative(),
});
export type LevelUpPayload = z.infer<typeof LevelUpPayloadSchema>;

export const CrystalTrialPregenerationStartedPayloadSchema = z.object({
  subjectId: z.string(),
  topicId: z.string(),
  targetLevel: z.number().nonnegative(),
});
export type CrystalTrialPregenerationStartedPayload = z.infer<
  typeof CrystalTrialPregenerationStartedPayloadSchema
>;

export const CrystalTrialCompletedPayloadSchema = z.object({
  subjectId: z.string(),
  topicId: z.string(),
  targetLevel: z.number().nonnegative(),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  trialId: z.string(),
});
export type CrystalTrialCompletedPayload = z.infer<typeof CrystalTrialCompletedPayloadSchema>;

export const StudyPanelTabSwitchedPayloadSchema = z.object({
  topicId: z.string().nullable(),
  sessionId: z.string().nullable(),
  tab: z.enum(['study', 'theory', 'system_prompt', 'settings']),
  fromTab: z.string().optional(),
  toTab: z.string().optional(),
});
export type StudyPanelTabSwitchedPayload = z.infer<
  typeof StudyPanelTabSwitchedPayloadSchema
>;

export const ModalOpenedPayloadSchema = z.object({
  modalId: z.string(),
  action: z.literal('opened'),
  sessionId: z.string().nullable(),
  topicId: z.string().nullable(),
  subjectId: z.string().nullable(),
});
export type ModalOpenedPayload = z.infer<typeof ModalOpenedPayloadSchema>;

export const PerformanceFrameTimePayloadSchema = z.object({
  frameMs: z.number().nonnegative(),
  sampleSize: z.number().int().positive(),
});
export type PerformanceFrameTimePayload = z.infer<typeof PerformanceFrameTimePayloadSchema>;

const prereqEdgesCorrectionLogSchema = z.object({
  removed: z.array(
    z.object({ topicId: z.string(), prereqId: z.string(), reason: z.string() }),
  ),
  added: z.array(
    z.object({
      topicId: z.string(),
      prereqId: z.string(),
      kind: z.enum(['filler-tier1', 'filler-tier2']),
    }),
  ),
});

export const SubjectGraphGeneratedPayloadSchema = z.object({
  subjectId: z.string(),
  boundModel: z.string(),
  stageADurationMs: z.number().nonnegative(),
  stageBDurationMs: z.number().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  topicCount: z.number().int().nonnegative(),
  prereqEdgesCorrectionApplied: z.boolean().optional(),
  prereqEdgesCorrectionRemovedCount: z.number().int().nonnegative().optional(),
  prereqEdgesCorrectionAddedCount: z.number().int().nonnegative().optional(),
  prereqEdgesCorrection: prereqEdgesCorrectionLogSchema.optional(),
});
export type SubjectGraphGeneratedPayload = z.infer<typeof SubjectGraphGeneratedPayloadSchema>;

export const SubjectGraphGenerationFailedPayloadSchema = z.object({
  subjectId: z.string(),
  subjectName: z.string(),
  pipelineId: z.string(),
  stage: z.enum(['topics', 'edges']),
  error: z.string(),
});
export type SubjectGraphGenerationFailedPayload = z.infer<
  typeof SubjectGraphGenerationFailedPayloadSchema
>;

export const SubjectGraphValidationFailedPayloadSchema = z.object({
  subjectId: z.string(),
  stage: z.enum(['topics', 'edges']),
  error: z.string(),
  offendingTopicIds: z.array(z.string()),
  boundModel: z.string(),
  retryCount: z.number().int().nonnegative(),
  stageDurationMs: z.number().nonnegative(),
  hasLatticeSnapshot: z.boolean(),
});
export type SubjectGraphValidationFailedPayload = z.infer<typeof SubjectGraphValidationFailedPayloadSchema>;

// === Mentor v1 (canned-only) ===
// Plan source of truth: "Witty Mentor — Wisdom Altar Dialog System".
// Every mentor event carries source: 'canned' and voiceId: 'witty-sarcastic'.
// `onboarding.welcome` + `onboarding.first_subject` were collapsed into the
// single canonical `onboarding:pre-first-subject` trigger; the rule engine
// gates only on firstSubjectGenerationEnqueuedAt === null.
//
// `crystal.trial.awaiting` was renamed to
// `crystal-trial:available-for-player` so the trigger expresses the
// player-facing predicate (trial is prepared AND XP is at the band cap),
// not the raw store status.
//
// `onboarding:subject-unlock-first-crystal` is the post-curriculum
// contextual entry trigger — fires once per newly generated subject whose
// topics are still fully locked, opening the Discovery modal scoped to
// that subject.
export const MentorTriggerIdSchema = z.enum([
  'onboarding:pre-first-subject',
  'onboarding:subject-unlock-first-crystal',
  'session:completed',
  'crystal:leveled',
  'crystal-trial:available-for-player',
  'subject:generation-started',
  'subject:generated',
  'subject:generation-failed',
  'mentor-bubble:clicked',
]);
export type MentorTriggerIdLiteral = z.infer<typeof MentorTriggerIdSchema>;

const MentorEventBaseSchema = z.object({
  triggerId: MentorTriggerIdSchema,
  source: z.literal('canned'),
  voiceId: z.literal('witty-sarcastic'),
});

export const MentorDialogShownPayloadSchema = MentorEventBaseSchema.extend({
  planId: z.string(),
});
export type MentorDialogShownPayload = z.infer<typeof MentorDialogShownPayloadSchema>;

export const MentorDialogSkippedPayloadSchema = MentorEventBaseSchema.extend({
  charsRevealed: z.number().int().nonnegative(),
  totalChars: z.number().int().nonnegative(),
});
export type MentorDialogSkippedPayload = z.infer<typeof MentorDialogSkippedPayloadSchema>;

export const MentorDialogCompletedPayloadSchema = MentorEventBaseSchema.extend({
  planId: z.string(),
  durationMs: z.number().nonnegative(),
  // 'ambient' covers the Workstream A visual-novel advance path — a tap
  // outside any interactive element (Canvas miss, dialog ‘<p>’ tap, floor
  // deselect plane) that completes typing or advances to the next message.
  outcome: z.enum(['auto-advance', 'choice', 'closed', 'ambient']),
  choiceId: z.string().optional(),
});
export type MentorDialogCompletedPayload = z.infer<typeof MentorDialogCompletedPayloadSchema>;

export const MentorChoiceSelectedPayloadSchema = MentorEventBaseSchema.extend({
  planId: z.string(),
  choiceId: z.string(),
});
export type MentorChoiceSelectedPayload = z.infer<typeof MentorChoiceSelectedPayloadSchema>;

export const MentorOnboardingCompletedPayloadSchema = MentorEventBaseSchema.extend({
  nameLength: z.number().int().nonnegative(),
});
export type MentorOnboardingCompletedPayload = z.infer<typeof MentorOnboardingCompletedPayloadSchema>;

export const MentorFirstSubjectGenerationEnqueuedPayloadSchema = MentorEventBaseSchema;
export type MentorFirstSubjectGenerationEnqueuedPayload = z.infer<
  typeof MentorFirstSubjectGenerationEnqueuedPayloadSchema
>;

export const TelemetryEventPayloadSchema = z.object({
  id: z.string().uuid(),
  version: telemetryVersionSchema,
  timestamp: z.number(),
  sessionId: z.string().nullable(),
  topicId: z.string().nullable(),
  subjectId: z.string().nullable().optional().default(null),
  type: TelemetryEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});

export type TelemetryEvent = z.infer<typeof TelemetryEventPayloadSchema>;

export const TelemetryEventMap: Record<TelemetryEventType, z.ZodSchema<unknown>> = {
  'study-session:started': StudySessionStartPayloadSchema,
  'study-card:reviewed': StudyCardReviewedPayloadSchema,
  'study-panel:undo-applied': StudyUndoPayloadSchema,
  'study-panel:redo-applied': StudyRedoPayloadSchema,
  'study-session:completed': StudySessionCompletePayloadSchema,
  'attunement-ritual:submitted': AttunementRitualSubmittedPayloadSchema,
  'attunement-cooldown:checked': AttunementCooldownPayloadSchema,
  'crystal:unlocked': CrystalUnlockedPayloadSchema,
  'xp:gained': XpGainedPayloadSchema,
  'crystal:leveled': LevelUpPayloadSchema,
  'crystal-trial:pregeneration-started': CrystalTrialPregenerationStartedPayloadSchema,
  'crystal-trial:completed': CrystalTrialCompletedPayloadSchema,
  'study-panel:tab-switched': StudyPanelTabSwitchedPayloadSchema,
  'modal:opened': ModalOpenedPayloadSchema,
  'performance:frame-measured': PerformanceFrameTimePayloadSchema,
  'subject-graph:generated': SubjectGraphGeneratedPayloadSchema,
  'subject-graph:generation-failed': SubjectGraphGenerationFailedPayloadSchema,
  'subject-graph:validation-failed': SubjectGraphValidationFailedPayloadSchema,
  'mentor-dialog:shown': MentorDialogShownPayloadSchema,
  'mentor-dialog:skipped': MentorDialogSkippedPayloadSchema,
  'mentor-dialog:completed': MentorDialogCompletedPayloadSchema,
  'mentor-choice:selected': MentorChoiceSelectedPayloadSchema,
  'mentor-onboarding:completed': MentorOnboardingCompletedPayloadSchema,
  'mentor:first-subject-generation-enqueued': MentorFirstSubjectGenerationEnqueuedPayloadSchema,
};
