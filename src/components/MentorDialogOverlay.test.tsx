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
import {
  requestAmbientAdvance,
  useMentorOverlayController,
} from '@/features/mentor/overlayController';
import { uiStore } from '@/store/uiStore';

vi.mock('@/features/mentor/useMentorSpeech', () => ({
  useMentorSpeech: () => ({
    speak: vi.fn(),
    cancel: vi.fn(),
    enabled: false,
  }),
}));

// Force reduced-motion semantics in JSDOM so the typewriter completes
// synchronously and the controller publishes isFullyRevealed=true on the
// first effect tick. Prevents the new tests from racing the rAF loop.
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
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

function enqueueFixturePlan(id = 'queued-start'): void {
  useMentorStore.getState().enqueue({
    id,
    trigger: 'subject:generation-started',
    payload: {},
    priority: 72,
    enqueuedAt: 1,
    messages: [{ id: 'm1', text: 'Generating Calculus.', mood: 'hint' }],
    source: 'canned',
    voiceId: 'witty-sarcastic',
  });
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
  // The overlay controller is module-scoped — reset between tests so
  // the previous test's published step / registered handlers do not
  // leak.
  useMentorOverlayController.getState().clear();
  useMentorOverlayController.getState().setHandlers(null);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MentorDialogOverlay', () => {
  it('does not auto-open queued dialogs while the study panel is open, then opens after study closes', async () => {
    enqueueFixturePlan();
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

  // Phase C.2 generalization: the auto-open gate moved from `isStudyPanelOpen`
  // alone to `selectIsAnyModalOpen`, so any of these blocking modals must
  // also defer the queue. Parametrised so each new modal flag added to
  // `selectIsAnyModalOpen` upstream gets equivalent coverage by appending
  // a single row.
  it.each([
    ['isRitualModalOpen', 'isRitualModalOpen'] as const,
    ['isCrystalTrialOpen', 'isCrystalTrialOpen'] as const,
    ['isGenerationProgressOpen', 'isGenerationProgressOpen'] as const,
    ['isStudyTimelineOpen', 'isStudyTimelineOpen'] as const,
    ['isDiscoveryModalOpen', 'isDiscoveryModalOpen'] as const,
    ['isGlobalSettingsOpen', 'isGlobalSettingsOpen'] as const,
  ])(
    'does not auto-open queued dialogs while %s is true, opens after it clears',
    async (_label, flag) => {
      enqueueFixturePlan(`queued-${flag}`);
      uiStore.setState({ [flag]: true } as Partial<
        Parameters<typeof uiStore.setState>[0]
      >);

      const { root } = renderOverlay();

      // Modal is open — the queued plan must stay parked.
      expect(useMentorStore.getState().currentDialog).toBeNull();
      expect(document.body.querySelector('[data-testid="mentor-dialog-overlay"]')).toBeNull();

      await act(async () => {
        uiStore.setState({ [flag]: false } as Partial<
          Parameters<typeof uiStore.setState>[0]
        >);
        await Promise.resolve();
      });

      // After the modal closes, the auto-open effect pops the head exactly
      // once and the overlay renders.
      expect(useMentorStore.getState().currentDialog?.id).toBe(`queued-${flag}`);
      expect(
        document.body.querySelector('[data-testid="mentor-dialog-overlay"]'),
      ).not.toBeNull();

      root.unmount();
    },
  );

  it('keeps the queue parked while ANY of multiple modals is open, opens only after all close', async () => {
    enqueueFixturePlan('queued-multi-modal');
    uiStore.setState({
      isRitualModalOpen: true,
      isGenerationProgressOpen: true,
    });

    const { root } = renderOverlay();

    expect(useMentorStore.getState().currentDialog).toBeNull();

    // Closing one modal but leaving another open must NOT pop the queue —
    // proves the gate is the OR-across-flags `selectIsAnyModalOpen`, not
    // a single-flag check that would race on the most-recent transition.
    await act(async () => {
      uiStore.setState({ isRitualModalOpen: false });
      await Promise.resolve();
    });
    expect(useMentorStore.getState().currentDialog).toBeNull();

    // Closing the last remaining modal must finally pop the head.
    await act(async () => {
      uiStore.setState({ isGenerationProgressOpen: false });
      await Promise.resolve();
    });
    expect(useMentorStore.getState().currentDialog?.id).toBe('queued-multi-modal');

    root.unmount();
  });

  it('explicit openCurrentFromQueue() bypasses the gate even while a modal is open', async () => {
    // Bubble click and explicit user actions route through
    // `openCurrentFromQueue()` (or `handleMentorTrigger` followed by an
    // explicit pop). The gate suppresses background auto-open only — it
    // must not block explicit user-driven pops.
    enqueueFixturePlan('queued-bypass');
    uiStore.setState({ isRitualModalOpen: true });

    const { root } = renderOverlay();
    expect(useMentorStore.getState().currentDialog).toBeNull();

    await act(async () => {
      useMentorStore.getState().openCurrentFromQueue();
      await Promise.resolve();
    });

    expect(useMentorStore.getState().currentDialog?.id).toBe('queued-bypass');
    // (Render-side: with isStudyPanelOpen=false the dialog is still
    // rendered; isRitualModalOpen does NOT gate render per Phase C.2's
    // locked scope.)
    expect(
      document.body.querySelector('[data-testid="mentor-dialog-overlay"]'),
    ).not.toBeNull();

    root.unmount();
  });

  it('toggles mentor narration when clicking the avatar', () => {
    useMentorStore.setState({
      ...DEFAULT_PERSISTED_STATE,
      ...DEFAULT_EPHEMERAL_STATE,
      currentDialog: {
        id: 'active-mentor',
        trigger: 'mentor-bubble:clicked',
        payload: {},
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

describe('MentorDialogOverlay \u2014 overlayController integration', () => {
  it('publishes step state on mount for a plain non-interactive message', () => {
    useMentorStore.setState({
      ...DEFAULT_PERSISTED_STATE,
      ...DEFAULT_EPHEMERAL_STATE,
      currentDialog: {
        id: 'plan-step-publish',
        trigger: 'mentor-bubble:clicked',
        payload: {},
        priority: 80,
        enqueuedAt: 1,
        messages: [
          { id: 'msg-1', text: 'A plain message', mood: 'neutral' },
          { id: 'msg-2', text: 'Second message', mood: 'neutral' },
        ],
        source: 'canned',
        voiceId: 'witty-sarcastic',
      },
    });

    const { root } = renderOverlay();

    const s = useMentorOverlayController.getState();
    expect(s.planId).toBe('plan-step-publish');
    expect(s.messageId).toBe('msg-1');
    expect(s.messageIndex).toBe(0);
    // Reduced-motion is mocked to true, so the typewriter jumps to fully
    // revealed on the first reveal-effect tick.
    expect(s.isFullyRevealed).toBe(true);
    expect(s.isInteractive).toBe(false);
    expect(s.handlers).not.toBeNull();

    root.unmount();
  });

  it('publishes isInteractive=true when the active message has choices', () => {
    useMentorStore.setState({
      ...DEFAULT_PERSISTED_STATE,
      ...DEFAULT_EPHEMERAL_STATE,
      currentDialog: {
        id: 'plan-with-choices',
        trigger: 'onboarding:subject-unlock-first-crystal',
        payload: {},
        priority: 78,
        enqueuedAt: 1,
        messages: [
          {
            id: 'msg-prompt',
            text: 'Pick one',
            mood: 'hint',
            choices: [
              { id: 'open-discovery', label: 'Open' },
              { id: 'maybe-later', label: 'Later', next: 'end' },
            ],
          },
        ],
        source: 'canned',
        voiceId: 'witty-sarcastic',
      },
    });

    const { root } = renderOverlay();

    const s = useMentorOverlayController.getState();
    expect(s.planId).toBe('plan-with-choices');
    expect(s.isInteractive).toBe(true);
    expect(s.isFullyRevealed).toBe(true);

    root.unmount();
  });

  it('tapping the dialog <p> routes through requestAmbientAdvance and advances a revealed non-interactive message', () => {
    useMentorStore.setState({
      ...DEFAULT_PERSISTED_STATE,
      ...DEFAULT_EPHEMERAL_STATE,
      currentDialog: {
        id: 'plan-multi',
        trigger: 'mentor-bubble:clicked',
        payload: {},
        priority: 80,
        enqueuedAt: 1,
        messages: [
          { id: 'msg-1', text: 'First', mood: 'neutral' },
          { id: 'msg-2', text: 'Second', mood: 'neutral' },
        ],
        source: 'canned',
        voiceId: 'witty-sarcastic',
      },
    });

    const { root, container } = renderOverlay();
    const text = container.querySelector('[data-testid="mentor-dialog-text"]');
    expect(text).not.toBeNull();
    expect(useMentorOverlayController.getState().messageIndex).toBe(0);

    // Tap on the dialog text — same code path as the canvas-miss tap.
    act(() => {
      text?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Advanced to the second message; the controller's published step
    // state must have followed the React state update.
    expect(useMentorStore.getState().currentDialog?.id).toBe('plan-multi');
    const advanced = useMentorOverlayController.getState();
    expect(advanced.messageIndex).toBe(1);
    expect(advanced.messageId).toBe('msg-2');
    expect(advanced.isFullyRevealed).toBe(true);

    root.unmount();
  });

  it('requestAmbientAdvance is a no-op when the message has choices, even when revealed', () => {
    useMentorStore.setState({
      ...DEFAULT_PERSISTED_STATE,
      ...DEFAULT_EPHEMERAL_STATE,
      currentDialog: {
        id: 'plan-interactive-noop',
        trigger: 'onboarding:subject-unlock-first-crystal',
        payload: {},
        priority: 78,
        enqueuedAt: 1,
        messages: [
          {
            id: 'msg-prompt',
            text: 'Pick one',
            mood: 'hint',
            choices: [
              { id: 'open-discovery', label: 'Open' },
              { id: 'maybe-later', label: 'Later', next: 'end' },
            ],
          },
          { id: 'msg-after', text: 'After', mood: 'neutral' },
        ],
        source: 'canned',
        voiceId: 'witty-sarcastic',
      },
    });

    const { root } = renderOverlay();

    expect(useMentorOverlayController.getState().messageIndex).toBe(0);
    expect(useMentorOverlayController.getState().isInteractive).toBe(true);

    let outcome: ReturnType<typeof requestAmbientAdvance> | undefined;
    act(() => {
      outcome = requestAmbientAdvance();
    });

    expect(outcome).toBe('noop');
    // Must not have advanced past the choice prompt.
    expect(useMentorOverlayController.getState().messageIndex).toBe(0);
    expect(useMentorOverlayController.getState().messageId).toBe('msg-prompt');
    // Dialog must still be present — not dismissed.
    expect(useMentorStore.getState().currentDialog?.id).toBe('plan-interactive-noop');

    root.unmount();
  });

  it('clears the controller state when the overlay unmounts', () => {
    useMentorStore.setState({
      ...DEFAULT_PERSISTED_STATE,
      ...DEFAULT_EPHEMERAL_STATE,
      currentDialog: {
        id: 'plan-unmount',
        trigger: 'mentor-bubble:clicked',
        payload: {},
        priority: 80,
        enqueuedAt: 1,
        messages: [{ id: 'msg-1', text: 'Hello', mood: 'neutral' }],
        source: 'canned',
        voiceId: 'witty-sarcastic',
      },
    });

    const { root } = renderOverlay();
    expect(useMentorOverlayController.getState().planId).toBe('plan-unmount');
    expect(useMentorOverlayController.getState().handlers).not.toBeNull();

    act(() => {
      root.unmount();
    });

    const s = useMentorOverlayController.getState();
    // Both the cleanup-on-unmount effect (clear) and the handler-detach
    // effect run during unmount; final state must be the no-active-dialog
    // defaults plus null handlers.
    expect(s.planId).toBeNull();
    expect(s.messageId).toBeNull();
    expect(s.messageIndex).toBe(0);
    expect(s.isInteractive).toBe(false);
    expect(s.isFullyRevealed).toBe(false);
    expect(s.handlers).toBeNull();

    // Subsequent ambient taps must no-op.
    expect(requestAmbientAdvance()).toBe('noop');
  });
});
