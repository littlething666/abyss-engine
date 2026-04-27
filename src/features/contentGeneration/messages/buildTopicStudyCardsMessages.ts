import type { ChatMessage } from '@/types/llm';
import topicStudyCardsTemplate from '@/prompts/topic-study-cards.prompt';
import { appendContentBriefToSystem } from '@/lib/appendContentBriefToSystem';
import { interpolatePromptTemplate } from '@/lib/interpolatePromptTemplate';
import type { ContentStrategy } from '@/types/generationStrategy';
import type { GroundingSource } from '@/types/grounding';
import {
  formatContentStrategyBlock,
  formatGroundingSourcesBlock,
  formatSyllabusQuestionsBlock,
} from './promptBlocks';

export interface TopicStudyCardsPromptParams {
  topicId: string;
  topicTitle: string;
  theory: string;
  targetDifficulty: number;
  syllabusQuestions: string[];
  contentStrategy?: ContentStrategy;
  groundingSources?: GroundingSource[];
  contentBrief?: string;
}

export function buildTopicStudyCardsMessages(params: TopicStudyCardsPromptParams): ChatMessage[] {
  const systemContent = appendContentBriefToSystem(
    interpolatePromptTemplate(topicStudyCardsTemplate, {
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      theory: params.theory,
      targetDifficulty: String(params.targetDifficulty),
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
