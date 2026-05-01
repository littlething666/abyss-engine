import type { ChatMessage } from '@/types/llm';
import type { MiniGameType } from '@/types/core';
import topicMiniGameCardsTemplate from '@/prompts/topic-mini-game-cards.prompt';
import { appendContentBriefToSystem } from '@/lib/appendContentBriefToSystem';
import { interpolatePromptTemplate } from '@/lib/interpolatePromptTemplate';
import type { MiniGameAffordanceSet } from '@/types/contentQuality';
import type { ContentStrategy } from '@/types/generationStrategy';
import type { GroundingSource } from '@/types/grounding';
import {
  formatContentStrategyBlock,
  formatGroundingSourcesBlock,
  formatMiniGameAffordancesBlock,
  formatSyllabusQuestionsBlock,
} from './promptBlocks';
import { subsetMiniGameAffordancesForType } from './subsetMiniGameAffordances';
import { buildMiniGameTypePromptRules } from './miniGameTypePromptRules';

export interface TopicMiniGameCardsPromptParams {
  topicId: string;
  topicTitle: string;
  theory: string;
  targetDifficulty: number;
  syllabusQuestions: string[];
  contentStrategy?: ContentStrategy;
  groundingSources?: GroundingSource[];
  miniGameAffordances?: MiniGameAffordanceSet;
  contentBrief?: string;
  /** Single mini-game schema for this LLM invocation. */
  gameType: MiniGameType;
}

export function buildTopicMiniGameCardsMessages(params: TopicMiniGameCardsPromptParams): ChatMessage[] {
  const affSubset = subsetMiniGameAffordancesForType(
    params.miniGameAffordances ?? { categorySets: [], orderedSequences: [], connectionPairs: [] },
    params.gameType,
  );
  const td = String(params.targetDifficulty);
  const gameTypeRules = buildMiniGameTypePromptRules(params.gameType, params.topicId, td);

  const systemContent = appendContentBriefToSystem(
    interpolatePromptTemplate(topicMiniGameCardsTemplate, {
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      theory: params.theory,
      targetDifficulty: td,
      expectedGameType: params.gameType,
      gameTypeRules,
      syllabusQuestions: formatSyllabusQuestionsBlock(params.syllabusQuestions),
      contentStrategyBlock: formatContentStrategyBlock(params.contentStrategy),
      groundingSourcesBlock: formatGroundingSourcesBlock(params.groundingSources),
      miniGameAffordancesBlock: formatMiniGameAffordancesBlock(affSubset),
    }),
    params.contentBrief,
  );

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: 'Output only the JSON object with the cards array.' },
  ];
}
