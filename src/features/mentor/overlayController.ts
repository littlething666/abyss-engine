import { create } from 'zustand';

/**
 * Outcome of a single `requestAmbientAdvance()` invocation.
 *
 * - `noop`     — no active dialog, no registered handlers, or the
 *                visual-novel rules dictated suppression (e.g. revealed
 *                interactive message).
 * - `reveal`   — the typewriter was mid-flight and was completed.
 * - `advance`  — the active message was advanced (or, if it was the
 *                final message, the dialog was dismissed).
 *
 * Returned for tests + telemetry instrumentation; production callers
 * (Canvas pointer-miss, floor onClick) ignore the return value.
 */
export type AmbientAdvanceOutcome = 'noop' | 'reveal' | 'advance';

export interface MentorOverlayHandlers {
  /** Jump the typewriter straight to fully revealed. */
  skipReveal: () => void;
  /**
   * Advance to the next message, or dismiss the dialog if this is the
   * last message. Implementations should log telemetry with the
   * `'ambient'` outcome when invoked through this path.
   */
  advance: () => void;
}

export interface MentorOverlayStep {
  /** Plan id of the currently rendered dialog, or null when no dialog is open. */
  planId: string | null;
  /** Stable id of the active message inside the plan, or null when no message is active. */
  messageId: string | null;
  /** Zero-based index of the active message within the plan's `messages` array. */
  messageIndex: number;
  /**
   * `true` when the active message has interactive controls (a name
   * input, choice buttons). Ambient taps are suppressed in this state
   * to avoid the player accidentally dismissing a prompt that requires
   * an explicit answer.
   */
  isInteractive: boolean;
  /**
   * `true` once the typewriter has finished (or reduced-motion is on).
   * Drives the VN rule that the first ambient tap reveals and the
   * second advances.
   */
  isFullyRevealed: boolean;
}

interface MentorOverlayControllerState extends MentorOverlayStep {
  handlers: MentorOverlayHandlers | null;

  /** Partial-update the published step state. */
  setStep: (step: Partial<MentorOverlayStep>) => void;
  /** Register the overlay's handlers; pass null on unmount to detach. */
  setHandlers: (handlers: MentorOverlayHandlers | null) => void;
  /** Reset every published step field back to the no-active-dialog defaults. */
  clear: () => void;
  /**
   * Apply the visual-novel ambient-tap rules against the current step
   * state. Returns the outcome for testing / telemetry.
   */
  requestAmbientAdvance: () => AmbientAdvanceOutcome;
}

const INITIAL_STEP: MentorOverlayStep = {
  planId: null,
  messageId: null,
  messageIndex: 0,
  isInteractive: false,
  isFullyRevealed: false,
};

export const useMentorOverlayController = create<MentorOverlayControllerState>((set, get) => ({
  ...INITIAL_STEP,
  handlers: null,

  setStep: (step) => set(step),
  setHandlers: (handlers) => set({ handlers }),
  clear: () => set({ ...INITIAL_STEP }),

  requestAmbientAdvance: () => {
    const s = get();
    // No active dialog or no overlay mounted — ambient taps must not
    // produce side effects.
    if (s.planId === null || s.handlers === null) return 'noop';

    // Typing — first tap reveals (regardless of interactive). The next
    // tap will land on the revealed branch below.
    if (!s.isFullyRevealed) {
      s.handlers.skipReveal();
      return 'reveal';
    }

    // Revealed but interactive (name input / choices) — suppress to
    // avoid accidentally dismissing a prompt that needs an explicit
    // answer. Player must use the visible control.
    if (s.isInteractive) return 'noop';

    // Revealed non-interactive — advance.
    s.handlers.advance();
    return 'advance';
  },
}));

/**
 * Convenience free function so non-React callers (Canvas
 * onPointerMissed, floor plane onClick) can invoke ambient advance
 * without subscribing to the store.
 */
export function requestAmbientAdvance(): AmbientAdvanceOutcome {
  return useMentorOverlayController.getState().requestAmbientAdvance();
}
