import { describe, expect, it } from 'vitest';
import { ActiveCrystal } from '../../types/core';
import { Card } from '../../types/core';
import { TopicMetadata } from '../content/selectors';
import { resolveActiveCard, buildPriorKnowledgeLines } from './studyPanelState';

describe('studyPanelState helpers', () => {
  it('builds prioritized prior knowledge lines from active crystals', () => {
    const crystals: ActiveCrystal[] = [
      { topicId: 'topic-c', xp: 190, gridPosition: [0, 0], spawnedAt: Date.now() },
      { topicId: 'topic-a', xp: 120, gridPosition: [1, 1], spawnedAt: Date.now() },
      { topicId: 'topic-b', xp: 140, gridPosition: [2, 2], spawnedAt: Date.now() },
    ];

    const metadata: Record<string, TopicMetadata> = {
      'topic-a': { subjectId: 'sub', subjectName: 'Subject A', topicName: 'Topic A' },
      'topic-b': { subjectId: 'sub', subjectName: 'Subject A', topicName: 'Topic B' },
      'topic-c': { subjectId: 'sub', subjectName: 'Subject A', topicName: 'Topic C' },
    };

    expect(buildPriorKnowledgeLines(crystals, ['topic-c', 'topic-a', 'topic-b'], metadata)).toBe(
      '- Topic A - Level 1\n- Topic B - Level 1\n- Topic C - Level 1',
    );
  });

  it('resolves active card from session card id before current card id', () => {
    const cards: Card[] = [
      { id: 'card-1', type: 'FLASHCARD', difficulty: 1, content: { front: 'front', back: 'back' } },
      { id: 'card-2', type: 'SINGLE_CHOICE', difficulty: 1, content: { question: 'q', options: ['a'], correctAnswer: 'a', explanation: 'e' } },
    ];

    const resolved = resolveActiveCard(cards, 'card-2', 'card-1');
    expect(resolved?.id).toBe('card-2');
  });
});
