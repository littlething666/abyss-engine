'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { buildFormulaExplainMessages, type StudyFormulaExplainContext } from '../features/studyPanel';
import { getChatCompletionsRepositoryForSurface } from '../infrastructure/llmInferenceRegistry';
import {
  getOpenAiCompatibleApiKeyOverride,
  getOpenAiCompatibleChatUrlOverride,
  resolveOpenAiCompatibleModelForSurface,
} from '../store/studySettingsStore';

const chat = getChatCompletionsRepositoryForSurface('studyFormulaExplain');

export type { StudyFormulaExplainContext };

export interface UseStudyFormulaLlmExplainParams {
  topicLabel: string;
  cardQuestionText: string;
  cardId: string | null;
  enableThinking: boolean;
}

type CachedResponse = { content: string; reasoning: string | null };

const sessionFormulaExplainCache = new Map<string, CachedResponse>();

/** Clears in-memory session cache; used from unit tests only. */
export function clearStudyFormulaLlmExplainSessionCacheForTests(): void {
  sessionFormulaExplainCache.clear();
}

function formulaExplainCacheKey(
  cardId: string,
  context: StudyFormulaExplainContext,
  latexNormalized: string,
  topicLabel: string,
  cardQuestionText: string,
): string {
  return `${cardId}\0${context}\0${latexNormalized}\0${topicLabel}\0${cardQuestionText}`;
}

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === 'AbortError')
    || (e instanceof Error && e.name === 'AbortError')
  );
}

export function useStudyFormulaLlmExplain({
  topicLabel,
  cardQuestionText,
  cardId,
  enableThinking,
}: UseStudyFormulaLlmExplainParams) {
  const [assistantText, setAssistantText] = useState<string | null>(null);
  const [reasoningText, setReasoningText] = useState<string | null>(null);
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
    setReasoningText(null);
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
    setReasoningText(null);
    setError(null);
    setPending(false);
  }, [setPending]);

  const requestExplain = useCallback(
    (latex: string, context: StudyFormulaExplainContext) => {
      if (!cardId) {
        return;
      }

      abortRef.current?.abort();
      generationRef.current += 1;
      const myGeneration = generationRef.current;

      const latexNormalized = latex.trim();
      const cacheKey = formulaExplainCacheKey(
        cardId,
        context,
        latexNormalized,
        topicLabel,
        cardQuestionText,
      );
      const cached = sessionFormulaExplainCache.get(cacheKey);
      if (cached !== undefined) {
        setError(null);
        setAssistantText(cached.content);
        setReasoningText(cached.reasoning);
        setPending(false);
        return;
      }

      const ac = new AbortController();
      abortRef.current = ac;
      setError(null);
      setAssistantText('');
      setReasoningText(null);
      setPending(true);

      const messages = buildFormulaExplainMessages(topicLabel, cardQuestionText, latex, context);
      const model = resolveOpenAiCompatibleModelForSurface('studyFormulaExplain');
      const apiKey = getOpenAiCompatibleApiKeyOverride();
      const endpointUrl = getOpenAiCompatibleChatUrlOverride();

      void (async () => {
        try {
          let contentAcc = '';
          let reasoningAcc = '';
          for await (const chunk of chat.streamChat({
            model,
            messages,
            signal: ac.signal,
            enableThinking,
            ...(endpointUrl !== undefined ? { endpointUrl } : {}),
            ...(apiKey !== undefined ? { apiKey } : {}),
          })) {
            if (generationRef.current !== myGeneration) {
              return;
            }
            if (chunk.type === 'reasoning') {
              reasoningAcc += chunk.text;
              setReasoningText(reasoningAcc);
            } else {
              contentAcc += chunk.text;
              setAssistantText(contentAcc);
            }
          }
          if (generationRef.current !== myGeneration) {
            return;
          }
          sessionFormulaExplainCache.set(cacheKey, {
            content: contentAcc,
            reasoning: reasoningAcc.length > 0 ? reasoningAcc : null,
          });
          setPending(false);
        } catch (e) {
          if (generationRef.current !== myGeneration) {
            return;
          }
          if (isAbortError(e)) {
            setAssistantText(null);
            setReasoningText(null);
            setPending(false);
            return;
          }
          setError(e);
          setPending(false);
          setAssistantText(null);
          setReasoningText(null);
        }
      })();
    },
    [cardId, topicLabel, cardQuestionText, enableThinking, setPending],
  );

  return {
    requestExplain,
    isPending,
    errorMessage: error instanceof Error ? error.message : error ? String(error) : null,
    assistantText,
    reasoningText,
    reset,
    cancelInflight,
  };
}
