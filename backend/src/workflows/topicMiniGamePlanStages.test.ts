import { describe, expect, it } from 'vitest';
import type { CompiledTopicCardPlan, CompiledTopicMiniGameSpec } from '../learningContent';
import {
  compiledMiniGameSpecsForType,
  miniGameSpecsForPrompt,
  resolvePlannedTopicMiniGameStages,
  sourceSpanIdsForMiniGameType,
} from './topicMiniGamePlanStages';

function miniGameSpec(input: Partial<CompiledTopicMiniGameSpec> & Pick<CompiledTopicMiniGameSpec, 'miniGameKey' | 'gameType' | 'difficulty' | 'sourceSpanIds'>): CompiledTopicMiniGameSpec {
  return {
    ...input,
    subjectId: input.subjectId ?? 'math',
    topicId: input.topicId ?? 'vectors',
    miniGameSpecId: input.miniGameSpecId ?? `mini_game_spec_${input.miniGameKey}`,
    conceptId: input.conceptId ?? 'concept_vectors',
    conceptKey: input.conceptKey ?? 'vectors',
    prompt: input.prompt ?? `Generate ${input.miniGameKey}`,
  };
}

const cardPlan: CompiledTopicCardPlan = {
  cardSpecs: [],
  miniGameSpecs: [
    miniGameSpec({ miniGameKey: 'notation-pairs-b', gameType: 'MATCH_PAIRS', difficulty: 3, sourceSpanIds: ['span-b', 'span-a'] }),
    miniGameSpec({ miniGameKey: 'basis-sort', gameType: 'CATEGORY_SORT', difficulty: 1, sourceSpanIds: ['span-c'] }),
    miniGameSpec({ miniGameKey: 'notation-pairs-a', gameType: 'MATCH_PAIRS', difficulty: 2, sourceSpanIds: ['span-a'] }),
  ],
};

describe('topic mini-game plan stage helpers', () => {
  it('keeps legacy wanted mini-game stages when no compiled card plan is available', () => {
    expect(resolvePlannedTopicMiniGameStages({
      wantedStages: ['study-cards', 'mini-games:MATCH_PAIRS', 'mini-games:CATEGORY_SORT'],
      cardPlan: null,
    })).toEqual(['mini-games:CATEGORY_SORT', 'mini-games:MATCH_PAIRS']);
  });

  it('filters wanted mini-game stages by compiled mini-game spec gameType', () => {
    expect(resolvePlannedTopicMiniGameStages({
      wantedStages: ['mini-games:CATEGORY_SORT', 'mini-games:SEQUENCE_BUILD', 'mini-games:MATCH_PAIRS'],
      cardPlan,
    })).toEqual(['mini-games:CATEGORY_SORT', 'mini-games:MATCH_PAIRS']);
  });

  it('orders selected specs and source spans deterministically for prompts', () => {
    expect(compiledMiniGameSpecsForType(cardPlan, 'MATCH_PAIRS').map((spec) => spec.miniGameKey))
      .toEqual(['notation-pairs-a', 'notation-pairs-b']);
    expect(sourceSpanIdsForMiniGameType(cardPlan, 'MATCH_PAIRS')).toEqual(['span-a', 'span-b']);
    expect(miniGameSpecsForPrompt(compiledMiniGameSpecsForType(cardPlan, 'MATCH_PAIRS'))).toEqual([
      expect.objectContaining({
        mini_game_spec_id: 'mini_game_spec_notation-pairs-a',
        mini_game_key: 'notation-pairs-a',
        game_type: 'MATCH_PAIRS',
        difficulty: 2,
        source_span_ids: ['span-a'],
      }),
      expect.objectContaining({
        mini_game_spec_id: 'mini_game_spec_notation-pairs-b',
        mini_game_key: 'notation-pairs-b',
        game_type: 'MATCH_PAIRS',
        difficulty: 3,
        source_span_ids: ['span-b', 'span-a'],
      }),
    ]);
  });
});
