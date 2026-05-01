import type { ChatMessage } from '@/types/llm';
import type { MiniGameType } from '@/types/core';
import topicMiniGameCardsTemplate from '@/prompts/topic-mini-game-cards.prompt';
import { appendContentBriefToSystem } from '@/lib/appendContentBriefToSystem';
import { interpolatePromptTemplate } from '@/lib/interpolatePromptTemplate';
import type { ContentStrategy } from '@/types/generationStrategy';
import type { GroundingSource } from '@/types/grounding';
import { formatContentStrategyBlock, formatGroundingSourcesBlock, formatSyllabusQuestionsBlock } from './promptBlocks';
import { buildMiniGameTypePromptRules } from './miniGameTypePromptRules';

export interface TopicMiniGameCardsPromptParams {
  topicId: string;
  topicTitle: string;
  theory: string;
  targetDifficulty: number;
  syllabusQuestions: string[];
  contentStrategy?: ContentStrategy;
  groundingSources?: GroundingSource[];
  contentBrief?: string;
  /** Single mini-game schema for this LLM invocation. */
  gameType: MiniGameType;
}

export function buildTopicMiniGameCardsMessages(params: TopicMiniGameCardsPromptParams): ChatMessage[] {
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
    }),
    params.contentBrief,
  );

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: 'Output only the JSON object with the cards array.' },
  ];
}
