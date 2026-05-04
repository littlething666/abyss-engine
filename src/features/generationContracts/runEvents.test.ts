import { describe, expect, it } from 'vitest';

import { runEventType, type RunEvent } from './runEvents';

const baseFields = { runId: 'r1', seq: 1, ts: '2026-05-04T12:00:00.000Z' } as const;

describe('runEventType', () => {
  it('returns the discriminator for every variant in the union', () => {
    const cases: Array<{ event: RunEvent; expected: RunEvent['type'] }> = [
      { event: { ...baseFields, type: 'run.queued' }, expected: 'run.queued' },
      {
        event: { ...baseFields, type: 'run.status', status: 'planning' },
        expected: 'run.status',
      },
      {
        event: {
          ...baseFields,
          type: 'stage.progress',
          body: { stage: 'theory', progress: 0.5 },
        },
        expected: 'stage.progress',
      },
      {
        event: {
          ...baseFields,
          type: 'artifact.ready',
          body: {
            artifactId: 'a1',
            kind: 'topic-theory',
            contentHash: 'cnt_abc',
            schemaVersion: 1,
            inputHash: 'inp_def',
          },
        },
        expected: 'artifact.ready',
      },
      { event: { ...baseFields, type: 'run.completed' }, expected: 'run.completed' },
      {
        event: {
          ...baseFields,
          type: 'run.failed',
          code: 'parse:zod-shape',
          message: 'bad',
        },
        expected: 'run.failed',
      },
      {
        event: { ...baseFields, type: 'run.cancel-acknowledged', reason: 'user' },
        expected: 'run.cancel-acknowledged',
      },
      {
        event: { ...baseFields, type: 'run.cancelled', reason: 'superseded' },
        expected: 'run.cancelled',
      },
    ];
    for (const { event, expected } of cases) {
      expect(runEventType(event)).toBe(expected);
    }
  });
});
