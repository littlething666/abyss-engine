import { v4 as uuid } from 'uuid';

import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';
import { resolveModelForSurface } from '@/infrastructure/llmInferenceSurfaceProviders';

import { buildTopicMiniGameCardsMessages } from '../messages/buildTopicMiniGameCardsMessages';
import { buildTopicStudyCardsMessages } from '../messages/buildTopicStudyCardsMessages';
import { buildTopicTheoryMessages } from '../messages/buildTopicTheoryMessages';
import { parseTopicCardsPayload } from '../parsers/parseTopicCardsPayload';
import { parseTopicTheoryPayload, type ParsedTopicTheoryPayload } from '../parsers/parseTopicTheoryPayload';
import { runContentGenerationJob } from '../runContentGenerationJob';
import { useContentGenerationStore } from '../contentGenerationStore';

export interface RunTopicUnlockPipelineParams {
  chat: IChatCompletionsRepository;
  deckRepository: IDeckRepository;
  writer: IDeckContentWriter;
  subjectId: string;
  topicId: string;
  enableThinking: boolean;
  signal?: AbortSignal;
}

export async function runTopicUnlockPipeline(
  params: RunTopicUnlockPipelineParams,
): Promise<{ ok: boolean; pipelineId: string; error?: string }> {
  const { chat, deckRepository, writer, subjectId, topicId, enableThinking, signal } = params;
  const model = resolveModelForSurface('topicContent');
  const store = useContentGenerationStore.getState();

  const pipelineId = uuid();
  const pipelineAc = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => pipelineAc.abort(), { once: true });
  }

  const graph = await deckRepository.getSubjectGraph(subjectId);
  const node = graph.nodes.find((n) => n.topicId === topicId);
  if (!node) {
    return { ok: false, pipelineId, error: `Topic "${topicId}" not found in subject graph` };
  }

  const manifest = await deckRepository.getManifest();
  const subject = manifest.subjects.find((s) => s.id === subjectId);
  const subjectTitle = subject?.name ?? graph.title;

  store.registerPipeline(
    {
      id: pipelineId,
      label: `Unlock: ${node.title}`,
      createdAt: Date.now(),
    },
    pipelineAc,
  );

  let theoryData: ParsedTopicTheoryPayload | undefined;

  const theoryResult = await runContentGenerationJob({
    kind: 'topic-theory',
    label: `Theory — ${node.title}`,
    pipelineId,
    subjectId,
    topicId,
    chat,
    model,
    messages: buildTopicTheoryMessages({
      subjectTitle,
      topicId,
      topicTitle: node.title,
      learningObjective: node.learningObjective,
    }),
    enableThinking,
    externalSignal: pipelineAc.signal,
    parseOutput: async (raw) => {
      const parsed = parseTopicTheoryPayload(raw);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error, parseError: parsed.error };
      }
      return { ok: true, data: parsed.data };
    },
    persistOutput: async (data) => {
      theoryData = data;
      await writer.upsertTopicDetails({
        topicId,
        title: node.title,
        subjectId,
        coreConcept: data.coreConcept,
        theory: data.theory,
        keyTakeaways: data.keyTakeaways,
        coreQuestionsByDifficulty: data.coreQuestionsByDifficulty,
      });
    },
  });

  if (!theoryResult.ok) {
    return { ok: false, pipelineId, error: theoryResult.error };
  }

  const theory = theoryData!;

  const difficulty1Questions = theory.coreQuestionsByDifficulty[1]
    .map((q: string, i: number) => `${i + 1}. ${q}`)
    .join('\n');

  const studyResult = await runContentGenerationJob({
    kind: 'topic-study-cards',
    label: `Study cards — ${node.title}`,
    pipelineId,
    subjectId,
    topicId,
    chat,
    model,
    messages: buildTopicStudyCardsMessages({
      topicId,
      topicTitle: node.title,
      theory: theory.theory,
      difficulty1Questions,
    }),
    enableThinking,
    externalSignal: pipelineAc.signal,
    parseOutput: async (raw) => {
      const parsed = parseTopicCardsPayload(raw);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error, parseError: parsed.error };
      }
      return { ok: true, data: parsed.cards };
    },
    persistOutput: async (cards) => {
      await writer.upsertTopicCards(subjectId, topicId, cards);
    },
  });

  if (!studyResult.ok) {
    return { ok: false, pipelineId, error: studyResult.error };
  }

  const miniResult = await runContentGenerationJob({
    kind: 'topic-mini-games',
    label: `Mini-games — ${node.title}`,
    pipelineId,
    subjectId,
    topicId,
    chat,
    model,
    messages: buildTopicMiniGameCardsMessages({
      topicId,
      topicTitle: node.title,
      theory: theory.theory,
      difficulty1Questions,
    }),
    enableThinking,
    externalSignal: pipelineAc.signal,
    parseOutput: async (raw) => {
      const parsed = parseTopicCardsPayload(raw);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error, parseError: parsed.error };
      }
      return { ok: true, data: parsed.cards };
    },
    persistOutput: async (cards) => {
      await writer.appendTopicCards(subjectId, topicId, cards);
    },
  });

  if (!miniResult.ok) {
    return { ok: false, pipelineId, error: miniResult.error };
  }

  return { ok: true, pipelineId };
}
