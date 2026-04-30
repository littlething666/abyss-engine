import { v4 as uuid } from 'uuid';

import { topicRefKey } from '@/lib/topicRef';
import { appEventBus } from '@/infrastructure/eventBus';
import type { IChatCompletionsRepository } from '@/types/llm';
import type { IDeckContentWriter, IDeckRepository } from '@/types/repository';
import {
  resolveEnableReasoningForSurface,
  resolveEnableStreamingForSurface,
  resolveModelForSurface,
} from '@/infrastructure/llmInferenceSurfaceProviders';

import { buildTopicMiniGameCardsMessages } from '../messages/buildTopicMiniGameCardsMessages';
import { buildTopicStudyCardsMessages } from '../messages/buildTopicStudyCardsMessages';
import { buildTopicTheoryMessages } from '../messages/buildTopicTheoryMessages';
import { parseTopicCardsPayload } from '../parsers/parseTopicCardsPayload';
import { parseTopicTheoryPayload, type ParsedTopicTheoryPayload } from '../parsers/parseTopicTheoryPayload';
import { FIRECRAWL_TOPIC_GROUNDING_POLICY, buildOpenRouterWebSearchTools } from '../grounding/groundingPolicy';
import { validateGroundingSources } from '../grounding/validateGroundingSources';
import { runContentGenerationJob } from '../runContentGenerationJob';
import { useContentGenerationStore } from '../contentGenerationStore';
import { topicStudyContentReady } from '../topicStudyContentReady';
import { useCrystalContentCelebrationStore } from '@/store/crystalContentCelebrationStore';
import { loadTheoryPayloadFromTopicDetails } from './loadTheoryPayloadFromTopicDetails';
import type { TopicGenerationStage } from './topicGenerationStage';

export type { TopicGenerationStage } from './topicGenerationStage';

export interface RunTopicGenerationPipelineParams {
  chat: IChatCompletionsRepository;
  deckRepository: IDeckRepository;
  writer: IDeckContentWriter;
  subjectId: string;
  topicId: string;
  enableReasoning?: boolean;
  signal?: AbortSignal;
  /** When false (default), a full pipeline skips if study-ready content already exists. */
  forceRegenerate?: boolean;
  /** Which segment to run; default `full` runs theory → study cards → mini-games. */
  stage?: TopicGenerationStage;
  /** When retrying a full pipeline, resume from this stage onward (skip earlier stages). */
  resumeFromStage?: TopicGenerationStage;
  /** If this pipeline is a retry, the ID of the original pipeline or job. */
  retryOf?: string;
}

function pipelineShellLabel(stage: TopicGenerationStage, topicTitle: string): string {
  switch (stage) {
    case 'theory':
      return `Generate · Theory · ${topicTitle}`;
    case 'study-cards':
      return `Generate · Study cards · ${topicTitle}`;
    case 'mini-games':
      return `Generate · Mini-games · ${topicTitle}`;
    case 'full':
      return `Generate · Full · ${topicTitle}`;
  }
}

/** Ordered list of stages within a full pipeline. */
const FULL_PIPELINE_STAGES: Exclude<TopicGenerationStage, 'full'>[] = [
  'theory',
  'study-cards',
  'mini-games',
];

export async function runTopicGenerationPipeline(
  params: RunTopicGenerationPipelineParams,
): Promise<{ ok: boolean; pipelineId: string; error?: string; skipped?: boolean }> {
  const {
    chat,
    deckRepository,
    writer,
    subjectId,
    topicId,
    enableReasoning = resolveEnableReasoningForSurface('topicContent'),
    signal,
    forceRegenerate = false,
    stage = 'full',
    resumeFromStage,
    retryOf,
  } = params;
  const model = resolveModelForSurface('topicContent');
  const enableStreaming = resolveEnableStreamingForSurface('topicContent');
  const store = useContentGenerationStore.getState();

  const pipelineId = uuid();
  const pipelineAc = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => pipelineAc.abort(), { once: true });
  }

  // Topic label used by any terminal lifecycle event this run emits. Falls
  // back to the topicId until the graph node is resolved; once located it is
  // replaced with the human-readable title.
  let topicLabel = topicId;

  // Sole emission point for `topic-content:generation-{completed,failed}`
  // lifecycle events on this run. Auto-skipped runs (study-ready content
  // already exists) intentionally produce no event — there is no fresh
  // result for mentor consumers or telemetry to surface.
  const finalize = (
    r: { ok: boolean; pipelineId: string; error?: string; skipped?: boolean },
  ) => {
    if (!r.skipped) {
      if (r.ok) {
        appEventBus.emit('topic-content:generation-completed', {
          subjectId,
          topicId,
          topicLabel,
          pipelineId: r.pipelineId,
          stage,
        });
      } else {
        appEventBus.emit('topic-content:generation-failed', {
          subjectId,
          topicId,
          topicLabel,
          pipelineId: r.pipelineId,
          stage,
          errorMessage: r.error ?? 'Topic content generation failed',
        });
      }
    }
    return r;
  };

  const graph = await deckRepository.getSubjectGraph(subjectId);
  const node = graph.nodes.find((n) => n.topicId === topicId);
  if (!node) {
    return finalize({
      ok: false,
      pipelineId,
      error: `Topic "${topicId}" not found in subject graph`,
    });
  }
  topicLabel = node.title;

  const [details, cards] = await Promise.all([
    deckRepository.getTopicDetails(subjectId, topicId),
    deckRepository.getTopicCards(subjectId, topicId),
  ]);

  const shouldAutoSkip =
    !forceRegenerate && stage === 'full' && !resumeFromStage && topicStudyContentReady(details, cards);
  if (shouldAutoSkip) {
    return finalize({ ok: true, pipelineId: '', skipped: true });
  }

  const manif