import type {
  ChatCompletionResult,
  ChatCompletionStreamInput,
  ChatCompletionTool,
  ChatMessage,
  ChatCompletionProviderMetadata,
  ChatResponseFormatJsonObject,
  ChatStreamChunk,
  IChatCompletionsRepository,
} from '../../types/llm';
import {
  mergeAssistantReasoningDetails,
  reasoningTextFromOpenRouterDelta,
} from './openRouterReasoningDetails';

/**
 * Bounded transient-gateway retry for OpenRouter Worker proxy failures.
 * Do not extend the retryable status set, do not add mid-stream retries, and do
 * not replicate this pattern in features/ or components/.
 * See `plans/openrouter-transient-retry.md` §I-R5/R6.
 */
const RETRYABLE_STATUSES = [502, 503, 504] as const;

const RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;

async function sleepAbortable(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

type ChatCompletionResponseBody = {
  usage?: unknown;
  citations?: unknown;
  annotations?: unknown;
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_details?: unknown;
      annotations?: unknown;
      citations?: unknown;
    } | null;
  } | null>;
};

type StreamChunkBody = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_details?: unknown;
    } | null;
  } | null>;
};

const USER_MESSAGE_FALLBACK: ChatMessage = {
  role: 'user',
  content: 'Follow the instructions above and respond.',
};

export function withUserMessageIfMissing(messages: ChatMessage[]): ChatMessage[] {
  if (messages.some((m) => m.role === 'user')) return messages;
  return [...messages, USER_MESSAGE_FALLBACK];
}

function appendOpenRouterReasoningToBody(
  body: Record<string, unknown>,
  input: { includeOpenRouterReasoning?: boolean; enableReasoning?: boolean },
): void {
  if (input.includeOpenRouterReasoning === true) {
    body.reasoning = { enabled: input.enableReasoning === true };
  }
}

function extractProviderMetadata(respBody: ChatCompletionResponseBody): ChatCompletionProviderMetadata | undefined {
  const message = respBody.choices?.[0]?.message;
  const metadata: ChatCompletionProviderMetadata = {};
  if (respBody.usage !== undefined) metadata.usage = respBody.usage;
  if (respBody.annotations !== undefined) metadata.annotations = respBody.annotations;
  if (respBody.citations !== undefined) metadata.citations = respBody.citations;
  if (message?.annotations !== undefined) metadata.annotations = message.annotations;
  if (message?.citations !== undefined) metadata.citations = message.citations;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export class HttpChatCompletionsRepository implements IChatCompletionsRepository {
  static parseSseDataLine(rawLine: string): ChatStreamChunk[] {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return [];
    const payload = line.slice(5).trim();
    if (payload === '' || payload === '[DONE]') return [];
    let parsed: StreamChunkBody;
    try {
      parsed = JSON.parse(payload) as StreamChunkBody;
    } catch {
      return [];
    }
    const delta = parsed.choices?.[0]?.delta as Record<string, unknown> | undefined;
    if (!delta) return [];
    const out: ChatStreamChunk[] = [];
    const reasoningText = reasoningTextFromOpenRouterDelta(delta);
    if (reasoningText) out.push({ type: 'reasoning', text: reasoningText });
    if (typeof delta.content === 'string' && delta.content.length > 0) {
      out.push({ type: 'content', text: delta.content });
    }
    return out;
  }

  constructor(
    private readonly chatUrl: string,
    private readonly defaultModel: string,
    private readonly apiKey: string | null = null,
    private readonly isRetryEligible: boolean = false,
    private readonly delayFn?: (ms: number, signal: AbortSignal | undefined) => Promise<void>,
  ) {}

  /**
   * Bounded transient-gateway retry. Do not extend the retryable status set,
   * do not add mid-stream retries, and do not replicate this pattern in
   * features/ or components/. See `plans/openrouter-transient-retry.md` §I-R5/R6.
   */
  private async fetchWithTransientRetry(url: string, init: RequestInit): Promise<Response> {
    const maxRetries = this.isRetryEligible ? RETRY_DELAYS_MS.length : 0;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await fetch(url, init);
      if (response.ok) return response;
      const status = response.status;
      const isTransient = (RETRYABLE_STATUSES as readonly number[]).includes(status);
      if (!isTransient || attempt >= maxRetries) return response;
      const delay = RETRY_DELAYS_MS[attempt]!;
      console.warn(
        `[HttpChatCompletionsRepository] Transient ${status} from ${url}; `
          + `retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}).`,
      );
      await response.text().catch(() => '');
      await (this.delayFn ?? sleepAbortable)(delay, init.signal ?? undefined);
      attempt += 1;
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  async completeChat(input: {
    model: string;
    messages: ChatMessage[];
    includeOpenRouterReasoning?: boolean;
    enableReasoning?: boolean;
    signal?: AbortSignal;
    temperature?: number;
    responseFormat?: ChatResponseFormatJsonObject;
    plugins?: Array<{ id: string }>;
    tools?: ChatCompletionTool[];
  }): Promise<ChatCompletionResult> {
    const messages = withUserMessageIfMissing(input.messages);
    const body: Record<string, unknown> = {
      model: input.model || this.defaultModel,
      messages,
      stream: false,
    };
    appendOpenRouterReasoningToBody(body, input);
    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.responseFormat !== undefined) body.response_format = input.responseFormat;
    if (input.plugins !== undefined && input.plugins.length > 0) body.plugins = input.plugins;
    if (input.tools !== undefined && input.tools.length > 0) body.tools = input.tools;

    const response = await this.fetchWithTransientRetry(this.chatUrl, {
      method: 'POST',
      headers: this.buildHeaders(),
      signal: input.signal,
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
    const reasoningDetails = message ? mergeAssistantReasoningDetails(message) : null;
    const providerMetadata = extractProviderMetadata(respBody);
    return { content, reasoningDetails, ...(providerMetadata ? { providerMetadata } : {}) };
  }

  async *streamChat(input: ChatCompletionStreamInput): AsyncGenerator<ChatStreamChunk, void, undefined> {
    if (input.enableStreaming === false) {
      const completed = await this.completeChat({
        model: input.model,
        messages: input.messages,
        includeOpenRouterReasoning: input.includeOpenRouterReasoning,
        enableReasoning: input.enableReasoning,
        signal: input.signal,
        temperature: input.temperature,
        responseFormat: input.responseFormat,
        plugins: input.plugins,
        tools: input.tools,
      });
      if (completed.providerMetadata) {
        yield { type: 'metadata', text: '', metadata: completed.providerMetadata };
      }
      if (completed.reasoningDetails && completed.reasoningDetails.length > 0) {
        yield { type: 'reasoning', text: completed.reasoningDetails };
      }
      if (completed.content.length > 0) {
        yield { type: 'content', text: completed.content };
      }
      return;
    }

    const messages = withUserMessageIfMissing(input.messages);
    const body: Record<string, unknown> = {
      model: input.model || this.defaultModel,
      messages,
      stream: true,
    };
    appendOpenRouterReasoningToBody(body, input);
    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.responseFormat !== undefined) body.response_format = input.responseFormat;
    if (input.plugins !== undefined && input.plugins.length > 0) body.plugins = input.plugins;
    if (input.tools !== undefined && input.tools.length > 0) body.tools = input.tools;

    const response = await this.fetchWithTransientRetry(this.chatUrl, {
      method: 'POST',
      headers: this.buildHeaders(),
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
    if (!respBody) throw new Error('Chat completion stream missing response body');

    const reader = respBody.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawAnyContent = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          for (const piece of HttpChatCompletionsRepository.parseSseDataLine(rawLine)) {
            sawAnyContent = true;
            yield piece;
          }
        }
      }
      for (const piece of HttpChatCompletionsRepository.parseSseDataLine(buffer)) {
        sawAnyContent = true;
        yield piece;
      }
    } finally {
      reader.releaseLock();
    }

    if (!sawAnyContent) throw new Error('Chat completion stream ended with no assistant content');
  }
}

export function createHttpChatCompletionsRepositoryFromEnv(): HttpChatCompletionsRepository {
  const chatUrl = process.env.NEXT_PUBLIC_LLM_CHAT_URL ?? 'http://localhost:8080/v1/chat/completions';
  const defaultModel = process.env.NEXT_PUBLIC_LLM_MODEL?.trim() ?? '';
  const apiKey = process.env.NEXT_PUBLIC_LLM_API_KEY?.trim() || null;
  return new HttpChatCompletionsRepository(chatUrl, defaultModel, apiKey, false);
}
