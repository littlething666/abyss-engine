'use client';

import { useEffect, useRef } from 'react';

import type { ProgressionEventPayload } from '@/features/progression/events';
import {
  runCrystalLevelContentExpansion,
  useContentGenerationStore,
} from '@/features/topicContentGeneration';
import { deckRepository, deckWriter } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';

/**
 * Listens for crystal level-ups and appends difficulty 2/3 cards in the background (Gemini `topicContent` surface).
 */
export function CrystalLevelExpansionBridge() {
  const abortByTopicRef = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<ProgressionEventPayload<'crystal-level-up'>>).detail;
      const { topicId, nextLevel } = detail;
      if (nextLevel < 2 || nextLevel > 3) {
        return;
      }

      const prev = abortByTopicRef.current.get(topicId);
      prev?.abort();
      const ac = new AbortController();
      abortByTopicRef.current.set(topicId, ac);

      const gen = useContentGenerationStore.getState();
      gen.beginCrystalExpansion(`Background: expanding topic ${topicId} (difficulty ${nextLevel})`);

      void (async () => {
        const result = await runCrystalLevelContentExpansion({
          chat: getChatCompletionsRepositoryForSurface('topicContent'),
          deckRepository,
          writer: deckWriter,
          topicId,
          nextLevel,
          enableThinking: false,
          signal: ac.signal,
        });

        if (result.skipped) {
          gen.finishCrystalExpansion();
          abortByTopicRef.current.delete(topicId);
          return;
        }

        if (!result.ok) {
          gen.appendActivityTimeline(result.error ?? 'Expansion failed');
        } else {
          gen.appendActivityTimeline(`Finished expansion for ${topicId} (difficulty ${nextLevel})`);
        }
        gen.finishCrystalExpansion();
        abortByTopicRef.current.delete(topicId);
      })();
    };

    window.addEventListener('abyss-progression-crystal-level-up', handler);
    return () => window.removeEventListener('abyss-progression-crystal-level-up', handler);
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      for (const ac of abortByTopicRef.current.values()) {
        ac.abort();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return null;
}
