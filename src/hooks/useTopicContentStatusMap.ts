import { useQueries } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { topicRefKey } from '@/lib/topicRef';
import { useAllGraphs } from '@/features/content';
import { topicStudyContentReady } from '@/features/contentGeneration';
import { useContentGenerationStore } from '@/features/contentGeneration';
import { deckRepository } from '@/infrastructure/di';
import type { ContentGenerationJobKind } from '@/types/contentGeneration';
import type { TopicContentStatus } from '@/types/progression';

const CRYSTAL_CONTENT_JOB_KINDS = new Set<ContentGenerationJobKind>([
  'topic-theory',
  'topic-study-cards',
  'topic-mini-games',
  'topic-mini-game-category-sort',
  'topic-mini-game-sequence-build',
  'topic-mini-game-match-pairs',
  'topic-expansion-cards',
]);

/**
 * Fix #6: shared empty-map constant. Returning the same empty object
 * across renders (graphs-not-loaded case, first paint) gives every
 * consumer a stable reference for the empty state, which preserves
 * `React.memo` / `useMemo` skip-rerender behavior on downstream
 * components.
 */
const EMPTY_TOPIC_CONTENT_STATUS_MAP: Readonly<Record<string, TopicContentStatus>> =
  Object.freeze({});

export type { TopicContentStatus };

/** TanStack key for whether a topic has theory + difficulty-1 cards (study-ready). */
export function topicContentAvailabilityQueryKey(subjectId: string, topicId: string) {
  return ['content', 'topic-ready', subjectId, topicId] as const;
}

/**
 * Compare two `Record<string, TopicContentStatus>` maps by key-set and
 * value identity. Used by `useTopicContentStatusMap` to reuse the
 * previous return reference when every per-topic status is unchanged.
 */
function topicContentStatusMapsEqual(
  a: Record<string, TopicContentStatus>,
  b: Record<string, TopicContentStatus>,
): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * For every node in loaded graphs, the content status for that topic:
 * - `'ready'`: IndexedDB has theory + at least one difficulty-1 card
 * - `'generating'`: a topic content / expansion LLM job is in-flight for this topic
 *   (excludes e.g. Crystal Trial jobs so the crystal clock stays content-specific)
 * - `'unavailable'`: no content and no active generation
 *
 * Keyed by `topicRefKey` (`subjectId::topicId`).
 *
 * Reference contract (Fix #6): the returned object is reference-stable
 * across renders when no per-topic status has changed. Consumers that
 * key `useMemo` / `useEffect` / `React.memo` on the map identity will
 * skip rerenders correctly.
 */
export function useTopicContentStatusMap(): Record<string, TopicContentStatus> {
  const allGraphs = useAllGraphs();

  const topicRefs = useMemo(() => {
    const out: { subjectId: string; topicId: string }[] = [];
    for (const g of allGraphs) {
      for (const n of g.nodes) {
        out.push({ subjectId: g.subjectId, topicId: n.topicId });
      }
    }
    return out;
  }, [allGraphs]);

  const results = useQueries({
    queries: topicRefs.map(({ subjectId, topicId }) => ({
      queryKey: topicContentAvailabilityQueryKey(subjectId, topicId),
      queryFn: async (): Promise<boolean> => {
        const [details, cards] = await Promise.all([
          deckRepository.getTopicDetails(subjectId, topicId),
          deckRepository.getTopicCards(subjectId, topicId),
        ]);
        return topicStudyContentReady(details, cards);
      },
      enabled: Boolean(subjectId) && Boolean(topicId),
    })),
  });

  // Extract only active job keys from the content generation store to minimize re-renders.
  const activeJobKeys = useContentGenerationStore(
    useShallow((state) => {
      const keys: string[] = [];
      for (const j of Object.values(state.jobs)) {
        if (!CRYSTAL_CONTENT_JOB_KINDS.has(j.kind)) {
          continue;
        }
        if (
          j.status === 'pending' ||
          j.status === 'streaming' ||
          j.status === 'parsing' ||
          j.status === 'saving'
        ) {
          const subjectId = j.subjectId;
          const topicId = j.topicId;
          if (!subjectId || !topicId) {
            continue;
          }
          keys.push(topicRefKey({ subjectId, topicId }));
        }
      }
      return keys;
    }),
  );

  const activeJobKeySet = useMemo(() => new Set(activeJobKeys), [activeJobKeys]);

  // Identity-cache the derived map. `useQueries` returns a fresh outer
  // array on every render even when each query is reference-stable, so
  // a plain `useMemo([results])` would recompute and return a new
  // object every render. Compare the freshly-computed map against the
  // previous return shallowly; if every (key, value) pair matches,
  // return the previous reference.
  const previousMapRef = useRef<Record<string, TopicContentStatus>>(
    EMPTY_TOPIC_CONTENT_STATUS_MAP,
  );

  const next: Record<string, TopicContentStatus> = {};
  for (let i = 0; i < topicRefs.length; i++) {
    const t = topicRefs[i]!;
    const r = results[i];
    const key = topicRefKey(t);
    if (activeJobKeySet.has(key)) {
      next[key] = 'generating';
    } else if (r?.data === true) {
      next[key] = 'ready';
    } else {
      next[key] = 'unavailable';
    }
  }

  // Reuse the shared empty-map constant when there are no topics so
  // the empty-state reference stays stable across renders even before
  // the first cache hit populates `previousMapRef`.
  if (topicRefs.length === 0) {
    if (previousMapRef.current !== EMPTY_TOPIC_CONTENT_STATUS_MAP) {
      previousMapRef.current = EMPTY_TOPIC_CONTENT_STATUS_MAP;
    }
    return EMPTY_TOPIC_CONTENT_STATUS_MAP;
  }

  if (topicContentStatusMapsEqual(previousMapRef.current, next)) {
    return previousMapRef.current;
  }
  previousMapRef.current = next;
  return next;
}
