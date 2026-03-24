import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ResponsiveLlmInferenceSurface } from './ResponsiveLlmInferenceSurface';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  title: 'Test title',
  description: { kind: 'srOnly' as const, text: 'Screen reader description' },
  onDismissOutside: vi.fn(),
  desktopContentClassName: 'sm:max-w-md',
  sheetMaxHeightClassName: 'data-[side=bottom]:max-h-[70vh]',
  sheetBodyScrollClassName: 'max-h-[min(40vh,32rem)]',
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ResponsiveLlmInferenceSurface', () => {
  it('renders bottom sheet with title, body, and Close when not desktop', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
      root.render(
        createElement(ResponsiveLlmInferenceSurface, {
          ...baseProps,
          isDesktop: false,
          children: createElement('div', { 'data-testid': 'inference-surface-body' }, 'Stream body'),
        }),
      );
    });

    expect(document.body.textContent).toContain('Test title');
    expect(document.body.textContent).toContain('Stream body');
    const body = document.body.querySelector('[data-testid="inference-surface-body"]');
    expect(body).not.toBeNull();
    const closeBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Close'),
    );
    expect(closeBtn).not.toBeUndefined();

    root.unmount();
    container.remove();
  });

  it('renders dialog with title and body when desktop', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
      root.render(
        createElement(ResponsiveLlmInferenceSurface, {
          ...baseProps,
          isDesktop: true,
          children: createElement('div', { 'data-testid': 'inference-surface-body' }, 'Stream body'),
        }),
      );
    });

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Test title');
    expect(document.body.querySelector('[data-testid="inference-surface-body"]')).not.toBeNull();

    root.unmount();
    container.remove();
  });

  it('uses markdown description kind without throwing', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
      root.render(
        createElement(ResponsiveLlmInferenceSurface, {
          ...baseProps,
          isDesktop: true,
          description: { kind: 'markdown', source: '$x^2$' },
          children: createElement('p', null, 'Content'),
        }),
      );
    });

    expect(document.body.textContent).toContain('Content');

    root.unmount();
    container.remove();
  });
});
