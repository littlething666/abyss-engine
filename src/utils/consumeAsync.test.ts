import { describe, expect, it } from 'vitest';
import { consumeAsync } from './consumeAsync';

describe('consumeAsync', () => {
  it('calls fn for each yielded value and resolves done', async () => {
    const received: number[] = [];
    async function* gen() {
      yield 1;
      yield 2;
      yield 3;
    }

    const [stop, done] = consumeAsync(gen(), (v) => {
      received.push(v);
    });

    await done;
    expect(received).toEqual([1, 2, 3]);
    stop();
  });

  it('stop() prevents further fn calls and resolves done', async () => {
    const received: number[] = [];
    async function* gen() {
      yield 1;
      // Small delay to give stop() a chance to run.
      await new Promise((r) => setTimeout(r, 20));
      yield 2;
      await new Promise((r) => setTimeout(r, 20));
      yield 3;
    }

    const [stop, done] = consumeAsync(gen(), (v) => {
      received.push(v);
    });

    // Wait for the first value to be consumed.
    await new Promise<void>((resolve) => {
      const check = () => {
        if (received.length >= 1) resolve();
        else setTimeout(check, 5);
      };
      check();
    });

    stop();
    await done;

    // Only the first value should have been consumed.
    expect(received).toEqual([1]);
    expect(received).not.toContain(2);
    expect(received).not.toContain(3);
  });

  it('handles async fn', async () => {
    const received: number[] = [];
    async function* gen() {
      yield 1;
      yield 2;
    }

    const [stop, done] = consumeAsync(gen(), async (v) => {
      await new Promise((r) => setTimeout(r, 0));
      received.push(v);
    });

    await done;
    expect(received).toEqual([1, 2]);
    stop();
  });

  it('survives a thrown error in the iterable', async () => {
    const received: number[] = [];
    async function* gen() {
      yield 1;
      throw new Error('stream error');
    }

    const [stop, done] = consumeAsync(gen(), (v) => {
      received.push(v);
    });

    await done;
    expect(received).toEqual([1]);
    stop();
  });

  it('returns a stop function that is idempotent', () => {
    async function* gen() {
      yield 1;
    }
    const [stop] = consumeAsync(gen(), () => {});
    stop();
    stop();
    stop();
  });

  it('done resolves even if already stopped before first yield', async () => {
    const received: number[] = [];
    async function* gen() {
      // Slow generator that yields after a delay.
      await new Promise((r) => setTimeout(r, 50));
      yield 1;
    }

    const [stop, done] = consumeAsync(gen(), (v) => {
      received.push(v);
    });

    // Stop immediately.
    stop();
    await done;

    // No values should have been consumed.
    expect(received).toEqual([]);
  });

  it('done resolves after a mid-stream stop', async () => {
    const received: number[] = [];
    async function* gen() {
      yield 1;
      await new Promise((r) => setTimeout(r, 50));
      yield 2;
    }

    const [stop, done] = consumeAsync(gen(), (v) => {
      received.push(v);
    });

    // Wait for first value.
    await new Promise<void>((resolve) => {
      const check = () => {
        if (received.length >= 1) resolve();
        else setTimeout(check, 5);
      };
      check();
    });

    stop();
    await done;

    // Only the first value was consumed.
    expect(received).toEqual([1]);
  });
});
