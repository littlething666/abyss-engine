import { describe, expect, it } from 'vitest';

import { interpolatePromptTemplate } from './interpolatePromptTemplate';

describe('interpolatePromptTemplate', () => {
  it('replaces {{key}} placeholders only', () => {
    expect(
      interpolatePromptTemplate('Hello {{name}}, use JSON like { "cards": [] }.', {
        name: 'Ari',
      }),
    ).toBe('Hello Ari, use JSON like { "cards": [] }.');
  });

  it('replaces missing {{key}} with empty string', () => {
    expect(interpolatePromptTemplate('x{{missing}}y', { known: 'v' })).toBe('xy');
  });
});
