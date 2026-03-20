import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIMELINE_DAYS,
  MAX_TIMELINE_DAYS,
  MIN_TIMELINE_DAYS,
  buildTimelineEntries,
} from '@/features/telemetry';
import type { TelemetryEvent, TelemetryEventType } from '@/features/telemetry';

const now = 1_700_000_000_000;
const dayMs = 24 * 60 * 60 * 1000;

function telemetryEvent<T extends TelemetryEventType>(
  type: T,
  payload: Record<string, unknown>,
  overrides: Partial<Omit<TelemetryEvent, 'type' | 'payload'>> = {},
): TelemetryEvent {
  return {
    id: `${type}-${overrides.id ?? Date.now()}`,
    type,
    version: 'v1',
    timestamp: overrides.timestamp ?? now,
    sessionId: overrides.sessionId ?? `session-${type}`,
    topicId: overrides.topicId ?? 'topic-a',
    payload,
  } as TelemetryEvent;
}

function testEvents(events: TelemetryEvent[]) {
  return buildTimelineEntries(events, {
    now,
    daysWindow: 7,
    topicMetadata: {
      'topic-a': { topicName: 'Topic A' },
      'topic-b': { topicName: 'Topic B' },
    },
  });
}

describe('timeline entries', () => {
  it('normalizes and merges study, ritual, and card review events', () => {
    const records = testEvents([
      telemetryEvent('attunement_ritual_submitted', {
        harmonyScore: 88,
        readinessBucket: 'high',
        checklistKeys: ['sleep', 'movement'],
        buffsGranted: ['xp_foresight'],
      }, {
        topicId: 'topic-a',
        timestamp: now - 6 * 60 * 60 * 1000,
        sessionId: 'ritual-1',
      }),
      telemetryEvent('study_session_complete', {
        sessionId: 'study-1',
        totalAttempts: 4,
        correctRate: 0.8,
        sessionDurationMs: 2300,
      }, {
        topicId: 'topic-a',
        sessionId: 'study-1',
        timestamp: now - 4 * 60 * 60 * 1000,
      }),
      telemetryEvent('study_card_reviewed', {
        cardId: 'card-3',
        rating: 3,
        isCorrect: true,
        difficulty: 2,
        timeTakenMs: 600,
        buffMultiplier: 1.15,
      }, {
        topicId: 'topic-b',
        sessionId: 'study-1',
        timestamp: now - 2 * 60 * 60 * 1000,
      }),
    ]);

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      type: 'attunement_ritual_submitted',
      topicName: 'Topic A',
    });
    expect(records[1]).toMatchObject({
      type: 'study_session_complete',
      topicName: 'Topic A',
    });
    expect(records[2]).toMatchObject({
      type: 'study_card_reviewed',
      topicName: 'Topic B',
      title: 'Study card reviewed',
      sessionId: 'study-1',
    });
  });

  it('tracks review duration on card-reviewed entries', () => {
    const records = buildTimelineEntries([
      telemetryEvent('study_card_reviewed', {
        cardId: 'card-3',
        rating: 3,
        isCorrect: true,
        difficulty: 2,
        timeTakenMs: 600,
        buffMultiplier: 1.15,
      }, {
        topicId: 'topic-b',
        sessionId: 'study-1',
        timestamp: now - 2 * 60 * 60 * 1000,
      }),
    ], {
      now,
      daysWindow: 7,
      topicMetadata: {
        'topic-b': { topicName: 'Topic B' },
      },
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      type: 'study_card_reviewed',
      cardId: 'card-3',
      durationMs: 600,
      isCorrect: true,
    });
  });

  it('filters timeline entries by event type', () => {
    const records = buildTimelineEntries([
      telemetryEvent('study_session_complete', {
        sessionId: 'study-session',
        totalAttempts: 2,
        correctRate: 0.8,
        sessionDurationMs: 1250,
      }, {
        topicId: 'topic-a',
        sessionId: 'study-session',
        timestamp: now - 3 * 60 * 60 * 1000,
      }),
      telemetryEvent('study_card_reviewed', {
        cardId: 'card-3',
        rating: 4,
        isCorrect: true,
        difficulty: 1,
        timeTakenMs: 600,
        buffMultiplier: 1.05,
      }, {
        topicId: 'topic-a',
        sessionId: 'study-session',
        timestamp: now - 2 * 60 * 60 * 1000,
      }),
      telemetryEvent('attunement_ritual_submitted', {
        harmonyScore: 70,
        readinessBucket: 'high',
        checklistKeys: ['sleep'],
        buffsGranted: ['focus'],
      }, {
        topicId: 'topic-a',
        sessionId: 'ritual-session',
        timestamp: now - 1 * 60 * 60 * 1000,
      }),
    ], {
      now,
      daysWindow: 7,
      includeEventTypes: ['study_card_reviewed'],
      topicMetadata: {
        'topic-a': { topicName: 'Topic A' },
      },
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'study_card_reviewed' });
  });

  it('filters entries to configured day windows', () => {
    const records = buildTimelineEntries([
      telemetryEvent('study_session_complete', {
        sessionId: 'recent-study',
        totalAttempts: 2,
        correctRate: 0.8,
        sessionDurationMs: 1250,
      }, {
        topicId: 'topic-a',
        timestamp: now - 5 * dayMs,
        sessionId: 'recent-study',
      }),
      telemetryEvent('attunement_ritual_submitted', {
        harmonyScore: 70,
        readinessBucket: 'medium',
        checklistKeys: ['sleep'],
        buffsGranted: ['focus'],
      }, {
        topicId: 'topic-a',
        sessionId: 'old-ritual',
        timestamp: now - 10 * dayMs,
      }),
    ], {
      now,
      daysWindow: 7,
    });
    expect(records.map((entry) => entry.sessionId)).toEqual(['recent-study']);
  });

  it('uses default and bounds for day windows', () => {
    const records = buildTimelineEntries([
      telemetryEvent('study_session_complete', {
        sessionId: 'study',
        totalAttempts: 1,
        correctRate: 0.9,
        sessionDurationMs: 1200,
      }, {
        timestamp: now - MIN_TIMELINE_DAYS * dayMs,
        sessionId: 'study',
      }),
      telemetryEvent('attunement_ritual_submitted', {
        harmonyScore: 75,
        readinessBucket: 'high',
        checklistKeys: [],
        buffsGranted: [],
      }, {
        timestamp: now - MIN_TIMELINE_DAYS * dayMs,
        sessionId: 'ritual',
      }),
    ], {
      now,
    });
    expect(records).toHaveLength(2);
    expect(records.map((entry) => entry.sessionId).sort()).toEqual(['ritual', 'study']);
    expect(DEFAULT_TIMELINE_DAYS).toBe(1);
    expect(MAX_TIMELINE_DAYS).toBe(90);
  });
});
