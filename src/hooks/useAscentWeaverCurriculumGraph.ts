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
}

export function useAscentWeaverCurriculumGraph({ chat, writer }: UseAscentWeaverCurriculumGraphParams) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRawResponse, setLastRawResponse] = useState<string | null>(null);
  const [streamingAssistantText, setStreamingAssistantText] = useState('');
  const generationRef = useRef(0);

  const reset = useCallback(() => {
    generationRef.current += 1;
    setError(null);
    setLastRawResponse(null);
    setStreamingAssistantText('');
  }, []);

  const generateAndApply = useCallback(
    async (input: AscentWeaverGenerateInput): Promise<boolean> => {
      const model = resolveModelForSurface('ascentWeaver');
      const myGeneration = ++generationRef.current;

      setPending(true);
      setError(null);
      setLastRawResponse(null);
      setStreamingAssistantText('');

      try {
        const messages = buildCurriculumGraphMessages(input.promptParams);
        let acc = '';
        for await (const chunk of chat.streamChat({ model, messages })) {
          if (generationRef.current !== myGeneration) {
            return false;
          }
          acc += chunk;
          setStreamingAssistantText(acc);
        }

        if (generationRef.current !== myGeneration) {
          return false;
        }

        setLastRawResponse(acc);

        const parsed = parseSubjectGraphResponse(acc);
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
    [chat, writer],
  );

  return {
    generateAndApply,
    pending,
    error,
    lastRawResponse,
    streamingAssistantText,
    reset,
  };
}
