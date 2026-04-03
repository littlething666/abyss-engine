import { useCallback, useRef, useState } from 'react';

import {
  applyCurriculumGraphToIndexedDb,
  buildCurriculumGraphMessages,
  parseSubjectGraphResponse,
  validateCurriculumGraph,
  type CurriculumGraphExpectations,
  type CurriculumGraphPromptParams,
} from '@/features/ascentWeaver';
import type { Subject } from '@/types/core';
import { resolveModelForSurface } from '@/infrastructure/llmInferenceSurfaceProviders';
import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter } from '@/types/repository';

export interface AscentWeaverGenerateInput {
  promptParams: CurriculumGraphPromptParams;
  subject: Subject;
  expectations: CurriculumGraphExpectations;
}

export interface UseAscentWeaverCurriculumGraphParams {
  chat: IChatCompletionsRepository;
  writer: IDeckContentWriter;
  enableThinking: boolean;
}

export function useAscentWeaverCurriculumGraph({
  chat,
  writer,
  enableThinking,
}: UseAscentWeaverCurriculumGraphParams) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRawResponse, setLastRawResponse] = useState<string | null>(null);
  const [streamingAssistantText, setStreamingAssistantText] = useState('');
  const [streamingReasoningText, setStreamingReasoningText] = useState<string | null>(null);
  const generationRef = useRef(0);

  const reset = useCallback(() => {
    generationRef.current += 1;
    setError(null);
    setLastRawResponse(null);
    setStreamingAssistantText('');
    setStreamingReasoningText(null);
  }, []);

  const generateAndApply = useCallback(
    async (input: AscentWeaverGenerateInput): Promise<boolean> => {
      const model = resolveModelForSurface('ascentWeaver');
      const myGeneration = ++generationRef.current;

      setPending(true);
      setError(null);
      setLastRawResponse(null);
      setStreamingAssistantText('');
      setStreamingReasoningText(null);

      try {
        const messages = buildCurriculumGraphMessages(input.promptParams);
        let contentAcc = '';
        let reasoningAcc = '';
        for await (const chunk of chat.streamChat({
          model,
          messages,
          enableThinking,
        })) {
          if (generationRef.current !== myGeneration) {
            return false;
          }
          if (chunk.type === 'reasoning') {
            reasoningAcc += chunk.text;
            setStreamingReasoningText(reasoningAcc);
          } else {
            contentAcc += chunk.text;
            setStreamingAssistantText(contentAcc);
          }
        }

        if (generationRef.current !== myGeneration) {
          return false;
        }

        setLastRawResponse(contentAcc);

        const parsed = parseSubjectGraphResponse(contentAcc);
        if (!parsed.ok) {
          setError(parsed.error);
          return false;
        }

        const valid = validateCurriculumGraph(parsed.graph, input.expectations);
        if (!valid.ok) {
          setError(valid.error);
          return false;
        }

        await applyCurriculumGraphToIndexedDb(writer, {
          subject: input.subject,
          graph: parsed.graph,
        });

        setError(null);
        return true;
      } catch (e) {
        if (generationRef.current !== myGeneration) {
          return false;
        }
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setPending(false);
      }
    },
    [chat, enableThinking, writer],
  );

  return {
    generateAndApply,
    pending,
    error,
    lastRawResponse,
    streamingAssistantText,
    streamingReasoningText,
    reset,
  };
}
