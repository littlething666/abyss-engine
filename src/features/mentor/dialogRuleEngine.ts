import {
  getMentorLine,
  getSubjectGenerationStartedVariant,
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
  /** Override Date.now() for deterministic tests. */
  nowMs?: number;
  /** Variant RNG; defaults to Math.random. */
  rng?: () => number;
}

interface TriggerSpec {
  trigger: MentorTriggerId;
  priority: number;
  cooldownMs?: number;
  oneShot?: boolean;
  isApplicable?: (snapshot: MentorState, payload: MentorTriggerPayload) => boolean;
  buildMessages: (
    variantText: string,
    payload: MentorTriggerPayload,
    snapshot: MentorState,
  ) => MentorMessage[];
}

/**
 * Build the destination "where to first?" message for the pre-first-subject
 * onboarding flow. Used both as the standalone single-message dialog when
 * `playerName !== null` and as the final message in the welcome chain when
 * the player still needs to set a name.
 */
function buildPreFirstSubjectDestinationMessage(variantText: string): MentorMessage {
  return {
    id: 'pre-first-subject-destination',
    text: variantText,
    choices: [
      {
        id: 'create-subject',
        label: 'Create my first subject',
        effect: { kind: 'open_discovery' },
        next: 'end',
      },
      { id: 'maybe-later', label: 'Maybe later', next: 'end' },
    ],
  };
}

export const TRIGGER_SPECS: Record<MentorTriggerId, TriggerSpec> = {
  'onboarding.pre_first_subject': {
    trigger: 'onboarding.pre_first_subject',
    priority: 100,
    // Intentionally NOT oneShot. The single gate for pre-first-subject
    // onboarding is `firstSubjectGenerationEnqueuedAt === null`, which lets
    // bootstrap nudge the player on each fresh app session AND lets the
    // bubble / Quick Action resolver re-surface the dialog after dismiss
    // until the player actually starts generating their first subject.
    // `seenTriggers` is consequently irrelevant for this onboarding path —
    // markSeen still fires from the overlay on each open, but no rule reads
    // it for this trigger.
    isApplicable: (s) => s.firstSubjectGenerationEnqueuedAt === null,
    buildMessages: (variantText, _payload, snapshot) => {
      // State-aware composition: if a returning player already has a saved
      // name, skip the greet + name prompt and go directly to the
      // destination CTA. Without a name, run the original 3-message welcome
      // chain (greet → name input → destination).
      if (snapshot.playerName !== null) {
        return [buildPreFirstSubjectDestinationMessage(variantText)];
      }
      return [
        {
          id: 'pre-first-subject-greet',
          text:
            "Oh. A new test subject. Hello. I'm contractually required to be " +
            "encouraging. Let's get this over with — pleasantly.",
        },
        {
          id: 'pre-first-subject-name',
          text: 'Before I file your paperwork, what should I call you?',
          input: { kind: 'name', placeholder: 'Type a name', maxLen: 24 },
          choices: [
            { id: 'skip-name', label: 'Skip', next: 'pre-first-subject-destination' },
          ],
        },
        buildPreFirstSubjectDestinationMessage(variantText),
      ];
    },
  },
  'session.completed': {
    trigger: 'session.completed',
    priority: 60,
    buildMessages: (variantText) => [
      { id: 'session-completed', text: variantText, autoAdvanceMs: 4500 },
    ],
  },
  'crystal.leveled': {
    trigger: 'crystal.leveled',
    priority: 70,
    cooldownMs: 60_000,
    buildMessages: (variantText) => [
      { id: 'crystal-leveled', text: variantText, autoAdvanceMs: 4500 },
    ],
  },
  'crystal.trial.awaiting': {
    trigger: 'crystal.trial.awaiting',
    priority: 75,
    buildMessages: (variantText) => [
      {
        id: 'trial-awaiting',
        text: variantText,
        choices: [{ id: 'ack', label: 'Got it', next: 'end' }],
      },
    ],
  },
  'subject.generation.started': {
    trigger: 'subject.generation.started',
    priority: 72,
    isApplicable: (s) =>
      s.currentDialog?.trigger !== 'subject.generation.started' &&
      !s.dialogQueue.some((plan) => plan.trigger === 'subject.generation.started'),
    buildMessages: (variantText) => [
      {
        id: 'subject-generation-started',
        text: variantText,
        mood: 'hint',
        choices: [
          {
            id: 'open-generation-hud',
            label: 'Open generation HUD',
            effect: { kind: 'open_generation_hud' },
          },
          { id: 'later', label: 'Later', next: 'end' },
        ],
      },
    ],
  },
  'subject.generated': {
    trigger: 'subject.generated',
    priority: 68,
    buildMessages: (variantText) => [
      {
        id: 'subject-generated',
        text: `${variantText} Open Discovery to unlock a topic.`,
        mood: 'celebrate',
        choices: [
          {
            id: 'open-discovery',
            label: 'Open Discovery',
            effect: { kind: 'open_discovery' },
          },
          { id: 'got-it', label: 'Got it', next: 'end' },
        ],
      },
    ],
  },
  'subject.generation.failed': {
    trigger: 'subject.generation.failed',
    priority: 82,
    buildMessages: (variantText) => [
      {
        id: 'subject-generation-failed',
        text: variantText,
        mood: 'concern',
        choices: [
          {
            id: 'open-generation-hud',
            label: 'Open generation HUD',
            effect: { kind: 'open_generation_hud' },
          },
          { id: 'ack', label: 'Later', next: 'end' },
        ],
      },
    ],
  },
  'mentor.bubble.click': {
    trigger: 'mentor.bubble.click',
    priority: 90,
    buildMessages: (variantText) => [
      {
        id: 'bubble-click',
        text: variantText,
        choices: [{ id: 'ack', label: 'Bye', next: 'end' }],
      },
    ],
  },
};

const VARIANT_COUNTS: Record<MentorTriggerId, number> = {
  'onboarding.pre_first_subject': 2,
  'session.completed': 3,
  'crystal.leveled': 3,
  'crystal.trial.awaiting': 2,
  'subject.generation.started': 3,
  'subject.generated': 4,
  'subject.generation.failed': 4,
  'mentor.bubble.click': 3,
};

/**
 * Evaluate a trigger event and return at most one DialogPlan, or null if
 * suppressed by cooldown / one-shot / applicability. Side effect: advances
 * the variant cursor in the mentor store. Callers are responsible for
 * enqueueing the returned plan.
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

  // Stage-aware variant for `subject.generation.started`: when the payload
  // carries a stage, route the copy through the private stage-bucket helper
  // so the public LineCatalog stays flat. Other triggers, and started
  // emissions without a stage, fall back to the generic catalog lookup.
  const rawVariant =
    trigger === 'subject.generation.started' && payload.stage
      ? getSubjectGenerationStartedVariant(payload.stage, MENTOR_VOICE_ID, variantIndex)
      : getMentorLine(store.mentorLocale, trigger, MENTOR_VOICE_ID, variantIndex);

  const variantText = interpolate(rawVariant, {
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

export function interpolate(
  template: string,
  vars: Record<string, string | number | undefined | null>,
): string {
  return template.replace(/\{(\w+)\}/g, (full, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) return full;
    if (typeof value === 'number') {
      if (key === 'correctRate' && value >= 0 && value <= 1) {
        return `${Math.round(value * 100)}%`;
      }
      return String(value);
    }
    return value;
  });
}
