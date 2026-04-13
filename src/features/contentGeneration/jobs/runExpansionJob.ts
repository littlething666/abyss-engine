import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';
import { resolveModelForSurface } from '@/infrastructure/llmInferenceSurfaceProviders';
import { ensureGlobalCardIdPrefix } from '@/lib/cardIdUtils';

import { buildTopicExpansionCardsMessages } from '../messages/buildTopicExpansionCardsMessages';
import { parseTopicCardsPayload } from '../parsers/parseTopicCardsPayload';
import { runContentGenerationJob } from '../runContentGenerationJob';

export interface RunExpansionJobParams {
  chat: IChatCompletionsRepository;
  deckRepository: IDeckRepository;
  writer: IDeckContentWriter;
  /** Subject that owns the topic. Callers must provide this directly. */
  subjectId: string;
  topicId: string;
  nextLevel: number;
  enableThinking: boolean;
  signal?: AbortSignal;
}

export async function runExpansionJob(
  params: RunExpansionJobParams,
): Promise<{ ok: boolean; jobId?: string; error?: string; skipped?: boolean }> {
  const { chat, deckRepository, writer, subjectId, topicId, nextLevel, enableThinking, signal } = params;

  if (nextLevel < 2 || nextLevel > 3) {
    return { ok: true, skipped: true };
  }

  const difficulty = nextLevel;

  const details = await deckRepository.getTopicDetails(subjectId, topicId);
  const bucket = details.coreQuestionsByDifficulty?.[difficulty as 1 | 2 | 3];
  if (!bucket?.length) {
    return { ok: false, error: `No syllabus questions for difficulty ${difficulty}` };
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
    parseOutput: async (raw) => {
      const parsed = parseTopicCardsPayload(raw);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error, parseError: parsed.error };
      }
      return { ok: true, data: parsed.cards.map((c) => ({ ...c, difficulty })) };
    },
    persistOutput: async (normalized) => {
      const prefixed = ensureGlobalCardIdPrefix(normalized, subjectId, topicId);
      await writer.appendTopicCards(subjectId, topicId, prefixed);
    },
  });

  return { ok: result.ok, jobId: result.jobId, error: result.error };
}
