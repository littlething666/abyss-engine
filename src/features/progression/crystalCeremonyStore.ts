import { create } from 'zustand';

import { topicRefKey } from '@/lib/topicRef';
import type { TopicRef } from '@/types/core';

/** Level-up morph + FX window (matches plan §8). */
export const CRYSTAL_CEREMONY_DURATION_MS = 1700;

export interface CrystalCeremonyState {
  /** Latest topic that leveled up while a dialog was open; `topicRefKey` string. */
  pendingTopicKey: string | null;
  ceremonyTopicKey: string | null;
  /** Timestamp from performance.now() — must match the time base used by useFrame callers. */
  ceremonyStartedAt: number | null;
}

export interface CrystalCeremonyActions {
  /**
   * Call when a crystal's level increases. Latest-only: overwrites `pendingTopicKey` when a dialog is open.
   * Starts ceremony immediately when no dialog is open (replaces any in-progress ceremony).
   */
  notifyLevelUp: (ref: TopicRef, isDialogOpen: boolean) => void;
  /** When every dialog closes, play the pending ceremony if any. */
  onDialogClosed: () => void;
  /** Clear finished ceremonies so morph settles to 1 without keeping dead state. */
  syncCeremonyClock: (now: number) => void;
  /** 0–1 eased progress for the active ceremony topic; 1 if idle or completed for this topic. */
  getCeremonyMorphProgress: (ref: TopicRef, now: number) => number;
  /** Raw linear 0–1 for flash timing (before ease). */
  getCeremonyLinearProgress: (ref: TopicRef, now: number) => number;
  /** Whether this topic is the one currently in the ceremony window. */
  isCeremonyActiveForTopic: (ref: TopicRef, now: number) => boolean;
}

function startCeremony(topicKey: string, startedAt: number): Partial<CrystalCeremonyState> {
  return {
    ceremonyTopicKey: topicKey,
    ceremonyStartedAt: startedAt,
    pendingTopicKey: null,
  };
}

export const crystalCeremonyStore = create<CrystalCeremonyState & CrystalCeremonyActions>((set, get) => ({
  pendingTopicKey: null,
  ceremonyTopicKey: null,
  ceremonyStartedAt: null,

  notifyLevelUp: (ref, isDialogOpen) => {
    const key = topicRefKey(ref);
    if (isDialogOpen) {
      set({ pendingTopicKey: key });
      return;
    }
    // Use performance.now() to match the time base passed by useFrame callers.
    set(startCeremony(key, performance.now()));
  },

  onDialogClosed: () => {
    const pending = get().pendingTopicKey;
    if (!pending) {
      return;
    }
    // Use performance.now() to match the time base passed by useFrame callers.
    set(startCeremony(pending, performance.now()));
  },

  syncCeremonyClock: (now) => {
    const { ceremonyTopicKey, ceremonyStartedAt } = get();
    if (!ceremonyTopicKey || ceremonyStartedAt == null) {
      return;
    }
    if (now - ceremonyStartedAt >= CRYSTAL_CEREMONY_DURATION_MS) {
      set({ ceremonyTopicKey: null, ceremonyStartedAt: null });
    }
  },

  getCeremonyLinearProgress: (ref, now) => {
    const key = topicRefKey(ref);
    const { ceremonyTopicKey, ceremonyStartedAt } = get();
    if (ceremonyTopicKey !== key || ceremonyStartedAt == null) {
      return 1;
    }
    const t = (now - ceremonyStartedAt) / CRYSTAL_CEREMONY_DURATION_MS;
    return Math.min(1, Math.max(0, t));
  },

  getCeremonyMorphProgress: (ref, now) => {
    const linear = get().getCeremonyLinearProgress(ref, now);
    if (linear >= 1) {
      return 1;
    }
    // Smoothstep for displacement/material blend
    return linear * linear * (3 - 2 * linear);
  },

  isCeremonyActiveForTopic: (ref, now) => {
    const key = topicRefKey(ref);
    const { ceremonyTopicKey, ceremonyStartedAt } = get();
    if (ceremonyTopicKey !== key || ceremonyStartedAt == null) {
      return false;
    }
    return now - ceremonyStartedAt < CRYSTAL_CEREMONY_DURATION_MS;
  },
}));
