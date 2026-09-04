import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandReceipt, HttpErrorBody, RunReceipt } from '@sift/contracts';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';

describe('POST /api/cases/:caseId/run', () => {
  let harness: HttpTestHarness | undefined;

  afterEach(() => {
    harness?.cleanup();
    harness = undefined;
  });

  async function startDemo(): Promise<{ caseId: string; expectedSequence: number }> {
    if (harness === undefined) throw new Error('harness not initialized');
    const response = await request(harness.server)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-start')
      .send({ demoId: 'car-purchase' });
    const receipt = asJson<CommandReceipt>(response.body);
    return { caseId: receipt.caseId, expectedSequence: receipt.acceptedSequence };
  }

  it('creates a run and returns a RunReceipt (success), and it is durably recorded', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-1')
      .send({ caseId, expectedSequence });

    expect(response.status).toBe(200);
    const receipt = asJson<RunReceipt>(response.body);
    expect(receipt.runId).toBeTruthy();
    expect(receipt.caseId).toBe(caseId);

    const row = harness.database.sqlite
      .prepare('SELECT status FROM runs WHERE id = ?')
      .get(receipt.runId) as { status: string } | undefined;
    expect(row?.status).toBe('queued');

    const activity = harness.activityStore.replayFrom(caseId, 0);
    expect(activity.some((event) => event.type === 'run.queued')).toBe(true);
  });

  it('falls back to an empty body when no request body is sent at all, still requiring expectedSequence via validation', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();

    // Deliberately no `.send(...)` at all -- no Content-Type header reaches
    // the server, so `express.json()` never parses a body and `req.body`
    // stays `undefined` (not even `{}`), exercising the
    // `typeof req.body === 'object'` false branch of the fallback.
    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-no-body');

    expect(response.status).toBe(400);
  });

  it('returns 400 without an Idempotency-Key header (validation)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/run`)
      .send({ caseId, expectedSequence });

    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown case', async () => {
    harness = await createHttpTestHarness();

    const response = await request(harness.server)
      .post('/api/cases/does-not-exist/run')
      .set('Idempotency-Key', 'cmd-run-1')
      .send({ caseId: 'does-not-exist', expectedSequence: 0 });

    expect(response.status).toBe(404);
  });

  it('returns 409 with the latest snapshot for a stale expectedSequence (conflict)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-1')
      .send({ caseId, expectedSequence: expectedSequence + 5 });

    expect(response.status).toBe(409);
    const body = asJson<{ snapshot: { eventSequence: number } }>(response.body);
    expect(body.snapshot.eventSequence).toBe(expectedSequence);
  });

  it('rejects an explicit unknown obligationId (validation)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-1')
      .send({ caseId, obligationId: 'does-not-exist', expectedSequence });

    expect(response.status).toBe(400);
  });

  it('is idempotent over HTTP: retrying the same Idempotency-Key returns the same run', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();
    const body = { caseId, expectedSequence };

    const first = await request(harness.server)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-1')
      .send(body);
    const second = await request(harness.server)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-1')
      .send(body);

    expect(asJson<RunReceipt>(second.body).runId).toBe(asJson<RunReceipt>(first.body).runId);
    const count = harness.database.sqlite.prepare('SELECT COUNT(*) as n FROM runs').get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });

  // I1 (ADR 0006 decision 8; debugging-and-observability.md "WebMCP tool
  // calls"): `sift_request_investigation` is the WebMCP tool that starts a
  // run, so "this assistant's tool call caused this entire run" is the one
  // causal claim this route has to be able to prove afterwards. It reuses
  // `routes/commands.ts`'s exact `X-Sift-Command-Origin` header,
  // `readCommandOrigin` reader, and `COMMAND_ORIGINS` vocabulary -- not a
  // second, parallel provenance concept.
  describe('X-Sift-Command-Origin (I1: WebMCP call provenance)', () => {
    it('durably records a webmcp-originated run on the run row and its run.queued activity event', async () => {
      harness = await createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.server)
        .post(`/api/cases/${caseId}/run`)
        .set('Idempotency-Key', 'cmd-run-webmcp')
        .set('X-Sift-Command-Origin', 'webmcp')
        .send({ caseId, expectedSequence });

      expect(response.status).toBe(200);
      const runId = asJson<RunReceipt>(response.body).runId;

      // Persisted state, not a spy: the real `runs` row in the real
      // migrated SQLite database.
      const row = harness.database.sqlite
        .prepare('SELECT origin FROM runs WHERE id = ?')
        .get(runId) as { origin: string | null } | undefined;
      expect(row?.origin).toBe('webmcp');
      expect(harness.runStore.load(runId)?.origin).toBe('webmcp');

      // And on the replayable public stream, in the same `safeDetails.origin`
      // shape `routes/commands.ts` already writes for a tagged command.
      const queued = harness.activityStore
        .replayFrom(caseId, 0)
        .find((event) => event.type === 'run.queued');
      expect(queued?.runId).toBe(runId);
      expect(queued?.safeDetails).toEqual({ origin: 'webmcp' });
    });

    it('records no origin at all when the header is absent -- never a default of "user" or "webmcp"', async () => {
      harness = await createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.server)
        .post(`/api/cases/${caseId}/run`)
        .set('Idempotency-Key', 'cmd-run-untagged')
        .send({ caseId, expectedSequence });

      expect(response.status).toBe(200);
      const runId = asJson<RunReceipt>(response.body).runId;

      const row = harness.database.sqlite
        .prepare('SELECT origin FROM runs WHERE id = ?')
        .get(runId) as { origin: string | null } | undefined;
      expect(row?.origin).toBeNull();
      expect(harness.runStore.load(runId)?.origin).toBeUndefined();

      const queued = harness.activityStore
        .replayFrom(caseId, 0)
        .find((event) => event.type === 'run.queued');
      expect(queued?.safeDetails).toBeUndefined();
    });

    it('returns 400 VALIDATION for an unrecognized origin value, never creating a run', async () => {
      harness = await createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.server)
        .post(`/api/cases/${caseId}/run`)
        .set('Idempotency-Key', 'cmd-run-bogus')
        .set('X-Sift-Command-Origin', 'ui')
        .send({ caseId, expectedSequence });

      expect(response.status).toBe(400);
      expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
      // Proves it never reached `RunService`: no run row exists at all.
      const count = harness.database.sqlite.prepare('SELECT COUNT(*) as n FROM runs').get() as {
        n: number;
      };
      expect(count.n).toBe(0);
    });
  });
});
