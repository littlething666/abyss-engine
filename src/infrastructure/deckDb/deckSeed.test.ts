import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { GraphPrerequisiteEntry } from '@/types/core';

import { deckDb } from './deckDb';
import { ensureDeckSeeded, resetDeckInfrastructureForTests, resetDeckSeedSingletonForTests } from './deckSeed';

describe('ensureDeckSeeded', () => {
  beforeEach(async () => {
    await resetDeckInfrastructureForTests();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches manifest and graph then writes meta version (empty graph)', async () => {
    const manifestBody = {
      subjects: [
        {
          id: 'sub-x',
          name: 'X',
          description: '',
          color: '#fff',
          geometry: { gridTile: 'box' },
        },
      ],
    };
    const graphBody = {
      subjectId: 'sub-x',
      title: 'X',
      themeId: 'sub-x',
      maxTier: 0,
      nodes: [] as {
        topicId: string;
        title: string;
        tier: number;
        prerequisites: GraphPrerequisiteEntry[];
        learningObjective: string;
      }[],
    };

    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('manifest.json')) {
        return Promise.resolve(new Response(JSON.stringify(manifestBody), { status: 200 }));
      }
      if (url.includes('/graph.json')) {
        return Promise.resolve(new Response(JSON.stringify(graphBody), { status: 200 }));
      }
      return Promise.resolve(new Response('missing', { status: 404 }));
    });

    await ensureDeckSeeded();

    const subjects = await deckDb.subjects.toArray();
    expect(subjects).toHaveLength(1);
    expect(subjects[0]?.id).toBe('sub-x');
    expect(subjects[0]?.contentSource).toBe('bundled');

    const version = await deckDb.meta.get('bundledContentVersion');
    expect(version?.value).toBeDefined();
  });

  it('skips network when bundled version already matches', async () => {
    const manifestBody = { subjects: [] };
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(manifestBody), { status: 200 })),
    );

    await ensureDeckSeeded();
    const callsAfterFirst = vi.mocked(fetch).mock.calls.length;

    resetDeckSeedSingletonForTests();
    await ensureDeckSeeded();
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsAfterFirst);
  });

  it('preserves generated subjects while replacing bundled seed rows on reseed', async () => {
    await deckDb.subjects.put({
      id: 'bundled-old',
      name: 'Bundled Old',
      description: '',
      color: '#111',
      geometry: { gridTile: 'box' },
      contentSource: 'bundled',
    });
    await deckDb.subjects.put({
      id: 'generated-keep',
      name: 'Generated Keep',
      description: '',
      color: '#222',
      geometry: { gridTile: 'sphere' },
      contentSource: 'generated',
      metadata: {
        checklist: { topicName: 'Generated Keep' },
        strategy: {
          graph: {
            totalTiers: 1,
            topicsPerTier: 1,
            audienceBrief: '',
            domainBrief: '',
            focusConstraints: '',
          },
          content: {
            theoryDepth: 'standard',
            cardMix: { flashcardWeight: 1, choiceWeight: 0, miniGameWeight: 0 },
            difficultyBias: 'balanced',
            cognitiveModeMix: { understand: 1 },
            forbiddenPatterns: ['trivia-only'],
            contentBrief: '',
          },
        },
      },
    });
    await deckDb.graphs.put({
      subjectId: 'bundled-old',
      title: 'Bundled Old',
      themeId: 'bundled-old',
      maxTier: 0,
      nodes: [],
    });
    await deckDb.graphs.put({
      subjectId: 'generated-keep',
      title: 'Generated Keep',
      themeId: 'generated-keep',
      maxTier: 0,
      nodes: [],
    });
    await deckDb.meta.put({ key: 'subjectIdsOrdered', value: ['bundled-old', 'generated-keep'] });
    await deckDb.meta.put({ key: 'bundledContentVersion', value: 'outdated-version' });

    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('manifest.json')) {
        return Promise.resolve(new Response(JSON.stringify({
          subjects: [
            {
              id: 'bundled-new',
              name: 'Bundled New',
              description: '',
              color: '#fff',
              geometry: { gridTile: 'plane' },
            },
          ],
        }), { status: 200 }));
      }
      if (url.includes('/bundled-new/graph.json')) {
        return Promise.resolve(new Response(JSON.stringify({
          subjectId: 'bundled-new',
          title: 'Bundled New',
          themeId: 'bundled-new',
          maxTier: 0,
          nodes: [],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('missing', { status: 404 }));
    });

    await ensureDeckSeeded();

    const subjects = await deckDb.subjects.orderBy('id').toArray();
    expect(subjects.map((subject) => `${subject.id}:${subject.contentSource}`)).toEqual([
      'bundled-new:bundled',
      'generated-keep:generated',
    ]);

    const graphIds = (await deckDb.graphs.toArray()).map((graph) => graph.subjectId).sort();
    expect(graphIds).toEqual(['bundled-new', 'generated-keep']);

    const orderRow = await deckDb.meta.get('subjectIdsOrdered');
    expect(orderRow?.value).toEqual(['generated-keep', 'bundled-new']);
  });
});
