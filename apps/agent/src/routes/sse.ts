/**
 * A minimal, independently-testable Server-Sent-Events writer implementing
 * the bounded-queue slow-consumer behavior from docs/specs/architecture.md
 * "Real-time event contract": "Slow-consumer buffering is bounded. When
 * replay is no longer available, the service emits a resync instruction and
 * the client reloads the canonical snapshot."
 *
 * Genuine backpressure only exists at the real OS socket boundary --
 * `http.ServerResponse#write()` returns `false` exactly when the
 * underlying socket's write buffer is full (Node's own backpressure
 * signal), and `'drain'` fires once it has room again. This module tracks
 * how many writes have gone unacknowledged (`write()` returned `false`
 * with no `'drain'` since) and, once that exceeds `maxQueueLength`, calls
 * `onResyncRequired()` and stops delivering further events -- `events.ts`'s
 * route handler is responsible for actually sending the resync marker event
 * and closing the connection from that callback.
 *
 * Depends only on the tiny `SseResponse` shape (not the real Express
 * `Response`), so `sse.test.ts` can exercise the resync threshold with a
 * fake `res` whose `write()` deterministically returns `false`, instead of
 * needing genuine flaky socket-level backpressure in an integration test.
 */
export interface SseResponse {
  write(chunk: string): boolean;
  on(event: 'close' | 'drain', listener: () => void): void;
}

export interface SseWriterOptions {
  /** How many unacknowledged (`write()` returned `false`) sends before resync fires. */
  readonly maxQueueLength?: number;
}

export interface SseEvent {
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
}

export interface SseWriter {
  readonly closed: boolean;
  send(event: SseEvent): void;
  sendComment(comment: string): void;
}

const DEFAULT_MAX_QUEUE_LENGTH = 50;

export function createSseWriter(
  res: SseResponse,
  onResyncRequired: () => void,
  options: SseWriterOptions = {},
): SseWriter {
  const maxQueueLength = options.maxQueueLength ?? DEFAULT_MAX_QUEUE_LENGTH;
  let pending = 0;
  let closed = false;

  res.on('drain', () => {
    pending = 0;
  });
  res.on('close', () => {
    closed = true;
  });

  function writeRaw(chunk: string): void {
    if (closed) return;
    const flushedImmediately = res.write(chunk);
    if (flushedImmediately) {
      pending = 0;
      return;
    }
    pending += 1;
    if (pending > maxQueueLength) {
      closed = true;
      onResyncRequired();
    }
  }

  return {
    get closed() {
      return closed;
    },
    send: (event: SseEvent) => {
      writeRaw(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    },
    sendComment: (comment: string) => {
      writeRaw(`: ${comment}\n\n`);
    },
  };
}
