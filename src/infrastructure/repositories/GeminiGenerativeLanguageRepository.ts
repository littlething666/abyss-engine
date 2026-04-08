import type {
  ChatCompletionConnectionOverrides,
  ChatCompletionResult,
  ChatCompletionStreamInput,
  ChatContentPart,
  ChatMessage,
  ChatStreamChunk,
  IChatCompletionsRepository,
} from '../../types/llm';

type GeminiInlinePart = { inlineData: { mimeType: string; data: string } };
type GeminiTextPart = { text: string };
type GeminiPart = GeminiTextPart | GeminiInlinePart;

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

export type GeminiGenerateBody = {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiTextPart[] };
};

const dataUrlPattern = /^data:([^;,]+);base64,(.+)$/i;

export function parseDataUrlToInlineImage(url: string): { mimeType: string; data: string } {
  const m = url.trim().match(dataUrlPattern);
  if (!m) {
    throw new Error('Gemini adapter only supports data URL images (expected data:*;base64,...');
  }
  return { mimeType: m[1].trim() || 'application/octet-stream', data: m[2].trim() };
}

export function chatContentPartsToGeminiParts(parts: ChatContentPart[]): GeminiPart[] {
  const out: GeminiPart[] = [];
  for (const p of parts) {
    if (p.type === 'text') {
      out.push({ text: p.text });
    } else {
      const url = p.image_url?.url?.trim() ?? '';
      if (url.startsWith('data:')) {
        const { mimeType, data } = parseDataUrlToInlineImage(url);
        out.push({ inlineData: { mimeType, data } });
      } else {
        throw new Error(
          'Gemini adapter only supports inline data URL images for vision messages',
        );
      }
    }
  }
  return out;
}

export function singleMessageContentToGeminiParts(content: string | ChatContentPart[]): GeminiPart[] {
  if (typeof content === 'string') {
    return [{ text: content }];
  }
  return chatContentPartsToGeminiParts(content);
}

/** Builds POST body for generateContent / streamGenerateContent from canonical chat messages. */
export function buildGeminiGenerateBodyFromChatMessages(messages: ChatMessage[]): GeminiGenerateBody {
  const systemTexts: string[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      if (typeof m.content === 'string') {
        systemTexts.push(m.content);
      } else {
        for (const p of m.content) {
          if (p.type === 'text') {
            systemTexts.push(p.text);
          }
        }
      }
    }
  }

  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      continue;
    }
    const geminiRole: 'user' | 'model' = m.role === 'assistant' ? 'model' : 'user';
    const parts = singleMessageContentToGeminiParts(m.content);
    const last = contents[contents.length - 1];
    if (last && last.role === geminiRole) {
      last.parts.push(...parts);
    } else {
      contents.push({ role: geminiRole, parts });
    }
  }

  const body: GeminiGenerateBody = { contents };
  if (systemTexts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemTexts.join('\n\n') }] };
  }
  return body;
}

/** Extracts tagged chunks from a Gemini response payload (parts with `thought: true` → reasoning). */
export function extractChunksFromGeminiResponsePayload(parsed: unknown): ChatStreamChunk[] {
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }
  const rec = parsed as Record<string, unknown>;
  const candidates = rec.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }
  const first = candidates[0] as Record<string, unknown>;
  const content = first.content as Record<string, unknown> | undefined;
  if (!content) {
    return [];
  }
  const parts = content.parts;
  if (!Array.isArray(parts)) {
    return [];
  }
  const chunks: ChatStreamChunk[] = [];
  for (const p of parts) {
    if (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string') {
      const text = (p as { text: string }).text;
      if (text.length === 0) continue;
      const isThought = (p as { thought?: unknown }).thought === true;
      chunks.push({ type: isThought ? 'reasoning' : 'content', text });
    }
  }
  return chunks;
}

/** @deprecated Use extractChunksFromGeminiResponsePayload; kept for backward-compatible callers. */
export function extractTextFromGeminiResponsePayload(parsed: unknown): string {
  return extractChunksFromGeminiResponsePayload(parsed)
    .filter((c) => c.type === 'content')
    .map((c) => c.text)
    .join('');
}

/** Parses one SSE line (`data: ...`); yields tagged chunks or empty array to skip. */
export function parseGeminiSseDataLine(rawLine: string): ChatStreamChunk[] {
  const line = rawLine.trim();
  if (!line.startsWith('data:')) {
    return [];
  }
  const payload = line.slice(5).trim();
  if (payload === '' || payload === '[DONE]') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return [];
  }
  return extractChunksFromGeminiResponsePayload(parsed);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export class GeminiGenerativeLanguageRepository implements IChatCompletionsRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly defaultModel: string,
  ) {}

  private resolveModel(requested: string): string {
    const t = requested.trim();
    return t || this.defaultModel;
  }

  private streamUrl(model: string): string {
    const base = normalizeBaseUrl(this.baseUrl);
    const m = encodeURIComponent(model);
    const key = encodeURIComponent(this.apiKey);
    return `${base}/v1beta/models/${m}:streamGenerateContent?alt=sse&key=${key}`;
  }

  private generateUrl(model: string): string {
    const base = normalizeBaseUrl(this.baseUrl);
    const m = encodeURIComponent(model);
    const key = encodeURIComponent(this.apiKey);
    return `${base}/v1beta/models/${m}:generateContent?key=${key}`;
  }

  private buildRequestBody(
    messages: ChatMessage[],
    enableThinking?: boolean,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = buildGeminiGenerateBodyFromChatMessages(messages);
    if (enableThinking !== undefined) {
      body.generationConfig = {
        // includeThoughts: false,
        // thinkingLevel: 'HIGH',
        // thinkingConfig: { thinkingBudget: enableThinking ? 8192 : 0 },
      };
    }
    return body;
  }

  async completeChat(
    input: {
      model: string;
      messages: ChatMessage[];
      enableThinking?: boolean;
    } & ChatCompletionConnectionOverrides,
  ): Promise<ChatCompletionResult> {
    const model = this.resolveModel(input.model);
    const body = this.buildRequestBody(input.messages, input.enableThinking);
    const response = await fetch(this.generateUrl(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        detail
          ? `Gemini generateContent failed (${response.status}): ${detail}`
          : `Gemini generateContent failed (${response.status})`,
      );
    }
    const json = (await response.json()) as unknown;
    const chunks = extractChunksFromGeminiResponsePayload(json);
    const contentText = chunks
      .filter((c) => c.type === 'content')
      .map((c) => c.text)
      .join('');
    if (!contentText.trim()) {
      throw new Error('Gemini response missing assistant text content');
    }
    const reasoningText = chunks
      .filter((c) => c.type === 'reasoning')
      .map((c) => c.text)
      .join('');
    return {
      content: contentText,
      reasoningContent: reasoningText.length > 0 ? reasoningText : null,
    };
  }

  async *streamChat(input: ChatCompletionStreamInput): AsyncGenerator<ChatStreamChunk, void, undefined> {
    const model = this.resolveModel(input.model);
    const body = this.buildRequestBody(input.messages, input.enableThinking);
    const response = await fetch(this.streamUrl(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        detail
          ? `Gemini streamGenerateContent failed (${response.status}): ${detail}`
          : `Gemini streamGenerateContent failed (${response.status})`,
      );
    }

    const streamBody = response.body;
    if (!streamBody) {
      throw new Error('Gemini stream missing response body');
    }

    const reader = streamBody.getReader();
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
          const pieces = parseGeminiSseDataLine(rawLine);
          for (const piece of pieces) {
            sawAnyContent = true;
            yield piece;
          }
        }
      }
      const tailPieces = parseGeminiSseDataLine(buffer);
      for (const piece of tailPieces) {
        sawAnyContent = true;
        yield piece;
      }
    } finally {
      reader.releaseLock();
    }

    if (!sawAnyContent) {
      throw new Error('Gemini stream ended with no assistant content');
    }
  }
}

export function createGeminiGenerativeLanguageRepositoryFromEnv(): GeminiGenerativeLanguageRepository {
  const baseUrl =
    process.env.NEXT_PUBLIC_GEMINI_API_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com';
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim() || '';
  const defaultModel = process.env.NEXT_PUBLIC_GEMINI_MODEL?.trim() || '';
  return new GeminiGenerativeLanguageRepository(baseUrl, apiKey, defaultModel);
}
