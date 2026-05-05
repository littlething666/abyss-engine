import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Architectural guard for the durable generation repository contract
 * (`src/types/repository.ts`).
 *
 * The Durable Workflow Orchestration plan (Phase 0.5 step 1) locks the
 * import surface for the contract module:
 *   - It may depend on the public `@/features/generationContracts` barrel
 *     and on sibling `@/types/*` files only.
 *   - It must NOT depend on `@/features/*` internals other than
 *     `generationContracts` (no in-tab runners, no zustand stores, no
 *     orchestrators).
 *   - It must NOT depend on `@/hooks/*`, `@/components/*`, or
 *     `@/infrastructure/*` runtime layers.
 *   - It must NOT reference the four legacy generation entry points listed
 *     in the plan's Phase 0.5 invariants.
 *
 * The scan is scoped to `repository.ts` and any future
 * `repository.<helper>.ts` siblings; sibling type modules under
 * `src/types/` are governed by their own boundaries.
 *
 * Drift-prevention: this guard runs as part of `pnpm test:unit:run`, which
 * is the same harness that already enforces `lucideImportBoundary.test.ts`
 * and `legacyParserBoundary.test.ts`. A future agent who tries to fold a
 * runner / store / hook back into the contract module fails loudly here.
 */

const SELF = fileURLToPath(import.meta.url);
const TYPES_ROOT = path.dirname(SELF);

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

// Pattern fragments concatenated at runtime so this file's own source does
// not match the very import-statement regexes it executes against.
const FEATURES_PREFIX = ['@', '/features/'].join('');
const FEATURES_GENCONTRACTS_PREFIX = [FEATURES_PREFIX, 'generationContracts'].join('');
const HOOKS_PREFIX = ['@', '/hooks/'].join('');
const COMPONENTS_PREFIX = ['@', '/components/'].join('');
const INFRASTRUCTURE_PREFIX = ['@', '/infrastructure/'].join('');

// The four legacy generation entry points the plan locks behind
// `LocalGenerationRunRepository.ts` after Phase 0.5. Fragment literals are
// concatenated so the test file itself never appears as an offender.
const LEGACY_RUNNER_FRAGMENTS = [
  ['runTopic', 'GenerationPipeline'].join(''),
  ['runExpansion', 'Job'].join(''),
  ['subjectGeneration/', 'orchestrator/'].join(''),
  ['generateTrial', 'Questions'].join(''),
] as const;

const REPOSITORY_FILE_PATTERN = /^repository(?:\..+)?\.tsx?$/;

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildImportPattern(specifierFragment: string): RegExp {
  // Matches:
  //   from '...<fragment>...'
  //   from "...<fragment>..."
  //   import('...<fragment>...')
  //   require('...<fragment>...')
  return new RegExp(
    `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*)['"][^'"]*${escapeRegex(specifierFragment)}[^'"]*['"]`,
  );
}

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

function relativePosix(file: string): string {
  return path.relative(TYPES_ROOT, file).split(path.sep).join('/');
}

describe('repository contract import boundary', () => {
  const repositoryFiles = walk(TYPES_ROOT)
    .filter((file) => path.resolve(file) !== SELF)
    .filter((file) => REPOSITORY_FILE_PATTERN.test(path.basename(file)));

  it('discovers the repository contract module under src/types/', () => {
    expect(repositoryFiles.length).toBeGreaterThan(0);
    expect(
      repositoryFiles.map((f) => path.basename(f)),
    ).toContain('repository.ts');
  });

  it(`only allows '${FEATURES_PREFIX}*' imports that target '${FEATURES_GENCONTRACTS_PREFIX}'`, () => {
    const featurePattern = new RegExp(
      `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*)['"](${escapeRegex(FEATURES_PREFIX)}[^'"]+)['"]`,
      'g',
    );
    const offenders: Array<{ file: string; specifier: string }> = [];
    for (const file of repositoryFiles) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(featurePattern)) {
        const specifier = match[1];
        if (!specifier.startsWith(FEATURES_GENCONTRACTS_PREFIX)) {
          offenders.push({ file: relativePosix(file), specifier });
        }
      }
    }
    expect(
      offenders,
      `The durable generation repository contract may only depend on '${FEATURES_GENCONTRACTS_PREFIX}'. Move feature-internal contracts behind that public surface, or move the consuming type out of src/types/.`,
    ).toEqual([]);
  });

  it.each([
    [HOOKS_PREFIX, 'composition-layer modules'],
    [COMPONENTS_PREFIX, 'presentation-layer modules'],
    [INFRASTRUCTURE_PREFIX, 'boundary adapters'],
  ])('forbids imports from %s (%s)', (specifierPrefix) => {
    const pattern = buildImportPattern(specifierPrefix);
    const offenders: string[] = [];
    for (const file of repositoryFiles) {
      const text = readFileSync(file, 'utf8');
      if (pattern.test(text)) offenders.push(relativePosix(file));
    }
    expect(
      offenders,
      'The repository contract is data-only; it must not depend on runtime layers (hooks / components / infrastructure).',
    ).toEqual([]);
  });

  for (const fragment of LEGACY_RUNNER_FRAGMENTS) {
    it(`forbids imports referencing legacy runner entry point "${fragment}"`, () => {
      const pattern = buildImportPattern(fragment);
      const offenders: string[] = [];
      for (const file of repositoryFiles) {
        const text = readFileSync(file, 'utf8');
        if (pattern.test(text)) offenders.push(relativePosix(file));
      }
      expect(
        offenders,
        `Legacy generation runners must never be referenced from the repository contract. Only LocalGenerationRunRepository.ts may import them after Phase 0.5.`,
      ).toEqual([]);
    });
  }
});
