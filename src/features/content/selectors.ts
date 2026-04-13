import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { Subject, SubjectGraph, TopicDetails, Card } from '../../types/core';
import { useSubjects, useSubjectGraphs } from './contentQueries';
import { deckRepository } from '../../infrastructure/di';
import { topicRefKey } from '../../lib/topicRef';

export interface TopicMetadata {
  subjectId: string;
  subjectName: string;
  topicName: string;
  theory?: string;
}

export function useTopicMetadata(topicIds: string[]) {
  const dedupedTopicIds = useMemo(() => Array.from(new Set(topicIds)), [topicIds]);
  const { data: subjects = [] } = useSubjects();
  const subjectIds = useMemo(
    () => Array.from(new Set(subjects.map((subject) => subject.id))),
    [subjects],
  );
  const { data: graphs = [] } = useSubjectGraphs(subjectIds);

  const subjectMap = useMemo(() => {
    const map = new Map<string, string>();
    subjects.forEach((subject) => map.set(subject.id, subject.name));
    return map;
  }, [subjects]);

  const topicToSubject = useMemo(() => {
    const map = new Map<string, string>();
    for (const graph of graphs as SubjectGraph[]) {
      for (const node of graph.nodes) {
        map.set(node.topicId, graph.subjectId);
      }
    }
    return map;
  }, [graphs]);

  const topicMetadataBase = useMemo(() => {
    const base: Record<string, TopicMetadata> = {};
    for (const topicId of dedupedTopicIds) {
      const subjectId = topicToSubject.get(topicId) ?? '';
      const subjectName = subjectMap.get(subjectId) ?? '';
      base[topicId] = {
        subjectId,
        subjectName,
        topicName: '',
      };
    }
    return base;
  }, [subjectMap, dedupedTopicIds, topicToSubject]);

  const topicDetailsQueries = useQueries({
    queries: dedupedTopicIds.map((topicId) => {
      const subjectId = topicToSubject.get(topicId) ?? '';
      return {
        queryKey: ['content', 'topic', subjectId, topicId, 'details'],
        queryFn: () => deckRepository.getTopicDetails(subjectId, topicId),
        enabled: Boolean(subjectId),
        staleTime: Infinity,
      };
    }),
  });

  const detailsMap = new Map<string, TopicDetails>();
  dedupedTopicIds.forEach((topicId, index) => {
    const data = topicDetailsQueries[index]?.data as TopicDetails | undefined;
    if (data) {
      detailsMap.set(topicId, data);
    }
  });

  return useMemo(() => {
    const merged: Record<string, TopicMetadata> = { ...topicMetadataBase };
    for (const topicId of dedupedTopicIds) {
      const details = detailsMap.get(topicId);
      if (!details) {
        continue;
      }
      const base = merged[topicId] ?? { subjectId: details.subjectId, subjectName: '', topicName: '' };
      merged[topicId] = {
        ...base,
        subjectId: details.subjectId,
        topicName: details.title,
        theory: details.theory,
      };
    }
    return merged;
  }, [detailsMap, dedupedTopicIds, topicMetadataBase]);
}

export function useAllGraphs() {
  const { data: subjects = [] } = useSubjects();
  const subjectIds = useMemo(
    () => Array.from(new Set(subjects.map((subject) => subject.id))),
    [subjects],
  );
  const { data: graphs = [] } = useSubjectGraphs(subjectIds);
  return graphs as SubjectGraph[];
}

interface TopicCardsFixture {
  subjectId: string;
  topicId: string;
  cards: Card[];
}

/**
 * @deprecated Use `topicRefKey` from `@/lib/topicRef` instead.
 * Kept temporarily for in-file backward compat; will be removed.
 */
function topicKey(subjectId: string, topicId: string) {
  return topicRefKey(subjectId, topicId);
}

export function setContentDataForTests(
  subjects: Subject[],
  graphs: SubjectGraph[],
  topics: TopicDetails[],
  cards: TopicCardsFixture[],
) {
  const topicsByKey = new Map<string, TopicDetails>();
  for (const topic of topics) {
    topicsByKey.set(topicKey(topic.subjectId, topic.topicId), topic);
  }

  const cardsByKey = new Map<string, Card[]>();
  for (const record of cards) {
    cardsByKey.set(topicKey(record.subjectId, record.topicId), record.cards);
  }

  const graphsBySubject = new Map<string, SubjectGraph>();
  for (const graph of graphs) {
    graphsBySubject.set(graph.subjectId, graph);
  }

  (deckRepository as any).getManifest = async () => ({
    subjects,
  });

  (deckRepository as any).getSubjectGraph = async (subjectId: string) => {
    return graphsBySubject.get(subjectId) ?? {
      subjectId,
      title: '',
      themeId: '',
      maxTier: 0,
      nodes: [],
    };
  };

  (deckRepository as any).getTopicDetails = async (subjectId: string, topicId: string) => {
    const key = topicKey(subjectId, topicId);
    const topic = topicsByKey.get(key);
    return (
      topic ?? {
        subjectId,
        topicId,
        title: topicId,
        theory: '',
        coreConcept: '',
        keyTakeaways: [],
      }
    );
  };

  (deckRepository as any).getTopicCards = async (subjectId: string, topicId: string) => {
    return cardsByKey.get(topicKey(subjectId, topicId)) ?? [];
  };
}
