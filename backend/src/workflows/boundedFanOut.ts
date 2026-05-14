export const TOPIC_CONTENT_PER_SPEC_FAN_OUT_CONCURRENCY = 4;

export async function mapWithBoundedConcurrency<TInput, TOutput>(input: {
  items: readonly TInput[];
  concurrency: number;
  task: (item: TInput, index: number) => Promise<TOutput>;
}): Promise<TOutput[]> {
  const { items, concurrency, task } = input;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`bounded fan-out concurrency must be a positive integer; received ${concurrency}`);
  }
  if (items.length === 0) return [];

  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
