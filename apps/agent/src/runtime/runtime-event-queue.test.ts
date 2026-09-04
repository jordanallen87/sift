import { describe, expect, it } from 'vitest';
import { RuntimeEventQueue } from './runtime-event-queue.js';

/** A promise the test resolves by hand -- the stand-in for "the run is still going", with no timers and no sleeps. */
function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Advances the event loop until `predicate` holds; the turn bound is a failure guard, not a delay. */
async function waitUntil(predicate: () => boolean, description: string): Promise<void> {
  for (let turn = 0; turn < 5000; turn += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`waitUntil: ${description} never became true`);
}

/** Consumes a generator in the background, recording each value as it arrives. */
function consume<T, R>(
  gen: AsyncGenerator<T, R, undefined>,
): {
  received: T[];
  done: () => boolean;
  settled: Promise<{ value: R } | { error: unknown }>;
} {
  const received: T[] = [];
  let finished = false;
  const settled = (async () => {
    let next = await gen.next();
    while (!next.done) {
      received.push(next.value);
      next = await gen.next();
    }
    return next.value;
  })().then(
    (value) => {
      finished = true;
      return { value };
    },
    (error: unknown) => {
      finished = true;
      return { error };
    },
  );
  return { received, done: () => finished, settled };
}

describe('RuntimeEventQueue', () => {
  it('hands each event to the consumer while the work is still in flight, rather than after it settles', async () => {
    const queue = new RuntimeEventQueue<string>();
    const work = deferred<string>();
    const consumer = consume(queue.streamWhile(work.promise));

    queue.push('a');
    await waitUntil(() => consumer.received.length === 1, 'the first event to be delivered');
    expect(consumer.received).toEqual(['a']);
    // The defining assertion: delivered *before* the work settled.
    expect(consumer.done()).toBe(false);

    queue.push('b');
    await waitUntil(() => consumer.received.length === 2, 'the second event to be delivered');
    expect(consumer.received).toEqual(['a', 'b']);
    expect(consumer.done()).toBe(false);

    work.resolve('finished');
    await expect(consumer.settled).resolves.toEqual({ value: 'finished' });
    expect(consumer.received).toEqual(['a', 'b']);
  });

  it('preserves push order exactly, including a burst pushed in one synchronous turn', async () => {
    const queue = new RuntimeEventQueue<number>();
    const work = deferred<string>();
    const consumer = consume(queue.streamWhile(work.promise));

    for (const value of [1, 2, 3, 4, 5]) queue.push(value);
    await waitUntil(() => consumer.received.length === 5, 'the burst to be delivered');
    expect(consumer.received).toEqual([1, 2, 3, 4, 5]);

    for (const value of [6, 7]) queue.push(value);
    work.resolve('finished');
    await consumer.settled;
    expect(consumer.received).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('drops nothing that was pushed in the same turn the work settled', async () => {
    const queue = new RuntimeEventQueue<string>();
    const work = deferred<string>();
    const consumer = consume(queue.streamWhile(work.promise));

    // Pushed and settled together, with no chance for the streaming loop to
    // observe the queue in between -- the exact race a "stop as soon as the
    // work resolves" implementation loses events to.
    queue.push('last-gasp');
    work.resolve('finished');

    await expect(consumer.settled).resolves.toEqual({ value: 'finished' });
    expect(consumer.received).toEqual(['last-gasp']);
  });

  it('rethrows the work’s own error, but only after every event queued before it has been delivered', async () => {
    const queue = new RuntimeEventQueue<string>();
    const work = deferred<string>();
    const failure = new Error('run failed mid-flight');
    const consumer = consume(queue.streamWhile(work.promise));

    queue.push('before-the-failure');
    await waitUntil(() => consumer.received.length === 1, 'the pre-failure event to be delivered');

    queue.push('queued-as-it-failed');
    work.reject(failure);

    await expect(consumer.settled).resolves.toEqual({ error: failure });
    expect(consumer.received).toEqual(['before-the-failure', 'queued-as-it-failed']);
  });

  it('yields what onError records before rethrowing, so an error-specific event is not lost', async () => {
    const queue = new RuntimeEventQueue<string>();
    const work = deferred<string>();
    const failure = new Error('exceeded wall-clock budget');
    const consumer = consume(
      queue.streamWhile(work.promise, {
        onError: (error) => {
          queue.push(`recorded: ${(error as Error).message}`);
        },
      }),
    );

    queue.push('earlier');
    work.reject(failure);

    await expect(consumer.settled).resolves.toEqual({ error: failure });
    expect(consumer.received).toEqual(['earlier', 'recorded: exceeded wall-clock budget']);
  });

  it('drain() takes everything queued so far, oldest first, and leaves the queue empty', () => {
    const queue = new RuntimeEventQueue<string>();
    queue.push('one');
    queue.push('two');

    expect(queue.drain()).toEqual(['one', 'two']);
    expect(queue.drain()).toEqual([]);

    queue.push('three');
    expect(queue.drain()).toEqual(['three']);
  });

  it('completes an event-free run without parking forever', async () => {
    const queue = new RuntimeEventQueue<string>();
    const work = deferred<string>();
    const consumer = consume(queue.streamWhile(work.promise));

    work.resolve('nothing happened');
    await expect(consumer.settled).resolves.toEqual({ value: 'nothing happened' });
    expect(consumer.received).toEqual([]);
  });
});
