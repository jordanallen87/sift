import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { PRESENTATION_ONLY_ACTIVITY_DETAIL } from '@sift/contracts';
import type { CommandReceipt, HttpConflictResponse, HttpErrorBody } from '@sift/contracts';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';

describe('POST /api/cases/:caseId/commands/:commandName', () => {
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

  it('dispatches selectPack and persists the result (success)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });

    expect(response.status).toBe(200);
    const receipt = asJson<CommandReceipt>(response.body);
    expect(receipt.snapshot?.pack.selectedBy).toBe('user');
    expect(harness.caseStore.load(caseId)?.eventSequence).toBe(receipt.acceptedSequence);
  });

  it('returns 404 for an unknown command name', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/notARealCommand`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, expectedSequence });

    expect(response.status).toBe(404);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('NOT_FOUND');
  });

  it('returns 400 without an Idempotency-Key header (validation)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .send({ caseId, packId: 'car-purchase', expectedSequence });

    expect(response.status).toBe(400);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
  });

  it("falls back to an empty body when no request body is sent at all, still requiring the command's own fields via validation", async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();

    // Deliberately no `.send(...)` at all -- no Content-Type header reaches
    // the server, so `express.json()` never parses a body and `req.body`
    // stays `undefined` (not even `{}`), exercising the
    // `typeof req.body === 'object'` false branch of the fallback.
    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-no-body');

    expect(response.status).toBe(400);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
  });

  it('returns 400 when the body caseId does not match the URL caseId (validation)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId: 'a-different-case-id', packId: 'car-purchase', expectedSequence });

    expect(response.status).toBe(400);
  });

  it('returns 400 for schema-invalid input (validation)', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence: -1 });

    expect(response.status).toBe(400);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
  });

  it('returns 404 for a command against an unknown case', async () => {
    harness = await createHttpTestHarness();

    const response = await request(harness.server)
      .post('/api/cases/does-not-exist/commands/selectPack')
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId: 'does-not-exist', packId: 'car-purchase', expectedSequence: 0 });

    expect(response.status).toBe(404);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('NOT_FOUND');
  });

  it('returns 409 with the latest snapshot for a stale expectedSequence (conflict)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence: expectedSequence + 5 });

    expect(response.status).toBe(409);
    const body = asJson<HttpConflictResponse>(response.body);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.snapshot.eventSequence).toBe(expectedSequence);
  });

  it('returns 403 for a policy violation (removing a protected criterion)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/updateCriteria`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, expectedSequence, operations: [{ op: 'remove', criterionId: 'price' }] });

    expect(response.status).toBe(403);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('POLICY');
  });

  it('is idempotent over HTTP: retrying the same Idempotency-Key does not double-apply', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();
    const body = {
      caseId,
      expectedSequence,
      option: { label: 'Honda Civic', kind: 'car', attributes: [] },
    };

    const first = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-2')
      .send(body);
    const second = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-2')
      .send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(harness.caseStore.load(caseId)?.entities).toHaveLength(1);
  });

  it('returns 500 INTERNAL when the command service throws unexpectedly, without leaking the error', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();
    // updateCriteria throws a plain Error (not a ServiceFailure) when the
    // case's pinned pack is missing from the registry -- a real invariant
    // violation this route must surface as 500, not silently as 4xx.
    harness.caseStore.load = () => {
      throw new Error('simulated store failure');
    };

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/selectPack`)
      .set('Idempotency-Key', 'cmd-2')
      .send({ caseId, packId: 'car-purchase', expectedSequence });

    expect(response.status).toBe(500);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('INTERNAL');
    expect(JSON.stringify(response.body)).not.toContain('simulated store failure');
  });

  it('round-trips a model-defined comparison column AND its values through real HTTP and real SQLite in one transaction, including an explicit reasoned unknown (ADR 0011)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence: afterDemo } = await startDemo();

    const first = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-opt-1')
      .send({
        caseId,
        expectedSequence: afterDemo,
        option: { label: 'Honda CR-V', kind: 'car', attributes: [] },
      });
    const second = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-opt-2')
      .send({
        caseId,
        expectedSequence: asJson<CommandReceipt>(first.body).acceptedSequence,
        option: { label: 'Toyota RAV4', kind: 'car', attributes: [] },
      });
    const seeded = asJson<CommandReceipt>(second.body);
    const optionIds = (seeded.snapshot?.entities ?? []).map((entity) => entity.id);
    expect(optionIds).toHaveLength(2);

    const defined = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/defineCaseAttribute`)
      .set('Idempotency-Key', 'cmd-define-with-values')
      .send({
        caseId,
        expectedSequence: seeded.acceptedSequence,
        origin: 'agent_proposed',
        definition: {
          id: 'custom.dog_crate_fit',
          label: 'Both dog crates fit',
          valueType: 'boolean',
          appliesTo: ['car'],
          evidenceExpectation: 'verification',
          comparison: 'target',
          reason: 'The household travels with two crates.',
        },
        values: [
          { optionId: optionIds[0], status: 'supported', value: { type: 'boolean', value: true } },
          {
            optionId: optionIds[1],
            status: 'unknown',
            reason: 'No published cargo dimensions cover this trim.',
          },
        ],
      });
    expect(defined.status, JSON.stringify(defined.body)).toBe(200);

    // Read back from the migrated SQLite store, not from the response body.
    const persisted = harness.caseStore.load(caseId);
    expect(persisted?.caseExtensions[0]?.definition.confirmation).toBe('confirmed');
    expect(persisted?.caseExtensions[0]?.definition.origin).toBe('agent_proposed');

    const answered = persisted?.entities.find((entity) => entity.id === optionIds[0]);
    expect(answered?.attributes['custom.dog_crate_fit']?.status).toBe('supported');
    expect(answered?.attributes['custom.dog_crate_fit']?.value).toEqual({
      type: 'boolean',
      value: true,
    });

    // The explicit unknown survives as a real record, not as an absent one.
    const unresolved = persisted?.entities.find((entity) => entity.id === optionIds[1]);
    expect(unresolved?.attributes['custom.dog_crate_fit']?.status).toBe('unknown');
    expect(unresolved?.attributes['custom.dog_crate_fit']?.value).toBeUndefined();
    expect(
      (persisted?.notes ?? []).some((note) =>
        note.body.includes('No published cargo dimensions cover this trim.'),
      ),
    ).toBe(true);
  });

  it('dispatches setView through real HTTP, persisting the view without advancing eventSequence (ADR 0005)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/setView`)
      .set('Idempotency-Key', 'cmd-set-view')
      .send({ caseId, expectedSequence, view: { mode: 'list' } });

    expect(response.status).toBe(200);
    const receipt = asJson<CommandReceipt>(response.body);
    expect(receipt.snapshot?.view).toEqual({ mode: 'list' });
    expect(receipt.acceptedSequence).toBe(expectedSequence);
    expect(harness.caseStore.load(caseId)?.view).toEqual({ mode: 'list' });
  });

  it('dispatches setOptionAttribute through real HTTP, merging one attribute onto an existing option (ADR 0006 decision 4)', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const upserted = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-option')
      .send({
        caseId,
        expectedSequence,
        option: { label: 'Honda Civic', kind: 'car', attributes: [] },
      });
    const optionReceipt = asJson<CommandReceipt>(upserted.body);
    const optionId = optionReceipt.snapshot?.entities[0]?.id;
    if (optionId === undefined) throw new Error('expected an option id');

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/setOptionAttribute`)
      .set('Idempotency-Key', 'cmd-set-attr')
      .send({
        caseId,
        optionId,
        expectedSequence: optionReceipt.acceptedSequence,
        attribute: {
          definitionId: 'car.price',
          value: { type: 'money', amount: 21000, currency: 'USD' },
        },
      });

    expect(response.status).toBe(200);
    const receipt = asJson<CommandReceipt>(response.body);
    expect(receipt.snapshot?.entities[0]?.attributes['car.price']?.value).toEqual({
      type: 'money',
      amount: 21000,
      currency: 'USD',
    });
  });

  it('dispatches addNote through real HTTP, persisting a first-class CaseNote', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence } = await startDemo();

    const response = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/addNote`)
      .set('Idempotency-Key', 'cmd-note')
      .send({
        caseId,
        expectedSequence,
        note: { body: 'The seat position felt wrong on the test drive.' },
      });

    expect(response.status).toBe(200);
    const receipt = asJson<CommandReceipt>(response.body);
    expect(receipt.snapshot?.notes).toHaveLength(1);
    expect(receipt.snapshot?.notes?.[0]?.body).toBe(
      'The seat position felt wrong on the test drive.',
    );
    expect(harness.caseStore.load(caseId)?.notes).toEqual(receipt.snapshot?.notes);
  });

  it('dispatches every remaining commandName to its CommandService method over real HTTP', async () => {
    harness = await createHttpTestHarness();
    const { caseId, expectedSequence: afterDemo } = await startDemo();

    const upserted = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', 'cmd-option')
      .send({
        caseId,
        expectedSequence: afterDemo,
        option: { label: 'Honda Civic', kind: 'car', attributes: [] },
      });
    expect(upserted.status).toBe(200);
    const optionReceipt = asJson<CommandReceipt>(upserted.body);
    const optionId = optionReceipt.snapshot?.entities[0]?.id;
    if (optionId === undefined) throw new Error('expected an option id');
    const afterOption = optionReceipt.acceptedSequence;

    const focused = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/focusOption`)
      .set('Idempotency-Key', 'cmd-focus-option')
      .send({ caseId, optionId, expectedSequence: afterOption });
    expect(focused.status).toBe(200);

    const defined = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/defineCaseAttribute`)
      .set('Idempotency-Key', 'cmd-define')
      .send({
        caseId,
        expectedSequence: afterOption,
        definition: {
          id: 'custom.pet_sensory_fit',
          label: 'Pet sensory fit',
          valueType: 'text',
          appliesTo: ['car'],
          evidenceExpectation: 'assertion',
          comparison: 'none',
          reason: 'The household has a dog.',
        },
      });
    expect(defined.status).toBe(200);
    const definedReceipt = asJson<CommandReceipt>(defined.body);
    const extensionId = definedReceipt.snapshot?.caseExtensions[0]?.id;
    if (extensionId === undefined) throw new Error('expected an extension id');
    const afterDefine = definedReceipt.acceptedSequence;

    // The default command-service.ts `origin` is `'user'` (auto-confirmed)
    // for the plain HTTP command path, so this extension is already
    // confirmed. Per ADR 0011 that is an idempotent re-affirmation, not an
    // error: `reviewCaseExtension` is the human's authority over an
    // extension in both directions (re-confirm, or reject as the undo), and
    // only an already-REJECTED extension is terminal. The real dispatch
    // branch is exercised either way; the terminal-rejection validation path
    // is covered in `command-service.test.ts`.
    const reviewed = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/reviewCaseExtension`)
      .set('Idempotency-Key', 'cmd-review-ext')
      .send({ caseId, extensionId, decision: 'confirm', expectedSequence: afterDefine });
    expect(reviewed.status).toBe(200);
    const reviewedReceipt = asJson<CommandReceipt>(reviewed.body);
    expect(reviewedReceipt.snapshot?.caseExtensions[0]?.definition.confirmation).toBe('confirmed');
    const afterReview = reviewedReceipt.acceptedSequence;

    // Seed an evidence link and a pending proposal directly via the store
    // (no command in this task's scope both creates AND exposes one over
    // HTTP in a single call -- see command-service.ts's documented scope
    // limitations) so focusEvidence/setEvidenceDisposition/
    // reviewProposal/requestRevision's real dispatch branches can be
    // exercised too.
    harness.caseStore.append(
      caseId,
      [
        {
          eventId: 'seed-evidence',
          caseId,
          sequence: afterReview + 1,
          timestamp: '2026-08-27T00:00:00.000Z',
          type: 'evidence.accepted',
          payload: {
            evidenceLink: {
              id: 'evidence-1',
              obligationId: 'hard-constraints',
              level: 'E1',
              verdict: 'pass',
              disposition: 'included',
              summary: 'summary',
              stale: false,
              createdAt: '2026-08-27T00:00:00.000Z',
              updatedAt: '2026-08-27T00:00:00.000Z',
            },
          },
        },
        {
          eventId: 'seed-recommendation',
          caseId,
          sequence: afterReview + 2,
          timestamp: '2026-08-27T00:00:00.000Z',
          type: 'recommendation.ready',
          payload: {
            recommendation: {
              id: 'rec-1',
              status: 'ready',
              favoredOptionId: null,
              rationale: 'because',
              facts: [],
              hypotheses: [],
              confidence: 0.5,
              limitations: [],
              sourceIds: [],
              resolvedObligationIds: [],
              acceptedUncertaintyObligationIds: [],
              generatedAt: '2026-08-27T00:00:00.000Z',
            },
          },
        },
        {
          eventId: 'seed-proposal',
          caseId,
          sequence: afterReview + 3,
          timestamp: '2026-08-27T00:00:00.000Z',
          type: 'proposal.reviewed',
          payload: {
            proposal: {
              id: 'proposal-1',
              recommendationId: 'rec-1',
              status: 'pending',
              createdAt: '2026-08-27T00:00:00.000Z',
            },
          },
        },
      ],
      afterReview,
    );
    const seeded = harness.caseStore.load(caseId);
    const afterSeed = seeded?.eventSequence;
    if (afterSeed === undefined) throw new Error('expected a seeded case');

    const focusedEvidence = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/focusEvidence`)
      .set('Idempotency-Key', 'cmd-focus-evidence')
      .send({ caseId, evidenceId: 'evidence-1', expectedSequence: afterSeed });
    expect(focusedEvidence.status).toBe(200);

    const disposed = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/setEvidenceDisposition`)
      .set('Idempotency-Key', 'cmd-dispose')
      .send({
        caseId,
        evidenceId: 'evidence-1',
        disposition: 'excluded',
        reason: 'Not independent.',
        expectedSequence: afterSeed,
      });
    expect(disposed.status).toBe(200);
    const afterDisposition = asJson<CommandReceipt>(disposed.body).acceptedSequence;

    const submitted = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/submitSource`)
      .set('Idempotency-Key', 'cmd-source')
      .send({
        caseId,
        expectedSequence: afterDisposition,
        source: {
          url: 'https://example.com/review',
          title: 'Review',
          retrievedAt: '2026-08-27T00:00:00.000Z',
          claims: [],
        },
      });
    expect(submitted.status).toBe(200);

    const revised = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/requestRevision`)
      .set('Idempotency-Key', 'cmd-revise')
      .send({
        caseId,
        proposalId: 'proposal-1',
        instructions: 'Please reconsider mileage.',
        expectedSequence: afterDisposition,
      });
    expect(revised.status).toBe(200);
    const afterRevision = asJson<CommandReceipt>(revised.body).acceptedSequence;

    // The proposal is now `revision_requested`, not `pending` -- reviewing
    // it again correctly rejects, still exercising the real dispatch branch.
    const approved = await request(harness.server)
      .post(`/api/cases/${caseId}/commands/reviewProposal`)
      .set('Idempotency-Key', 'cmd-approve')
      .send({
        caseId,
        proposalId: 'proposal-1',
        actor: 'human',
        decision: 'approve',
        expectedSequence: afterRevision,
      });
    expect(approved.status).toBe(400);
    expect(asJson<HttpErrorBody>(approved.body).error.code).toBe('VALIDATION');
  });

  // I1 (docs/superpowers/plans/2026-08-30-generic-decision-workspace.md
  // "Phase I"; ADR 0006 decision 8; debugging-and-observability.md "WebMCP
  // tool calls"): the `X-Sift-Command-Origin` request header tags a command
  // as WebMCP-issued for the developer trail, without ever forking the
  // command implementation.
  describe('X-Sift-Command-Origin (I1: WebMCP call provenance)', () => {
    it('returns 400 VALIDATION for an unrecognized origin value, never reaching CommandService', async () => {
      harness = await createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const response = await request(harness.server)
        .post(`/api/cases/${caseId}/commands/selectPack`)
        .set('Idempotency-Key', 'cmd-2')
        .set('X-Sift-Command-Origin', 'ui')
        .send({ caseId, packId: 'car-purchase', expectedSequence });

      expect(response.status).toBe(400);
      expect(asJson<HttpErrorBody>(response.body).error.code).toBe('VALIDATION');
      // Proves it never reached CommandService: the case is still at its
      // pre-command sequence.
      expect(harness.caseStore.load(caseId)?.eventSequence).toBe(expectedSequence);
    });

    it('accepts "webmcp" and records it on the activity trail; an omitted header records nothing', async () => {
      harness = await createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const tagged = await request(harness.server)
        .post(`/api/cases/${caseId}/commands/selectPack`)
        .set('Idempotency-Key', 'cmd-tagged')
        .set('X-Sift-Command-Origin', 'webmcp')
        .send({ caseId, packId: 'car-purchase', expectedSequence });
      expect(tagged.status).toBe(200);

      const events = harness.activityStore.replayFrom(caseId, 0);
      const taggedEvent = events.find((event) => event.commandId === 'cmd-tagged');
      expect(taggedEvent?.safeDetails).toEqual({ origin: 'webmcp' });

      // The demo-start command earlier in the same replay never sent the
      // header -- default behavior (nothing recorded) is unaffected.
      const untaggedEvent = events.find((event) => event.commandId === 'cmd-start');
      expect(untaggedEvent?.safeDetails).toBeUndefined();
    });

    it('records the marker uniformly for setView, setOptionAttribute, and addNote too', async () => {
      harness = await createHttpTestHarness();
      const { caseId, expectedSequence } = await startDemo();

      const setViewResponse = await request(harness.server)
        .post(`/api/cases/${caseId}/commands/setView`)
        .set('Idempotency-Key', 'cmd-view')
        .set('X-Sift-Command-Origin', 'webmcp')
        .send({ caseId, expectedSequence, view: { mode: 'list' } });
      expect(setViewResponse.status).toBe(200);

      const upserted = await request(harness.server)
        .post(`/api/cases/${caseId}/commands/upsertOption`)
        .set('Idempotency-Key', 'cmd-option')
        .send({
          caseId,
          expectedSequence,
          option: { label: 'Honda Civic', kind: 'car', attributes: [] },
        });
      const optionReceipt = asJson<CommandReceipt>(upserted.body);
      const optionId = optionReceipt.snapshot?.entities[0]?.id;
      if (optionId === undefined) throw new Error('expected an option id');

      const setAttrResponse = await request(harness.server)
        .post(`/api/cases/${caseId}/commands/setOptionAttribute`)
        .set('Idempotency-Key', 'cmd-attr')
        .set('X-Sift-Command-Origin', 'webmcp')
        .send({
          caseId,
          optionId,
          expectedSequence: optionReceipt.acceptedSequence,
          attribute: {
            definitionId: 'car.price',
            value: { type: 'money', amount: 1, currency: 'USD' },
          },
        });
      expect(setAttrResponse.status).toBe(200);
      const afterAttr = asJson<CommandReceipt>(setAttrResponse.body).acceptedSequence;

      const noteResponse = await request(harness.server)
        .post(`/api/cases/${caseId}/commands/addNote`)
        .set('Idempotency-Key', 'cmd-note')
        .set('X-Sift-Command-Origin', 'webmcp')
        .send({ caseId, expectedSequence: afterAttr, note: { body: 'Noted via WebMCP.' } });
      expect(noteResponse.status).toBe(200);

      const events = harness.activityStore.replayFrom(caseId, 0);
      // Still an exact `toEqual`, not a loosened `toMatchObject`: this test's
      // job is to prove the origin marker is recorded and that NOTHING else
      // is silently attached alongside it.
      //
      // `setView` legitimately carries one more key (ADR 0009):
      // `presentationOnly`, marking the three commands that write through
      // `updateSelection` and append no `CaseEvent`. `emitActivity` merges
      // rather than replaces (`{ ...event.safeDetails, origin }`), so the two
      // markers coexist -- which is exactly what the per-command expectation
      // below asserts, rather than weakening the check to accommodate it.
      const expectedSafeDetails: Record<string, Record<string, unknown>> = {
        'cmd-view': { [PRESENTATION_ONLY_ACTIVITY_DETAIL]: true, origin: 'webmcp' },
        'cmd-attr': { origin: 'webmcp' },
        'cmd-note': { origin: 'webmcp' },
      };
      for (const [commandId, expected] of Object.entries(expectedSafeDetails)) {
        const event = events.find((entry) => entry.commandId === commandId);
        expect(event?.safeDetails, `commandId ${commandId}`).toEqual(expected);
      }
      // upsertOption sent no header -- unaffected.
      const optionEvent = events.find((entry) => entry.commandId === 'cmd-option');
      expect(optionEvent?.safeDetails).toBeUndefined();
    });

    it('never changes what a command does: identical case state and eventSequence advance with and without the marker', async () => {
      const harnessA = await createHttpTestHarness();
      const harnessB = await createHttpTestHarness();
      try {
        const startA = await request(harnessA.server)
          .post('/api/cases/demo')
          .set('Idempotency-Key', 'cmd-start')
          .send({ demoId: 'car-purchase' });
        const startB = await request(harnessB.server)
          .post('/api/cases/demo')
          .set('Idempotency-Key', 'cmd-start')
          .send({ demoId: 'car-purchase' });
        const receiptA = asJson<CommandReceipt>(startA.body);
        const receiptB = asJson<CommandReceipt>(startB.body);
        expect(receiptB.caseId).toBe(receiptA.caseId);

        const responseA = await request(harnessA.server)
          .post(`/api/cases/${receiptA.caseId}/commands/selectPack`)
          .set('Idempotency-Key', 'cmd-select')
          .send({
            caseId: receiptA.caseId,
            packId: 'car-purchase',
            expectedSequence: receiptA.acceptedSequence,
          });
        const responseB = await request(harnessB.server)
          .post(`/api/cases/${receiptB.caseId}/commands/selectPack`)
          .set('Idempotency-Key', 'cmd-select')
          .set('X-Sift-Command-Origin', 'webmcp')
          .send({
            caseId: receiptB.caseId,
            packId: 'car-purchase',
            expectedSequence: receiptB.acceptedSequence,
          });

        expect(responseA.status).toBe(200);
        expect(responseB.status).toBe(200);
        const bodyA = asJson<CommandReceipt>(responseA.body);
        const bodyB = asJson<CommandReceipt>(responseB.body);

        expect(bodyB.acceptedSequence).toBe(bodyA.acceptedSequence);
        expect(bodyB.snapshot).toEqual(bodyA.snapshot);
        expect(harnessB.caseStore.load(receiptB.caseId)).toEqual(
          harnessA.caseStore.load(receiptA.caseId),
        );
      } finally {
        harnessA.cleanup();
        harnessB.cleanup();
      }
    });
  });
});
