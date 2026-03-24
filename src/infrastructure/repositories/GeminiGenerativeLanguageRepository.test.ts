import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../../types/llm';
import {
  buildGeminiGenerateBodyFromChatMessages,
  extractTextFromGeminiResponsePayload,
  GeminiGenerativeLanguageRepository,
  parseDataUrlToInlineImage,
  parseGeminiSseDataLine,
} from './GeminiGenerativeLanguageRepository';

describe('parseDataUrlToInlineImage', () => {
  it('parses data URL mime and base64 payload', () => {
    expect(parseDataUrlToInlineImage('data:image/png;base64,QUJD')).toEqual({
      mimeType: 'image/png',
      data: 'QUJD',
    });
  });

  it('rejects non-data URLs', () => {
    expect(() => parseDataUrlToInlineImage('https://example.com/x.png')).toThrow(
      /only supports data URL/,
    );
  });
});

describe('buildGeminiGenerateBodyFromChatMessages', () => {
  it('maps system to systemInstruction and alternates user/model', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'Bye' },
    ];
    expect(buildGeminiGenerateBodyFromChatMessages(messages)).toEqual({
      systemInstruction: { parts: [{ text: 'You are helpful.' }] },
      contents: [
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello' }] },
        { role: 'user', parts: [{ text: 'Bye' }] },
      ],
    });
  });

  it('merges consecutive user turns into one content block', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
    ];
    expect(buildGeminiGenerateBodyFromChatMessages(messages)).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'a' }, { text: 'b' }] }],
    });
  });

  it('maps multimodal user parts to inlineData', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
        ],
      },
    ];
    expect(buildGeminiGenerateBodyFromChatMessages(messages)).toEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Describe' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }],
        },
      ],
    });
  });
});

describe('extractTextFromGeminiResponsePayload', () => {
  it('concatenates text parts from first candidate', () => {
    const text = extractTextFromGeminiResponsePayload({
      candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }],
    });
    expect(text).toBe('ab');
  });

  it('returns empty string when no candidates', () => {
    expect(extractTextFromGeminiResponsePayload({ candidates: [] })).toBe('');
  });
});

describe('parseGeminiSseDataLine', () => {
  it('extracts text from data JSON line', () => {
    const line =
      'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}],"role":"model"}}]}';
    expect(parseGeminiSseDataLine(line)).toBe('Hi');
  });

  it('returns null for done and non-data lines', () => {
    expect(parseGeminiSseDataLine('data: [DONE]')).toBeNull();
    expect(parseGeminiSseDataLine('')).toBeNull();
    expect(parseGeminiSseDataLine('event: ping')).toBeNull();
  });

  it('returns null when JSON has no text deltas', () => {
    expect(parseGeminiSseDataLine('data: {"candidates":[{}]}')).toBeNull();
  });
});

describe('GeminiGenerativeLanguageRepository.completeChat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns assistant text from generateContent JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '  ok  ' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const repo = new GeminiGenerativeLanguageRepository('https://example.com', 'k', 'default-model');
    const out = await repo.completeChat({
      model: '',
      messages: [{ role: 'user', content: 'x' }],
    });

    expect(out).toBe('  ok  ');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1beta/models/default-model:generateContent?key=k',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'x' }] }],
        }),
      }),
    );
  });
});
