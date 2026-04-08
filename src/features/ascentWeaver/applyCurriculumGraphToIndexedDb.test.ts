import { describe, expect, it, vi } from 'vitest';

import type { IDeckContentWriter } from '../../types/repository';
import type { Subject, SubjectGraph } from '../../types/core';

import { applyCurriculumGraphToIndexedDb } from './applyCurriculumGraphToIndexedDb';

describe('applyCurriculumGraphToIndexedDb', () => {
  it('writes subject, graph, stub details, and empty cards in order', async () => {
    const calls: string[] = [];
    const writer: IDeckContentWriter = {
      upsertSubject: vi.fn(async () => {
        calls.push('subject');
      }),
      upsertGraph: vi.fn(async () => {
        calls.push('graph');
      }),
      upsertTopicDetails: vi.fn(async () => {
        calls.push('details');
      }),
      upsertTopicCards: vi.fn(async () => {
        calls.push('cards');
      }),
      appendTopicCards: vi.fn(),
    };

    const subject: Subject = {
      id: 's1',
      name: 'S',
      description: 'D',
      color: '#000',
      geometry: { gridTile: 'box' },
    };

    const graph: SubjectGraph = {
      subjectId: 's1',
      title: 'G',
      themeId: 's1',
      maxTier: 1,
      nodes: [
        {
          topicId: 'a-topic',
          title: 'A',
          tier: 1,
          prerequisites: [],
          learningObjective: 'Obj',
        },
      ],
    };

    await applyCurriculumGraphToIndexedDb(writer, { subject, graph });

    expect(calls).toEqual(['subject', 'graph', 'details', 'cards']);
    expect(writer.upsertTopicDetails).toHaveBeenCalledWith({
      topicId: 'a-topic',
      title: 'A',
      subjectId: 's1',
      coreConcept: 'Obj',
      theory: '',
      keyTakeaways: [],
    });
    expect(writer.upsertTopicCards).toHaveBeenCalledWith('s1', 'a-topic', []);
  });

  it('throws when subject id does not match graph', async () => {
    const writer: IDeckContentWriter = {
      upsertSubject: vi.fn(),
      upsertGraph: vi.fn(),
      upsertTopicDetails: vi.fn(),
      upsertTopicCards: vi.fn(),
      appendTopicCards: vi.fn(),
    };
    const subject: Subject = {
      id: 'a',
      name: 'S',
      description: 'D',
      color: '#000',
      geometry: { gridTile: 'box' },
    };
    const graph: SubjectGraph = {
      subjectId: 'b',
      title: 'G',
      themeId: 'b',
      maxTier: 1,
      nodes: [],
    };
    await expect(applyCurriculumGraphToIndexedDb(writer, { subject, graph })).rejects.toThrow(
      /does not match graph\.subjectId/,
    );
  });
});
