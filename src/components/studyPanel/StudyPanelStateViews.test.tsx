import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { StudyPanelStateViews } from './StudyPanelStateViews';

type Props = ComponentProps<typeof StudyPanelStateViews>;

const baseProps: Props = {
  isEmptyDeck: false,
  isLoadingCards: false,
  isCardsLoadError: false,
  hasActiveCard: true,
  isCompleted: false,
  onClose: vi.fn(),
};

function render(overrides: Partial<Props> = {}) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const merged = { ...baseProps, ...overrides };
  flushSync(() => {
    root.render(createElement(StudyPanelStateViews, merged));
  });
  return {
    container,
    rerender: (next: Partial<Props>) =>
      flushSync(() => root.render(createElement(StudyPanelStateViews, { ...merged, ...next }))),
    unmount: () => root.unmount(),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('StudyPanelStateViews', () => {
  it('renders the empty-deck message when isEmptyDeck', () => {
    const { container, unmount } = render({ isEmptyDeck: true, hasActiveCard: false });
    expect(container.querySelector('[data-testid="study-panel-empty-state"]')).not.toBeNull();
    unmount();
  });

  it('renders the loading message when isLoadingCards', () => {
    const { container, unmount } = render({ isLoadingCards: true, hasActiveCard: false });
    expect(container.querySelector('[data-testid="study-panel-loading"]')).not.toBeNull();
    unmount();
  });

  it('renders the error message when isCardsLoadError', () => {
    const { container, unmount } = render({ isCardsLoadError: true, hasActiveCard: false });
    expect(container.querySelector('[data-testid="study-panel-error"]')).not.toBeNull();
    unmount();
  });

  it('renders the no-card return-to-grid CTA when nothing else is shown', () => {
    const onClose = vi.fn();
    const { container, unmount } = render({ hasActiveCard: false, onClose });
    const noCardCopy = container.querySelector('[data-testid="study-panel-no-card"]');
    expect(noCardCopy).not.toBeNull();
    const cta = container.querySelector('[data-testid="study-panel-return-to-grid"]') as HTMLButtonElement;
    expect(cta).not.toBeNull();
    cta.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('renders the all-done CTA when isCompleted', () => {
    const onClose = vi.fn();
    const { container, unmount } = render({ isCompleted: true, hasActiveCard: false, onClose });
    const cta = container.querySelector('[data-testid="study-panel-all-done-cta"]') as HTMLButtonElement;
    expect(cta).not.toBeNull();
    cta.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });
});
