import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';
import { resolveModelForSurface } from '@/infrastructure/llmInferenceSurfaceProviders';

import { buildTopicExpansionCardsMessages } from '../messages/buildTopicExpansionCardsMessages';
import { parseTopicCardsPayload } from '../parsers/parseTopicCardsPayload';
import { runContentGenerationJob } from '../runContentGenerationJob';

export interface RunExpansionJobParams {
  chat: IChatCompletionsRepository;
  deckRepository: IDeckRepository;
  writer: IDeckContentWriter;
  subjectId: string;
  topicId: string;
  nextLevel: number;
  enableThinking: boolean;
  signal?: AbortSignal;
  /** If this job is a retry, the ID of the original job. */
  retryOf?: string;
}

export async function runExpansionJob(
  params: RunExpansionJobParams,
): Promise<{ ok: boolean; jobId?: string; error?: string; skipped?: boolean }> {
  const { chat, deckRepository, writer, subjectId, topicId, nextLevel, enableThinking, signal, retryOf } = params;

  // UPDATED: was (nextLevel < 2 || nextLevel > 3), now L1 through L3.
  // L1 level-up creates difficulty 2, L2 creates diff 3, L3 creates diff 4.
  if (nextLevel < 1 || nextLevel > 3) {
    return { ok: true, skipped: true };
  }

  // Difficulty of cards to generate = nextLevel + 1
  // (L1 -> diff 2, L2 -> diff 3, L3 -> diff 4)
  const difficulty = nextLevel + 1;

  const details = await deckRepository.getTopicDetails(subjectId, topicId);
  // For difficulty 4, coreQuestionsByDifficulty only has keys 1-3.
  // Fall back to bucket 3 for difficulty 4.
  const bucketKey = Math.min(difficulty, 3) as 1 | 2 | 3;
  const bucket = details.coreQuestionsByDifficulty?.[bucketKey];
  if (!bucket?.length) {
    return { ok: false, error: `No syllabus questions for difficulty bucket ${bucketKey}` };
  }

  const manifest = await deckRepository.getManifest();
  const subjectRow = manifest.subjects.find((s) => s.id === subjectId);
  const contentBrief = subjectRow?.metadata?.strategy?.content?.contentBrief?.trim() || undefined;

  const graph = await deckRepository.getSubjectGraph(subjectId);
  const node = graph.nodes.find((n) => n.topicId === topicId);
  const topicTitle = node?.title ?? details.title;
  const model = resolveModelForSurface('topicContent');

  const theoryExcerpt =
    details.theory.trim().length > 12000
      ? `${details.theory.trim().slice(0, 12000)}\n\n…`
      : details.theory.trim();

  const syllabusQuestions = bucket.map((q, i) => `${i + 1}. ${q}`).join('\n');

  const result = await runContentGenerationJob({
    kind: 'topic-expansion-cards',
    label: `Expansion L${nextLevel} — ${topicTitle}`,
    pipelineId: null,
    subjectId,
    topicId,
    chat,
    model,
    messages: buildTopicExpansionCardsMessages({
      topicId,
      topicTitle,
      theoryExcerpt,
      syllabusQuestions,
      difficulty,
      contentBrief,
    }),
    enableThinking,
    externalSignal: signal,
    retryOf,
    metadata: { nextLevel },
    parseOutput: async (raw) => {
      const parsed = parseTopicCardsPayload(raw);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error, parseError: parsed.error };
      }
      return { ok: true, data: parsed.cards.map((c) => ({ ...c, difficulty })) };
    },
    persistOutput: async (normalized) => {
      await writer.appendTopicCards(subjectId, topicId, normalized);
    },
  });

  return { ok: result.ok, jobId: result.jobId, error: result.error };
}
