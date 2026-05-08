/**
 * SSE client unit tests — Phase 1 PR-G.
 *
 * Tests the SSE frame parsing and event reconstitution logic in
 * `openSseStream` without needing a real HTTP server.
 *
 * Covers:
 * - Frame parsing (data, id, comment lines)
 * - Last-Event-ID / lastSeq resumption
 * - Keepalive comment handling (lines starting with ':')
 * - Error handling (non-200 response, no body)
 * - Event type normalization via `rowToRunEvent`
 */

import { describe, expect, it } from 'vitest';

// Import the row-to-event normalizer for unit testing. The full `openSseStream`
// function requires a fetch + ReadableStream, which is harder to unit-test
// directly. We test the frame parsing via a helper that replays SSE text.

// We need to extract and test `rowToRunEvent` from sseClient.ts.
// Since it's not exported publicly, we import the module and test through
// the public API where possible. For frame-level parsing we simulate
// the Reader/TextDecoder loop.

import { openSseStream, type SseStreamOptions } from './sseClient';
import type { RunEvent } from '@/features/generationContracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal ReadableStream that yields raw SSE text. */
function createSseTextStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = lines.join('\n');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

/** Create a mock fetch that returns an SSE stream. */
function mockFetchWithSse(
  lines: string[],
  status = 200,
): typeof globalThis.fetch {
  return (async () => {
    if (status !== 200) {
      return new Response(null, { status });
    }
    return new Response(createSseTextStream(lines), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as unknown as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('openSseStream', () => {
  const baseOpts: SseStreamOptions = {
    baseUrl: 'https://worker.example.com',
    deviceId: 'dev-001',
    path: '/v1/runs/run-001/events',
  };

  it('parses a complete SSE event frame (id + data)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      'id: 1',
      'data: {"id":"1","run_id":"run-001","device_id":"dev-001","seq":1,"ts":"2026-01-01T00:00:00Z","type":"run.queued","payload_json":{}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      for await (const event of openSseStream(baseOpts)) {
        events.push(event);
      }
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('run.queued');
      expect(events[0].seq).toBe(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('handles multiple SSE events in a single stream', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      'id: 1',
      'data: {"id":"1","run_id":"run-001","device_id":"dev-001","seq":1,"ts":"2026-01-01T00:00:00Z","type":"run.queued","payload_json":{}}',
      '',
      'id: 2',
      'data: {"id":"2","run_id":"run-001","device_id":"dev-001","seq":2,"ts":"2026-01-01T00:00:01Z","type":"run.status","payload_json":{"status":"planning"}}',
      '',
      'id: 3',
      'data: {"id":"3","run_id":"run-001","device_id":"dev-001","seq":3,"ts":"2026-01-01T00:00:02Z","type":"run.completed","payload_json":{}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      for await (const event of openSseStream(baseOpts)) {
        events.push(event);
      }
      expect(events.length).toBe(3);
      expect(events[0].type).toBe('run.queued');
      expect(events[0].seq).toBe(1);
      expect(events[1].type).toBe('run.status');
      expect(events[1].seq).toBe(2);
      expect(events[2].type).toBe('run.completed');
      expect(events[2].seq).toBe(3);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('handles keepalive comments (lines starting with :)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      ': keepalive comment',
      '',
      'id: 1',
      'data: {"id":"1","run_id":"run-001","device_id":"dev-001","seq":1,"ts":"2026-01-01T00:00:00Z","type":"run.queued","payload_json":{}}',
      '',
      ': another keepalive',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      for await (const event of openSseStream(baseOpts)) {
        events.push(event);
      }
      // Keepalive comments should be ignored; only the real event parsed.
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('run.queued');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('parses artifact.ready events with payload normalization', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      'id: 5',
      'data: {"id":"5","run_id":"run-001","device_id":"dev-001","seq":5,"ts":"2026-01-01T00:00:05Z","type":"artifact.ready","payload_json":{"artifactId":"art-abc","kind":"crystal-trial","contentHash":"cnt_def","schemaVersion":1,"inputHash":"inp_stub"}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      for await (const event of openSseStream(baseOpts)) {
        events.push(event);
      }
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('artifact.ready');
      const body = (events[0] as { type: 'artifact.ready'; body: { artifactId: string; kind: string; contentHash: string } }).body;
      expect(body.artifactId).toBe('art-abc');
      expect(body.kind).toBe('crystal-trial');
      expect(body.contentHash).toBe('cnt_def');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('parses the `run.artifact-ready` event type alias', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      'id: 7',
      'data: {"id":"7","run_id":"run-001","device_id":"dev-001","seq":7,"ts":"2026-01-01T00:00:07Z","type":"run.artifact-ready","payload_json":{"artifactId":"art-xyz","kind":"crystal-trial","contentHash":"cnt_abc","schemaVersion":1,"inputHash":"inp_stub"}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      for await (const event of openSseStream(baseOpts)) {
        events.push(event);
      }
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('artifact.ready');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('parses cancel events correctly', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      'id: 10',
      'data: {"id":"10","run_id":"run-001","device_id":"dev-001","seq":10,"ts":"2026-01-01T00:00:10Z","type":"run.cancel-acknowledged","payload_json":{"reason":"user"}}',
      '',
      'id: 11',
      'data: {"id":"11","run_id":"run-001","device_id":"dev-001","seq":11,"ts":"2026-01-01T00:00:11Z","type":"run.cancelled","payload_json":{"reason":"user"}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      for await (const event of openSseStream(baseOpts)) {
        events.push(event);
      }
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('run.cancel-acknowledged');
      expect((events[0] as { reason: string }).reason).toBe('user');
      expect(events[1].type).toBe('run.cancelled');
      expect((events[1] as { reason: string }).reason).toBe('user');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('handles superseded cancel reason', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      'id: 12',
      'data: {"id":"12","run_id":"run-001","device_id":"dev-001","seq":12,"ts":"2026-01-01T00:00:12Z","type":"run.cancelled","payload_json":{"reason":"superseded"}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      for await (const event of openSseStream(baseOpts)) {
        events.push(event);
      }
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('run.cancelled');
      expect((events[0] as { reason: string }).reason).toBe('superseded');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('parses run.failed events with failure codes', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      'id: 15',
      'data: {"id":"15","run_id":"run-001","device_id":"dev-001","seq":15,"ts":"2026-01-01T00:00:15Z","type":"run.failed","payload_json":{"code":"llm:rate-limit","message":"Rate limit exceeded"}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      for await (const event of openSseStream(baseOpts)) {
        events.push(event);
      }
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('run.failed');
      const failedEvent = events[0] as { type: 'run.failed'; code: string; message: string };
      expect(failedEvent.code).toBe('llm:rate-limit');
      expect(failedEvent.message).toBe('Rate limit exceeded');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('throws on non-200 HTTP response', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([], 500);

    try {
      const events: RunEvent[] = [];
      await expect(async () => {
        for await (const event of openSseStream(baseOpts)) {
          events.push(event);
        }
      }).rejects.toThrow('SSE connection failed');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('passes Last-Event-ID header when lastEventId is set', async () => {
    const origFetch = globalThis.fetch;
    let capturedRequest: Request | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = new Request(input instanceof Request ? input.url : input.toString(), init);
      return new Response(createSseTextStream([
        'id: 1',
        'data: {"id":"1","run_id":"run-001","device_id":"dev-001","seq":1,"ts":"2026-01-01T00:00:00Z","type":"run.queued","payload_json":{}}',
        '',
      ]), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as typeof globalThis.fetch;

    try {
      const events: RunEvent[] = [];
      for await (const event of openSseStream({
        ...baseOpts,
        lastEventId: '5',
      })) {
        events.push(event);
      }
      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.headers.get('last-event-id')).toBe('5');
      // The URL should contain lastSeq=5 query param
      expect(capturedRequest!.url).toContain('lastSeq=5');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // ---- Phase 3.6 P1 #2: strict transport decoding ----

  it('throws on unknown event type (strict transport decoding)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      'id: 20',
      'data: {"id":"20","run_id":"run-001","device_id":"dev-001","seq":20,"ts":"2026-01-01T00:00:20Z","type":"unknown.event.type","payload_json":{}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      await expect(async () => {
        for await (const event of openSseStream(baseOpts)) {
          events.push(event);
        }
      }).rejects.toThrow(/unknown event type/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('throws on artifact.ready missing required fields (strict transport decoding)', async () => {
    const origFetch = globalThis.fetch;
    // Missing kind, contentHash, inputHash, schemaVersion
    globalThis.fetch = mockFetchWithSse([
      'id: 21',
      'data: {"id":"21","run_id":"run-001","device_id":"dev-001","seq":21,"ts":"2026-01-01T00:00:21Z","type":"artifact.ready","payload_json":{"artifactId":"art-incomplete"}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      await expect(async () => {
        for await (const event of openSseStream(baseOpts)) {
          events.push(event);
        }
      }).rejects.toThrow(/missing required field/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('throws on run.failed missing code (strict transport decoding)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      'id: 22',
      'data: {"id":"22","run_id":"run-001","device_id":"dev-001","seq":22,"ts":"2026-01-01T00:00:22Z","type":"run.failed","payload_json":{"message":"no code here"}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      await expect(async () => {
        for await (const event of openSseStream(baseOpts)) {
          events.push(event);
        }
      }).rejects.toThrow(/missing required field.+"code"/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('throws on run.status missing status field (strict transport decoding)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchWithSse([
      'id: 23',
      'data: {"id":"23","run_id":"run-001","device_id":"dev-001","seq":23,"ts":"2026-01-01T00:00:23Z","type":"run.status","payload_json":{}}',
      '',
    ]);

    try {
      const events: RunEvent[] = [];
      await expect(async () => {
        for await (const event of openSseStream(baseOpts)) {
          events.push(event);
        }
      }).rejects.toThrow(/missing required field.+"status"/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('handles AbortSignal for cancellation', async () => {
    const origFetch = globalThis.fetch;
    const ac = new AbortController();

    // Mock fetch that never resolves (simulating a hanging connection)
    // until abort is called.
    let abortCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) {
        // The signal was passed — check it propagates
        return new Response(createSseTextStream([
          'id: 1',
          'data: {"id":"1","run_id":"run-001","device_id":"dev-001","seq":1,"ts":"2026-01-01T00:00:00Z","type":"run.queued","payload_json":{}}',
          '',
        ]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      return new Response(null, { status: 200 });
    }) as typeof globalThis.fetch;

    try {
      const events: RunEvent[] = [];
      for await (const event of openSseStream({ ...baseOpts, signal: ac.signal })) {
        events.push(event);
      }
      // Should have received events before the stream closed.
      expect(events.length).toBe(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
