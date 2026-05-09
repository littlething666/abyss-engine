import Dexie from 'dexie';

export interface RunEventCursorStore {
  /** Return the highest persisted seq for a run, or 0 if never observed. */
  get(runId: string): Promise<number>;
  /** Persist the highest seq applied for a run. */
  set(runId: string, seq: number): Promise<void>;
}

interface RunEventCursorRow {
  runId: string;
  lastSeq: number;
  updatedAt: number;
}

class RunEventCursorDb extends Dexie {
  runEventCursors!: Dexie.Table<RunEventCursorRow, string>;

  constructor() {
    super('abyss-run-event-cursors');
    this.version(1).stores({
      runEventCursors: 'runId, updatedAt',
    });
  }
}

const db = new RunEventCursorDb();
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
