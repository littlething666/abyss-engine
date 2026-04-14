import { describe, expect, it } from 'vitest';

import { buildDiagramSystemPrompt, extractExamplesSection, interpolatePromptTemplate } from './promptTemplate';

describe('interpolatePromptTemplate', () => {
  it('interpolates {{key}} and preserves literal single-brace JSON', () => {
    expect(
      interpolatePromptTemplate('Hello {{name}}, your role is {{role}}. Literal {a:1}', {
        name: 'Ari',
        role: 'guide',
      }),
    ).toBe('Hello Ari, your role is guide. Literal {a:1}');
  });

  it('replaces missing {{key}} with empty string', () => {
    expect(interpolatePromptTemplate('Hello {{unknown}}', { known: 'value' })).toBe('Hello ');
  });
});

describe('extractExamplesSection', () => {
  it('extracts content from 6. Examples to the next divider', () => {
    const source = `
1. Question
Which of the following properties are characteristics of the standard normal distribution?
------------------------------
2. Intuition
Think of the standard normal distribution as the "Universal Yardstick."
------------------------------
6. Examples

   1. The 68-95-99.7 Rule: In a standard normal curve, 68% of data falls between z = -1 and z = 1.
   2. Z-Score Normalization
   3. Percentile Mapping

------------------------------
7. Formulas & Methods

* Standardization Formula: ...
`;
    const examples = extractExamplesSection(source);
    expect(examples).toContain('The 68-95-99.7 Rule');
    expect(examples).toContain('Percentile Mapping');
  });

  it('returns an empty string when Examples section is missing', () => {
    const source = `
1. Question
Without examples section.
------------------------------
`;
    expect(extractExamplesSection(source)).toBe('');
  });
});

describe('buildDiagramSystemPrompt', () => {
  it('interpolates topic and extracted examples', () => {
    const source = `
6. Examples
1. A
2. B

------------------------------
`;
    const result = buildDiagramSystemPrompt('Standard Normal Distribution', source);
    expect(result).toContain('<topic>Standard Normal Distribution</topic>');
    expect(result).toContain('<examples>1. A');
    expect(result).toContain('2. B');
  });
});

