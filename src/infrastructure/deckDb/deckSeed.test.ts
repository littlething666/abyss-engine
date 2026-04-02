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
});
