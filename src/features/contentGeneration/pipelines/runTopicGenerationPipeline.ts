import { v4 as uuid } from 'uuid';

import { topicRefKey } from '@/lib/topicRef';
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

  const graph = await deckRepository.getSubjectGraph(subjectId);
  const node = graph.nodes.find((n) => n.topicId === topicId);
  if (!node) {
    return { ok: false, pipelineId, error: `Topic "${topicId}" not found in subject graph` };
  }

  const [details, cards] = await Promise.all([
    deckRepository.getTopicDetails(subjectId, topicId),
    deckRepository.getTopicCards(subjectId, topicId),
  ]);

  const shouldAutoSkip =
    !forceRegenerate && stage === 'full' && !resumeFromStage && topicStudyContentReady(details, cards);
  if (shouldAutoSkip) {
    return { ok: true, pipelineId: '', skipped: true };
  }

  const manifest = await deckRepository.getManifest({ includePregeneratedCurriculums: true });
  const subject = manifest.subjects.find((s) => s.id === subjectId);
  const subjectTitle = subject?.name ?? graph.title;
  const contentStrategy = subject?.metadata?.strategy?.content;
  const contentBrief = contentStrategy?.contentBrief?.trim() || undefined;

  const pipelineLabel = resumeFromStage
    ? `Retry · ${pipelineShellLabel(stage, node.title)}`
    : pipelineShellLabel(stage, node.title);

  store.registerPipeline(
    {
      id: pipelineId,
      label: pipelineLabel,
      createdAt: Date.now(),
      retryOf: retryOf ?? null,
    },
    pipelineAc,
  );

  let theoryData: ParsedTopicTheoryPayload | undefined;

  const runTheoryJob = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const theoryResult = await runContentGenerationJob({
      kind: 'topic-theory',
      label: `Theory — ${node.title}`,
      pipelineId,
      subjectId,
      topicId,
      llmSurfaceId: 'topicContent',
      chat,
      model,
      messages: buildTopicTheoryMessages({
        subjectTitle,
        topicId,
        topicTitle: node.title,
        learningObjective: node.learningObjective,
        contentBrief,
      }),
      enableReasoning,
      enableStreaming,
      tools: buildOpenRouterWebSearchTools(FIRECRAWL_TOPIC_GROUNDING_POLICY),
      externalSignal: pipelineAc.signal,
      parseOutput: async (raw, job) => {
        const providerMetadata = job.metadata?.provider as Record<string, unknown> | undefined;
        const parsed = parseTopicTheoryPayload(raw, {
          groundingPolicy: FIRECRAWL_TOPIC_GROUNDING_POLICY,
          providerMetadata,
          validateGroundingSources,
        });
        if (!parsed.ok) {
          return { ok: false, error: parsed.error, parseError: parsed.error };
        }
        useContentGenerationStore.getState().mergeJobMetadata(job.id, {
          grounding: {
            sourceCount: parsed.data.groundingSources.length,
            sources: parsed.data.groundingSources,
          },
        });
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
          groundingSources: data.groundingSources,
          miniGameAffordances: data.miniGameAffordances,
        });
      },
    });

    if (!theoryResult.ok) {
      return { ok: false, error: theoryResult.error ?? 'Theory job failed' };
    }
    return { ok: true };
  };

  const runStudyJob = async (theory: ParsedTopicTheoryPayload): Promise<{ ok: true } | { ok: false; error: string }> => {
    const targetDifficulty = 1;

    const studyResult = await runContentGenerationJob({
      kind: 'topic-study-cards',
      label: `Study cards — ${node.title}`,
      pipelineId,
      subjectId,
      topicId,
      llmSurfaceId: 'topicContent',
      chat,
      model,
      messages: buildTopicStudyCardsMessages({
        topicId,
        topicTitle: node.title,
        theory: theory.theory,
        targetDifficulty,
        syllabusQuestions: theory.coreQuestionsByDifficulty[targetDifficulty],
        contentStrategy,
        groundingSources: theory.groundingSources,
        contentBrief,
      }),
      enableReasoning,
      enableStreaming,
      externalSignal: pipelineAc.signal,
      parseOutput: async (raw, job) => {
        const parsed = parseTopicCardsPayload(raw, {
          groundingSources: theory.groundingSources,
        });
        if (parsed.qualityReport) {
          useContentGenerationStore.getState().mergeJobMetadata(job.id, {
            qualityReport: parsed.qualityReport,
            validationFailures: parsed.qualityReport.failures,
          });
        }
        if (!parsed.ok) {
          return { ok: false, error: parsed.error, parseError: parsed.error };
        }
        return { ok: true, data: parsed.cards };
      },
      persistOutput: async (c) => {
        await writer.upsertTopicCards(subjectId, topicId, c);
      },
    });

    if (!studyResult.ok) {
      return { ok: false, error: studyResult.error ?? 'Study cards job failed' };
    }
    return { ok: true };
  };

  const runMiniJob = async (theory: ParsedTopicTheoryPayload): Promise<{ ok: true } | { ok: false; error: string }> => {
    const targetDifficulty = 1;

    const miniResult = await runContentGenerationJob({
      kind: 'topic-mini-games',
      label: `Mini-games — ${node.title}`,
      pipelineId,
      subjectId,
      topicId,
      llmSurfaceId: 'topicContent',
      chat,
      model,
      messages: buildTopicMiniGameCardsMessages({
        topicId,
        topicTitle: node.title,
        theory: theory.theory,
        targetDifficulty,
        syllabusQuestions: theory.coreQuestionsByDifficulty[targetDifficulty],
        contentStrategy,
        groundingSources: theory.groundingSources,
        miniGameAffordances: theory.miniGameAffordances,
        contentBrief,
      }),
      enableReasoning,
      enableStreaming,
      externalSignal: pipelineAc.signal,
      parseOutput: async (raw, job) => {
        const parsed = parseTopicCardsPayload(raw, {
          groundingSources: theory.groundingSources,
        });
        if (parsed.qualityReport) {
          useContentGenerationStore.getState().mergeJobMetadata(job.id, {
            qualityReport: parsed.qualityReport,
            validationFailures: parsed.qualityReport.failures,
          });
        }
        if (!parsed.ok) {
          return { ok: false, error: parsed.error, parseError: parsed.error };
        }
        return { ok: true, data: parsed.cards };
      },
      persistOutput: async (c) => {
        await writer.appendTopicCards(subjectId, topicId, c);
      },
    });

    if (!miniResult.ok) {
      return { ok: false, error: miniResult.error ?? 'Mini-games job failed' };
    }
    return { ok: true };
  };

  /**
   * Loads theory data from the DB (for pipeline resume when theory stage was skipped).
   * Falls back to theoryData if it was already produced by runTheoryJob in this run.
   */
  const resolveTheoryData = (): ParsedTopicTheoryPayload => {
    if (theoryData) return theoryData;
    return loadTheoryPayloadFromTopicDetails(details);
  };

  try {
    if (stage === 'theory') {
      const t = await runTheoryJob();
      return t.ok ? { ok: true, pipelineId } : { ok: false, pipelineId, error: t.error };
    }

    if (stage === 'study-cards') {
      let theory: ParsedTopicTheoryPayload;
      try {
        theory = loadTheoryPayloadFromTopicDetails(details);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, pipelineId, error: message };
      }
      const s = await runStudyJob(theory);
      return s.ok ? { ok: true, pipelineId } : { ok: false, pipelineId, error: s.error };
    }

    if (stage === 'mini-games') {
      let theory: ParsedTopicTheoryPayload;
      try {
        theory = loadTheoryPayloadFromTopicDetails(details);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, pipelineId, error: message };
      }
      const m = await runMiniJob(theory);
      return m.ok ? { ok: true, pipelineId } : { ok: false, pipelineId, error: m.error };
    }

    // ── full pipeline (with optional resume) ──────────────────────────
    const resumeIdx = resumeFromStage && resumeFromStage !== 'full'
      ? FULL_PIPELINE_STAGES.indexOf(resumeFromStage)
      : 0;
    const startIdx = Math.max(0, resumeIdx);

    // Stage 0: theory
    if (startIdx <= 0) {
      const theoryStep = await runTheoryJob();
      if (!theoryStep.ok) {
        return { ok: false, pipelineId, error: theoryStep.error };
      }
    }

    // Resolve theory data (either from runTheoryJob or loaded from DB for resume)
    let theory: ParsedTopicTheoryPayload;
    try {
      theory = resolveTheoryData();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, pipelineId, error: `Cannot resume — theory not available: ${message}` };
    }

    // Stage 1: study-cards
    if (startIdx <= 1) {
      const studyStep = await runStudyJob(theory);
      if (!studyStep.ok) {
        return { ok: false, pipelineId, error: studyStep.error };
      }
    }

    // Stage 2: mini-games
    if (startIdx <= 2) {
      const miniStep = await runMiniJob(theory);
      if (!miniStep.ok) {
        return { ok: false, pipelineId, error: miniStep.error };
      }
    }

    if (stage === 'full') {
      useCrystalContentCelebrationStore
        .getState()
        .markPendingFromFullTopicUnlock(topicRefKey({ subjectId, topicId }));
    }

    return { ok: true, pipelineId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, pipelineId, error: message };
  }
}
