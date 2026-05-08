/**
 * Browser-side dedupe store for applied generation artifacts.
 *
 * Keyed by `contentHash` so the same semantic payload applied twice
 * (e.g. SSE replay, hydration reconnection) never double-writes to
 * the deck or crystal trial store.
 *
 * Topic-expansion rows optionally carry `(subjectId, topicId, targetLevel)`
 * scope metadata so supersession can compare against the latest applied
 * expansion per topic without session-global Maps.
 *
 * **Phase 3.6 Step 2 — Run event cursor persistence:** the `runEventCursors`
 * table stores the highest applied `seq` per `runId` so rehydration can
 * resume SSE replay and suppress duplicate terminal side effects across
 * browser reloads.
 *
 * A lightweight hygiene cap keeps both tables bounded; this is NOT a
 * security boundary — it prevents UI noise, not adversarial replay.
 */

import Dexie from 'dexie';

import type {
  AppliedArtifactRecordScope,
  AppliedArtifactsStore,
  ArtifactKind,
} from '@/features/generationContracts';

/** Maximum rows kept in the local dedupe table. */
const MAX_ROWS = 500;

interface AppliedArtifactRow {
  contentHash: string;
  kind: ArtifactKind;
  appliedAt: number;
  /** `${subjectId}:${topicId}` — set for scoped topic-expansion records. */
  topicScopeKey?: string;
  expansionTargetLevel?: number;
}

interface RunEventCursorRow {
  runId: string;
  lastSeq: number;
  updatedAt: number;
}

class AppliedArtifactsDb extends Dexie {
  artifacts!: Dexie.Table<AppliedArtifactRow, string>;
  runEventCursors!: Dexie.Table<RunEventCursorRow, string>;

  constructor() {
    super('abyss-applied-artifacts');
    this.version(1).stores({
      artifacts: 'contentHash, kind, appliedAt',
    });
    this.version(2).stores({
      artifacts: 'contentHash, kind, appliedAt, topicScopeKey',
    });
    this.version(3).stores({
      artifacts: 'contentHash, kind, appliedAt, topicScopeKey',
      runEventCursors: 'runId, updatedAt',
    });
  }
}

const db = new AppliedArtifactsDb();

async function pruneIfNeeded(): Promise<void> {
  const count = await db.artifacts.count();
  if (count <= MAX_ROWS) return;
  const oldest = await db.artifacts.orderBy('appliedAt').limit(count - MAX_ROWS).toArray();
  if (oldest.length > 0) {
    await db.artifacts.bulkDelete(oldest.map((r) => r.contentHash));
  }
}

// ---------------------------------------------------------------------------
// Run event cursor persistence (Phase 3.6 Step 2)
// ---------------------------------------------------------------------------

export interface RunEventCursorStore {
  /** Return the highest persisted seq for a run, or 0 if never observed. */
  get(runId: string): Promise<number>;
  /** Persist the highest seq applied for a run. */
  set(runId: string, seq: number): Promise<void>;
}

/** Max per-run cursor rows kept. */
const MAX_CURSOR_ROWS = 200;

async function pruneCursorsIfNeeded(): Promise<void> {
  const count = await db.runEventCursors.count();
  if (count <= MAX_CURSOR_ROWS) return;
  const oldest = await db.runEventCursors
    .orderBy('updatedAt')
    .limit(count - MAX_CURSOR_ROWS)
    .toArray();
  if (oldest.length > 0) {
    await db.runEventCursors.bulkDelete(oldest.map((r) => r.runId));
  }
}

export const runEventCursorStore: RunEventCursorStore = {
  async get(runId) {
    const row = await db.runEventCursors.get(runId);
    return row?.lastSeq ?? 0;
  },

  async set(runId, seq) {
    const existing = await db.runEventCursors.get(runId);
    // Monotonic: only increase, never decrease.
    if (existing && existing.lastSeq >= seq) return;
    await db.runEventCursors.put({
      runId,
      lastSeq: seq,
      updatedAt: Date.now(),
    });
    void pruneCursorsIfNeeded().catch((e) => {
      console.error('[runEventCursors] prune failed', e);
    });
  },
};

export const appliedArtifactsStore: AppliedArtifactsStore = {
  async has(contentHash) {
    const row = await db.artifacts.get(contentHash);
    return row != null;
  },

  async record(contentHash, kind, appliedAt, scope?: AppliedArtifactRecordScope) {
    const row: AppliedArtifactRow = { contentHash, kind, appliedAt };
    if (scope?.variant === 'topic-expansion') {
      row.topicScopeKey = `${scope.subjectId}:${scope.topicId}`;
      row.expansionTargetLevel = scope.targetLevel;
    }
    await db.artifacts.put(row);
    // Don't await — hygiene runs in the background.
    void pruneIfNeeded().catch((e) => {
      console.error('[appliedArtifacts] prune failed', e);
    });
  },

  async getLatestTopicExpansionScope(subjectId, topicId) {
    const key = `${subjectId}:${topicId}`;
    const rows = await db.artifacts
      .where('topicScopeKey')
      .equals(key)
      .filter((r) => r.kind === 'topic-expansion-cards')
      .toArray();
    if (rows.length === 0) return null;
    rows.sort((a, b) => a.appliedAt - b.appliedAt);
    const last = rows[rows.length - 1];
    if (last.expansionTargetLevel == null) return null;
    return {
      contentHash: last.contentHash,
      targetLevel: last.expansionTargetLevel,
      appliedAt: last.appliedAt,
    };
  },
};
