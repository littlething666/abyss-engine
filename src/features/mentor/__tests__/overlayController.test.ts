import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requestAmbientAdvance,
  useMentorOverlayController,
} from '../overlayController';

// The controller is a module-scoped zustand store, so resetting between
// tests is mandatory - otherwise the previous test's published step state
// or registered handlers leak into the next.
beforeEach(() => {
  useMentorOverlayController.getState().clear();
  useMentorOverlayController.getState().setHandlers(null);
});

function primeStep(overrides: {
  planId?: string | null;
  messageId?: string | null;
  messageIndex?: number;
  isInteractive?: boolean;
  isFullyRevealed?: boolean;
} = {}): void {
  useMentorOverlayController.getState().setStep({
    planId: 'plan-1',
    messageId: 'msg-1',
    messageIndex: 0,
    isInteractive: false,
    isFullyRevealed: false,
    ...overrides,
  });
}

function primeHandlers(): { skipReveal: ReturnType<typeof vi.fn>; advance: ReturnType<typeof vi.fn> } {
  const skipReveal = vi.fn();
  const advance = vi.fn();
  useMentorOverlayController.getState().setHandlers({ skipReveal, advance });
  return { skipReveal, advance };
}

describe('overlayController - requestAmbientAdvance', () => {
  it('returns noop when no dialog is active (planId null)', () => {
    const { skipReveal, advance } = primeHandlers();
    // No primeStep - planId stays null.
    expect(requestAmbientAdvance()).toBe('noop');
    expect(skipReveal).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });

  it('returns noop when handlers are not registered, even with an active step', () => {
    primeStep({ isFullyRevealed: true });
    // Handlers stay null - the overlay component is unmounted.
    expect(requestAmbientAdvance()).toBe('noop');
  });

  it('reveals the typewriter on first tap when not fully revealed (non-interactive)', () => {
    primeStep({ isFullyRevealed: false, isInteractive: false });
    const { skipReveal, advance } = primeHandlers();

    expect(requestAmbientAdvance()).toBe('reveal');
    expect(skipReveal).toHaveBeenCalledTimes(1);
    expect(advance).not.toHaveBeenCalled();
  });

  it('reveals the typewriter on first tap even when the message is interactive', () => {
    // VN rule: interactive only suppresses ambient taps once the message
    // is fully revealed. While typing, a tap completes the reveal so
    // the player can read the prompt before being asked to interact.
    primeStep({ isFullyRevealed: false, isInteractive: true });
    const { skipReveal, advance } = primeHandlers();

    expect(requestAmbientAdvance()).toBe('reveal');
    expect(skipReveal).toHaveBeenCalledTimes(1);
    expect(advance).not.toHaveBeenCalled();
  });

  it('advances the message when revealed and non-interactive', () => {
    primeStep({ isFullyRevealed: true, isInteractive: false });
    const { skipReveal, advance } = primeHandlers();

    expect(requestAmbientAdvance()).toBe('advance');
    expect(advance).toHaveBeenCalledTimes(1);
    expect(skipReveal).not.toHaveBeenCalled();
  });

  it('returns noop when revealed and interactive (input/choice prompt must not be auto-dismissed)', () => {
    primeStep({ isFullyRevealed: true, isInteractive: true });
    const { skipReveal, advance } = primeHandlers();

    expect(requestAmbientAdvance()).toBe('noop');
    expect(advance).not.toHaveBeenCalled();
    expect(skipReveal).not.toHaveBeenCalled();
  });

  it('clear() resets the step state so subsequent ambient taps no-op', () => {
    primeStep({ isFullyRevealed: true, isInteractive: false });
    const { advance } = primeHandlers();
    // Sanity: would advance.
    expect(requestAmbientAdvance()).toBe('advance');
    advance.mockReset();

    useMentorOverlayController.getState().clear();
    expect(useMentorOverlayController.getState().planId).toBeNull();
    expect(useMentorOverlayController.getState().messageId).toBeNull();
    expect(useMentorOverlayController.getState().messageIndex).toBe(0);
    expect(useMentorOverlayController.getState().isInteractive).toBe(false);
    expect(useMentorOverlayController.getState().isFullyRevealed).toBe(false);

    expect(requestAmbientAdvance()).toBe('noop');
    expect(advance).not.toHaveBeenCalled();
  });

  it('setStep merges partial updates without clobbering unspecified fields', () => {
    primeStep({
      planId: 'plan-1',
      messageId: 'msg-1',
      messageIndex: 2,
      isInteractive: true,
      isFullyRevealed: false,
    });

    // Partial update: only flip isFullyRevealed. The other fields must
    // survive intact (the overlay publishes reveal-state changes
    // independently from message-id changes).
    useMentorOverlayController.getState().setStep({ isFullyRevealed: true });

    const s = useMentorOverlayController.getState();
    expect(s.planId).toBe('plan-1');
    expect(s.messageId).toBe('msg-1');
    expect(s.messageIndex).toBe(2);
    expect(s.isInteractive).toBe(true);
    expect(s.isFullyRevealed).toBe(true);
  });

  it('setHandlers(null) detaches handlers and forces subsequent ambient taps to no-op', () => {
    primeStep({ isFullyRevealed: true, isInteractive: false });
    const { advance } = primeHandlers();

    expect(requestAmbientAdvance()).toBe('advance');
    advance.mockReset();

    // Overlay unmount path: detach handlers but keep the step state.
    useMentorOverlayController.getState().setHandlers(null);
    expect(requestAmbientAdvance()).toBe('noop');
    expect(advance).not.toHaveBeenCalled();
  });
});
