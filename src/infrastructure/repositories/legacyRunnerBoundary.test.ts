/**
 * Legacy generation deletion guard.
 *
 * Durable Worker workflows own generation execution. The browser must not keep
 * local runners, frontend run-log stores, HUD retry state, or local artifact
 * appliers around as dormant seams.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dirname ?? __dirname, '../../..');

const DELETED_LEGACY_FILES = [
  'src/infrastructure/repositories/LocalGenerationRunRepository.ts',
  'src/infrastructure/repositories/localGenerationRunArtifactCapture.ts',
  'src/infrastructure/repositories/contentGenerationLogRepository.ts',
  'src/features/contentGeneration/contentGenerationStore.ts',
  'src/features/contentGeneration/retryContentGeneration.ts',
  'src/features/contentGeneration/generationAttentionSurface.ts',
  'src/features/contentGeneration/runContentGenerationJob.ts',
  'src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts',
  'src/features/contentGeneration/jobs/runExpansionJob.ts',
  'src/features/contentGeneration/prepareGenerationRunSubmit.ts',
  'src/features/contentGeneration/appliers/topicContentApplier.ts',
  'src/features/contentGeneration/appliers/topicExpansionApplier.ts',
  'src/features/crystalTrial/generateTrialQuestions.ts',
  'src/features/crystalTrial/appliers/crystalTrialApplier.ts',
  'src/features/subjectGeneration/orchestrator/subjectGenerationOrchestrator.ts',
  'src/types/contentGeneration.ts',
  'src/types/contentGenerationAbort.ts',
] as const;

const FORBIDDEN_IMPORT_FRAGMENTS = [
  'LocalGenerationRunRepository',
  'localGenerationRunArtifactCapture',
  'contentGenerationLogRepository',
  'contentGenerationStore',
  'retryContentGeneration',
  'generationAttentionSurface',
  'runContentGenerationJob',
  'runTopicGenerationPipeline',
  'runExpansionJob',
  'prepareGenerationRunSubmit',
  'topicContentApplier',
  'topicExpansionApplier',
  'generateTrialQuestions',
  'crystalTrialApplier',
  'subjectGenerationOrchestrator',
  'types/contentGeneration',
  'contentGenerationAbort',
] as const;

const EXCLUDED_DIRS = new Set(['node_modules', '.next', 'dist', 'out', '.git', 'coverage']);

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.test.ts')) {
      files.push(relativePath);
    }
  }
  return files;
}

function importRegex(fragment: string): RegExp {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:from\\s*|import\\s*\\(\\s*)['"][^'"]*${escaped}[^'"]*['"]`);
}

describe('legacy generation deletion guard', () => {
  it.each(DELETED_LEGACY_FILES)('keeps %s deleted', (file) => {
    expect(fs.existsSync(path.resolve(ROOT_DIR, file))).toBe(false);
  });

  it('does not import deleted local generation seams from runtime code', () => {
    const violations: string[] = [];
    for (const file of collectSourceFiles(ROOT_DIR)) {
      if (file.startsWith('backend/')) continue;
      const content = fs.readFileSync(path.resolve(ROOT_DIR, file), 'utf-8');
      for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
        if (importRegex(fragment).test(content)) {
          violations.push(`${file}: imports ${fragment}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
