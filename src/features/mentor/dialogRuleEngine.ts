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
  /**
   * Optional gate beyond cooldown / oneShot. The third argument is the
   * effective `nowMs` from `EvaluateContext`, exposed so per-trigger
   * cooldowns that are not modeled in the persisted store (e.g. the
   * `topic-content:generation-ready` (subjectId,topicId) cooldown) can be
   * enforced inline without a second clock read.
   */
  isApplicable?: (
    snapshot: MentorState,
    payload: MentorTriggerPayload,
    nowMs: number,
  ) => boolean;
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

// ---------------------------------------------------------------------------
// Topic-ready dedupe (Phase A)
//
// `topic-content:generation-ready` fires at most once per pipelineId and at
// most once every 4 hours per (subjectId, topicId). Both gates live in
// module scope: this is best-effort spam control, not a persisted milestone,
// and clearing it on full reload (tab close, hard refresh) is acceptable per
// the locked plan. If we later want stricter persistence we can lift this
// into the mentor store.
// ---------------------------------------------------------------------------
const TOPIC_READY_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const topicReadyFiredPipelineIds = new Set<string>();
const topicReadyLastFireMs = new Map<string, number>();

function topicReadyDedupeKey(subjectId: string, topicId: string): string {
  return `${subjectId}:${topicId}`;
}

/** Internal: only consumed by tests to isolate dedupe state between cases. */
export function __resetTopicReadyDedupeForTests(): void {
  topicReadyFiredPipelineIds.clear();
  topicReadyLastFireMs.clear();
}

export const TRIGGER_SPECS: Record<MentorTriggerId, TriggerSpec> = {
  // Pre-first-subject onboarding. Single canonical trigger gated solely on
  // `firstSubjectGenerationEnqueuedAt === null`, so first-time players get
  // the full greet → name input → CTA flow, returning players who saved a
  // name but never planted a subject get the named greet → CTA flow (no
  // name prompt, distinct copy), and dismissing the dialog does NOT lock
  // the trigger out — the gate stays open until a subject generation
  // actually enqueues.
  'onboarding:pre-first-subject': {
    trigger: 'onboarding:pre-first-subject',
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
  // Post-curriculum contextual entry. Fired by eventBusHandlers when a
  // subject's curriculum has just been generated and the player has not
  // unlocked any topic in that subject yet. The CTA opens Discovery scoped
  // to the newly generated subject (subjectId is forwarded into the
  // open_discovery effect). Dedupes against an already-active or queued
  // plan of the same trigger so a fast back-to-back regenerate does not
  // stack notifications.
  'onboarding:subject-unlock-first-crystal': {
    trigger: 'onboarding:subject-unlock-first-crystal',
    priority: 78,
    isApplicable: (s) =>
      s.currentDialog?.trigger !== 'onboarding:subject-unlock-first-crystal' &&
      !s.dialogQueue.some(
        (plan) => plan.trigger === 'onboarding:subject-unlock-first-crystal',
      ),
    buildMessages: (text, payload) => [
      {
        id: 'subject-unlock-first-crystal',
        text,
        mood: 'hint',
        choices: [
          {
            id: 'open-discovery',
            label: 'Open Discovery',
            effect: {
              kind: 'open_discovery',
              subjectId: payload.subjectId,
            },
            next: 'end',
          },
          { id: 'maybe-later', label: 'Maybe later', next: 'end' },
        ],
      },
    ],
  },
  'session:completed': {
    trigger: 'session:completed',
    priority: 60,
    buildMessages: (text) => [{ id: 'session-completed', text, mood: 'celebrate' }],
  },
  'crystal:leveled': {
    trigger: 'crystal:leveled',
    priority: 70,
    cooldownMs: 60_000,
    buildMessages: (text) => [{ id: 'crystal-leveled', text, mood: 'celebrate' }],
  },
  'crystal-trial:available-for-player': {
    trigger: 'crystal-trial:available-for-player',
    priority: 75,
    buildMessages: (text) => [{ id: 'trial-available-for-player', text, mood: 'hint' }],
  },
  // Generation-started dedupes against current/queued plans of the same
  // trigger so contextual entry from the bubble (which the engine fires
  // with a stage) does not stack on top of the eventBus auto-fire.
  'subject:generation-started': {
    trigger: 'subject:generation-started',
    priority: 72,
    isApplicable: (s) =>
      s.currentDialog?.trigger !== 'subject:generation-started' &&
      !s.dialogQueue.some((plan) => plan.trigger === 'subject:generation-started'),
    resolveVariantText: (payload, _snapshot, variantIndex) => {
      if (payload.stage === 'topics' || payload.stage === 'edges') {
        return getSubjectGenerationStartedStageLine(
          'en',
          MENTOR_VOICE_ID,
          payload.stage,
          variantIndex,
        );
      }
      return getMentorLine('en', 'subject:generation-started', MENTOR_VOICE_ID, variantIndex);
    },
    buildMessages: (text) => [{ id: 'subject-generation-started', text, mood: 'hint' }],
  },
  'subject:generated': {
    trigger: 'subject:generated',
    priority: 68,
    buildMessages: (text) => [{ id: 'subject-generated', text, mood: 'celebrate' }],
  },
  'subject:generation-failed': {
    trigger: 'subject:generation-failed',
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
  'mentor-bubble:clicked': {
    trigger: 'mentor-bubble:clicked',
    priority: 90,
    buildMessages: (text) => [{ id: 'bubble-click', text, mood: 'tease' }],
  },
  // -------------------------------------------------------------------
  // Phase A: content-generation terminal triggers. Priorities locked by
  // the Mentor Notifications plan (retry-failed=85, topic/expansion=84,
  // crystal-trial=83, topic-ready=40). Failures route to the generation
  // HUD; topic-ready routes to the topic study panel. Failures do NOT
  // dedupe — each genuine failure should surface, mirroring the existing
  // subject:generation-failed precedent. Topic-ready dedupes per
  // pipelineId + 4h per (subjectId, topicId).
  // -------------------------------------------------------------------
  'content-generation:retry-failed': {
    trigger: 'content-generation:retry-failed',
    priority: 85,
    buildMessages: (text) => [
      {
        id: 'content-generation-retry-failed',
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
  'topic-content:generation-failed': {
    trigger: 'topic-content:generation-failed',
    priority: 84,
    buildMessages: (text) => [
      {
        id: 'topic-content-generation-failed',
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
  'topic-expansion:generation-failed': {
    trigger: 'topic-expansion:generation-failed',
    priority: 84,
    buildMessages: (text) => [
      {
        id: 'topic-expansion-generation-failed',
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
  'crystal-trial:generation-failed': {
    trigger: 'crystal-trial:generation-failed',
    priority: 83,
    buildMessages: (text) => [
      {
        id: 'crystal-trial-generation-failed',
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
  'topic-content:generation-ready': {
    trigger: 'topic-content:generation-ready',
    priority: 40,
    isApplicable: (_s, payload, nowMs) => {
      const { subjectId, topicId, pipelineId } = payload;
      // The open_topic_study CTA needs both ids to route. Without them the
      // notification is meaningless, so suppress entirely.
      if (!subjectId || !topicId) return false;
      if (pipelineId && topicReadyFiredPipelineIds.has(pipelineId)) return false;
      const last = topicReadyLastFireMs.get(topicReadyDedupeKey(subjectId, topicId));
      if (last !== undefined && nowMs - last < TOPIC_READY_COOLDOWN_MS) return false;
      return true;
    },
    buildMessages: (text, payload) => {
      const subjectId = payload.subjectId ?? '';
      const topicId = payload.topicId ?? '';
      return [
        {
          id: 'topic-content-generation-ready',
          text,
          mood: 'hint',
          choices: [
            {
              id: 'open-topic-study',
              label: 'Open study',
              effect: { kind: 'open_topic_study', subjectId, topicId },
              next: 'end',
            },
            { id: 'dismiss', label: 'Maybe later', next: 'end' },
          ],
        },
      ];
    },
  },
};

const VARIANT_COUNTS: Record<MentorTriggerId, number> = {
  'onboarding:pre-first-subject': 1,
  'onboarding:subject-unlock-first-crystal': 3,
  'session:completed': 3,
  'crystal:leveled': 3,
  'crystal-trial:available-for-player': 2,
  'subject:generation-started': 3,
  'subject:generated': 4,
  'subject:generation-failed': 4,
  'mentor-bubble:clicked': 3,
  'topic-content:generation-failed': 3,
  'topic-content:generation-ready': 2,
  'topic-expansion:generation-failed': 3,
  'crystal-trial:generation-failed': 3,
  'content-generation:retry-failed': 3,
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
  if (!spec) return null;

  const nowMs = ctx.nowMs ?? Date.now();
  const store = useMentorStore.getState();

  if (spec.oneShot && store.oneShotsFired[trigger]) return null;

  const lastFiredAt = store.cooldowns[trigger];
  if (
    spec.cooldownMs &&
    typeof lastFiredAt === 'number' &&
    nowMs - lastFiredAt < spec.cooldownMs
  ) {
    return null;
  }

  if (spec.isApplicable && !spec.isApplicable(store, payload, nowMs)) return null;

  const variantCount = VARIANT_COUNTS[trigger] ?? 1;
  const variantIndex = store.variantCursors[trigger] ?? 0;
  const safeIndex = ((variantIndex % variantCount) + variantCount) % variantCount;

  const rawText = spec.resolveVariantText
    ? spec.resolveVariantText(payload, store, safeIndex)
    : getMentorLine('en', trigger, MENTOR_VOICE_ID, safeIndex);

  const interpolationValues: Record<string, unknown> = {
    ...payload,
    name: store.playerName ?? 'friend',
  };
  const text = interpolate(rawText, interpolationValues);

  const messages = spec.buildMessages(text, payload, store).map((m) => ({
    ...m,
    text: m.text === text ? text : interpolate(m.text, interpolationValues),
  }));

  const plan: DialogPlan = {
    id: `${trigger}:${nowMs}`,
    trigger,
    priority: spec.priority,
    enqueuedAt: nowMs,
    messages,
    source: 'canned',
    voiceId: MENTOR_VOICE_ID,
    cooldownMs: spec.cooldownMs,
    oneShot: spec.oneShot,
  };

  // Advance the variant cursor for next time so repeated firings rotate.
  store.advanceVariantCursor(trigger, variantCount);

  // Record per-trigger side effects (topic-ready dedupe state). Failure
  // triggers intentionally have no side-effect tracking — each genuine
  // failure should surface.
  if (trigger === 'topic-content:generation-ready') {
    if (payload.pipelineId) topicReadyFiredPipelineIds.add(payload.pipelineId);
    if (payload.subjectId && payload.topicId) {
      topicReadyLastFireMs.set(
        topicReadyDedupeKey(payload.subjectId, payload.topicId),
        nowMs,
      );
    }
  }

  return plan;
}
