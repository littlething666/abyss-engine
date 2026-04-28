import { UseQueryResult, useQuery } from '@tanstack/react-query';
import { Card, SubjectGraph, TopicDetails } from '../types/core';
import { Manifest, ManifestOptions } from '../types/repository';
import { deckRepository } from '../infrastructure/di';
import { useFeatureFlagsStore } from '../store/featureFlagsStore';

const DEFAULT_STALE_TIME = Number.POSITIVE_INFINITY;

/** Canonical TanStack Query key for topic deck cards (see `useTopicCardQueries`). */
export function topicCardsQueryKey(subjectId: string, topicId: string) {
  return ['content', 'topic-cards', subjectId, topicId] as const;
}

export function useManifest(options: ManifestOptions = {}): UseQueryResult<Manifest, Error> {
  const pregeneratedCurriculumsVisible = useFeatureFlagsStore((s) => s.pregeneratedCurriculumsVisible);
  const includePregeneratedCurriculums =
    options.includePregeneratedCurriculums ?? pregeneratedCurriculumsVisible;

  return useQuery({
    queryKey: ['content', 'subjects', includePregeneratedCurriculums] as const,
    queryFn: async (): Promise<Manifest> =>
      deckRepository.getManifest({ includePregeneratedCurriculums }),
    staleTime: DEFAULT_STALE_TIME,
  });
}

export function useSubjectGraph(subjectId: string): UseQueryResult<SubjectGraph, Error> {
  return useQuery({
    queryKey: ['content', 'subject', subjectId, 'graph'] as const,
    queryFn: async (): Promise<SubjectGraph> => deckRepository.getSubjectGraph(subjectId),
    staleTime: DEFAULT_STALE_TIME,
    enabled: Boolean(subjectId),
  });
}

export function useSubjectGraphs(subjectIds: string[]): UseQueryResult<SubjectGraph[], Error> {
  return useQuery({
    queryKey: ['content', 'subject', 'graphs', ...subjectIds] as const,
    queryFn: async (): Promise<SubjectGraph[]> => Promise.all(subjectIds.map((subjectId) => deckRepository.getSubjectGraph(subjectId))),
    staleTime: DEFAULT_STALE_TIME,
    enabled: subjectIds.length > 0,
  });
}

export function topicDetailsQueryKey(subjectId: string, topicId: string) {
  return ['content', 'topic', subjectId, topicId, 'details'] as const;
}

export function useTopicDetails(subjectId: string, topicId: string): UseQueryResult<TopicDetails, Error> {
  return useQuery({
    queryKey: topicDetailsQueryKey(subjectId, topicId),
    queryFn: async (): Promise<TopicDetails> => deckRepository.getTopicDetails(subjectId, topicId),
    staleTime: DEFAULT_STALE_TIME,
    enabled: Boolean(subjectId) && Boolean(topicId),
  });
}

export function useTopicCards(subjectId: string, topicId: string): UseQueryResult<Card[], Error> {
  return useQuery({
    queryKey: topicCardsQueryKey(subjectId, topicId),
    queryFn: async (): Promise<Card[]> => deckRepository.getTopicCards(subjectId, topicId),
    staleTime: DEFAULT_STALE_TIME,
    enabled: Boolean(subjectId) && Boolean(topicId),
  });
}
