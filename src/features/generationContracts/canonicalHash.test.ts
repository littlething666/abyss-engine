import { describe, expect, it } from 'vitest';

import { canonicalJson, contentHash, generationHash, inputHash } from './canonicalHash';

describe('canonicalJson', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('omits properties whose value is undefined', () => {
    expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it('top-level undefined and null both serialize to "null"', () => {
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson(null)).toBe('null');
  });

  it('produces stable output across reordered input', () => {
    const a = canonicalJson({ z: { y: 1, x: 2 }, a: [3, 4] });
    const b = canonicalJson({ a: [3, 4], z: { x: 2, y: 1 } });
    expect(a).toBe(b);
  });

  it('rejects NaN', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/non-finite/);
  });

  it('rejects Infinity', () => {
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    expect(() => canonicalJson({ a: Number.NEGATIVE_INFINITY })).toThrow(/non-finite/);
  });

  it('rejects bigint', () => {
    expect(() => canonicalJson({ a: 1n })).toThrow(/bigint/);
  });

  it('escapes string keys and values via JSON.stringify rules', () => {
    expect(canonicalJson({ '"q"': 'a"b' })).toBe('{"\\"q\\"":"a\\"b"}');
  });
});

describe('generationHash', () => {
  it('emits an `inp_` tag for input role and a `cnt_` tag for content role', async () => {
    const inp = await generationHash('input', { x: 1 });
    const cnt = await generationHash('content', { x: 1 });
    expect(inp.startsWith('inp_')).toBe(true);
    expect(cnt.startsWith('cnt_')).toBe(true);
  });

  it('emits 64 lowercase hex chars after the role prefix', async () => {
    const tagged = await generationHash('input', { hello: 'world' });
    expect(tagged).toMatch(/^inp_[0-9a-f]{64}$/);
  });

  it('is deterministic for equivalent inputs (key order does not matter)', async () => {
    const a = await generationHash('input', { z: 1, a: { y: 2, x: [1, 2] } });
    const b = await generationHash('input', { a: { x: [1, 2], y: 2 }, z: 1 });
    expect(a).toBe(b);
  });

  it('changes when a property value changes', async () => {
    const a = await generationHash('input', { a: 1 });
    const b = await generationHash('input', { a: 2 });
    expect(a).not.toBe(b);
  });

  it('input vs content hash of the same value differ by prefix only', async () => {
    const value = { a: 1, b: [2, 3] };
    const inp = await inputHash(value);
    const cnt = await contentHash(value);
    expect(inp.slice(4)).toBe(cnt.slice(4));
    expect(inp.slice(0, 4)).toBe('inp_');
    expect(cnt.slice(0, 4)).toBe('cnt_');
  });
});
