import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SELF), '../../..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);
const FORBIDDEN_IMPORT_FRAGMENTS = [
  ['prepare', 'GenerationRunSubmit'].join(''),
  ['input', 'Hash'].join(''),
] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (SCAN_EXTENSIONS.has(path.extname(entry))) out.push(full);
  }
  return out;
}

function relative(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function importPattern(fragment: string): RegExp {
  return new RegExp(
    `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*)['"][^'"]*${escapeRegex(fragment)}[^'"]*['"]`,
  );
}

describe('intent-only frontend generation submission boundary', () => {
  const runtimeFiles = walk(SRC_ROOT)
    .filter((file) => path.resolve(file) !== SELF)
    .filter((file) => !file.endsWith('.test.ts'))
    .filter((file) => !file.endsWith('.test.tsx'))
    .filter((file) => !relative(file).startsWith('packages/generation-contracts/src/'));

  it('forbids runtime imports of frontend snapshot submit builders and input hashing', () => {
    const offenders: Array<{ file: string; fragment: string }> = [];
    for (const file of runtimeFiles) {
      const text = readFileSync(file, 'utf8');
      for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
        if (importPattern(fragment).test(text)) offenders.push({ file: relative(file), fragment });
      }
    }

    expect(
      offenders,
      'Frontend runtime generation submissions must be compact intents. Snapshot builders and input hashing are backend/shared-contract concerns only.',
    ).toEqual([]);
  });
});
