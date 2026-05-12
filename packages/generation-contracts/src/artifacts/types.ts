/**
 * `Artifact` is the durable unit produced by a successful backend run.
 *
 * Artifacts are content-addressed by `contentHash` (canonical-JSON sha256
 * of `payload`). Browser runtime does not apply artifacts locally; backend
 * workflows materialize generated content into the Learning Content Store, and
 * frontend durable observation treats artifact events as progress signals only.
 *
 * The `kind` literal union mirrors the durable pipeline kinds. Adding a kind
 * requires:
 *   1. Extending the literal union here.
 *   2. Adding a strict parser + semantic validator under
 *      `packages/generation-contracts/src/{strictParsers,semanticValidators}/`.
 *   3. Updating backend artifact application / Learning Content Store routes
 *      and frontend query invalidation where needed.
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
 * Worker-side envelope returned by `getArtifact`. The browser no longer uses
 * this path for normal content consumption, but backend diagnostics and narrow
 * debug tools may still expose artifact metadata or payload bodies.
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
