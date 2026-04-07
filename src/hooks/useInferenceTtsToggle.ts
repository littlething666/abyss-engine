'use client';

import { useCallback, useSyncExternalStore } from 'react';

import type { InferenceSurfaceId } from '../types/llmInference';

function storageKey(surfaceId: InferenceSurfaceId): string {
  return `abyss:tts-toggle:${surfaceId}`;
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyAll(): void {
  for (const cb of listeners) cb();
}

/** Default on: stored `'0'` means disabled. */
function readSnapshot(surfaceId: InferenceSurfaceId): boolean {
  try {
    return localStorage.getItem(storageKey(surfaceId)) !== '0';
  } catch {
    return true;
  }
}

/**
 * Per-surface text-to-speech toggle persisted in localStorage (default enabled).
 */
export function useInferenceTtsToggle(surfaceId: InferenceSurfaceId) {
  const enableTts = useSyncExternalStore(
    subscribe,
    () => readSnapshot(surfaceId),
    () => false,
  );

  const toggleTts = useCallback(() => {
    try {
      const key = storageKey(surfaceId);
      const currentlyEnabled = readSnapshot(surfaceId);
      if (currentlyEnabled) {
        localStorage.setItem(key, '0');
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      /* localStorage unavailable */
    }
    notifyAll();
  }, [surfaceId]);

  return { enableTts, toggleTts } as const;
}
