import type {
  StudyLlmChunk,
  StudyLlmClient,
  StudyLlmIntent,
} from '@/features/studyPanel/studyLlmClient';

type StudyLlmSseEvent = StudyLlmChunk | { type: 'done' };

type BackendStudyLlmRepositoryOptions = {
  baseUrl: string;
  deviceId: string;
  fetchImpl?: typeof fetch;
};

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function isStudyLlmSseEvent(value: unknown): value is StudyLlmSseEvent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.type === 'done') return true;
  return (record.type === 'content' || record.type === 'reasoning') && typeof record.text === 'string';
}

function parseSseDataLine(rawLine: string): StudyLlmSseEvent[] {
  const line = rawLine.trim();
  if (!line.startsWith('data:')) return [];
  const payload = line.slice(5).trim();
  if (!payload) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    throw new Error(`Study LLM stream returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!isStudyLlmSseEvent(parsed)) {
    throw new Error('Study LLM stream returned an unknown event shape');
  }
  return [parsed];
}

export class BackendStudyLlmRepository implements StudyLlmClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: BackendStudyLlmRepositoryOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async *stream(intent: StudyLlmIntent, signal?: AbortSignal): AsyncIterable<StudyLlmChunk> {
    const response = await this.fetchImpl(joinUrl(this.options.baseUrl, '/v1/study-llm/stream'), {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Abyss-Device': this.options.deviceId,
      },
      body: JSON.stringify(intent),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        detail
          ? `Study LLM stream failed (${response.status}): ${detail}`
          : `Study LLM stream failed (${response.status})`,
      );
    }

    if (!response.body) {
      throw new Error('Study LLM stream missing response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          for (const event of parseSseDataLine(rawLine)) {
            if (event.type === 'done') return;
            yield event;
          }
        }
      }

      buffer += decoder.decode();
      for (const event of parseSseDataLine(buffer)) {
        if (event.type === 'done') return;
        yield event;
      }
    } finally {
      reader.releaseLock();
    }
  }
}
