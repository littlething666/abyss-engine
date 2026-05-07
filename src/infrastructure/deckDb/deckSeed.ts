import Dexie from 'dexie';

import { logDeckIndexedDb } from './deckDbDebugLog';
import { BUNDLED_DECK_CONTENT_VERSION } from '../deckContentVersion';
import {
  deckDb,
  topicCompositeKey,
  type DeckContentSource,
  type DeckSubjectRow,
  type TopicCardsRow,
  type TopicRow,
} from './deckDb';
import {
  fetchManifest,
  fetchSubjectGraph,
  fetchTopicCards,
  fetchTopicDetails,
} from './deckStaticFetch';

import type { SubjectGraph } from '../../types/core';

let seedPromise: Promise<void> | null = null;

function withContentSource(
  subject: Omit<DeckSubjectRow, 'contentSource'>,
  contentSource: DeckContentSource,
): DeckSubjectRow {
  return {
    ...subject,
    contentSource,
  };
}

export function resetDeckSeedSingletonForTests(): void {
  seedPromise = null;
}

export async function resetDeckInfrastructureForTests(): Promise<void> {
  resetDeckSeedSingletonForTests();
  logDeckIndexedDb('resetDeckInfrastructureForTests', { action: 'Dexie.delete', name: 'abyss-deck' });
  deckDb.close();
  await Dexie.delete('abyss-deck');
  await deckDb.open();
}

async function loadAllSeedData(): Promise<{
  subjects: DeckSubjectRow[];
  subjectIdsOrdered: string[];
  graphs: SubjectGraph[];
  topicRows: TopicRow[];
  cardRows: TopicCardsRow[];
}> {
  const manifest = await fetchManifest();
  const subjects = manifest.subjects.map((subject) => withContentSource(subject as Omit<DeckSubjectRow, 'contentSource'>, 'bundled'));
  const subjectIdsOrdered = subjects.map((s) => s.id);
  const graphs: SubjectGraph[] = [];
  const topicRows: TopicRow[] = [];
  const cardRows: TopicCardsRow[] = [];

  for (const subject of subjects) {
    const graph = await fetchSubjectGraph(subject.id);
    graphs.push(graph);

    const tasks = graph.nodes.map(async (node) => {
      const topicId = node.topicId;
      const [details, cards] = await Promise.all([
        fetchTopicDetails(subject.id, topicId),
        fetchTopicCards(subject.id, topicId),
      ]);
      const key = topicCompositeKey(subject.id, topicId);
      const topicRow: TopicRow = { key, subjectId: subject.id, topicId, details };
      const cardRow: TopicCardsRow = { key, subjectId: subject.id, topicId, cards };
      return { topicRow, cardRow };
    });

    const results = await Promise.all(tasks);
    for (const r of results) {
      topicRows.push(r.topicRow);
      cardRows.push(r.cardRow);
    }
  }

  return { subjects, subjectIdsOrdered, graphs, topicRows, cardRows };
}

function partitionOrderedSubjectIds(rows: DeckSubjectRow[], order: string[]): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = order.filter((id) => byId.has(id));
  const seen = new Set(ordered);
  const extras = rows
    .map((row) => row.id)
    .filter((id) => !seen.has(id))
    .sort((a, b) => a.localeCompare(b));
  return [...ordered, ...extras];
}

async function writeSeedToDb(data: Awaited<ReturnType<typeof loadAllSeedData>>): Promise<void> {
  logDeckIndexedDb('writeSeedToDb:start', {
    subjects: data.subjects.length,
    graphs: data.graphs.length,
    topics: data.topicRows.length,
    topicCardGroups: data.cardRows.length,
  });
  await deckDb.transaction(
    'rw',
    [deckDb.subjects, deckDb.graphs, deckDb.topics, deckDb.topicCards, deckDb.meta],
    async () => {
      const existingSubjects = await deckDb.subjects.toArray();
      const existingOrderRow = await deckDb.meta.get('subjectIdsOrdered');
      const existingOrder = (existingOrderRow?.value as string[] | undefined) ?? [];
      const existingBundledIds = existingSubjects
        .filter((subject) => subject.contentSource === 'bundled')
        .map((subject) => subject.id);
      const existingUserOwnedRows = existingSubjects.filter(
        (subject) => subject.contentSource === 'generated' || subject.contentSource === 'manual',
      );
      const userOwnedIdsOrdered = partitionOrderedSubjectIds(existingUserOwnedRows, existingOrder);

      logDeckIndexedDb('writeSeedToDb:transaction', {
        op: 'replace-bundled-only',
        bundledSubjectCount: existingBundledIds.length,
        userOwnedSubjectCount: existingUserOwnedRows.length,
      });

      for (const subjectId of existingBundledIds) {
        await deckDb.subjects.delete(subjectId);
        await deckDb.graphs.delete(subjectId);
        await deckDb.topics.where('subjectId').equals(subjectId).delete();
        await deckDb.topicCards.where('subjectId').equals(subjectId).delete();
      }

      for (const s of data.subjects) {
        await deckDb.subjects.put(s);
      }
      for (const g of data.graphs) {
        await deckDb.graphs.put(g);
      }
      for (const t of data.topicRows) {
        await deckDb.topics.put(t);
      }
      for (const c of data.cardRows) {
        await deckDb.topicCards.put(c);
      }

      await deckDb.meta.put({ key: 'bundledContentVersion', value: BUNDLED_DECK_CONTENT_VERSION });
      await deckDb.meta.put({
        key: 'subjectIdsOrdered',
        value: [...userOwnedIdsOrdered, ...data.subjectIdsOrdered],
      });
      await deckDb.meta.put({ key: 'seededAt', value: Date.now() });
    },
  );
  logDeckIndexedDb('writeSeedToDb:done', { version: BUNDLED_DECK_CONTENT_VERSION });
}

async function runEnsureDeckSeeded(): Promise<void> {
  logDeckIndexedDb('ensureDeckSeeded', { op: 'deckDb.open' });
  await deckDb.open();
  logDeckIndexedDb('read', { op: 'meta.get', key: 'bundledContentVersion' });
  const row = await deckDb.meta.get('bundledContentVersion');
  if (row?.value === BUNDLED_DECK_CONTENT_VERSION) {
    logDeckIndexedDb('ensureDeckSeeded:skip', { bundledVersion: row.value });
    return;
  }
  logDeckIndexedDb('ensureDeckSeeded:fetch-static', { reason: 'version-mismatch-or-empty', stored: row?.value ?? null });
  const data = await loadAllSeedData();
  await writeSeedToDb(data);
}

export function ensureDeckSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runEnsureDeckSeeded();
  }
  return seedPromise;
}
