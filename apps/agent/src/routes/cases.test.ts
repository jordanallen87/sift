import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { CaseState, CommandReceipt, HttpErrorBody } from '@sift/contracts';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';

describe('POST /api/cases/demo, POST /api/cases, and GET /api/cases/:caseId', () => {
  let harness: HttpTestHarness | undefined;

  afterEach(() => {
    harness?.cleanup();
    harness = undefined;
  });

  it('creates a fully-seeded case and persists it (success) -- response and persisted state both assert', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-1')
      .send({ demoId: 'car-purchase' });

    expect(response.status).toBe(200);
    const receipt = asJson<CommandReceipt>(response.body);
    expect(receipt.commandId).toBe('cmd-1');
    expect(receipt.snapshot?.pack.id).toBe('car-purchase');
    const caseId = receipt.caseId;

    // Persisted state, read directly from the store (not just the response).
    const persisted = harness.caseStore.load(caseId);
    expect(persisted?.id).toBe(caseId);
    expect(persisted?.attributeDefinitions).toHaveLength(1);
    expect(persisted?.criteria).toHaveLength(1);
  });

  it('rejects a missing Idempotency-Key header (validation)', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .post('/api/cases/demo')
      .send({ demoId: 'car-purchase' });

    expect(response.status).toBe(400);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
  });

  it('rejects a malformed Idempotency-Key header (validation)', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'not valid! key/with spaces')
      .send({ demoId: 'car-purchase' });

    expect(response.status).toBe(400);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
  });

  it('rejects an invalid demoId (validation)', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-1')
      .send({ demoId: 'not-a-real-demo' });

    expect(response.status).toBe(400);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
  });

  it('returns not_found for a demoId with no installed pack', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-1')
      .send({ demoId: 'home-energy-guardian' });

    expect(response.status).toBe(404);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('NOT_FOUND');
  });

  it('is idempotent over HTTP: retrying the same Idempotency-Key returns the original case', async () => {
    harness = createHttpTestHarness();

    const first = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-1')
      .send({ demoId: 'car-purchase' });
    const second = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-1')
      .send({ demoId: 'car-purchase' });

    expect(asJson<CommandReceipt>(second.body).caseId).toBe(
      asJson<CommandReceipt>(first.body).caseId,
    );
  });

  it('GET /api/cases/:caseId returns the persisted snapshot (success)', async () => {
    harness = createHttpTestHarness();
    const created = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-1')
      .send({ demoId: 'car-purchase' });
    const caseId = asJson<CommandReceipt>(created.body).caseId;

    const response = await request(harness.app).get(`/api/cases/${caseId}`);

    expect(response.status).toBe(200);
    const snapshot = asJson<CaseState>(response.body);
    expect(snapshot.id).toBe(caseId);
    expect(snapshot.pack.id).toBe('car-purchase');
  });

  it('GET /api/cases/:caseId returns not_found for an unknown case', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/cases/does-not-exist');

    expect(response.status).toBe(404);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('NOT_FOUND');
  });

  it('reflects a later command in a subsequent GET (persistence check across two requests)', async () => {
    harness = createHttpTestHarness();
    const created = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-1')
      .send({ demoId: 'car-purchase' });
    const createdReceipt = asJson<CommandReceipt>(created.body);
    const caseId = createdReceipt.caseId;
    const expectedSequence = createdReceipt.acceptedSequence;

    await request(harness.app)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-2')
      .send({
        caseId,
        expectedSequence,
        option: { label: 'Honda Civic', kind: 'car', attributes: [] },
      });

    const response = await request(harness.app).get(`/api/cases/${caseId}`);
    const snapshot = asJson<CaseState>(response.body);
    expect(snapshot.entities).toHaveLength(1);
    expect(snapshot.entities[0]?.label).toBe('Honda Civic');
  });

  it('POST /api/cases creates a fully-seeded, zero-entity case pinned to the given pack (success)', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .post('/api/cases')
      .set('Idempotency-Key', 'cmd-1')
      .send({ packId: 'car-purchase' });

    expect(response.status).toBe(200);
    const receipt = asJson<CommandReceipt>(response.body);
    expect(receipt.snapshot?.pack.id).toBe('car-purchase');
    expect(receipt.snapshot?.entities).toEqual([]);

    const persisted = harness.caseStore.load(receipt.caseId);
    expect(persisted?.entities).toEqual([]);
    expect(persisted?.attributeDefinitions).toHaveLength(1);
    expect(persisted?.criteria).toHaveLength(1);
  });

  it('POST /api/cases rejects an unregistered packId (not_found)', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .post('/api/cases')
      .set('Idempotency-Key', 'cmd-1')
      .send({ packId: 'not-a-real-pack' });

    expect(response.status).toBe(404);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('NOT_FOUND');
  });

  it('POST /api/cases rejects a missing Idempotency-Key header (validation)', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).post('/api/cases').send({ packId: 'car-purchase' });

    expect(response.status).toBe(400);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
  });

  it('POST /api/cases is idempotent over HTTP: retrying the same Idempotency-Key returns the original case', async () => {
    harness = createHttpTestHarness();

    const first = await request(harness.app)
      .post('/api/cases')
      .set('Idempotency-Key', 'cmd-1')
      .send({ packId: 'car-purchase' });
    const second = await request(harness.app)
      .post('/api/cases')
      .set('Idempotency-Key', 'cmd-1')
      .send({ packId: 'car-purchase' });

    expect(asJson<CommandReceipt>(second.body).caseId).toBe(
      asJson<CommandReceipt>(first.body).caseId,
    );
  });

  it('a POST /api/cases-created case works with the normal command/GET flow (upsertOption then GET)', async () => {
    harness = createHttpTestHarness();
    const created = await request(harness.app)
      .post('/api/cases')
      .set('Idempotency-Key', 'cmd-1')
      .send({ packId: 'car-purchase' });
    const createdReceipt = asJson<CommandReceipt>(created.body);
    const caseId = createdReceipt.caseId;
    const expectedSequence = createdReceipt.acceptedSequence;

    await request(harness.app)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-2')
      .send({
        caseId,
        expectedSequence,
        option: { label: 'Toyota Camry', kind: 'car', attributes: [] },
      });

    const response = await request(harness.app).get(`/api/cases/${caseId}`);
    const snapshot = asJson<CaseState>(response.body);
    expect(snapshot.entities).toHaveLength(1);
    expect(snapshot.entities[0]?.label).toBe('Toyota Camry');
  });
});
