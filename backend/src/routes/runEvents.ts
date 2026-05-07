/**
 * SSE event stream for a run — GET /v1/runs/:id/events.
 *
 * Phase 1 PR-C: minimal stub.  Replays persisted events then closes.
 * A live tail via the RunEventBus Durable Object lands in PR-D/PR-G.
 */

import { Hono } from 'hono';
import { makeRepos } from '../repositories';
import type { Env } from '../env';

const runEvents = new Hono<{ Bindings: Env; Variables: { deviceId: string } }>();

/** Parse SSE resume cursor from Last-Event-ID or ?lastSeq= (must never produce NaN). */
function parseResumeSeq(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}): number {
  const headerVal = c.req.header('last-event-id')?.trim();
  const queryVal = c.req.query('lastSeq')?.trim();
  const raw = headerVal || queryVal || '0';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

runEvents.get('/:id/events', async (c) => {
  const deviceId = c.get('deviceId');
  const runId = c.req.param('id');
  const repos = makeRepos(c.env);

  // Verify the run belongs to this device.
  const run = await repos.runs.load(runId);
  if (run.device_id !== deviceId) {
    return c.json({ error: 'not_found' }, 404);
  }

  const lastSeq = parseResumeSeq(c);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Replay persisted events with seq > lastSeq.
        const rows = await repos.runs.eventsAfter(runId, deviceId, lastSeq);
        for (const row of rows) {
          const line = `id: ${row.seq}\ndata: ${JSON.stringify(row)}\n\n`;
          controller.enqueue(encoder.encode(line));
        }

        // PR-D: subscribe to live events via RunEventBus Durable Object.
        // For now, check if the run is still active and send a keepalive comment.
        const updated = await repos.runs.load(runId);
        if (!updated.finished_at) {
          controller.enqueue(encoder.encode(': keepalive — run still active (live tail stubbed)\n\n'));
        }

        controller.close();
      } catch (err) {
        console.error(`[runEvents] stream error for ${runId}:`, err);
        controller.error(err);
      }
    },
  });

  // Use Hono `c.body` so `#newResponse` merges CORS and other middleware headers
  // from `c.res` (raw `new Response()` bypasses that merge for streamed bodies).
  return c.body(stream, 200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
});

export { runEvents };
