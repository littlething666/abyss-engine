export type MentorVoiceId = 'witty-sarcastic';

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
  // Phase A: terminal triggers for topic / expansion / crystal-trial /
  // retry pipelines. Cataloged here so the rule engine can build plans,
  // but no event-bus path emits them yet — wiring lands in Phase B/C.
  'topic-content:generation-failed',
  'topic-content:generation-ready',
  'topic-expansion:generation-failed',
  'crystal-trial:generation-failed',
  'content-generation:retry-failed',
] as const;

export type MentorTriggerId = (typeof MENTOR_TRIGGER_IDS)[number];

export type MentorMood =
  | 'neutral'
  | 'cheer'
  | 'tease'
  | 'concern'
  | 'celebrate'
  | 'hint';

// Optional `subjectId` carries the discovery scope into the modal. When
// undefined, DiscoveryModal falls back to the sessionStorage default; when
// '__all_floors__', the modal explicitly opens in all-subjects mode.
export type MentorEffect =
  | {
      kind: 'open_discovery';
      subjectId?: string | '__all_floors__';
    }
  | { kind: 'open_generation_hud' }
  // open_topic_study is the topic-ready CTA: opens the study panel for a
  // specific (subjectId, topicId) once the topic content pipeline has
  // produced study-ready material. The presentation/composition adapter
  // that fulfills this effect lands in Phase E; until then the catalog
  // entry exists so dialog plans can carry it through unchanged.
  | { kind: 'open_topic_study'; subjectId: string; topicId: string }
  | { kind: 'dismiss' };

export interface MentorChoice {
  id: string;
  label: string;
  next?: 'end' | string;
  effect?: MentorEffect;
}

export interface MentorMessage {
  id: string;
  text: string;
  mood?: MentorMood;
  delayMs?: number;
  choices?: MentorChoice[];
  input?: { kind: 'name'; placeholder?: string; maxLen?: number };
  autoAdvanceMs?: number;
}

export interface DialogPlan {
  id: string;
  trigger: MentorTriggerId;
  priority: number;
  enqueuedAt: number;
  messages: MentorMessage[];
  source: 'canned';
  voiceId: MentorVoiceId;
  cooldownMs?: number;
  oneShot?: boolean;
}

export interface MentorTriggerPayload {
  topic?: string;
  subjectId?: string;
  subjectName?: string;
  stage?: 'topics' | 'edges';
  pipelineId?: string;
  from?: number;
  to?: number;
  correctRate?: number;
  totalAttempts?: number;
  // Phase A additions. `topicId` powers the `open_topic_study` effect;
  // `topicLabel` is the human-readable topic title used in copy
  // interpolation; `level` is the crystal-band level for expansion jobs;
  // `jobLabel` is the failed job's label (e.g. "Theory — Topology") used
  // by retry-failed copy; `errorMessage` is reserved for diagnostic
  // surfacing (kept blameless in copy by default).
  topicId?: string;
  topicLabel?: string;
  level?: number;
  jobLabel?: string;
  errorMessage?: string;
}
