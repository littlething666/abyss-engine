import { resolveDefaultOpenAiChatCompletionsUrl } from '../openAiCompatibleDefaults';
import { resolveDefaultLlmModel } from '../llmDefaultModel';
import type {
  ChatCompletionResult,
  ChatCompletionStreamInput,
  ChatMessage,
  ChatStreamChunk,
  IChatCompletionsRepository,
} from '../../types/llm';

type ChatCompletionResponseBody = {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    } | null;
  } | null>;
};

type StreamChunkBody = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
    } | null;
  } | null>;
};

/** Some OpenAI-compatible gateways reject requests with no `user` turn. */
const USER_MESSAGE_FALLBACK: ChatMessage = {
  role: 'user',
  content: 'Follow the instructions above and respond.',
};

export function withUserMessageIfMissing(messages: ChatMessage[]): ChatMessage[] {
  if (messages.some((m) => m.role === 'user')) {
    return messages;
  }
  return [...messages, USER_MESSAGE_FALLBACK];
}

export class HttpChatCompletionsRepository implements IChatCompletionsRepository {
  /** Parses one SSE line (`data: ...`); yields a tagged chunk or null to skip. */
  static parseSseDataLine(rawLine: string): ChatStreamChunk | null {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) {
      return null;
    }
    const payload = line.slice(5).trim();
    if (payload === '' || payload === '[DONE]') {
      return null;
    }
    let parsed: StreamChunkBody;
    try {
      parsed = JSON.parse(payload) as StreamChunkBody;
    } catch {
      return null;
    }
    const delta = parsed.choices?.[0]?.delta;
    if (!delta) {
      return null;
    }
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
      return { type: 'reasoning', text: delta.reasoning_content };
    }
    if (typeof delta.content === 'string' && delta.content.length > 0) {
      return { type: 'content', text: delta.content };
    }
    return null;
  }

  constructor(
    private readonly chatUrl: string,
    private readonly defaultModel: string,
    private readonly apiKey: string | null = null,
  ) {}

  private buildHeaders(apiKeyOverride?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const key = apiKeyOverride !== undefined ? apiKeyOverride : this.apiKey;
    if (key) {
      headers.Authorization = `Bearer ${key}`;
    }
    return headers;
  }

  async completeChat(input: {
    model: string;
    messages: ChatMessage[];
    enableThinking?: boolean;
    endpointUrl?: string;
    apiKey?: string;
  }): Promise<ChatCompletionResult> {
    const messages = withUserMessageIfMissing(input.messages);
    const body: Record<string, unknown> = {
      model: input.model || this.defaultModel,
      messages,
      stream: false,
    };
    if (input.enableThinking !== undefined) {
      body.enable_thinking = input.enableThinking;
    }

    const url = input.endpointUrl ?? this.chatUrl;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(input.apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        detail ? `Chat completion failed (${response.status}): ${detail}` : `Chat completion failed (${response.status})`,
      );
    }

    const respBody = (await response.json()) as ChatCompletionResponseBody;
    const message = respBody.choices?.[0]?.message;
    const content = message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Chat completion response missing assistant message content');
    }
    const reasoningContent =
      typeof message?.reasoning_content === 'string' && message.reasoning_content.length > 0
        ? message.reasoning_content
        : null;
    return { content, reasoningContent };
  }

  async *streamChat(input: ChatCompletionStreamInput): AsyncGenerator<ChatStreamChunk, void, undefined> {
    const messages = withUserMessageIfMissing(input.messages);
    const body: Record<string, unknown> = {
      model: input.model || this.defaultModel,
      messages,
      stream: true,
    };
    if (input.enableThinking !== undefined) {
      body.enable_thinking = input.enableThinking;
    }

    const url = input.endpointUrl ?? this.chatUrl;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(input.apiKey),
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        detail ? `Chat completion failed (${response.status}): ${detail}` : `Chat completion failed (${response.status})`,
      );
    }

    const respBody = response.body;
    if (!respBody) {
      throw new Error('Chat completion stream missing response body');
    }

    const reader = respBody.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawAnyContent = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const piece = HttpChatCompletionsRepository.parseSseDataLine(rawLine);
          if (piece !== null) {
            sawAnyContent = true;
            yield piece;
          }
        }
      }
      const tailPiece = HttpChatCompletionsRepository.parseSseDataLine(buffer);
      if (tailPiece !== null) {
        sawAnyContent = true;
        yield tailPiece;
      }
    } finally {
      reader.releaseLock();
    }

    if (!sawAnyContent) {
      throw new Error('Chat completion stream ended with no assistant content');
    }
  }
}

export function createHttpChatCompletionsRepositoryFromEnv(): HttpChatCompletionsRepository {
  const chatUrl = resolveDefaultOpenAiChatCompletionsUrl();
  const defaultModel = resolveDefaultLlmModel();
  const apiKey = process.env.NEXT_PUBLIC_LLM_API_KEY?.trim() || null;
  return new HttpChatCompletionsRepository(chatUrl, defaultModel, apiKey);
}
