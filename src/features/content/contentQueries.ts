import { UseQueryResult } from '@tanstack/react-query';
import { Subject, SubjectGraph } from '../../types/core';
import type { ManifestOptions } from '../../types/repository';
import {
  useManifest,
  useSubjectGraph,
  useSubjectGraphs as useSubjectGraphsFromRepo,
  useTopicDetails,
  useTopicCards,
} from '../../hooks/useDeckData';

export { useManifest, useSubjectGraph, useTopicDetails, useTopicCards };

export function useSubjects(options: ManifestOptions = {}): UseQueryResult<Subject[], Error> {
  const manifestQuery = useManifest(options);
  return {
    ...manifestQuery,
    data: manifestQuery.data?.subjects ?? [],
  } as unknown as UseQueryResult<Subject[], Error>;
}

export function useSubjectGraphs(subjectIds: string[]): UseQueryResult<SubjectGraph[], Error> {
  return useSubjectGraphsFromRepo(subjectIds);
}
