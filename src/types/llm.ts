export type ChatMessageRole = 'system' | 'user' | 'assistant';

/** OpenAI-style multimodal user message parts (vision, etc.). */
export type ChatTextPart = { type: 'text'; text: string };
export type ChatImageUrlPart = { type: 'image_url'; image_url: { url: string } };
export type ChatContentPart = ChatTextPart | ChatImageUrlPart;

export interface ChatMessage {
  role: ChatMessageRole;
  content: string | ChatContentPart[];
}

/** Tagged streaming chunk: reasoning tokens or content tokens, never both in a single chunk. */
export type ChatStreamChunkType = 'reasoning' | 'content';

export interface ChatStreamChunk {
  type: ChatStreamChunkType;
  text: string;
}

/** Result of a non-streaming chat completion. */
export interface ChatCompletionResult {
  content: string;
  reasoningContent: string | null;
}

/** Optional per-request overrides for OpenAI-compatible HTTP clients (ignored by other providers). */
export interface ChatCompletionConnectionOverrides {
  /** Full chat-completions URL; when omitted, uses the repository default. */
  endpointUrl?: string;
  /** Bearer token; when omitted, uses the repository default (e.g. env). */
  apiKey?: string;
}

export interface ChatCompletionStreamInput extends ChatCompletionConnectionOverrides {
  model: string;
  messages: ChatMessage[];
  /** When aborted, the stream stops and the iterator completes. */
  signal?: AbortSignal;
  /** Send `true` to enable model thinking; `false` to disable; omit for server default. */
  enableThinking?: boolean;
}

export interface IChatCompletionsRepository {
  completeChat(
    input: {
      model: string;
      messages: ChatMessage[];
      enableThinking?: boolean;
    } & ChatCompletionConnectionOverrides,
  ): Promise<ChatCompletionResult>;
  /** SSE stream yielding tagged chunks (reasoning or content). */
  streamChat(input: ChatCompletionStreamInput): AsyncIterable<ChatStreamChunk>;
}
