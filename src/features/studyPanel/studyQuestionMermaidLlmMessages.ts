import type { ChatMessage } from '../../types/llm';
import studyQuestionMermaidPrompt from '../../prompts/study-question-mermaid.prompt';
import { interpolatePromptTemplate } from './promptTemplate';

export function buildStudyQuestionMermaidMessages(topicLabel: string, questionText: string): ChatMessage[] {
  const topic = topicLabel.trim() || 'Unknown topic';
  const question = questionText.trim() || '(empty question)';

  return [
    {
      role: 'system',
      content: interpolatePromptTemplate(studyQuestionMermaidPrompt, { topic, question }),
    },
  ];
}
