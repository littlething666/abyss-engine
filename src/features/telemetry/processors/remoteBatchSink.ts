import type { TelemetryEvent } from '../types';

interface RemoteBatchSinkOptions {
  batchSize?: number;
}

const queue: TelemetryEvent[] = [];
const defaultBatchSize = 50;

export async function remoteBatchTelemetrySink(
  event: TelemetryEvent,
  options?: RemoteBatchSinkOptions,
): Promise<void> {
  queue.push(event);

  const maxBatch = Math.max(1, options?.batchSize ?? defaultBatchSize);
  if (queue.length >= maxBatch) {
    void drainRemoteBatch();
  }
}

async function drainRemoteBatch() {
  queue.length = 0;
}
