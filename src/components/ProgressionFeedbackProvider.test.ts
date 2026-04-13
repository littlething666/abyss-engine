import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { ProgressionFeedbackProvider } from './ProgressionFeedbackProvider';

const mocks = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockPlayPositiveSound: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.mockToastSuccess,
  },
}));

vi.mock('@/utils/sound', () => ({
  playPositiveSound: () => mocks.mockPlayPositiveSound(),
}));

function renderFeedbackProvider() {
  const container = document.createElement('div');
  const root = createRoot(container);
  flushSync(() => {
    root.render(createElement(ProgressionFeedbackProvider));
  });

  return {
    root,
    unmount: () => root.unmount(),
  };
}

afterEach(() => {
  mocks.mockToastSuccess.mockReset();
  mocks.mockPlayPositiveSound.mockReset();
  vi.restoreAllMocks();
});

describe('ProgressionFeedbackProvider', () => {
  it('shows a positive toast and plays sound on card:reviewed', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const { unmount } = renderFeedbackProvider();

    window.dispatchEvent(
      new CustomEvent('abyss-card:reviewed', {
        detail: {
          cardId: 'card-1',
          rating: 4,
          topicId: 'topic-a',
          sessionId: 's1',
          timeTakenMs: 0,
          buffedReward: 25,
          buffMultiplier: 1,
          difficulty: 1,
          isCorrect: true,
        },
      }),
    );

    expect(mocks.mockToastSuccess).toHaveBeenCalledTimes(1);
    const [toastMessage, options] = mocks.mockToastSuccess.mock.calls[0];
    expect(toastMessage).toContain('✨ Excellent!');
    expect(toastMessage).toContain('+25 XP');
    expect((options as { duration?: number }).duration).toBe(1500);
    expect(mocks.mockPlayPositiveSound).toHaveBeenCalledTimes(1);
    randomSpy.mockRestore();
    unmount();
  });

  it('shows a crystal level-up toast with singular copy', () => {
    const { unmount } = renderFeedbackProvider();

    window.dispatchEvent(
      new CustomEvent('abyss-crystal:leveled', {
        detail: {
          topicId: 'topic-a',
          sessionId: 'session-1',
          from: 0,
          to: 1,
          levelsGained: 1,
          isStudyPanelOpen: false,
        },
      }),
    );

    expect(mocks.mockToastSuccess).toHaveBeenCalledTimes(1);
    const [toastMessage, options] = mocks.mockToastSuccess.mock.calls[0];
    expect(String(toastMessage)).toBe('Crystal reached level 1!');
    expect((options as { duration?: number }).duration).toBe(2200);
    unmount();
  });

  it('shows a crystal level-up toast with plural copy when multiple levels gained', () => {
    const { unmount } = renderFeedbackProvider();

    window.dispatchEvent(
      new CustomEvent('abyss-crystal:leveled', {
        detail: {
          topicId: 'topic-a',
          sessionId: 'session-1',
          from: 0,
          to: 3,
          levelsGained: 3,
          isStudyPanelOpen: false,
        },
      }),
    );

    expect(mocks.mockToastSuccess).toHaveBeenCalledTimes(1);
    const [toastMessage] = mocks.mockToastSuccess.mock.calls[0];
    expect(String(toastMessage)).toBe('Crystal leveled up 3 times! Now level 3.');
    unmount();
  });

  it('shows a history message on undo and redo events', () => {
    const { unmount } = renderFeedbackProvider();

    window.dispatchEvent(
      new CustomEvent('abyss-study-panel:history', {
        detail: {
          action: 'undo',
          topicId: 'topic-a',
          sessionId: 's1',
          undoCount: 2,
          redoCount: 1,
        },
      }),
    );
    expect(mocks.mockToastSuccess).toHaveBeenCalledTimes(1);
    expect(String(mocks.mockToastSuccess.mock.calls[0]?.[0] ?? '')).toContain('Undo complete.');
    expect(String(mocks.mockToastSuccess.mock.calls[0]?.[0] ?? '')).toContain('2 undo');
    unmount();
  });

  it('renders a completion toast for session completion events', () => {
    const { unmount } = renderFeedbackProvider();

    window.dispatchEvent(
      new CustomEvent('abyss-session:completed', {
        detail: {
          topicId: 'topic-a',
          sessionId: 's1',
          correctRate: 0.5,
          sessionDurationMs: 1000,
          totalAttempts: 3,
        },
      }),
    );

    expect(mocks.mockToastSuccess).toHaveBeenCalledTimes(1);
    expect(String(mocks.mockToastSuccess.mock.calls[0]?.[0] ?? '')).toContain('Session complete');
    unmount();
  });
});
