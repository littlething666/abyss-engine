import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { StudyPanelStateViews } from './StudyPanelStateViews';

type Props = ComponentProps<typeof StudyPanelStateViews>;

const baseProps: Props = {
  activeTab: 'theory',
  hasTheory: true,
  isEmptyDeck: false,
  isLoadingCards: false,
  isCardsLoadError: false,
  hasActiveCard: true,
  isCompleted: false,
  resolvedTopicTheory: '# Overview\n- Prime numbers are key in number theory.',
  topicSystemPrompt: 'system prompt',
  resolvedTopic: 'Mathematics',
  onClose: vi.fn(),
  onSystemPromptSelect: vi.fn(),
  systemPromptRef: { current: null },
};

function render(overrides: Partial<Props> = {}) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const merged = { ...baseProps, ...overrides };
  flushSync(() => { root.render(createElement(StudyPanelStateViews, merged)); });
  return {
    container,
    rerender: (next: Partial<Props>) => flushSync(() => root.render(createElement(StudyPanelStateViews, { ...merged, ...next }))),
    unmount: () => root.unmount(),
  };
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('StudyPanelStateViews', () => {
  it('renders the theory content when tab is theory', () => {
    const { container, unmount } = render();
    expect(container.querySelector('[data-testid="study-panel-theory"]')).not.toBeNull();
    unmount();
  });

  it('renders the empty-deck message when isEmptyDeck', () => {
    const { container, unmount } = render({ isEmptyDeck: true, hasActiveCard: false });
    expect(container.querySelector('[data-testid="study-panel-empty-state"]')).not.toBeNull();
    unmount();
  });

  it('renders a theory read-aloud button', () => {
    const { container, unmount } = render();
    const btn = container.querySelector('[data-testid="study-panel-theory-tts"]');
    expect(btn).not.toBeNull();
    unmount();
  });
});
