import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAllGraphs } from '@/features/content';
import { topicStudyContentReady } from '@/features/topicContentGeneration/topicStudyContentReady';
import { deckRepository } from '@/infrastructure/di';

/** TanStack key for whether a topic has theory + difficulty-1 cards (study-ready). */
export function topicContentAvailabilityQueryKey(subjectId: string, topicId: string) {
  return ['content', 'topic-ready', subjectId, topicId] as const;
}

/**
 * For every node in loaded graphs, whether IndexedDB has study-ready content for that topic.
 */
export function useTopicContentAvailabilityMap(): Record<string, boolean> {
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

  return useMemo(() => {
    const map: Record<string, boolean> = {};
    topicRefs.forEach((t, i) => {
      const r = results[i];
      map[t.topicId] = r?.data ?? false;
    });
    return map;
  }, [topicRefs, results]);
}
