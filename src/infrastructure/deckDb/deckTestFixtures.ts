import { BUNDLED_DECK_CONTENT_VERSION } from '../deckContentVersion';
import {
  deckDb,
  topicCompositeKey,
  type DeckSubjectRow,
  type TopicCardsRow,
  type TopicRow,
} from './deckDb';
import { resetDeckInfrastructureForTests } from './deckSeed';

import type { Card, SubjectGraph, TopicDetails } from '../../types/core';

export async function primeDeckDbForTests(params: {
  subjects: DeckSubjectRow[];
  graphs: SubjectGraph[];
  topicDetails: TopicDetails[];
  topicCards: { subjectId: string; topicId: string; cards: Card[] }[];
}): Promise<void> {
  await resetDeckInfrastructureForTests();

  const topicRows: TopicRow[] = params.topicDetails.map((d) => ({
    key: topicCompositeKey(d.subjectId, d.topicId),
    subjectId: d.subjectId,
    topicId: d.topicId,
    details: d,
  }));

  const cardRows: TopicCardsRow[] = params.topicCards.map((c) => ({
    key: topicCompositeKey(c.subjectId, c.topicId),
    subjectId: c.subjectId,
    topicId: c.topicId,
    cards: c.cards,
  }));

  await deckDb.transaction(
    'rw',
    [deckDb.subjects, deckDb.graphs, deckDb.topics, deckDb.topicCards, deckDb.meta],
    async () => {
      for (const s of params.subjects) {
        await deckDb.subjects.put(s);
      }
      for (const g of params.graphs) {
        await deckDb.graphs.put(g);
      }
      for (const t of topicRows) {
        await deckDb.topics.put(t);
      }
      for (const c of cardRows) {
        await deckDb.topicCards.put(c);
      }
      await deckDb.meta.put({ key: 'bundledContentVersion', value: BUNDLED_DECK_CONTENT_VERSION });
      await deckDb.meta.put({
        key: 'subjectIdsOrdered',
        value: params.subjects.map((s) => s.id),
      });
    },
  );
}
