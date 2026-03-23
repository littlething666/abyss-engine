'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query. Defaults to `false` until mounted (SSR-safe).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = () => {
      setMatches(mql.matches);
    };
    onChange();
    mql.addEventListener('change', onChange);
    return () => {
      mql.removeEventListener('change', onChange);
    };
  }, [query]);

  return matches;
}
