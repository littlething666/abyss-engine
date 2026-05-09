import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SELF), '../../..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

const FORBIDDEN_RUNTIME_TEXT = [
  'GenerationProgressHud',
  'contentGenerationLogRepository',
  'useContentGenerationStore',
  'AppliedArtifactsStore',
  'createTopicContentApplier',
  'createTopicExpansionApplier',
  'createCrystalTrialApplier',
  'openRouterResponseHealing',
  "'subjectGenerationTopics'",
  '"subjectGenerationTopics"',
  "'subjectGenerationEdges'",
  '"subjectGenerationEdges"',
  "'topicContent'",
  '"topicContent"',
  "'crystalTrial'",
  '"crystalTrial"',
] as const;

const FORBIDDEN_RUNTIME_FILES = [
  'src/components/GenerationProgressHud.tsx',
  'src/infrastructure/repositories/LocalGenerationRunRepository.ts',
  'src/infrastructure/repositories/contentGenerationLogRepository.ts',
  'src/features/contentGeneration/contentGenerationStore.ts',
  'src/features/contentGeneration/runContentGenerationJob.ts',
  'src/features/contentGeneration/jobs/runExpansionJob.ts',
  'src/features/contentGeneration/pipelines/runTopicGenerationPipeline.ts',
  'src/features/crystalTrial/generateTrialQuestions.ts',
  'src/features/crystalTrial/appliers/crystalTrialApplier.ts',
  'src/features/generationContracts/artifacts/applier.ts',
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

describe('local workflow removal boundary', () => {
  const runtimeFiles = walk(SRC_ROOT)
    .filter((file) => path.resolve(file) !== SELF)
    .filter((file) => !file.endsWith('.test.ts'))
    .filter((file) => !file.endsWith('.test.tsx'));

  it('keeps deleted local generation runtime files deleted', () => {
    const existing = new Set(runtimeFiles.map(relative));
    const restored = FORBIDDEN_RUNTIME_FILES.filter((file) => existing.has(file));

    expect(
      restored,
      'Local generation runner/HUD/log/applier files must not be restored. Generation is durable-only and backend-applied.',
    ).toEqual([]);
  });

  it('forbids runtime references to local workflow seams', () => {
    const offenders: Array<{ file: string; text: string }> = [];
    for (const file of runtimeFiles) {
      const rel = relative(file);
      const text = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_RUNTIME_TEXT) {
        if (text.includes(forbidden)) offenders.push({ file: rel, text: forbidden });
      }
    }

    expect(
      offenders,
      'Frontend runtime must not reference local runners, generation HUD/log stores, frontend artifact appliers, or browser-owned generation policy settings.',
    ).toEqual([]);
  });
});
