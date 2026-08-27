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
import { afterEach, describe, expect, it } from 'vitest';
import type { CaseState, CommandReceipt, PublicActivityEvent } from '@pax/contracts';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';
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

function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
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
        resolve({ events, close: () => req.destroy() });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('GET /api/cases/:caseId/events (SSE)', () => {
  let harness: HttpTestHarness | undefined;
  let server: Server | undefined;
  let port = 0;

  afterEach(async () => {
    if (server !== undefined) {
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
    const response = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-start')
      .send({ demoId: 'car-purchase' });
    const receipt = asJson<CommandReceipt>(response.body);
    return { caseId: receipt.caseId, expectedSequence: receipt.acceptedSequence };
  }

  it('replays every existing activity event on connect, with id: set to its sequence (success)', async () => {
    harness = createHttpTestHarness();
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
    harness = createHttpTestHarness();
    await startListening();
    const { caseId, expectedSequence } = await startDemo();

    const connection = await openSseConnection(port, `/api/cases/${caseId}/events`);
    await waitFor(() => connection.events.length >= 1);

    await request(harness.app)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });

    await waitFor(() => connection.events.length >= 2);
    connection.close();

    expect(connection.events[1]?.id).toBe('2');
  });

  it('replays only events after Last-Event-ID on reconnect (duplicate suppression input)', async () => {
    harness = createHttpTestHarness();
    await startListening();
    const { caseId, expectedSequence } = await startDemo();
    await request(harness.app)
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
    harness = createHttpTestHarness();
    await startListening();
    const { caseId, expectedSequence } = await startDemo();

    const connection = await openSseConnection(port, `/api/cases/${caseId}/events`);
    await waitFor(() => connection.events.length >= 1);

    await request(harness.app)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });
    await request(harness.app)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-3')
      .send({
        caseId,
        expectedSequence: expectedSequence + 1,
        option: { label: 'Honda Civic', kind: 'car', attributes: [] },
      });

    await waitFor(() => connection.events.length >= 3);
    connection.close();

    const poll = await request(harness.app).get(`/api/cases/${caseId}/events?mode=poll`);
    const pollBody = asJson<{ snapshot: CaseState; events: PublicActivityEvent[] }>(poll.body);
    const sseSequences = connection.events.map((event) => Number(event.id)).sort((a, b) => a - b);
    const pollSequences = pollBody.events.map((event) => event.sequence).sort((a, b) => a - b);

    expect(sseSequences).toEqual(pollSequences);

    const finalCase = await request(harness.app).get(`/api/cases/${caseId}`);
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
    harness = createHttpTestHarness({ sseMaxQueueLength: 1 });
    const { caseId, expectedSequence } = await startDemo();
    // A second activity event so the initial replay alone exceeds maxQueueLength (1).
    await request(harness.app)
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

  it('returns 404 for an unknown case instead of upgrading to SSE', async () => {
    harness = createHttpTestHarness();
    await startListening();

    const response = await request(harness.app).get('/api/cases/does-not-exist/events');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).not.toContain('text/event-stream');
  });
});
