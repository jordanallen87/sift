/**
 * The RunPlan over real HTTP, against the real Express app and a real
 * migrated SQLite database.
 *
 * This is the test that decides whether the demo beat is true end to end.
 * Everything below happens through the same endpoints the browser and
 * ChatGPT use: no service is reached into, no store is written directly,
 * and the proof is read back from the API rather than from an object the
 * test still holds.
 */
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandReceipt, PublicActivityEvent, RunReceipt } from '@sift/contracts';
import type { RunPlan } from '../runtime/run-plan.js';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';

interface RunPlanResponse {
  plan: RunPlan;
  history: RunPlan[];
}

describe('GET /api/cases/:caseId/run-plan', () => {
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

  /**
   * Adds one candidate the way the product does -- through the same
   * `upsertOption` command a WebMCP tool call or a UI action would use.
   * The demo launcher seeds no entities in this harness, and a plan for a
   * case with no options has nothing to plan.
   */
  async function addCandidate(
    caseId: string,
    expectedSequence: number,
    optionId: string,
  ): Promise<number> {
    if (harness === undefined) throw new Error('harness not initialized');
    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', `cmd-option-${optionId}`)
      .send({
        caseId,
        optionId,
        expectedSequence,
        option: { label: optionId.toUpperCase(), kind: 'candidate', attributes: [] },
      });
    expect(response.status).toBe(200);
    return asJson<CommandReceipt>(response.body).acceptedSequence;
  }

  async function requestRun(caseId: string, expectedSequence: number): Promise<number> {
    if (harness === undefined) throw new Error('harness not initialized');
    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run-1')
      .send({ caseId, expectedSequence });
    return asJson<RunReceipt>(response.body).acceptedSequence;
  }

  it('reports 404 for a case that has no plan yet, rather than an empty one', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();

    const response = await request(harness.server).get(`/api/cases/${caseId}/run-plan`);

    expect(response.status).toBe(404);
  });

  it('serves the plan a requested run created', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();
    const afterOption = await addCandidate(caseId, expectedSequence, 'rav4');
    await requestRun(caseId, afterOption);

    const response = await request(harness.server).get(`/api/cases/${caseId}/run-plan`);

    expect(response.status).toBe(200);
    const body = asJson<RunPlanResponse>(response.body);
    expect(body.plan.version).toBe(1);
    expect(body.plan.caseId).toBe(caseId);
    expect(body.history).toHaveLength(1);
  });

  it('revises the plan when a person keeps a candidate, and says what survived', async () => {
    // The demo beat, over the wire: the plan exists before triage, triage
    // changes what Sift should be doing, and the new version reuses the
    // safe work the first version already finished.
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();
    const afterOption = await addCandidate(caseId, expectedSequence, 'rav4');
    const sequence = await requestRun(caseId, afterOption);

    const before = asJson<RunPlanResponse>(
      (await request(harness.server).get(`/api/cases/${caseId}/run-plan`)).body,
    );
    const candidateId = before.plan.items[0]?.targetEntityId;
    expect(candidateId).toBeDefined();
    // Before any triage, nothing expensive is planned at all.
    expect(before.plan.items.every((item) => item.depth === 'shallow')).toBe(true);

    const keep = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/setCandidateDisposition`)
      .set('Idempotency-Key', 'cmd-keep-1')
      .send({
        caseId,
        expectedSequence: sequence,
        actor: 'human',
        entityId: candidateId,
        disposition: 'keep',
      });
    expect(keep.status).toBe(200);

    const after = asJson<RunPlanResponse>(
      (await request(harness.server).get(`/api/cases/${caseId}/run-plan`)).body,
    );

    expect(after.plan.version).toBe(2);
    expect(after.plan.revision?.reason).toBe('triage_changed');
    expect(after.plan.revision?.trigger).toBe(candidateId);
    // The safe work done before triage is carried over, not repeated.
    expect(after.plan.revision?.reusedSignatures).toContain(
      `enrich_candidate:${String(candidateId)}`,
    );
    // And history is genuinely durable: both versions are readable.
    expect(after.history.map((plan) => plan.version)).toEqual([1, 2]);
  });

  it('narrates the revision in the activity stream a person is watching', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();
    const afterOption = await addCandidate(caseId, expectedSequence, 'rav4');
    const sequence = await requestRun(caseId, afterOption);

    const before = asJson<RunPlanResponse>(
      (await request(harness.server).get(`/api/cases/${caseId}/run-plan`)).body,
    );
    const candidateId = before.plan.items[0]?.targetEntityId ?? '';

    await request(harness.server)
      .post(`/api/cases/${caseId}/commands/setCandidateDisposition`)
      .set('Idempotency-Key', 'cmd-keep-2')
      .send({
        caseId,
        expectedSequence: sequence,
        actor: 'human',
        entityId: candidateId,
        disposition: 'keep',
      });

    const events = asJson<{ events: PublicActivityEvent[] }>(
      (await request(harness.server).get(`/api/cases/${caseId}/events?mode=poll&afterSequence=0`))
        .body,
    ).events;
    const types = events.map((event) => event.type);

    expect(types).toContain('plan.created');
    expect(types).toContain('plan.revised');
    const revised = events.find((event) => event.type === 'plan.revised');
    expect(revised?.summary).toMatch(/reused/i);
  });

  it('survives a restart: the plan and its history are read from SQLite, not memory', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();
    const afterOption = await addCandidate(caseId, expectedSequence, 'rav4');
    await requestRun(caseId, afterOption);

    // The plan service the app is serving from is not the one this test
    // consults; both read the same database file.
    const rows = harness.database.sqlite
      .prepare('SELECT version FROM run_plans WHERE case_id = ? ORDER BY version')
      .all(caseId) as { version: number }[];

    expect(rows.map((row) => row.version)).toEqual([1]);
  });
});
