import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import MathMarkdownRenderer from './MathMarkdownRenderer';

function render(source: string) {
  return renderToStaticMarkup(<MathMarkdownRenderer source={source} />);
}

describe('MathMarkdownRenderer', () => {
  it('renders inline LaTeX expressions', () => {
    const html = render('Euler formula: $e^{i\\pi} + 1 = 0$');

    expect(html).toContain('katex');
  });

  it('renders block LaTeX expressions', () => {
    const html = render('$$\\frac{1}{2} + \\frac{1}{2} = 1$$');

    expect(html).toContain('katex-display');
  });

  it('renders markdown content with headers and lists', () => {
    const html = render('## Theory\\n\\n- vectors\\n- matrices');

    expect(html).toContain('<h2');
    expect(html).toContain('<li>vectors</li>');
    expect(html).toContain('<li>matrices</li>');
  });

  it('falls back to plain text when LaTeX parsing fails', () => {
    const source = 'Broken formula: $\\\\frac{1}{2$';
    const html = render(source);

    expect(html).toContain('Broken formula:');
    expect(html).not.toContain('katex');
  });
});
