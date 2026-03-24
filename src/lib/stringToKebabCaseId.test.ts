import { describe, expect, it } from 'vitest';

import { stringToKebabCaseId } from './stringToKebabCaseId';

const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('stringToKebabCaseId', () => {
  it('produces lowercase kebab-case from words', () => {
    expect(stringToKebabCaseId('Quantum Computing Intro')).toBe('quantum-computing-intro');
  });

  it('trims and collapses punctuation and spaces', () => {
    expect(stringToKebabCaseId('  Data   Science & ML!!!  ')).toBe('data-science-ml');
  });

  it('returns empty for whitespace-only or no ASCII alphanumerics', () => {
    expect(stringToKebabCaseId('   ')).toBe('');
    expect(stringToKebabCaseId('…')).toBe('');
  });

  it('matches kebab id pattern when non-empty', () => {
    const id = stringToKebabCaseId('My Subject 101');
    expect(id).toBe('my-subject-101');
    expect(kebab.test(id)).toBe(true);
  });
});
