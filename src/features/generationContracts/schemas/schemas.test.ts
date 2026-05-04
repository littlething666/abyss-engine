import { describe, it, expect } from 'vitest';

import {
  crystalTrialArtifactSchema,
  subjectGraphEdgesArtifactSchema,
  subjectGraphTopicsArtifactSchema,
  topicExpansionCardsArtifactSchema,
  topicMiniGameCategorySortArtifactSchema,
  topicMiniGameMatchPairsArtifactSchema,
  topicMiniGameSequenceBuildArtifactSchema,
  topicStudyCardsArtifactSchema,
  topicTheoryArtifactSchema,
} from './index';

describe('subjectGraphTopicsArtifactSchema', () => {
  const valid = {
    topics: [
      {
        topicId: 'graph-basics',
        title: 'Graph basics',
        iconName: 'BookOpen',
        tier: 1,
        learningObjective: 'Understand graphs.',
      },
    ],
  };
  it('accepts a minimal valid payload', () => {
    expect(subjectGraphTopicsArtifactSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects extra top-level keys', () => {
    expect(
      subjectGraphTopicsArtifactSchema.safeParse({ ...valid, extra: 1 }).success,
    ).toBe(false);
  });
  it('rejects empty topics array', () => {
    expect(
      subjectGraphTopicsArtifactSchema.safeParse({ topics: [] }).success,
    ).toBe(false);
  });
  it('rejects non-kebab topicId', () => {
    expect(
      subjectGraphTopicsArtifactSchema.safeParse({
        topics: [{ ...valid.topics[0], topicId: 'GraphBasics' }],
      }).success,
    ).toBe(false);
  });
  it('rejects non-positive tier', () => {
    expect(
      subjectGraphTopicsArtifactSchema.safeParse({
        topics: [{ ...valid.topics[0], tier: 0 }],
      }).success,
    ).toBe(false);
  });
  it('rejects extra per-topic keys', () => {
    expect(
      subjectGraphTopicsArtifactSchema.safeParse({
        topics: [{ ...valid.topics[0], evil: true }],
      }).success,
    ).toBe(false);
  });
});

describe('subjectGraphEdgesArtifactSchema', () => {
  it('accepts an empty edges array', () => {
    expect(
      subjectGraphEdgesArtifactSchema.safeParse({ edges: [] }).success,
    ).toBe(true);
  });
  it('accepts edges with optional minLevel', () => {
    expect(
      subjectGraphEdgesArtifactSchema.safeParse({
        edges: [
          { source: 'a', target: 'b' },
          { source: 'a-1', target: 'b-2', minLevel: 2 },
        ],
      }).success,
    ).toBe(true);
  });
  it('rejects non-kebab source', () => {
    expect(
      subjectGraphEdgesArtifactSchema.safeParse({
        edges: [{ source: 'NotKebab', target: 'b' }],
      }).success,
    ).toBe(false);
  });
  it('rejects extra edge keys', () => {
    expect(
      subjectGraphEdgesArtifactSchema.safeParse({
        edges: [{ source: 'a', target: 'b', label: 'bad' }],
      }).success,
    ).toBe(false);
  });
});

describe('topicTheoryArtifactSchema', () => {
  const valid = {
    coreConcept: 'X',
    theory: 'Y',
    keyTakeaways: ['a', 'b', 'c', 'd'],
    coreQuestionsByDifficulty: {
      '1': ['q1'],
      '2': ['q2'],
      '3': ['q3'],
      '4': ['q4'],
    },
  };
  it('accepts a valid payload', () => {
    expect(topicTheoryArtifactSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects fewer than 4 keyTakeaways', () => {
    expect(
      topicTheoryArtifactSchema.safeParse({
        ...valid,
        keyTakeaways: ['a', 'b', 'c'],
      }).success,
    ).toBe(false);
  });
  it('rejects missing difficulty bucket', () => {
    expect(
      topicTheoryArtifactSchema.safeParse({
        ...valid,
        coreQuestionsByDifficulty: { '1': ['q1'], '2': ['q2'], '3': ['q3'] },
      }).success,
    ).toBe(false);
  });
  it('rejects unknown difficulty bucket key', () => {
    expect(
      topicTheoryArtifactSchema.safeParse({
        ...valid,
        coreQuestionsByDifficulty: {
          ...valid.coreQuestionsByDifficulty,
          '5': ['q5'],
        },
      }).success,
    ).toBe(false);
  });
});

describe('topicStudyCardsArtifactSchema', () => {
  const card = {
    id: 'card-1',
    topicId: 'graph-basics',
    type: 'FLASHCARD',
    content: { front: 'Q?', back: 'A.' },
    difficulty: 1,
  };
  it('accepts a valid card array', () => {
    expect(
      topicStudyCardsArtifactSchema.safeParse({ cards: [card] }).success,
    ).toBe(true);
  });
  it('rejects MINI_GAME on the study-cards channel', () => {
    expect(
      topicStudyCardsArtifactSchema.safeParse({
        cards: [{ ...card, type: 'MINI_GAME' }],
      }).success,
    ).toBe(false);
  });
  it('rejects difficulty outside 1..4', () => {
    expect(
      topicStudyCardsArtifactSchema.safeParse({
        cards: [{ ...card, difficulty: 5 }],
      }).success,
    ).toBe(false);
  });
  it('rejects extra card keys', () => {
    expect(
      topicStudyCardsArtifactSchema.safeParse({
        cards: [{ ...card, lurking: 'extra' }],
      }).success,
    ).toBe(false);
  });
  it('rejects empty cards array', () => {
    expect(
      topicStudyCardsArtifactSchema.safeParse({ cards: [] }).success,
    ).toBe(false);
  });
});

describe('topicMiniGameCategorySortArtifactSchema', () => {
  const card = {
    id: 'cs-1',
    topicId: 'graph-basics',
    type: 'MINI_GAME',
    content: {
      gameType: 'CATEGORY_SORT',
      categories: [
        { id: 'c1', label: 'Cat 1' },
        { id: 'c2', label: 'Cat 2' },
      ],
      items: [{ id: 'i1', label: 'Item 1', categoryId: 'c1' }],
    },
    difficulty: 2,
  };
  it('accepts a valid payload', () => {
    expect(
      topicMiniGameCategorySortArtifactSchema.safeParse({ cards: [card] })
        .success,
    ).toBe(true);
  });
  it('rejects gameType crossover', () => {
    expect(
      topicMiniGameCategorySortArtifactSchema.safeParse({
        cards: [
          { ...card, content: { ...card.content, gameType: 'MATCH_PAIRS' } },
        ],
      }).success,
    ).toBe(false);
  });
  it('rejects fewer than 2 categories', () => {
    expect(
      topicMiniGameCategorySortArtifactSchema.safeParse({
        cards: [
          {
            ...card,
            content: {
              ...card.content,
              categories: [{ id: 'c1', label: 'Only one' }],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('topicMiniGameSequenceBuildArtifactSchema', () => {
  const card = {
    id: 'sb-1',
    topicId: 'graph-basics',
    type: 'MINI_GAME',
    content: {
      gameType: 'SEQUENCE_BUILD',
      steps: [
        { id: 's1', label: 'First', order: 1 },
        { id: 's2', label: 'Second', order: 2 },
      ],
    },
    difficulty: 1,
  };
  it('accepts a valid payload', () => {
    expect(
      topicMiniGameSequenceBuildArtifactSchema.safeParse({ cards: [card] })
        .success,
    ).toBe(true);
  });
  it('rejects fewer than 2 steps', () => {
    expect(
      topicMiniGameSequenceBuildArtifactSchema.safeParse({
        cards: [
          {
            ...card,
            content: {
              ...card.content,
              steps: [{ id: 's1', label: 'First', order: 1 }],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('rejects non-positive order', () => {
    expect(
      topicMiniGameSequenceBuildArtifactSchema.safeParse({
        cards: [
          {
            ...card,
            content: {
              ...card.content,
              steps: [
                { id: 's1', label: 'Zero', order: 0 },
                { id: 's2', label: 'One', order: 1 },
              ],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('topicMiniGameMatchPairsArtifactSchema', () => {
  const card = {
    id: 'mp-1',
    topicId: 'graph-basics',
    type: 'MINI_GAME',
    content: {
      gameType: 'MATCH_PAIRS',
      pairs: [
        { id: 'p1', left: 'L1', right: 'R1' },
        { id: 'p2', left: 'L2', right: 'R2' },
      ],
    },
    difficulty: 1,
  };
  it('accepts a valid payload', () => {
    expect(
      topicMiniGameMatchPairsArtifactSchema.safeParse({ cards: [card] }).success,
    ).toBe(true);
  });
  it('rejects fewer than 2 pairs', () => {
    expect(
      topicMiniGameMatchPairsArtifactSchema.safeParse({
        cards: [
          {
            ...card,
            content: {
              ...card.content,
              pairs: [{ id: 'p1', left: 'L1', right: 'R1' }],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('topicExpansionCardsArtifactSchema', () => {
  const card = {
    id: 'exp-1',
    topicId: 'graph-basics',
    type: 'CLOZE',
    content: { text: 'Hello world' },
    difficulty: 3,
  };
  it('accepts a valid payload', () => {
    expect(
      topicExpansionCardsArtifactSchema.safeParse({ cards: [card] }).success,
    ).toBe(true);
  });
  it('rejects MINI_GAME (expansion uses dedicated mini-game kinds)', () => {
    expect(
      topicExpansionCardsArtifactSchema.safeParse({
        cards: [{ ...card, type: 'MINI_GAME' }],
      }).success,
    ).toBe(false);
  });
});

describe('crystalTrialArtifactSchema', () => {
  const validQuestion = {
    id: 'q-1',
    category: 'interview',
    scenario: 'You walk into a meeting.',
    question: 'What do you do?',
    options: ['Listen', 'Pitch', 'Sleep'],
    correctAnswer: 'Listen',
    explanation: 'Always listen first.',
    sourceCardSummaries: ['cs-1'],
  };
  it('accepts a valid trial payload', () => {
    expect(
      crystalTrialArtifactSchema.safeParse({ questions: [validQuestion] })
        .success,
    ).toBe(true);
  });
  it('rejects unknown category', () => {
    expect(
      crystalTrialArtifactSchema.safeParse({
        questions: [{ ...validQuestion, category: 'mystery' }],
      }).success,
    ).toBe(false);
  });
  it('rejects fewer than 2 options', () => {
    expect(
      crystalTrialArtifactSchema.safeParse({
        questions: [{ ...validQuestion, options: ['Only one'] }],
      }).success,
    ).toBe(false);
  });
  it('rejects correctAnswer not in options', () => {
    expect(
      crystalTrialArtifactSchema.safeParse({
        questions: [
          { ...validQuestion, correctAnswer: 'Definitely-not-an-option' },
        ],
      }).success,
    ).toBe(false);
  });
  it('rejects empty sourceCardSummaries', () => {
    expect(
      crystalTrialArtifactSchema.safeParse({
        questions: [{ ...validQuestion, sourceCardSummaries: [] }],
      }).success,
    ).toBe(false);
  });
});
