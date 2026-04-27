import type { ChatMessage } from '@/types/llm';
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
}

export function buildTopicMiniGameCardsMessages(params: TopicMiniGameCardsPromptParams): ChatMessage[] {
  const systemContent = appendContentBriefToSystem(
    interpolatePromptTemplate(topicMiniGameCardsTemplate, {
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      theory: params.theory,
      targetDifficulty: String(params.targetDifficulty),
      syllabusQuestions: formatSyllabusQuestionsBlock(params.syllabusQuestions),
      contentStrategyBlock: formatContentStrategyBlock(params.contentStrategy),
      groundingSourcesBlock: formatGroundingSourcesBlock(params.groundingSources),
      miniGameAffordancesBlock: formatMiniGameAffordancesBlock(params.miniGameAffordances),
    }),
    params.contentBrief,
  );

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: 'Output only the JSON object with the cards array.' },
  ];
}
