import { useEffect, useRef } from 'react';

import { getGenerationClient } from '@/features/contentGeneration/generationClient';
import { getGenerationRunEventHandlers } from '@/infrastructure/wireGenerationClient';
import type {
  GenerationRunIntent,
  RunSnapshot,
  TopicContentGenerationStage,
} from '@/types/repository';
import type { MiniGameType } from '@/types/core';
import type { LearningStyle, PriorKnowledge, StudyGoal } from '@/types/studyChecklist';

function snapshotRecord(run: RunSnapshot): Record<string, unknown> {
  const snap = run.snapshotJson;
  if (typeof snap !== 'object' || snap === null) {
    throw new Error(
      `[useContentGenerationHydration] Worker returned malformed snapshotJson for run ${run.runId}.`,
    );
  }
  return snap as unknown as Record<string, unknown>;
}

function requiredString(run: RunSnapshot, key: string): string {
  const value = snapshotRecord(run)[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `[useContentGenerationHydration] Worker snapshot for run ${run.runId} is missing required string '${key}'.`,
    );
  }
  return value;
}

function requiredNumber(run: RunSnapshot, key: string): number {
  const value = snapshotRecord(run)[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `[useContentGenerationHydration] Worker snapshot for run ${run.runId} is missing required number '${key}'.`,
    );
  }
  return value;
}

function topicContentStage(run: RunSnapshot): TopicContentGenerationStage {
  const pipelineKind = requiredString(run, 'pipeline_kind');
  if (pipelineKind === 'topic-theory') return 'theory';
  if (pipelineKind === 'topic-study-cards') return 'study-cards';
  if (pipelineKind.startsWith('topic-mini-game-')) return 'mini-games';
  throw new Error(
    `[useContentGenerationHydration] Worker snapshot for run ${run.runId} has invalid topic-content pipeline_kind '${pipelineKind}'.`,
  );
}

function miniGameTypeFromSnapshot(run: RunSnapshot): MiniGameType | undefined {
  const pipelineKind = requiredString(run, 'pipeline_kind');
  if (pipelineKind === 'topic-mini-game-category-sort') return 'CATEGORY_SORT';
  if (pipelineKind === 'topic-mini-game-sequence-build') return 'SEQUENCE_BUILD';
  if (pipelineKind === 'topic-mini-game-match-pairs') return 'MATCH_PAIRS';
  return undefined;
}

function levelOneToThree(run: RunSnapshot, key: string): 1 | 2 | 3 {
  const value = requiredNumber(run, key);
  if (value === 1 || value === 2 || value === 3) return value;
  throw new Error(
    `[useContentGenerationHydration] Worker snapshot for run ${run.runId} has invalid '${key}' level ${value}.`,
  );
}

const STUDY_GOALS = new Set<StudyGoal>(['curiosity', 'exam-prep', 'career-switch', 'refresh']);
const PRIOR_KNOWLEDGE_LEVELS = new Set<PriorKnowledge>(['none', 'beginner', 'intermediate', 'advanced']);
const LEARNING_STYLES = new Set<LearningStyle>(['balanced', 'theory-heavy', 'practice-heavy']);

function optionalEnum<T extends string>(
  run: RunSnapshot,
  source: Record<string, unknown>,
  key: string,
  allowed: ReadonlySet<T>,
): T | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value === 'string' && allowed.has(value as T)) return value as T;
  throw new Error(
    `[useContentGenerationHydration] Worker snapshot for run ${run.runId} has invalid checklist.${key}.`,
  );
}

function subjectGraphChecklist(run: RunSnapshot): Extract<GenerationRunIntent, { kind: 'subject-graph'; stage: 'topics' }>['checklist'] {
  const raw = snapshotRecord(run).checklist;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(
      `[useContentGenerationHydration] Worker snapshot for run ${run.runId} is missing required subject-graph checklist.`,
    );
  }
  const checklist = raw as Record<string, unknown>;
  const topicName = checklist.topic_name;
  if (typeof topicName !== 'string' || topicName.length === 0) {
    throw new Error(
      `[useContentGenerationHydration] Worker snapshot for run ${run.runId} is missing required checklist.topic_name.`,
    );
  }
  const focusAreas = checklist.focus_areas;
  if (focusAreas !== undefined && typeof focusAreas !== 'string') {
    throw new Error(
      `[useContentGenerationHydration] Worker snapshot for run ${run.runId} has invalid checklist.focus_areas.`,
    );
  }
  return {
    topicName,
    ...(optionalEnum(run, checklist, 'study_goal', STUDY_GOALS) ? { studyGoal: optionalEnum(run, checklist, 'study_goal', STUDY_GOALS) } : {}),
    ...(optionalEnum(run, checklist, 'prior_knowledge', PRIOR_KNOWLEDGE_LEVELS) ? { priorKnowledge: optionalEnum(run, checklist, 'prior_knowledge', PRIOR_KNOWLEDGE_LEVELS) } : {}),
    ...(optionalEnum(run, checklist, 'learning_style', LEARNING_STYLES) ? { learningStyle: optionalEnum(run, checklist, 'learning_style', LEARNING_STYLES) } : {}),
    ...(typeof focusAreas === 'string' ? { focusAreas } : {}),
  };
}

/**
 * Reconstruct a compact observation intent from backend-owned run snapshot data.
 * This intentionally does not rebuild frontend `RunInput` snapshots: durable
 * workflows own execution details, while the browser only needs routing context
 * for query invalidation and product notifications.
 */
function intentFromSnapshot(run: RunSnapshot): GenerationRunIntent {
  switch (run.kind) {
    case 'topic-content':
      const miniGameType = miniGameTypeFromSnapshot(run);
      return {
        kind: 'topic-content',
        subjectId: requiredString(run, 'subject_id'),
        topicId: requiredString(run, 'topic_id'),
        stage: topicContentStage(run),
        ...(miniGameType ? { miniGameType } : {}),
      };
    case 'topic-expansion':
      return {
        kind: 'topic-expansion',
        subjectId: requiredString(run, 'subject_id'),
        topicId: requiredString(run, 'topic_id'),
        nextLevel: levelOneToThree(run, 'next_level'),
      };
    case 'subject-graph': {
      const pipelineKind = requiredString(run, 'pipeline_kind');
      const subjectId = requiredString(run, 'subject_id');
      if (pipelineKind === 'subject-graph-topics') {
        return { kind: 'subject-graph', subjectId, stage: 'topics', checklist: subjectGraphChecklist(run) };
      }
      if (pipelineKind === 'subject-graph-edges') {
        return {
          kind: 'subject-graph',
          subjectId,
          stage: 'edges',
          latticeArtifactContentHash: requiredString(run, 'lattice_artifact_content_hash'),
        };
      }
      throw new Error(
        `[useContentGenerationHydration] Worker snapshot for run ${run.runId} has invalid subject-graph pipeline_kind '${pipelineKind}'.`,
      );
    }
    case 'crystal-trial':
      return {
        kind: 'crystal-trial',
        subjectId: requiredString(run, 'subject_id'),
        topicId: requiredString(run, 'topic_id'),
        currentLevel: requiredNumber(run, 'current_level'),
        targetLevel: requiredNumber(run, 'target_level'),
      };
    default: {
      const _exhaustive: never = run.kind;
      throw new Error(
        `[useContentGenerationHydration] unknown pipeline kind: ${_exhaustive}`,
      );
    }
  }
}

/**
 * Reattaches durable run observation on mount.
 *
 * The browser no longer hydrates frontend generation logs or reconstructs
 * local-runner `RunInput` values. Active and recently terminal Worker runs are
 * observed only so unprocessed durable events can refresh Learning Content
 * Store queries and emit product notifications through the event bus.
 */
export function useContentGenerationHydration(): void {
  const ran = useRef(false);
  const activeObservations = useRef<Array<Promise<void>>>([]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;

    void (async () => {
      const client = getGenerationClient();
      const handlers = getGenerationRunEventHandlers();
      if (!handlers) return;

      let active: RunSnapshot[] = [];
      try {
        // Phase 3.6 Step 2: active runs exclude terminal `ready`.
        active = await client.listActive();
      } catch (err) {
        console.error(
          '[useContentGenerationHydration] failed to fetch active durable runs:',
          err,
        );
        return;
      }

      // Reobserve recent terminal success runs in case the previous browser
      // session closed before consuming their completion events. The durable
      // cursor store suppresses already-processed events.
      let recent: RunSnapshot[] = [];
      try {
        recent = await client.listRecent(20);
      } catch (err) {
        console.error(
          '[useContentGenerationHydration] failed to fetch recent durable runs:',
          err,
        );
        // Non-fatal — proceed with active runs only.
      }

      // Only terminal success runs can publish new content-refresh signals.
      const terminalKinds = new Set(['ready', 'applied-local']);
      const recentReady = recent.filter((r) => terminalKinds.has(r.status));

      // Dedupe by runId: active ∪ recent → unique set.
      const seen = new Set<string>(active.map((r) => r.runId));
      const runsToObserve = [...active];
      for (const r of recentReady) {
        if (!seen.has(r.runId)) {
          seen.add(r.runId);
          runsToObserve.push(r);
        }
      }

      if (cancelled) return;

      for (const run of runsToObserve) {
        if (cancelled) break;

        const intent = intentFromSnapshot(run);
        const obs = handlers
          .observeRun(run.runId, intent)
          .catch((err) => {
            console.error(
              `[useContentGenerationHydration] observeRun failed for ${run.runId}:`,
              err,
            );
          });
        activeObservations.current.push(obs);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
