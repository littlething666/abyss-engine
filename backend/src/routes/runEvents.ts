/**
 * SSE event stream for a run — GET /v1/runs/:id/events.
 *
 * Phase 3.6 Step 1: Full live tail implementation.
 * - Replays persisted events with seq > lastSeq.
 * - Keeps the SSE connection open, polling for new events on a bounded cadence.
 * - Emits keepalive comments every 15s for active runs.
 * - Closes only after terminal run events have been flushed.
 */

import { Hono } from 'hono';
import { makeRepos } from '../repositories';
import { dbStatusToTransport, ACTIVE_TRANSPORT_STATUSES } from './statusMapper';
import type { Env } from '../env';

/** Polling interval for active runs (ms). */
const POLL_INTERVAL_MS = 2000;
/** Keepalive comment interval (ms). */
const KEEPALIVE_INTERVAL_MS = 15000;
/** Maximum number of keepalive cycles before forcing close for runs
 *  that never become terminal (safety valve, ~5 min). */
const MAX_KEEPALIVE_CYCLES = 20;

const runEvents = new Hono<{ Bindings: Env; Variables: { deviceId: string } }>();

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

/** Check if a DB status represents a terminal (non-active) run. */
function isTerminalStatus(dbStatus: string): boolean {
  return !ACTIVE_TRANSPORT_STATUSES.includes(dbStatusToTransport(dbStatus));
}

runEvents.get('/:id/events', async (c) => {
  const deviceId = c.get('deviceId');
  const runId = c.req.param('id');
  const repos = makeRepos(c.env);

  // Verify the run belongs to this device.
  let run;
  try {
    run = await repos.runs.load(runId);
  } catch {
    return c.json({ error: 'not_found' }, 404);
  }
  if (run.device_id !== deviceId) {
    return c.json({ error: 'not_found' }, 404);
  }

  const lastSeq = parseResumeSeq(c);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      const enqueue = (data: string) => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            closed = true;
          }
        }
      };

      const close = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
        if (keepaliveTimer) {
          clearInterval(keepaliveTimer);
          keepaliveTimer = null;
        }
      };

      try {
        // ── 1. Replay persisted events with seq > lastSeq ──
        let currentSeq = lastSeq;
        try {
          const rows = await repos.runs.eventsAfter(runId, deviceId, lastSeq);
          if (rows && Symbol.iterator in Object(rows)) {
            for (const row of rows) {
              const line = `id: ${row.seq}\ndata: ${JSON.stringify(row)}\n\n`;
              enqueue(line);
              currentSeq = row.seq;
            }
          }
        } catch (err) {
          console.error(`[runEvents] replay error for ${runId}:`, err);
        }

        // ── 2. Check if the run is already terminal ──
        try {
          run = await repos.runs.load(runId);
        } catch {
          enqueue(': run lookup failed — closing stream\n\n');
          close();
          return;
        }

        if (!run || isTerminalStatus(run.status)) {
          // Flush any final events that landed after the replay.
          const tail = await repos.runs.eventsAfter(runId, deviceId, currentSeq);
          for (const row of tail) {
            const line = `id: ${row.seq}\ndata: ${JSON.stringify(row)}\n\n`;
            enqueue(line);
          }
          enqueue(': run terminal — closing stream\n\n');
          close();
          return;
        }

        // ── 3. Live tail: poll for new events until terminal ──
        let keepaliveCycles = 0;

        const poll = async () => {
          if (closed) return;
          try {
            const newEvents = await repos.runs.eventsAfter(runId, deviceId, currentSeq);
            if (newEvents && Symbol.iterator in Object(newEvents)) {
              for (const row of newEvents) {
                const line = `id: ${row.seq}\ndata: ${JSON.stringify(row)}\n\n`;
                enqueue(line);
                currentSeq = row.seq;
              }
            }

            // Check if run has become terminal.
            let updated;
            try {
              updated = await repos.runs.load(runId);
            } catch {
              return; // transient — try again next poll
            }
            if (!updated || isTerminalStatus(updated.status)) {
              // One more poll for any events that landed during the status transition.
              const tail = await repos.runs.eventsAfter(runId, deviceId, currentSeq);
              for (const row of tail) {
                const line = `id: ${row.seq}\ndata: ${JSON.stringify(row)}\n\n`;
                enqueue(line);
              }
              close();
              return;
            }
          } catch (err) {
            console.error(`[runEvents] poll error for ${runId}:`, err);
            // Don't close on transient errors — keep trying.
          }
        };

        // Emit keepalive comments and poll.
        keepaliveTimer = setInterval(() => {
          if (closed) return;

          keepaliveCycles++;
          if (keepaliveCycles > MAX_KEEPALIVE_CYCLES) {
            enqueue(': keepalive timeout — closing stream\n\n');
            close();
            return;
          }

          enqueue(': keepalive\n\n');
          void poll();
        }, POLL_INTERVAL_MS);

        // Do an initial poll immediately after the replay.
        void poll();

      } catch (err) {
        console.error(`[runEvents] stream error for ${runId}:`, err);
        if (!closed) {
          try {
            controller.error(err);
          } catch {
            // already closed
          }
          closed = true;
        }
        if (keepaliveTimer) {
          clearInterval(keepaliveTimer);
        }
      }
    },
  });

  return c.body(stream, 200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
});

export { runEvents };
