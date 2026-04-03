'use client';

import { useCallback, useSyncExternalStore } from 'react';

import type { InferenceSurfaceId } from '../types/llmInference';

function storageKey(surfaceId: InferenceSurfaceId): string {
  return `abyss:thinking-toggle:${surfaceId}`;
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyAll(): void {
  for (const cb of listeners) cb();
}

function readSnapshot(surfaceId: InferenceSurfaceId): boolean {
  try {
    return localStorage.getItem(storageKey(surfaceId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Per-surface thinking toggle persisted in localStorage.
 * Returns the current state and a toggle callback.
 */
export function useThinkingToggle(surfaceId: InferenceSurfaceId) {
  const enableThinking = useSyncExternalStore(
    subscribe,
    () => readSnapshot(surfaceId),
    () => false,
  );

  const toggleThinking = useCallback(() => {
    try {
      const key = storageKey(surfaceId);
      const next = localStorage.getItem(key) !== '1';
      if (next) {
        localStorage.setItem(key, '1');
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      /* localStorage unavailable */
    }
    notifyAll();
  }, [surfaceId]);

  return { enableThinking, toggleThinking } as const;
}
