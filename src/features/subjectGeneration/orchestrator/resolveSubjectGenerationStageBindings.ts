import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';
import {
  resolveEnableReasoningForSurface,
  resolveEnableStreamingForSurface,
  resolveModelForSurface,
} from '@/infrastructure/llmInferenceSurfaceProviders';
import type { IChatCompletionsRepository } from '@/types/llm';

export interface SubjectGenerationStageBinding {
  chat: IChatCompletionsRepository;
  model: string;
  enableStreaming: boolean;
  enableReasoning: boolean;
}

export interface SubjectGenerationStageBindings {
  topics: SubjectGenerationStageBinding;
  edges: SubjectGenerationStageBinding;
}

export function resolveSubjectGenerationStageBindings(): SubjectGenerationStageBindings {
  const topics: SubjectGenerationStageBinding = {
    chat: getChatCompletionsRepositoryForSurface('subjectGenerationTopics'),
    model: resolveModelForSurface('subjectGenerationTopics'),
    enableStreaming: resolveEnableStreamingForSurface('subjectGenerationTopics'),
    enableReasoning: resolveEnableReasoningForSurface('subjectGenerationTopics'),
  };
  const edges: SubjectGenerationStageBinding = {
    chat: getChatCompletionsRepositoryForSurface('subjectGenerationEdges'),
    model: resolveModelForSurface('subjectGenerationEdges'),
    enableStreaming: false,
    enableReasoning: resolveEnableReasoningForSurface('subjectGenerationEdges'),
  };
  return { topics, edges };
}
