import { v4 as uuid } from 'uuid';

import type { Subject, SubjectGraph } from '@/types/core';
import type { ContentGenerationJob } from '@/types/contentGeneration';
import type { SubjectGenerationRequest, SubjectGenerationResult } from '@/types/generationOrchestrator';
import type { TopicLattice } from '@/types/topicLattice';
import { countManualRetryDepth, failureKeyForJob, runContentGenerationJob, useContentGenerationStore } from '@/features/contentGeneration';
import { appEventBus } from '@/infrastructure/eventBus';
import { resolveStrategy } from '../strategies/strategyResolver';
import { applyGraphToStorage } from '../graph/applyGraphToStorage';
import { assembleSubjectGraph } from '../graph/assembleSubjectGraph';
import { buildTopicLatticeMessages } from '../graph/topicLattice/buildTopicLatticeMessages';
import { parseTopicLatticeResponse } from '../graph/topicLattice/parseTopicLatticeResponse';
import { validateTopicLattice } from '../graph/topicLattice/validateTopicLattice';
import { buildPrereqWiringMessages } from '../graph/prereqWiring/buildPrereqWiringMessages';
import { parsePrereqWiringResponse } from '../graph/prereqWiring/parsePrereqWiringResponse';
import { validateGraph } from '../graph/validateGraph';
import type { PrereqEdgesCorrectionLog } from '../graph/prereqWiring/correctPrereqEdges';
import type { GenerationDependencies } from './types';

export interface SubjectGenerationOrchestrator {
  execute(request: SubjectGenerationRequest, deps: GenerationDependencies): Promise<SubjectGenerationResult>;
}

/** Stage B (prereq wiring) first-attempt temperature — deterministic structured JSON. */
const STAGE_B_FIRST_TEMPERATURE = 0.1;

const kebabTopicIdInQuotes = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function offendingTopicIdsFromError(error: string): string[] {
  const ids = new Set<string>();
  for (const m of error.matchAll(/"([a-z0-9-]+)"/g)) {
    const id = m[1];
    if (id && kebabTopicIdInQuotes.test(id)) ids.add(id);
  }
  return [...ids];
}

function jobDurationMs(job: ContentGenerationJob | undefined): number {
  if (!job) return 0;
  const end = job.finishedAt ?? Date.now();
  const start = job.startedAt ?? job.createdAt;
  if (start == null) return 0;
  return Math.max(0, end - start);
}

export function createSubjectGenerationOrchestrator(): SubjectGenerationOrchestrator {
  async function execute(
    request: SubjectGenerationRequest,
    deps: GenerationDependencies,
  ): Promise<SubjectGenerationResult> {
    const { stageBindings } = deps;
    const strategy = resolveStrategy(request.checklist);
    const topicName = request.checklist.topicName;
    // Display name carried in every terminal `subject-graph:generation-failed`
    // emission so downstream listeners (toast, mentor, telemetry) need not
    // re-derive it. Falls back to the subjectId when the checklist topicName
    // is whitespace.
    const subjectName = topicName.trim() || request.subjectId;

    const retryDepth = countManualRetryDepth(deps.retryOf, useContentGenerationStore.getState().jobs);

    const pipelineId = uuid();
    const pipelineAc = new AbortController();
    if (deps.signal) {
      deps.signal.addEventListener('abort', () => pipelineAc.abort(), { once: true });
    }

    useContentGenerationStore.getState().registerPipeline(
      {
        id: pipelineId,
        label: `New subject: ${topicName}`,
        createdAt: Date.now(),
        retryOf: deps.retryOf ?? null,
      },
      pipelineAc,
    );

    const expectations = {
      subjectId: request.subjectId,
      themeId: request.subjectId,
      topicCount: strategy.graph.totalTiers * strategy.graph.topicsPerTier,
      maxTier: strategy.graph.totalTiers,
      topicsPerTier: strategy.graph.topicsPerTier,
    };
    const latticeExpectations = {
      maxTier: expectations.maxTier,
      topicsPerTier: expectations.topicsPerTier,
    };

    let lattice: TopicLattice | undefined;
    let lastValidatedGraph: SubjectGraph | undefined;
    let edgesCorrectionLog: PrereqEdgesCorrectionLog | undefined;
    const topicsLabel = `[Topics] Curriculum — ${topicName}`;
    const edgesLabel = `[Edges] Curriculum — ${topicName}`;

    const latticeJob = await runContentGenerationJob<TopicLattice>({
      kind: 'subject-graph-topics',
      label: topicsLabel,
      pipelineId,
      subjectId: request.subjectId,
      topicId: null,
      llmSurfaceId: 'subjectGenerationTopics',
      failureDebugContext: {
        topicLabel: subjectName,
        pipelineStage: 'subject-graph',
        failedStage: 'topics',
      },
      chat: stageBindings.topics.chat,
      model: stageBindings.topics.model,
      messages: buildTopicLatticeMessages(request.subjectId, strategy.graph),
      enableReasoning: stageBindings.topics.enableReasoning,
      enableStreaming: stageBindings.topics.enableStreaming,
      externalSignal: pipelineAc.signal,
      metadata: {
        checklist: request.checklist,
        retryCount: retryDepth,
      },
      retryOf: deps.retryOf,
      parseOutput: async (raw, job) => {
        const p = parseTopicLatticeResponse(raw);
        if (!p.ok) {
          appEventBus.emit('subject-graph:validation-failed', {
            subjectId: request.subjectId,
            stage: 'topics',
            error: p.error,
            offendingTopicIds: offendingTopicIdsFromError(p.error),
            boundModel: stageBindings.topics.model,
            retryCount: retryDepth,
            stageDurationMs: jobDurationMs(job),
          });
          return { ok: false, error: p.error, parseError: p.error };
        }
        const v = validateTopicLattice(p.lattice, latticeExpectations);
        if (!v.ok) {
          appEventBus.emit('subject-graph:validation-failed', {
            subjectId: request.subjectId,
            stage: 'topics',
            error: v.error,
            offendingTopicIds: offendingTopicIdsFromError(v.error),
            boundModel: stageBindings.topics.model,
            retryCount: retryDepth,
            stageDurationMs: jobDurationMs(job),
          });
          return { ok: false, error: v.error, parseError: v.error };
        }
        lattice = p.lattice;
        return { ok: true, data: p.lattice };
      },
      persistOutput: async () => {},
    });

    const jobA = useContentGenerationStore.getState().jobs[latticeJob.jobId];
    const stageADurationMs = jobDurationMs(jobA);

    if (!latticeJob.ok) {
      const error = latticeJob.error ?? 'Subject topic lattice generation failed';
      appEventBus.emit('subject-graph:generation-failed', {
        subjectId: request.subjectId,
        subjectName,
        pipelineId,
        stage: 'topics',
        error,
        jobId: latticeJob.jobId,
        failureKey: failureKeyForJob(latticeJob.jobId),
      });
      return {
        ok: false,
        error,
        pipelineId,
        stage: 'topics',
      };
    }
    if (!lattice) {
      throw new Error('Subject generation: topics job succeeded without lattice');
    }

    const resolvedLattice = lattice;

    const edgesJob = await runContentGenerationJob<SubjectGraph>({
      kind: 'subject-graph-edges',
      label: edgesLabel,
      pipelineId,
      subjectId: request.subjectId,
      topicId: null,
      llmSurfaceId: 'subjectGenerationEdges',
      failureDebugContext: {
        topicLabel: subjectName,
        pipelineStage: 'subject-graph',
        failedStage: 'edges',
      },
      chat: stageBindings.edges.chat,
      model: stageBindings.edges.model,
      messages: buildPrereqWiringMessages(request.subjectId, topicName, strategy.graph, resolvedLattice),
      enableReasoning: stageBindings.edges.enableReasoning,
      enableStreaming: stageBindings.edges.enableStreaming,
      temperature: STAGE_B_FIRST_TEMPERATURE,
      externalSignal: pipelineAc.signal,
      metadata: {
        checklist: request.checklist,
        retryCount: retryDepth,
      },
      retryOf: deps.retryOf,
      parseOutput: async (raw, job) => {
        const stageMs = jobDurationMs(job);
        const failEdges = (error: string, parseError: string | undefined) => {
          appEventBus.emit('subject-graph:validation-failed', {
            subjectId: request.subjectId,
            stage: 'edges',
            error,
            offendingTopicIds: offendingTopicIdsFromError(error),
            boundModel: stageBindings.edges.model,
            retryCount: retryDepth,
            stageDurationMs: stageMs,
            latticeSnapshot: resolvedLattice,
          });
          return { ok: false as const, error, parseError: parseError ?? error };
        };

        const first = parsePrereqWiringResponse(raw, resolvedLattice);
        if (!first.ok) {
          return failEdges(first.error, first.error);
        }

        edgesCorrectionLog = first.correction;
        const correction = first.correction;
        const correctionApplied = correction.removed.length > 0 || correction.added.length > 0;
        if (correctionApplied) {
          console.info('[subjectGraph] prereqEdgesCorrection', {
            subjectId: request.subjectId,
            jobId: job.id,
            removedCount: correction.removed.length,
            addedCount: correction.added.length,
            removed: correction.removed,
            added: correction.added,
          });
          useContentGenerationStore.getState().mergeJobMetadata(job.id, {
            prereqEdgesCorrection: correction,
          });
        }

        const graph = assembleSubjectGraph(resolvedLattice, first.edges, request.subjectId, topicName);
        const val = validateGraph(graph, expectations);
        if (!val.ok) {
          return failEdges(val.error, val.error);
        }
        lastValidatedGraph = graph;
        return { ok: true as const, data: graph };
      },
      persistOutput: async (graph, job) => {
        const jobB = useContentGenerationStore.getState().jobs[job.id];
        const stageBDurationMs = jobDurationMs(jobB);
        const subject: Subject = {
          id: request.subjectId,
          name: topicName,
          description: strategy.graph.audienceBrief,
          color: '#6366f1',
          geometry: { gridTile: 'box' },
          metadata: {
            checklist: request.checklist,
            strategy,
          },
        };
        await applyGraphToStorage(deps.writer, { subject, graph });
        const corr = edgesCorrectionLog;
        const prereqEdgesCorrectionApplied =
          corr !== undefined && (corr.removed.length > 0 || corr.added.length > 0);
        appEventBus.emit('subject-graph:generated', {
          subjectId: request.subjectId,
          boundModel: stageBindings.edges.model,
          stageADurationMs,
          stageBDurationMs,
          retryCount: retryDepth,
          lattice: resolvedLattice,
          ...(prereqEdgesCorrectionApplied && corr
            ? {
                prereqEdgesCorrectionApplied: true,
                prereqEdgesCorrectionRemovedCount: corr.removed.length,
                prereqEdgesCorrectionAddedCount: corr.added.length,
                prereqEdgesCorrection: corr,
              }
            : {}),
        });
      },
    });

    if (!edgesJob.ok) {
      const error = edgesJob.error ?? 'Subject prerequisite wiring failed';
      appEventBus.emit('subject-graph:generation-failed', {
        subjectId: request.subjectId,
        subjectName,
        pipelineId,
        stage: 'edges',
        error,
        jobId: edgesJob.jobId,
        failureKey: failureKeyForJob(edgesJob.jobId),
      });
      return {
        ok: false,
        error,
        pipelineId,
        stage: 'edges',
      };
    }
    if (!lastValidatedGraph) {
      throw new Error('Subject generation completed without validated graph');
    }
    return { ok: true, subjectId: request.subjectId, graph: lastValidatedGraph };
  }

  return { execute };
}
