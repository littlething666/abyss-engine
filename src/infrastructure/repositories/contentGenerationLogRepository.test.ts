import { describe, expect, it, beforeEach } from 'vitest';

import type { ContentGenerationJob } from '@/types/contentGeneration';

import {
  clearPersistedLogs,
  loadPersistedLogs,
  persistPipeline,
  persistTerminalJob,
} from './contentGenerationLogRepository';

function terminalJob(id: string, finishedAt: number, pipelineId: string | null = null): ContentGenerationJob {
  return {
    id,
    pipelineId,
    kind: 'topic-theory',
    status: 'completed',
    label: 'L',
    subjectId: null,
    topicId: null,
    createdAt: finishedAt - 1,
    startedAt: finishedAt - 1,
    finishedAt,
    inputMessages: null,
    rawOutput: '',
    reasoningText: null,
    error: null,
    parseError: null,
  };
}

describe('contentGenerationLogRepository', () => {
  beforeEach(async () => {
    await clearPersistedLogs();
  });

  it('persists terminal jobs and prunes beyond 15 by finishedAt', async () => {
    for (let i = 0; i < 18; i += 1) {
      await persistTerminalJob(terminalJob(`j${i}`, 1000 + i));
    }
    const { jobs } = await loadPersistedLogs();
    expect(jobs.length).toBe(15);
    const ids = new Set(jobs.map((j) => j.id));
    expect(ids.has('j17')).toBe(true);
    expect(ids.has('j0')).toBe(false);
  });

  it('loadPersistedLogs returns pipelines referenced by jobs', async () => {
    const p = { id: 'pipe1', label: 'Unlock', createdAt: 1 };
    await persistPipeline(p);
    await persistTerminalJob(terminalJob('j1', 2000, 'pipe1'));
    const { jobs, pipelines } = await loadPersistedLogs();
    expect(jobs).toHaveLength(1);
    expect(pipelines.some((x) => x.id === 'pipe1')).toBe(true);
  });

  it('clearPersistedLogs empties tables', async () => {
    await persistTerminalJob(terminalJob('x', 1));
    await clearPersistedLogs();
    const { jobs } = await loadPersistedLogs();
    expect(jobs).toHaveLength(0);
  });
});
