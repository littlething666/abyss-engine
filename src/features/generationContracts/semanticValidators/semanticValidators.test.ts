import { describe, expect, it } from 'vitest';

import {
  MAX_CARD_DIFFICULTY,
  TRIAL_QUESTION_COUNT,
} from '@/features/crystalTrial/crystalTrialConfig';
import { TOPIC_ICON_NAMES } from '@/features/subjectGeneration/graph/topicIcons/topicIconAllowlist';

import { GENERATION_FAILURE_CODES } from '../failureCodes';
import {
  SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE,
  SEMANTIC_MAX_CARD_DIFFICULTY,
  SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST,
  SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT,
  SEMANTIC_VALIDATORS_BY_KIND,
  semanticValidateArtifact,
  validateCrystalTrialArtifact,
  validateSubjectGraphEdgesArtifact,
  validateSubjectGraphTopicsArtifact,
  validateTopicExpansionCardsArtifact,
  validateTopicMiniGameCategorySortArtifact,
  validateTopicMiniGameMatchPairsArtifact,
  validateTopicMiniGameSequenceBuildArtifact,
  validateTopicStudyCardsArtifact,
  validateTopicTheoryArtifact,
  type SemanticFailureCode,
} from './index';

describe('lockstep with upstream feature constants', () => {
  it('SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT mirrors TRIAL_QUESTION_COUNT', () => {
    expect(SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT).toBe(TRIAL_QUESTION_COUNT);
  });
  it('SEMANTIC_MAX_CARD_DIFFICULTY mirrors MAX_CARD_DIFFICULTY', () => {
    expect(SEMANTIC_MAX_CARD_DIFFICULTY).toBe(MAX_CARD_DIFFICULTY);
  });
  it('SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST mirrors TOPIC_ICON_NAMES (set equality)', () => {
    expect(new Set(SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST)).toEqual(
      new Set(TOPIC_ICON_NAMES),
    );
    expect(SEMANTIC_TOPIC_ICON_NAMES_ALLOWLIST.length).toBe(
      TOPIC_ICON_NAMES.length,
    );
  });
});

describe('SemanticFailureCode is a subset of GENERATION_FAILURE_CODES', () => {
  it('every literal in SemanticFailureCode is published in GENERATION_FAILURE_CODES', () => {
    const semanticCodes: readonly SemanticFailureCode[] = [
      'validation:semantic-card-pool-size',
      'validation:semantic-card-content-shape',
      'validation:semantic-difficulty-distribution',
      'validation:semantic-grounding',
      'validation:semantic-duplicate-concept',
      'validation:semantic-mini-game-playability',
      'validation:semantic-trial-question-count',
      'validation:semantic-subject-graph',
    ];
    const set = new Set<string>(GENERATION_FAILURE_CODES);
    for (const code of semanticCodes) {
      expect(set.has(code)).toBe(true);
    }
  });
});

describe('SEMANTIC_VALIDATORS_BY_KIND covers every ArtifactKind', () => {
  it('has exactly one validator per kind', () => {
    const kinds = Object.keys(SEMANTIC_VALIDATORS_BY_KIND).sort();
    expect(kinds).toEqual(
      [
        'subject-graph-topics',
        'subject-graph-edges',
        'topic-theory',
        'topic-study-cards',
        'topic-mini-game-category-sort',
        'topic-mini-game-sequence-build',
        'topic-mini-game-match-pairs',
        'topic-expansion-cards',
        'crystal-trial',
      ].sort(),
    );
  });
  it('semanticValidateArtifact dispatches to the registered validator', () => {
    const r = semanticValidateArtifact('subject-graph-topics', {
      topics: [
        {
          topicId: 'x',
          title: 'X',
          iconName: 'atom',
          tier: 1,
          learningObjective: 'L',
        },
      ],
    });
    expect(r.ok).toBe(true);
  });
});

describe('validateSubjectGraphTopicsArtifact', () => {
  const ok = {
    topics: [
      { topicId: 'a', title: 'A', iconName: 'atom', tier: 1, learningObjective: 'L1' },
      { topicId: 'b', title: 'B', iconName: 'beaker', tier: 1, learningObjective: 'L2' },
    ],
  };
  it('passes a valid lattice', () => {
    expect(validateSubjectGraphTopicsArtifact(ok).ok).toBe(true);
  });
  it('fails on iconName outside the allowlist', () => {
    const r = validateSubjectGraphTopicsArtifact({
      topics: [
        { topicId: 'a', title: 'A', iconName: 'not-an-icon', tier: 1, learningObjective: 'L' },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-subject-graph');
  });
  it('fails on duplicate topicId', () => {
    const r = validateSubjectGraphTopicsArtifact({
      topics: [
        { topicId: 'a', title: 'A', iconName: 'atom', tier: 1, learningObjective: 'L' },
        { topicId: 'a', title: 'B', iconName: 'beaker', tier: 1, learningObjective: 'L' },
      ],
    });
    expect(r.ok).toBe(false);
  });
  it('fails on duplicate title (case-insensitive)', () => {
    const r = validateSubjectGraphTopicsArtifact({
      topics: [
        { topicId: 'a', title: 'Same', iconName: 'atom', tier: 1, learningObjective: 'L' },
        { topicId: 'b', title: ' SAME ', iconName: 'beaker', tier: 1, learningObjective: 'L' },
      ],
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateSubjectGraphEdgesArtifact', () => {
  const lattice = ['a', 'b', 'c'];
  it('passes a valid edges artifact when context is supplied', () => {
    const r = validateSubjectGraphEdgesArtifact(
      { edges: [{ source: 'a', target: 'b' }] },
      { latticeTopicIds: lattice },
    );
    expect(r.ok).toBe(true);
  });
  it('fails when context.latticeTopicIds is missing', () => {
    const r = validateSubjectGraphEdgesArtifact({ edges: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-subject-graph');
  });
  it('fails on self-loop', () => {
    const r = validateSubjectGraphEdgesArtifact(
      { edges: [{ source: 'a', target: 'a' }] },
      { latticeTopicIds: lattice },
    );
    expect(r.ok).toBe(false);
  });
  it('fails on unknown source', () => {
    const r = validateSubjectGraphEdgesArtifact(
      { edges: [{ source: 'z', target: 'a' }] },
      { latticeTopicIds: lattice },
    );
    expect(r.ok).toBe(false);
  });
  it('fails on duplicate edge', () => {
    const r = validateSubjectGraphEdgesArtifact(
      {
        edges: [
          { source: 'a', target: 'b' },
          { source: 'a', target: 'b' },
        ],
      },
      { latticeTopicIds: lattice },
    );
    expect(r.ok).toBe(false);
  });
});

describe('validateTopicTheoryArtifact', () => {
  const ok = {
    coreConcept: 'C',
    theory: 'T',
    keyTakeaways: ['One', 'Two', 'Three', 'Four'],
    coreQuestionsByDifficulty: {
      '1': ['q1'],
      '2': ['q2'],
      '3': ['q3'],
      '4': ['q4'],
    },
  };
  it('passes a valid theory artifact', () => {
    expect(validateTopicTheoryArtifact(ok).ok).toBe(true);
  });
  it('fails on duplicate keyTakeaway (case-insensitive)', () => {
    const r = validateTopicTheoryArtifact({
      ...ok,
      keyTakeaways: ['One', 'one ', 'Three', 'Four'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-duplicate-concept');
  });
  it('fails on duplicate syllabus question within a bucket', () => {
    const r = validateTopicTheoryArtifact({
      ...ok,
      coreQuestionsByDifficulty: { ...ok.coreQuestionsByDifficulty, '2': ['q2', 'Q2'] },
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateTopicStudyCardsArtifact', () => {
  function makeCards(n: number) {
    const cards = [] as Array<{
      id: string;
      topicId: string;
      type: 'FLASHCARD' | 'CLOZE' | 'MULTIPLE_CHOICE';
      content: Record<string, unknown>;
      difficulty: number;
    }>;
    for (let i = 0; i < n; i += 1) {
      cards.push({
        id: `c${i}`,
        topicId: 'topic-x',
        type: 'FLASHCARD',
        content: { front: `front-${i}`, back: `back-${i}` },
        difficulty: (i % SEMANTIC_MAX_CARD_DIFFICULTY) + 1,
      });
    }
    return cards;
  }
  it('passes a valid pool', () => {
    const r = validateTopicStudyCardsArtifact({ cards: makeCards(SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE) });
    expect(r.ok).toBe(true);
  });
  it('fails on pool size below default minimum', () => {
    const r = validateTopicStudyCardsArtifact({ cards: makeCards(SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE - 1) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-card-pool-size');
  });
  it('honors context.minCardPoolSize override', () => {
    const r = validateTopicStudyCardsArtifact(
      { cards: makeCards(2) },
      { minCardPoolSize: 2 },
    );
    expect(r.ok).toBe(true);
  });
  it('fails on duplicate card id', () => {
    const cards = makeCards(SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE);
    cards[1] = { ...cards[1], id: cards[0].id };
    const r = validateTopicStudyCardsArtifact({ cards });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-duplicate-concept');
  });
  it('fails on duplicate concept stem', () => {
    const cards = makeCards(SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE);
    cards[1] = { ...cards[1], content: { ...cards[1].content, front: cards[0].content.front as string } };
    const r = validateTopicStudyCardsArtifact({ cards });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-duplicate-concept');
  });
  it('fails on flat single-tier pool (difficulty distribution)', () => {
    const cards = makeCards(SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE).map((c) => ({
      ...c,
      difficulty: 1,
    }));
    const r = validateTopicStudyCardsArtifact({ cards });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-difficulty-distribution');
  });
  it('fails on FLASHCARD with non-string back', () => {
    const cards = makeCards(SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE);
    cards[0] = { ...cards[0], content: { front: 'F', back: 123 as unknown as string } };
    const r = validateTopicStudyCardsArtifact({ cards });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-card-content-shape');
  });
  it('fails on MULTIPLE_CHOICE with correctAnswer absent from options', () => {
    const cards = makeCards(SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE);
    cards[0] = {
      ...cards[0],
      type: 'MULTIPLE_CHOICE',
      content: { question: 'Q', options: ['A', 'B'], correctAnswer: 'C' },
    };
    const r = validateTopicStudyCardsArtifact({ cards });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-card-content-shape');
  });
});

describe('validateTopicExpansionCardsArtifact', () => {
  it('dedupes against context.existingConceptStems', () => {
    const cards = [] as Array<{
      id: string;
      topicId: string;
      type: 'FLASHCARD';
      content: Record<string, unknown>;
      difficulty: number;
    }>;
    for (let i = 0; i < SEMANTIC_DEFAULT_MIN_CARD_POOL_SIZE; i += 1) {
      cards.push({
        id: `e${i}`,
        topicId: 'topic-x',
        type: 'FLASHCARD',
        content: { front: `expansion-front-${i}`, back: `b${i}` },
        difficulty: (i % SEMANTIC_MAX_CARD_DIFFICULTY) + 1,
      });
    }
    const r = validateTopicExpansionCardsArtifact(
      { cards },
      { existingConceptStems: ['expansion-front-3'] },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-duplicate-concept');
  });
});

describe('validateTopicMiniGameCategorySortArtifact', () => {
  const validCard = {
    id: 'cs-1',
    topicId: 'topic-x',
    type: 'MINI_GAME' as const,
    difficulty: 1,
    content: {
      gameType: 'CATEGORY_SORT' as const,
      categories: [
        { id: 'cat1', label: 'Cat 1' },
        { id: 'cat2', label: 'Cat 2' },
      ],
      items: [
        { id: 'i1', label: 'I1', categoryId: 'cat1' },
        { id: 'i2', label: 'I2', categoryId: 'cat2' },
      ],
    },
  };
  it('passes a valid card', () => {
    expect(
      validateTopicMiniGameCategorySortArtifact({ cards: [validCard] }).ok,
    ).toBe(true);
  });
  it('fails on item with unknown categoryId', () => {
    const card = {
      ...validCard,
      content: {
        ...validCard.content,
        items: [
          { id: 'i1', label: 'I1', categoryId: 'unknown' },
          { id: 'i2', label: 'I2', categoryId: 'cat2' },
        ],
      },
    };
    const r = validateTopicMiniGameCategorySortArtifact({ cards: [card] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-mini-game-playability');
  });
  it('fails on category with no items', () => {
    const card = {
      ...validCard,
      content: {
        ...validCard.content,
        items: [
          { id: 'i1', label: 'I1', categoryId: 'cat1' },
          { id: 'i2', label: 'I2', categoryId: 'cat1' },
        ],
      },
    };
    const r = validateTopicMiniGameCategorySortArtifact({ cards: [card] });
    expect(r.ok).toBe(false);
  });
});

describe('validateTopicMiniGameSequenceBuildArtifact', () => {
  const validCard = {
    id: 'sb-1',
    topicId: 'topic-x',
    type: 'MINI_GAME' as const,
    difficulty: 1,
    content: {
      gameType: 'SEQUENCE_BUILD' as const,
      steps: [
        { id: 's1', label: 'S1', order: 1 },
        { id: 's2', label: 'S2', order: 2 },
        { id: 's3', label: 'S3', order: 3 },
      ],
    },
  };
  it('passes a contiguous 1..N sequence', () => {
    expect(
      validateTopicMiniGameSequenceBuildArtifact({ cards: [validCard] }).ok,
    ).toBe(true);
  });
  it('fails on missing order (gap)', () => {
    const card = {
      ...validCard,
      content: {
        ...validCard.content,
        steps: [
          { id: 's1', label: 'S1', order: 1 },
          { id: 's2', label: 'S2', order: 3 },
        ],
      },
    };
    const r = validateTopicMiniGameSequenceBuildArtifact({ cards: [card] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-mini-game-playability');
  });
  it('fails on duplicate order', () => {
    const card = {
      ...validCard,
      content: {
        ...validCard.content,
        steps: [
          { id: 's1', label: 'S1', order: 1 },
          { id: 's2', label: 'S2', order: 1 },
        ],
      },
    };
    const r = validateTopicMiniGameSequenceBuildArtifact({ cards: [card] });
    expect(r.ok).toBe(false);
  });
});

describe('validateTopicMiniGameMatchPairsArtifact', () => {
  const validCard = {
    id: 'mp-1',
    topicId: 'topic-x',
    type: 'MINI_GAME' as const,
    difficulty: 1,
    content: {
      gameType: 'MATCH_PAIRS' as const,
      pairs: [
        { id: 'p1', left: 'L1', right: 'R1' },
        { id: 'p2', left: 'L2', right: 'R2' },
      ],
    },
  };
  it('passes a valid 1:1 permutation', () => {
    expect(
      validateTopicMiniGameMatchPairsArtifact({ cards: [validCard] }).ok,
    ).toBe(true);
  });
  it('fails on duplicate left value', () => {
    const card = {
      ...validCard,
      content: {
        ...validCard.content,
        pairs: [
          { id: 'p1', left: 'Same', right: 'R1' },
          { id: 'p2', left: ' SAME ', right: 'R2' },
        ],
      },
    };
    const r = validateTopicMiniGameMatchPairsArtifact({ cards: [card] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-mini-game-playability');
  });
  it('fails on duplicate right value', () => {
    const card = {
      ...validCard,
      content: {
        ...validCard.content,
        pairs: [
          { id: 'p1', left: 'L1', right: 'Same' },
          { id: 'p2', left: 'L2', right: 'same' },
        ],
      },
    };
    const r = validateTopicMiniGameMatchPairsArtifact({ cards: [card] });
    expect(r.ok).toBe(false);
  });
});

describe('validateCrystalTrialArtifact', () => {
  function makeQuestions(n: number) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      out.push({
        id: `q${i}`,
        category: 'interview' as const,
        scenario: `S${i}`,
        question: `Q${i}`,
        options: [`opt-a-${i}`, `opt-b-${i}`],
        correctAnswer: `opt-a-${i}`,
        explanation: `E${i}`,
        sourceCardSummaries: [`s${i}`],
      });
    }
    return out;
  }
  it('passes when question count matches default', () => {
    const r = validateCrystalTrialArtifact({
      questions: makeQuestions(SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT),
    });
    expect(r.ok).toBe(true);
  });
  it('fails when question count differs from default and no context override', () => {
    const r = validateCrystalTrialArtifact({ questions: makeQuestions(3) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-trial-question-count');
  });
  it('honors context.expectedQuestionCount override', () => {
    const r = validateCrystalTrialArtifact(
      { questions: makeQuestions(7) },
      { expectedQuestionCount: 7 },
    );
    expect(r.ok).toBe(true);
  });
  it('fails on duplicate question id', () => {
    const qs = makeQuestions(SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT);
    qs[1].id = qs[0].id;
    const r = validateCrystalTrialArtifact({ questions: qs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-duplicate-concept');
  });
  it('fails on duplicate option within a question', () => {
    const qs = makeQuestions(SEMANTIC_TRIAL_QUESTION_COUNT_DEFAULT);
    qs[0].options = ['Same', ' SAME '];
    qs[0].correctAnswer = 'Same';
    const r = validateCrystalTrialArtifact({ questions: qs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('validation:semantic-duplicate-concept');
  });
});
