import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { FirstCurriculumEmptyState } from './FirstCurriculumEmptyState';

describe('FirstCurriculumEmptyState', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders a single primary CTA for generating the first curriculum', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onGenerate = vi.fn();

    flushSync(() => {
      root.render(createElement(FirstCurriculumEmptyState, { onGenerate }));
    });

    expect(document.body.querySelector('[data-testid="first-curriculum-empty-state"]')).not.toBeNull();
    const buttons = Array.from(document.body.querySelectorAll('button'));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toContain('Generate your first curriculum');

    buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onGenerate).toHaveBeenCalledTimes(1);

    root.unmount();
    container.remove();
  });
});
