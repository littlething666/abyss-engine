'use client';

import { useEffect, useId, useMemo, useState } from 'react';

import {
  LOADING_QUOTES,
  LOADING_STATUS_PHRASES,
  pickSeededIndex,
} from '@/lib/loadingScreenCopy';
import { cn } from '@/lib/utils';

const CLOUD_DRIFT_DURATION_S = 28;
const FADE_OUT_MS = 200;

const CLOUD_STYLE = `
@keyframes abyss-cloud-drift {
  0%, 100% {
    transform: translate(-100%, -100%) translate3d(0, 0, 0) rotate(0deg);
  }
  50% {
    transform: translate(-100%, -100%) translate3d(14vw, 3vh, 0) rotate(-3deg);
  }
}

@keyframes abyss-cloud-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.abyss-cloud-fade {
  animation: abyss-cloud-fade-in 1.35s ease-out forwards;
}

.abyss-cloud-drift {
  animation: abyss-cloud-drift ${CLOUD_DRIFT_DURATION_S}s ease-in-out infinite;
}

@keyframes abyss-cloud-fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.abyss-cloud-root-exit {
  animation: abyss-cloud-fade-out ${FADE_OUT_MS}ms ease-out forwards;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .abyss-cloud-fade {
    animation: none;
    opacity: 1;
  }

  .abyss-cloud-drift {
    animation: none;
  }

  .abyss-cloud-root-exit {
    animation: none;
    opacity: 0;
  }
}
`;

const CLOUD_COUNT = 100;

/** Fallback when `NEXT_PUBLIC_ABYSS_LOADING_SEED` is missing (e.g. tests). */
const DEFAULT_ABYSS_LOADING_SEED = 0x0ab551d;

function parseAbyssLoadingSeedFromEnv(): number {
  const raw = process.env.NEXT_PUBLIC_ABYSS_LOADING_SEED;
  if (raw === undefined || raw === '') {
    return DEFAULT_ABYSS_LOADING_SEED;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return DEFAULT_ABYSS_LOADING_SEED;
  }
  return n >>> 0;
}

/** Set at compile time via `next.config.mjs` (`Date.now()` when config loads). */
const CLOUD_LAYOUT_SEED = parseAbyssLoadingSeedFromEnv();

/** Separate stream for quote index so status + quote are not always aligned. */
const LOADING_QUOTE_SEED = CLOUD_LAYOUT_SEED ^ 0x9e3779b9;

/** Theme-adjacent cloud tints (OKLCH vars track light/dark). */
const CLOUD_PALETTE = [
  'color-mix(in oklch, var(--primary) 32%, var(--background))',
  'color-mix(in oklch, var(--muted) 72%, var(--background))',
  'color-mix(in oklch, var(--accent) 48%, var(--background))',
  'color-mix(in oklch, var(--chart-1) 42%, var(--background))',
] as const;

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rnSeeded(next: () => number, from: number, to: number): number {
  return Math.floor(next() * (to - from + 1)) + from;
}

function buildBoxShadowsSeeded(count: number, seed: number): string {
  const next = mulberry32(seed >>> 0);
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const color = CLOUD_PALETTE[rnSeeded(next, 0, CLOUD_PALETTE.length - 1)]!;
    parts.push(
      `${rnSeeded(next, 1, 100)}vw ${rnSeeded(next, 1, 100)}vh ${rnSeeded(next, 20, 40)}vmin ${rnSeeded(next, 1, 20)}vmin ${color}`,
    );
  }
  return parts.join(', ');
}

export interface CloudLoadingScreenProps {
  className?: string;
  /** When false, root fades out (200ms) then calls `onExitComplete` (for delayed unmount). */
  visible?: boolean;
  onExitComplete?: () => void;
}

/**
 * Full-viewport loading surface: soft “cloud” masses via SVG displacement + box-shadows,
 * with drift and a short fade-in. Announces busy state for assistive tech.
 */
export function CloudLoadingScreen({
  className,
  visible = true,
  onExitComplete,
}: CloudLoadingScreenProps) {
  const filterId = `abyss-cloud-${useId().replace(/:/g, '')}`;
  const boxShadow = useMemo(
    () => buildBoxShadowsSeeded(CLOUD_COUNT, CLOUD_LAYOUT_SEED),
    [],
  );

  const [statusPhrase, setStatusPhrase] = useState(
    () =>
      LOADING_STATUS_PHRASES[
        pickSeededIndex(LOADING_STATUS_PHRASES.length, CLOUD_LAYOUT_SEED)
      ]!,
  );
  const [quote] = useState(
    () =>
      LOADING_QUOTES[
        pickSeededIndex(LOADING_QUOTES.length, LOADING_QUOTE_SEED)
      ]!,
  );

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const id = window.setInterval(() => {
      setStatusPhrase((prev) => {
        const list = LOADING_STATUS_PHRASES;
        if (list.length <= 1) {
          return list[0]!;
        }
        let candidate = list[Math.floor(Math.random() * list.length)]!;
        let guard = 0;
        while (candidate === prev && guard < 12) {
          candidate = list[Math.floor(Math.random() * list.length)]!;
          guard += 1;
        }
        return candidate;
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, [visible]);

  useEffect(() => {
    if (visible) {
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ms = reduced ? 0 : FADE_OUT_MS;
    const id = window.setTimeout(() => {
      onExitComplete?.();
    }, ms);
    return () => window.clearTimeout(id);
  }, [visible, onExitComplete]);

  return (
    <div
      data-testid="cloud-loading-screen"
      className={cn(
        'relative flex h-dvh w-screen items-center justify-center overflow-hidden bg-background text-foreground',
        !visible && 'abyss-cloud-root-exit',
        className,
      )}
    >
      <span className="sr-only" role="status" aria-busy={visible}>
        Loading
      </span>
      <style>{CLOUD_STYLE}</style>

      <svg
        width={0}
        height={0}
        className="absolute"
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id={filterId} x="-80%" y="-80%" width="260%" height="260%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.01"
              numOctaves={10}
              result="noise"
            />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={240} />
          </filter>
        </defs>
      </svg>

      <div className="abyss-cloud-fade pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="abyss-cloud-drift absolute left-0 top-0 h-px w-px overflow-hidden rounded-full"
          style={{
            filter: `url(#${filterId})`,
            boxShadow,
          }}
        />
      </div>

      <div
        className="relative z-10 flex max-w-[min(100%,24rem)] flex-col items-center gap-3 px-6 text-center"
        aria-hidden
      >
        <span className="text-2xl font-medium text-foreground">{statusPhrase}</span>
        <p className="text-sm leading-relaxed text-muted-foreground">{quote}</p>
      </div>
    </div>
  );
}
