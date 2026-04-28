import type { IDeckRepository, Manifest, ManifestOptions } from '../../types/repository';
import type { Card, SubjectGraph, TopicDetails } from '../../types/core';
import {
  fetchManifest,
  fetchSubjectGraph,
  fetchTopicDetails,
  fetchTopicCards,
} from '../deckDb/deckStaticFetch';

/** Direct HTTP reads (no IndexedDB). Useful for tooling or alternate DI wiring. */
export class ApiDeckRepository implements IDeckRepository {
  async getManifest(options: ManifestOptions = {}): Promise<Manifest> {
    const manifest = await fetchManifest();
    if (options.includePregeneratedCurriculums ?? false) {
      return manifest;
    }
    return { subjects: [] };
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
