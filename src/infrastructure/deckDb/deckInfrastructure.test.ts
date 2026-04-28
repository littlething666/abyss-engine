import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { deckContentWriter } from '../deckContentWriter';
import { pubSubClient } from '../pubsub';
import { IndexedDbDeckRepository } from '../repositories/IndexedDbDeckRepository';
import { resetDeckIndexedDbDebugSyncForTests } from './deckDbDebugLog';
import { primeDeckDbForTests } from './deckTestFixtures';
import { resetDeckInfrastructureForTests } from './deckSeed';

import type { Card } from '../../types/core';

const subjectRow = {
  id: 'sub-a',
  name: 'Subject A',
  description: 'd',
  color: '#000',
  geometry: { gridTile: 'box' as const },
  contentSource: 'generated' as const,
};

const graph = {
  subjectId: 'sub-a',
  title: 'Subject A',
  themeId: 'sub-a',
  maxTier: 1,
  nodes: [{ topicId: 'top-1', title: 'T1', tier: 0, prerequisites: [], learningObjective: '' }],
};

const topicDetails = {
  topicId: 'top-1',
  title: 'Topic One',
  subjectId: 'sub-a',
  coreConcept: '',
  theory: '',
  keyTakeaways: [] as string[],
};

const card: Card = {
  id: 'c1',
  type: 'FLASHCARD',
  difficulty: 1,
  content: { front: 'q', back: 'a' },
};

describe('IndexedDB deck', () => {
  const repo = new IndexedDbDeckRepository();

  beforeEach(async () => {
    await primeDeckDbForTests({
      subjects: [subjectRow],
      graphs: [graph],
      topicDetails: [topicDetails],
      topicCards: [{ subjectId: 'sub-a', topicId: 'top-1', cards: [card] }],
    });
  });

  afterEach(async () => {
    await resetDeckInfrastructureForTests();
    resetDeckIndexedDbDebugSyncForTests();
    pubSubClient.disconnect();
  });

  it('returns manifest, graph, topic, and cards from IndexedDB', async () => {
    const manifest = await repo.getManifest();
    expect(manifest.subjects).toEqual([subjectRow]);

    const g = await repo.getSubjectGraph('sub-a');
    expect(g.nodes).toHaveLength(1);

    const details = await repo.getTopicDetails('sub-a', 'top-1');
    expect(details.title).toBe('Topic One');

    const cards = await repo.getTopicCards('sub-a', 'top-1');
    expect(cards).toEqual([card]);
  });

  it('returns empty cards when topic has no card row', async () => {
    await primeDeckDbForTests({
      subjects: [subjectRow],
      graphs: [graph],
      topicDetails: [topicDetails],
      topicCards: [],
    });

    const cards = await repo.getTopicCards('sub-a', 'top-1');
    expect(cards).toEqual([]);
  });

  it('hides bundled subjects by default and shows generated first when enabled', async () => {
    await primeDeckDbForTests({
      subjects: [
        {
          id: 'bundled-a',
          name: 'Bundled A',
          description: '',
          color: '#111',
          geometry: { gridTile: 'box' },
          contentSource: 'bundled',
        },
        {
          id: 'generated-a',
          name: 'Generated A',
          description: '',
          color: '#222',
          geometry: { gridTile: 'sphere' },
          contentSource: 'generated',
        },
        {
          id: 'bundled-b',
          name: 'Bundled B',
          description: '',
          color: '#333',
          geometry: { gridTile: 'plane' },
          contentSource: 'bundled',
        },
        {
          id: 'generated-b',
          name: 'Generated B',
          description: '',
          color: '#444',
          geometry: { gridTile: 'cylinder' },
          contentSource: 'generated',
        },
      ],
      graphs: [],
      topicDetails: [],
      topicCards: [],
    });

    const hiddenManifest = await repo.getManifest();
    expect(hiddenManifest.subjects.map((subject) => subject.id)).toEqual(['generated-a', 'generated-b']);

    const visibleManifest = await repo.getManifest({ includePregeneratedCurriculums: true });
    expect(visibleManifest.subjects.map((subject) => subject.id)).toEqual([
      'generated-a',
      'generated-b',
      'bundled-a',
      'bundled-b',
    ]);
  });

  it('deckContentWriter upserts cards and emits pubsub', async () => {
    const emitSpy = vi.spyOn(pubSubClient, 'emit');
    const newCard: Card = {
      id: 'c2',
      type: 'FLASHCARD',
      difficulty: 1,
      content: { front: 'n', back: 'm' },
    };

    await deckContentWriter.upsertTopicCards('sub-a', 'top-1', [newCard]);

    const cards = await repo.getTopicCards('sub-a', 'top-1');
    expect(cards).toEqual([newCard]);
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cards-updated', subjectId: 'sub-a', topicId: 'top-1' }),
    );
  });
});
