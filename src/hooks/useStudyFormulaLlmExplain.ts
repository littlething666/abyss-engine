'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { StudyFormulaExplainContext } from '../features/studyPanel/studyLlmClient';
import { ensureStudyLlmClientRegistered } from '../infrastructure/wireStudyLlmClient';

export type { StudyFormulaExplainContext };

export interface UseStudyFormulaLlmExplainParams {
  topicLabel: string;
  cardQuestionText: string;
  cardId: string | null;
}

type CachedResponse = { content: string; reasoning: string | null };
const sessionFormulaExplainCache = new Map<string, CachedResponse>();
export function clearStudyFormulaLlmExplainSessionCacheForTests(): void { sessionFormulaExplainCache.clear(); }
export function clearStudyFormulaLlmExplainSessionCacheForCard(cardId: string): void {
  const prefix = `${cardId}\0`;
  for (const key of sessionFormulaExplainCache.keys()) {
    if (key.startsWith(prefix)) {
      sessionFormulaExplainCache.delete(key);
    }
  }
}

function cacheKey(cardId: string, context: StudyFormulaExplainContext, latex: string, topicLabel: string, q: string): string {
  return `${cardId}\0${context}\0${latex}\0${topicLabel}\0${q}`;
}
function isAbortError(e: unknown): boolean {
  return (e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && e.name === 'AbortError');
}

export function useStudyFormulaLlmExplain({
  topicLabel,
  cardQuestionText,
  cardId,
}: UseStudyFormulaLlmExplainParams) {
  const [assistantText, setAssistantText] = useState<string | null>(null);
  const [reasoningText, setReasoningText] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const isPendingRef = useRef(false);

  const setPending = useCallback((next: boolean) => { isPendingRef.current = next; setIsPending(next); }, []);
  const reset = useCallback(() => {
    abortRef.current?.abort(); abortRef.current = null; generationRef.current += 1;
    setAssistantText(null); setReasoningText(null); setError(null); setPending(false);
  }, [setPending]);
  useEffect(() => {
    if (!cardId) {
      reset();
      return;
    }
    reset();
  }, [cardId, reset]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  const clearSessionCache = useCallback(() => {
    if (!cardId) return;
    clearStudyFormulaLlmExplainSessionCacheForCard(cardId);
  }, [cardId]);

  const cancelInflight = useCallback(() => {
    abortRef.current?.abort(); abortRef.current = null;
    if (!isPendingRef.current) return;
    generationRef.current += 1;
    setAssistantText(null); setReasoningText(null); setError(null); setPending(false);
  }, [setPending]);

  const requestExplain = useCallback((latex: string, context: StudyFormulaExplainContext) => {
    if (!cardId) return;
    abortRef.current?.abort();
    generationRef.current += 1;
    const myGeneration = generationRef.current;
    const trimmedLatex = latex.trim();
    const key = cacheKey(cardId, context, trimmedLatex, topicLabel, cardQuestionText);
    const cached = sessionFormulaExplainCache.get(key);
    if (cached !== undefined) { setError(null); setAssistantText(cached.content); setReasoningText(cached.reasoning); setPending(false); return; }

    const ac = new AbortController();
    abortRef.current = ac;
    setError(null); setAssistantText(''); setReasoningText(null); setPending(true);

    void (async () => {
      try {
        let contentAcc = ''; let reasoningAcc = '';
        const client = ensureStudyLlmClientRegistered();
        for await (const chunk of client.stream(
          {
            kind: 'study-formula-explain',
            intent: { topicLabel, cardQuestionText, latex: trimmedLatex, context },
          },
          ac.signal,
        )) {
          if (generationRef.current !== myGeneration) return;
          if (chunk.type === 'reasoning') { reasoningAcc += chunk.text; setReasoningText(reasoningAcc); }
          else { contentAcc += chunk.text; setAssistantText(contentAcc); }
        }
        if (generationRef.current !== myGeneration) return;
        sessionFormulaExplainCache.set(key, { content: contentAcc, reasoning: reasoningAcc.length > 0 ? reasoningAcc : null });
        setPending(false);
      } catch (e) {
        if (generationRef.current !== myGeneration) return;
        if (isAbortError(e)) { setAssistantText(null); setReasoningText(null); setPending(false); return; }
        setError(e); setPending(false); setAssistantText(null); setReasoningText(null);
      }
    })();
  }, [cardId, topicLabel, cardQuestionText, setPending]);

  return {
    requestExplain, isPending,
    errorMessage: error instanceof Error ? error.message : error ? String(error) : null,
    assistantText, reasoningText, reset, cancelInflight, clearSessionCache,
  };
}
