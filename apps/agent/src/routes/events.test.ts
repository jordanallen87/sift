import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { CaseState, CommandReceipt, HttpErrorBody, PublicActivityEvent } from '@pax/contracts';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';

interface PollResponse {
  snapshot: CaseState;
  events: PublicActivityEvent[];
}

describe('GET /api/cases/:caseId/events?mode=poll (polling fallback)', () => {
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

  it('returns the current snapshot and every activity event when afterSequence is omitted (success)', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();

    const response = await request(harness.app).get(`/api/cases/${caseId}/events?mode=poll`);

    expect(response.status).toBe(200);
    const body = asJson<PollResponse>(response.body);
    expect(body.snapshot.id).toBe(caseId);
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events[0]?.type).toBe('command.accepted');
  });

  it('returns only events after afterSequence', async () => {
    harness = createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();
    await request(harness.app)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });

    const all = await request(harness.app).get(`/api/cases/${caseId}/events?mode=poll`);
    expect(asJson<PollResponse>(all.body).events.length).toBe(2);

    const afterFirst = await request(harness.app).get(
      `/api/cases/${caseId}/events?mode=poll&afterSequence=1`,
    );
    const body = asJson<PollResponse>(afterFirst.body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.sequence).toBe(2);
  });

  it('returns not_found for an unknown case', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/cases/does-not-exist/events?mode=poll');

    expect(response.status).toBe(404);
  });

  it('returns validation for a malformed afterSequence', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();

    const response = await request(harness.app).get(
      `/api/cases/${caseId}/events?mode=poll&afterSequence=not-a-number`,
    );

    expect(response.status).toBe(400);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
  });
});
