import type { ContentGenerationJob } from '@/types/contentGeneration';

/** Counts how many prior manual-retried jobs precede this run (`retryOf` chain length). */
export function countManualRetryDepth(
  retryOfJobId: string | undefined,
  jobs: Record<string, ContentGenerationJob>,
): number {
  if (!retryOfJobId) return 0;
  let depth = 0;
  let id: string | null | undefined = retryOfJobId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    depth += 1;
    id = jobs[id]?.retryOf ?? undefined;
    if (!id) break;
  }
  return depth;
}
