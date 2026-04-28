'use client';

import { useEffect, useState } from 'react';

const MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Reactive hook for the OS-level "reduce motion" preference. Returns `false`
 * on the server / when `matchMedia` is unavailable.
 *
 * Phase 2 (mentor): used by `MentorDialogOverlay` so the typewriter reveal
 * collapses to instant when reduce-motion is on. `src/components/Scene.tsx`
 * still calls `matchMedia` directly; that usage is intentionally untouched
 * to keep this PR scoped.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
      return window.matchMedia(MEDIA_QUERY).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    setReduced(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari < 14 fallback
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  return reduced;
}
