import { logDeckIndexedDb } from '../deckDb/deckDbDebugLog';
import { ensureDeckSeeded } from '../deckDb/deckSeed';
import { deckDb, topicCompositeKey } from '../deckDb/deckDb';
import type { IDeckRepository, Manifest } from '../../types/repository';
import type { Card, Subject, SubjectGraph, TopicDetails } from '../../types/core';

export class IndexedDbDeckRepository implements IDeckRepository {
  async getManifest(): Promise<Manifest> {
    await ensureDeckSeeded();
    const orderRow = await deckDb.meta.get('subjectIdsOrdered');
    const order = (orderRow?.value as string[] | undefined) ?? [];
    const rows = await deckDb.subjects.toArray();
    const byId = new Map(rows.map((s) => [s.id, s]));
    const subjects: Subject[] = order
      .map((id) => byId.get(id))
      .filter((s): s is Subject => Boolean(s));
    if (subjects.length === 0 && rows.length > 0) {
      const fallback = rows.sort((a, b) => a.id.localeCompare(b.id));
      logDeckIndexedDb('IndexedDB', {
        method: 'getManifest',
        ops: 'meta.get(subjectIdsOrdered)+subjects.toArray',
        subjectCount: fallback.length,
        order: 'sorted-id-fallback',
      });
      return { subjects: fallback };
    }
    logDeckIndexedDb('IndexedDB', {
      method: 'getManifest',
      ops: 'meta.get(subjectIdsOrdered)+subjects.toArray',
      subjectCount: subjects.length,
    });
    return { subjects };
  }

  async getSubjectGraph(subjectId: string): Promise<SubjectGraph> {
    await ensureDeckSeeded();
    const graph = await deckDb.graphs.get(subjectId);
    if (!graph) {
      throw new Error(`No subject graph in IndexedDB for ${subjectId}`);
    }
    logDeckIndexedDb('IndexedDB', {
      method: 'getSubjectGraph',
      ops: 'graphs.get',
      subjectId,
      nodeCount: graph.nodes.length,
    });
    return graph;
  }

  async getTopicDetails(subjectId: string, topicId: string): Promise<TopicDetails> {
    await ensureDeckSeeded();
    const key = topicCompositeKey(subjectId, topicId);
    const row = await deckDb.topics.get(key);
    if (!row) {
      throw new Error(`No topic details in IndexedDB for ${subjectId}/${topicId}`);
    }
    logDeckIndexedDb('IndexedDB', { method: 'getTopicDetails', ops: 'topics.get', subjectId, topicId, key });
    return row.details;
  }

  async getTopicCards(subjectId: string, topicId: string): Promise<Card[]> {
    await ensureDeckSeeded();
    const key = topicCompositeKey(subjectId, topicId);
    const row = await deckDb.topicCards.get(key);
    const count = row?.cards?.length ?? 0;
    logDeckIndexedDb('IndexedDB', {
      method: 'getTopicCards',
      ops: 'topicCards.get',
      subjectId,
      topicId,
      cardCount: count,
    });
    return row?.cards ?? [];
  }
}
