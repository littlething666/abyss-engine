import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Architectural guard: nothing under `src/features/generationContracts/**`
 * may import the legacy permissive parsers or the permissive
 * `extractJsonString()` recovery helper.
 *
 * The Durable Workflow Orchestration plan locks Phase 0 step 4: legacy
 * permissive parsers are deprecated for durable pipeline paths and the
 * strict parsers in `strictParsers/` must use direct `JSON.parse` + Zod with
 * no fence stripping, no embedded-JSON extraction, and no shape fallback.
 * This test enforces that boundary at the import-graph level so any future
 * agent who tries to fold permissive recovery back into the contracts
 * module fails loudly in CI.
 *
 * Forbidden import specifiers (any form, including subpath / extension):
 *   - `@/lib/llmResponseText`
 *   - `@/features/contentGeneration/parsers/parseTopicCardsPayload`
 *   - `@/features/contentGeneration/parsers/parseTopicTheoryContentPayload`
 *   - `@/features/contentGeneration/parsers/parseCrystalTrialPayload`
 *   - `@/features/subjectGeneration/graph/topicLattice/parseTopicLatticeResponse`
 *   - any relative path that resolves to those files.
 *
 * The test scans this file's containing module subtree (`generationContracts/`)
 * and asserts no source file imports a forbidden specifier. The test file
 * itself is excluded from the scan since it must mention the strings.
 */

const SELF = fileURLToPath(import.meta.url);
const CONTRACTS_ROOT = path.resolve(path.dirname(SELF), '..');

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

// Pattern fragments concatenated at runtime so this file's own source does
// not match the regexes it executes against.
const LLM_RESPONSE_TEXT_LITERAL = ['llmResponseText'].join('');
const PARSE_TOPIC_CARDS_LITERAL = ['parseTopicCardsPayload'].join('');
const PARSE_TOPIC_THEORY_LITERAL = ['parseTopicTheoryContentPayload'].join('');
const PARSE_CRYSTAL_TRIAL_LITERAL = ['parseCrystalTrialPayload'].join('');
const PARSE_TOPIC_LATTICE_LITERAL = ['parseTopicLatticeResponse'].join('');

const FORBIDDEN_SPECIFIER_FRAGMENTS = [
  LLM_RESPONSE_TEXT_LITERAL,
  PARSE_TOPIC_CARDS_LITERAL,
  PARSE_TOPIC_THEORY_LITERAL,
  PARSE_CRYSTAL_TRIAL_LITERAL,
  PARSE_TOPIC_LATTICE_LITERAL,
] as const;

function buildImportPattern(fragment: string): RegExp {
  // Matches:
  //   import ... from '...<fragment>...'
  //   import ... from "...<fragment>..."
  //   import('...<fragment>...')
  //   require('...<fragment>...')
  // Both bare and aliased / relative paths.
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*)['"][^'"]*${escaped}[^'"]*['"]`,
  );
}

function walkSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkSource(full));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

function relativePosix(file: string): string {
  return path.relative(CONTRACTS_ROOT, file).split(path.sep).join('/');
}

describe('generationContracts → legacy permissive parser import boundary', () => {
  const files = walkSource(CONTRACTS_ROOT).filter(
    (file) => path.resolve(file) !== SELF,
  );

  it('discovers source files to scan under src/features/generationContracts/', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const fragment of FORBIDDEN_SPECIFIER_FRAGMENTS) {
    it(`forbids imports referencing "${fragment}" anywhere under src/features/generationContracts/`, () => {
      const pattern = buildImportPattern(fragment);
      const offenders: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        if (pattern.test(text)) {
          offenders.push(relativePosix(file));
        }
      }
      expect(
        offenders,
        `No file under src/features/generationContracts/ may import the legacy permissive parser "${fragment}". The strict pipeline parsers must use JSON.parse + Zod directly, with no fence stripping or embedded-JSON extraction. Migrate the offending file to strictParse / strictParseArtifact instead.`,
      ).toEqual([]);
    });
  }
});
