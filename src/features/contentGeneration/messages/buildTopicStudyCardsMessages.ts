import type { ChatMessage } from '@/types/llm';
import topicStudyCardsTemplate from '@/prompts/topic-study-cards.prompt';
import { interpolateAscentWeaverTemplate } from '@/features/ascentWeaver/interpolateAscentWeaverTemplate';

export interface TopicStudyCardsPromptParams {
  topicId: string;
  topicTitle: string;
  theory: string;
  difficulty1Questions: string;
}

export function buildTopicStudyCardsMessages(params: TopicStudyCardsPromptParams): ChatMessage[] {
  const systemContent = interpolateAscentWeaverTemplate(topicStudyCardsTemplate, {
    topicId: params.topicId,
    topicTitle: params.topicTitle,
    theory: params.theory,
    difficulty1Questions: params.difficulty1Questions,
  });

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: 'Output only the JSON object with the cards array.' },
  ];
}
