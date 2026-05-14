import { useQueries } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { topicRefKey } from '@/lib/topicRef';
import { useAllGraphs } from '@/features/content';
import { deckRepository } from '@/infrastructure/di';
import type { TopicContentStatus, TopicContentStatusRecord } from '@/types/topicContent';

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

export function topicContentStatusesQueryKey(subjectId: string) {
  return ['content', 'topic-statuses', subjectId] as const;
}

/** @deprecated Topic readiness is now read at subject status granularity. */
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
 * - `'ready'`: Learning Content Store has theory + at least one difficulty-1 card
 * - `'generating'`: backend Topic Content Status says content generation is in progress
 * - `'unavailable'`: no published content is available
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

  const subjectIds = useMemo(() => {
    const seen = new Set<string>();
    for (const ref of topicRefs) {
      if (ref.subjectId) seen.add(ref.subjectId);
    }
    return [...seen].sort();
  }, [topicRefs]);

  const results = useQueries({
    queries: subjectIds.map((subjectId) => ({
      queryKey: topicContentStatusesQueryKey(subjectId),
      queryFn: async (): Promise<TopicContentStatusRecord[]> => deckRepository.getTopicContentStatuses(subjectId),
      enabled: Boolean(subjectId),
    })),
  });


  // Identity-cache the derived map. `useQueries` returns a fresh outer
  // array on every render even when each query is reference-stable, so
  // a plain `useMemo([results])` would recompute and return a new
  // object every render. Compare the freshly-computed map against the
  // previous return shallowly; if every (key, value) pair matches,
  // return the previous reference.
  const previousMapRef = useRef<Record<string, TopicContentStatus>>(
    EMPTY_TOPIC_CONTENT_STATUS_MAP,
  );

  const statusByKey = new Map<string, TopicContentStatus>();
  for (const result of results) {
    for (const row of result.data ?? []) {
      statusByKey.set(topicRefKey({ subjectId: row.subjectId, topicId: row.topicId }), row.status);
    }
  }

  const next: Record<string, TopicContentStatus> = {};
  for (const t of topicRefs) {
    const key = topicRefKey(t);
    next[key] = statusByKey.get(key) ?? 'unavailable';
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
