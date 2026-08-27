import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandReceipt, RunReceipt } from '@pax/contracts';
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
    const response = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-start')
      .send({ demoId: 'car-purchase' });
    const receipt = asJson<CommandReceipt>(response.body);
    return { caseId: receipt.caseId, expectedSequence: receipt.acceptedSequence };
  }

  it('creates a run and returns a RunReceipt (success), and it is durably recorded', async () => {
    harness = createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.app)
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

  it('returns 400 without an Idempotency-Key header (validation)', async () => {
    harness = createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.app)
      .post(`/api/cases/${caseId}/run`)
      .send({ caseId, expectedSequence });

    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown case', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .post('/api/cases/does-not-exist/run')
      .set('Idempotency-Key', 'cmd-run-1')
      .send({ caseId: 'does-not-exist', expectedSequence: 0 });

    expect(response.status).toBe(404);
  });

  it('returns 409 with the latest snapshot for a stale expectedSequence (conflict)', async () => {
    harness = createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.app)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-1')
      .send({ caseId, expectedSequence: expectedSequence + 5 });

    expect(response.status).toBe(409);
    const body = asJson<{ snapshot: { eventSequence: number } }>(response.body);
    expect(body.snapshot.eventSequence).toBe(expectedSequence);
  });

  it('rejects an explicit unknown obligationId (validation)', async () => {
    harness = createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.app)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-1')
      .send({ caseId, obligationId: 'does-not-exist', expectedSequence });

    expect(response.status).toBe(400);
  });

  it('is idempotent over HTTP: retrying the same Idempotency-Key returns the same run', async () => {
    harness = createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();
    const body = { caseId, expectedSequence };

    const first = await request(harness.app)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-1')
      .send(body);
    const second = await request(harness.app)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-1')
      .send(body);

    expect(asJson<RunReceipt>(second.body).runId).toBe(asJson<RunReceipt>(first.body).runId);
    const count = harness.database.sqlite.prepare('SELECT COUNT(*) as n FROM runs').get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });
});
