import type { ChatMessage } from '@/types/llm';
import type { IChatCompletionsRepository } from '@/types/llm';

export interface StreamChatAccumulateParams {
  chat: IChatCompletionsRepository;
  model: string;
  messages: ChatMessage[];
  enableThinking: boolean;
  signal?: AbortSignal;
}

export async function streamChatAccumulate(params: StreamChatAccumulateParams): Promise<string> {
  const { chat, model, messages, enableThinking, signal } = params;
  let acc = '';
  for await (const chunk of chat.streamChat({
    model,
    messages,
    enableThinking,
    ...(signal ? { signal } : {}),
  })) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (chunk.type === 'content') {
      acc += chunk.text;
    }
  }
  return acc;
}
