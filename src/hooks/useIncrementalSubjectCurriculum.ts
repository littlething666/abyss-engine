import { useCallback, useRef, useState } from 'react';

import {
  applyCurriculumGraphToIndexedDb,
  validateCurriculumGraph,
  type CurriculumGraphExpectations,
} from '@/features/ascentWeaver';
import {
  buildIncrementalSubjectMessages,
  parseIncrementalSubjectResponse,
} from '@/features/incrementalGeneration';
import type { Subject } from '@/types/core';
import { resolveModelForSurface } from '@/infrastructure/llmInferenceSurfaceProviders';
import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter } from '@/types/repository';

export const INCREMENTAL_CURRICULUM_TOPIC_COUNT = 10;
export const INCREMENTAL_CURRICULUM_MAX_TIER = 2;
export const INCREMENTAL_CURRICULUM_TOPICS_PER_TIER = 5;

export interface IncrementalSubjectGenerateInput {
  subjectId: string;
  learningPrompt: string;
}

export interface UseIncrementalSubjectCurriculumParams {
  chat: IChatCompletionsRepository;
  writer: IDeckContentWriter;
  enableThinking: boolean;
}

export function useIncrementalSubjectCurriculum({
  chat,
  writer,
  enableThinking,
}: UseIncrementalSubjectCurriculumParams) {
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
    async (input: IncrementalSubjectGenerateInput): Promise<boolean> => {
      const subjectId = input.subjectId.trim();
      const themeId = subjectId;
      const model = resolveModelForSurface('ascentWeaver');
      const myGeneration = ++generationRef.current;

      setPending(true);
      setError(null);
      setLastRawResponse(null);
      setStreamingAssistantText('');
      setStreamingReasoningText(null);

      const expectations: CurriculumGraphExpectations = {
        subjectId,
        themeId,
        topicCount: INCREMENTAL_CURRICULUM_TOPIC_COUNT,
        maxTier: INCREMENTAL_CURRICULUM_MAX_TIER,
        topicsPerTier: INCREMENTAL_CURRICULUM_TOPICS_PER_TIER,
      };

      try {
        const messages = buildIncrementalSubjectMessages({
          subjectId,
          themeId,
          learningPrompt: input.learningPrompt,
        });
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

        const parsed = parseIncrementalSubjectResponse(contentAcc);
        if (!parsed.ok) {
          setError(parsed.error);
          return false;
        }

        const graph = {
          ...parsed.graph,
          subjectId,
          themeId,
        };

        const valid = validateCurriculumGraph(graph, expectations);
        if (!valid.ok) {
          setError(valid.error);
          return false;
        }

        const colorRaw = parsed.subject.color.trim();
        const color = colorRaw.startsWith('#') ? colorRaw : `#${colorRaw}`;

        const subject: Subject = {
          id: subjectId,
          name: parsed.subject.name.trim(),
          description: parsed.subject.description.trim(),
          color,
          geometry: parsed.subject.geometry ?? { gridTile: 'box' },
        };

        await applyCurriculumGraphToIndexedDb(writer, { subject, graph });

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
