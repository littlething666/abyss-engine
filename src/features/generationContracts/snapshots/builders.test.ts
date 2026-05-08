import { describe, expect, it } from 'vitest';

import { buildCrystalTrialSnapshot } from './buildCrystalTrialSnapshot';
import { buildSubjectGraphEdgesSnapshot } from './buildSubjectGraphEdgesSnapshot';
import { buildSubjectGraphTopicsSnapshot } from './buildSubjectGraphTopicsSnapshot';
import { buildTopicExpansionSnapshot } from './buildTopicExpansionSnapshot';
import { buildTopicMiniGameCardsSnapshot } from './buildTopicMiniGameCardsSnapshot';
import { buildTopicStudyCardsSnapshot } from './buildTopicStudyCardsSnapshot';
import { buildTopicTheorySnapshot } from './buildTopicTheorySnapshot';

const ENVELOPE = {
  schemaVersion: 1,
  promptTemplateVersion: 'v1',
  modelId: 'openai/gpt-4o-mini',
  capturedAt: '2026-05-04T00:00:00.000Z',
} as const;

const VALID_CONTENT_HASH =
  'cnt_0000000000000000000000000000000000000000000000000000000000000000';

describe('buildSubjectGraphTopicsSnapshot', () => {
  it('produces the expected envelope and pipeline_kind', () => {
    const snap = buildSubjectGraphTopicsSnapshot({
      ...ENVELOPE,
      subjectId: 'sub-1',
      checklist: { topic_name: 'Algebra' },
      strategyBrief: {
        total_tiers: 3,
        topics_per_tier: 5,
        audience_brief: 'undergrad',
        domain_brief: 'STEM',
        focus_constraints: 'rigorous proofs',
      },
    });

    expect(snap.snapshot_version).toBe(1);
    expect(snap.pipeline_kind).toBe('subject-graph-topics');
    expect(snap.subject_id).toBe('sub-1');
    expect(snap.checklist.topic_name).toBe('Algebra');
    expect(snap.strategy_brief.total_tiers).toBe(3);
  });

  it('allows empty focus_constraints and trims whitespace', () => {
    const empty = buildSubjectGraphTopicsSnapshot({
      ...ENVELOPE,
      subjectId: 'sub-1',
      checklist: { topic_name: 'Algebra' },
      strategyBrief: {
        total_tiers: 3,
        topics_per_tier: 5,
        audience_brief: 'undergrad',
        domain_brief: 'STEM',
        focus_constraints: '',
      },
    });
    expect(empty.strategy_brief.focus_constraints).toBe('');

    const trimmed = buildSubjectGraphTopicsSnapshot({
      ...ENVELOPE,
      subjectId: 'sub-1',
      checklist: { topic_name: 'Algebra' },
      strategyBrief: {
        total_tiers: 3,
        topics_per_tier: 5,
        audience_brief: 'undergrad',
        domain_brief: 'STEM',
        focus_constraints: '  \t\n',
      },
    });
    expect(trimmed.strategy_brief.focus_constraints).toBe('');
  });

  it('rejects empty subjectId', () => {
    expect(() =>
      buildSubjectGraphTopicsSnapshot({
        ...ENVELOPE,
        subjectId: '',
        checklist: { topic_name: 'x' },
        strategyBrief: {
          total_tiers: 1,
          topics_per_tier: 1,
          audience_brief: 'a',
          domain_brief: 'b',
          focus_constraints: 'c',
        },
      }),
    ).toThrow();
  });

  it('rejects non-positive total_tiers', () => {
    expect(() =>
      buildSubjectGraphTopicsSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        checklist: { topic_name: 'x' },
        strategyBrief: {
          total_tiers: 0,
          topics_per_tier: 1,
          audience_brief: 'a',
          domain_brief: 'b',
          focus_constraints: 'c',
        },
      }),
    ).toThrow();
  });
});

describe('buildSubjectGraphEdgesSnapshot', () => {
  it('produces the expected envelope and pipeline_kind', () => {
    const snap = buildSubjectGraphEdgesSnapshot({
      ...ENVELOPE,
      subjectId: 'sub-1',
      latticeArtifactContentHash: VALID_CONTENT_HASH,
    });
    expect(snap.pipeline_kind).toBe('subject-graph-edges');
    expect(snap.lattice_artifact_content_hash).toBe(VALID_CONTENT_HASH);
  });

  it('rejects malformed latticeArtifactContentHash', () => {
    expect(() =>
      buildSubjectGraphEdgesSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        latticeArtifactContentHash: 'inp_abc',
      }),
    ).toThrow();
    expect(() =>
      buildSubjectGraphEdgesSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        latticeArtifactContentHash: 'cnt_short',
      }),
    ).toThrow();
  });
});

describe('buildTopicTheorySnapshot', () => {
  it('produces the expected envelope and pipeline_kind', () => {
    const snap = buildTopicTheorySnapshot({
      ...ENVELOPE,
      subjectId: 'sub-1',
      topicId: 'topic-1',
      topicTitle: 'Vectors',
      learningObjective: 'Add vectors geometrically.',
    });
    expect(snap.pipeline_kind).toBe('topic-theory');
    expect(snap.topic_title).toBe('Vectors');
    expect(snap.content_brief).toBeUndefined();
  });

  it('preserves contentBrief when provided', () => {
    const snap = buildTopicTheorySnapshot({
      ...ENVELOPE,
      subjectId: 'sub-1',
      topicId: 'topic-1',
      topicTitle: 'Vectors',
      learningObjective: 'Add vectors geometrically.',
      contentBrief: 'focus on geometric intuition',
    });
    expect(snap.content_brief).toBe('focus on geometric intuition');
  });
});

describe('buildTopicStudyCardsSnapshot', () => {
  it('produces the expected envelope', () => {
    const snap = buildTopicStudyCardsSnapshot({
      ...ENVELOPE,
      subjectId: 'sub-1',
      topicId: 'topic-1',
      theoryExcerpt: 'A vector is a magnitude with a direction.',
      syllabusQuestions: ['What is a vector?'],
      targetDifficulty: 2,
      groundingSourceCount: 3,
      hasAuthoritativePrimarySource: true,
    });
    expect(snap.pipeline_kind).toBe('topic-study-cards');
    expect(snap.target_difficulty).toBe(2);
    expect(snap.has_authoritative_primary_source).toBe(true);
  });

  it('rejects negative difficulty', () => {
    expect(() =>
      buildTopicStudyCardsSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        theoryExcerpt: 't',
        syllabusQuestions: ['q'],
        targetDifficulty: -1,
        groundingSourceCount: 0,
        hasAuthoritativePrimarySource: false,
      }),
    ).toThrow();
  });

  it('rejects non-string syllabus questions', () => {
    expect(() =>
      buildTopicStudyCardsSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        theoryExcerpt: 't',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        syllabusQuestions: [123 as unknown as string],
        targetDifficulty: 1,
        groundingSourceCount: 0,
        hasAuthoritativePrimarySource: false,
      }),
    ).toThrow();
  });
});

describe('buildTopicMiniGameCardsSnapshot', () => {
  it.each([
    'topic-mini-game-category-sort',
    'topic-mini-game-sequence-build',
    'topic-mini-game-match-pairs',
  ] as const)('accepts pipeline_kind %s', (kind) => {
    const snap = buildTopicMiniGameCardsSnapshot({
      ...ENVELOPE,
      pipelineKind: kind,
      subjectId: 'sub-1',
      topicId: 'topic-1',
      theoryExcerpt: 't',
      syllabusQuestions: ['q'],
      targetDifficulty: 1,
      groundingSourceCount: 0,
      hasAuthoritativePrimarySource: false,
    });
    expect(snap.pipeline_kind).toBe(kind);
  });

  it('rejects unknown mini-game pipeline kinds', () => {
    expect(() =>
      buildTopicMiniGameCardsSnapshot({
        ...ENVELOPE,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pipelineKind: 'topic-mini-game-bogus' as any,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        theoryExcerpt: 't',
        syllabusQuestions: ['q'],
        targetDifficulty: 1,
        groundingSourceCount: 0,
        hasAuthoritativePrimarySource: false,
      }),
    ).toThrow();
  });
});

describe('buildTopicExpansionSnapshot', () => {
  it('produces the expected envelope', () => {
    const snap = buildTopicExpansionSnapshot({
      ...ENVELOPE,
      subjectId: 'sub-1',
      topicId: 'topic-1',
      nextLevel: 3,
      difficulty: 2,
      theoryExcerpt: 'A vector is a magnitude with direction.',
      syllabusQuestions: ['What is a vector?'],
      existingCardIds: ['card-1', 'card-2'],
      existingConceptStems: ['vector_addition'],
      groundingSourceCount: 1,
    });
    expect(snap.pipeline_kind).toBe('topic-expansion-cards');
    expect(snap.existing_card_ids).toHaveLength(2);
    expect(snap.next_level).toBe(3);
  });

  it('rejects nextLevel = 0', () => {
    expect(() =>
      buildTopicExpansionSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        nextLevel: 0,
        difficulty: 1,
        theoryExcerpt: 't',
        syllabusQuestions: ['q'],
        existingCardIds: [],
        existingConceptStems: [],
        groundingSourceCount: 0,
      }),
    ).toThrow();
  });
});

describe('buildCrystalTrialSnapshot', () => {
  it('produces the expected envelope', () => {
    const snap = buildCrystalTrialSnapshot({
      ...ENVELOPE,
      subjectId: 'sub-1',
      topicId: 'topic-1',
      currentLevel: 0,
      targetLevel: 1,
      cardPoolHash: VALID_CONTENT_HASH,
      questionCount: 5,
    });
    expect(snap.pipeline_kind).toBe('crystal-trial');
    expect(snap.question_count).toBe(5);
    expect(snap.content_brief).toBeUndefined();
  });

  it('rejects target_level <= current_level', () => {
    expect(() =>
      buildCrystalTrialSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        currentLevel: 2,
        targetLevel: 2,
        cardPoolHash: VALID_CONTENT_HASH,
        questionCount: 5,
      }),
    ).toThrow();
  });

  it('rejects malformed card pool hash', () => {
    expect(() =>
      buildCrystalTrialSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        currentLevel: 0,
        targetLevel: 1,
        cardPoolHash: 'cnt_xyz',
        questionCount: 5,
      }),
    ).toThrow();
  });
});
