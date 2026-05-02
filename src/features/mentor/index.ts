export type {
  DialogPlan,
  MentorChoice,
  MentorEffect,
  MentorMessage,
  MentorMood,
  MentorTriggerId,
  MentorTriggerPayload,
  MentorVoiceId,
} from './mentorTypes';
export { MENTOR_TRIGGER_IDS } from './mentorTypes';
export { MENTOR_VOICE_ID, MENTOR_VOICE_TONE } from './mentorVoice';
export {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  mentorStore,
  migrateMentorState,
  selectCurrentDialog,
  selectIsOverlayOpen,
  useMentorStore,
} from './mentorStore';
export type {
  MentorActions,
  MentorEphemeralState,
  MentorPersistedState,
  MentorState,
  VariantCursor,
} from './mentorStore';
export {
  getMentorLine,
  getOnboardingPreFirstSubjectGreet,
  getSubjectGenerationStartedStageLine,
  mentorLines,
} from './mentorLines';
export type { LineCatalog } from './mentorLines';
export { evaluateTrigger, interpolate, TRIGGER_SPECS } from './dialogRuleEngine';
export type { EvaluateContext } from './dialogRuleEngine';
export { useMentorSpeech } from './useMentorSpeech';
export type { UseMentorSpeechResult } from './useMentorSpeech';
export { bootstrapMentor, __resetMentorBootstrapForTests } from './mentorBootstrap';
export { handleMentorTrigger } from './mentorTriggers';
export { tryEnqueueMentorEntry } from './mentorEntryPoint';
export { resolveMentorEntry } from './mentorEntryResolver';
export type {
  MentorFailureEntryPayload,
  MentorEntryContext,
  MentorEntryDecision,
} from './mentorEntryResolver';
export {
  MENTOR_GENERATION_FAILURE_TRIGGER_IDS,
  isMentorGenerationFailureTrigger,
} from './mentorFailureTriggers';
export type { MentorGenerationFailureTriggerId } from './mentorFailureTriggers';
export {
  useMentorOverlayController,
  requestAmbientAdvance,
} from './overlayController';
export type {
  AmbientAdvanceOutcome,
  MentorOverlayHandlers,
  MentorOverlayStep,
} from './overlayController';
export {
  MENTOR_ICON_NAMES,
  isMentorIconName,
} from './mentorIconAllowlist';
export {
  ALERT_COLOR,
  MOOD_COLOR,
  MOOD_TO_ICON,
  PHASE_TO_ICON,
  selectMentorBubbleVisual,
} from './mentorBubbleVisual';
export type {
  MentorBubbleVisual,
  SelectMentorBubbleVisualInput,
} from './mentorBubbleVisual';
