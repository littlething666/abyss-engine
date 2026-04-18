import { v4 as uuid } from 'uuid';

import type { Subject, SubjectGraph } from '@/types/core';
import type { SubjectGenerationRequest, SubjectGenerationResult } from '@/types/generationOrchestrator';
import { runContentGenerationJob, useContentGenerationStore } from '@/features/contentGeneration';
import { resolveStrategy } from '../strategies/strategyResolver';
import { applyGraphToStorage } from '../graph/applyGraphToStorage';
import { buildGraphMessages } from '../graph/buildGraphMessages';
import { parseGraphResponse } from '../graph/parseGraphResponse';
import { validateGraph } from '../graph/validateGraph';
import type { GenerationDependencies } from './types';

export interface SubjectGenerationOrchestrator {
  execute(request: SubjectGenerationRequest, deps: GenerationDependencies): Promise<SubjectGenerationResult>;
}

export function createSubjectGenerationOrchestrator(): SubjectGenerationOrchestrator {
  async function execute(
    request: SubjectGenerationRequest,
    deps: GenerationDependencies,
  ): Promise<SubjectGenerationResult> {
    const strategy = resolveStrategy(request.checklist);
    const messages = buildGraphMessages(request.subjectId, strategy.graph);

    const pipelineId = uuid();
    const pipelineAc = new AbortController();
    if (deps.signal) {
      deps.signal.addEventListener('abort', () => pipelineAc.abort(), { once: true });
    }

    useContentGenerationStore.getState().registerPipeline(
      {
        id: pipelineId,
        label: `New subject: ${request.checklist.topicName}`,
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

    let validatedGraph: SubjectGraph | undefined;

    const jobResult = await runContentGenerationJob({
      kind: 'subject-graph',
      label: `Curriculum — ${request.checklist.topicName}`,
      pipelineId,
      subjectId: request.subjectId,
      topicId: null,
      llmSurfaceId: 'subjectGeneration',
      chat: deps.chat,
      model: deps.model,
      messages,
      enableThinking: deps.enableThinking ?? false,
      enableStreaming: deps.enableStreaming ?? true,
      externalSignal: pipelineAc.signal,
      metadata: {
        checklist: request.checklist,
      },
      retryOf: deps.retryOf,
      parseOutput: async (raw) => {
        const parseResult = parseGraphResponse(raw);
        if (!parseResult.ok) {
          return { ok: false, error: parseResult.error, parseError: parseResult.error };
        }
        const validation = validateGraph(parseResult.graph, expectations);
        if (!validation.ok) {
          return { ok: false, error: validation.error, parseError: validation.error };
        }
        validatedGraph = parseResult.graph;
        return { ok: true, data: parseResult.graph };
      },
      persistOutput: async (graph) => {
        const subject: Subject = {
          id: request.subjectId,
          name: request.checklist.topicName,
          description: strategy.graph.audienceBrief,
          color: '#6366f1',
          geometry: { gridTile: 'box' },
          metadata: {
            checklist: request.checklist,
            strategy,
          },
        };
        await applyGraphToStorage(deps.writer, { subject, graph });
      },
    });

    if (!jobResult.ok) {
      return { ok: false, error: jobResult.error ?? 'Subject generation failed' };
    }
    if (!validatedGraph) {
      throw new Error('Subject generation completed without validated graph');
    }
    return { ok: true, subjectId: request.subjectId, graph: validatedGraph };
  }

  return { execute };
}
