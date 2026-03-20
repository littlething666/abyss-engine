import { z } from 'zod';

export const telemetryVersionSchema = z.literal('v1');

export const TelemetryEventTypeSchema = z.enum([
  'study_session_start',
  'study_card_reviewed',
  'study_undo',
  'study_redo',
  'study_session_complete',
  'attunement_ritual_submitted',
  'attunement_cooldown_checked',
  'crystal_unlocked',
  'xp_gained',
  'level_up',
  'study_panel_tab_switched',
  'modal_opened',
  'performance_frame_time',
]);

export type TelemetryEventType = z.infer<typeof TelemetryEventTypeSchema>;

export const StudyCardReviewedPayloadSchema = z.object({
  cardId: z.string(),
  rating: z.number().int().min(1).max(4),
  isCorrect: z.boolean(),
  difficulty: z.number().min(1).max(4),
  timeTakenMs: z.number().nonnegative(),
  buffMultiplier: z.number().positive(),
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
  topicId: z.string(),
});
export type StudySessionStartPayload = z.infer<typeof StudySessionStartPayloadSchema>;

export const StudyUndoPayloadSchema = z.object({
  topicId: z.string(),
  sessionId: z.string(),
  undoCount: z.number().int().min(0),
  redoCount: z.number().int().min(0),
});
export type StudyUndoPayload = z.infer<typeof StudyUndoPayloadSchema>;

export const StudyRedoPayloadSchema = z.object({
  topicId: z.string(),
  sessionId: z.string(),
  undoCount: z.number().int().min(0),
  redoCount: z.number().int().min(0),
});
export type StudyRedoPayload = z.infer<typeof StudyRedoPayloadSchema>;

export const StudySessionCompletePayloadSchema = z.object({
  sessionId: z.string(),
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
  topicId: z.string(),
  sessionId: z.string(),
  cardId: z.string(),
});
export type XpGainedPayload = z.infer<typeof XpGainedPayloadSchema>;

export const LevelUpPayloadSchema = z.object({
  topicId: z.string(),
  fromLevel: z.number().int().nonnegative(),
  toLevel: z.number().int().nonnegative(),
});
export type LevelUpPayload = z.infer<typeof LevelUpPayloadSchema>;

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
});
export type ModalOpenedPayload = z.infer<typeof ModalOpenedPayloadSchema>;

export const PerformanceFrameTimePayloadSchema = z.object({
  frameMs: z.number().nonnegative(),
  sampleSize: z.number().int().positive(),
});
export type PerformanceFrameTimePayload = z.infer<typeof PerformanceFrameTimePayloadSchema>;

export const TelemetryEventPayloadSchema = z.object({
  id: z.string().uuid(),
  version: telemetryVersionSchema,
  timestamp: z.number(),
  sessionId: z.string().nullable(),
  topicId: z.string().nullable(),
  type: TelemetryEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});

export type TelemetryEvent = z.infer<typeof TelemetryEventPayloadSchema>;

export const TelemetryEventMap: Record<TelemetryEventType, z.ZodSchema<unknown>> = {
  study_session_start: StudySessionStartPayloadSchema,
  study_card_reviewed: StudyCardReviewedPayloadSchema,
  study_undo: StudyUndoPayloadSchema,
  study_redo: StudyRedoPayloadSchema,
  study_session_complete: StudySessionCompletePayloadSchema,
  attunement_ritual_submitted: AttunementRitualSubmittedPayloadSchema,
  attunement_cooldown_checked: AttunementCooldownPayloadSchema,
  crystal_unlocked: CrystalUnlockedPayloadSchema,
  xp_gained: XpGainedPayloadSchema,
  level_up: LevelUpPayloadSchema,
  study_panel_tab_switched: StudyPanelTabSwitchedPayloadSchema,
  modal_opened: ModalOpenedPayloadSchema,
  performance_frame_time: PerformanceFrameTimePayloadSchema,
};
