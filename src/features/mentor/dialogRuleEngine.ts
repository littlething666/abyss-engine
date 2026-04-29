import {
  getMentorLine,
  getOnboardingPreFirstSubjectGreet,
  getSubjectGenerationStartedStageLine,
} from './mentorLines';
import { useMentorStore, type MentorState } from './mentorStore';
import { MENTOR_VOICE_ID } from './mentorVoice';
import type {
  DialogPlan,
  MentorMessage,
  MentorTriggerId,
  MentorTriggerPayload,
} from './mentorTypes';

export interface EvaluateContext {
  nowMs?: number;
  rng?: () => number;
}

interface TriggerSpec {
  trigger: MentorTriggerId;
  priority: number;
  cooldownMs?: number;
  oneShot?: boolean;
  /** Optional gate beyond cooldown / oneShot. */
  isApplicable?: (snapshot: MentorState, payload: MentorTriggerPayload) => boolean;
  /**
   * Optional override that bypasses the default `getMentorLine` lookup.
   * Used for triggers whose copy depends on more than the trigger id and
   * locale (e.g. stage-specific or named/unnamed onboarding greet copy).
   * Returned strings still flow through `interpolate(...)`.
   */
  resolveVariantText?: (
    payload: MentorTriggerPayload,
    snapshot: MentorState,
    variantIndex: number,
  ) => string;
  buildMessages: (
    variantText: string,
    payload: MentorTriggerPayload,
    snapshot: MentorState,
  ) => MentorMessage[];
}

export const TRIGGER_SPECS: Record<MentorTriggerId, TriggerSpec> = {
  // Pre-first-subject onboarding. Replaces the prior `onboarding.welcome` +
  // `onboarding.first_subject` pair. Single canonical trigger gated solely
  // on `firstSubjectGenerationEnqueuedAt === null`, so:
  //   - first-time players get the full greet → name input → CTA flow
  //   - returning players who saved a name but never planted a subject get
  //     the named greet → CTA flow (no name prompt, distinct copy)
  //   - dismissing the dialog does NOT lock the trigger out; the gate stays
  //     open until a subject generation actually enqueues.
  'onboarding.pre_first_subject': {
    trigger: 'onboarding.pre_first_subject',
    priority: 100,
    isApplicable: (s) => s.firstSubjectGenerationEnqueuedAt === null,
    resolveVariantText: (_payload, snapshot, variantIndex) =>
      getOnboardingPreFirstSubjectGreet(
        'en',
        MENTOR_VOICE_ID,
        snapshot.playerName !== null ? 'named' : 'unnamed',
        variantIndex,
      ),
    buildMessages: (greetText, _payload, snapshot) => {
      const messages: MentorMessage[] = [
        { id: 'onboarding-greet', text: greetText, mood: 'cheer' },
      ];
      if (snapshot.playerName === null) {
        messages.push({
          id: 'onboarding-name',
          text: 'Before I file your paperwork, what should I call you?',
          input: { kind: 'name', placeholder: 'Type a name', maxLen: 24 },
          choices: [{ id: 'skip-name', label: 'Skip', next: 'onboarding-cta' }],
        });
      }
      messages.push({
        id: 'onboarding-cta',
        text:
          snapshot.playerName !== null
            ? `Where to first, ${snapshot.playerName}?`
            : 'Where to first?',
        choices: [
          {
            id: 'create-subject',
            label: 'Create my first subject',
            effect: { kind: 'open_discovery' },
            next: 'end',
          },
          { id: 'maybe-later', label: 'Maybe later', next: 'end' },
        ],
      });
      return messages;
    },
  },
  'session.completed': {
    trigger: 'session.completed',
    priority: 60,
    buildMessages: (text) => [{ id: 'session-completed', text, mood: 'celebrate' }],
  },
  'crystal.leveled': {
    trigger: 'crystal.leveled',
    priority: 70,
    cooldownMs: 60_000,
    buildMessages: (text) => [{ id: 'crystal-leveled', text, mood: 'celebrate' }],
  },
  'crystal.trial.awaiting': {
    trigger: 'crystal.trial.awaiting',
    priority: 75,
    buildMessages: (text) => [{ id: 'trial-awaiting', text, mood: 'hint' }],
  },
  // Generation-started dedupes against current/queued plans of the same
  // trigger so contextual entry from the bubble (which the engine fires
  // with a stage) does not stack on top of the eventBus auto-fire.
  'subject.generation.started': {
    trigger: 'subject.generation.started',
    priority: 72,
    isApplicable: (s) =>
      s.currentDialog?.trigger !== 'subject.generation.started' &&
      !s.dialogQueue.some((plan) => plan.trigger === 'subject.generation.started'),
    resolveVariantText: (payload, _snapshot, variantIndex) => {
      if (payload.stage === 'topics' || payload.stage === 'edges') {
        return getSubjectGenerationStartedStageLine(
          'en',
          MENTOR_VOICE_ID,
          payload.stage,
          variantIndex,
        );
      }
      return getMentorLine('en', 'subject.generation.started', MENTOR_VOICE_ID, variantIndex);
    },
    buildMessages: (text) => [{ id: 'subject-generation-started', text, mood: 'hint' }],
  },
  'subject.generated': {
    trigger: 'subject.generated',
    priority: 68,
    buildMessages: (text) => [{ id: 'subject-generated', text, mood: 'celebrate' }],
  },
  'subject.generation.failed': {
    trigger: 'subject.generation.failed',
    priority: 82,
    buildMessages: (text) => [
      {
        id: 'subject-generation-failed',
        text,
        mood: 'concern',
        choices: [
          {
            id: 'open-generation-hud',
            label: 'Open generation HUD',
            effect: { kind: 'open_generation_hud' },
            next: 'end',
          },
          { id: 'dismiss', label: 'Dismiss', next: 'end' },
        ],
      },
    ],
  },
  'mentor.bubble.click': {
    trigger: 'mentor.bubble.click',
    priority: 90,
    buildMessages: (text) => [{ id: 'bubble-click', text, mood: 'tease' }],
  },
};

const VARIANT_COUNTS: Record<MentorTriggerId, number> = {
  'onboarding.pre_first_subject': 1,
  'session.completed': 3,
  'crystal.leveled': 3,
  'crystal.trial.awaiting': 2,
  'subject.generation.started': 3,
  'subject.generated': 4,
  'subject.generation.failed': 4,
  'mentor.bubble.click': 3,
};

const INTERPOLATION_PATTERN = /\{(\w+)\}/g;

export function interpolate(
  template: string,
  values: Record<string, unknown>,
): string {
  return template.replace(INTERPOLATION_PATTERN, (match, key: string) => {
    if (key in values) {
      const v = values[key];
      if (v === null || v === undefined) return '';
      if (
        key === 'correctRate' &&
        typeof v === 'number' &&
        Number.isFinite(v) &&
        v >= 0 &&
        v <= 1
      ) {
        return `${Math.round(v * 100)}%`;
      }
      return String(v);
    }
    return match;
  });
}

/**
 * Evaluate a trigger against the current mentor store snapshot. Returns a
 * fully-built `DialogPlan` ready for enqueue, or `null` if the trigger is
 * suppressed by oneShot / cooldown / `isApplicable`.
 *
 * The mentor store's variant cursor is advanced as a side effect when a
 * plan is produced.
 */
export function evaluateTrigger(
  trigger: MentorTriggerId,
  payload: MentorTriggerPayload = {},
  ctx: EvaluateContext = {},
): DialogPlan | null {
  const spec = TRIGGER_SPECS[trigger];
  const nowMs = ctx.nowMs ?? Date.now();
  const rng = ctx.rng ?? Math.random;

  const store = useMentorStore.getState();

  if (spec.oneShot && store.seenTriggers.includes(trigger)) return null;

  if (spec.cooldownMs && spec.cooldownMs > 0) {
    const lastFired = store.cooldowns[trigger];
    if (lastFired !== undefined && nowMs - lastFired < spec.cooldownMs) return null;
  }

  if (spec.isApplicable && !spec.isApplicable(store, payload)) return null;

  const variantCount = VARIANT_COUNTS[trigger];
  const variantIndex = store.nextVariantIndex(trigger, variantCount, rng);

  const rawText = spec.resolveVariantText
    ? spec.resolveVariantText(payload, store, variantIndex)
    : getMentorLine(store.mentorLocale, trigger, MENTOR_VOICE_ID, variantIndex);
  const variantText = interpolate(rawText, {
    ...payload,
    name: store.playerName ?? 'test subject',
  });

  return {
    id: `${trigger}#${nowMs}#${variantIndex}`,
    trigger,
    priority: spec.priority,
    enqueuedAt: nowMs,
    messages: spec.buildMessages(variantText, payload, store),
    source: 'canned',
    voiceId: MENTOR_VOICE_ID,
    cooldownMs: spec.cooldownMs,
    oneShot: spec.oneShot,
  };
}
