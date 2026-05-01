import { v4 as uuid } from 'uuid';

import { telemetry } from '@/features/telemetry';
import { topicRefKey } from '@/lib/topicRef';
import { PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION } from '@/types/pipelineFailureDebug';
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
import { buildShellPipelineFailureBundle } from '../debug/buildPipelineFailureDebugBundle';
import { formatPipelineFailureMarkdown } from '../debug/formatPipelineFailureMarkdown';
import { logPipelineFailure } from '../debug/logPipelineFailure';
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

type PipelineSettlement =
  | { ok: true; pipelineId: string }
  | { ok: false; pipelineId: string; error: string };

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
    const shellStartedAt = Date.now();
    const shellBundle = buildShellPipelineFailureBundle({
      schemaVersion: PIPELINE_FAILURE_DEBUG_SCHEMA_VERSION,
      pipelineId,
      subjectId,
      topicId,
      topicLabel: topicId,
      pipelineStage: stage,
      failedStage: null,
      retryOf: retryOf ?? null,
      startedAt: shellStartedAt,
      finishedAt: Date.now(),
      error: `Topic "${topicId}" not found in subject graph`,
    });
    logPipelineFailure(formatPipelineFailureMarkdown(shellBundle));
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
    // Auto-skip is intentionally telemetry-free: no work was performed.
    // The bus event `topic-content:generation-requested` already accounts
    // for the request side, so skip rate is computable as
    // (requested − generation-started).
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

  // ── Phase 3 telemetry: pipeline lifecycle starts here ────────────────
  // `runTopicGenerationPipeline` is the canonical stage source —
  // analytics never infers stage transitions from downstream LLM-job
  // events. Every stage transition flows through `wrapStage` below.
  const pipelineStartedAt = Date.now();
  telemetry.log(
    'topic-content:generation-started',
    {
      pipelineId,
      subjectId,
      topicId,
      stage,
      forceRegenerate,
      ...(resumeFromStage ? { resumeFromStage } : {}),
    },
    { subjectId, topicId },
  );

  /**
   * Wraps a single stage execution with telemetry start/end emit and
   * timing. Error strings from failed stages are forwarded raw — no
   * heuristic parsing — per the Phase 3 plan ("Capture raw emitted
   * error messages for first internal milestone").
   */
  const wrapStage = async (
    stageName: 'theory' | 'study-cards' | 'mini-games',
    run: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const stageStartedAt = Date.now();
    telemetry.log(
      'topic-content:stage-started',
      { pipelineId, subjectId, topicId, stage: stageName },
      { subjectId, topicId },
    );
    const result = await run();
    const durationMs = Date.now() - stageStartedAt;
    if (result.ok) {
      telemetry.log(
        'topic-content:stage-completed',
        { pipelineId, subjectId, topicId, stage: stageName, durationMs },
        { subjectId, topicId },
      );
    } else {
      telemetry.log(
        'topic-content:stage-failed',
        {
          pipelineId,
          subjectId,
          topicId,
          stage: stageName,
          error: result.error,
          durationMs,
        },
        { subjectId, topicId },
      );
    }
    return result;
  };

  let theoryData: ParsedTopicTheoryPayload | undefined;

  const runTheoryJob = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const theoryResult = await runContentGenerationJob({
      kind: 'topic-theory',
      label: `Theory — ${node.title}`,
      pipelineId,
      subjectId,
      topicId,
      llmSurfaceId: 'topicContent',
      failureDebugContext: {
        topicLabel: node.title,
        pipelineStage: stage,
        failedStage: 'theory',
      },
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
      failureDebugContext: {
        topicLabel: node.title,
        pipelineStage: stage,
        failedStage: 'study-cards',
      },
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
      failureDebugContext: {
        topicLabel: node.title,
        pipelineStage: stage,
        failedStage: 'mini-games',
      },
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

  // Run the body inside an inner async IIFE so every exit path funnels
  // through a single `pipelineResult` value — that makes the
  // `topic-content:generation-completed` emission the only return-time
  // side effect, regardless of which stage path the pipeline took.
  const pipelineResult: PipelineSettlement = await (async (): Promise<PipelineSettlement> => {
    try {
      if (stage === 'theory') {
        const t = await wrapStage('theory', runTheoryJob);
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
        const s = await wrapStage('study-cards', () => runStudyJob(theory));
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
        const m = await wrapStage('mini-games', () => runMiniJob(theory));
        return m.ok ? { ok: true, pipelineId } : { ok: false, pipelineId, error: m.error };
      }

      // ── full pipeline (with optional resume) ──────────────────────────
      const resumeIdx = resumeFromStage && resumeFromStage !== 'full'
        ? FULL_PIPELINE_STAGES.indexOf(resumeFromStage)
        : 0;
      const startIdx = Math.max(0, resumeIdx);

      // Stage 0: theory
      if (startIdx <= 0) {
        const theoryStep = await wrapStage('theory', runTheoryJob);
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
        const studyStep = await wrapStage('study-cards', () => runStudyJob(theory));
        if (!studyStep.ok) {
          return { ok: false, pipelineId, error: studyStep.error };
        }
      }

      // Stage 2: mini-games
      if (startIdx <= 2) {
        const miniStep = await wrapStage('mini-games', () => runMiniJob(theory));
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
  })();

  // ── Phase 3 telemetry: lifecycle close-out ───────────────────────────
  const totalDurationMs = Date.now() - pipelineStartedAt;
  telemetry.log(
    'topic-content:generation-completed',
    {
      pipelineId,
      subjectId,
      topicId,
      stage,
      ok: pipelineResult.ok,
      durationMs: totalDurationMs,
      ...(pipelineResult.ok ? {} : { error: pipelineResult.error }),
    },
    { subjectId, topicId },
  );

  return finalize({
    ok: pipelineResult.ok,
    pipelineId: pipelineResult.pipelineId,
    ...(!pipelineResult.ok ? { error: pipelineResult.error } : {}),
    skipped: false,
  });
}
