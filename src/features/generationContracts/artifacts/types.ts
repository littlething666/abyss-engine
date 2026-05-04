/**
 * `Artifact` is the durable, applied-once unit produced by a successful run.
 *
 * Artifacts are content-addressed by `contentHash` (canonical-JSON sha256
 * of `payload`). The client `ArtifactApplier` registry uses `kind` to
 * dispatch to the feature-owned applier; an `applied_artifacts` IndexedDB
 * store will track `contentHash -> appliedAt` to enforce exactly-once
 * application (added in a later Phase 0.5 PR).
 *
 * The `kind` literal union mirrors the durable pipeline kinds. Adding a kind
 * requires:
 *   1. Extending the literal union here.
 *   2. Adding a strict parser + semantic validator under
 *      `src/features/generationContracts/{strictParsers,semanticValidators}/`.
 *   3. Adding a feature-owned `ArtifactApplier` and wiring it through
 *      `src/infrastructure/generationRunEventHandlers.ts`.
 */

export type ArtifactKind =
  | 'subject-graph-topics'
  | 'subject-graph-edges'
  | 'topic-theory'
  | 'topic-study-cards'
  | 'topic-mini-game-category-sort'
  | 'topic-mini-game-sequence-build'
  | 'topic-mini-game-match-pairs'
  | 'topic-expansion-cards'
  | 'crystal-trial';

export interface Artifact<TPayload = unknown> {
  /** Stable id (uuid v4) — independent of content. */
  id: string;
  kind: ArtifactKind;
  /** sha256 of canonicalized payload (`cnt_<hex>`). */
  contentHash: string;
  /** Snapshot hash that produced this artifact (`inp_<hex>`). */
  inputHash: string;
  /** Per-kind payload schema version. */
  schemaVersion: number;
  /** Run id that first produced this artifact (Worker authoritative). */
  createdByRunId: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  payload: TPayload;
}

/**
 * Worker-side envelope returned by `getArtifact`. Either a signed download
 * URL for the JSON payload (Supabase Storage) or the inline payload, plus
 * identity metadata.
 */
export type ArtifactEnvelope<TPayload = unknown> =
  | {
      kind: 'inline';
      artifact: Artifact<TPayload>;
    }
  | {
      kind: 'signed-url';
      meta: Omit<Artifact<TPayload>, 'payload'>;
      url: string;
      /** ISO-8601; consumer must refetch after this timestamp. */
      expiresAt: string;
    };
