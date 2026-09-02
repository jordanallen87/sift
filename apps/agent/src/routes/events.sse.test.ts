/**
 * Real streaming SSE tests against a genuine listening HTTP server (not
 * supertest, which buffers a response until it ends -- an SSE connection
 * here deliberately never ends on its own). Proves docs/specs/testing.md's
 * required behavior: "Prove SSE replay from `Last-Event-ID` and the
 * polling-fallback path reach the same final state in a test."
 */
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaseState, CommandReceipt, PublicActivityEvent } from '@sift/contracts';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';
import type { ActivityStore } from '../store/activity-store.js';
import { createEventsRouter } from './events.js';

interface ParsedSseEvent {
  id?: string;
  event?: string;
  data?: string;
}

/** Parses complete `\n\n`-terminated SSE frames out of `buffer`, returning the parsed events and whatever incomplete trailing text should be prepended to the next chunk. */
function parseSseBuffer(buffer: string): { events: ParsedSseEvent[]; remainder: string } {
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: ParsedSseEvent[] = [];
  for (const frame of frames) {
    const lines = frame.split('\n').filter((line) => !line.startsWith(':'));
    if (lines.every((line) => line.trim().length === 0)) continue;
    const event: ParsedSseEvent = {};
    for (const line of lines) {
      if (line.startsWith('id: ')) event.id = line.slice(4);
      else if (line.startsWith('event: ')) event.event = line.slice(7);
      else if (line.startsWith('data: ')) event.data = line.slice(6);
    }
    events.push(event);
  }
  return { events, remainder };
}

/**
 * Polls `predicate` on a real signal until it holds, or fails loudly.
 *
 * The bound was 3000ms and exceeded once during a full `pnpm verify`
 * ("skips delivering a live activity event to an already-closed SSE
 * writer", `timed out waiting for condition`), while passing 6/6 standalone
 * afterwards. That is contention, not a logic defect: `verify` runs the
 * whole suite in parallel, and SSE delivery here is genuinely asynchronous,
 * so 3s is simply too tight a budget on a loaded machine.
 *
 * Raised rather than removed, and deliberately NOT replaced with a fixed
 * sleep or an assertion that tolerates either outcome. The predicate is
 * still required to become true and the test still fails if it never does;
 * only the patience changed. Same reasoning as the `submitCustomConcern`
 * banner wait in `tests/e2e/pages/sift-page.ts`.
 */
function waitFor(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = (): void => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timed out waiting for condition'));
        return;
      }
      setTimeout(check, 15);
    };
    check();
  });
}

interface SseConnection {
  events: ParsedSseEvent[];
  close: () => void;
}

/**
 * Every client request this file opens, so `afterEach` can destroy the ones
 * a test did not close itself.
 *
 * This matters far beyond tidiness. `Server.close()` stops the server
 * *accepting* new connections; it does not terminate the ones already open.
 * An SSE connection is open by definition, so without this registry a
 * client socket outlives the server it was talking to and the ephemeral
 * port is released while that socket is still around. Another Vitest worker
 * -- a different OS process -- then binds the same port for its own
 * supertest server, and a stray socket from here lands on it.
 *
 * That is not hypothetical. It was the cause of a long-standing intermittent
 * failure that appeared only under `pnpm verify`, always in a *different*
 * file, with symptoms that made no sense in isolation: a 200 for a request
 * deliberately sent without an idempotency key, a 400 where a 404 was
 * expected, snapshots coming back with empty entity arrays. Every one of
 * those was another file's test receiving a response to a request it never
 * sent. Running `apps/agent/src/routes` with `--no-file-parallelism` was
 * clean 5/5; excluding only this file, with parallelism on, was also clean
 * 5/5; with both, it failed roughly one run in three.
 */
const openConnections: { destroy: () => void }[] = [];

function openSseConnection(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<SseConnection> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: 'GET', headers },
      (res: IncomingMessage) => {
        let buffer = '';
        const events: ParsedSseEvent[] = [];
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          const parsed = parseSseBuffer(buffer);
          buffer = parsed.remainder;
          events.push(...parsed.events);
        });
        resolve({
          events,
          close: () => {
            req.destroy();
          },
        });
      },
    );
    req.on('error', reject);
    openConnections.push(req);
    req.end();
  });
}

interface RawSseConnection {
  raw: () => string;
  close: () => void;
}

/**
 * Like `openSseConnection`, but keeps the exact raw bytes instead of parsing
 * them into discrete events -- `parseSseBuffer` deliberately discards
 * `:`-prefixed comment lines (SSE heartbeats), so proving a heartbeat comment
 * was (or was not) actually written needs the untouched raw text.
 */
function openRawSseConnection(port: number, path: string): Promise<RawSseConnection> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method: 'GET' },
      (res: IncomingMessage) => {
        let buffer = '';
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
        });
        resolve({
          raw: () => buffer,
          close: () => {
            req.destroy();
          },
        });
      },
    );
    req.on('error', reject);
    openConnections.push(req);
    req.end();
  });
}

describe('GET /api/cases/:caseId/events (SSE)', () => {
  let harness: HttpTestHarness | undefined;
  let server: Server | undefined;
  let port = 0;

  afterEach(async () => {
    // Destroy every client socket first, then force the server to drop any
    // it still holds, and only then close the listener. Any other order
    // releases the port while a socket is still live -- see
    // `openConnections` above for the cross-process failure that causes.
    while (openConnections.length > 0) {
      openConnections.pop()?.destroy();
    }
    if (server !== undefined) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    harness?.cleanup();
    harness = undefined;
    server = undefined;
  });

  async function startListening(): Promise<void> {
    if (harness === undefined) throw new Error('harness not initialized');
    server = createServer(harness.app);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real TCP address');
    }
    port = address.port;
  }

  async function startDemo(): Promise<{ caseId: string; expectedSequence: number }> {
    if (harness === undefined) throw new Error('harness not initialized');
    const response = await request(harness.server)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-start')
      .send({ demoId: 'car-purchase' });
    const receipt = asJson<CommandReceipt>(response.body);
    return { caseId: receipt.caseId, expectedSequence: receipt.acceptedSequence };
  }

  it('replays every existing activity event on connect, with id: set to its sequence (success)', async () => {
    harness = await createHttpTestHarness();
    await startListening();
    const { caseId } = await startDemo();

    const connection = await openSseConnection(port, `/api/cases/${caseId}/events`);
    await waitFor(() => connection.events.length >= 1);
    connection.close();

    expect(connection.events[0]?.id).toBe('1');
    expect(connection.events[0]?.event).toBe('command.accepted');
    const parsedData = JSON.parse(connection.events[0]?.data ?? '{}') as {
      caseId: string;
      sequence: number;
    };
    expect(parsedData.caseId).toBe(caseId);
    expect(parsedData.sequence).toBe(1);
  });

  it('delivers a new event live to an already-connected client', async () => {
    harness = await createHttpTestHarness();
    await startListening();
    const { caseId, expectedSequence } = await startDemo();

    const connection = await openSseConnection(port, `/api/cases/${caseId}/events`);
    await waitFor(() => connection.events.length >= 1);

    await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });

    await waitFor(() => connection.events.length >= 2);
    connection.close();

    expect(connection.events[1]?.id).toBe('2');
  });

  it('replays only events after Last-Event-ID on reconnect (duplicate suppression input)', async () => {
    harness = await createHttpTestHarness();
    await startListening();
    const { caseId, expectedSequence } = await startDemo();
    await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });

    const connection = await openSseConnection(port, `/api/cases/${caseId}/events`, {
      'Last-Event-ID': '1',
    });
    await waitFor(() => connection.events.length >= 1);
    connection.close();

    // Only sequence 2 replays -- sequence 1 was already seen before reconnect.
    expect(connection.events).toHaveLength(1);
    expect(connection.events[0]?.id).toBe('2');
  });

  it('SSE and the polling fallback produce the same final visible state', async () => {
    harness = await createHttpTestHarness();
    await startListening();
    const { caseId, expectedSequence } = await startDemo();

    const connection = await openSseConnection(port, `/api/cases/${caseId}/events`);
    await waitFor(() => connection.events.length >= 1);

    await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });
    await request(harness.server)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-3')
      .send({
        caseId,
        expectedSequence: expectedSequence + 1,
        option: { label: 'Honda Civic', kind: 'car', attributes: [] },
      });

    await waitFor(() => connection.events.length >= 3);
    connection.close();

    const poll = await request(harness.server).get(`/api/cases/${caseId}/events?mode=poll`);
    const pollBody = asJson<{ snapshot: CaseState; events: PublicActivityEvent[] }>(poll.body);
    const sseSequences = connection.events.map((event) => Number(event.id)).sort((a, b) => a - b);
    const pollSequences = pollBody.events.map((event) => event.sequence).sort((a, b) => a - b);

    expect(sseSequences).toEqual(pollSequences);

    const finalCase = await request(harness.server).get(`/api/cases/${caseId}`);
    expect(finalCase.status).toBe(200);
    expect(pollBody.snapshot).toEqual(asJson<CaseState>(finalCase.body));
    // Also cross-checked directly against the store, independent of any
    // HTTP transport: the true source of truth both routes read from.
    expect(harness.caseStore.load(caseId)).toEqual(pollBody.snapshot);
  });

  it('emits a resync marker and closes the connection when the consumer falls behind', async () => {
    // A separate, minimal app around the exact same `createEventsRouter`
    // (sharing `harness`'s real SqliteCaseStore/SqliteActivityStore, so a
    // case created through the full `harness.app` is visible here too),
    // with a `res.write()`-faking middleware that always reports
    // backpressure -- genuine OS-level socket backpressure over a fast
    // loopback connection is impractical to force deterministically in a
    // test, but the *effect* of write() persistently returning `false` is
    // exactly what `sse.ts`'s bounded writer reacts to, so this exercises
    // the real resync wiring in `events.ts` end-to-end without flakiness.
    harness = await createHttpTestHarness({ sseMaxQueueLength: 1 });
    const { caseId, expectedSequence } = await startDemo();
    // A second activity event so the initial replay alone exceeds maxQueueLength (1).
    await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });

    const app = express();
    app.use((_req, res, next) => {
      const originalWrite = res.write.bind(res) as (...args: unknown[]) => boolean;
      res.write = ((...args: unknown[]) => {
        originalWrite(...args);
        return false;
      }) as typeof res.write;
      next();
    });
    app.use(
      createEventsRouter({
        caseStore: harness.caseStore,
        activityStore: harness.activityStore,
        sseMaxQueueLength: 1,
      }),
    );
    server = createServer(app);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('expected a real TCP address');

    const connection = await openSseConnection(address.port, `/api/cases/${caseId}/events`);
    await waitFor(() => connection.events.some((event) => event.event === 'case.snapshot'));

    const resyncEvent = connection.events.find((event) => event.event === 'case.snapshot');
    expect(resyncEvent).toBeDefined();
    const payload = JSON.parse(resyncEvent?.data ?? '{}') as {
      safeDetails?: { resyncRequired?: boolean };
    };
    expect(payload.safeDetails?.resyncRequired).toBe(true);

    connection.close();
  });

  it('stops the initial replay loop as soon as resync has fired, never sending a later already-replayed event past the break', async () => {
    // A third pre-existing command so there are 3 activity events to
    // replay: `sseMaxQueueLength: 1` makes resync fire while sending the
    // *second* replayed event, leaving the loop's `if (writer.closed)
    // break;` check on the still-pending third one as the only thing that
    // can stop it from also being sent.
    harness = await createHttpTestHarness({ sseMaxQueueLength: 1 });
    const { caseId, expectedSequence } = await startDemo();
    await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });
    await request(harness.server)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-3')
      .send({
        caseId,
        expectedSequence: expectedSequence + 1,
        option: { label: 'Honda Civic', kind: 'car', attributes: [] },
      });

    const app = express();
    app.use((_req, res, next) => {
      const originalWrite = res.write.bind(res) as (...args: unknown[]) => boolean;
      res.write = ((...args: unknown[]) => {
        originalWrite(...args);
        return false;
      }) as typeof res.write;
      next();
    });
    app.use(
      createEventsRouter({
        caseStore: harness.caseStore,
        activityStore: harness.activityStore,
        sseMaxQueueLength: 1,
      }),
    );
    server = createServer(app);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('expected a real TCP address');

    const connection = await openSseConnection(address.port, `/api/cases/${caseId}/events`);
    await waitFor(() => connection.events.some((event) => event.event === 'case.snapshot'));
    connection.close();

    const replayedIds = connection.events
      .filter((event) => event.event !== 'case.snapshot')
      .map((event) => event.id);
    expect(replayedIds).toEqual(['1', '2']);
    // Sequence 3 was still in `subscription.replay` but the loop had
    // already broken out by the time it would have been sent.
    expect(connection.events.some((event) => event.id === '3')).toBe(false);
  });

  it('skips delivering a live activity event to an already-closed SSE writer instead of crashing or double-sending', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();

    function burstEvent(sequence: number, summary: string): PublicActivityEvent {
      return {
        schemaVersion: '1.0',
        eventId: `burst-${sequence}`,
        sequence,
        timestamp: '2026-08-27T00:00:00.000Z',
        caseId,
        type: 'command.accepted',
        phase: 'completed',
        summary,
      };
    }

    // A fake ActivityStore whose subscribe() synchronously fires three live
    // events back-to-back, entirely bypassing real network/timing -- the
    // only fully deterministic way to prove a live event arriving *after*
    // the writer already closed (event 2 pushes the fake maxQueueLength of 1
    // past its threshold) is skipped, without racing real socket teardown.
    const burstActivityStore: ActivityStore = {
      append: () => {
        throw new Error('not used by this test');
      },
      replayFrom: () => [],
      latestSequence: () => 0,
      subscribe: (_caseId, listener) => {
        listener(burstEvent(1, 'first'));
        listener(burstEvent(2, 'second (pushes past maxQueueLength, triggers resync)'));
        listener(burstEvent(3, 'third (must be skipped -- writer already closed)'));
        return { replay: [], unsubscribe: vi.fn() };
      },
    };

    const app = express();
    app.use((_req, res, next) => {
      const originalWrite = res.write.bind(res) as (...args: unknown[]) => boolean;
      res.write = ((...args: unknown[]) => {
        originalWrite(...args);
        return false;
      }) as typeof res.write;
      next();
    });
    app.use(
      createEventsRouter({
        caseStore: harness.caseStore,
        activityStore: burstActivityStore,
        sseMaxQueueLength: 1,
      }),
    );
    server = createServer(app);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('expected a real TCP address');

    const connection = await openSseConnection(address.port, `/api/cases/${caseId}/events`);
    await waitFor(() => connection.events.some((event) => event.event === 'case.snapshot'));
    connection.close();

    expect(connection.events.some((event) => event.id === '1')).toBe(true);
    expect(connection.events.some((event) => event.id === '2')).toBe(true);
    expect(connection.events.some((event) => event.id === '3')).toBe(false);
  });

  it('sends a periodic heartbeat comment while the connection stays open', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();

    const app = express();
    app.use(
      createEventsRouter({
        caseStore: harness.caseStore,
        activityStore: harness.activityStore,
        heartbeatIntervalMs: 20,
      }),
    );
    server = createServer(app);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('expected a real TCP address');

    const connection = await openRawSseConnection(address.port, `/api/cases/${caseId}/events`);
    await waitFor(() => connection.raw().includes(': heartbeat'));
    connection.close();
  });

  it('never sends a heartbeat once the writer has already closed, however long the interval keeps ticking', async () => {
    harness = await createHttpTestHarness({ sseMaxQueueLength: 1 });
    const { caseId, expectedSequence } = await startDemo();
    // A second activity event so the initial replay alone exceeds maxQueueLength (1).
    await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });

    const app = express();
    app.use((_req, res, next) => {
      const originalWrite = res.write.bind(res) as (...args: unknown[]) => boolean;
      res.write = ((...args: unknown[]) => {
        originalWrite(...args);
        return false;
      }) as typeof res.write;
      next();
    });
    app.use(
      createEventsRouter({
        caseStore: harness.caseStore,
        activityStore: harness.activityStore,
        sseMaxQueueLength: 1,
        heartbeatIntervalMs: 15,
      }),
    );
    server = createServer(app);
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('expected a real TCP address');

    const connection = await openRawSseConnection(address.port, `/api/cases/${caseId}/events`);
    await waitFor(() => connection.raw().includes('event: case.snapshot'));
    // The resync path already set `writer.closed = true` and called
    // `res.end()` synchronously, *before* the heartbeat interval (registered
    // afterward, `heartbeatIntervalMs` later) ever gets its first tick --
    // every subsequent tick during this bounded wait must see
    // `writer.closed` and skip, however many times it fires before the real
    // async socket-close teardown eventually clears the interval.
    await new Promise((resolve) => setTimeout(resolve, 80));
    connection.close();

    expect(connection.raw()).not.toContain(': heartbeat');
  });

  it('returns 404 for an unknown case instead of upgrading to SSE', async () => {
    harness = await createHttpTestHarness();
    await startListening();

    const response = await request(harness.server).get('/api/cases/does-not-exist/events');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).not.toContain('text/event-stream');
  });
});
