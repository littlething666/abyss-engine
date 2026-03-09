import { describe, expect, it } from 'vitest';

import { interpolatePromptTemplate } from './promptTemplate';

describe('interpolatePromptTemplate', () => {
  it('supports both {{}} and {} placeholders', () => {
    expect(interpolatePromptTemplate('Hello {{name}}, your role is {role}.', {
      name: 'Ari',
      role: 'guide',
    })).toBe('Hello Ari, your role is guide.');
  });

  it('leaves missing placeholders empty', () => {
    expect(interpolatePromptTemplate('Missing {missing} value', { known: 'value' })).toBe('Missing  value');
  });
});

