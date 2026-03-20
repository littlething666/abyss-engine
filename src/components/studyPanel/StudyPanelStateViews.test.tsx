import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { StudyPanelStateViews } from './StudyPanelStateViews';

type StudyPanelStateViewsProps = ComponentProps<typeof StudyPanelStateViews>;

const baseProps: StudyPanelStateViewsProps = {
  levelUpMessage: null,
  activeTab: 'theory',
  hasTheory: true,
  isEmptyDeck: false,
  isLoadingCards: false,
  isCardsLoadError: false,
  hasActiveCard: true,
  isCompleted: false,
  resolvedTopicTheory: '# Overview\n- Prime numbers are key in number theory.\n**Math:** $2 + 2 = 4$',
  topicSystemPrompt: 'system prompt',
  targetAudience: 'General Learner',
  targetAudienceOptions: ['General Learner'],
  resolvedTopic: 'Mathematics',
  onClose: vi.fn(),
  onSetTargetAudience: vi.fn(),
  onSystemPromptSelect: vi.fn(),
  systemPromptRef: { current: null },
};

function setupSpeechSynthesisMock() {
  const mockSpeak = vi.fn();
  const mockCancel = vi.fn();
  const utteranceTexts: string[] = [];
  class MockSpeechSynthesisUtterance {
    public text: string;
    public onend: (() => void) | null = null;
    public onerror: (() => void) | null = null;

    constructor(value: string) {
      this.text = value;
      utteranceTexts.push(value);
    }
  }

  const mockWindow = window as unknown as Record<string, unknown>;
  const originalSpeechSynthesis = window.speechSynthesis;
  const originalSpeechSynthesisUtterance = window.SpeechSynthesisUtterance;

  mockWindow.speechSynthesis = {
    ...originalSpeechSynthesis,
    speak: (utterance: SpeechSynthesisUtterance) => {
      mockSpeak(utterance);
    },
    cancel: mockCancel,
  };
  mockWindow.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

  return { mockSpeak, mockCancel, utteranceTexts, originalSpeechSynthesis, originalSpeechSynthesisUtterance };
}

function renderStateViews(overrides: Partial<StudyPanelStateViewsProps> = {}) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (props: StudyPanelStateViewsProps) => {
    flushSync(() => {
      root.render(createElement(StudyPanelStateViews, props));
    });
  };
  const mergedProps = {
    ...baseProps,
    ...overrides,
  };
  render(mergedProps);

  return {
    container,
    root,
    rerender: (nextOverrides: Partial<StudyPanelStateViewsProps>) =>
      render({
        ...mergedProps,
        ...nextOverrides,
      }),
    unmount: () => root.unmount(),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  const mockWindow = window as unknown as Record<string, unknown>;
  if ('speechSynthesis' in mockWindow) {
    mockWindow.speechSynthesis = window.speechSynthesis;
  }
  if ('SpeechSynthesisUtterance' in mockWindow) {
    mockWindow.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
  }
  vi.restoreAllMocks();
});

describe('StudyPanelStateViews theory TTS', () => {
  it('renders a theory read-aloud toggle icon button', () => {
    const { container, unmount } = renderStateViews();
    const ttsButton = container.querySelector('[data-testid="study-panel-theory-tts"]') as HTMLButtonElement;

    expect(ttsButton).not.toBeNull();
    expect(ttsButton.getAttribute('aria-label')).toBe('Read theory aloud');
    unmount();
  });

  it('starts speech on first tap and cancels on second tap', () => {
    const { mockSpeak, mockCancel, utteranceTexts } = setupSpeechSynthesisMock();
    const { container, unmount } = renderStateViews();
    const ttsButton = container.querySelector('[data-testid="study-panel-theory-tts"]') as HTMLButtonElement;

    ttsButton.click();
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledTimes(0);
    expect(utteranceTexts[0]).not.toContain('$');
    expect(utteranceTexts[0]).toContain('Prime numbers are key in number theory.');

    ttsButton.click();
    expect(mockCancel).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('cancels speaking when leaving the Theory tab', () => {
    const { mockSpeak, mockCancel } = setupSpeechSynthesisMock();
    const { container, rerender, unmount } = renderStateViews();
    const ttsButton = container.querySelector('[data-testid="study-panel-theory-tts"]') as HTMLButtonElement;

    ttsButton.click();
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    rerender({
      activeTab: 'study',
    });
    expect(mockCancel).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('cancels speaking when theory content changes', () => {
    const { mockCancel } = setupSpeechSynthesisMock();
    const { container, rerender, unmount } = renderStateViews();
    const ttsButton = container.querySelector('[data-testid="study-panel-theory-tts"]') as HTMLButtonElement;

    ttsButton.click();
    expect(mockCancel).toHaveBeenCalledTimes(0);

    rerender({
      activeTab: 'theory',
      resolvedTopicTheory: '# New heading\nMore content here.',
    });
    expect(mockCancel).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('stops speech when component unmounts', () => {
    const { mockCancel } = setupSpeechSynthesisMock();
    const { container, unmount } = renderStateViews();
    const ttsButton = container.querySelector('[data-testid="study-panel-theory-tts"]') as HTMLButtonElement;

    ttsButton.click();
    unmount();
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });
});
