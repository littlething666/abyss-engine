import { useEffect, useRef } from 'react';

import type { ProgressionEventPayload } from '@/features/progression/events';
import { runExpansionJob } from '@/features/contentGeneration';
import { deckRepository, deckWriter } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';

/**
 * Listens for crystal-level-up events and dispatches expansion jobs
 * through the unified content generation system.
 */
export function useCrystalLevelExpansionListener(): void {
  const activeJobsRef = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const handler = (ev: Event) => {
      const { topicId, nextLevel } = (ev as CustomEvent<ProgressionEventPayload<'crystal-level-up'>>).detail;
      if (nextLevel < 2 || nextLevel > 3) return;

      const prev = activeJobsRef.current.get(topicId);
      prev?.abort();

      const ac = new AbortController();
      activeJobsRef.current.set(topicId, ac);

      void runExpansionJob({
        chat: getChatCompletionsRepositoryForSurface('topicContent'),
        deckRepository,
        writer: deckWriter,
        topicId,
        nextLevel,
        enableThinking: false,
        signal: ac.signal,
      }).finally(() => {
        activeJobsRef.current.delete(topicId);
      });
    };

    window.addEventListener('abyss-progression-crystal-level-up', handler);
    return () => window.removeEventListener('abyss-progression-crystal-level-up', handler);
  }, []);

  useEffect(() => {
    return () => {
      for (const ac of activeJobsRef.current.values()) ac.abort();
    };
  }, []);
}
