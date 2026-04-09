import type { ChatMessage } from '@/types/llm';
import topicExpansionCardsTemplate from '@/prompts/topic-expansion-cards.prompt';
import { interpolateAscentWeaverTemplate } from '@/features/ascentWeaver/interpolateAscentWeaverTemplate';

export interface TopicExpansionCardsPromptParams {
  topicId: string;
  topicTitle: string;
  theoryExcerpt: string;
  syllabusQuestions: string;
  difficulty: number;
}

export function buildTopicExpansionCardsMessages(params: TopicExpansionCardsPromptParams): ChatMessage[] {
  const systemContent = interpolateAscentWeaverTemplate(topicExpansionCardsTemplate, {
    topicId: params.topicId,
    topicTitle: params.topicTitle,
    theoryExcerpt: params.theoryExcerpt,
    syllabusQuestions: params.syllabusQuestions,
    difficulty: String(params.difficulty),
  });

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: 'Output only the JSON object with the cards array.' },
  ];
}
