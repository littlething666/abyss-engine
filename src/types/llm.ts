export type ChatMessageRole = 'system' | 'user' | 'assistant';

/** OpenAI-style multimodal user message parts (vision, etc.). */
export type ChatTextPart = { type: 'text'; text: string };
export type ChatImageUrlPart = { type: 'image_url'; image_url: { url: string } };
export type ChatContentPart = ChatTextPart | ChatImageUrlPart;

export interface ChatMessage {
  role: ChatMessageRole;
  content: string | ChatContentPart[];
}

export interface ChatCompletionStreamInput {
  model: string;
  messages: ChatMessage[];
  /** When aborted, the stream stops and the iterator completes. */
  signal?: AbortSignal;
}

export interface IChatCompletionsRepository {
  completeChat(input: { model: string; messages: ChatMessage[] }): Promise<string>;
  /** OpenAI-style SSE (`data: {json}` lines); yields `choices[0].delta.content` fragments. */
  streamChat(input: ChatCompletionStreamInput): AsyncIterable<string>;
}
