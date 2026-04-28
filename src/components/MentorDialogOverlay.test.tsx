import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';

import { MentorDialogOverlay } from './MentorDialogOverlay';
import {
  DEFAULT_EPHEMERAL_STATE,
  DEFAULT_PERSISTED_STATE,
  useMentorStore,
} from '@/features/mentor';
import { uiStore } from '@/store/uiStore';

vi.mock('@/features/mentor/useMentorSpeech', () => ({
  useMentorSpeech: () => ({
    speak: vi.fn(),
    cancel: vi.fn(),
    enabled: false,
  }),
}));

function renderOverlay(): { root: Root; container: HTMLDivElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(createElement(MentorDialogOverlay));
  });
  return { root, container };
}

beforeEach(() => {
  useMentorStore.setState({
    ...DEFAULT_PERSISTED_STATE,
    ...DEFAULT_EPHEMERAL_STATE,
  });
  uiStore.setState({
    isDiscoveryModalOpen: false,
    isStudyPanelOpen: false,
    isRitualModalOpen: false,
    isStudyTimelineOpen: false,
    isCrystalTrialOpen: false,
    isGenerationProgressOpen: false,
    isGlobalSettingsOpen: false,
    selectedTopic: null,
    isCurrentCardFlipped: false,
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MentorDialogOverlay', () => {
  it('does not auto-open queued dialogs while the study panel is open, then opens after study closes', async () => {
    useMentorStore.getState().enqueue({
      id: 'queued-start',
      trigger: 'subject.generation.started',
      priority: 72,
      enqueuedAt: 1,
      messages: [{ id: 'm1', text: 'Generating Calculus.', mood: 'hint' }],
      source: 'canned',
      voiceId: 'witty-sarcastic',
    });
    uiStore.setState({ isStudyPanelOpen: true });

    const { root } = renderOverlay();

    expect(useMentorStore.getState().currentDialog).toBeNull();
    expect(document.body.querySelector('[data-testid="mentor-dialog-overlay"]')).toBeNull();

    await act(async () => {
      uiStore.setState({ isStudyPanelOpen: false });
      await Promise.resolve();
    });

    expect(useMentorStore.getState().currentDialog?.id).toBe('queued-start');
    expect(document.body.querySelector('[data-testid="mentor-dialog-overlay"]')).not.toBeNull();

    root.unmount();
  });

  it('toggles mentor narration when clicking the avatar', () => {
    useMentorStore.setState({
      ...DEFAULT_PERSISTED_STATE,
      ...DEFAULT_EPHEMERAL_STATE,
      currentDialog: {
        id: 'active-mentor',
        trigger: 'mentor.bubble.click',
        priority: 80,
        enqueuedAt: 1,
        messages: [
          {
            id: 'm1',
            text: 'Welcome back',
            mood: 'neutral',
          },
        ],
        source: 'canned',
        voiceId: 'witty-sarcastic',
      },
      narrationEnabled: false,
    });

    const { root, container } = renderOverlay();
    const avatar = container.querySelector('[data-testid="mentor-dialog-avatar"]');
    const isNarrationEnabled = () => useMentorStore.getState().narrationEnabled;

    expect(avatar).not.toBeNull();
    expect(isNarrationEnabled()).toBe(false);

    act(() => {
      avatar?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(isNarrationEnabled()).toBe(true);

    act(() => {
      avatar?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(isNarrationEnabled()).toBe(false);

    root.unmount();
  });
});
