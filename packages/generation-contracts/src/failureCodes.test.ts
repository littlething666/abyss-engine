import { describe, expect, it } from 'vitest';

import {
  GENERATION_FAILURE_CODES,
  generationFailureCategory,
  isGenerationFailureCode,
} from './failureCodes';

describe('GENERATION_FAILURE_CODES', () => {
  it('has no duplicate entries', () => {
    expect(new Set(GENERATION_FAILURE_CODES).size).toBe(GENERATION_FAILURE_CODES.length);
  });

  it('every code matches the canonical `<category>:<detail>` shape', () => {
    for (const code of GENERATION_FAILURE_CODES) {
      expect(code).toMatch(/^[a-z]+:[a-z0-9-]+$/);
    }
  });
});

describe('isGenerationFailureCode', () => {
  it('accepts every published code', () => {
    for (const code of GENERATION_FAILURE_CODES) {
      expect(isGenerationFailureCode(code)).toBe(true);
    }
  });

  it('rejects unknown strings, non-strings, and lookalikes', () => {
    expect(isGenerationFailureCode('not-a-code')).toBe(false);
    expect(isGenerationFailureCode('parse:zod')).toBe(false);
    expect(isGenerationFailureCode('CANCEL:USER')).toBe(false);
    expect(isGenerationFailureCode(undefined)).toBe(false);
    expect(isGenerationFailureCode(123)).toBe(false);
  });
});

describe('generationFailureCategory', () => {
  it('maps each code to its declared category prefix', () => {
    expect(generationFailureCategory('parse:zod-shape')).toBe('parse');
    expect(generationFailureCategory('validation:semantic-grounding')).toBe('validation');
    expect(generationFailureCategory('llm:rate-limit')).toBe('llm');
    expect(generationFailureCategory('budget:over-cap')).toBe('budget');
    expect(generationFailureCategory('cancel:superseded')).toBe('cancel');
    expect(generationFailureCategory('config:missing-structured-output')).toBe('config');
    expect(generationFailureCategory('precondition:missing-topic')).toBe('precondition');
  });
});
