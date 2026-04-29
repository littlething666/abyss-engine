import { describe, expect, it } from 'vitest';

import {
  buildTimelineEntries,
  buildTimelineSummaryBuckets,
  filterTimelineEntriesByOccurredRange,
  groupTimelineEntriesBySession,
  sortStudyTimelineSessionGroupsByFirstOccurredAt,
  TIMELINE_LAYER_REVIEW_TYPES,
} from './timeline';
import type { StudyTimelineSessionGroup } from './timeline';
import type { TelemetryEvent, TelemetryEventType } from './types';

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

describe('buildTimelineSummaryBuckets', () => {
  it('aggregates per local day and sorts newest day first', () => {
    const olderDay = now - 2 * dayMs;
    const newerDay = now - 0.5 * dayMs;
    const buckets = buildTimelineSummaryBuckets(
      [
        telemetryEvent(
          'study-card:reviewed',
          {
            cardId: 'c1',
            rating: 3,
            isCorrect: true,
            difficulty: 2,
            timeTakenMs: 1000,
            buffMultiplier: 1,
          },
          { timestamp: olderDay },
        ),
        telemetryEvent(
          'study-session:completed',
          {
            sessionId: 's1',
            topicId: 'topic-a',
            totalAttempts: 2,
            correctRate: 1,
            sessionDurationMs: 500,
          },
          { timestamp: newerDay },
        ),
        telemetryEvent(
          'study-card:reviewed',
          {
            cardId: 'c2',
            rating: 2,
            isCorrect: false,
            difficulty: 1,
            timeTakenMs: 2000,
            buffMultiplier: 1,
          },
          { timestamp: newerDay },
        ),
      ],
      { now, daysWindow: 7, topicMetadata: { 'topic-a': { topicName: 'Topic A' } } },
    );

    expect(buckets.length).toBe(2);
    expect(buckets[0]!.dayStartMs).toBeGreaterThan(buckets[1]!.dayStartMs);
    const newest = buckets[0]!;
    expect(newest.sessionsCompleted).toBe(1);
    expect(newest.cardsReviewed).toBe(1);
    expect(newest.correctReviews).toBe(0);
    expect(newest.totalReviewMs).toBe(2000);
    const oldest = buckets[1]!;
    expect(oldest.cardsReviewed).toBe(1);
    expect(oldest.correctReviews).toBe(1);
  });

  it('counts attunement rituals per day', () => {
    const buckets = buildTimelineSummaryBuckets(
      [
        telemetryEvent(
          'attunement-ritual:submitted',
          {
            harmonyScore: 80,
            readinessBucket: 'high',
            checklistKeys: ['a'],
            buffsGranted: ['b1'],
          },
          { timestamp: now - 1000 },
        ),
      ],
      { now, daysWindow: 1 },
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.ritualsCompleted).toBe(1);
  });
});

describe('filterTimelineEntriesByOccurredRange', () => {
  it('keeps entries within [start, end)', () => {
    const entries = buildTimelineEntries(
      [
        telemetryEvent(
          'study-card:reviewed',
          {
            cardId: 'a',
            rating: 3,
            isCorrect: true,
            difficulty: 2,
            timeTakenMs: 100,
            buffMultiplier: 1,
          },
          { timestamp: 1000 },
        ),
        telemetryEvent(
          'study-card:reviewed',
          {
            cardId: 'b',
            rating: 3,
            isCorrect: true,
            difficulty: 2,
            timeTakenMs: 100,
            buffMultiplier: 1,
          },
          { timestamp: 5000 },
        ),
      ],
      { now: 10_000, daysWindow: 7, includeEventTypes: TIMELINE_LAYER_REVIEW_TYPES },
    );

    const filtered = filterTimelineEntriesByOccurredRange(entries, 0, 3000);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.cardId).toBe('a');
  });
});

describe('groupTimelineEntriesBySession', () => {
  it('groups by sessionId and sums duration', () => {
    const entries = buildTimelineEntries(
      [
        telemetryEvent(
          'study-card:reviewed',
          {
            cardId: 'x',
            rating: 3,
            isCorrect: true,
            difficulty: 2,
            timeTakenMs: 100,
            buffMultiplier: 1,
          },
          { sessionId: 's-one' },
        ),
        telemetryEvent(
          'study-card:reviewed',
          {
            cardId: 'y',
            rating: 3,
            isCorrect: true,
            difficulty: 2,
            timeTakenMs: 200,
            buffMultiplier: 1,
          },
          { sessionId: 's-one' },
        ),
      ],
      { now, daysWindow: 7, includeEventTypes: TIMELINE_LAYER_REVIEW_TYPES },
    );
    const groups = groupTimelineEntriesBySession(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.totalDurationMs).toBe(300);
    expect(groups[0]!.entries).toHaveLength(2);
  });
});

describe('sortStudyTimelineSessionGroupsByFirstOccurredAt', () => {
  it('orders sessions by earliest review occurredAt', () => {
    const earlier: StudyTimelineSessionGroup = {
      sessionId: 'late-id',
      topicName: 'T',
      totalDurationMs: 100,
      entries: [
        {
          id: '1',
          type: 'study-card:reviewed',
          topicId: 't',
          topicName: 'T',
          sessionId: 'late-id',
          timestamp: 2000,
          occurredAt: 2000,
          title: '',
          summary: '',
          metrics: [],
        },
      ],
    };
    const later: StudyTimelineSessionGroup = {
      sessionId: 'early-id',
      topicName: 'T',
      totalDurationMs: 100,
      entries: [
        {
          id: '2',
          type: 'study-card:reviewed',
          topicId: 't',
          topicName: 'T',
          sessionId: 'early-id',
          timestamp: 1000,
          occurredAt: 1000,
          title: '',
          summary: '',
          metrics: [],
        },
      ],
    };
    const sorted = sortStudyTimelineSessionGroupsByFirstOccurredAt([earlier, later]);
    expect(sorted.map((g) => g.sessionId)).toEqual(['early-id', 'late-id']);
  });

  it('uses sessionId when first occurredAt ties', () => {
    const b: StudyTimelineSessionGroup = {
      sessionId: 'session-b',
      topicName: 'T',
      totalDurationMs: 50,
      entries: [
        {
          id: 'b',
          type: 'study-card:reviewed',
          topicId: 't',
          topicName: 'T',
          sessionId: 'session-b',
          timestamp: 1000,
          occurredAt: 1000,
          title: '',
          summary: '',
          metrics: [],
        },
      ],
    };
    const a: StudyTimelineSessionGroup = {
      sessionId: 'session-a',
      topicName: 'T',
      totalDurationMs: 50,
      entries: [
        {
          id: 'a',
          type: 'study-card:reviewed',
          topicId: 't',
          topicName: 'T',
          sessionId: 'session-a',
          timestamp: 1000,
          occurredAt: 1000,
          title: '',
          summary: '',
          metrics: [],
        },
      ],
    };
    const sorted = sortStudyTimelineSessionGroupsByFirstOccurredAt([b, a]);
    expect(sorted.map((g) => g.sessionId)).toEqual(['session-a', 'session-b']);
  });
});
