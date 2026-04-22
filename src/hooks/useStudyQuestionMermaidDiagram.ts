'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { buildStudyQuestionMermaidMessages } from '../features/studyPanel';
import { getChatCompletionsRepositoryForSurface } from '../infrastructure/llmInferenceRegistry';
import {
  resolveEnableStreamingForSurface,
  resolveModelForSurface,
  resolveOpenRouterReasoningChatOptions,
} from '../infrastructure/llmInferenceSurfaceProviders';

const chat = getChatCompletionsRepositoryForSurface('studyQuestionMermaid');

export interface UseStudyQuestionMermaidDiagramParams {
  topicLabel: string;
  questionText: string;
  cardId: string | null;
  reasoningFromUserToggle: boolean;
}

type CachedResponse = { content: string; reasoning: string | null };
const sessionMermaidCache = new Map<string, CachedResponse>();
export function clearStudyQuestionMermaidDiagramSessionCacheForTests(): void { sessionMermaidCache.clear(); }
export function clearStudyQuestionMermaidDiagramSessionCacheForCard(cardId: string): void {
  const prefix = `${cardId}\0`;
  for (const key of sessionMermaidCache.keys()) {
    if (key.startsWith(prefix)) {
      sessionMermaidCache.delete(key);
    }
  }
}

function cacheKey(cardId: string, topicLabel: string, q: string): string { return `${cardId}\0${topicLabel}\0${q}`; }
function isAbortError(e: unknown): boolean {
  return (e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && e.name === 'AbortError');
}

export function useStudyQuestionMermaidDiagram({
  topicLabel,
  questionText,
  cardId,
  reasoningFromUserToggle,
}: UseStudyQuestionMermaidDiagramParams) {
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
    clearStudyQuestionMermaidDiagramSessionCacheForCard(cardId);
  }, [cardId]);

  const cancelInflight = useCallback(() => {
    abortRef.current?.abort(); abortRef.current = null;
    if (!isPendingRef.current) return;
    generationRef.current += 1;
    setAssistantText(null); setReasoningText(null); setError(null); setPending(false);
  }, [setPending]);

  const requestDiagram = useCallback(() => {
    if (!cardId) return;
    abortRef.current?.abort();
    generationRef.current += 1;
    const myGeneration = generationRef.current;
    const key = cacheKey(cardId, topicLabel, questionText);
    const cached = sessionMermaidCache.get(key);
    if (cached !== undefined) { setError(null); setAssistantText(cached.content); setReasoningText(cached.reasoning); setPending(false); return; }

    const ac = new AbortController();
    abortRef.current = ac;
    setError(null); setAssistantText(''); setReasoningText(null); setPending(true);
    const messages = buildStudyQuestionMermaidMessages(topicLabel, questionText);
    const model = resolveModelForSurface('studyQuestionMermaid');
    const enableStreaming = resolveEnableStreamingForSurface('studyQuestionMermaid');
    const reasoningOpts = resolveOpenRouterReasoningChatOptions('studyQuestionMermaid', reasoningFromUserToggle);

    void (async () => {
      try {
        let contentAcc = ''; let reasoningAcc = '';
        for await (const chunk of chat.streamChat({
          model,
          messages,
          signal: ac.signal,
          includeOpenRouterReasoning: reasoningOpts.includeOpenRouterReasoning,
          enableReasoning: reasoningOpts.enableReasoning,
          enableStreaming,
        })) {
          if (generationRef.current !== myGeneration) return;
          if (chunk.type === 'reasoning') { reasoningAcc += chunk.text; setReasoningText(reasoningAcc); }
          else { contentAcc += chunk.text; setAssistantText(contentAcc); }
        }
        if (generationRef.current !== myGeneration) return;
        sessionMermaidCache.set(key, { content: contentAcc, reasoning: reasoningAcc.length > 0 ? reasoningAcc : null });
        setPending(false);
      } catch (e) {
        if (generationRef.current !== myGeneration) return;
        if (isAbortError(e)) { setAssistantText(null); setReasoningText(null); setPending(false); return; }
        setError(e); setPending(false); setAssistantText(null); setReasoningText(null);
      }
    })();
  }, [cardId, topicLabel, questionText, reasoningFromUserToggle, setPending]);

  return {
    requestDiagram, isPending,
    errorMessage: error instanceof Error ? error.message : error ? String(error) : null,
    assistantText, reasoningText, reset, cancelInflight, clearSessionCache,
  };
}
