import { describe, it, expect, vi, afterEach } from 'vitest';

import { appEventBus } from '@/infrastructure/eventBus';

import { emitCrystalTrialPregenerateForTopic } from './emitCrystalTrialPregenerate';

describe('emitCrystalTrialPregenerateForTopic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits crystal:trial-pregenerate with levels derived from crystal XP', () => {
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    emitCrystalTrialPregenerateForTopic(
      { subjectId: 's1', topicId: 't1' },
      [
        {
          subjectId: 's1',
          topicId: 't1',
          gridPosition: [0, 0],
          xp: 150,
          spawnedAt: 1,
        },
      ],
    );

    expect(emitSpy).toHaveBeenCalledWith('crystal:trial-pregenerate', {
      subjectId: 's1',
      topicId: 't1',
      currentLevel: 1,
      targetLevel: 2,
    });
  });

  it('does not emit when the topic has no crystal', () => {
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    emitCrystalTrialPregenerateForTopic({ subjectId: 's1', topicId: 't1' }, []);

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('does not emit at max crystal level', () => {
    const emitSpy = vi.spyOn(appEventBus, 'emit');

    emitCrystalTrialPregenerateForTopic(
      { subjectId: 's1', topicId: 't1' },
      [
        {
          subjectId: 's1',
          topicId: 't1',
          gridPosition: [0, 0],
          xp: 500,
          spawnedAt: 1,
        },
      ],
    );

    expect(emitSpy).not.toHaveBeenCalled();
  });
});
