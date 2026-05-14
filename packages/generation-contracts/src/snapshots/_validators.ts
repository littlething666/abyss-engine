/**
 * Internal snapshot field validators. Not part of the public surface.
 *
 * Each validator throws a descriptive Error on invalid input so failures are
 * loud at construction time (per the Phase 0 reliability gate) rather than
 * surfacing later as confusing canonical-hash mismatches or downstream
 * schema-validation errors.
 */

export function assertString(
  field: string,
  value: unknown,
): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(
      `Snapshot field "${field}" must be a string, received ${describe(value)}`,
    );
  }
}

export function assertNonEmptyString(
  field: string,
  value: unknown,
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Snapshot field "${field}" must be a non-empty string, received ${describe(value)}`,
    );
  }
}

export function assertNonNegativeInteger(
  field: string,
  value: unknown,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `Snapshot field "${field}" must be a non-negative integer, received ${describe(value)}`,
    );
  }
}

export function assertPositiveInteger(
  field: string,
  value: unknown,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Snapshot field "${field}" must be a positive integer, received ${describe(value)}`,
    );
  }
}

export function assertContentHash(
  field: string,
  value: unknown,
): asserts value is string {
  if (typeof value !== 'string' || !/^cnt_[0-9a-f]{64}$/.test(value)) {
    throw new Error(
      `Snapshot field "${field}" must be a content hash (cnt_<64-hex>), received ${describe(value)}`,
    );
  }
}

export function assertIsoTimestamp(
  field: string,
  value: unknown,
): asserts value is string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(
      `Snapshot field "${field}" must be an ISO-8601 timestamp, received ${describe(value)}`,
    );
  }
}

export function assertStringArray(
  field: string,
  value: unknown,
): asserts value is string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error(
      `Snapshot field "${field}" must be an array of strings, received ${describe(value)}`,
    );
  }
}

export function assertBoolean(
  field: string,
  value: unknown,
): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(
      `Snapshot field "${field}" must be a boolean, received ${describe(value)}`,
    );
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return typeof value;
}
