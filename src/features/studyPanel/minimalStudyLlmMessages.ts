import type { ChatMessage } from '../../types/llm';
import minimalStudyPrompt from '../../prompts/minimal-study.prompt';
import { getAgentPersonalityInstructions } from './agentPersonalityPresets';
import { interpolatePromptTemplate } from './promptTemplate';

export function buildMinimalStudyQuestionMessages(
  topicLabel: string,
  questionText: string,
  agentPersonality: string,
): ChatMessage[] {
  const topic = topicLabel.trim() || 'Unknown topic';
  const question = questionText.trim() || '(empty question)';
  const personality = getAgentPersonalityInstructions(agentPersonality);

  return [
    {
      role: 'system',
      content: interpolatePromptTemplate(minimalStudyPrompt, { topic, question, personality }),
    },
  ];
}
