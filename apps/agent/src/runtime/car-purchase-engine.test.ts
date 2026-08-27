/**
 * Proves the real gap this task closes: a live, SQLite-backed `RunService`
 * whose `requestInvestigation` genuinely triggers the real six-node
 * `car-purchase` Strands Graph in the background -- not merely a queued
 * `runs` row that nothing ever advances (see `run-service.ts`'s own,
 * now-superseded, header comment). Every store here is the real SQLite
 * implementation (`SqliteCaseStore`/`SqliteActivityStore`/`SqliteRunStore`),
 * every command goes through the real `CommandService`/`RunService`, and
 * round detection is read purely from the case's own persisted state --
 * `determineCarPurchaseRound` is never told which round to run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CaseEvent, CaseState, CommandReceipt, RunReceipt } from '@pax/contracts';
import type { Clock, IdGenerator } from '@pax/core';
import { compileCarPurchasePack, PackRegistry } from '@pax/packs';
import { buildCarPurchaseCandidateEntities } from '@pax/scenarios';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import { CommandService } from '../services/command-service.js';
import { RunService, SqliteRunStore, type RunRecord } from '../services/run-service.js';
import { SqliteActivityStore } from '../store/activity-store.js';
import { SqliteCaseStore } from '../store/sqlite-case-store.js';
import { carPurchaseCapabilityCatalog } from './car-purchase-scenario.js';
import {
  createCarPurchaseEngine,
  determineCarPurchaseRound,
  type CarPurchaseEngine,
} from './car-purchase-engine.js';

const SKILLS_ROOT_DIR = fileURLToPath(new URL('../../skills', import.meta.url));
const FIXED_CLOCK: Clock = { now: () => '2026-08-27T00:00:00.000Z' };

function fixedIdGenerator(): IdGenerator {
  let counter = 0;
  return { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
}

function requireOkCommand(result: {
  status: string;
}): asserts result is { status: 'ok'; value: CommandReceipt } {
  if (result.status !== 'ok') {
    throw new Error(`expected ok, got ${result.status}: ${JSON.stringify(result)}`);
  }
}

function requireOkRun(result: {
  status: string;
}): asserts result is { status: 'ok'; value: RunReceipt } {
  if (result.status !== 'ok') {
    throw new Error(`expected ok, got ${result.status}: ${JSON.stringify(result)}`);
  }
}

function requireSnapshot(receipt: CommandReceipt): CaseState {
  if (receipt.snapshot === undefined) throw new Error('receipt has no snapshot');
  return receipt.snapshot;
}

/**
 * Seeds the four real candidate `EntityRecord`s (`candidate-rav4`/`-crv`/
 * `-cx5`/`-outback`, computed from the real fixture tools via `@pax/
 * scenarios`' `buildCarPurchaseCandidateEntities` -- the same authoritative
 * fixture data `car-purchase-scenario.ts` itself seeds from) onto an
 * already-`startDemo`'d case, via real `option.upserted` `CaseEvent`s.
 *
 * A REAL, separate, adjacent gap this test works around (in scope
 * boundary, not fixed here -- documented in this task's dated
 * `docs/build-log.md` entry): `CommandService.startDemo` seeds a case's
 * `pack`/`criteria`/`obligations` only (`instantiateCase` always seeds
 * `entities: []`); nothing in the live product today -- not `startDemo`,
 * not `apps/web`'s `DemoLauncher` -- ever adds the four vehicle candidates
 * to a freshly started live case. `CommandService.upsertOption` cannot
 * close this gap either: its `OptionAttributeInputSchema.value` is
 * required, but two of the real seeded attributes
 * (`car.rear_cargo_crate_fit`/`car.driving_comfort_rating`) are
 * legitimately `status: 'unknown'` with no value (CLAUDE.md: "never...
 * fabricate"), so only a direct `option.upserted` event append -- exactly
 * what this helper does, and exactly what a real future fix belongs doing
 * too -- can express them.
 */
function seedRealCandidates(
  caseStore: SqliteCaseStore,
  caseId: string,
  snapshot: CaseState,
  clock: Clock,
  idGenerator: IdGenerator,
): CaseState {
  const entities = buildCarPurchaseCandidateEntities(clock);
  const events: CaseEvent[] = entities.map((entity, index) => ({
    eventId: idGenerator.next('event'),
    caseId,
    sequence: snapshot.eventSequence + 1 + index,
    timestamp: clock.now(),
    type: 'option.upserted',
    payload: { entity },
  }));
  const result = caseStore.append(caseId, events, snapshot.eventSequence);
  if (result.status !== 'applied') {
    throw new Error(`test setup: failed to seed real candidates: status "${result.status}"`);
  }
  return result.snapshot;
}

/** Polls the real `SqliteRunStore` (exactly how a real client would poll `GET /api/cases/:caseId` or the SSE stream) until `runId` settles into a terminal status. No fixed sleep -- a short poll interval bounded by a generous overall timeout. */
async function waitForRunSettled(
  runStore: SqliteRunStore,
  runId: string,
  timeoutMs = 25_000,
): Promise<RunRecord> {
  const start = Date.now();
  for (;;) {
    const record = runStore.load(runId);
    if (record !== undefined && (record.status === 'completed' || record.status === 'failed')) {
      return record;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `waitForRunSettled: run "${runId}" did not settle within ${timeoutMs}ms (status: ${record?.status ?? 'unknown'})`,
      );
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 15));
  }
}

let test: TestDatabase | undefined;

afterEach(() => {
  test?.cleanup();
  test = undefined;
});

function buildLiveStack(): {
  caseStore: SqliteCaseStore;
  activityStore: SqliteActivityStore;
  runStore: SqliteRunStore;
  commandService: CommandService;
  runService: RunService;
  engine: CarPurchaseEngine;
  idGenerator: IdGenerator;
} {
  test = createTestDatabase();
  applyMigrations(test.sqlite);

  const registry = new PackRegistry();
  const pack = compileCarPurchasePack(carPurchaseCapabilityCatalog(), FIXED_CLOCK);
  registry.register(pack);

  const caseStore = new SqliteCaseStore(test);
  const activityStore = new SqliteActivityStore(test);
  const runStore = new SqliteRunStore(test);
  const idGenerator = fixedIdGenerator();

  const engine = createCarPurchaseEngine({
    caseStore,
    activityStore,
    runStore,
    registry,
    clock: FIXED_CLOCK,
    idGenerator,
    skillsRootDir: SKILLS_ROOT_DIR,
  });

  const commandService = new CommandService({
    caseStore,
    activityStore,
    registry,
    clock: FIXED_CLOCK,
    idGenerator,
  });
  const runService = new RunService({
    caseStore,
    activityStore,
    runStore,
    clock: FIXED_CLOCK,
    idGenerator,
    engines: { [pack.identity.id]: engine },
  });

  return { caseStore, activityStore, runStore, commandService, runService, engine, idGenerator };
}

describe('determineCarPurchaseRound', () => {
  function caseStateWithExtensions(extensions: CaseState['caseExtensions']): CaseState {
    return { caseExtensions: extensions } as CaseState;
  }

  function dogCrateExtension(
    confirmation: 'pending' | 'confirmed' | 'rejected',
  ): CaseState['caseExtensions'][number] {
    return {
      id: 'ext-1',
      caseId: 'case-1',
      definition: {
        id: 'custom.dog_crate_fit',
        label: 'Both dog crates fit',
        valueType: 'boolean',
        required: true,
        appliesTo: ['candidate'],
        evidenceExpectation: 'verification',
        comparison: 'target',
        sensitive: false,
        origin: 'agent_proposed',
        reason: 'x',
        confirmation,
        proposedBy: 'model',
        createdAt: '2026-08-27T00:00:00.000Z',
      },
      createdAt: '2026-08-27T00:00:00.000Z',
    };
  }

  it('is round1 when there is no dog-crate case extension at all', () => {
    expect(determineCarPurchaseRound(caseStateWithExtensions([]))).toBe('round1');
  });

  it('is round1 when the dog-crate extension exists but is still pending human review', () => {
    const state = caseStateWithExtensions([dogCrateExtension('pending')]);
    expect(determineCarPurchaseRound(state)).toBe('round1');
  });

  it('is round1 when the dog-crate extension was rejected', () => {
    const state = caseStateWithExtensions([dogCrateExtension('rejected')]);
    expect(determineCarPurchaseRound(state)).toBe('round1');
  });

  it('is round2 once the dog-crate extension is confirmed', () => {
    const state = caseStateWithExtensions([dogCrateExtension('confirmed')]);
    expect(determineCarPurchaseRound(state)).toBe('round2');
  });
});

describe('car-purchase-engine (live, real Graph, real SQLite)', () => {
  it('runs round1 then round2 purely from real case state, with no external round flag', async () => {
    const { caseStore, activityStore, runStore, commandService, runService, idGenerator } =
      buildLiveStack();

    // --- Seed the case exactly as POST /api/cases/demo would ---
    const startResult = commandService.startDemo('cmd-start', { demoId: 'car-purchase' });
    requireOkCommand(startResult);
    let snapshot = requireSnapshot(startResult.value);
    const caseId = snapshot.id;
    expect(determineCarPurchaseRound(snapshot)).toBe('round1');

    // --- Seed the four real candidates (see seedRealCandidates's own comment for the real, adjacent, separate gap this works around) ---
    snapshot = seedRealCandidates(caseStore, caseId, snapshot, FIXED_CLOCK, idGenerator);

    // --- The user focuses candidate-rav4 (POST .../commands/focusOption) ---
    const focusResult = commandService.focusOption('cmd-focus', {
      caseId,
      optionId: 'candidate-rav4',
      expectedSequence: snapshot.eventSequence,
    });
    requireOkCommand(focusResult);
    snapshot = requireSnapshot(focusResult.value);

    // --- POST .../run: the real, only trigger for round1 ---
    const run1Result = runService.requestInvestigation('cmd-run-1', {
      caseId,
      obligationId: 'car.deal_normalization',
      expectedSequence: snapshot.eventSequence,
    });
    requireOkRun(run1Result);
    const run1Id = run1Result.value.runId;

    const run1Record = await waitForRunSettled(runStore, run1Id);
    expect(run1Record.status).toBe('completed');

    snapshot = caseStore.load(caseId)!;
    expect(snapshot).toBeDefined();

    // --- Real round-1 progress genuinely happened, purely from what the engine determined ---
    const activityAfterRound1 = activityStore.replayFrom(caseId, 0);
    expect(activityAfterRound1.some((event) => event.type === 'run.started')).toBe(true);
    expect(activityAfterRound1.some((event) => event.type === 'run.completed')).toBe(true);
    expect(activityAfterRound1.some((event) => event.type === 'skill.activated')).toBe(true);
    expect(activityAfterRound1.some((event) => event.type === 'specialist.started')).toBe(true);
    expect(activityAfterRound1.some((event) => event.type === 'specialist.completed')).toBe(true);
    expect(activityAfterRound1.some((event) => event.type === 'evidence.accepted')).toBe(true);

    const dealObligation = snapshot.obligations.find((o) => o.id === 'car.deal_normalization');
    expect(dealObligation?.attemptsUsed).toBeGreaterThan(0);
    expect(snapshot.evidenceLinks.length).toBeGreaterThan(0);
    expect(snapshot.recommendation).not.toBeNull();
    expect(snapshot.recommendation?.favoredOptionId).toBe('candidate-rav4');
    expect(snapshot.proposal).toBeNull();

    // --- The household's WebMCP-driven criteria reweight + two-dog-crate concern (real commands, no engine involvement) ---
    const comfortResult = commandService.updateCriteria('cmd-comfort', {
      caseId,
      expectedSequence: snapshot.eventSequence,
      operations: [
        { op: 'reweight', criterionId: 'pref.driving_comfort', weight: 25 },
        { op: 'reweight', criterionId: 'pref.ownership_cost', weight: 15 },
      ],
    });
    requireOkCommand(comfortResult);
    snapshot = requireSnapshot(comfortResult.value);

    const defineResult = commandService.defineCaseAttribute(
      'cmd-define',
      {
        caseId,
        expectedSequence: snapshot.eventSequence,
        definition: {
          id: 'custom.dog_crate_fit',
          label: 'Both dog crates fit behind the second row',
          valueType: 'boolean',
          appliesTo: ['candidate'],
          evidenceExpectation: 'verification',
          comparison: 'target',
          reason:
            'The household needs two 36in x 24in x 27in dog travel crates to fit behind the second row without folding either seat.',
        },
      },
      'agent_proposed',
    );
    requireOkCommand(defineResult);
    snapshot = requireSnapshot(defineResult.value);
    const extension = snapshot.caseExtensions.find(
      (entry) => entry.definition.id === 'custom.dog_crate_fit',
    );
    if (extension === undefined) throw new Error('test setup: dog-crate extension was not created');

    // Still round1: proposed but not yet confirmed by a human.
    expect(determineCarPurchaseRound(snapshot)).toBe('round1');

    const confirmResult = commandService.reviewCaseExtension('cmd-confirm', {
      caseId,
      extensionId: extension.id,
      decision: 'confirm',
      expectedSequence: snapshot.eventSequence,
    });
    requireOkCommand(confirmResult);
    snapshot = requireSnapshot(confirmResult.value);

    const criteriaResult = commandService.updateCriteria('cmd-criteria-2', {
      caseId,
      expectedSequence: snapshot.eventSequence,
      operations: [
        {
          op: 'add',
          criterion: {
            id: 'custom.dog_crate_fit',
            label: 'Both dog crates fit behind the second row',
            kind: 'hard_constraint',
            weight: 20,
            direction: 'higher_better',
            appliesToAttribute: 'custom.dog_crate_fit',
            question:
              'Do both dog travel crates fit behind the second row without folding either seat?',
          },
        },
      ],
    });
    requireOkCommand(criteriaResult);
    snapshot = requireSnapshot(criteriaResult.value);

    // Now confirmed: the engine should independently determine round2 from this real state.
    expect(determineCarPurchaseRound(snapshot)).toBe('round2');
    expect(snapshot.obligations.some((o) => o.id === 'case.custom.dog_crate_fit')).toBe(false);

    // --- POST .../run again: no external flag flip, just the same trigger ---
    const run2Result = runService.requestInvestigation('cmd-run-2', {
      caseId,
      obligationId: 'car.deal_normalization',
      expectedSequence: snapshot.eventSequence,
    });
    requireOkRun(run2Result);
    const run2Id = run2Result.value.runId;

    const run2Record = await waitForRunSettled(runStore, run2Id);
    expect(run2Record.status).toBe('completed');
    expect(run2Record.result).toMatchObject({ round: 'round2' });

    snapshot = caseStore.load(caseId)!;
    expect(snapshot).toBeDefined();

    // --- The revised recommendation + pending proposal, produced independently from real state ---
    expect(snapshot.recommendation?.favoredOptionId).toBe('candidate-crv');
    expect(snapshot.proposal).not.toBeNull();
    expect(snapshot.proposal?.status).toBe('pending');

    const dogCrateObligation = snapshot.obligations.find(
      (o) => o.id === 'case.custom.dog_crate_fit',
    );
    expect(dogCrateObligation).toBeDefined();

    const staleLink = snapshot.evidenceLinks.find(
      (link) => link.sourceId === 'source-dealer-offer-candidate-rav4' && link.stale,
    );
    expect(staleLink).toBeDefined();

    const hardConstraints = snapshot.obligations.find((o) => o.id === 'car.hard_constraints');
    expect(hardConstraints?.status).toBe('satisfied');

    // A human, never the engine, approves the proposal -- proven by the engine
    // never having touched `proposal.reviewed`.
    expect(
      activityStore
        .replayFrom(caseId, 0)
        .some((event) => event.type === 'intervention.confirmation_required'),
    ).toBe(true);
  }, 30_000);

  it('logs a real, inspectable trace when the case does not exist at all (neither runs nor activity_events can hold a foreign key to it)', async () => {
    const { engine } = buildLiveStack();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await engine.trigger({
        caseId: 'case-does-not-exist',
        runId: 'run-missing-case',
        obligationId: 'car.deal_normalization',
      });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('was not found'));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('marks a run failed with a real error activity event when the pinned pack is not registered for this engine', async () => {
    const { caseStore, activityStore, runStore, commandService, idGenerator } = buildLiveStack();

    const startResult = commandService.startDemo('cmd-start', { demoId: 'car-purchase' });
    requireOkCommand(startResult);
    const caseId = requireSnapshot(startResult.value).id;

    // A second engine instance, deliberately wired to an empty registry
    // (the real case still genuinely exists in `caseStore`, satisfying the
    // `runs.case_id` foreign key) -- exercises the engine's own defensive
    // "pack not registered" failure path independent of `RunService`'s
    // separate case-existence validation.
    const brokenEngine = createCarPurchaseEngine({
      caseStore,
      activityStore,
      runStore,
      registry: new PackRegistry(),
      clock: FIXED_CLOCK,
      idGenerator,
      skillsRootDir: SKILLS_ROOT_DIR,
    });

    runStore.create({
      id: 'run-broken-registry',
      caseId,
      obligationId: 'car.deal_normalization',
      status: 'queued',
      createdAt: FIXED_CLOCK.now(),
      updatedAt: FIXED_CLOCK.now(),
    });

    await brokenEngine.trigger({
      caseId,
      runId: 'run-broken-registry',
      obligationId: 'car.deal_normalization',
    });

    const record = runStore.load('run-broken-registry');
    expect(record?.status).toBe('failed');
    expect(JSON.stringify(record?.result)).toContain('is not registered');

    const failedActivity = activityStore
      .replayFrom(caseId, 0)
      .find((event) => event.type === 'run.failed');
    expect(failedActivity).toBeDefined();
    expect(failedActivity?.summary).toContain('is not registered');
  });
});
