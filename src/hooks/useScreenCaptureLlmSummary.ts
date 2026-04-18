'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { buildScreenCaptureSummaryMessages } from '../features/screenCaptureSummary';
import { getChatCompletionsRepositoryForSurface } from '../infrastructure/llmInferenceRegistry';
import {
  resolveEnableStreamingForSurface,
  resolveModelForSurface,
} from '../infrastructure/llmInferenceSurfaceProviders';
import { captureDisplayMediaAsPngDataUrl } from '../lib/captureDisplayMediaFrame';

const chat = getChatCompletionsRepositoryForSurface('screenCaptureSummary');

function isAbortError(e: unknown): boolean {
  return (e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && e.name === 'AbortError');
}

export interface UseScreenCaptureLlmSummaryParams { enableThinking: boolean; }

export function useScreenCaptureLlmSummary({ enableThinking }: UseScreenCaptureLlmSummaryParams) {
  const [surfaceOpen, setSurfaceOpen] = useState(false);
  const [assistantText, setAssistantText] = useState<string | null>(null);
  const [reasoningText, setReasoningText] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const isPendingRef = useRef(false);

  const setPending = useCallback((next: boolean) => { isPendingRef.current = next; setIsPending(next); }, []);
  const cancelInflight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (!isPendingRef.current) return;
    generationRef.current += 1;
    setAssistantText(null); setReasoningText(null); setError(null); setPending(false);
  }, [setPending]);
  const reset = useCallback(() => { cancelInflight(); setAssistantText(null); setReasoningText(null); setError(null); }, [cancelInflight]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleSurfaceOpenChange = useCallback((open: boolean) => {
    setSurfaceOpen(open);
    if (!open) { cancelInflight(); setAssistantText(null); setReasoningText(null); setError(null); setPending(false); }
  }, [cancelInflight, setPending]);

  const dismissSurface = useCallback(() => { handleSurfaceOpenChange(false); }, [handleSurfaceOpenChange]);

  const startSummarize = useCallback(() => {
    abortRef.current?.abort();
    generationRef.current += 1;
    const myGeneration = generationRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    setSurfaceOpen(true); setError(null); setAssistantText(null); setReasoningText(null); setPending(true);

    void captureDisplayMediaAsPngDataUrl()
      .then((dataUrl) => {
        if (generationRef.current !== myGeneration) return;
        const messages = buildScreenCaptureSummaryMessages(dataUrl);
        const model = resolveModelForSurface('screenCaptureSummary');
        const enableStreaming = resolveEnableStreamingForSurface('screenCaptureSummary');
        setAssistantText('');
        void (async () => {
          try {
            let contentAcc = ''; let reasoningAcc = '';
            for await (const chunk of chat.streamChat({
              model,
              messages,
              signal: ac.signal,
              enableThinking,
              enableStreaming,
            })) {
              if (generationRef.current !== myGeneration) return;
              if (chunk.type === 'reasoning') { reasoningAcc += chunk.text; setReasoningText(reasoningAcc); }
              else { contentAcc += chunk.text; setAssistantText(contentAcc); }
            }
            if (generationRef.current !== myGeneration) return;
            setPending(false);
          } catch (e) {
            if (generationRef.current !== myGeneration) return;
            if (isAbortError(e)) { setAssistantText(null); setReasoningText(null); setPending(false); return; }
            setError(e); setPending(false); setAssistantText(null); setReasoningText(null);
          }
        })();
      })
      .catch((e) => { if (generationRef.current !== myGeneration) return; setError(e); setPending(false); });
  }, [enableThinking, setPending]);

  return {
    surfaceOpen, handleSurfaceOpenChange, dismissSurface, startSummarize,
    isPending, assistantText, reasoningText,
    errorMessage: error instanceof Error ? error.message : error ? String(error) : null,
    reset, cancelInflight,
  };
}
