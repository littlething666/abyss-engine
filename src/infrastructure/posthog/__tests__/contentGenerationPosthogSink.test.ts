import { describe, expect, it, vi } from 'vitest';

import { appEventBus } from '@/infrastructure/eventBus';

import type { AnalyticsSink } from '../client';
import {
  APP_BUS_TO_POSTHOG,
  forwardAppBusToPosthog,
} from '../contentGenerationPosthogSink';

function makeSink(): AnalyticsSink {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    setPersonProperties: vi.fn(),
  };
}

const ALLOWED_REQUEST_PHASE_EVENTS = [
  'topic-content:generation-requested',
  'subject-graph:generation-requested',
  'crystal-trial:pregeneration-requested',
] as const;

describe('APP_BUS_TO_POSTHOG mapping', () => {
  it('only contains the documented request-phase event families', () => {
    expect(Object.keys(APP_BUS_TO_POSTHOG).sort()).toEqual(
      [...ALLOWED_REQUEST_PHASE_EVENTS].sort(),
    );
  });

  it('preserves canonical event names verbatim (no transform)', () => {
    for (const key of ALLOWED_REQUEST_PHASE_EVENTS) {
      expect(APP_BUS_TO_POSTHOG[key]?.posthogEvent).toBe(key);
    }
  });
});

describe('forwardAppBusToPosthog', () => {
  it('forwards topic-content:generation-requested with stage defaults', () => {
    const sink = makeSink();
    const dispose = forwardAppBusToPosthog(sink, appEventBus);
    try {
      appEventBus.emit('topic-content:generation-requested', {
        subjectId: 'subj-1',
        topicId: 't-1',
      });
      expect(sink.capture).toHaveBeenCalledWith(
        'topic-content:generation-requested',
        expect.objectContaining({
          subjectId: 'subj-1',
          topicId: 't-1',
          stage: 'full',
          forceRegenerate: false,
          enableReasoning: false,
        }),
      );
    } finally {
      dispose();
    }
  });

  it('forwards explicit stage / reasoning / forceRegenerate fields when present', () => {
    const sink = makeSink();
    const dispose = forwardAppBusToPosthog(sink, appEventBus);
    try {
      appEventBus.emit('topic-content:generation-requested', {
        subjectId: 'subj-1',
        topicId: 't-1',
        stage: 'study-cards',
        forceRegenerate: true,
        enableReasoning: true,
      });
      expect(sink.capture).toHaveBeenCalledWith(
        'topic-content:generation-requested',
        expect.objectContaining({
          subjectId: 'subj-1',
          topicId: 't-1',
          stage: 'study-cards',
          forceRegenerate: true,
          enableReasoning: true,
        }),
      );
    } finally {
      dispose();
    }
  });

  it('forwards crystal-trial:pregeneration-requested with all level fields', () => {
    const sink = makeSink();
    const dispose = forwardAppBusToPosthog(sink, appEventBus);
    try {
      appEventBus.emit('crystal-trial:pregeneration-requested', {
        subjectId: 'subj-1',
        topicId: 't-1',
        currentLevel: 1,
        targetLevel: 2,
      });
      expect(sink.capture).toHaveBeenCalledWith(
        'crystal-trial:pregeneration-requested',
        expect.objectContaining({
          subjectId: 'subj-1',
          topicId: 't-1',
          currentLevel: 1,
          targetLevel: 2,
        }),
      );
    } finally {
      dispose();
    }
  });

  it('does NOT forward non-request-phase events such as card:reviewed', () => {
    const sink = makeSink();
    const dispose = forwardAppBusToPosthog(sink, appEventBus);
    try {
      appEventBus.emit('card:reviewed', {
        cardId: 'c-1',
        rating: 3,
        subjectId: 'subj-1',
        topicId: 't-1',
        sessionId: 's-1',
        timeTakenMs: 1000,
        buffedReward: 10,
        buffMultiplier: 1,
        difficulty: 2,
        isCorrect: true,
      });
      expect(sink.capture).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });

  it('returns an unsubscribe function that detaches all listeners', () => {
    const sink = makeSink();
    const dispose = forwardAppBusToPosthog(sink, appEventBus);
    dispose();

    appEventBus.emit('topic-content:generation-requested', {
      subjectId: 'subj-1',
      topicId: 't-1',
    });
    expect(sink.capture).not.toHaveBeenCalled();
  });
});
