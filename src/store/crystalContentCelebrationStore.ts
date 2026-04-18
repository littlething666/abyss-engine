import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const STORAGE_KEY = 'abyss-crystal-content-celebration-v1';

export interface CrystalContentCelebrationState {
  /**
   * Topic keys (`subjectId::topicId`) with an unread "full unlock generation
   * completed" celebration badge on the crystal.
   */
  pendingByTopicKey: Record<string, true>;
  markPendingFromFullTopicUnlock: (topicKey: string) => void;
  dismissPending: (topicKey: string) => void;
}

export const useCrystalContentCelebrationStore = create<CrystalContentCelebrationState>()(
  persist(
    (set) => ({
      pendingByTopicKey: {},

      markPendingFromFullTopicUnlock: (topicKey) =>
        set((s) => ({
          pendingByTopicKey: { ...s.pendingByTopicKey, [topicKey]: true },
        })),

      dismissPending: (topicKey) =>
        set((s) => {
          if (!s.pendingByTopicKey[topicKey]) {
            return s;
          }
          const next = { ...s.pendingByTopicKey };
          delete next[topicKey];
          return { pendingByTopicKey: next };
        }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ pendingByTopicKey: s.pendingByTopicKey }),
    },
  ),
);
