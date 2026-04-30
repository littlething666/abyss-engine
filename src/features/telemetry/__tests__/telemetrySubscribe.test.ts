import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { telemetry } from '..';
import type { TelemetryEvent } from '../types';

describe('telemetry.subscribe (Phase 2 fan-out)', () => {
  beforeEach(() => {
    telemetry.__resetSubscribersForTests();
  });

  afterEach(() => {
    telemetry.__resetSubscribersForTests();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('invokes the listener synchronously inside telemetry.log on a valid payload', () => {
    const seen: TelemetryEvent[] = [];
    telemetry.subscribe((e) => seen.push(e));

    telemetry.log(
      'study-session:started',
      { sessionId: 's1', subjectId: 'subj-1', topicId: 't-1' },
      { sessionId: 's1', subjectId: 'subj-1', topicId: 't-1' },
    );

    expect(seen).toHaveLength(1);
    const event = seen[0]!;
    expect(event.type).toBe('study-session:started');
    expect(event.payload).toMatchObject({
      sessionId: 's1',
      subjectId: 'subj-1',
      topicId: 't-1',
    });
    expect(event.subjectId).toBe('subj-1');
    expect(event.topicId).toBe('t-1');
    expect(event.sessionId).toBe('s1');
    expect(event.version).toBe('v1');
    expect(typeof event.id).toBe('string');
    expect(typeof event.timestamp).toBe('number');
  });

  it('returns an unsubscribe function that detaches the listener', () => {
    const listener = vi.fn();
    const off = telemetry.subscribe(listener);

    telemetry.log('study-session:started', {
      sessionId: 's1',
      subjectId: 'subj-1',
      topicId: 't-1',
    });
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    telemetry.log('study-session:started', {
      sessionId: 's2',
      subjectId: 'subj-1',
      topicId: 't-1',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies multiple listeners in registration order', () => {
    const order: string[] = [];
    telemetry.subscribe(() => order.push('a'));
    telemetry.subscribe(() => order.push('b'));
    telemetry.subscribe(() => order.push('c'));

    telemetry.log('study-session:started', {
      sessionId: 's1',
      subjectId: 'subj-1',
      topicId: 't-1',
    });

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('isolates listener exceptions so other listeners still fire', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const a = vi.fn(() => {
      throw new Error('boom');
    });
    const b = vi.fn();
    telemetry.subscribe(a);
    telemetry.subscribe(b);

    telemetry.log('study-session:started', {
      sessionId: 's1',
      subjectId: 'subj-1',
      topicId: 't-1',
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('does not notify subscribers when the payload fails Zod validation in production (silent drop)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const listener = vi.fn();
    telemetry.subscribe(listener);

    expect(() =>
      telemetry.log(
        'study-session:started',
        { sessionId: 's1' } as unknown as Parameters<typeof telemetry.log>[1],
      ),
    ).not.toThrow();

    expect(listener).not.toHaveBeenCalled();
  });

  it('throws on invalid payload in non-production builds (Phase 2 dev-only failure)', () => {
    // Vitest sets NODE_ENV to 'test' by default — not 'production'.
    expect(() =>
      telemetry.log(
        'study-session:started',
        { sessionId: 's1' } as unknown as Parameters<typeof telemetry.log>[1],
      ),
    ).toThrow(/invalid payload for study-session:started/);
  });
});
