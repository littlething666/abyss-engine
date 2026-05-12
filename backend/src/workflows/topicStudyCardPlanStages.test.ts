import { describe, expect, it } from 'vitest';
import type { CompiledTopicCardPlan, CompiledTopicCardSpec } from '../learningContent';
import {
  compiledStudyCardSpecsForPrompt,
  sourceSpanIdsForStudyCardSpecs,
} from './topicStudyCardPlanStages';

function cardSpec(input: Partial<CompiledTopicCardSpec> & Pick<CompiledTopicCardSpec, 'cardKey' | 'cardType' | 'difficulty' | 'sourceSpanIds'>): CompiledTopicCardSpec {
  return {
    ...input,
    subjectId: input.subjectId ?? 'math',
    topicId: input.topicId ?? 'vectors',
    cardSpecId: input.cardSpecId ?? `card_spec_${input.cardKey}`,
    conceptId: input.conceptId ?? 'concept_vectors',
    conceptKey: input.conceptKey ?? 'vectors',
    prompt: input.prompt ?? `Generate ${input.cardKey}`,
  };
}

const cardPlan: CompiledTopicCardPlan = {
  cardSpecs: [
    cardSpec({ cardKey: 'vector-magnitude', cardType: 'MULTIPLE_CHOICE', difficulty: 3, sourceSpanIds: ['span-b', 'span-a'] }),
    cardSpec({ cardKey: 'vector-definition', cardType: 'FLASHCARD', difficulty: 1, sourceSpanIds: ['span-a'] }),
  ],
  miniGameSpecs: [],
};

describe('topic study-card plan stage helpers', () => {
  it('orders compiled study-card specs deterministically for prompts', () => {
    expect(compiledStudyCardSpecsForPrompt(cardPlan.cardSpecs)).toEqual([
      expect.objectContaining({
        card_spec_id: 'card_spec_vector-definition',
        card_key: 'vector-definition',
        card_type: 'FLASHCARD',
        difficulty: 1,
        source_span_ids: ['span-a'],
      }),
      expect.objectContaining({
        card_spec_id: 'card_spec_vector-magnitude',
        card_key: 'vector-magnitude',
        card_type: 'MULTIPLE_CHOICE',
        difficulty: 3,
        source_span_ids: ['span-b', 'span-a'],
      }),
    ]);
  });

  it('returns a stable source-span allow-list from study-card specs only', () => {
    expect(sourceSpanIdsForStudyCardSpecs(cardPlan)).toEqual(['span-a', 'span-b']);
  });
});
