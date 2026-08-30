/**
 * `GET /ping` / `POST /invocations` (docs/specs/strands-runtime.md
 * "AgentCore contract"), against the real `CommandService`/`RunService`
 * command layer through `fixtures/http-harness.ts`'s real Express
 * application + real temporary SQLite database -- the same harness and
 * style `routes/commands.test.ts`/`routes/runs.test.ts` already use.
 */
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandReceipt, HttpErrorBody } from '@sift/contracts';
import { COMMAND_NAMES } from './commands.js';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';
import { AGENTCORE_COMMAND_NAMES } from './agentcore.js';

interface PingBody {
  status: string;
  time_of_last_update: number;
}

interface InvocationEnvelope<T> {
  response: T;
  status: 'success';
}

describe('AgentCore contract: GET /ping / POST /invocations', () => {
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

  describe('GET /ping', () => {
    it('returns exactly {status: "Healthy", time_of_last_update: <unix seconds>}', async () => {
      harness = createHttpTestHarness();

      const response = await request(harness.app).get('/ping');

      expect(response.status).toBe(200);
      const body = asJson<PingBody>(response.body);
      expect(Object.keys(body).sort()).toEqual(['status', 'time_of_last_update']);
      expect(body.status).toBe('Healthy');
      expect(Number.isInteger(body.time_of_last_update)).toBe(true);
    });

    it('never advances time_of_last_update across repeated pings (AWS: "Do not set time_of_last_update to the current time on every ping")', async () => {
      harness = createHttpTestHarness();

      const first = await request(harness.app).get('/ping');
      const second = await request(harness.app).get('/ping');

      expect(asJson<PingBody>(second.body).time_of_last_update).toBe(
        asJson<PingBody>(first.body).time_of_last_update,
      );
    });
  });

  describe('POST /invocations: structural authority boundary', () => {
    it('AGENTCORE_COMMAND_NAMES is exactly COMMAND_NAMES minus reviewProposal and reviewCaseExtension', () => {
      const expected = COMMAND_NAMES.filter(
        (name) => name !== 'reviewProposal' && name !== 'reviewCaseExtension',
      );
      expect([...AGENTCORE_COMMAND_NAMES].sort()).toEqual([...expected].sort());
    });

    it('rejects commandName "reviewProposal" as a schema validation failure, never reaching CommandService', async () => {
      harness = createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.app)
        .post('/invocations')
        .set('Idempotency-Key', 'cmd-invoke-1')
        .send({
          caseId,
          commandName: 'reviewProposal',
          input: {
            proposalId: 'does-not-matter',
            actor: 'human',
            decision: 'approve',
            expectedSequence,
          },
        });

      expect(response.status).toBe(400);
      expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
      // The case must be completely unaffected -- no proposal was reviewed.
      expect(harness.caseStore.load(caseId)?.eventSequence).toBe(expectedSequence);
    });

    it('rejects commandName "reviewCaseExtension" as a schema validation failure', async () => {
      harness = createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.app)
        .post('/invocations')
        .set('Idempotency-Key', 'cmd-invoke-2')
        .send({
          caseId,
          commandName: 'reviewCaseExtension',
          input: { extensionId: 'does-not-matter', decision: 'accept', expectedSequence },
        });

      expect(response.status).toBe(400);
      expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
    });
  });

  describe('POST /invocations: real command dispatch', () => {
    it('dispatches a real command (selectPack) into CommandService and durably persists the result', async () => {
      harness = createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.app)
        .post('/invocations')
        .set('Idempotency-Key', 'cmd-invoke-3')
        .send({
          caseId,
          commandName: 'selectPack',
          input: { packId: 'car-purchase', expectedSequence },
        });

      expect(response.status).toBe(200);
      const envelope = asJson<InvocationEnvelope<CommandReceipt>>(response.body);
      expect(envelope.status).toBe('success');
      expect(envelope.response.caseId).toBe(caseId);
      expect(harness.caseStore.load(caseId)?.eventSequence).toBe(
        envelope.response.acceptedSequence,
      );
    });

    it('requires an Idempotency-Key header for a mutating commandName call', async () => {
      harness = createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.app)
        .post('/invocations')
        .send({
          caseId,
          commandName: 'selectPack',
          input: { packId: 'car-purchase', expectedSequence },
        });

      expect(response.status).toBe(400);
    });

    it('returns a 409 conflict envelope with the latest snapshot for a stale expectedSequence', async () => {
      harness = createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.app)
        .post('/invocations')
        .set('Idempotency-Key', 'cmd-invoke-4')
        .send({
          caseId,
          commandName: 'selectPack',
          input: { packId: 'car-purchase', expectedSequence: expectedSequence + 5 },
        });

      expect(response.status).toBe(409);
    });

    it('is idempotent over HTTP: retrying the same Idempotency-Key returns the same accepted sequence', async () => {
      harness = createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();
      const body = {
        caseId,
        commandName: 'selectPack',
        input: { packId: 'car-purchase', expectedSequence },
      };

      const first = await request(harness.app)
        .post('/invocations')
        .set('Idempotency-Key', 'cmd-invoke-5')
        .send(body);
      const second = await request(harness.app)
        .post('/invocations')
        .set('Idempotency-Key', 'cmd-invoke-5')
        .send(body);

      expect(
        asJson<InvocationEnvelope<CommandReceipt>>(second.body).response.acceptedSequence,
      ).toBe(asJson<InvocationEnvelope<CommandReceipt>>(first.body).response.acceptedSequence);
    });
  });

  describe('POST /invocations: input defaulting when the input field is omitted', () => {
    it("defaults input to {} for a commandName dispatch (still requiring the command's own required fields)", async () => {
      harness = createHttpTestHarness();
      const { caseId } = await startDemo();

      const response = await request(harness.app)
        .post('/invocations')
        .set('Idempotency-Key', 'cmd-invoke-no-input')
        .send({ caseId, commandName: 'selectPack' });

      // No crash from spreading a missing `input` -- CommandService's own
      // schema validation rejects the now-missing required `packId`/
      // `expectedSequence` fields instead.
      expect(response.status).toBe(400);
      expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
    });
  });

  describe('POST /invocations: requestInvestigation dispatch (RunService, the real engine)', () => {
    it('creates a real, durably recorded run via action: "requestInvestigation"', async () => {
      harness = createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.app)
        .post('/invocations')
        .set('Idempotency-Key', 'cmd-invoke-6')
        .send({ caseId, action: 'requestInvestigation', input: { expectedSequence } });

      expect(response.status).toBe(200);
      const envelope = asJson<InvocationEnvelope<{ runId: string }>>(response.body);
      expect(envelope.status).toBe('success');
      const runId = envelope.response.runId;
      expect(runId).toBeTruthy();

      const row = harness.database.sqlite
        .prepare('SELECT status FROM runs WHERE id = ?')
        .get(runId) as { status: string } | undefined;
      expect(row?.status).toBe('queued');
    });

    it('requires an Idempotency-Key header for action: "requestInvestigation" too, not just commandName dispatch', async () => {
      harness = createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.app)
        .post('/invocations')
        .send({ caseId, action: 'requestInvestigation', input: { expectedSequence } });

      expect(response.status).toBe(400);
      expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
    });

    it('defaults input to {} for action: "requestInvestigation" (still requiring expectedSequence via RequestInvestigationInputSchema)', async () => {
      harness = createHttpTestHarness();
      const { caseId } = await startDemo();

      const response = await request(harness.app)
        .post('/invocations')
        .set('Idempotency-Key', 'cmd-invoke-no-input-run')
        .send({ caseId, action: 'requestInvestigation' });

      expect(response.status).toBe(400);
      expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
    });

    it('rejects commandName and action supplied together as a validation failure', async () => {
      harness = createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.app)
        .post('/invocations')
        .set('Idempotency-Key', 'cmd-invoke-7')
        .send({
          caseId,
          commandName: 'selectPack',
          action: 'requestInvestigation',
          input: { expectedSequence },
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /invocations: default read-only case context', () => {
    it('returns the real case snapshot when neither commandName nor action is given', async () => {
      harness = createHttpTestHarness();
      const { caseId } = await startDemo();

      const response = await request(harness.app).post('/invocations').send({ caseId });

      expect(response.status).toBe(200);
      const envelope = asJson<InvocationEnvelope<{ id: string }>>(response.body);
      expect(envelope.status).toBe('success');
      expect(envelope.response.id).toBe(caseId);
    });

    it('returns 404 for an unknown case', async () => {
      harness = createHttpTestHarness();

      const response = await request(harness.app)
        .post('/invocations')
        .send({ caseId: 'does-not-exist' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /invocations: malformed input', () => {
    it('returns 400 for a non-object (array) JSON body', async () => {
      harness = createHttpTestHarness();

      const response = await request(harness.app).post('/invocations').send([1, 2, 3]);

      expect(response.status).toBe(400);
    });

    it('returns 400 when caseId is missing', async () => {
      harness = createHttpTestHarness();

      const response = await request(harness.app).post('/invocations').send({});

      expect(response.status).toBe(400);
    });
  });
});
