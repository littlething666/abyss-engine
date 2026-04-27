import type { ChatMessage } from '@/types/llm';
import topicExpansionCardsTemplate from '@/prompts/topic-expansion-cards.prompt';
import { appendContentBriefToSystem } from '@/lib/appendContentBriefToSystem';
import { interpolatePromptTemplate } from '@/lib/interpolatePromptTemplate';
import type { ContentStrategy } from '@/types/generationStrategy';
import type { GroundingSource } from '@/types/grounding';
import {
  formatContentStrategyBlock,
  formatGroundingSourcesBlock,
} from './promptBlocks';

export interface TopicExpansionCardsPromptParams {
  topicId: string;
  topicTitle: string;
  theoryExcerpt: string;
  syllabusQuestions: string;
  difficulty: number;
  contentStrategy?: ContentStrategy;
  groundingSources?: GroundingSource[];
  existingConceptStems?: string[];
  existingMiniGameItemLabels?: string[];
  contentBrief?: string;
}

export function buildTopicExpansionCardsMessages(params: TopicExpansionCardsPromptParams): ChatMessage[] {
  const systemContent = appendContentBriefToSystem(
    interpolatePromptTemplate(topicExpansionCardsTemplate, {
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      theoryExcerpt: params.theoryExcerpt,
      syllabusQuestions: params.syllabusQuestions,
      difficulty: String(params.difficulty),
      contentStrategyBlock: formatContentStrategyBlock(params.contentStrategy),
      groundingSourcesBlock: formatGroundingSourcesBlock(params.groundingSources),
      existingConceptStems: params.existingConceptStems?.join('\n') || 'None.',
      existingMiniGameItemLabels: params.existingMiniGameItemLabels?.join('\n') || 'None.',
    }),
    params.contentBrief,
  );

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: 'Output only the JSON object with the cards array.' },
  ];
}
