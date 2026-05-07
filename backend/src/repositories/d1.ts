/**
 * Cloudflare D1 repository helpers.
 *
 * D1 stores JSON columns as TEXT. Repositories parse/stringify JSON only at
 * this adapter boundary and throw explicit errors on malformed values.
 */

export type JsonValue = Record<string, unknown> | readonly unknown[];

export function stringifyJson(value: unknown, field: string): string {
  try {
    return JSON.stringify(value ?? {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`D1 JSON stringify failed for ${field}: ${message}`);
  }
}

export function parseJsonObject(value: unknown, field: string): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') {
    throw new Error(`D1 JSON parse failed for ${field}: expected TEXT, received ${typeof value}`);
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`D1 JSON parse failed for ${field}: ${message}`);
  }
}

export function parseJsonValue(value: unknown, field: string): unknown {
  if (typeof value !== 'string') {
    throw new Error(`D1 JSON parse failed for ${field}: expected TEXT, received ${typeof value}`);
  }
  try {
    return JSON.parse(value) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`D1 JSON parse failed for ${field}: ${message}`);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireD1(env: { GENERATION_DB?: D1Database }): D1Database {
  if (!env.GENERATION_DB) {
    throw new Error('GENERATION_DB D1 binding is required');
  }
  return env.GENERATION_DB;
}

export function requireRow<T>(row: T | null, operation: string): T {
  if (!row) {
    throw new Error(`D1 ${operation}: row not found`);
  }
  return row;
}
