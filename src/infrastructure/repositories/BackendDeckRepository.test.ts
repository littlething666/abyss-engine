import { describe, expect, it, vi } from 'vitest';
import { BackendDeckRepository } from './BackendDeckRepository';
import type { ApiClient } from '../http/apiClient';

function makeHttp(responses: Record<string, unknown>): ApiClient & { get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async (path: string) => {
    if (!(path in responses)) {
      throw new Error(`Unexpected path ${path}`);
    }
    return responses[path];
  });

  return {
    baseUrl: 'https://worker.test',
    deviceId: 'device-1',
    get,
    post: vi.fn(),
    put: vi.fn(),
  } as unknown as ApiClient & { get: ReturnType<typeof vi.fn> };
}

const subjectEnvelope = {
  description: 'A focused math path.',
  color: '#6366f1',
  geometry: { gridTile: 'box' },
  topicIds: ['limits'],
  metadata: { checklist: { topicName: 'Math' } },
};

describe('BackendDeckRepository', () => {
  it('maps backend manifest rows to frontend subjects and hides bundled subjects by default', async () => {
    const http = makeHttp({
      '/v1/library/manifest': {
        subjects: [
          {
            deviceId: 'device-1',
            subjectId: 'math',
            title: 'Mathematics',
            metadata: { subject: subjectEnvelope },
            contentSource: 'generated',
            createdByRunId: 'run-1',
            createdAt: '2026-05-07T00:00:00Z',
            updatedAt: '2026-05-07T00:00:00Z',
          },
          {
            deviceId: 'device-1',
            subjectId: 'manual-history',
            title: 'Manual History',
            metadata: { subject: { ...subjectEnvelope, description: 'Manual.' } },
            contentSource: 'manual',
            createdByRunId: null,
            createdAt: '2026-05-07T00:00:00Z',
            updatedAt: '2026-05-07T00:00:00Z',
          },
          {
            deviceId: 'device-1',
            subjectId: 'bundled-physics',
            title: 'Bundled Physics',
            metadata: { subject: { ...subjectEnvelope, description: 'Bundled.' } },
            contentSource: 'bundled',
            createdByRunId: null,
            createdAt: '2026-05-07T00:00:00Z',
            updatedAt: '2026-05-07T00:00:00Z',
          },
        ],
      },
    });
    const repo = new BackendDeckRepository({ http });

    await expect(repo.getManifest()).resolves.toEqual({
      subjects: [
        {
          id: 'math',
          name: 'Mathematics',
          description: 'A focused math path.',
          color: '#6366f1',
          geometry: { gridTile: 'box' },
          topicIds: ['limits'],
          metadata: { checklist: { topicName: 'Math' } },
          contentSource: 'generated',
        },
        {
          id: 'manual-history',
          name: 'Manual History',
          description: 'Manual.',
          color: '#6366f1',
          geometry: { gridTile: 'box' },
          topicIds: ['limits'],
          metadata: { checklist: { topicName: 'Math' } },
          contentSource: 'manual',
        },
      ],
    });
    await expect(repo.getManifest({ includePregeneratedCurriculums: true })).resolves.toHaveProperty('subjects.length', 3);
  });

  it('fails loudly when backend manifest metadata lacks the frontend subject envelope', async () => {
    const http = makeHttp({
      '/v1/library/manifest': {
        subjects: [
          {
            deviceId: 'device-1',
            subjectId: 'math',
            title: 'Mathematics',
            metadata: { themeId: 'blue' },
            contentSource: 'generated',
            createdByRunId: 'run-1',
            createdAt: '2026-05-07T00:00:00Z',
            updatedAt: '2026-05-07T00:00:00Z',
          },
        ],
      },
    });

    await expect(new BackendDeckRepository({ http }).getManifest()).rejects.toThrow(
      /metadata\.subject must be a JSON object/,
    );
  });

  it('reads graph, details, and cards from encoded Learning Content routes', async () => {
    const graph = {
      subjectId: 'math/advanced',
      title: 'Math',
      themeId: 'math',
      maxTier: 1,
      nodes: [
        {
          topicId: 'limits & continuity',
          title: 'Limits',
          iconName: 'calculator',
          tier: 1,
          prerequisites: [],
          learningObjective: 'Understand limits.',
        },
      ],
    };
    const details = {
      subjectId: 'math/advanced',
      topicId: 'limits & continuity',
      title: 'Limits',
      coreConcept: 'Approach.',
      theory: 'Limits describe approach.',
      keyTakeaways: ['Approach matters.'],
    };
    const card = {
      id: 'card-1',
      type: 'FLASHCARD',
      difficulty: 1,
      content: { front: 'Limit?', back: 'Approach.' },
    };
    const http = makeHttp({
      '/v1/subjects/math%2Fadvanced/graph': { graph },
      '/v1/subjects/math%2Fadvanced/topics/limits%20%26%20continuity/details': { details },
      '/v1/subjects/math%2Fadvanced/topics/limits%20%26%20continuity/cards': {
        cards: [{ cardId: 'card-1', card }],
      },
    });
    const repo = new BackendDeckRepository({ http });

    await expect(repo.getSubjectGraph('math/advanced')).resolves.toBe(graph);
    await expect(repo.getTopicDetails('math/advanced', 'limits & continuity')).resolves.toBe(details);
    await expect(repo.getTopicCards('math/advanced', 'limits & continuity')).resolves.toEqual([card]);
  });

  it('fails loudly when a topic card wrapper and embedded card disagree', async () => {
    const http = makeHttp({
      '/v1/subjects/math/topics/limits/cards': {
        cards: [{ cardId: 'card-1', card: { id: 'card-2', type: 'FLASHCARD', difficulty: 1, content: {} } }],
      },
    });

    await expect(new BackendDeckRepository({ http }).getTopicCards('math', 'limits')).rejects.toThrow(
      /card row id mismatch/,
    );
  });
});
