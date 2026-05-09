/**
 * Durable generation import and drift boundary test.
 *
 * Enforces that frontend runtime code cannot reintroduce deleted local
 * generation runners, generation HUD/log/applier surfaces, durable routing
 * flags, navigation abort reasons, snapshot/policy submission fields, browser
 * pipeline model/provider/healing settings, retired frontend permissive
 * prompt/parser paths, retired durable decision/plan archives, or direct
 * infrastructure adapter imports.
 *
 * Mirrors the pattern of `lucideImportBoundary.test.ts` and
 * `legacyParserBoundary.test.ts` while intentionally keeping backend-owned
 * durable orchestration seams available to backend code.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SELF), '../../..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const BACKEND_SRC_DIR = path.join(REPO_ROOT, 'backend', 'src');

/** Files or directories excluded from source scans. */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'out',
  'tests',
  '.git',
  'coverage',
]);

/** Allowed importers (infrastructure files that wire the durable repo). */
const ALLOWED_IMPORTERS = new Set([
  'src/infrastructure/wireGenerationClient.ts',
]);

const FRONTEND_RUNTIME_PREFIXES = [
  'src/features/',
  'src/components/',
  'src/hooks/',
] as const;

const FRONTEND_SOURCE_PREFIXES = [
  ...FRONTEND_RUNTIME_PREFIXES,
  'src/infrastructure/',
] as const;

const DURABLE_CONTRACT_SEAM_PREFIX = 'src/features/generationContracts/';

/** Forbidden infrastructure adapter references — any match triggers a failure. */
const FORBIDDEN_INFRASTRUCTURE_IMPORTS = [
  'DurableGenerationRunRepository',
  '@/infrastructure/http/apiClient',
  '@/infrastructure/http/sseClient',
] as const;

const DEPRECATED_PIPELINE_IMPORT_FRAGMENTS = [
  ['extract', 'JsonString'].join(''),
  ['parse', 'TopicCardsPayload'].join(''),
  ['parse', 'TopicTheoryContentPayload'].join(''),
  ['parse', 'CrystalTrialPayload'].join(''),
  ['parse', 'TopicLatticeResponse'].join(''),
] as const;

const FORBIDDEN_FRONTEND_RUNTIME_FRAGMENTS = [
  ['LocalGeneration', 'RunRepository'].join(''),
  ['Generation', 'ProgressHud'].join(''),
  ['generation', 'LogStore'].join(''),
  ['generation', 'Log'].join(''),
  ['generation', 'RunStore'].join(''),
  ['Applied', 'ArtifactsStore'].join(''),
  ['applied', 'Artifacts'].join(''),
  ['runTopic', 'GenerationPipeline'].join(''),
  ['runExpansion', 'Job'].join(''),
  ['generateTrial', 'Questions'].join(''),
  ['subjectGeneration/', 'orchestrator'].join(''),
] as const;

const FORBIDDEN_RUNTIME_FLAG_AND_ABORT_FRAGMENTS = [
  ['NEXT_PUBLIC_', 'DURABLE_RUNS'].join(''),
  "kind: 'navigation'",
  'kind: "navigation"',
  "reason: 'navigation'",
  'reason: "navigation"',
] as const;

const FORBIDDEN_SUBMISSION_FIELD_FRAGMENTS = [
  'modelId',
  'model_id',
  'providerHealingRequested',
  'responseHealing',
  'plugins',
  'response_format',
  'snapshot',
  'snapshotJson',
  'snapshot_json',
] as const;

const RETIRED_REPOSITORY_PATH_PATTERNS = [
  /^docs\/infrastructure-decisions\.md$/i,
  /(^|\/)(?:durable-workflow-orchestration-v\d+|historical-durable-workflow-orchestration)(?:\.[a-z0-9]+)?$/i,
  /(^|\/)(?:durable-workflow-orchestration|durable-generation)-(?:archive|archived|history|historical|summary|decisions)(?:\.[a-z0-9]+)?$/i,
  /(^|\/)(?:archive|archived|history|historical)\/.*durable.*(?:workflow|generation|orchestration).*\.md$/i,
] as const;

const RETIRED_LEGACY_GENERATION_PATH_PATTERNS = [
  /^src\/features\/contentGeneration\/messages\//,
  /^src\/features\/contentGeneration\/parsers\//,
  /^src\/features\/contentGeneration\/schemas\/(?:topicMiniGameCardsResponseFormat|topicTheoryResponseFormat)\.ts$/,
  /^src\/features\/subjectGeneration\/graph\/parseGraphResponse(?:\.test)?\.ts$/,
  /^src\/features\/subjectGeneration\/graph\/topicLattice\/buildTopicLatticeMessages(?:\.test)?\.ts$/,
  /^src\/features\/subjectGeneration\/graph\/topicLattice\/parseTopicLatticeResponse(?:\.test)?\.ts$/,
  /^src\/prompts\/subject-graph-topics\.prompt$/,
] as const;

const SETTINGS_SOURCE_PATH_FRAGMENTS = [
  '/settings/',
  '/Settings/',
  'Settings',
  'settings',
  'src/store/',
] as const;

const PIPELINE_SETTING_SCOPE_FRAGMENTS = [
  'topicContent',
  'topicExpansion',
  'subjectGraph',
  'crystalTrial',
  'topic-content',
  'topic-expansion',
  'subject-graph',
  'crystal-trial',
  'generationPipeline',
  'pipelineGeneration',
  'pipelineModel',
  'pipelineProvider',
  'pipelineHealing',
  'generationModel',
  'generationProvider',
  'generationHealing',
] as const;

const FORBIDDEN_PIPELINE_SETTING_FIELD_FRAGMENTS = [
  'modelId',
  'model_id',
  'providerId',
  'responseHealing',
  'providerHealingRequested',
  'openRouterResponseHealing',
  'plugins',
  'response_format',
] as const;

function collectFiles(dir: string, includeFile: (entry: fs.Dirent) => boolean): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...collectFiles(fullPath, includeFile));
    } else if (includeFile(entry)) {
      files.push(path.relative(REPO_ROOT, fullPath).replace(/\\/g, '/'));
    }
  }
  return files;
}

function collectSourceFiles(dir: string): string[] {
  return collectFiles(
    dir,
    (entry) =>
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.ts'),
  );
}

function collectRepositoryFilePaths(): string[] {
  return collectFiles(REPO_ROOT, () => true);
}

function collectRuntimeSourceFiles(): string[] {
  return [SRC_DIR, BACKEND_SRC_DIR].flatMap(collectSourceFiles);
}

function readRuntimeFile(file: string): string {
  return fs.readFileSync(path.resolve(REPO_ROOT, file), 'utf-8');
}

function isFrontendRuntimeFile(file: string): boolean {
  return FRONTEND_RUNTIME_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function isFrontendSourceFile(file: string): boolean {
  return FRONTEND_SOURCE_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function isBrowserSettingsSourceFile(file: string): boolean {
  return isFrontendSourceFile(file) && SETTINGS_SOURCE_PATH_FRAGMENTS.some((fragment) => file.includes(fragment));
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildImportPattern(specifierFragment: string): RegExp {
  return new RegExp(
    `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*)['"][^'"]*${escapeRegex(specifierFragment)}[^'"]*['"]`,
  );
}

function extractGenerationRunIntentBlock(repositorySource: string): string {
  const match = repositorySource.match(
    /export type GenerationRunIntent =[\s\S]*?export type SubmitGenerationRunInput = GenerationRunIntent;/,
  );
  if (!match) {
    throw new Error('Unable to locate GenerationRunIntent/SubmitGenerationRunInput block in src/types/repository.ts');
  }
  return match[0];
}

describe('durable generation import boundary', () => {
  it('scans repository-root-relative runtime files instead of a truncated subtree', () => {
    const sourceFiles = collectRuntimeSourceFiles();

    expect(sourceFiles.some((file) => file.startsWith('src/features/'))).toBe(true);
    expect(sourceFiles.some((file) => file.startsWith('src/components/'))).toBe(true);
    expect(sourceFiles.some((file) => file.startsWith('src/hooks/'))).toBe(true);
    expect(sourceFiles.some((file) => file.startsWith('backend/src/'))).toBe(true);
  });

  it('no feature, component, or hook imports DurableGenerationRunRepository, apiClient, or sseClient', () => {
    const sourceFiles = collectRuntimeSourceFiles();
    const violations: string[] = [];

    for (const file of sourceFiles) {
      if (ALLOWED_IMPORTERS.has(file)) continue;
      if (!isFrontendRuntimeFile(file)) continue;

      const content = readRuntimeFile(file);
      for (const forbidden of FORBIDDEN_INFRASTRUCTURE_IMPORTS) {
        if (content.includes(forbidden)) {
          violations.push(`${file}: imports '${forbidden}'`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps backend and pipeline code off deprecated permissive prompt/parser seams', () => {
    const sourceFiles = collectRuntimeSourceFiles().filter(
      (file) => file.startsWith('backend/src/') || file.startsWith('src/features/contentGeneration/pipelines/'),
    );
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const content = readRuntimeFile(file);
      for (const fragment of DEPRECATED_PIPELINE_IMPORT_FRAGMENTS) {
        if (buildImportPattern(fragment).test(content)) {
          violations.push(`${file}: imports deprecated parser/helper '${fragment}'`);
        }
      }
    }

    expect(
      violations,
      'Durable backend and pipeline code must use strict contract parsers or already-published Learning Content fields, not legacy permissive LLM-response parser modules.',
    ).toEqual([]);
  });

  it('does not reintroduce local generation runners, HUDs, logs, or artifact appliers in frontend runtime code', () => {
    const sourceFiles = collectRuntimeSourceFiles().filter(isFrontendSourceFile);
    const violations: string[] = [];

    for (const file of sourceFiles) {
      if (file.startsWith(DURABLE_CONTRACT_SEAM_PREFIX)) continue;
      const content = readRuntimeFile(file);
      for (const fragment of FORBIDDEN_FRONTEND_RUNTIME_FRAGMENTS) {
        if (file.includes(fragment) || content.includes(fragment)) {
          violations.push(`${file}: contains retired frontend generation surface '${fragment}'`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('does not reintroduce durable routing flags or navigation abort reasons in runtime code', () => {
    const sourceFiles = collectRuntimeSourceFiles();
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const content = readRuntimeFile(file);
      for (const fragment of FORBIDDEN_RUNTIME_FLAG_AND_ABORT_FRAGMENTS) {
        if (content.includes(fragment)) {
          violations.push(`${file}: contains retired flag/abort fragment '${fragment}'`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps frontend runtime imports of snapshot builders and inputHash out of non-contract seams', () => {
    const sourceFiles = collectRuntimeSourceFiles().filter(isFrontendSourceFile);
    const violations: string[] = [];

    for (const file of sourceFiles) {
      if (file.startsWith(DURABLE_CONTRACT_SEAM_PREFIX)) continue;
      const content = readRuntimeFile(file);
      if (buildImportPattern('/generationContracts/snapshots').test(content)) {
        violations.push(`${file}: imports generation contract snapshot internals`);
      }
      if (buildImportPattern('/generationContracts/canonicalHash').test(content)) {
        violations.push(`${file}: imports generation contract hash internals`);
      }
      const contractImportMatches = content.matchAll(
        /import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+['"]@\/features\/generationContracts['"]/g,
      );
      for (const match of contractImportMatches) {
        const names = match[1].split(',').map((name) => name.trim().replace(/^type\s+/, ''));
        for (const name of names) {
          if (name === 'inputHash' || /^build[A-Za-z0-9]+Snapshot$/.test(name)) {
            violations.push(`${file}: imports '${name}' from the generation contract barrel`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps frontend run submission intent-only', () => {
    const repositoryPath = 'src/types/repository.ts';
    const generationClientPath = 'src/features/contentGeneration/generationClient.ts';
    const checkedBlocks = [
      { file: repositoryPath, content: extractGenerationRunIntentBlock(readRuntimeFile(repositoryPath)) },
      { file: generationClientPath, content: readRuntimeFile(generationClientPath) },
    ];
    const violations: string[] = [];

    for (const { file, content } of checkedBlocks) {
      for (const fragment of FORBIDDEN_SUBMISSION_FIELD_FRAGMENTS) {
        if (content.includes(fragment)) {
          violations.push(`${file}: frontend submission seam contains '${fragment}'`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps browser settings from reintroducing generation pipeline model/provider/healing controls', () => {
    const settingsFiles = collectRuntimeSourceFiles().filter(isBrowserSettingsSourceFile);
    const violations: string[] = [];

    for (const file of settingsFiles) {
      const lines = readRuntimeFile(file).split('\n');
      lines.forEach((line, index) => {
        const hasPipelineScope = PIPELINE_SETTING_SCOPE_FRAGMENTS.some((fragment) => line.includes(fragment));
        const hasForbiddenField = FORBIDDEN_PIPELINE_SETTING_FIELD_FRAGMENTS.some((fragment) => line.includes(fragment));
        if (hasPipelineScope && hasForbiddenField) {
          violations.push(`${file}:${index + 1}: appears to configure generation pipeline policy in browser settings`);
        }
      });
    }

    expect(
      violations,
      'Pipeline model/provider/healing policy must stay backend-owned. Browser settings may configure study-explanation surfaces only.',
    ).toEqual([]);
  });

  it('keeps retired frontend permissive prompt/parser modules deleted', () => {
    const existing = collectRepositoryFilePaths().filter((file) =>
      RETIRED_LEGACY_GENERATION_PATH_PATTERNS.some((pattern) => pattern.test(file)),
    );

    expect(
      existing,
      'Durable generation owns prompt construction and artifact parsing in backend/contracts modules; retired frontend permissive prompt/parser paths must not return.',
    ).toEqual([]);
  });

  it('keeps retired infrastructure decisions and historical durable plan archives deleted', () => {
    const existing = collectRepositoryFilePaths().filter((file) =>
      RETIRED_REPOSITORY_PATH_PATTERNS.some((pattern) => pattern.test(file)),
    );

    expect(existing).toEqual([]);
  });
});
