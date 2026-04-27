import type { ChatMessage } from '@/types/llm';
import topicTheorySyllabusTemplate from '@/prompts/topic-theory-syllabus.prompt';
import { appendContentBriefToSystem } from '@/lib/appendContentBriefToSystem';
import { interpolatePromptTemplate } from '@/lib/interpolatePromptTemplate';

export interface TopicTheoryPromptParams {
  subjectTitle: string;
  topicId: string;
  topicTitle: string;
  learningObjective: string;
  contentBrief?: string;
}

export function buildTopicTheoryMessages(params: TopicTheoryPromptParams): ChatMessage[] {
  const systemContent = appendContentBriefToSystem(
    interpolatePromptTemplate(topicTheorySyllabusTemplate, {
      subjectTitle: params.subjectTitle,
      topicId: params.topicId,
      topicTitle: params.topicTitle,
      learningObjective: params.learningObjective,
    }),
    params.contentBrief,
  );

  return [
    { role: 'system', content: systemContent },
  ];
}
