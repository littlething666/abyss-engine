import { describe, expect, it } from 'vitest';
import type { TopicTheorySourceSpan } from './theorySourceSpans';
import { compileTopicCardPlan, compileTopicConceptPlan } from './topicPlanCompiler';

const spans: TopicTheorySourceSpan[] = [
  { spanId: 'span-core', subjectId: 'math', topicId: 'limits', kind: 'core-concept', index: 0, text: 'Limits describe approach behavior.' },
  { spanId: 'span-theory', subjectId: 'math', topicId: 'limits', kind: 'theory', index: 0, text: 'A limit can exist even when the function value is undefined.' },
  { spanId: 'span-question', subjectId: 'math', topicId: 'limits', kind: 'syllabus-question', index: 0, difficulty: 2, text: 'How do one-sided limits compare?' },
];

describe('topic plan compiler', () => {
  it('compiles concept plans into deterministic backend-owned concept specs and ignores model ids', async () => {
    const payload = {
      concepts: [
        {
          id: 'llm-id-ignored',
          conceptId: 'llm-concept-id-ignored',
          conceptKey: 'Approach-Behavior',
          title: 'Approach behavior',
          summary: 'Understand values approached near an input.',
          sourceSpanIds: ['span-theory', 'span-core', 'span-core'],
          targetDifficulties: [2, 1, 2],
        },
      ],
    };

    const first = await compileTopicConceptPlan({ subjectId: 'math', topicId: 'limits', sourceSpans: spans, payload });
    const second = await compileTopicConceptPlan({
      subjectId: 'math',
      topicId: 'limits',
      sourceSpans: spans,
      payload: {
        concepts: [{ ...payload.concepts[0], id: 'different-llm-id', conceptId: 'different-llm-concept-id' }],
      },
    });

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      subjectId: 'math',
      topicId: 'limits',
      conceptKey: 'approach-behavior',
      conceptId: expect.stringMatching(/^concept_[0-9a-f]{64}$/),
      sourceSpanIds: ['span-core', 'span-theory'],
      targetDifficulties: [1, 2],
      priority: 1,
    });
  });

  it('rejects concept plans that reference source spans not compiled from topic theory', async () => {
    await expect(compileTopicConceptPlan({
      subjectId: 'math',
      topicId: 'limits',
      sourceSpans: spans,
      payload: {
        concepts: [
          { conceptKey: 'missing-grounding', title: 'Missing grounding', summary: 'Bad source', sourceSpanIds: ['span-missing'] },
        ],
      },
    })).rejects.toMatchObject({ code: 'validation:semantic-topic-content' });
  });

  it('compiles card and mini-game plans into deterministic specs linked to compiled concepts', async () => {
    const concepts = await compileTopicConceptPlan({
      subjectId: 'math',
      topicId: 'limits',
      sourceSpans: spans,
      payload: {
        concepts: [
          { conceptKey: 'approach-behavior', title: 'Approach behavior', summary: 'Approach values.', sourceSpanIds: ['span-core', 'span-theory'] },
        ],
      },
    });

    const compiled = await compileTopicCardPlan({
      subjectId: 'math',
      topicId: 'limits',
      concepts,
      payload: {
        cardSpecs: [
          {
            id: 'llm-card-id-ignored',
            cardSpecId: 'llm-card-spec-id-ignored',
            cardKey: 'definition-card',
            conceptKey: 'Approach-Behavior',
            cardType: 'FLASHCARD',
            difficulty: 1,
            prompt: 'Ask what a limit describes.',
            sourceSpanIds: ['span-core'],
            learningObjective: 'Define limits as approach behavior.',
          },
        ],
        miniGameSpecs: [
          {
            id: 'llm-game-id-ignored',
            miniGameSpecId: 'llm-mini-game-spec-id-ignored',
            miniGameKey: 'sort-examples',
            conceptKey: 'approach-behavior',
            gameType: 'CATEGORY_SORT',
            difficulty: 2,
            prompt: 'Sort examples into valid and invalid limit reasoning.',
            sourceSpanIds: ['span-core', 'span-theory'],
          },
        ],
      },
    });

    expect(compiled.cardSpecs).toEqual([
      expect.objectContaining({
        cardSpecId: expect.stringMatching(/^card_spec_[0-9a-f]{64}$/),
        conceptId: concepts[0].conceptId,
        conceptKey: 'approach-behavior',
        cardKey: 'definition-card',
        cardType: 'FLASHCARD',
        sourceSpanIds: ['span-core'],
      }),
    ]);
    expect(compiled.miniGameSpecs).toEqual([
      expect.objectContaining({
        miniGameSpecId: expect.stringMatching(/^mini_game_spec_[0-9a-f]{64}$/),
        conceptId: concepts[0].conceptId,
        miniGameKey: 'sort-examples',
        gameType: 'CATEGORY_SORT',
        sourceSpanIds: ['span-core', 'span-theory'],
      }),
    ]);
  });


  it('rejects duplicate concept, card, and mini-game local keys before compiled specs are used for jobs', async () => {
    await expect(compileTopicConceptPlan({
      subjectId: 'math',
      topicId: 'limits',
      sourceSpans: spans,
      payload: {
        concepts: [
          { conceptKey: 'same-key', title: 'First', summary: 'First concept.', sourceSpanIds: ['span-core'] },
          { conceptKey: 'Same-Key', title: 'Second', summary: 'Second concept.', sourceSpanIds: ['span-theory'] },
        ],
      },
    })).rejects.toMatchObject({ code: 'validation:semantic-topic-content' });

    const concepts = await compileTopicConceptPlan({
      subjectId: 'math',
      topicId: 'limits',
      sourceSpans: spans,
      payload: {
        concepts: [
          { conceptKey: 'approach-behavior', title: 'Approach behavior', summary: 'Approach values.', sourceSpanIds: ['span-core', 'span-theory'] },
        ],
      },
    });

    await expect(compileTopicCardPlan({
      subjectId: 'math',
      topicId: 'limits',
      concepts,
      payload: {
        cardSpecs: [
          { cardKey: 'same-card', conceptKey: 'approach-behavior', cardType: 'FLASHCARD', difficulty: 1, prompt: 'First', sourceSpanIds: ['span-core'] },
          { cardKey: 'Same-Card', conceptKey: 'approach-behavior', cardType: 'MULTIPLE_CHOICE', difficulty: 2, prompt: 'Second', sourceSpanIds: ['span-theory'] },
        ],
      },
    })).rejects.toMatchObject({ code: 'validation:semantic-topic-content' });

    await expect(compileTopicCardPlan({
      subjectId: 'math',
      topicId: 'limits',
      concepts,
      payload: {
        cardSpecs: [
          { cardKey: 'valid-card', conceptKey: 'approach-behavior', cardType: 'FLASHCARD', difficulty: 1, prompt: 'Valid', sourceSpanIds: ['span-core'] },
        ],
        miniGameSpecs: [
          { miniGameKey: 'same-game', conceptKey: 'approach-behavior', gameType: 'CATEGORY_SORT', difficulty: 1, prompt: 'First', sourceSpanIds: ['span-core'] },
          { miniGameKey: 'Same-Game', conceptKey: 'approach-behavior', gameType: 'MATCH_PAIRS', difficulty: 2, prompt: 'Second', sourceSpanIds: ['span-theory'] },
        ],
      },
    })).rejects.toMatchObject({ code: 'validation:semantic-topic-content' });
  });

  it('rejects card specs that reference unknown concepts or spans outside the concept', async () => {
    const concepts = await compileTopicConceptPlan({
      subjectId: 'math',
      topicId: 'limits',
      sourceSpans: spans,
      payload: {
        concepts: [
          { conceptKey: 'approach-behavior', title: 'Approach behavior', summary: 'Approach values.', sourceSpanIds: ['span-core'] },
        ],
      },
    });

    await expect(compileTopicCardPlan({
      subjectId: 'math',
      topicId: 'limits',
      concepts,
      payload: {
        cardSpecs: [
          { cardKey: 'bad-card', conceptKey: 'missing-concept', cardType: 'FLASHCARD', difficulty: 1, prompt: 'Bad', sourceSpanIds: ['span-core'] },
        ],
      },
    })).rejects.toMatchObject({ code: 'validation:semantic-topic-content' });

    await expect(compileTopicCardPlan({
      subjectId: 'math',
      topicId: 'limits',
      concepts,
      payload: {
        cardSpecs: [
          { cardKey: 'bad-card', conceptKey: 'approach-behavior', cardType: 'FLASHCARD', difficulty: 1, prompt: 'Bad', sourceSpanIds: ['span-theory'] },
        ],
      },
    })).rejects.toMatchObject({ code: 'validation:semantic-topic-content' });
  });
});
