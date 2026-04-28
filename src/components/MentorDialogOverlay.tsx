'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { telemetry } from '@/features/telemetry';
import { useMentorStore } from '@/features/mentor/mentorStore';
import { useMentorSpeech } from '@/features/mentor/useMentorSpeech';
import { MENTOR_VOICE_ID } from '@/features/mentor/mentorVoice';
import type { MentorEffect, MentorMessage } from '@/features/mentor/mentorTypes';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useUIStore } from '@/store/uiStore';

const MENTOR_TYPE_CHARS_PER_SECOND = 60;

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function applyEffect(effect: MentorEffect | undefined): void {
  if (!effect) return;
  const ui = useUIStore.getState();
  const mentor = useMentorStore.getState();
  switch (effect.kind) {
    case 'open_discovery': {
      mentor.dismissCurrent();
      // Defer one rAF so dismiss() state settles before the new modal opens.
      // Without this the discovery modal animation can stutter under React 18 batching.
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => ui.openDiscoveryModal());
      } else {
        ui.openDiscoveryModal();
      }
      return;
    }
    case 'dismiss': {
      mentor.dismissCurrent();
      return;
    }
  }
}

/**
 * Renders the mentor dialog when one is active. Subscribes to `mentorStore`:
 * if `currentDialog` is null and the queue has items, pops the head. Telemetry,
 * typewriter reveal, Web Speech narration, choice routing, and the
 * `open_discovery` effect all live here. Mounted near the other modals in
 * `app/page.tsx`.
 */
export function MentorDialogOverlay() {
  const queueLen = useMentorStore((s) => s.dialogQueue.length);
  const currentDialog = useMentorStore((s) => s.currentDialog);
  const openCurrentFromQueue = useMentorStore((s) => s.openCurrentFromQueue);
  const dismissCurrent = useMentorStore((s) => s.dismissCurrent);
  const markSeen = useMentorStore((s) => s.markSeen);
  const setPlayerName = useMentorStore((s) => s.setPlayerName);

  const { speak, cancel, enabled: ttsActive } = useMentorSpeech();
  const reducedMotion = useReducedMotion();

  // Auto-open: when no dialog is currently shown but the queue has entries,
  // pop the head. This is what makes mentor.bubble.click while the overlay is
  // closed re-open the queued head per the plan.
  useEffect(() => {
    if (!currentDialog && queueLen > 0) {
      openCurrentFromQueue();
    }
  }, [currentDialog, queueLen, openCurrentFromQueue]);

  // Tracks when the active dialog was first shown so completion telemetry can
  // report durationMs. Reset alongside other per-plan state below.
  const startedAtRef = useRef<number | null>(null);

  // Mark seen + telemetry once per dialog open. Note: oneShot suppression in
  // the rule engine ALSO checks seenTriggers, so this is what locks out future
  // welcome/first-subject fires after the dialog is actually rendered.
  useEffect(() => {
    if (!currentDialog) return;
    startedAtRef.current = nowMs();
    markSeen(currentDialog.trigger);
    telemetry.log('mentor_dialog_shown', {
      triggerId: currentDialog.trigger,
      source: 'canned',
      voiceId: MENTOR_VOICE_ID,
      planId: currentDialog.id,
    });
  }, [currentDialog, markSeen]);

  const messages = currentDialog?.messages ?? [];
  const [messageIndex, setMessageIndex] = useState(0);
  const [revealedChars, setRevealedChars] = useState(0);
  const [nameDraft, setNameDraft] = useState('');

  // Reset progress when a new dialog plan opens.
  useEffect(() => {
    setMessageIndex(0);
    setRevealedChars(0);
    setNameDraft('');
  }, [currentDialog?.id]);

  const currentMessage: MentorMessage | undefined = messages[messageIndex];
  const totalChars = currentMessage?.text.length ?? 0;
  const isFullyRevealed = revealedChars >= totalChars;

  // Typewriter reveal — under reduced-motion, jump straight to full text.
  useEffect(() => {
    if (!currentMessage) return;
    if (reducedMotion) {
      setRevealedChars(totalChars);
      return;
    }
    setRevealedChars(0);
    const startedAt = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const elapsedSec = (t - startedAt) / 1000;
      const target = Math.min(totalChars, Math.floor(elapsedSec * MENTOR_TYPE_CHARS_PER_SECOND));
      setRevealedChars(target);
      if (target < totalChars) {
        raf = window.requestAnimationFrame(tick);
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [currentMessage, totalChars, reducedMotion]);

  // Speak each message once on entry. Web Speech API is non-incremental for
  // canned mentor lines (no streaming), so we feed the full text and rely on
  // the hook to cancel on unmount / when gates flip off.
  useEffect(() => {
    if (!currentMessage) return;
    speak(currentMessage.text);
    return () => cancel();
  }, [currentMessage, speak, cancel]);

  const handleAdvance = useCallback(
    (outcome: 'auto-advance' | 'choice' | 'closed') => {
      if (!currentDialog) return;
      cancel();
      const nextIndex = messageIndex + 1;
      if (nextIndex < messages.length) {
        setMessageIndex(nextIndex);
        return;
      }
      const startedAt = startedAtRef.current;
      const durationMs = startedAt === null ? 0 : Math.max(0, nowMs() - startedAt);
      telemetry.log('mentor_dialog_completed', {
        triggerId: currentDialog.trigger,
        source: 'canned',
        voiceId: MENTOR_VOICE_ID,
        planId: currentDialog.id,
        durationMs,
        outcome,
      });
      startedAtRef.current = null;
      dismissCurrent();
    },
    [cancel, currentDialog, dismissCurrent, messageIndex, messages.length],
  );

  // Auto-advance after `autoAdvanceMs` once fully revealed.
  useEffect(() => {
    if (!currentMessage || !isFullyRevealed) return;
    const ms = currentMessage.autoAdvanceMs;
    if (typeof ms !== 'number' || ms <= 0) return;
    const timer = window.setTimeout(() => {
      handleAdvance('auto-advance');
    }, ms);
    return () => window.clearTimeout(timer);
  }, [currentMessage, isFullyRevealed, handleAdvance]);

  const handleSkipReveal = useCallback(() => {
    if (isFullyRevealed || !currentMessage || !currentDialog) return;
    telemetry.log('mentor_dialog_skipped', {
      triggerId: currentDialog.trigger,
      source: 'canned',
      voiceId: MENTOR_VOICE_ID,
      charsRevealed: revealedChars,
      totalChars,
    });
    setRevealedChars(totalChars);
    cancel();
  }, [cancel, currentDialog, currentMessage, isFullyRevealed, revealedChars, totalChars]);

  const handleClose = useCallback(() => handleAdvance('closed'), [handleAdvance]);

  const handleChoice = useCallback(
    (choiceId: string) => {
      if (!currentDialog || !currentMessage) return;
      const choice = currentMessage.choices?.find((c) => c.id === choiceId);
      if (!choice) return;
      telemetry.log('mentor_choice_selected', {
        triggerId: currentDialog.trigger,
        source: 'canned',
        voiceId: MENTOR_VOICE_ID,
        planId: currentDialog.id,
        choiceId: choice.id,
      });
      if (choice.effect) {
        applyEffect(choice.effect);
        return;
      }
      if (choice.next === 'end' || !choice.next) {
        handleAdvance('choice');
        return;
      }
      const nextIdx = messages.findIndex((m) => m.id === choice.next);
      if (nextIdx >= 0) setMessageIndex(nextIdx);
    },
    [currentDialog, currentMessage, handleAdvance, messages],
  );

  const handleNameSubmit = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (!trimmed || !currentDialog) return;
    setPlayerName(trimmed);
    telemetry.log('mentor_onboarding_completed', {
      triggerId: currentDialog.trigger,
      source: 'canned',
      voiceId: MENTOR_VOICE_ID,
      nameLength: trimmed.length,
    });
    handleAdvance('choice');
  }, [currentDialog, handleAdvance, nameDraft, setPlayerName]);

  if (!currentDialog || !currentMessage) return null;

  const visibleText = currentMessage.text.slice(0, revealedChars);
  const showsTypewriter = !reducedMotion && !isFullyRevealed;
  const hasInteractiveControls =
    Boolean(currentMessage.input) ||
    (currentMessage.choices !== undefined && currentMessage.choices.length > 0);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))]"
      data-testid="mentor-dialog-overlay"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="flex items-start justify-between gap-2 pb-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mentor{ttsActive ? ' · 🔊' : ''}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Close mentor dialog"
            data-testid="mentor-dialog-close"
          >
            ✕
          </button>
        </div>

        <p
          className="cursor-pointer text-sm leading-snug text-foreground"
          onClick={handleSkipReveal}
          data-testid="mentor-dialog-text"
        >
          {visibleText}
          {showsTypewriter ? <span className="text-muted-foreground">▌</span> : null}
        </p>

        {currentMessage.input?.kind === 'name' ? (
          <div className="flex gap-2 pt-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.currentTarget.value)}
              placeholder={currentMessage.input.placeholder ?? 'Type a name'}
              maxLength={currentMessage.input.maxLen ?? 24}
              aria-label="Player name"
              data-testid="mentor-name-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSubmit();
              }}
            />
            <Button type="button" size="sm" onClick={handleNameSubmit} disabled={!nameDraft.trim()}>
              Save
            </Button>
          </div>
        ) : null}

        {currentMessage.choices && currentMessage.choices.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {currentMessage.choices.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleChoice(c.id)}
                data-testid={`mentor-choice-${c.id}`}
              >
                {c.label}
              </Button>
            ))}
          </div>
        ) : null}

        {!hasInteractiveControls ? (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              onClick={() => handleAdvance('choice')}
              data-testid="mentor-dialog-next"
            >
              {messageIndex + 1 < messages.length ? 'Next' : 'Got it'}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
