import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  CaseState,
  CommandReceipt,
  HttpErrorBody,
  PublicActivityEvent,
} from '@sift/contracts';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';
import type { CaseStore } from '../store/case-store.js';
import { createEventsRouter } from './events.js';

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
    // Assert the response actually succeeded before indexing into its body.
    // This test has flaked twice under `pnpm verify`'s parallel workers, and
    // both times the only evidence was `TypeError: Cannot read properties of
    // undefined (reading 'length')` -- which says nothing about WHY the poll
    // came back without an `events` array. Checking the status first turns
    // the next occurrence into a legible failure (a status and an error
    // body) instead of a dead end. Strengthens the test; changes nothing
    // about what it proves on the passing path.
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(asJson<PollResponse>(all.body).events.length).toBe(2);

    const afterFirst = await request(harness.app).get(
      `/api/cases/${caseId}/events?mode=poll&afterSequence=1`,
    );
    const body = asJson<PollResponse>(afterFirst.body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.sequence).toBe(2);
  });

  it('falls back to the pre-fetch snapshot if the case becomes momentarily unavailable between the initial existence check and the second, response-time read (defensive re-load fallback)', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();
    const realCaseStore = harness.caseStore;

    // A CaseStore whose load() answers the *first* call (the route's
    // existence check) from the real store, then simulates the case having
    // vanished for the *second* call (the route's own re-load "at response
    // time") -- the one input that drives `?? snapshot`'s right-hand side.
    let loadCalls = 0;
    const flakyCaseStore: CaseStore = {
      load: (id) => {
        loadCalls += 1;
        return loadCalls === 1 ? realCaseStore.load(id) : undefined;
      },
      peekIdempotent: (commandId) => realCaseStore.peekIdempotent(commandId),
      append: (id, events, expectedSequence, options) =>
        realCaseStore.append(id, events, expectedSequence, options),
      updateSelection: (id, patch, expectedSequence, updatedAt, idempotency) =>
        realCaseStore.updateSelection(id, patch, expectedSequence, updatedAt, idempotency),
      subscribe: (id, fromSequence) => realCaseStore.subscribe(id, fromSequence),
      resetDemo: (id) => realCaseStore.resetDemo(id),
    };

    const app = express();
    app.use(
      createEventsRouter({ caseStore: flakyCaseStore, activityStore: harness.activityStore }),
    );

    const response = await request(app).get(`/api/cases/${caseId}/events?mode=poll`);

    expect(response.status).toBe(200);
    const body = asJson<PollResponse>(response.body);
    expect(body.snapshot.id).toBe(caseId);
    expect(loadCalls).toBe(2);
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
