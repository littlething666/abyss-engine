import { describe, expect, it } from 'vitest';

import { canonicalJson, inputHash } from '../canonicalHash';
import { buildCrystalTrialSnapshot } from './buildCrystalTrialSnapshot';
import { buildSubjectGraphEdgesSnapshot } from './buildSubjectGraphEdgesSnapshot';
import { buildSubjectGraphTopicsSnapshot } from './buildSubjectGraphTopicsSnapshot';
import { buildTopicExpansionSnapshot } from './buildTopicExpansionSnapshot';
import { buildTopicMiniGameCardsSnapshot } from './buildTopicMiniGameCardsSnapshot';
import { buildTopicStudyCardsSnapshot } from './buildTopicStudyCardsSnapshot';
import { buildTopicTheorySnapshot } from './buildTopicTheorySnapshot';

const HASH_SHAPE = /^inp_[0-9a-f]{64}$/;

const ENVELOPE = {
  schemaVersion: 1,
  promptTemplateVersion: 'v1',
  modelId: 'openai/gpt-4o-mini',
  capturedAt: '2026-05-04T00:00:00.000Z',
} as const;

const VALID_CONTENT_HASH =
  'cnt_0000000000000000000000000000000000000000000000000000000000000000';
const VALID_CONTENT_HASH_2 =
  'cnt_1111111111111111111111111111111111111111111111111111111111111111';

describe('canonicalJson', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('omits undefined object properties', () => {
    expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it('rejects NaN and +/- Infinity', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => canonicalJson(Number.NEGATIVE_INFINITY)).toThrow();
  });

  it('rejects bigint', () => {
    expect(() => canonicalJson(BigInt(1))).toThrow();
  });
});

type CaseEntry = readonly [string, () => unknown];

const cases: CaseEntry[] = [
  [
    'subject-graph-topics',
    () =>
      buildSubjectGraphTopicsSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        checklist: { topic_name: 'Algebra' },
        strategyBrief: {
          total_tiers: 3,
          topics_per_tier: 5,
          audience_brief: 'a',
          domain_brief: 'd',
          focus_constraints: 'f',
        },
      }),
  ],
  [
    'subject-graph-edges',
    () =>
      buildSubjectGraphEdgesSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        latticeArtifactContentHash: VALID_CONTENT_HASH,
      }),
  ],
  [
    'topic-theory',
    () =>
      buildTopicTheorySnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicTitle: 'Vectors',
        learningObjective: 'Add vectors.',
      }),
  ],
  [
    'topic-study-cards',
    () =>
      buildTopicStudyCardsSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        theoryExcerpt: 't',
        syllabusQuestions: ['q'],
        targetDifficulty: 2,
        groundingSourceCount: 1,
        hasAuthoritativePrimarySource: true,
      }),
  ],
  [
    'topic-mini-game-cards',
    () =>
      buildTopicMiniGameCardsSnapshot({
        ...ENVELOPE,
        pipelineKind: 'topic-mini-game-category-sort',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        theoryExcerpt: 't',
        syllabusQuestions: ['q'],
        targetDifficulty: 2,
        groundingSourceCount: 1,
        hasAuthoritativePrimarySource: true,
      }),
  ],
  [
    'topic-expansion-cards',
    () =>
      buildTopicExpansionSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        nextLevel: 3,
        difficulty: 2,
        theoryExcerpt: 't',
        syllabusQuestions: ['q'],
        existingCardIds: ['c1'],
        existingConceptStems: ['v_add'],
        groundingSourceCount: 0,
      }),
  ],
  [
    'crystal-trial',
    () =>
      buildCrystalTrialSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        currentLevel: 0,
        targetLevel: 1,
        cardPoolHash: VALID_CONTENT_HASH,
        questionCount: 5,
      }),
  ],
];

describe('input_hash determinism + envelope', () => {
  it.each(cases)('%s — hash matches inp_<64-hex>', async (_name, build) => {
    const hash = await inputHash(build());
    expect(hash).toMatch(HASH_SHAPE);
  });

  it.each(cases)('%s — hash is deterministic across calls', async (_name, build) => {
    const a = await inputHash(build());
    const b = await inputHash(build());
    expect(a).toBe(b);
  });
});

describe('input_hash sensitivity (envelope fields)', () => {
  it('flips when modelId changes', async () => {
    const base = await inputHash(
      buildTopicTheorySnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicTitle: 'Vectors',
        learningObjective: 'Add vectors.',
      }),
    );
    const changed = await inputHash(
      buildTopicTheorySnapshot({
        ...ENVELOPE,
        modelId: 'openai/gpt-4.1',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicTitle: 'Vectors',
        learningObjective: 'Add vectors.',
      }),
    );
    expect(changed).not.toBe(base);
  });

  it('flips when promptTemplateVersion changes', async () => {
    const base = await inputHash(
      buildTopicTheorySnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicTitle: 'Vectors',
        learningObjective: 'Add vectors.',
      }),
    );
    const changed = await inputHash(
      buildTopicTheorySnapshot({
        ...ENVELOPE,
        promptTemplateVersion: 'v2',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicTitle: 'Vectors',
        learningObjective: 'Add vectors.',
      }),
    );
    expect(changed).not.toBe(base);
  });

  it('flips when schemaVersion changes', async () => {
    const base = await inputHash(
      buildTopicTheorySnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicTitle: 'Vectors',
        learningObjective: 'Add vectors.',
      }),
    );
    const changed = await inputHash(
      buildTopicTheorySnapshot({
        ...ENVELOPE,
        schemaVersion: 2,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicTitle: 'Vectors',
        learningObjective: 'Add vectors.',
      }),
    );
    expect(changed).not.toBe(base);
  });
});

describe('input_hash sensitivity (per-pipeline source data)', () => {
  it('subject-graph-edges flips when upstream lattice content hash changes', async () => {
    const a = await inputHash(
      buildSubjectGraphEdgesSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        latticeArtifactContentHash: VALID_CONTENT_HASH,
      }),
    );
    const b = await inputHash(
      buildSubjectGraphEdgesSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        latticeArtifactContentHash: VALID_CONTENT_HASH_2,
      }),
    );
    expect(b).not.toBe(a);
  });

  it('topic-study-cards flips when syllabus questions change', async () => {
    const a = await inputHash(
      buildTopicStudyCardsSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        theoryExcerpt: 't',
        syllabusQuestions: ['q1'],
        targetDifficulty: 2,
        groundingSourceCount: 1,
        hasAuthoritativePrimarySource: true,
      }),
    );
    const b = await inputHash(
      buildTopicStudyCardsSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        theoryExcerpt: 't',
        syllabusQuestions: ['q1', 'q2'],
        targetDifficulty: 2,
        groundingSourceCount: 1,
        hasAuthoritativePrimarySource: true,
      }),
    );
    expect(b).not.toBe(a);
  });

  it('topic-expansion-cards flips when existing card ids change', async () => {
    const a = await inputHash(
      buildTopicExpansionSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        nextLevel: 3,
        difficulty: 2,
        theoryExcerpt: 't',
        syllabusQuestions: ['q'],
        existingCardIds: ['c1'],
        existingConceptStems: ['v_add'],
        groundingSourceCount: 0,
      }),
    );
    const b = await inputHash(
      buildTopicExpansionSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        nextLevel: 3,
        difficulty: 2,
        theoryExcerpt: 't',
        syllabusQuestions: ['q'],
        existingCardIds: ['c1', 'c2'],
        existingConceptStems: ['v_add'],
        groundingSourceCount: 0,
      }),
    );
    expect(b).not.toBe(a);
  });

  it('crystal-trial flips when card pool hash changes', async () => {
    const a = await inputHash(
      buildCrystalTrialSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        currentLevel: 0,
        targetLevel: 1,
        cardPoolHash: VALID_CONTENT_HASH,
        questionCount: 5,
      }),
    );
    const b = await inputHash(
      buildCrystalTrialSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        topicId: 'topic-1',
        currentLevel: 0,
        targetLevel: 1,
        cardPoolHash: VALID_CONTENT_HASH_2,
        questionCount: 5,
      }),
    );
    expect(b).not.toBe(a);
  });

  it('mini-game pipeline_kind discriminator flips the hash', async () => {
    const a = await inputHash(
      buildTopicMiniGameCardsSnapshot({
        ...ENVELOPE,
        pipelineKind: 'topic-mini-game-category-sort',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        theoryExcerpt: 't',
        syllabusQuestions: ['q'],
        targetDifficulty: 2,
        groundingSourceCount: 1,
        hasAuthoritativePrimarySource: true,
      }),
    );
    const b = await inputHash(
      buildTopicMiniGameCardsSnapshot({
        ...ENVELOPE,
        pipelineKind: 'topic-mini-game-sequence-build',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        theoryExcerpt: 't',
        syllabusQuestions: ['q'],
        targetDifficulty: 2,
        groundingSourceCount: 1,
        hasAuthoritativePrimarySource: true,
      }),
    );
    expect(b).not.toBe(a);
  });
});

describe('input_hash key-order invariance', () => {
  it('reordering keys in caller-supplied checklist does not change the hash', async () => {
    const a = await inputHash(
      buildSubjectGraphTopicsSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        checklist: {
          topic_name: 'Algebra',
          study_goal: 'pass exam',
          prior_knowledge: 'arithmetic',
        },
        strategyBrief: {
          total_tiers: 3,
          topics_per_tier: 5,
          audience_brief: 'a',
          domain_brief: 'd',
          focus_constraints: 'f',
        },
      }),
    );
    const b = await inputHash(
      buildSubjectGraphTopicsSnapshot({
        ...ENVELOPE,
        subjectId: 'sub-1',
        checklist: {
          prior_knowledge: 'arithmetic',
          topic_name: 'Algebra',
          study_goal: 'pass exam',
        },
        strategyBrief: {
          focus_constraints: 'f',
          domain_brief: 'd',
          audience_brief: 'a',
          topics_per_tier: 5,
          total_tiers: 3,
        },
      }),
    );
    expect(b).toBe(a);
  });
});

describe('subject-graph-topics canonical-JSON literal', () => {
  it('matches the pinned canonical envelope shape', () => {
    const snap = buildSubjectGraphTopicsSnapshot({
      ...ENVELOPE,
      subjectId: 'sub-1',
      checklist: { topic_name: 'Algebra' },
      strategyBrief: {
        total_tiers: 3,
        topics_per_tier: 5,
        audience_brief: 'a',
        domain_brief: 'd',
        focus_constraints: 'f',
      },
    });

    expect(canonicalJson(snap)).toBe(
      [
        '{',
        '"captured_at":"2026-05-04T00:00:00.000Z",',
        '"checklist":{"topic_name":"Algebra"},',
        '"model_id":"openai/gpt-4o-mini",',
        '"pipeline_kind":"subject-graph-topics",',
        '"prompt_template_version":"v1",',
        '"schema_version":1,',
        '"snapshot_version":1,',
        '"strategy_brief":{"audience_brief":"a","domain_brief":"d","focus_constraints":"f","topics_per_tier":5,"total_tiers":3},',
        '"subject_id":"sub-1"',
        '}',
      ].join(''),
    );
  });
});
