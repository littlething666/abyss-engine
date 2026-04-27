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
export type ChatStreamChunkType = 'reasoning' | 'content' | 'metadata';

export interface ChatStreamChunk {
  type: ChatStreamChunkType;
  text: string;
  metadata?: ChatCompletionProviderMetadata;
}

export interface ChatCompletionResult {
  content: string;
  reasoningDetails: string | null;
  providerMetadata?: ChatCompletionProviderMetadata;
}

/** OpenAI-compatible `response_format` (used for OpenRouter structured JSON jobs). */
export type ChatResponseFormatJsonObject = { type: 'json_object' };

export type OpenRouterWebSearchTool = {
  type: 'openrouter:web_search';
  engine: string;
  max_results: number;
  max_total_results: number;
};

export type ChatCompletionTool = OpenRouterWebSearchTool;

export interface ChatCompletionProviderMetadata {
  usage?: unknown;
  annotations?: unknown;
  citations?: unknown;
}

export interface ChatCompletionStreamInput {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /**
   * When true with OpenRouter, sends `reasoning: { enabled: enableReasoning }`.
   * Omit or false for non-OpenRouter or models without the reasoning parameter.
   */
  includeOpenRouterReasoning?: boolean;
  /** Meaningful only when `includeOpenRouterReasoning` is true. */
  enableReasoning?: boolean;
  /** Send `false` to force non-streamed completion; defaults to `true`. */
  enableStreaming?: boolean;
  /** When set, forwarded as `temperature` in the chat-completions JSON body. Omit for provider default. */
  temperature?: number;
  /** When set, included in the chat-completions JSON body (OpenRouter / compatible servers). */
  responseFormat?: ChatResponseFormatJsonObject;
  /** OpenRouter plugins array, e.g. `[{ id: 'response-healing' }]`. */
  plugins?: Array<{ id: string }>;
  /** OpenRouter server tools, e.g. `openrouter:web_search`. */
  tools?: ChatCompletionTool[];
}

export interface IChatCompletionsRepository {
  completeChat(input: {
    model: string;
    messages: ChatMessage[];
    includeOpenRouterReasoning?: boolean;
    enableReasoning?: boolean;
    signal?: AbortSignal;
    /** When set, forwarded as `temperature` in the chat-completions JSON body. Omit for provider default. */
    temperature?: number;
    responseFormat?: ChatResponseFormatJsonObject;
    plugins?: Array<{ id: string }>;
    tools?: ChatCompletionTool[];
  }): Promise<ChatCompletionResult>;
  streamChat(input: ChatCompletionStreamInput): AsyncIterable<ChatStreamChunk>;
}
