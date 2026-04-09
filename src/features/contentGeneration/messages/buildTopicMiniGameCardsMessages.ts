import type { ChatMessage } from '@/types/llm';
import topicMiniGameCardsTemplate from '@/prompts/topic-mini-game-cards.prompt';
import { interpolateAscentWeaverTemplate } from '@/features/ascentWeaver/interpolateAscentWeaverTemplate';

export interface TopicMiniGameCardsPromptParams {
  topicId: string;
  topicTitle: string;
  theory: string;
  difficulty1Questions: string;
}

export function buildTopicMiniGameCardsMessages(params: TopicMiniGameCardsPromptParams): ChatMessage[] {
  const systemContent = interpolateAscentWeaverTemplate(topicMiniGameCardsTemplate, {
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
