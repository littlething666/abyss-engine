import { useEffect, useRef } from 'react';

import { useContentGenerationStore } from '@/features/contentGeneration';
import { getGenerationClient } from '@/features/contentGeneration/generationClient';
import { loadPersistedLogs } from '@/infrastructure/repositories/contentGenerationLogRepository';
import {
  getGenerationRunEventHandlers,
  isDurableRunsEnabled,
} from '@/infrastructure/wireGenerationClient';
import type {
  CrystalTrialRunInputSnapshot,
  SubjectGraphEdgesRunInputSnapshot,
  SubjectGraphTopicsRunInputSnapshot,
  TopicExpansionRunInputSnapshot,
} from '@/features/generationContracts';
import type {
  RunInput,
  RunSnapshot,
  TopicContentRunInputSnapshot,
} from '@/types/repository';

/**
 * Reconstruct a `RunInput` from a rehydrated `RunSnapshot`.
 *
 * The snapshot's `snapshotJson` field is the deterministic
 * `RunInputSnapshot` submitted at run creation. This function rebuilds
 * a full `RunInput` variant (discriminated union) with enough context
 * for `generationRunEventHandlers.observeRun()` to route artifact
 * application and emit legacy AppEventBus events.
 */
function runInputFromSnapshot(run: RunSnapshot): RunInput {
  const snap = run.snapshotJson;
  const pk = run.kind;

  switch (pk) {
    case 'topic-content': {
      const tcSnap = snap as TopicContentRunInputSnapshot;
      const s = tcSnap as unknown as Record<string, unknown>;
      return {
        pipelineKind: 'topic-content',
        snapshot: tcSnap,
        subjectId: (typeof s.subject_id === 'string' ? s.subject_id : '') as string,
        topicId: (typeof s.topic_id === 'string' ? s.topic_id : '') as string,
      };
    }
    case 'topic-expansion': {
      const teSnap = snap as TopicExpansionRunInputSnapshot;
      const s = teSnap as unknown as Record<string, unknown>;
      const nextLevel = (typeof s.target_crystal_level === 'number'
        ? s.target_crystal_level
        : 1) as 1 | 2 | 3;
      return {
        pipelineKind: 'topic-expansion',
        snapshot: teSnap,
        subjectId: (typeof s.subject_id === 'string' ? s.subject_id : '') as string,
        topicId: (typeof s.topic_id === 'string' ? s.topic_id : '') as string,
        nextLevel,
      };
    }
    case 'subject-graph': {
      const pipelineKind = (
        snap && typeof snap === 'object' &&
        (snap as Record<string, unknown>).pipeline_kind === 'subject-graph-edges'
      ) ? 'edges' : 'topics';
      const subjId = (snap && typeof snap === 'object'
        ? (snap as Record<string, unknown>).subject_id ?? (snap as Record<string, unknown>).subjectId
        : '') as string;
      return {
        pipelineKind: 'subject-graph',
        snapshot: snap as SubjectGraphTopicsRunInputSnapshot | SubjectGraphEdgesRunInputSnapshot,
        subjectId: typeof subjId === 'string' ? subjId : '',
        stage: pipelineKind as 'topics' | 'edges',
      };
    }
    case 'crystal-trial': {
      const ctSnap = snap as CrystalTrialRunInputSnapshot;
      const s = ctSnap as unknown as Record<string, unknown>;
      return {
        pipelineKind: 'crystal-trial',
        snapshot: ctSnap,
        subjectId: (typeof s.subject_id === 'string' ? s.subject_id : '') as string,
        topicId: (typeof s.topic_id === 'string' ? s.topic_id : '') as string,
        currentLevel: (typeof s.current_level === 'number' ? s.current_level : 1) as number,
      };
    }
    default:
      // Should be unreachable — RunSnapshot.kind is PipelineKind
      throw new Error(
        `[useContentGenerationHydration] unknown pipeline kind: ${pk}`,
      );
  }
}

/**
 * Hydrates the content generation store and durable run state on mount.
 *
 * Phase 0.5 (default): loads persisted terminal job logs from IndexedDB
 * (the `contentGenerationLogRepository` read-cache) into the Zustand store.
 *
 * Phase 1 (NEXT_PUBLIC_DURABLE_RUNS=true):
 * 1. Merges the local read-cache as above.
 * 2. Fetches active durable runs from the Worker.
 * 3. For each active run, reconstructs `RunInput` from the snapshot and
 *    calls `handlers.observeRun()` to open SSE, apply artifacts, and fire
 *    legacy AppEventBus events.
 * 4. The `AppliedArtifactsStore` (dedupe by `contentHash`) and per-run
 *    seq tracking prevent double-application of already-applied artifacts.
 */
export function useContentGenerationHydration(): void {
  const ran = useRef(false);
  const activeObservations = useRef<Array<Promise<void>>>([]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;

    void (async () => {
      // ── 1. Local read-cache merge (always runs) ──────────────
      const { jobs, pipelines } = await loadPersistedLogs();
      if (cancelled) return;
      useContentGenerationStore.getState().hydrateFromPersisted(jobs, pipelines);

      // ── 2. Backend hydration (Phase 1+ only) ─────────────────
      if (!isDurableRunsEnabled()) return;

      const client = getGenerationClient();
      const handlers = getGenerationRunEventHandlers();
      if (!handlers) return;

      let active: RunSnapshot[] = [];
      try {
        active = await client.listActive();
      } catch (err) {
        console.error(
          '[useContentGenerationHydration] failed to fetch active durable runs:',
          err,
        );
        return;
      }

      if (cancelled) return;

      for (const run of active) {
        if (cancelled) break;

        const runInput = runInputFromSnapshot(run);
        const obs = handlers
          .observeRun(run.runId, runInput)
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
