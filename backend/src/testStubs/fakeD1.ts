export type QueuedD1Result = { data: unknown; error?: Error | null; changes?: number };

export function q(data: unknown, changes = 1): QueuedD1Result {
  return { data, error: null, changes };
}

export function qErr(message: string): QueuedD1Result {
  return { data: null, error: new Error(message), changes: 0 };
}

class FakeD1Statement {
  private args: unknown[] = [];
  constructor(
    private readonly queue: QueuedD1Result[],
    private readonly calls: Array<{ sql: string; args: unknown[]; method: string }>,
    private readonly sql: string,
  ) {}

  bind(...args: unknown[]): FakeD1Statement {
    this.args = args;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    this.calls.push({ sql: this.sql, args: this.args, method: 'first' });
    const result = this.queue.shift() ?? q(null, 0);
    if (result.error) throw result.error;

    const normalizedSql = this.sql.toLowerCase();
    if (normalizedSql.includes('returning next_event_seq')) {
      if (result.data && typeof result.data === 'object') return result.data as T;
      return { next_event_seq: typeof result.data === 'number' ? result.data : 1 } as T;
    }
    if (normalizedSql.includes('insert into events') && normalizedSql.includes('returning')) {
      if (result.data && typeof result.data === 'object') return result.data as T;
      return {
        id: 'ev-fake',
        run_id: this.args[0],
        device_id: this.args[1],
        seq: this.args[2],
        ts: this.args[3],
        type: this.args[4],
        payload_json: this.args[5],
      } as T;
    }

    return result.data as T | null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    this.calls.push({ sql: this.sql, args: this.args, method: 'all' });
    const result = this.queue.shift() ?? q([], 0);
    if (result.error) throw result.error;
    return { results: Array.isArray(result.data) ? (result.data as T[]) : [] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    this.calls.push({ sql: this.sql, args: this.args, method: 'run' });
    const result = this.queue.shift() ?? q(null, 1);
    if (result.error) throw result.error;
    return { meta: { changes: result.changes ?? 1 } };
  }
}

export function createFakeD1(queue: QueuedD1Result[] = []): { db: D1Database; calls: Array<{ sql: string; args: unknown[]; method: string }> } {
  const calls: Array<{ sql: string; args: unknown[]; method: string }> = [];
  const db = {
    prepare(sql: string) {
      return new FakeD1Statement(queue, calls, sql);
    },
    async batch(statements: Array<{ run(): Promise<{ meta: { changes: number } }> }>) {
      const out = [];
      for (const stmt of statements) out.push(await stmt.run());
      return out;
    },
  } as unknown as D1Database;
  return { db, calls };
}
