import { useMemo } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';

import type { TopicMetadata } from '../features/content';
import type { Card } from '../types/core';
import { deckRepository } from '../infrastructure/di';
import { topicCardsQueryKey } from './useDeckData';
import type { TopicRefKey } from '../lib/topicRef';
import { topicRefKey } from '../lib/topicRef';

export type TopicCardQueryRow = UseQueryResult<Card[], Error>;

export interface TopicCardQueriesResult {
  queriedTopicIds: readonly string[];
  topicCardQueries: TopicCardQueryRow[];
  /** Keyed by TopicRefKey via topicRefKey(subjectId, topicId). */
  topicCardsByRef: Map<TopicRefKey, Card[]>;
}

/**
 * Pure filter: same rule as legacy subject scoping — one place so call sites cannot drift.
 */
export function getSubjectFilteredTopicIds(
  activeTopicIds: readonly string[],
  currentSubjectId: string | null,
  allTopicMetadata: Readonly<Record<string, TopicMetadata>>,
): string[] {
  if (!currentSubjectId) return [...activeTopicIds];
  return activeTopicIds.filter(
    (topicId) => allTopicMetadata[topicId]?.subjectId === currentSubjectId,
  );
}

function useTopicCardQueriesFromTopicIds(
  topicIds: readonly string[],
  allTopicMetadata: Readonly<Record<string, TopicMetadata>>,
): TopicCardQueriesResult {
  const topicCardQueries = useQueries({
    queries: topicIds.map((topicId) => {
      const subjectId = allTopicMetadata[topicId]?.subjectId || '';
      return {
        queryKey: topicCardsQueryKey(subjectId, topicId),
        queryFn: () => deckRepository.getTopicCards(subjectId, topicId),
        enabled: Boolean(subjectId),
        staleTime: Infinity,
      };
    }),
  });

  const topicCardsByRef = useMemo(() => {
    const map = new Map<TopicRefKey, Card[]>();
    topicIds.forEach((topicId, index) => {
      const subjectId = allTopicMetadata[topicId]?.subjectId || '';
      const cards = topicCardQueries[index]?.data;
      if (cards && subjectId) {
        map.set(topicRefKey(subjectId, topicId), cards);
      }
    });
    return map;
  }, [topicIds, topicCardQueries, allTopicMetadata]);

  return { queriedTopicIds: topicIds, topicCardQueries, topicCardsByRef };
}

/** Fetch deck cards for every active crystal topic (Scene: all visible crystals need card payloads). */
export function useTopicCardQueriesForActiveTopics(
  activeTopicIds: readonly string[],
  allTopicMetadata: Readonly<Record<string, TopicMetadata>>,
): TopicCardQueriesResult {
  return useTopicCardQueriesFromTopicIds(activeTopicIds, allTopicMetadata);
}

/** Fetch deck cards only for topics in the current subject (or all topics when no subject is selected). */
export function useTopicCardQueriesForSubjectFilter(
  activeTopicIds: readonly string[],
  currentSubjectId: string | null,
  allTopicMetadata: Readonly<Record<string, TopicMetadata>>,
): TopicCardQueriesResult {
  const subjectFilteredTopicIds = useMemo(
    () => getSubjectFilteredTopicIds(activeTopicIds, currentSubjectId, allTopicMetadata),
    [activeTopicIds, currentSubjectId, allTopicMetadata],
  );
  return useTopicCardQueriesFromTopicIds(subjectFilteredTopicIds, allTopicMetadata);
}
