'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useInferenceTtsToggle } from '@/hooks/useInferenceTtsToggle';
import { useMentorStore } from './mentorStore';

export interface UseMentorSpeechResult {
  /** Speak the given text. No-op if disabled or window.speechSynthesis is unavailable. */
  speak: (text: string) => void;
  /** Cancel any in-flight utterance for this hook instance. */
  cancel: () => void;
  /** True while an utterance is queued or playing. */
  isSpeaking: boolean;
  /** Whether speak() would actually fire if called now. */
  enabled: boolean;
}

/**
 * Web Speech API only mentor TTS hook (Q2). Gated on BOTH the global TTS
 * master toggle (`useInferenceTtsToggle.enableTts`) AND mentor mute
 * (`mentorStore.ttsMuted`).
 *
 * Explicitly NOT used: provider-backed TTS, `getChatCompletionsRepositoryForSurface`,
 * `llmInferenceRegistry`. The mentor canned lines never round-trip an LLM.
 *
 * Cancels in-flight speech on unmount or when either gate flips off.
 */
export function useMentorSpeech(): UseMentorSpeechResult {
  const { enableTts } = useInferenceTtsToggle();
  const ttsMuted = useMentorStore((s) => s.ttsMuted);
  const enabled = enableTts && !ttsMuted;

  const utteranceCountRef = useRef(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const cancel = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (utteranceCountRef.current > 0) {
      window.speechSynthesis.cancel();
    }
    utteranceCountRef.current = 0;
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || !text) return;
      if (
        typeof window === 'undefined' ||
        !window.speechSynthesis ||
        typeof window.SpeechSynthesisUtterance === 'undefined'
      ) {
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      utteranceCountRef.current += 1;
      setIsSpeaking(true);
      const onFinish = () => {
        utteranceCountRef.current = Math.max(0, utteranceCountRef.current - 1);
        if (utteranceCountRef.current === 0) {
          setIsSpeaking(false);
        }
      };
      u.onend = onFinish;
      u.onerror = onFinish;
      window.speechSynthesis.speak(u);
    },
    [enabled],
  );

  // Cancel in-flight speech on unmount.
  useEffect(() => () => cancel(), [cancel]);
  // Cancel when either gate flips off.
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);

  return { speak, cancel, isSpeaking, enabled };
}
