import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter } from '@/types/repository';

export interface GenerationDependencies {
  chat: IChatCompletionsRepository;
  writer: IDeckContentWriter;
  model: string;
  enableThinking?: boolean;
  enableStreaming?: boolean;
  signal?: AbortSignal;
  /** If this execution is a retry, the ID of the original job or pipeline. */
  retryOf?: string;
}
