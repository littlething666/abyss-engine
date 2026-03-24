import { resolveDefaultLlmModel } from '../llmDefaultModel';
import type {
  ChatCompletionStreamInput,
  ChatMessage,
  IChatCompletionsRepository,
} from '../../types/llm';

type ChatCompletionResponseBody = {
  choices?: Array<{ message?: { content?: string | null } | null } | null>;
};

type StreamChunkBody = {
  choices?: Array<{ delta?: { content?: string | null } | null } | null>;
};

export class HttpChatCompletionsRepository implements IChatCompletionsRepository {
  /** Parses one SSE line (`data: ...`); yields text delta or null to skip. */
  static parseSseDataLine(rawLine: string): string | null {
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
    const piece = parsed.choices?.[0]?.delta?.content;
    if (typeof piece === 'string' && piece.length > 0) {
      return piece;
    }
    return null;
  }

  constructor(
    private readonly chatUrl: string,
    private readonly defaultModel: string,
    private readonly apiKey: string | null = null,
  ) {}

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async completeChat(input: { model: string; messages: ChatMessage[] }): Promise<string> {
    const response = await fetch(this.chatUrl, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: input.model || this.defaultModel,
        messages: input.messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        detail ? `Chat completion failed (${response.status}): ${detail}` : `Chat completion failed (${response.status})`,
      );
    }

    const body = (await response.json()) as ChatCompletionResponseBody;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Chat completion response missing assistant message content');
    }
    return content;
  }

  async *streamChat(input: ChatCompletionStreamInput): AsyncGenerator<string, void, undefined> {
    const response = await fetch(this.chatUrl, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: input.model || this.defaultModel,
        messages: input.messages,
        stream: true,
      }),
      signal: input.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        detail ? `Chat completion failed (${response.status}): ${detail}` : `Chat completion failed (${response.status})`,
      );
    }

    const body = response.body;
    if (!body) {
      throw new Error('Chat completion stream missing response body');
    }

    const reader = body.getReader();
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
  const chatUrl =
    process.env.NEXT_PUBLIC_LLM_CHAT_URL ?? 'http://localhost:8080/v1/chat/completions';
  const defaultModel = resolveDefaultLlmModel();
  const apiKey = process.env.NEXT_PUBLIC_LLM_API_KEY?.trim() || null;
  return new HttpChatCompletionsRepository(chatUrl, defaultModel, apiKey);
}
