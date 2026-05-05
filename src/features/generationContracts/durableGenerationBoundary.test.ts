/**
 * Durable generation import boundary test — Phase 1 PR-E.
 *
 * Enforces that features, components, and hooks do NOT import
 * `DurableGenerationRunRepository`, `apiClient`, or `sseClient`
 * directly. These are infrastructure adapters; the application
 * layer must route through `GenerationClient` and
 * `generationRunEventHandlers` (the sanctioned composition root).
 *
 * Mirrors the pattern of `lucideImportBoundary.test.ts` and
 * `legacyParserBoundary.test.ts` (Phases 0 step 4 / Phase 0.5).
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = path.resolve(import.meta.dirname ?? __dirname, '../..');

/** Files or directories excluded from the scan. */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'out',
  'backend',
  'tests',
  '.git',
  'coverage',
]);

/** Allowed importers (infrastructure files that wire the durable repo). */
const ALLOWED_IMPORTERS = new Set([
  'src/infrastructure/wireGenerationClient.ts',
]);

/** Forbidden import paths — any match triggers a failure. */
const FORBIDDEN_IMPORTS = [
  'DurableGenerationRunRepository',
  '@/infrastructure/http/apiClient',
  '@/infrastructure/http/sseClient',
];

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

describe('durable generation import boundary', () => {
  it('no feature, component, or hook imports DurableGenerationRunRepository, apiClient, or sseClient', () => {
    const sourceFiles = collectSourceFiles(SRC_DIR);
    const violations: string[] = [];

    for (const file of sourceFiles) {
      if (ALLOWED_IMPORTERS.has(file)) continue;

      // Only scan feature, component, and hook directories
      if (
        !file.startsWith('src/features/') &&
        !file.startsWith('src/components/') &&
        !file.startsWith('src/hooks/')
      ) {
        continue;
      }

      try {
        const content = fs.readFileSync(path.resolve(SRC_DIR, file), 'utf-8');
        for (const forbidden of FORBIDDEN_IMPORTS) {
          if (content.includes(forbidden)) {
            violations.push(`${file}: imports '${forbidden}'`);
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    expect(violations).toEqual([]);
  });
});
