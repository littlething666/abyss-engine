import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { topicRefKey } from '@/lib/topicRef';
import { useAllGraphs } from '@/features/content';
import { topicStudyContentReady } from '@/features/contentGeneration';
import { useContentGenerationStore } from '@/features/contentGeneration';
import { deckRepository } from '@/infrastructure/di';
import type { TopicContentStatus } from '@/types/progression';

export type { TopicContentStatus };

/** TanStack key for whether a topic has theory + difficulty-1 cards (study-ready). */
export function topicContentAvailabilityQueryKey(subjectId: string, topicId: string) {
  return ['content', 'topic-ready', subjectId, topicId] as const;
}

/**
 * For every node in loaded graphs, the content status for that topic:
 * - `'ready'`: IndexedDB has theory + at least one difficulty-1 card
 * - `'generating'`: a generation job is in-flight for this topic
 * - `'unavailable'`: no content and no active generation
 *
 * Keyed by `topicRefKey` (`subjectId::topicId`).
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

  return useMemo(() => {
    const map: Record<string, TopicContentStatus> = {};
    topicRefs.forEach((t, i) => {
      const r = results[i];
      const key = topicRefKey(t);
      if (r?.data === true) {
        map[key] = 'ready';
      } else if (activeJobKeySet.has(key)) {
        map[key] = 'generating';
      } else {
        map[key] = 'unavailable';
      }
    });
    return map;
  }, [topicRefs, results, activeJobKeySet]);
}
