'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { buildScreenCaptureSummaryMessages } from '../features/screenCaptureSummary';
import { captureDisplayMediaAsPngDataUrl } from '../lib/captureDisplayMediaFrame';
import { chatCompletionsRepository } from '../infrastructure/di';

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === 'AbortError')
    || (e instanceof Error && e.name === 'AbortError')
  );
}

function visionModelFromEnv(): string {
  return (
    process.env.NEXT_PUBLIC_LLM_VISION_MODEL?.trim()
    || process.env.NEXT_PUBLIC_LLM_MODEL?.trim()
    || ''
  );
}

export function useScreenCaptureLlmSummary() {
  const [surfaceOpen, setSurfaceOpen] = useState(false);
  const [assistantText, setAssistantText] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const isPendingRef = useRef(false);

  const setPending = useCallback((next: boolean) => {
    isPendingRef.current = next;
    setIsPending(next);
  }, []);

  const cancelInflight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (!isPendingRef.current) {
      return;
    }
    generationRef.current += 1;
    setAssistantText(null);
    setError(null);
    setPending(false);
  }, [setPending]);

  const reset = useCallback(() => {
    cancelInflight();
    setAssistantText(null);
    setError(null);
  }, [cancelInflight]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const handleSurfaceOpenChange = useCallback(
    (open: boolean) => {
      setSurfaceOpen(open);
      if (!open) {
        cancelInflight();
        setAssistantText(null);
        setError(null);
        setPending(false);
      }
    },
    [cancelInflight, setPending],
  );

  const dismissSurface = useCallback(() => {
    handleSurfaceOpenChange(false);
  }, [handleSurfaceOpenChange]);

  const startSummarize = useCallback(() => {
    abortRef.current?.abort();
    generationRef.current += 1;
    const myGeneration = generationRef.current;

    const ac = new AbortController();
    abortRef.current = ac;
    setSurfaceOpen(true);
    setError(null);
    setAssistantText(null);
    setPending(true);

    /** Call `captureDisplayMediaAsPngDataUrl()` directly (not inside another async IIFE) so `getDisplayMedia` runs in the same synchronous user-activation stack as the command palette `onSelect` handler. */
    void captureDisplayMediaAsPngDataUrl()
      .then((dataUrl) => {
        if (generationRef.current !== myGeneration) {
          return;
        }

        const messages = buildScreenCaptureSummaryMessages(dataUrl);
        const model = visionModelFromEnv();
        setAssistantText('');

        void (async () => {
          try {
            let acc = '';
            for await (const chunk of chatCompletionsRepository.streamChat({
              model,
              messages,
              signal: ac.signal,
            })) {
              if (generationRef.current !== myGeneration) {
                return;
              }
              acc += chunk;
              setAssistantText(acc);
            }
            if (generationRef.current !== myGeneration) {
              return;
            }
            setPending(false);
          } catch (e) {
            if (generationRef.current !== myGeneration) {
              return;
            }
            if (isAbortError(e)) {
              setAssistantText(null);
              setPending(false);
              return;
            }
            setError(e);
            setPending(false);
            setAssistantText(null);
          }
        })();
      })
      .catch((e) => {
        if (generationRef.current !== myGeneration) {
          return;
        }
        setError(e);
        setPending(false);
      });
  }, [setPending]);

  return {
    surfaceOpen,
    handleSurfaceOpenChange,
    dismissSurface,
    startSummarize,
    isPending,
    assistantText,
    errorMessage: error instanceof Error ? error.message : error ? String(error) : null,
    reset,
    cancelInflight,
  };
}
