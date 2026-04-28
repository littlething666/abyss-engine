import { logDeckIndexedDb } from './deckDb/deckDbDebugLog';
import { pubSubClient } from './pubsub';
import { ensureDeckSeeded } from './deckDb/deckSeed';
import { deckDb, topicCompositeKey, type DeckContentSource, type DeckSubjectRow } from './deckDb/deckDb';
import type { IDeckContentWriter } from '../types/repository';
import type { Card, Subject, SubjectGraph, TopicDetails } from '../types/core';

async function upsertSubject(
  subject: Subject & { themeId?: string; contentSource?: DeckContentSource },
): Promise<void> {
  await ensureDeckSeeded();
  logDeckIndexedDb('write', { op: 'transaction:rw', stores: ['subjects', 'meta'], action: 'upsertSubject', subjectId: subject.id });
  await deckDb.transaction('rw', deckDb.subjects, deckDb.meta, async () => {
    const existing = await deckDb.subjects.get(subject.id);
    const row: DeckSubjectRow = {
      ...(subject as Omit<DeckSubjectRow, 'contentSource'>),
      contentSource: subject.contentSource ?? existing?.contentSource ?? 'generated',
    };
    await deckDb.subjects.put(row);
    const orderRow = await deckDb.meta.get('subjectIdsOrdered');
    const order = (orderRow?.value as string[] | undefined) ?? [];
    if (!order.includes(subject.id)) {
      await deckDb.meta.put({ key: 'subjectIdsOrdered', value: [...order, subject.id] });
    }
  });
  pubSubClient.emit({ type: 'subject-updated', subjectId: subject.id });
}

async function upsertGraph(graph: SubjectGraph): Promise<void> {
  await ensureDeckSeeded();
  logDeckIndexedDb('write', { op: 'graphs.put', subjectId: graph.subjectId, nodeCount: graph.nodes.length });
  await deckDb.graphs.put(graph);
  pubSubClient.emit({ type: 'subject-updated', subjectId: graph.subjectId });
}

async function upsertTopicDetails(details: TopicDetails): Promise<void> {
  await ensureDeckSeeded();
  const key = topicCompositeKey(details.subjectId, details.topicId);
  logDeckIndexedDb('write', { op: 'topics.put', key });
  await deckDb.topics.put({
    key,
    subjectId: details.subjectId,
    topicId: details.topicId,
    details,
  });
  pubSubClient.emit({
    type: 'topic-updated',
    subjectId: details.subjectId,
    topicId: details.topicId,
  });
}

function mergeTopicCards(prior: Card[], incoming: Card[]): Card[] {
  const merged = prior.map((c) => {
    const next = incoming.find((i) => i.id === c.id);
    return next ?? c;
  });
  const priorIds = new Set(prior.map((c) => c.id));
  for (const c of incoming) {
    if (!priorIds.has(c.id)) {
      merged.push(c);
    }
  }
  return merged;
}

async function upsertTopicCards(subjectId: string, topicId: string, cards: Card[]): Promise<void> {
  await ensureDeckSeeded();
  const key = topicCompositeKey(subjectId, topicId);
  logDeckIndexedDb('write', { op: 'topicCards.put', key, cardCount: cards.length });
  await deckDb.topicCards.put({ key, subjectId, topicId, cards });
  pubSubClient.emit({ type: 'cards-updated', subjectId, topicId });
}

async function appendTopicCards(subjectId: string, topicId: string, cards: Card[]): Promise<void> {
  await ensureDeckSeeded();
  const key = topicCompositeKey(subjectId, topicId);
  const row = await deckDb.topicCards.get(key);
  const prior = row?.cards ?? [];
  const merged = mergeTopicCards(prior, cards);
  logDeckIndexedDb('write', { op: 'topicCards.append', key, priorCount: prior.length, addedCount: cards.length, mergedCount: merged.length });
  await deckDb.topicCards.put({ key, subjectId, topicId, cards: merged });
  pubSubClient.emit({ type: 'cards-updated', subjectId, topicId });
}

export const deckContentWriter: IDeckContentWriter = {
  upsertSubject,
  upsertGraph,
  upsertTopicDetails,
  upsertTopicCards,
  appendTopicCards,
};

export { mergeTopicCards };
