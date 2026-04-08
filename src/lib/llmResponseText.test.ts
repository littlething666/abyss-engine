import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractJsonObjectString,
  logJsonParseError,
  stripMarkdownJsonFenceForDisplay,
} from './llmResponseText';

describe('stripMarkdownJsonFenceForDisplay', () => {
  it('strips ```json opener, body, and closer', () => {
    expect(stripMarkdownJsonFenceForDisplay('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips generic ``` fence', () => {
    expect(stripMarkdownJsonFenceForDisplay('```\n{"b":2}\n```')).toBe('{"b":2}');
  });

  it('returns empty while opening fence is incomplete', () => {
    expect(stripMarkdownJsonFenceForDisplay('```jso')).toBe('');
  });

  it('leaves unfenced JSON unchanged', () => {
    expect(stripMarkdownJsonFenceForDisplay('{"c":3}')).toBe('{"c":3}');
  });

  it('strips trailing fence and following newline', () => {
    expect(stripMarkdownJsonFenceForDisplay('```json\n{"d":4}\n```\n')).toBe('{"d":4}');
  });
});

describe('extractJsonObjectString', () => {
  it('returns inner JSON from fenced block', () => {
    const raw = 'Here:\n```json\n{"a":1}\n```';
    expect(extractJsonObjectString(raw)).toBe('{"a":1}');
  });

  it('returns object slice from plain text', () => {
    const raw = 'prefix {"x":"y"} suffix';
    expect(extractJsonObjectString(raw)).toBe('{"x":"y"}');
  });

  it('returns null when no object', () => {
    expect(extractJsonObjectString('no braces')).toBeNull();
  });
});

describe('logJsonParseError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs context, message, length, and head to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new SyntaxError('Unexpected token');
    const long = 'x'.repeat(5000);
    logJsonParseError('test-context', err, long);
    expect(spy).toHaveBeenCalledTimes(1);
    const [first, meta] = spy.mock.calls[0]!;
    expect(first).toBe('[test-context] JSON.parse failed: Unexpected token');
    expect(meta).toEqual({ length: 5000, head: 'x'.repeat(4000) });
  });
});
