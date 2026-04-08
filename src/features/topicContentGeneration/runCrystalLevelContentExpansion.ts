import { resolveModelForSurface } from '@/infrastructure/llmInferenceSurfaceProviders';
import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';

import { buildTopicExpansionCardsMessages } from './buildTopicExpansionCardsMessages';
import { findSubjectIdForTopic } from './findSubjectIdForTopic';
import { parseTopicCardsPayload } from './parseTopicCardsPayload';
import { streamChatAccumulate } from './streamChatAccumulate';

export interface RunCrystalLevelContentExpansionParams {
  chat: IChatCompletionsRepository;
  deckRepository: IDeckRepository;
  writer: IDeckContentWriter;
  topicId: string;
  /** New crystal level; generates matching difficulty when 2 or 3. */
  nextLevel: number;
  enableThinking: boolean;
  signal?: AbortSignal;
}

function theoryExcerpt(theory: string, maxLen = 12000): string {
  const t = theory.trim();
  if (t.length <= maxLen) {
    return t;
  }
  return `${t.slice(0, maxLen)}\n\n…`;
}

/**
 * Appends cards for difficulty `nextLevel` (2 or 3) using the permanent syllabus bucket.
 * No-op for other levels.
 */
export async function runCrystalLevelContentExpansion(
  params: RunCrystalLevelContentExpansionParams,
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const { chat, deckRepository, writer, topicId, nextLevel, enableThinking, signal } = params;

  if (nextLevel < 2 || nextLevel > 3) {
    return { ok: true, skipped: true };
  }

  const difficulty = nextLevel;
  const subjectId = await findSubjectIdForTopic(deckRepository, topicId);
  if (!subjectId) {
    return { ok: false, error: `No subject found for topic "${topicId}"` };
  }

  const details = await deckRepository.getTopicDetails(subjectId, topicId);
  const bucket = details.coreQuestionsByDifficulty?.[difficulty as 1 | 2 | 3];
  if (!bucket?.length) {
    return { ok: false, error: `No syllabus questions for difficulty ${difficulty}` };
  }

  const graph = await deckRepository.getSubjectGraph(subjectId);
  const node = graph.nodes.find((n) => n.topicId === topicId);
  const topicTitle = node?.title ?? details.title;

  const model = resolveModelForSurface('topicContent');
  const syllabusQuestions = bucket.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const raw = await streamChatAccumulate({
    chat,
    model,
    messages: buildTopicExpansionCardsMessages({
      topicId,
      topicTitle,
      theoryExcerpt: theoryExcerpt(details.theory),
      syllabusQuestions,
      difficulty,
    }),
    enableThinking,
    signal,
  });

  const parsed = parseTopicCardsPayload(raw);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const normalized = parsed.cards.map((c) => ({
    ...c,
    difficulty,
  }));

  await writer.appendTopicCards(subjectId, topicId, normalized);
  return { ok: true };
}
