'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { buildMinimalStudyQuestionMessages } from '../features/studyPanel';
import { getChatCompletionsRepositoryForSurface } from '../infrastructure/llmInferenceRegistry';
import { resolveModelForSurface } from '../infrastructure/llmInferenceSurfaceProviders';

const chat = getChatCompletionsRepositoryForSurface('studyQuestionExplain');

export interface UseStudyQuestionLlmExplainParams {
  topicLabel: string;
  questionText: string;
  cardId: string | null;
}

const sessionQuestionExplainCache = new Map<string, string>();

/** Clears in-memory session cache; used from unit tests only. */
export function clearStudyQuestionLlmExplainSessionCacheForTests(): void {
  sessionQuestionExplainCache.clear();
}

function questionExplainCacheKey(cardId: string, topicLabel: string, questionText: string): string {
  return `${cardId}\0${topicLabel}\0${questionText}`;
}

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === 'AbortError')
    || (e instanceof Error && e.name === 'AbortError')
  );
}

export function useStudyQuestionLlmExplain({
  topicLabel,
  questionText,
  cardId,
}: UseStudyQuestionLlmExplainParams) {
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

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    generationRef.current += 1;
    setAssistantText(null);
    setError(null);
    setPending(false);
  }, [setPending]);

  useEffect(() => {
    reset();
  }, [cardId, reset]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

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

  const requestExplain = useCallback(() => {
    if (!cardId) {
      return;
    }

    abortRef.current?.abort();
    generationRef.current += 1;
    const myGeneration = generationRef.current;

    const cacheKey = questionExplainCacheKey(cardId, topicLabel, questionText);
    const cached = sessionQuestionExplainCache.get(cacheKey);
    if (cached !== undefined) {
      setError(null);
      setAssistantText(cached);
      setPending(false);
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    setAssistantText('');
    setPending(true);

    const messages = buildMinimalStudyQuestionMessages(topicLabel, questionText);
    const model = resolveModelForSurface('studyQuestionExplain');

    void (async () => {
      try {
        let acc = '';
        for await (const chunk of chat.streamChat({
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
        sessionQuestionExplainCache.set(cacheKey, acc);
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
  }, [cardId, topicLabel, questionText, setPending]);

  return {
    requestExplain,
    isPending,
    errorMessage: error instanceof Error ? error.message : error ? String(error) : null,
    assistantText,
    reset,
    cancelInflight,
  };
}
