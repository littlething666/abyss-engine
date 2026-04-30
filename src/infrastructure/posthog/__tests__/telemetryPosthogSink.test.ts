import { describe, expect, it, vi } from 'vitest';

import {
  TelemetryEventTypeSchema,
  type TelemetryEvent,
} from '@/features/telemetry/types';

import type { AnalyticsSink } from '../client';
import {
  TELEMETRY_TO_POSTHOG,
  forwardTelemetryToPosthog,
  type TelemetrySubscribe,
} from '../telemetryPosthogSink';

function makeSink(): AnalyticsSink {
  return {
    capture: vi.fn(),
    identify: vi.fn(),
    setPersonProperties: vi.fn(),
  };
}

describe('TELEMETRY_TO_POSTHOG mapping', () => {
  // One assertion per `TelemetryEventType` — coverage guarantee per the
  // Phase 2 plan ("Mapping coverage tests, one assertion per
  // TelemetryEventType").
  it.each(TelemetryEventTypeSchema.options.map((t) => [t]))(
    '%s has a mapping with non-empty posthogEvent and a properties function',
    (type) => {
      expect(TELEMETRY_TO_POSTHOG).toHaveProperty(type);
      const mapping =
        TELEMETRY_TO_POSTHOG[type as keyof typeof TELEMETRY_TO_POSTHOG];
      expect(typeof mapping.posthogEvent).toBe('string');
      expect(mapping.posthogEvent.length).toBeGreaterThan(0);
      expect(typeof mapping.properties).toBe('function');
    },
  );

  it('preserves canonical event names verbatim (no transform)', () => {
    for (const type of TelemetryEventTypeSchema.options) {
      const mapping =
        TELEMETRY_TO_POSTHOG[type as keyof typeof TELEMETRY_TO_POSTHOG];
      expect(mapping.posthogEvent).toBe(type);
    }
  });

  it('default property builder spreads payload + envelope fields', () => {
    const mapping = TELEMETRY_TO_POSTHOG['study-card:reviewed'];
    const event: TelemetryEvent = {
      id: '00000000-0000-4000-8000-000000000010',
      version: 'v1',
      timestamp: 1700000000000,
      sessionId: 's1',
      subjectId: 'subj-1',
      topicId: 't-1',
      type: 'study-card:reviewed',
      payload: {
        cardId: 'c-1',
        rating: 3,
        isCorrect: true,
        difficulty: 2,
        timeTakenMs: 500,
        buffMultiplier: 1,
      },
    };
    expect(mapping.properties(event)).toMatchObject({
      cardId: 'c-1',
      rating: 3,
      sessionId: 's1',
      subjectId: 'subj-1',
      topicId: 't-1',
    });
  });
});

describe('forwardTelemetryToPosthog', () => {
  it('subscribes and forwards each event through the sink', () => {
    const sink = makeSink();
    let listener: ((event: TelemetryEvent) => void) | null = null;
    const subscribe: TelemetrySubscribe = (l) => {
      listener = l;
      return () => {
        listener = null;
      };
    };

    forwardTelemetryToPosthog(sink, subscribe);
    expect(listener).not.toBeNull();

    const event: TelemetryEvent = {
      id: '00000000-0000-4000-8000-000000000001',
      version: 'v1',
      timestamp: 1700000000000,
      sessionId: 's1',
      subjectId: 'subj-1',
      topicId: 't-1',
      type: 'study-session:started',
      payload: { sessionId: 's1', subjectId: 'subj-1', topicId: 't-1' },
    };
    listener!(event);

    expect(sink.capture).toHaveBeenCalledTimes(1);
    expect(sink.capture).toHaveBeenCalledWith(
      'study-session:started',
      expect.objectContaining({
        sessionId: 's1',
        subjectId: 'subj-1',
        topicId: 't-1',
      }),
    );
  });

  it('returns an unsubscribe function that detaches the listener', () => {
    const sink = makeSink();
    const off = vi.fn();
    const subscribe: TelemetrySubscribe = () => off;

    const dispose = forwardTelemetryToPosthog(sink, subscribe);
    dispose();

    expect(off).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for unknown event types (runtime safety net)', () => {
    const sink = makeSink();
    let listener: ((event: TelemetryEvent) => void) | null = null;
    const subscribe: TelemetrySubscribe = (l) => {
      listener = l;
      return () => {};
    };
    forwardTelemetryToPosthog(sink, subscribe);

    // Cast through unknown to bypass the compile-time check — this
    // simulates an upstream tool emitting an unrecognized event type.
    const event = {
      id: '00000000-0000-4000-8000-000000000002',
      version: 'v1',
      timestamp: 0,
      sessionId: null,
      subjectId: null,
      topicId: null,
      type: 'totally:unknown',
      payload: {},
    } as unknown as TelemetryEvent;
    listener!(event);

    expect(sink.capture).not.toHaveBeenCalled();
  });
});
