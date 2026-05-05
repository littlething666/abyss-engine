/**
 * Shared ArtifactApplier contract consumed by
 * `src/infrastructure/generationRunEventHandlers.ts` (Phase 0.5 step 6).
 *
 * Every feature that produces a durable artifact exports an applier
 * implementing this interface. The composition root wires them together
 * and drives application from `RunEvent`s.
 *
 * Rules:
 * - Idempotent by `contentHash` via `AppliedArtifactsStore`.
 * - Crystal Trial applier MUST NOT emit `crystal-trial:completed`.
 * - Topic Expansion applier MUST suppress player-facing failure copy
 *   for superseded expansions (returns `reason: 'superseded'`).
 * - Subject Graph Stage B MUST NOT apply before Stage A's `contentHash`
 *   is applied (returns `reason: 'missing-stage-a'`).
 */

import type { ArtifactEnvelope, ArtifactKind } from './types';

/**
 * Context passed to every `apply` call. The dedupe store is the
 * single source of truth for idempotency; `now` is injected so tests
 * can pin timestamps.
 *
 * `subjectId` / `topicId` are populated by the composition root from
 * the `artifact.ready` RunEvent body — they are NOT embedded in the
 * artifact envelope itself because the envelope may be deserialized
 * from Supabase Storage.
 */
export interface ArtifactApplyContext {
  runId: string;
  deviceId: string;
  now: () => number;
  dedupeStore: AppliedArtifactsStore;
  subjectId?: string;
  topicId?: string;
  /**
   * Topic expansion: `next_level` from the run’s `TopicExpansionRunInputSnapshot`.
   * When set, supersession compares against the latest applied expansion for the
   * same topic (see `AppliedArtifactsStore.getLatestTopicExpansionScope`).
   */
  topicExpansionTargetLevel?: number;
  /**
   * Subject graph Stage B: Stage A lattice `contentHash` for this run (matches
   * `SubjectGraphEdgesRunInputSnapshot.lattice_artifact_content_hash`). Stage B
   * applies only after that hash is present in the dedupe store.
   */
  subjectGraphLatticeContentHash?: string;
}

/** Optional row metadata when recording an applied artifact (Dexie-backed store). */
export type AppliedArtifactRecordScope =
  | {
      variant: 'topic-expansion';
      subjectId: string;
      topicId: string;
      /** Same numeric field as `TopicExpansionRunInputSnapshot.next_level`. */
      targetLevel: number;
    };

/**
 * Per-device content-hash dedupe store.
 *
 * Backed by Dexie `applied_artifacts` in the browser; the Worker
 * already guarantees `(device_id, kind, input_hash)` uniqueness, so
 * this store guards against double-apply from SSE replays.
 */
export interface AppliedArtifactsStore {
  has(contentHash: string): Promise<boolean>;
  record(
    contentHash: string,
    kind: ArtifactKind,
    appliedAt: number,
    scope?: AppliedArtifactRecordScope,
  ): Promise<void>;
  /**
   * Latest applied topic-expansion for `(subjectId, topicId)` by `appliedAt`,
   * among rows recorded with `variant: 'topic-expansion'` metadata.
   */
  getLatestTopicExpansionScope(
    subjectId: string,
    topicId: string,
  ): Promise<{
    contentHash: string;
    targetLevel: number;
    appliedAt: number;
  } | null>;
}

/**
 * Feature-owned applier. `K` narrows to a single `ArtifactKind`
 * literal or a union for composite appliers that dispatch internally.
 *
 * Returns `{ applied: false, reason }` when the artifact was skipped
 * (duplicate, superseded, missing Stage A). The composition root
 * uses `reason` to decide whether to fire legacy events.
 */
export interface ArtifactApplier<K extends ArtifactKind = ArtifactKind> {
  kind: K;
  apply(
    artifact: ArtifactEnvelope<K>,
    context: ArtifactApplyContext,
  ): Promise<{
    applied: boolean;
    reason?: 'duplicate' | 'superseded' | 'missing-stage-a' | 'invalid';
  }>;
}
