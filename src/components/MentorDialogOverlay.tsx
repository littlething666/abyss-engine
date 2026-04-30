'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { telemetry } from '@/features/telemetry';
import { useMentorStore } from '@/features/mentor/mentorStore';
import type { MentorEffect, MentorMessage, MentorMood } from '@/features/mentor/mentorTypes';
import { useMentorSpeech } from '@/features/mentor/useMentorSpeech';
import { MENTOR_VOICE_ID } from '@/features/mentor/mentorVoice';
import {
  requestAmbientAdvance,
  useMentorOverlayController,
} from '@/features/mentor/overlayController';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { selectIsAnyModalOpen, useUIStore } from '@/store/uiStore';

const MENTOR_TYPE_CHARS_PER_SECOND = 60;

const MOOD_RING: Record<MentorMood, string> = {
  neutral: 'ring-muted-foreground',
  cheer: 'ring-emerald-400',
  tease: 'ring-amber-400',
  concern: 'ring-rose-400',
  celebrate: 'ring-violet-400',
  hint: 'ring-sky-400',
};

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
      // The optional `effect.subjectId` carries through to uiStore so
      // DiscoveryModal can pre-filter to the requested subject (Workstream B's
      // post-curriculum onboarding flow); undefined preserves the legacy
      // sessionStorage fallback.
      const openWithScope = () => ui.openDiscoveryModal(effect.subjectId);
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(openWithScope);
      } else {
        openWithScope();
      }
      return;
    }
    case 'open_generation_hud': {
      mentor.dismissCurrent();
      ui.openGenerationProgress();
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
  const setNarrationEnabled = useMentorStore((s) => s.setNarrationEnabled);
  const setPlayerName = useMentorStore((s) => s.setPlayerName);
  // Two distinct gates:
  //  - `isAnyModalOpen` blocks AUTO-OPEN of queued dialogs while ANY blocking
  //    modal is on screen (discovery, study panel, ritual, study timeline,
  //    crystal trial, generation progress, global settings). Phase C
  //    generalization — keeps background queued plans from interrupting
  //    modal flows the player chose to enter.
  //  - `isStudyPanelOpen` still drives render / typewriter / speech / auto-
  //    advance gates because the study panel is the only modal that occupies
  //    the same bottom-sheet real estate as the dialog overlay; other modals
  //    sit above and don't visually conflict, so the queue+wait pattern is
  //    sufficient for them.
  const isAnyModalOpen = useUIStore(selectIsAnyModalOpen);
  const isStudyPanelOpen = useUIStore((s) => s.isStudyPanelOpen);

  const { speak, cancel, enabled: ttsActive } = useMentorSpeech();
  const reducedMotion = useReducedMotion();

  // Auto-open: when no dialog is currently shown but the queue has entries,
  // pop the head. Bubble clicks and other explicit user actions route through
  // `handleMentorTrigger` → enqueue, and this effect fires as soon as the
  // modal closes so the queued plan opens immediately on close. While a modal
  // is open the queue stays parked.
  useEffect(() => {
    if (!isAnyModalOpen && !currentDialog && queueLen > 0) {
      openCurrentFromQueue();
    }
  }, [currentDialog, isAnyModalOpen, queueLen, openCurrentFromQueue]);

  // Tracks when the active dialog was first shown so completion telemetry can
  // report durationMs. Reset alongside other per-plan state below.
  const startedAtRef = useRef<number | null>(null);
  const revealedCharsRef = useRef(0);

  // Mark seen + telemetry once per dialog open. Note: oneShot suppression in
  // the rule engine ALSO checks seenTriggers, so this is what locks out future
  // welcome/first-subject fires after the dialog is actually rendered.
  useEffect(() => {
    if (!currentDialog) return;
    startedAtRef.current = nowMs();
    markSeen(currentDialog.trigger);
    telemetry.log('mentor-dialog:shown', {
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
    revealedCharsRef.current = 0;
    setNameDraft('');
  }, [currentDialog?.id]);

  const currentMessage: MentorMessage | undefined = messages[messageIndex];
  const totalChars = currentMessage?.text.length ?? 0;
  const isFullyRevealed = revealedChars >= totalChars;

  useEffect(() => {
    revealedCharsRef.current = revealedChars;
  }, [revealedChars]);

  useEffect(() => {
    setRevealedChars(0);
    revealedCharsRef.current = 0;
  }, [currentMessage?.id]);

  // Typewriter reveal — under reduced-motion, jump straight to full text.
  useEffect(() => {
    if (!currentMessage) return;
    if (reducedMotion) {
      setRevealedChars(totalChars);
      revealedCharsRef.current = totalChars;
      return;
    }
    if (isStudyPanelOpen) return;
    const initialChars = revealedCharsRef.current;
    if (initialChars >= totalChars) return;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const elapsedSec = (t - startedAt) / 1000;
      const target = Math.min(
        totalChars,
        initialChars + Math.floor(elapsedSec * MENTOR_TYPE_CHARS_PER_SECOND),
      );
      revealedCharsRef.current = target;
      setRevealedChars(target);
      if (target < totalChars) {
        raf = window.requestAnimationFrame(tick);
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [currentMessage, totalChars, reducedMotion, isStudyPanelOpen]);

  // Speak each message once on entry. Web Speech API is non-incremental for
  // canned mentor lines (no streaming), so we feed the full text and rely on
  // the hook to cancel on unmount / when gates flip off.
  useEffect(() => {
    if (!currentMessage) return;
    if (isStudyPanelOpen) {
      cancel();
      return;
    }
    speak(currentMessage.text);
    return () => cancel();
  }, [currentMessage, isStudyPanelOpen, speak, cancel]);

  const handleAdvance = useCallback(
    (outcome: 'auto-advance' | 'choice' | 'closed' | 'ambient') => {
      if (!currentDialog) return;
      cancel();
      const nextIndex = messageIndex + 1;
      if (nextIndex < messages.length) {
        setMessageIndex(nextIndex);
        return;
      }
      const startedAt = startedAtRef.current;
      const durationMs = startedAt === null ? 0 : Math.max(0, nowMs() - startedAt);
      telemetry.log('mentor-dialog:completed', {
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
    if (!currentMessage || !isFullyRevealed || isStudyPanelOpen) return;
    const ms = currentMessage.autoAdvanceMs;
    if (typeof ms !== 'number' || ms <= 0) return;
    const timer = window.setTimeout(() => {
      handleAdvance('auto-advance');
    }, ms);
    return () => window.clearTimeout(timer);
  }, [currentMessage, isFullyRevealed, isStudyPanelOpen, handleAdvance]);

  const handleSkipReveal = useCallback(() => {
    if (isFullyRevealed || !currentMessage || !currentDialog) return;
    telemetry.log('mentor-dialog:skipped', {
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
  const handleAmbientAdvance = useCallback(() => handleAdvance('ambient'), [handleAdvance]);

  const handleChoice = useCallback(
    (choiceId: string) => {
      if (!currentDialog || !currentMessage) return;
      const choice = currentMessage.choices?.find((c) => c.id === choiceId);
      if (!choice) return;
      telemetry.log('mentor-choice:selected', {
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
    telemetry.log('mentor-onboarding:completed', {
      triggerId: currentDialog.trigger,
      source: 'canned',
      voiceId: MENTOR_VOICE_ID,
      nameLength: trimmed.length,
    });
    handleAdvance('choice');
  }, [currentDialog, handleAdvance, nameDraft, setPlayerName]);

  const handleAvatarToggleNarration = useCallback(() => {
    const currentEnabled = useMentorStore.getState().narrationEnabled;
    setNarrationEnabled(!currentEnabled);
  }, [setNarrationEnabled]);

  // Compute interactive-vs-not the same way the JSX does, so the
  // controller's published `isInteractive` stays in lockstep with what
  // the player actually sees on screen.
  const hasInteractiveControls =
    Boolean(currentMessage?.input) ||
    (currentMessage?.choices !== undefined && currentMessage.choices.length > 0);

  // Publish step state to the overlay controller so out-of-tree consumers
  // (Canvas onPointerMissed, floor deselect plane onClick) can apply the
  // VN rules without reaching into overlay internals. Updates land on
  // every step transition: new plan, message change, reveal completion,
  // interactive-state change.
  useEffect(() => {
    if (!currentDialog || !currentMessage) {
      useMentorOverlayController.getState().clear();
      return;
    }
    useMentorOverlayController.getState().setStep({
      planId: currentDialog.id,
      messageId: currentMessage.id,
      messageIndex,
      isInteractive: hasInteractiveControls,
      isFullyRevealed,
    });
  }, [
    currentDialog,
    currentMessage,
    messageIndex,
    hasInteractiveControls,
    isFullyRevealed,
  ]);

  // Register handlers separately from the step publish: the handler
  // identities depend on different deps (handleSkipReveal /
  // handleAmbientAdvance), so splitting the effects keeps each one
  // narrowly scoped and avoids re-registering handlers on every reveal
  // tick. Detach on unmount.
  useEffect(() => {
    useMentorOverlayController.getState().setHandlers({
      skipReveal: handleSkipReveal,
      advance: handleAmbientAdvance,
    });
    return () => {
      useMentorOverlayController.getState().setHandlers(null);
    };
  }, [handleSkipReveal, handleAmbientAdvance]);

  // Clear the controller fully when the overlay unmounts (route swap,
  // hot reload). The handler-detach effect above handles handler
  // teardown; this clears the published step state too so a stale
  // ambient tap during an HMR cycle cannot land.
  useEffect(() => {
    return () => {
      useMentorOverlayController.getState().clear();
    };
  }, []);

  if (!currentDialog || !currentMessage) return null;
  if (isStudyPanelOpen) return null;

  const visibleText = currentMessage.text.slice(0, revealedChars);
  const showsTypewriter = !reducedMotion && !isFullyRevealed;
  const moodRingClass = MOOD_RING[currentMessage.mood ?? 'neutral'];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center px-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))]"
      data-testid="mentor-dialog-overlay"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="flex items-start justify-between gap-2 pb-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={handleAvatarToggleNarration}
              aria-label={ttsActive ? 'Disable mentor narration' : 'Enable mentor narration'}
              data-testid="mentor-dialog-avatar"
            >
              <Avatar size="sm" className={cn('ring-2', moodRingClass)}>
                <AvatarImage src="/images/crystal.svg" alt="Mentor" />
                <AvatarFallback>M</AvatarFallback>
                {ttsActive ? <AvatarBadge className="animate-pulse" /> : null}
              </Avatar>
            </button>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mentor
            </span>
          </div>
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
          onClick={() => requestAmbientAdvance()}
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
