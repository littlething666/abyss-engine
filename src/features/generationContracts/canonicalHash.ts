/**
 * Deterministic canonical JSON + SHA-256 hashing for generation contracts.
 *
 * Used for:
 * - `input_hash`: sha256 of canonicalized RunInputSnapshot. Drives artifact
 *   dedupe and cache-hit short-circuiting in the durable orchestrator.
 * - `content_hash`: sha256 of canonicalized artifact payload. Drives
 *   client-side ArtifactApplier idempotency.
 *
 * Canonical-JSON rules:
 * - Keys sorted lexicographically (UTF-16 code units, JS default).
 * - Arrays preserved in order.
 * - `undefined` properties are omitted from objects.
 * - Top-level `undefined` becomes `null`.
 * - `NaN` and `+/-Infinity` throw — durable contracts must not encode these.
 *
 * Hash format: `inp_<64-hex>` / `cnt_<64-hex>`. Prefix encodes the role; the
 * algorithm is fixed at sha256 for v1. Migrating to a new digest in the
 * future MUST change the prefix so cached artifacts cannot silently collide.
 */

const ENCODER = new TextEncoder();

function escapeString(value: string): string {
  return JSON.stringify(value);
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new Error(
          `canonicalHash: refusing to canonicalize non-finite number (${value})`,
        );
      }
      return JSON.stringify(value);
    }
    case 'string':
      return escapeString(value);
    case 'bigint':
      throw new Error('canonicalHash: bigint values are not supported');
    case 'object': {
      if (Array.isArray(value)) {
        const parts = value.map((item) => canonicalize(item));
        return `[${parts.join(',')}]`;
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((key) => obj[key] !== undefined)
        .sort();
      const parts = keys.map((key) => {
        const v = canonicalize(obj[key]);
        return `${escapeString(key)}:${v}`;
      });
      return `{${parts.join(',')}}`;
    }
    default:
      throw new Error(
        `canonicalHash: unsupported value type "${typeof value}"`,
      );
  }
}

/** Stable canonical JSON serialization. Pure / synchronous. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

function bytesToHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < view.length; i += 1) {
    const hex = view[i]!.toString(16);
    out += hex.length === 1 ? `0${hex}` : hex;
  }
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const cryptoSubtle =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: Crypto }).crypto?.subtle
      : undefined;
  if (!cryptoSubtle) {
    throw new Error('canonicalHash: WebCrypto subtle is unavailable in this runtime');
  }
  const buffer = await cryptoSubtle.digest('SHA-256', ENCODER.encode(input));
  return bytesToHex(buffer);
}

export type GenerationHashRole = 'input' | 'content';

const ROLE_PREFIX: Record<GenerationHashRole, string> = {
  input: 'inp_',
  content: 'cnt_',
};

/**
 * Compute a tagged sha256 hash of `value`'s canonical JSON form.
 *
 * @example
 * await generationHash('input', { snapshot_version: 1, ... })
 * // -> 'inp_<64-hex>'
 */
export async function generationHash(
  role: GenerationHashRole,
  value: unknown,
): Promise<string> {
  const canonical = canonicalJson(value);
  const hex = await sha256Hex(canonical);
  return `${ROLE_PREFIX[role]}${hex}`;
}

/** Deterministic `input_hash` for a RunInputSnapshot. */
export function inputHash(snapshot: unknown): Promise<string> {
  return generationHash('input', snapshot);
}

/** Deterministic `content_hash` for an artifact payload. */
export function contentHash(payload: unknown): Promise<string> {
  return generationHash('content', payload);
}
