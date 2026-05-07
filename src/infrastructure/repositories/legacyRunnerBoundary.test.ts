/**
 * Legacy runner import boundary test — Phase 4.
 *
 * Enforces the Phase 0.5 invariant: after routing all generation entry
 * paths through `GenerationClient`, no code outside the sanctioned
 * adapter (`LocalGenerationRunRepository.ts`) may import the four
 * legacy generation runner entry points.
 *
 * ## Allowed importers
 *
 * - `LocalGenerationRunRepository.ts` — the adapter that wraps legacy runners
 * - The legacy runner files themselves (and their test files)
 * - Public feature barrels (`contentGeneration/index.ts`,
 *   `crystalTrial/index.ts`, `subjectGeneration/index.ts`) for re-export
 *   consumed by the adapter
 * - `src/types/repository.ts` / `src/infrastructure/eventBus.ts` —
 *   type-level references in JSDoc/comments only
 * - `backend/` — Worker-side workflows (separate compilation unit)
 *
 * ## Forbidden importers
 *
 * - `src/features/*` (except explicitly allowlisted)
 * - `src/components/*`
 * - `src/hooks/*`
 * - `src/infrastructure/eventBusHandlers.ts` — must route through
 *   `GenerationClient` (Phase 0.5 step 4 invariant)
 * - Other `src/infrastructure/*` files (except allowlisted)
 * - `src/store/*`, `src/lib/*`, `src/graphics/*`, `src/app/*`
 *
 * Drift prevention: this guard runs as part of `pnpm test:unit:run`.
 * A future agent who reconnects a feature or hook to a legacy runner
 * fails loudly here.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = path.resolve(import.meta.dirname ?? __dirname, '../../..');

/** Directories excluded from the scan entirely. */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'out',
  '.git',
  'coverage',
]);

/**
 * Files explicitly allowed to import legacy runner entry points.
 *
 * Phase 4 note: when `LocalGenerationRunRepository` is deleted (Phase 4
 * item 5), this allowlist shrinks to only the legacy runner files
 * themselves (until Phase 4 item 6 removes them too).
 */
const ALLOWED_IMPORTERS = new Set([
  // The sanctioned adapter
  'src/infrastructure/repositories/LocalGenerationRunRepository.ts',

  // The adapter's artifact-capture helper
  'src/infrastructure/repositories/localGenerationRunArtifactCapture.ts',

  // Legacy runner files themselves
  'src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts',
  'src/features/contentGeneration/jobs/runExpansionJob.ts',
  'src/features/crystalTrial/generateTrialQuestions.ts',
  'src/features/subjectGeneration/orchestrator/subjectGenerationOrchestrator.ts',
  'src/features/subjectGeneration/orchestrator/resolveSubjectGenerationStageBindings.ts',

  // Public feature barrels (re-export for adapter consumption)
  'src/features/contentGeneration/index.ts',
  'src/features/crystalTrial/index.ts',
  'src/features/subjectGeneration/index.ts',

  // The wireGenerationClient bootstrap (creates LocalGenerationRunRepository)
  'src/infrastructure/wireGenerationClient.ts',

  // Type-level references only (JSDoc/comments)
  'src/types/repository.ts',
  'src/types/contentGeneration.ts',
  'src/infrastructure/eventBus.ts',

  // Telemetry types reference legacy runner surface names
  'src/features/telemetry/types.ts',
]);

/**
 * Legacy runner entry-point fragments. These are concatenated at runtime
 * so the test file's own source code never self-matches.
 */
const LEGACY_RUNNER_FRAGMENTS = [
  // runTopicGenerationPipeline
  ['runTopic', 'GenerationPipeline'].join(''),
  // runExpansionJob
  ['runExpansion', 'Job'].join(''),
  // generateTrialQuestions
  ['generateTrial', 'Questions'].join(''),
  // subjectGenerationOrchestrator (full file path fragment)
  ['subjectGeneration/orchestrator/', 'subjectGenerationOrchestrator'].join(''),
  // resolveSubjectGenerationStageBindings (Stage B prerequisite edge builder)
  ['subjectGeneration/orchestrator/resolve', 'SubjectGenerationStageBindings'].join(''),
] as const;

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(SRC_DIR, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...collectSourceFiles(fullPath));
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      files.push(relativePath);
    }
  }
  return files;
}

function buildFragmentRegex(fragment: string): RegExp {
  // Matches import specifiers containing the fragment.
  //   from '...<fragment>...'
  //   from "...<fragment>..."
  //   import('...<fragment>...')
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:from\\s*|import\\s*\\(\\s*)['"][^'"]*${escaped}[^'"]*['"]`,
  );
}

describe('legacy runner import boundary', () => {
  const sourceFiles = collectSourceFiles(SRC_DIR);

  it.each(LEGACY_RUNNER_FRAGMENTS)(
    'no file outside the allowlist imports legacy runner "%s"',
    (fragment) => {
      const regex = buildFragmentRegex(fragment);
      const violations: string[] = [];

      for (const file of sourceFiles) {
        // Skip backend files (separate compilation unit)
        if (file.startsWith('backend/')) continue;

        if (ALLOWED_IMPORTERS.has(file)) continue;

        // Skip test files (always allowed to import what they test)
        // Already excluded by the file extension filter above.

        try {
          const content = fs.readFileSync(path.resolve(SRC_DIR, file), 'utf-8');
          if (regex.test(content)) {
            violations.push(`${file}: imports '${fragment}'`);
          }
        } catch {
          // Skip unreadable files
        }
      }

      expect(
        violations,
        [
          `Legacy runner '${fragment}' imported outside the allowed adapter.`,
          'Route through GenerationClient (src/features/contentGeneration/generationClient.ts)',
          'or add the file to ALLOWED_IMPORTERS in legacyRunnerBoundary.test.ts',
          'after an architectural review (see AGENTS.md durable-run composition root).',
        ].join('\n'),
      ).toEqual([]);
    },
  );

  /**
   * Specific invariant: `eventBusHandlers.ts` must not import legacy runners.
   * This was the Phase 0.5 step 4 migration — all dispatch sites in
   * eventBusHandlers were moved to route through `GenerationClient`.
   */
  it('eventBusHandlers.ts does not import any legacy runner', () => {
    const filePath = path.resolve(SRC_DIR, 'src/infrastructure/eventBusHandlers.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    for (const fragment of LEGACY_RUNNER_FRAGMENTS) {
      const regex = buildFragmentRegex(fragment);
      expect(
        regex.test(content),
        `eventBusHandlers.ts imports legacy runner '${fragment}'. Route through GenerationClient instead.`,
      ).toBe(false);
    }
  });
});
