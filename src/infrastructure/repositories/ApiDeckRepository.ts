import type { IDeckRepository, Manifest, ManifestOptions } from '../../types/repository';
import type { Card, SubjectGraph, TopicDetails } from '../../types/core';
import type { TopicContentStatusRecord } from '../../types/topicContent';
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

  async getTopicContentStatuses(subjectId: string): Promise<TopicContentStatusRecord[]> {
    const graph = await fetchSubjectGraph(subjectId);
    const statuses = await Promise.all(graph.nodes.map(async (node) => {
      const [details, cards] = await Promise.all([
        fetchTopicDetails(subjectId, node.topicId),
        fetchTopicCards(subjectId, node.topicId),
      ]);
      const theory = typeof details.theory === 'string' ? details.theory.trim() : '';
      return {
        subjectId,
        topicId: node.topicId,
        status: theory && cards.some((card) => card.difficulty === 1) ? 'ready' as const : 'unavailable' as const,
      };
    }));
    return statuses;
  }

  async getTopicCards(subjectId: string, topicId: string): Promise<Card[]> {
    return fetchTopicCards(subjectId, topicId);
  }
}
