/**
 * Consume an `AsyncIterable` by calling `fn` on each yielded value.
 *
 * Returns a tuple of `[stop, done]`:
 * - `stop()` cancels the loop cooperatively. Already-in-flight `fn`
 *   calls complete; values not yet yielded are skipped.
 * - `done` is a `Promise<void>` that resolves when the loop exits
 *   (either naturally, on error, or after `stop`).
 *
 * Intended for SSE event streams and other reactive event sources.
 */
export function consumeAsync<T>(
  iterable: AsyncIterable<T>,
  fn: (value: T) => void | Promise<void>,
): [stop: () => void, done: Promise<void>] {
  let cancelled = false;

  const done = (async () => {
    try {
      for await (const value of iterable) {
        if (cancelled) break;
        await fn(value);
      }
    } catch {
      // SSE disconnect / transient I/O failures are handled by
      // the caller re-subscribing via the return stop function.
    }
  })();

  return [
    () => {
      cancelled = true;
    },
    done,
  ];
}
