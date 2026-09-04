/**
 * The bridge between the Strands SDK's *synchronous* hook callbacks and the
 * *asynchronous* `AsyncGenerator` consumers that persist and render a run's
 * activity (`car-purchase-engine.ts`'s `drainGraphToActivity`,
 * `home-energy-engine.ts`'s equivalent drain, and the SSE stream behind
 * them).
 *
 * Why this exists: every `RuntimeEvent` a multi-node run produces is pushed
 * from a hook callback that the SDK invokes synchronously, deep inside
 * `graph.invoke()`/`swarm.invoke()`. A generator that simply does
 *
 * ```ts
 * const result = await graph.invoke(...);   // the whole six-node run
 * for (const event of accumulated) yield event;   // ...then drains it
 * ```
 *
 * is not streaming: it is buffering. The consumer's loop looks identical
 * either way -- it still receives one event per `next()` -- but every event
 * arrives *after* the last node has finished, so a run whose six specialists
 * genuinely execute over hundreds of milliseconds is delivered as one
 * indistinguishable burst, and a UI rendering one line at a time shows each
 * specialist for about a millisecond. That is what this queue fixes:
 * architecture.md "Command and event flow" ("Runtime activity events stream
 * immediately") and `car-purchase-engine.ts`'s own header comment ("AS THE
 * GRAPH PROGRESSES -- never buffered until the end") are only true when the
 * producing generator hands each event on as the SDK pushes it.
 *
 * What it deliberately does *not* do is pace anything. There is no timer, no
 * sleep, and no minimum inter-event delay anywhere in this file: an event is
 * yielded as soon as the consumer asks for it, and a genuinely fast run
 * still finishes fast. Pacing a demo for a camera is a separate, explicit
 * product decision and does not belong inside the producer of the truth.
 *
 * Ordering and completeness are the two invariants downstream depends on
 * (`RuntimeDebugEvent.sequence` drives duplicate suppression and replay):
 *
 * - **Order is push order.** A single FIFO buffer, drained oldest-first,
 *   yields exactly the order the pushes happened in -- which is exactly the
 *   order the shared monotonic `sequence` counter was read in, because every
 *   caller allocates its sequence and pushes in one synchronous statement.
 * - **Nothing is dropped.** `streamWhile` re-drains after its work settles,
 *   so events produced between the final yield and the run resolving are
 *   still emitted; anything the *caller* produces afterwards (a GoalLoop's
 *   recorded attempts, say) is emitted by a final explicit `drain()`.
 * - **An error still surfaces.** Events already queued when the run rejects
 *   are yielded first, then the original error is rethrown unchanged.
 */

/** The settled outcome of one `streamWhile` unit of work, captured so the loop can exit on either a value or an error without losing queued events. */
type WorkOutcome<TResult> =
  | { readonly ok: true; readonly value: TResult }
  | {
      readonly ok: false;
      readonly error: unknown;
    };

export interface StreamWhileOptions {
  /**
   * Called synchronously when the work rejects, *before* the final drain, so
   * an error-specific event the caller wants to record (`swarm.timeout`, for
   * one) can still be pushed and yielded ahead of the rethrow.
   */
  readonly onError?: (error: unknown) => void;
}

/**
 * A one-producer/one-consumer FIFO of runtime events, with an async
 * generator that streams them while a promise is still in flight.
 *
 * One instance per run. `push` is safe to call from any synchronous SDK hook
 * (it never awaits and never throws); `streamWhile` is driven by exactly one
 * consumer -- the run's own `AsyncGenerator`.
 */
export class RuntimeEventQueue<TEvent> {
  private readonly pending: TEvent[] = [];
  /** Resolver for the single in-flight `nextPush()` waiter, if the consumer is currently parked. */
  private wake: (() => void) | undefined;

  /**
   * Appends one event. Bound as a property so it can be handed directly to
   * an SDK plugin's `emit` callback without losing `this`.
   */
  readonly push = (event: TEvent): void => {
    this.pending.push(event);
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  };

  /** Removes and returns every queued event, oldest first. */
  drain(): TEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  /** Resolves on the next `push`. Only ever awaited when the buffer is empty. */
  private nextPush(): Promise<void> {
    return new Promise<void>((resolve) => {
      const previous = this.wake;
      this.wake =
        previous === undefined
          ? resolve
          : (): void => {
              previous();
              resolve();
            };
    });
  }

  /**
   * Yields every event pushed while `work` is running, as it is pushed, then
   * returns `work`'s value -- or, if `work` rejected, yields everything still
   * queued (including anything `options.onError` pushes) and rethrows the
   * original error.
   *
   * `work` must already be in flight: the caller starts the invocation and
   * hands the promise over, so the run and the streaming of its events are
   * genuinely concurrent.
   */
  async *streamWhile<TResult>(
    work: Promise<TResult>,
    options: StreamWhileOptions = {},
  ): AsyncGenerator<TEvent, TResult, undefined> {
    let workSettled = false;
    // Never rejects: both branches resolve to a `WorkOutcome`, so the race
    // below can be awaited without a second rejection path.
    const settled: Promise<WorkOutcome<TResult>> = work.then(
      (value) => {
        workSettled = true;
        return { ok: true, value } as const;
      },
      (error: unknown) => {
        workSettled = true;
        return { ok: false, error } as const;
      },
    );

    while (!workSettled) {
      const batch = this.drain();
      if (batch.length > 0) {
        // Re-loop rather than parking: `yield` returns control to the
        // consumer, during which the run may have queued more.
        for (const event of batch) yield event;
        continue;
      }
      await Promise.race([this.nextPush(), settled]);
    }

    const outcome = await settled;
    if (!outcome.ok) options.onError?.(outcome.error);
    // Anything queued between the last yield and the run settling, plus
    // whatever `onError` just recorded.
    for (const event of this.drain()) yield event;
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
