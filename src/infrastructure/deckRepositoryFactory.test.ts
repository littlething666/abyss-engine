import { describe, expect, it } from 'vitest';
import { shouldUseBackendDeckRepository } from './deckRepositoryFactory';

describe('deckRepositoryFactory', () => {
  it('uses backend deck reads whenever the durable Worker URL is configured', () => {
    expect(shouldUseBackendDeckRepository({})).toBe(false);
    expect(shouldUseBackendDeckRepository({ NEXT_PUBLIC_DURABLE_GENERATION_URL: '   ' })).toBe(false);
    expect(shouldUseBackendDeckRepository({ NEXT_PUBLIC_DURABLE_GENERATION_URL: 'https://worker.test' })).toBe(true);
  });
});
