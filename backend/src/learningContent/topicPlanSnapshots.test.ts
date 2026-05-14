import { describe, expect, it } from 'vitest';
import type { TopicTheorySourceSpan } from './theorySourceSpans';
import { compileTopicConceptPlan } from './topicPlanCompiler';
import {
  buildTopicCardPlanSnapshot,
  buildTopicConceptPlanSnapshot,
  TOPIC_CARD_PLAN_SCHEMA_VERSION,
  TOPIC_CONCEPT_PLAN_SCHEMA_VERSION,
  TOPIC_PLAN_PROMPT_TEMPLATE_VERSION,
} from './topicPlanSnapshots';

const sourceSpans: TopicTheorySourceSpan[] = [
  { spanId: 'span-core', subjectId: 'math', topicId: 'limits', kind: 'core-concept', index: 0, text: 'Limits describe approach behavior.' },
  { spanId: 'span-theory', subjectId: 'math', topicId: 'limits', kind: 'theory', index: 0, text: 'A function can approach a value even when it is undefined at the input.' },
  { spanId: 'span-question', subjectId: 'math', topicId: 'limits', kind: 'syllabus-question', index: 0, difficulty: 2, text: 'How do one-sided limits compare?' },
];

const base = {
  subjectId: 'math',
  topicId: 'limits',
  topicTitle: 'Limits',
  learningObjective: 'Explain limits as approach behavior.',
  sourceSpans,
  modelId: 'model/backend',
  capturedAt: '2026-05-12T00:00:00.000Z',
} as const;

describe('topic plan snapshot builders', () => {
  it('builds deterministic topic-concept-plan snapshots from backend-owned source spans', () => {
    const snapshot = buildTopicConceptPlanSnapshot(base);

    expect(snapshot).toMatchObject({
      snapshot_version: 1,
      pipeline_kind: 'topic-concept-plan',
      schema_version: TOPIC_CONCEPT_PLAN_SCHEMA_VERSION,
      prompt_template_version: TOPIC_PLAN_PROMPT_TEMPLATE_VERSION,
      subject_id: 'math',
      topic_id: 'limits',
      topic_title: 'Limits',
      learning_objective: 'Explain limits as approach behavior.',
      syllabus_questions: ['How do one-sided limits compare?'],
      target_difficulties: [2],
    });
    expect(snapshot.source_spans).toEqual([
      { sourceSpanId: 'span-core', kind: 'core-concept', index: 0, text: 'Limits describe approach behavior.' },
      { sourceSpanId: 'span-theory', kind: 'theory', index: 0, text: 'A function can approach a value even when it is undefined at the input.' },
      { sourceSpanId: 'span-question', kind: 'syllabus-question', index: 0, difficulty: 2, text: 'How do one-sided limits compare?' },
    ]);
  });

  it('builds topic-card-plan snapshots with compiled concept grounding subsets', async () => {
    const concepts = await compileTopicConceptPlan({
      subjectId: 'math',
      topicId: 'limits',
      sourceSpans,
      payload: {
        concepts: [
          { conceptKey: 'approach-behavior', title: 'Approach behavior', summary: 'Values near an input.', sourceSpanIds: ['span-core', 'span-theory'], targetDifficulties: [1, 2] },
        ],
      },
    });

    const snapshot = buildTopicCardPlanSnapshot({
      ...base,
      concepts,
      cardSpecTarget: 3,
      miniGameSpecTarget: 1,
    });

    expect(snapshot).toMatchObject({
      snapshot_version: 1,
      pipeline_kind: 'topic-card-plan',
      schema_version: TOPIC_CARD_PLAN_SCHEMA_VERSION,
      card_spec_target: 3,
      mini_game_spec_target: 1,
      concepts: [
        expect.objectContaining({
          concept_key: 'approach-behavior',
          title: 'Approach behavior',
          source_span_ids: ['span-core', 'span-theory'],
          target_difficulties: [1, 2],
        }),
      ],
    });
    expect(snapshot.concepts[0].source_spans.map((span) => span.sourceSpanId)).toEqual(['span-core', 'span-theory']);
  });

  it('rejects source spans or compiled concepts outside the requested topic scope', async () => {
    expect(() => buildTopicConceptPlanSnapshot({
      ...base,
      sourceSpans: [{ ...sourceSpans[0], topicId: 'derivatives' }],
    })).toThrow('must belong to subject math and topic limits');

    const concepts = await compileTopicConceptPlan({
      subjectId: 'math',
      topicId: 'limits',
      sourceSpans,
      payload: {
        concepts: [
          { conceptKey: 'approach-behavior', title: 'Approach behavior', summary: 'Values near an input.', sourceSpanIds: ['span-core'] },
        ],
      },
    });

    expect(() => buildTopicCardPlanSnapshot({
      ...base,
      concepts: [{ ...concepts[0], topicId: 'derivatives' }],
    })).toThrow('must belong to subject math and topic limits');
  });

  it('rejects card-plan snapshots when a compiled concept references a missing source span', async () => {
    const concepts = await compileTopicConceptPlan({
      subjectId: 'math',
      topicId: 'limits',
      sourceSpans,
      payload: {
        concepts: [
          { conceptKey: 'approach-behavior', title: 'Approach behavior', summary: 'Values near an input.', sourceSpanIds: ['span-core'] },
        ],
      },
    });

    expect(() => buildTopicCardPlanSnapshot({
      ...base,
      sourceSpans: sourceSpans.filter((span) => span.spanId !== 'span-core'),
      concepts,
    })).toThrow('references unknown source span span-core');
  });
});
