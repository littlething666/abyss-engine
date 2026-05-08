import { expect } from 'vitest';

export async function scalar(db: D1Database, sql: string, ...binds: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...binds).first<{ value: number }>();
  return row?.value ?? 0;
}

export async function expectTableCount(
  db: D1Database,
  table: string,
  expected: number,
): Promise<void> {
  const row = await db.prepare(`select count(*) as value from ${table}`).first<{ value: number }>();
  expect(row?.value ?? 0).toBe(expected);
}
