import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appEventBus } from '@/infrastructure/eventBus';

import {
  type DialogPlan,
  type MentorTriggerId,
} from './mentorTypes';

const STORAGE_KEY = 'abyss-mentor-v1';
// Bumped to 5 in the trigger-id colon-namespace rename
// (`subject.generation.started` etc. → `subject:generation-started`).
// Scoped hard cut: `seenTriggers` and `cooldowns` are keyed by trigger
// ids that the v4 -> v5 rename invalidated, so they are unconditionally
// reset. All other persisted fields (e.g. `playerName`,
// `firstSubjectGenerationEnqueuedAt` which gates the onboarding intro)
// are preserved across the bump - wiping them would silently re-open
// the onboarding dialog for every existing user on next load.
const STORAGE_VERSION = 5;

export interface VariantCursor {
  order: readonly number[];
  index: number;
}

export interface MentorPersistedState {
  playerName: string | null;
  mentorLocale: 'en';
  seenTriggers: MentorTriggerId[];
  narrationEnabled: boolean;
  lastInteractionAt: number | null;
  cooldowns: Partial<Record<MentorTriggerId, number>>;
  firstSubjectGenerationEnqueuedAt: number | null;
}

export interface MentorEphemeralState {
  dialogQueue: DialogPlan[];
  currentDialog: DialogPlan | null;
  variantCursors: Partial<Record<MentorTriggerId, VariantCursor>>;
}

export interface MentorActions {
  setPlayerName: (name: string | null) => void;
  setNarrationEnabled: (enabled: boolean) => void;
  enqueue: (plan: DialogPlan) => void;
  popHead: () => DialogPlan | null;
  peekHead: () => DialogPlan | null;
  openCurrentFromQueue: () => DialogPlan | null;
  dismissCurrent: () => void;
  markSeen: (trigger: MentorTriggerId) => void;
  recordCooldown: (trigger: MentorTriggerId, atMs: number) => void;
  markFirstSubjectGenerationEnqueued: (atMs: number) => void;
  nextVariantIndex: (
    trigger: MentorTriggerId,
    variantCount: number,
    rng?: () => number,
  ) => number;
  reset: () => void;
}

export type MentorState = MentorPersistedState & MentorEphemeralState & MentorActions;

export const DEFAULT_PERSISTED_STATE: MentorPersistedState = {
  playerName: null,
  mentorLocale: 'en',
  seenTriggers: [],
  narrationEnabled: false,
  lastInteractionAt: null,
  cooldowns: {},
  firstSubjectGenerationEnqueuedAt: null,
};

export const DEFAULT_EPHEMERAL_STATE: MentorEphemeralState = {
  dialogQueue: [],
  currentDialog: null,
  variantCursors: {},
};

function fisherYatesShuffle(length: number, rng: () => number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = order[i]!;
    const b = order[j]!;
    order[i] = b;
    order[j] = a;
  }
  return order;
}

function reshuffleAvoidingHeadEqualsTail(
  length: number,
  previousTail: number | undefined,
  rng: () => number,
): number[] {
  if (length <= 1) return [0];
  for (let attempt = 0; attempt < 8; attempt++) {
    const order = fisherYatesShuffle(length, rng);
    if (previousTail === undefined || order[0] !== previousTail) return order;
  }
  // Last-resort fallback: swap head and tail to guarantee no repeat.
  const order = fisherYatesShuffle(length, rng);
  if (order[0] === previousTail && order.length > 1) {
    const head = order[0]!;
    const tail = order[order.length - 1]!;
    order[0] = tail;
    order[order.length - 1] = head;
  }
  return order;
}

function getMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } satisfies Storage;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Scoped hard cut on version bump: only fields keyed by the renamed
 * trigger ids (`seenTriggers`, `cooldowns`) are unconditionally reset,
 * because the v4 -> v5 dot-namespace -> colon-namespace rename made the
 * legacy values meaningless. All other persisted fields are preserved
 * with per-field defensive type guards so malformed legacy blobs cannot
 * leak unexpected types into the new state.
 *
 * Critically, `firstSubjectGenerationEnqueuedAt` is preserved: the
 * `onboarding:pre-first-subject` trigger gates on this field being
 * null, so a wholesale wipe would re-open the full onboarding dialog
 * for every existing user on next load.
 *
 * zustand only invokes `migrate` when the stored version differs from
 * `STORAGE_VERSION`, so the current-version pass-through path is
 * handled by zustand internally.
 */
export function migrateMentorState(
  persisted: unknown,
  _fromVersion: number,
): MentorPersistedState {
  if (!isPlainObject(persisted)) {
    return { ...DEFAULT_PERSISTED_STATE };
  }

  const playerName =
    typeof persisted.playerName === 'string' || persisted.playerName === null
      ? (persisted.playerName as string | null)
      : DEFAULT_PERSISTED_STATE.playerName;

  const mentorLocale =
    persisted.mentorLocale === 'en' ? 'en' : DEFAULT_PERSISTED_STATE.mentorLocale;

  const narrationEnabled =
    typeof persisted.narrationEnabled === 'boolean'
      ? persisted.narrationEnabled
      : DEFAULT_PERSISTED_STATE.narrationEnabled;

  const lastInteractionAt =
    typeof persisted.lastInteractionAt === 'number' || persisted.lastInteractionAt === null
      ? (persisted.lastInteractionAt as number | null)
      : DEFAULT_PERSISTED_STATE.lastInteractionAt;

  const firstSubjectGenerationEnqueuedAt =
    typeof persisted.firstSubjectGenerationEnqueuedAt === 'number' ||
    persisted.firstSubjectGenerationEnqueuedAt === null
      ? (persisted.firstSubjectGenerationEnqueuedAt as number | null)
      : DEFAULT_PERSISTED_STATE.firstSubjectGenerationEnqueuedAt;

  return {
    playerName,
    mentorLocale,
    narrationEnabled,
    lastInteractionAt,
    firstSubjectGenerationEnqueuedAt,
    // Hard-cut the two trigger-id-keyed fields (legacy values are now
    // meaningless dot-namespace ids).
    seenTriggers: [],
    cooldowns: {},
  };
}

export const useMentorStore = create<MentorState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PERSISTED_STATE,
      ...DEFAULT_EPHEMERAL_STATE,

      setPlayerName: (name) => {
        set({ playerName: name });
        // Mentor → infrastructure boundary. The PostHog bootstrap
        // (see `src/infrastructure/posthog/bootstrapPosthog.ts`)
        // subscribes to this event and enriches the payload with
        // analytics deployment metadata (appVersion, buildMode,
        // timestamps); feature code only carries `playerName`.
        appEventBus.emit('player-profile:updated', { playerName: name });
      },
      setNarrationEnabled: (enabled) => set({ narrationEnabled: enabled }),

      enqueue: (plan) => {
        set((state) => {
          const next = [...state.dialogQueue, plan].sort(
            (a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt,
          );
          return { dialogQueue: next };
        });
      },

      popHead: () => {
        const state = get();
        const head = state.dialogQueue[0] ?? null;
        if (!head) return null;
        set({ dialogQueue: state.dialogQueue.slice(1) });
        return head;
      },

      peekHead: () => get().dialogQueue[0] ?? null,

      openCurrentFromQueue: () => {
        const state = get();
        const head = state.dialogQueue[0] ?? null;
        if (!head) return null;
        set({
          currentDialog: head,
          dialogQueue: state.dialogQueue.slice(1),
          lastInteractionAt: Date.now(),
        });
        return head;
      },

      dismissCurrent: () => {
        set({ currentDialog: null, lastInteractionAt: Date.now() });
      },

      markSeen: (trigger) => {
        set((state) =>
          state.seenTriggers.includes(trigger)
            ? state
            : { seenTriggers: [...state.seenTriggers, trigger] },
        );
      },

      recordCooldown: (trigger, atMs) => {
        set((state) => ({
          cooldowns: { ...state.cooldowns, [trigger]: atMs },
        }));
      },

      markFirstSubjectGenerationEnqueued: (atMs) => {
        set({ firstSubjectGenerationEnqueuedAt: atMs });
      },

      nextVariantIndex: (trigger, variantCount, rng = Math.random) => {
        if (variantCount <= 0) {
          throw new Error(`Trigger "${trigger}" has no variants`);
        }
        const state = get();
        const existing = state.variantCursors[trigger];
        const cursorValid =
          existing &&
          existing.order.length === variantCount &&
          existing.order.every((n) => Number.isInteger(n) && n >= 0 && n < variantCount);

        if (!cursorValid) {
          const order = fisherYatesShuffle(variantCount, rng);
          set({
            variantCursors: {
              ...state.variantCursors,
              [trigger]: { order, index: 0 },
            },
          });
          return order[0]!;
        }

        const nextIndex = existing.index + 1;
        if (nextIndex >= existing.order.length) {
          const previousTail = existing.order[existing.order.length - 1];
          const order = reshuffleAvoidingHeadEqualsTail(variantCount, previousTail, rng);
          set({
            variantCursors: {
              ...state.variantCursors,
              [trigger]: { order, index: 0 },
            },
          });
          return order[0]!;
        }

        set({
          variantCursors: {
            ...state.variantCursors,
            [trigger]: { order: existing.order, index: nextIndex },
          },
        });
        return existing.order[nextIndex]!;
      },

      reset: () => {
        set({ ...DEFAULT_PERSISTED_STATE, ...DEFAULT_EPHEMERAL_STATE });
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
          ? window.localStorage
          : getMemoryStorage(),
      ),
      partialize: (state): MentorPersistedState => ({
        playerName: state.playerName,
        mentorLocale: state.mentorLocale,
        seenTriggers: state.seenTriggers,
        narrationEnabled: state.narrationEnabled,
        lastInteractionAt: state.lastInteractionAt,
        cooldowns: state.cooldowns,
        firstSubjectGenerationEnqueuedAt: state.firstSubjectGenerationEnqueuedAt,
      }),
      migrate: (persisted, fromVersion) => migrateMentorState(persisted, fromVersion),
    },
  ),
);

export const mentorStore = useMentorStore;

export const selectCurrentDialog = (state: MentorState) => state.currentDialog;
export const selectIsOverlayOpen = (state: MentorState) => state.currentDialog !== null;
