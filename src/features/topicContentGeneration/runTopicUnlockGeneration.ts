import { resolveModelForSurface } from '@/infrastructure/llmInferenceSurfaceProviders';
import type { ChatMessage, IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';

import { buildTopicMiniGameCardsMessages } from './buildTopicMiniGameCardsMessages';
import { buildTopicStudyCardsMessages } from './buildTopicStudyCardsMessages';
import { buildTopicTheoryMessages } from './buildTopicTheoryMessages';

import { parseTopicCardsPayload } from './parseTopicCardsPayload';
import { parseTopicTheoryPayload } from './parseTopicTheoryPayload';
import { streamChatAccumulate } from './streamChatAccumulate';
import { useContentGenerationStore } from './contentGenerationStore';

function stringifyChatMessages(messages: ChatMessage[]): string {
  return JSON.stringify(messages, null, 2);
}

export interface RunTopicUnlockGenerationParams {
  chat: IChatCompletionsRepository;
  deckRepository: IDeckRepository;
  writer: IDeckContentWriter;
  subjectId: string;
  topicId: string;
  enableThinking: boolean;
  signal?: AbortSignal;
}

export async function runTopicUnlockGeneration(
  params: RunTopicUnlockGenerationParams,
): Promise<{ ok: boolean; error?: string }> {
  const { chat, deckRepository, writer, subjectId, topicId, enableThinking, signal } = params;
  const model = resolveModelForSurface('topicContent');
  const { setPhase, resetGenerationIoLog, patchGenerationIoLog } = useContentGenerationStore.getState();

  try {
    const graph = await deckRepository.getSubjectGraph(subjectId);
    const node = graph.nodes.find((n) => n.topicId === topicId);
    if (!node) {
      const err = `Topic "${topicId}" not found in subject graph`;
      resetGenerationIoLog(topicId, { subjectId, topicId, startedAt: Date.now() });
      patchGenerationIoLog(topicId, { finishedAt: Date.now(), ok: false, finalError: err });
      return { ok: false, error: err };
    }

    resetGenerationIoLog(topicId, { subjectId, topicId, startedAt: Date.now() });

    const manifest = await deckRepository.getManifest();
    const subject = manifest.subjects.find((s) => s.id === subjectId);
    const subjectTitle = subject?.name ?? graph.title;

    setPhase(topicId, 'theory');
    const theoryMessages = buildTopicTheoryMessages({
      subjectTitle,
      topicId,
      topicTitle: node.title,
      learningObjective: node.learningObjective,
    });
    const theoryRaw = await streamChatAccumulate({
      chat,
      model,
      messages: theoryMessages,
      enableThinking,
      signal,
    });

    const theoryParsed = parseTopicTheoryPayload(theoryRaw);
    patchGenerationIoLog(topicId, {
      theory: {
        input: stringifyChatMessages(theoryMessages),
        output: theoryRaw,
        error: theoryParsed.ok ? undefined : theoryParsed.error,
      },
    });
    if (!theoryParsed.ok) {
      setPhase(topicId, null);
      const err = theoryParsed.error;
      patchGenerationIoLog(topicId, { finishedAt: Date.now(), ok: false, finalError: err });
      return { ok: false, error: err };
    }

    const td = theoryParsed.data;
    await writer.upsertTopicDetails({
      topicId,
      title: node.title,
      subjectId,
      coreConcept: td.coreConcept,
      theory: td.theory,
      keyTakeaways: td.keyTakeaways,
      coreQuestionsByDifficulty: td.coreQuestionsByDifficulty,
    });

    const difficulty1Questions = td.coreQuestionsByDifficulty[1].map((q, i) => `${i + 1}. ${q}`).join('\n');

    setPhase(topicId, 'study_cards');
    const studyMessages = buildTopicStudyCardsMessages({
      topicId,
      topicTitle: node.title,
      theory: td.theory,
      difficulty1Questions,
    });
    const studyRaw = await streamChatAccumulate({
      chat,
      model,
      messages: studyMessages,
      enableThinking,
      signal,
    });

    if (signal?.aborted) {
      setPhase(topicId, null);
      throw new DOMException('Aborted', 'AbortError');
    }

    const studyParsed = parseTopicCardsPayload(studyRaw);
    patchGenerationIoLog(topicId, {
      studyCards: {
        input: stringifyChatMessages(studyMessages),
        output: studyRaw,
        error: studyParsed.ok ? undefined : studyParsed.error,
      },
    });
    if (!studyParsed.ok) {
      setPhase(topicId, null);
      const err = studyParsed.error;
      patchGenerationIoLog(topicId, { finishedAt: Date.now(), ok: false, finalError: err });
      return { ok: false, error: err };
    }

    setPhase(topicId, 'saving');
    await writer.upsertTopicCards(subjectId, topicId, studyParsed.cards);

    setPhase(topicId, 'mini_games');
    const miniMessages = buildTopicMiniGameCardsMessages({
      topicId,
      topicTitle: node.title,
      theory: td.theory,
      difficulty1Questions,
    });
    const miniRaw = await streamChatAccumulate({
      chat,
      model,
      messages: miniMessages,
      enableThinking,
      signal,
    });

    if (signal?.aborted) {
      setPhase(topicId, null);
      throw new DOMException('Aborted', 'AbortError');
    }

    const miniParsed = parseTopicCardsPayload(miniRaw);
    patchGenerationIoLog(topicId, {
      miniGames: {
        input: stringifyChatMessages(miniMessages),
        output: miniRaw,
        error: miniParsed.ok ? undefined : miniParsed.error,
      },
    });
    if (!miniParsed.ok) {
      setPhase(topicId, null);
      const err = miniParsed.error;
      patchGenerationIoLog(topicId, { finishedAt: Date.now(), ok: false, finalError: err });
      return { ok: false, error: err };
    }

    setPhase(topicId, 'saving');
    await writer.appendTopicCards(subjectId, topicId, miniParsed.cards);

    setPhase(topicId, null);
    patchGenerationIoLog(topicId, { finishedAt: Date.now(), ok: true, finalError: undefined });
    return { ok: true };
  } catch (e) {
    setPhase(params.topicId, null);
    const err =
      e instanceof DOMException && e.name === 'AbortError'
        ? 'Generation aborted'
        : e instanceof Error
          ? e.message
          : String(e);
    patchGenerationIoLog(params.topicId, { finishedAt: Date.now(), ok: false, finalError: err });
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'Generation aborted' };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
