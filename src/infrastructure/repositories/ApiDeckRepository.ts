import type { IDeckRepository, Manifest } from '../../types/repository';
import type { Card, SubjectGraph, TopicDetails } from '../../types/core';
import {
  fetchManifest,
  fetchSubjectGraph,
  fetchTopicDetails,
  fetchTopicCards,
} from '../deckDb/deckStaticFetch';

/** Direct HTTP reads (no IndexedDB). Useful for tooling or alternate DI wiring. */
export class ApiDeckRepository implements IDeckRepository {
  async getManifest(): Promise<Manifest> {
    return fetchManifest();
  }

  async getSubjectGraph(subjectId: string): Promise<SubjectGraph> {
    return fetchSubjectGraph(subjectId);
  }

  async getTopicDetails(subjectId: string, topicId: string): Promise<TopicDetails> {
    return fetchTopicDetails(subjectId, topicId);
  }

  async getTopicCards(subjectId: string, topicId: string): Promise<Card[]> {
    return fetchTopicCards(subjectId, topicId);
  }
}
