import { describe, expect, it } from 'vitest';
import { shouldUseBackendDeckRepository } from './deckRepositoryFactory';

describe('deckRepositoryFactory', () => {
  it('uses backend deck reads only when durable runs and worker URL are both configured', () => {
    expect(shouldUseBackendDeckRepository({})).toBe(false);
    expect(shouldUseBackendDeckRepository({ NEXT_PUBLIC_DURABLE_RUNS: 'true' })).toBe(false);
    expect(shouldUseBackendDeckRepository({ NEXT_PUBLIC_DURABLE_GENERATION_URL: 'https://worker.test' })).toBe(false);
    expect(
      shouldUseBackendDeckRepository({
        NEXT_PUBLIC_DURABLE_RUNS: 'true',
        NEXT_PUBLIC_DURABLE_GENERATION_URL: '   ',
      }),
    ).toBe(false);
    expect(
      shouldUseBackendDeckRepository({
        NEXT_PUBLIC_DURABLE_RUNS: 'true',
        NEXT_PUBLIC_DURABLE_GENERATION_URL: 'https://worker.test',
      }),
    ).toBe(true);
  });
});
