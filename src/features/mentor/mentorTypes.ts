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
}
