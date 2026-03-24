import { describe, expect, it } from 'vitest';

import { extractJsonObjectString, stripMarkdownJsonFenceForDisplay } from './llmResponseText';

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
