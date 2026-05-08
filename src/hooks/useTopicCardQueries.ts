import { useMemo } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';

import { topicRefKey } from '@/lib/topicRef';
import type { TopicMetadata } from '../features/content';
import type { Card, TopicRef } from '../types/core';
import type { TopicContentStatus } from '../types/topicContent';
import { deckRepository } from '../infrastructure/di';
import { topicCardsQueryKey } from './useDeckData';

export type TopicCardQueryRow = UseQueryResult<Card[], Error>;

export interface TopicCardQueriesResult {
  /** Topic refs aligned with `topicCardQueries` indices. */
  queriedTopicRefs: readonly TopicRef[];
  topicCardQueries: TopicCardQueryRow[];
  /** Cards keyed by `topicRefKey`. */
  topicCardsByKey: Map<string, Card[]>;
}

/**
 * Pure filter: same rule as legacy subject scoping — one place so call sites cannot drift.
 */
export function getSubjectFilteredTopicRefs(
  topicRefs: readonly TopicRef[],
  currentSubjectId: string | null,
  allTopicMetadata: Readonly<Record<string, TopicMetadata>>,
): TopicRef[] {
  if (!currentSubjectId) {
    return [...topicRefs];
  }

  return topicRefs.filter((ref) => {
    const k = topicRefKey(ref);
    return allTopicMetadata[k]?.subjectId === currentSubjectId;
  });
}

function useTopicCardQueriesFromRefs(
  topicRefs: readonly TopicRef[],
  allTopicMetadata: Readonly<Record<string, TopicMetadata>>,
  contentStatusByTopicKey: Readonly<Record<string, TopicContentStatus>>,
): TopicCardQueriesResult {
  const topicCardQueries = useQueries({
    queries: topicRefs.map((ref) => {
      const k = topicRefKey(ref);
      const subjectId = allTopicMetadata[k]?.subjectId || ref.subjectId;
      return {
        queryKey: topicCardsQueryKey(subjectId, ref.topicId),
        queryFn: () => deckRepository.getTopicCards(subjectId, ref.topicId),
        enabled: Boolean(subjectId) && contentStatusByTopicKey[k] === 'ready',
        staleTime: Infinity,
      };
    }),
  });

  const topicCardsByKey = useMemo(() => {
    const map = new Map<string, Card[]>();
    topicRefs.forEach((ref, index) => {
      const cards = topicCardQueries[index]?.data;
      if (cards) {
        map.set(topicRefKey(ref), cards);
      }
    });
    return map;
  }, [topicRefs, topicCardQueries]);

  return { queriedTopicRefs: topicRefs, topicCardQueries, topicCardsByKey };
}

/** Fetch deck cards for every active crystal topic (Scene: all visible crystals need card payloads). */
export function useTopicCardQueriesForActiveTopics(
  topicRefs: readonly TopicRef[],
  allTopicMetadata: Readonly<Record<string, TopicMetadata>>,
  contentStatusByTopicKey: Readonly<Record<string, TopicContentStatus>>,
): TopicCardQueriesResult {
  return useTopicCardQueriesFromRefs(topicRefs, allTopicMetadata, contentStatusByTopicKey);
}

/** Fetch deck cards only for topics in the current subject (or all topics when no subject is selected). */
export function useTopicCardQueriesForSubjectFilter(
  topicRefs: readonly TopicRef[],
  currentSubjectId: string | null,
  allTopicMetadata: Readonly<Record<string, TopicMetadata>>,
  contentStatusByTopicKey: Readonly<Record<string, TopicContentStatus>>,
): TopicCardQueriesResult {
  const subjectFilteredTopicRefs = useMemo(
    () => getSubjectFilteredTopicRefs(topicRefs, currentSubjectId, allTopicMetadata),
    [topicRefs, currentSubjectId, allTopicMetadata],
  );

  return useTopicCardQueriesFromRefs(subjectFilteredTopicRefs, allTopicMetadata, contentStatusByTopicKey);
}
