import type { ChatMessage } from '@/types/llm';
import topicTheorySyllabusTemplate from '@/prompts/topic-theory-syllabus.prompt';
import { interpolateAscentWeaverTemplate } from '@/features/ascentWeaver/interpolateAscentWeaverTemplate';

export interface TopicTheoryPromptParams {
  subjectTitle: string;
  topicId: string;
  topicTitle: string;
  learningObjective: string;
}

export function buildTopicTheoryMessages(params: TopicTheoryPromptParams): ChatMessage[] {
  const systemContent = interpolateAscentWeaverTemplate(topicTheorySyllabusTemplate, {
    subjectTitle: params.subjectTitle,
    topicId: params.topicId,
    topicTitle: params.topicTitle,
    learningObjective: params.learningObjective,
  });

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: 'Produce the JSON object now.' },
  ];
}
