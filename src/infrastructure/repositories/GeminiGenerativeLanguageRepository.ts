import type {
  ChatCompletionStreamInput,
  ChatContentPart,
  ChatMessage,
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

export function extractTextFromGeminiResponsePayload(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') {
    return '';
  }
  const rec = parsed as Record<string, unknown>;
  const candidates = rec.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return '';
  }
  const first = candidates[0] as Record<string, unknown>;
  const content = first.content as Record<string, unknown> | undefined;
  if (!content) {
    return '';
  }
  const parts = content.parts;
  if (!Array.isArray(parts)) {
    return '';
  }
  let acc = '';
  for (const p of parts) {
    if (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string') {
      acc += (p as { text: string }).text;
    }
  }
  return acc;
}

/** Parses one SSE line (`data: ...`); yields incremental text or null to skip. */
export function parseGeminiSseDataLine(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line.startsWith('data:')) {
    return null;
  }
  const payload = line.slice(5).trim();
  if (payload === '' || payload === '[DONE]') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
  const text = extractTextFromGeminiResponsePayload(parsed);
  return text.length > 0 ? text : null;
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

  async completeChat(input: { model: string; messages: ChatMessage[] }): Promise<string> {
    const model = this.resolveModel(input.model);
    const body = buildGeminiGenerateBodyFromChatMessages(input.messages);
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
    const text = extractTextFromGeminiResponsePayload(json);
    if (!text.trim()) {
      throw new Error('Gemini response missing assistant text content');
    }
    return text;
  }

  async *streamChat(input: ChatCompletionStreamInput): AsyncGenerator<string, void, undefined> {
    const model = this.resolveModel(input.model);
    const body = buildGeminiGenerateBodyFromChatMessages(input.messages);
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
          const piece = parseGeminiSseDataLine(rawLine);
          if (piece !== null) {
            sawAnyContent = true;
            yield piece;
          }
        }
      }
      const tailPiece = parseGeminiSseDataLine(buffer);
      if (tailPiece !== null) {
        sawAnyContent = true;
        yield tailPiece;
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
