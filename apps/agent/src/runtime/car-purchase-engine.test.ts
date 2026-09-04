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
import type {
  AttributeRecord,
  CaseEvent,
  CaseState,
  CommandReceipt,
  EntityRecord,
  ExecutionResult,
  RunReceipt,
} from '@sift/contracts';
import type { Clock, IdGenerator } from '@sift/core';
import { compileCarPurchasePack, PackRegistry } from '@sift/packs';
import { buildCarPurchaseCandidateEntities } from '@sift/scenarios';
import type { MultiAgentResult } from '@strands-agents/sdk/multiagent';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import { CommandService } from '../services/command-service.js';
import { RunService, SqliteRunStore, type RunRecord } from '../services/run-service.js';
import { SqliteActivityStore } from '../store/activity-store.js';
import type { CaseStore } from '../store/case-store.js';
import { SqliteCaseStore } from '../store/sqlite-case-store.js';
import { SqliteRuntimeEventStore } from '../store/runtime-event-store.js';
import { carPurchaseCapabilityCatalog } from './car-purchase-scenario.js';
import { CAR_PURCHASE_GRAPH_NODE_IDS, type CarPurchaseGraphResult } from './car-purchase-graph.js';
import {
  createCarPurchaseEngine,
  deriveUnestablishedAttributeLimitations,
  determineCarPurchaseRound,
  DETERMINISTIC_DEMO_CANDIDATE_IDS,
  foldRound1,
  foldRound2,
  isDeterministicCarPurchaseDemoCase,
  type CarPurchaseEngine,
  type CarPurchaseEngineDeps,
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
 * `-cx5`/`-outback`, computed from the real fixture tools via `@sift/
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
 * legitimately `status: 'unknown'` with no value (docs/engineering-principles.md: "never...
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
  database: TestDatabase;
  caseStore: SqliteCaseStore;
  activityStore: SqliteActivityStore;
  runStore: SqliteRunStore;
  runtimeEventStore: SqliteRuntimeEventStore;
  commandService: CommandService;
  runService: RunService;
  engine: CarPurchaseEngine;
  idGenerator: IdGenerator;
  registry: PackRegistry;
  pack: ReturnType<typeof compileCarPurchasePack>;
} {
  const database = createTestDatabase();
  test = database;
  applyMigrations(database.sqlite);

  const registry = new PackRegistry();
  const pack = compileCarPurchasePack(carPurchaseCapabilityCatalog(), FIXED_CLOCK);
  registry.register(pack);

  const caseStore = new SqliteCaseStore(database);
  const activityStore = new SqliteActivityStore(database);
  const runStore = new SqliteRunStore(database);
  const runtimeEventStore = new SqliteRuntimeEventStore(database);
  const idGenerator = fixedIdGenerator();

  const engine = createCarPurchaseEngine({
    caseStore,
    activityStore,
    runStore,
    runtimeEventStore,
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

  return {
    database,
    caseStore,
    activityStore,
    runStore,
    runtimeEventStore,
    commandService,
    runService,
    engine,
    idGenerator,
    registry,
    pack,
  };
}

describe('determineCarPurchaseRound', () => {
  function caseStateWithExtensions(extensions: CaseState['caseExtensions']): CaseState {
    return { caseExtensions: extensions } as CaseState;
  }

  function caseExtension(
    id: `custom.${string}`,
    confirmation: 'pending' | 'confirmed' | 'rejected',
    label = 'Both dog crates fit',
  ): CaseState['caseExtensions'][number] {
    return {
      id: 'ext-1',
      caseId: 'case-1',
      definition: {
        id,
        label,
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

  function dogCrateExtension(
    confirmation: 'pending' | 'confirmed' | 'rejected',
  ): CaseState['caseExtensions'][number] {
    return caseExtension('custom.dog_crate_fit', confirmation);
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

  // The regression this generalisation exists for. The trigger used to test
  // one literal attribute id, so a household whose unanticipated concern was
  // ANY other `custom.*` attribute never reached round 2 -- and round 2 is
  // the only path that emits `proposal.proposed`, so that household got no
  // approval control at all. The pack's story is "an unanticipated concern
  // triggers another pass", not "one specific hardcoded concern does".
  it('is round2 for a confirmed case extension whose id is not the demo dog-crate one', () => {
    const state = caseStateWithExtensions([
      caseExtension(
        'custom.rear_facing_seat_behind_driver',
        'confirmed',
        'A rear-facing car seat fits behind the driver',
      ),
    ]);
    expect(determineCarPurchaseRound(state)).toBe('round2');
  });

  it('is round2 when any one of several extensions is confirmed, whatever its id', () => {
    const state = caseStateWithExtensions([
      caseExtension('custom.infotainment_platform', 'rejected', 'Infotainment platform'),
      caseExtension(
        'custom.rear_facing_seat_behind_driver',
        'confirmed',
        'A rear-facing car seat fits behind the driver',
      ),
    ]);
    expect(determineCarPurchaseRound(state)).toBe('round2');
  });

  it('is round1 when several extensions exist but none is confirmed', () => {
    const state = caseStateWithExtensions([
      caseExtension('custom.infotainment_platform', 'rejected', 'Infotainment platform'),
      caseExtension('custom.roof_box_clearance', 'pending', 'Roof box clearance'),
    ]);
    expect(determineCarPurchaseRound(state)).toBe('round1');
  });
});

/**
 * The engine used to attach two unconditional English sentences to every
 * round-2 recommendation ("Whether both dog crates fit behind the second row
 * remains unverified for every candidate.", "Driving comfort remains
 * unverified for every candidate.") -- assertions about coverage it never
 * checked, merged AHEAD of the derived scoreboard limitations, so a populated
 * column read as a flat contradiction on line 1. These prove the replacement
 * is measured from the case's own attribute records and named from the case's
 * own labels.
 */
describe('deriveUnestablishedAttributeLimitations', () => {
  function caseStateWith(overrides: Partial<CaseState>): CaseState {
    return {
      entities: [],
      criteria: [],
      caseExtensions: [],
      ...overrides,
    } as unknown as CaseState;
  }

  function candidate(id: string, attributes: EntityRecord['attributes']): EntityRecord {
    return {
      id,
      kind: 'candidate',
      label: id,
      attributes,
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };
  }

  function unknownRecord(definitionId: string, label: string): AttributeRecord {
    return {
      definitionId,
      label,
      origin: 'pack',
      sourceIds: [],
      status: 'unknown',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };
  }

  function goodComfort(): AttributeRecord {
    return {
      definitionId: 'car.driving_comfort_rating',
      label: 'Driving comfort',
      origin: 'pack',
      sourceIds: ['source-test-drive'],
      status: 'supported',
      value: { type: 'enum', value: 'good' },
      updatedAt: '2026-08-27T00:00:00.000Z',
    };
  }

  const comfortCriterion = {
    id: 'pref.driving_comfort',
    label: 'Driving comfort',
    kind: 'preference',
    weight: 25,
    direction: 'higher_better',
    appliesToAttribute: 'car.driving_comfort_rating',
    origin: 'pack',
    status: 'active',
  } as CaseState['criteria'][number];

  const pack = compileCarPurchasePack(carPurchaseCapabilityCatalog(), FIXED_CLOCK);

  it('names a pack attribute by its real label when no candidate has established it', () => {
    const state = caseStateWith({
      criteria: [comfortCriterion],
      entities: [
        candidate('candidate-a', {
          'car.driving_comfort_rating': unknownRecord(
            'car.driving_comfort_rating',
            'Driving comfort',
          ),
        }),
        candidate('candidate-b', {}),
      ],
    });
    expect(deriveUnestablishedAttributeLimitations(state, pack)).toEqual([
      'Driving comfort: not established for any candidate on this case.',
    ]);
  });

  it('says nothing once every candidate has an established value for it', () => {
    const state = caseStateWith({
      criteria: [comfortCriterion],
      entities: [
        candidate('candidate-a', { 'car.driving_comfort_rating': goodComfort() }),
        candidate('candidate-b', { 'car.driving_comfort_rating': goodComfort() }),
      ],
    });
    expect(deriveUnestablishedAttributeLimitations(state, pack)).toEqual([]);
  });

  it('reports partial coverage as partial rather than as a blanket unknown', () => {
    const state = caseStateWith({
      criteria: [comfortCriterion],
      entities: [
        candidate('candidate-a', { 'car.driving_comfort_rating': goodComfort() }),
        candidate('candidate-b', {}),
        candidate('candidate-c', {}),
      ],
    });
    expect(deriveUnestablishedAttributeLimitations(state, pack)).toEqual([
      'Driving comfort: established for only 1 of the 3 candidates.',
    ]);
  });

  it("names a confirmed case extension by the extension's own label, whatever its id", () => {
    const state = caseStateWith({
      caseExtensions: [
        {
          id: 'ext-1',
          caseId: 'case-1',
          definition: {
            id: 'custom.rear_facing_seat_behind_driver',
            label: 'A rear-facing car seat fits behind the driver',
            valueType: 'boolean',
            required: false,
            appliesTo: ['candidate'],
            evidenceExpectation: 'verification',
            comparison: 'target',
            sensitive: false,
            origin: 'agent_proposed',
            reason: 'The household needs a rear-facing infant seat behind the driver.',
            confirmation: 'confirmed',
            proposedBy: 'model',
            createdAt: '2026-08-27T00:00:00.000Z',
          },
          createdAt: '2026-08-27T00:00:00.000Z',
        },
      ],
      entities: [candidate('candidate-a', {}), candidate('candidate-b', {})],
    });
    expect(deriveUnestablishedAttributeLimitations(state, pack)).toEqual([
      'A rear-facing car seat fits behind the driver: not established for any candidate on this case.',
    ]);
  });

  it('ignores an extension a human has not confirmed and a criterion the case excluded', () => {
    const state = caseStateWith({
      caseExtensions: [
        {
          id: 'ext-1',
          caseId: 'case-1',
          definition: {
            id: 'custom.infotainment_platform',
            label: 'Infotainment platform',
            valueType: 'string',
            required: false,
            appliesTo: ['candidate'],
            evidenceExpectation: 'source',
            comparison: 'none',
            sensitive: false,
            origin: 'agent_proposed',
            reason: 'Proposed but never accepted.',
            confirmation: 'pending',
            proposedBy: 'model',
            createdAt: '2026-08-27T00:00:00.000Z',
          },
          createdAt: '2026-08-27T00:00:00.000Z',
        },
      ],
      criteria: [{ ...comfortCriterion, status: 'excluded' }],
      entities: [candidate('candidate-a', {}), candidate('candidate-b', {})],
    });
    expect(deriveUnestablishedAttributeLimitations(state, pack)).toEqual([]);
  });

  it('claims nothing at all when the case has no candidates to have established anything about', () => {
    const state = caseStateWith({ criteria: [comfortCriterion], entities: [] });
    expect(deriveUnestablishedAttributeLimitations(state, pack)).toEqual([]);
  });
});

describe('isDeterministicCarPurchaseDemoCase', () => {
  function caseStateWithEntityIds(ids: readonly string[]): CaseState {
    return {
      entities: ids.map((id) => ({
        id,
        kind: 'candidate',
        label: id,
        attributes: {},
        createdAt: '2026-08-27T00:00:00.000Z',
        updatedAt: '2026-08-27T00:00:00.000Z',
      })),
    } as CaseState;
  }

  it('is true when entities are exactly the 4 demo ids, in any order', () => {
    const shuffled = [...DETERMINISTIC_DEMO_CANDIDATE_IDS].reverse();
    expect(isDeterministicCarPurchaseDemoCase(caseStateWithEntityIds(shuffled))).toBe(true);
  });

  it('is false for a case with 0 entities', () => {
    expect(isDeterministicCarPurchaseDemoCase(caseStateWithEntityIds([]))).toBe(false);
  });

  it('is false for a case with 3 of the 4 demo ids plus one extra id', () => {
    const ids = ['candidate-rav4', 'candidate-crv', 'candidate-cx5', 'option-abc123'];
    expect(isDeterministicCarPurchaseDemoCase(caseStateWithEntityIds(ids))).toBe(false);
  });

  it('is false for a case with entirely different ids', () => {
    const ids = ['option-abc123', 'option-def456'];
    expect(isDeterministicCarPurchaseDemoCase(caseStateWithEntityIds(ids))).toBe(false);
  });

  it('is false for a case with the 4 demo ids plus a 5th id', () => {
    const ids = [...DETERMINISTIC_DEMO_CANDIDATE_IDS, 'option-extra'];
    expect(isDeterministicCarPurchaseDemoCase(caseStateWithEntityIds(ids))).toBe(false);
  });
});

describe('car-purchase-engine (live, real Graph, real SQLite)', () => {
  it('runs round1 then round2 purely from real case state, with no external round flag', async () => {
    const {
      caseStore,
      activityStore,
      runStore,
      runtimeEventStore,
      commandService,
      runService,
      idGenerator,
    } = buildLiveStack();

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

    // --- Change-set §34 / DoD item 34: no raw internal id reaches consumer
    // text. `recommendation.rationale` is rendered verbatim to the user by
    // `RecommendationCard.tsx`, so a leaked `candidate-*`/`source-*` token
    // is a defect the user sees, not merely an internal untidiness. The
    // scenario harness was corrected first; this asserts the *live engine*
    // path, which is what the deployed product actually runs. ---
    expect(snapshot.recommendation?.rationale).not.toMatch(/\bcandidate-[a-z0-9-]+/i);
    expect(snapshot.recommendation?.rationale).not.toMatch(/\bsource-[a-z0-9-]+/i);
    // Every cited source's `title` too: `RecommendationCard` renders it as
    // the visible citation link text, so a `title` set to the raw id put
    // "source-national-crash-safety-consortium" under "Sources" in the UI.
    // Third surface of the same defect -- rationale and limitations were
    // fixed first, and this one was only found by reading a baseline image.
    for (const source of snapshot.sources) {
      expect(source.title).not.toMatch(/^source-/);
      expect(source.title.length).toBeGreaterThan(0);
    }
    // Still says something real, rather than having been emptied to pass.
    expect(snapshot.recommendation?.rationale.length ?? 0).toBeGreaterThan(20);

    // --- The real Runtime Inspector persistence path (this task): every
    // normalized RuntimeEvent the real Graph run produced is durably
    // queryable back out of runtime_events, correlated by the exact same
    // runId/caseId/traceId as the run itself. ---
    const runtimeEventsRound1 = runtimeEventStore.listByRun(run1Id);
    expect(runtimeEventsRound1.length).toBeGreaterThan(0);
    expect(runtimeEventsRound1.every((event) => event.runId === run1Id)).toBe(true);
    expect(runtimeEventsRound1.every((event) => event.caseId === caseId)).toBe(true);
    expect(new Set(runtimeEventsRound1.map((event) => event.traceId)).size).toBe(1);
    expect(runtimeEventsRound1.map((event) => event.sequence)).toEqual(
      [...runtimeEventsRound1.map((event) => event.sequence)].sort((a, b) => a - b),
    );
    expect(
      runtimeEventsRound1.some(
        (event) => event.category === 'graph' && event.name === 'graph.node_completed',
      ),
    ).toBe(true);
    expect(runtimeEventsRound1.some((event) => event.category === 'tool')).toBe(true);
    expect(runtimeEventsRound1.some((event) => event.category === 'skill')).toBe(true);
    expect(run1Record.traceId).toBeTruthy();
    // --- The Runtime Inspector Overview's "Trace" must actually identify
    // this run's events. The run row's trace_id and the trace_id every
    // runtime_events row for that run carries are ONE id -- previously the
    // engine minted a local trace for the run row while the Graph minted
    // its own for every event, so the value on screen matched nothing in
    // the Timeline. Asserted at the persisted-data level (both ids read
    // back out of real SQLite), because that is exactly where the two
    // diverged. ---
    expect(runtimeEventsRound1.every((event) => event.traceId === run1Record.traceId)).toBe(true);

    // --- I2: a consumer-visible activity event derived from a real Graph
    // RuntimeEvent carries a real debugEventId that resolves to its exact
    // correlated runtime_events row -- never a placeholder or absent field. ---
    const round1ToolActivity = activityAfterRound1.find(
      (event) => event.runId === run1Id && event.type === 'tool.started',
    );
    expect(round1ToolActivity?.debugEventId).toBeTruthy();
    const round1CorrelatedDebugEvent = runtimeEventsRound1.find(
      (event) => event.id === round1ToolActivity?.debugEventId,
    );
    expect(round1CorrelatedDebugEvent).toBeDefined();
    expect(round1CorrelatedDebugEvent?.category).toBe('tool');
    expect(round1CorrelatedDebugEvent?.phase).toBe('start');

    // --- I3: a real, whole-run before/after case-state diff, never a
    // reconstructed guess -- computed from the actual CaseState loaded before
    // the run and the actual CaseState returned after folding completed. ---
    const round1StateChange = runtimeEventsRound1.find((event) => event.category === 'case');
    expect(round1StateChange).toBeDefined();
    expect(round1StateChange?.name).toBe('case.state_changed');
    expect(round1StateChange?.stateDiff?.length).toBeGreaterThan(0);
    expect(round1StateChange?.stateDiff?.some((op) => op.path === '/recommendation')).toBe(true);

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

    // ADR 0011 old->new: this used to assert `'round1'` ("proposed but not
    // yet confirmed by a human"). The car-purchase pack pre-authorizes
    // case-defined attributes (`extensionPolicy.allowCaseAttributes`), so
    // the model's dog-crate concern now lands CONFIRMED the moment it is
    // defined, carrying its `origin`/`reason` -- it does not wait for a
    // click the household, talking in the conversation rather than the pane,
    // would never see. `determineCarPurchaseRound` reads real case state and
    // therefore reports round2 immediately, which is the true answer: the
    // concern is live. The human's Confirm below is now a re-affirmation
    // (and Reject remains available as the undo), not the gate that makes
    // the concern count.
    expect(determineCarPurchaseRound(snapshot)).toBe('round2');

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
    // Updated by the custom-field/research pipeline task (2026-08-30): this
    // used to assert `false` here, documenting that nothing durably created
    // `case.custom.dog_crate_fit` before the engine ran -- exactly the gap
    // this file's own header comment names as "a real, separately-
    // documented, deliberately deferred gap in [command-service.ts], not
    // fixed here". `CommandService.updateCriteria`'s `add` operation now
    // closes that gap generically (deriving a case-extension obligation for
    // any newly-added criterion that `criterionNeedsEvidenceQuestion` says
    // needs one), so the obligation the `updateCriteria` call two lines
    // above this comment produced already exists by this point.
    // `ensureDogCrateObligation` below (`determineCarPurchaseRound`'s
    // caller, via `engine.trigger`) already guards for exactly this case
    // (`if already present, return snapshot unchanged`), so it remains a
    // safe no-op here rather than a double-write; the round-2 outcome this
    // test asserts below (recommendation, proposal, evidence staleness,
    // hard-constraints satisfaction) is unaffected.
    expect(snapshot.obligations.some((o) => o.id === 'case.custom.dog_crate_fit')).toBe(true);

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
    // The two coverage limitations round 2 leads with are measured, not
    // asserted: both attributes really are unestablished on all four
    // candidates here (`packages/scenarios`' seeds leave
    // `car.driving_comfort_rating` explicitly unknown and never write
    // `custom.dog_crate_fit` at all), and both are named from the case's own
    // labels rather than a baked-in English sentence.
    expect(snapshot.recommendation?.limitations.slice(0, 2)).toEqual([
      'Both dog crates fit behind the second row: not established for any candidate on this case.',
      'Driving comfort: not established for any candidate on this case.',
    ]);
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

    // --- Round 2 produces its own, separately-sequenced runtime_events,
    // correlated to run2Id and never mixed with round 1's. ---
    const runtimeEventsRound2 = runtimeEventStore.listByRun(run2Id);
    expect(runtimeEventsRound2.length).toBeGreaterThan(0);
    expect(runtimeEventsRound2.every((event) => event.runId === run2Id)).toBe(true);
    expect(runtimeEventsRound2.every((event) => event.caseId === caseId)).toBe(true);
    expect(
      runtimeEventsRound1.every(
        (event) => !runtimeEventsRound2.some((otherEvent) => otherEvent.id === event.id),
      ),
    ).toBe(true);
    expect(
      runtimeEventsRound2.some(
        (event) => event.category === 'graph' && event.name === 'graph.node_completed',
      ),
    ).toBe(true);
    // The same one-id invariant holds for round 2's own run row, and the
    // two runs' traces are genuinely distinct (one trace per real Graph
    // invocation, so the Overview's "Trace" narrows to one run's events).
    expect(run2Record.traceId).toBeTruthy();
    expect(runtimeEventsRound2.every((event) => event.traceId === run2Record.traceId)).toBe(true);
    expect(run2Record.traceId).not.toBe(run1Record.traceId);

    // --- Round 2 gets its own real, separately-sequenced case-state diff and
    // debugEventId correlations, distinct from round 1's. ---
    const round2StateChange = runtimeEventsRound2.find((event) => event.category === 'case');
    expect(round2StateChange).toBeDefined();
    expect(round2StateChange?.stateDiff?.length).toBeGreaterThan(0);
    expect(round2StateChange?.id).not.toBe(round1StateChange?.id);

    const round2ToolActivity = activityStore
      .replayFrom(caseId, 0)
      .find((event) => event.runId === run2Id && event.type === 'tool.started');
    expect(round2ToolActivity?.debugEventId).toBeTruthy();
    expect(runtimeEventsRound2.some((event) => event.id === round2ToolActivity?.debugEventId)).toBe(
      true,
    );

    // A human, never the engine, approves the proposal -- proven by the engine
    // never having touched `proposal.reviewed`.
    expect(
      activityStore
        .replayFrom(caseId, 0)
        .some((event) => event.type === 'intervention.confirmation_required'),
    ).toBe(true);
  }, 30_000);

  /**
   * The demo-blocking regression, end to end through the live stack: the
   * household's unanticipated concern is a `custom.*` attribute that is NOT
   * `custom.dog_crate_fit`. Round 2 is the only path that emits
   * `proposal.proposed` (`foldRound2`), and `RecommendationHero` renders no
   * approval control when `proposal` is null -- so a hardcoded round-2
   * trigger silently removed the product's central claim ("the model may
   * propose; only a human may approve") from every case whose concern was
   * anything else. Nothing here names the concern to the engine; the round,
   * the derived obligation, and the recommendation's limitations all come
   * from the case's own persisted state.
   */
  it('reaches round2 and produces a pending proposal for a confirmed concern that is not the dog-crate one', async () => {
    const { caseStore, runStore, commandService, runService, idGenerator } = buildLiveStack();

    const startResult = commandService.startDemo('cmd-start', { demoId: 'car-purchase' });
    requireOkCommand(startResult);
    let snapshot = requireSnapshot(startResult.value);
    const caseId = snapshot.id;
    snapshot = seedRealCandidates(caseStore, caseId, snapshot, FIXED_CLOCK, idGenerator);
    expect(determineCarPurchaseRound(snapshot)).toBe('round1');

    const defineResult = commandService.defineCaseAttribute(
      'cmd-define',
      {
        caseId,
        expectedSequence: snapshot.eventSequence,
        definition: {
          id: 'custom.rear_facing_seat_behind_driver',
          label: 'A rear-facing car seat fits behind the driver',
          valueType: 'boolean',
          appliesTo: ['candidate'],
          evidenceExpectation: 'verification',
          comparison: 'target',
          reason:
            'The household needs a rear-facing infant seat to fit behind the driver without moving the driver seat forward.',
        },
      },
      'agent_proposed',
    );
    requireOkCommand(defineResult);
    snapshot = requireSnapshot(defineResult.value);

    // Read purely from real state -- the engine is never told which round to run.
    expect(determineCarPurchaseRound(snapshot)).toBe('round2');

    const criteriaResult = commandService.updateCriteria('cmd-criteria', {
      caseId,
      expectedSequence: snapshot.eventSequence,
      operations: [
        {
          op: 'add',
          criterion: {
            id: 'custom.rear_facing_seat_behind_driver',
            label: 'A rear-facing car seat fits behind the driver',
            kind: 'hard_constraint',
            weight: 20,
            direction: 'higher_better',
            appliesToAttribute: 'custom.rear_facing_seat_behind_driver',
            question:
              'Does a rear-facing car seat fit behind the driver without moving the driver seat forward?',
          },
        },
      ],
    });
    requireOkCommand(criteriaResult);
    snapshot = requireSnapshot(criteriaResult.value);

    const runResult = runService.requestInvestigation('cmd-run', {
      caseId,
      obligationId: 'car.deal_normalization',
      expectedSequence: snapshot.eventSequence,
    });
    requireOkRun(runResult);
    const record = await waitForRunSettled(runStore, runResult.value.runId);
    expect(record.status).toBe('completed');
    expect(record.result).toMatchObject({ round: 'round2' });

    snapshot = caseStore.load(caseId)!;

    // The approval control the hardcoded trigger used to withhold.
    expect(snapshot.proposal).not.toBeNull();
    expect(snapshot.proposal?.status).toBe('pending');
    expect(snapshot.recommendation).not.toBeNull();

    // The obligation round 2 investigated is THIS case's concern -- and the
    // demo's dog-crate obligation was never fabricated onto a case that
    // never had that concern.
    expect(
      snapshot.obligations.some((o) => o.id === 'case.custom.rear_facing_seat_behind_driver'),
    ).toBe(true);
    expect(snapshot.obligations.some((o) => o.id === 'case.custom.dog_crate_fit')).toBe(false);
    expect(snapshot.recommendation?.resolvedObligationIds).toContain(
      'case.custom.rear_facing_seat_behind_driver',
    );
    expect(snapshot.recommendation?.resolvedObligationIds).not.toContain(
      'case.custom.dog_crate_fit',
    );

    // The recommendation's limitations describe THIS case's unestablished
    // attributes, by their real labels -- never the demo's dog crates.
    const limitations = snapshot.recommendation?.limitations ?? [];
    expect(limitations.join('\n')).not.toMatch(/dog crate/i);
    expect(
      limitations.some((entry) =>
        entry.startsWith('A rear-facing car seat fits behind the driver:'),
      ),
    ).toBe(true);
  }, 30_000);

  it("publishes each specialist's real duration onto the consumer activity stream, not only the Runtime Inspector", async () => {
    // The gap this closes: `car-purchase-graph.ts` measures a real per-node
    // duration and stamps it on the `runtime_events` row, but a consumer
    // surface reads `activity_events`. Without `safeDetails` forwarding,
    // the duration lands in the developer Inspector and the consumer pane's
    // elapsed column stays permanently blank.
    const {
      caseStore,
      activityStore,
      runStore,
      runtimeEventStore,
      commandService,
      runService,
      idGenerator,
    } = buildLiveStack();

    const startResult = commandService.startDemo('cmd-start', { demoId: 'car-purchase' });
    requireOkCommand(startResult);
    let snapshot = requireSnapshot(startResult.value);
    const caseId = snapshot.id;
    snapshot = seedRealCandidates(caseStore, caseId, snapshot, FIXED_CLOCK, idGenerator);

    const runResult = runService.requestInvestigation('cmd-run-1', {
      caseId,
      obligationId: 'car.deal_normalization',
      expectedSequence: snapshot.eventSequence,
    });
    requireOkRun(runResult);
    const runId = runResult.value.runId;
    const record = await waitForRunSettled(runStore, runId);
    expect(record.status).toBe('completed');

    const activity = activityStore.replayFrom(caseId, 0);
    const completions = activity.filter(
      (event) => event.runId === runId && event.type === 'specialist.completed',
    );
    // Every real Graph node reaches the consumer stream, each carrying its
    // own duration.
    expect(completions.map((event) => event.agentId).sort()).toEqual(
      [...CAR_PURCHASE_GRAPH_NODE_IDS].sort(),
    );

    const runtimeEvents = runtimeEventStore.listByRun(runId);
    for (const event of completions) {
      const durationMs = event.safeDetails?.['durationMs'];
      expect(durationMs, `expected a duration for "${String(event.agentId)}"`).toBeTypeOf('number');
      expect(durationMs as number).toBeGreaterThanOrEqual(0);

      // It is that specialist's OWN measured interval, carried through
      // unchanged from the exact correlated runtime event -- not a run
      // total, a neighbour's figure, or a number invented at this layer.
      const correlated = runtimeEvents.find((entry) => entry.id === event.debugEventId);
      expect(correlated?.name).toBe('graph.node_completed');
      expect(correlated?.attributes['nodeId']).toBe(event.agentId);
      expect(durationMs).toBe(correlated?.durationMs);
    }

    // A specialist that has only started has no elapsed time to freeze yet,
    // so it publishes none -- absent, never a fabricated zero.
    const starts = activity.filter(
      (event) => event.runId === runId && event.type === 'specialist.started',
    );
    expect(starts.length).toBeGreaterThan(0);
    for (const event of starts) {
      expect(event.safeDetails?.['durationMs']).toBeUndefined();
    }
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
    const { database, caseStore, activityStore, runStore, commandService, idGenerator } =
      buildLiveStack();

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
      runtimeEventStore: new SqliteRuntimeEventStore(database),
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

  it('fails fast and honestly on a catalog-built case, without ever running the scripted graph (ADR 0003 "Decision" §4)', async () => {
    const { caseStore, activityStore, runStore, runtimeEventStore, commandService, runService } =
      buildLiveStack();

    // --- Exactly the real, live path a normal (non-demo) user takes:
    // startCase (zero seeded entities) + two upsertOption calls, each
    // minting its own generated id via idGenerator.next('option') -- never
    // one of the four literal demo fixture ids. ---
    const startResult = commandService.startCase('cmd-start', { packId: 'car-purchase' });
    requireOkCommand(startResult);
    let snapshot = requireSnapshot(startResult.value);
    const caseId = snapshot.id;
    expect(snapshot.entities).toHaveLength(0);

    const option1Result = commandService.upsertOption('cmd-opt-1', {
      caseId,
      expectedSequence: snapshot.eventSequence,
      option: { label: 'A random SUV', kind: 'candidate', attributes: [] },
    });
    requireOkCommand(option1Result);
    snapshot = requireSnapshot(option1Result.value);

    const option2Result = commandService.upsertOption('cmd-opt-2', {
      caseId,
      expectedSequence: snapshot.eventSequence,
      option: { label: 'Another random SUV', kind: 'candidate', attributes: [] },
    });
    requireOkCommand(option2Result);
    snapshot = requireSnapshot(option2Result.value);

    expect(snapshot.entities).toHaveLength(2);
    expect(isDeterministicCarPurchaseDemoCase(snapshot)).toBe(false);

    // --- POST .../run against this catalog-built case ---
    const runResult = runService.requestInvestigation('cmd-run', {
      caseId,
      obligationId: 'car.deal_normalization',
      expectedSequence: snapshot.eventSequence,
    });
    requireOkRun(runResult);
    const runId = runResult.value.runId;

    const record = await waitForRunSettled(runStore, runId);
    expect(record.status).toBe('failed');
    expect(JSON.stringify(record.result)).toContain('deterministic example case');

    const activity = activityStore.replayFrom(caseId, 0);
    const failedActivity = activity.find(
      (event) => event.runId === runId && event.type === 'run.failed',
    );
    expect(failedActivity).toBeDefined();
    expect(failedActivity?.summary).toContain('deterministic example case');
    expect(failedActivity?.summary).toContain('vehicles were added directly');

    // --- The scripted graph never ran at all: no `run.started`, no
    // specialist/skill/tool activity for this run, and -- most decisively
    // -- no runtime_events were ever drained for it (the real round1/round2
    // test above proves executeCarPurchaseGraph always yields a non-empty,
    // durably persisted RuntimeEvent stream via drainGraphToActivity; its
    // total absence here is direct proof the graph itself was never
    // invoked, not merely that its output went unobserved). ---
    // Exactly two activity events ever reference this runId: RunService's
    // own `run.queued` (recorded synchronously before the engine is ever
    // triggered) and this engine's early `run.failed` -- nothing in
    // between.
    const activityForRun = activity.filter((event) => event.runId === runId);
    expect(activityForRun.map((event) => event.type)).toEqual(['run.queued', 'run.failed']);
    expect(activityForRun.some((event) => event.type === 'run.started')).toBe(false);
    expect(activityForRun.some((event) => event.type === 'specialist.started')).toBe(false);
    expect(activityForRun.some((event) => event.type === 'specialist.completed')).toBe(false);
    expect(activityForRun.some((event) => event.type === 'skill.activated')).toBe(false);
    expect(activityForRun.some((event) => event.type === 'tool.started')).toBe(false);
    expect(runtimeEventStore.listByRun(runId)).toHaveLength(0);

    // --- Case state itself is untouched by the failed run: no fabricated
    // recommendation or proposal ever got recorded. ---
    const finalSnapshot = caseStore.load(caseId)!;
    expect(finalSnapshot.recommendation).toBeNull();
    expect(finalSnapshot.proposal).toBeNull();
    expect(finalSnapshot.eventSequence).toBe(snapshot.eventSequence);
  });
});

describe('foldRound1 / foldRound2 (direct unit tests via a hand-built CarPurchaseGraphResult)', () => {
  // foldRound1/foldRound2 are exported (see their own doc comments in
  // car-purchase-engine.ts) purely so their defensive "the real Graph
  // produced no result for node X" throw guards, and other branches that
  // depend only on the *shape* of a CarPurchaseGraphResult rather than on
  // anything Strands-SDK-specific, can be tested directly against a
  // hand-built plain-data CarPurchaseGraphResult -- never a mocked Graph or
  // Agent.

  function executionResult(
    obligationId: string,
    overrides: Partial<ExecutionResult> = {},
  ): ExecutionResult {
    return {
      obligationId,
      disposition: 'evidence_found',
      claims: [
        {
          statement: 'Some finding.',
          stance: 'supports',
          confidence: 0.8,
          sourceIds: ['source-listing-candidate-rav4'],
        },
      ],
      evidenceResults: [
        {
          sourceId: 'source-listing-candidate-rav4',
          level: 'E1',
          verdict: 'pass',
          summary: 'Listing.',
        },
      ],
      limitations: [],
      suggestedStatus: 'satisfied',
      ...overrides,
    };
  }

  function fakeGraphResult(
    overrides: Partial<CarPurchaseGraphResult> = {},
  ): CarPurchaseGraphResult {
    return {
      multiAgentResult: {} as MultiAgentResult,
      nodeStartOrder: [],
      nodeFinishOrder: [],
      executionResults: {
        'deal-analyst': executionResult('car.deal_normalization'),
        'ownership-cost-analyst': executionResult('car.ownership_cost'),
        'safety-reliability-analyst': executionResult('car.safety_reliability'),
        'household-fit-analyst': executionResult('car.household_fit'),
        'source-challenger': executionResult('car.deal_normalization'),
      },
      decisionSynthesizerText: 'Recommend candidate-rav4 per source-listing-candidate-rav4.',
      proposedRecommendation: {
        candidateIds: ['candidate-rav4'],
        rationale: 'strongest overall',
      },
      goalLoopResult: undefined,
      ...overrides,
    };
  }

  /**
   * `concern` adds one real, human-accepted `custom.*` case extension through
   * the real `CommandService.defineCaseAttribute` -- exactly the durable
   * state `determineCarPurchaseRound` reads to decide a round-2 pass is
   * underway, and therefore the precondition `foldRound2`'s case-extension
   * obligation derivation now legitimately depends on. Omit it for a case
   * that reached `foldRound2` with no accepted concern of its own.
   */
  function seededCase(concern?: { id: `custom.${string}`; label: string }): {
    deps: CarPurchaseEngineDeps;
    caseId: string;
    snapshot: CaseState;
  } {
    const { caseStore, activityStore, runStore, runtimeEventStore, registry, pack, idGenerator } =
      buildLiveStack();
    const deps: CarPurchaseEngineDeps = {
      caseStore,
      activityStore,
      runStore,
      runtimeEventStore,
      registry,
      clock: FIXED_CLOCK,
      idGenerator,
      skillsRootDir: SKILLS_ROOT_DIR,
    };
    const commandService = new CommandService({
      caseStore,
      activityStore,
      registry,
      clock: FIXED_CLOCK,
      idGenerator,
    });
    const startResult = commandService.startDemo('cmd-start', { demoId: 'car-purchase' });
    requireOkCommand(startResult);
    let snapshot = requireSnapshot(startResult.value);
    const caseId = snapshot.id;
    snapshot = seedRealCandidates(caseStore, caseId, snapshot, FIXED_CLOCK, idGenerator);
    if (concern !== undefined) {
      const defineResult = commandService.defineCaseAttribute(
        'cmd-define-concern',
        {
          caseId,
          expectedSequence: snapshot.eventSequence,
          definition: {
            id: concern.id,
            label: concern.label,
            valueType: 'boolean',
            appliesTo: ['candidate'],
            evidenceExpectation: 'verification',
            comparison: 'target',
            reason: `The household raised "${concern.label}" as a concern the pack never anticipated.`,
          },
        },
        'agent_proposed',
      );
      requireOkCommand(defineResult);
      snapshot = requireSnapshot(defineResult.value);
    }
    void pack;
    return { deps, caseId, snapshot };
  }

  it('foldRound1 throws when the Graph produced no result for a parallel specialist (deal-analyst)', () => {
    const { deps, caseId } = seededCase();
    const graphResult = fakeGraphResult({
      executionResults: { 'ownership-cost-analyst': executionResult('car.ownership_cost') },
    });
    expect(() => foldRound1(deps, caseId, graphResult)).toThrow(
      /round1 produced no ExecutionResult for "deal-analyst"/,
    );
  });

  it('foldRound1 throws when the Graph produced no result for source-challenger', () => {
    const { deps, caseId } = seededCase();
    const graphResult = fakeGraphResult({
      executionResults: {
        'deal-analyst': executionResult('car.deal_normalization'),
        'ownership-cost-analyst': executionResult('car.ownership_cost'),
        'safety-reliability-analyst': executionResult('car.safety_reliability'),
        'household-fit-analyst': executionResult('car.household_fit'),
      },
    });
    expect(() => foldRound1(deps, caseId, graphResult)).toThrow(
      /round1 produced no ExecutionResult for "source-challenger"/,
    );
  });

  it('foldRound1 throws when decision-synthesizer never called propose_recommendation', () => {
    const { deps, caseId } = seededCase();
    const graphResult = fakeGraphResult({ proposedRecommendation: undefined });
    expect(() => foldRound1(deps, caseId, graphResult)).toThrow(
      /round1 decision-synthesizer never called propose_recommendation/,
    );
  });

  it('foldRound1 records a null favoredOptionId when propose_recommendation carried an empty candidateIds array', () => {
    const { deps, caseId } = seededCase();
    const graphResult = fakeGraphResult({
      proposedRecommendation: { candidateIds: [], rationale: 'no clear winner' },
    });
    const snapshot = foldRound1(deps, caseId, graphResult);
    expect(snapshot.recommendation?.favoredOptionId).toBeNull();
  });

  it('foldRound2 throws when the Graph produced no result for deal-analyst', () => {
    const { deps, caseId, snapshot } = seededCase();
    const graphResult = fakeGraphResult({
      executionResults: { 'household-fit-analyst': executionResult('car.household_fit') },
    });
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    expect(() => foldRound2(deps, caseId, pack, graphResult)).toThrow(
      /round2 produced no ExecutionResult for "deal-analyst"/,
    );
    void snapshot;
  });

  it('foldRound2 throws when the Graph produced no result for household-fit-analyst', () => {
    const { deps, caseId } = seededCase();
    const graphResult = fakeGraphResult({
      executionResults: { 'deal-analyst': executionResult('car.deal_normalization') },
    });
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    expect(() => foldRound2(deps, caseId, pack, graphResult)).toThrow(
      /round2 produced no ExecutionResult for "household-fit-analyst"/,
    );
  });

  it('foldRound2 throws when the Graph produced no result for source-challenger', () => {
    const { deps, caseId } = seededCase();
    const graphResult = fakeGraphResult({
      executionResults: {
        'deal-analyst': executionResult('car.deal_normalization'),
        'household-fit-analyst': executionResult('car.household_fit'),
      },
    });
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    expect(() => foldRound2(deps, caseId, pack, graphResult)).toThrow(
      /round2 produced no ExecutionResult for "source-challenger"/,
    );
  });

  it('foldRound2 throws when decision-synthesizer never called propose_recommendation', () => {
    const { deps, caseId } = seededCase();
    const graphResult = fakeGraphResult({ proposedRecommendation: undefined });
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    expect(() => foldRound2(deps, caseId, pack, graphResult)).toThrow(
      /round2 decision-synthesizer never called propose_recommendation/,
    );
  });

  it('foldRound2 records a null favoredOptionId when propose_recommendation carried an empty candidateIds array', () => {
    const { deps, caseId } = seededCase();
    const graphResult = fakeGraphResult({
      proposedRecommendation: { candidateIds: [], rationale: 'no clear winner' },
    });
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    const snapshot = foldRound2(deps, caseId, pack, graphResult);
    expect(snapshot.recommendation?.favoredOptionId).toBeNull();
  });

  it('foldRound2 derives the obligation for whichever concern the case actually accepted, and skips re-deriving it on a second call', () => {
    const { deps, caseId } = seededCase({
      id: 'custom.rear_facing_seat_behind_driver',
      label: 'A rear-facing car seat fits behind the driver',
    });
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    const graphResult = fakeGraphResult();

    const firstPass = foldRound2(deps, caseId, pack, graphResult);
    const derived = firstPass.obligations.find(
      (o) => o.id === 'case.custom.rear_facing_seat_behind_driver',
    );
    expect(derived).toBeDefined();
    expect(derived?.label).toBe('A rear-facing car seat fits behind the driver');
    // The demo's own concern is never fabricated onto a case that never had it.
    expect(firstPass.obligations.some((o) => o.id === 'case.custom.dog_crate_fit')).toBe(false);

    // Second call against the now-already-derived obligation exercises
    // ensureCaseExtensionObligations's early-return branch instead of re-deriving.
    const secondPass = foldRound2(deps, caseId, pack, fakeGraphResult());
    const derivedAgain = secondPass.obligations.filter(
      (o) => o.id === 'case.custom.rear_facing_seat_behind_driver',
    );
    expect(derivedAgain).toHaveLength(1);
  });

  it('foldRound2 derives no case-extension obligation at all when the case accepted no concern of its own', () => {
    const { deps, caseId } = seededCase();
    const pack = deps.registry.get('car-purchase', '1.0.0')!;

    const snapshot = foldRound2(deps, caseId, pack, fakeGraphResult());
    expect(snapshot.obligations.some((o) => o.origin === 'case_extension')).toBe(false);
    expect(snapshot.recommendation?.resolvedObligationIds).not.toContain(
      'case.custom.dog_crate_fit',
    );
    // Round 2 still completes and still yields the human approval control.
    expect(snapshot.proposal?.status).toBe('pending');
  });

  /**
   * The other half of the coverage-derived limitation contract, proven
   * through the real fold rather than only through the pure function: a
   * limitation the engine states must stop being stated the moment the
   * column behind it is populated. The old hardcoded sentence could not do
   * this -- it was attached unconditionally, so a filled Driving comfort
   * column produced a recommendation that contradicted the table beside it.
   */
  it('foldRound2 drops a coverage limitation once every candidate has an established value for that attribute', () => {
    const { deps, caseId, snapshot } = seededCase();
    const pack = deps.registry.get('car-purchase', '1.0.0')!;

    const comfortLine = 'Driving comfort: not established for any candidate on this case.';
    const before = foldRound2(deps, caseId, pack, fakeGraphResult());
    expect(before.recommendation?.limitations).toContain(comfortLine);

    // A real test drive happens: every candidate gains a sourced comfort
    // rating, through ordinary `option.upserted` events.
    const rated = deps.caseStore.load(caseId)!;
    const events: CaseEvent[] = rated.entities.map((entity, index) => ({
      eventId: deps.idGenerator.next('event'),
      caseId,
      sequence: rated.eventSequence + 1 + index,
      timestamp: FIXED_CLOCK.now(),
      type: 'option.upserted',
      payload: {
        entity: {
          ...entity,
          attributes: {
            ...entity.attributes,
            'car.driving_comfort_rating': {
              definitionId: 'car.driving_comfort_rating',
              label: 'Driving comfort',
              origin: 'user',
              sourceIds: ['source-dealer-offer-candidate-rav4'],
              status: 'supported',
              value: { type: 'enum', value: 'good' },
              updatedAt: FIXED_CLOCK.now(),
            } satisfies AttributeRecord,
          },
        },
      },
    }));
    const applied = deps.caseStore.append(caseId, events, rated.eventSequence);
    if (applied.status !== 'applied') throw new Error('test setup: failed to rate driving comfort');

    const after = foldRound2(deps, caseId, pack, fakeGraphResult());
    expect(after.recommendation?.limitations).not.toContain(comfortLine);
    expect(after.recommendation?.limitations.join('\n')).not.toMatch(/Driving comfort: /);
    void snapshot;
  });

  it('foldRound2 records no evidence.conflicted supersession event when there is no stale round-1 teaser-price evidence to supersede', () => {
    const { deps, caseId } = seededCase();
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    const graphResult = fakeGraphResult();

    const snapshot = foldRound2(deps, caseId, pack, graphResult);
    const conflictedActivity = deps.activityStore
      .replayFrom(caseId, 0)
      .find((event) => event.type === 'evidence.conflicted');
    expect(conflictedActivity).toBeUndefined();
    expect(snapshot.recommendation).not.toBeNull();
  });

  /**
   * Wraps a real `CaseStore`, forcing a genuine `'conflict'` `AppendResult`
   * for exactly the one `append()` call whose event batch `matches` --
   * every other call (including `load`/`peekIdempotent`/`updateSelection`/
   * `subscribe`/`resetDemo`) delegates straight to the real store. This is
   * a substitute for our own `CaseStore` interface (a plain data/store
   * contract this codebase already depends on), never a Strands SDK type --
   * the same category of real, legitimate test double
   * `command-service.test.ts`'s own established "stale read" store wrappers
   * already use to force a real, otherwise-hard-to-schedule concurrent-write
   * race deterministically.
   */
  function caseStoreConflictingOn(
    real: CaseStore,
    matches: (events: readonly CaseEvent[]) => boolean,
  ): CaseStore {
    return {
      load: (caseId) => real.load(caseId),
      peekIdempotent: (commandId) => real.peekIdempotent(commandId),
      append: (caseId, events, expectedSequence, options) => {
        if (matches(events)) {
          const snapshot = real.load(caseId);
          if (snapshot === undefined) throw new Error('test: case unexpectedly missing');
          return {
            status: 'conflict',
            expectedSequence,
            actualSequence: snapshot.eventSequence,
            snapshot,
          };
        }
        return real.append(caseId, events, expectedSequence, options);
      },
      updateSelection: (caseId, patch, expectedSequence, updatedAt, idempotency) =>
        real.updateSelection(caseId, patch, expectedSequence, updatedAt, idempotency),
      subscribe: (caseId, fromSequence) => real.subscribe(caseId, fromSequence),
      resetDemo: (caseId) => real.resetDemo(caseId),
    };
  }

  it('foldRound1 throws a real, inspectable error when recording the round1 recommendation hits a genuine append conflict', () => {
    const { deps, caseId } = seededCase();
    const conflictingCaseStore = caseStoreConflictingOn(deps.caseStore, (events) =>
      events.some((event) => event.type === 'recommendation.ready'),
    );
    const graphResult = fakeGraphResult();
    expect(() =>
      foldRound1({ ...deps, caseStore: conflictingCaseStore }, caseId, graphResult),
    ).toThrow(/failed to record the round1 recommendation.*status "conflict"/);
  });

  it('foldRound2 throws a real, inspectable error when recording the round2 recommendation hits a genuine append conflict', () => {
    const { deps, caseId } = seededCase();
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    const conflictingCaseStore = caseStoreConflictingOn(deps.caseStore, (events) =>
      events.some((event) => event.type === 'recommendation.ready'),
    );
    const graphResult = fakeGraphResult();
    expect(() =>
      foldRound2({ ...deps, caseStore: conflictingCaseStore }, caseId, pack, graphResult),
    ).toThrow(/failed to record the round2 recommendation.*status "conflict"/);
  });

  it('foldRound2 throws a real, inspectable error when creating the decision proposal hits a genuine append conflict', () => {
    const { deps, caseId } = seededCase();
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    const conflictingCaseStore = caseStoreConflictingOn(deps.caseStore, (events) =>
      events.some((event) => event.type === 'proposal.proposed'),
    );
    const graphResult = fakeGraphResult();
    expect(() =>
      foldRound2({ ...deps, caseStore: conflictingCaseStore }, caseId, pack, graphResult),
    ).toThrow(/failed to create the decision proposal.*status "conflict"/);
  });

  it('foldRound2 throws a real, inspectable error naming the concern when deriving its obligation hits a genuine append conflict', () => {
    const { deps, caseId } = seededCase({
      id: 'custom.rear_facing_seat_behind_driver',
      label: 'A rear-facing car seat fits behind the driver',
    });
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    const conflictingCaseStore = caseStoreConflictingOn(deps.caseStore, (events) =>
      events.some((event) => event.type === 'obligation.updated'),
    );
    const graphResult = fakeGraphResult();
    expect(() =>
      foldRound2({ ...deps, caseStore: conflictingCaseStore }, caseId, pack, graphResult),
    ).toThrow(
      /failed to append the derived "case\.custom\.rear_facing_seat_behind_driver" obligation.*status "conflict"/,
    );
  });

  it('foldRound2 throws a real, inspectable error when superseding stale round-1 teaser-price evidence hits a genuine append conflict', () => {
    const { deps, caseId, snapshot } = seededCase();
    const pack = deps.registry.get('car-purchase', '1.0.0')!;

    // Seed one non-stale teaser-price evidence link, exactly the shape
    // round1's own fold would have left behind, so foldRound2's
    // staleLinks.length > 0 branch is genuinely entered before the
    // conflicting append is attempted.
    const seedEvent: CaseEvent = {
      eventId: deps.idGenerator.next('event'),
      caseId,
      sequence: snapshot.eventSequence + 1,
      timestamp: FIXED_CLOCK.now(),
      type: 'evidence.accepted',
      payload: {
        evidenceLink: {
          id: deps.idGenerator.next('ev'),
          obligationId: 'car.deal_normalization',
          sourceId: 'source-dealer-offer-candidate-rav4',
          level: 'E2',
          verdict: 'degraded',
          disposition: 'included',
          summary: 'Round-1 teaser-price evidence.',
          stale: false,
          createdAt: FIXED_CLOCK.now(),
          updatedAt: FIXED_CLOCK.now(),
        },
      },
    };
    const seeded = deps.caseStore.append(caseId, [seedEvent], snapshot.eventSequence);
    if (seeded.status !== 'applied') throw new Error('test setup: failed to seed stale evidence');

    const conflictingCaseStore = caseStoreConflictingOn(deps.caseStore, (events) =>
      events.some((event) => event.type === 'evidence.conflicted'),
    );
    const graphResult = fakeGraphResult();
    expect(() =>
      foldRound2({ ...deps, caseStore: conflictingCaseStore }, caseId, pack, graphResult),
    ).toThrow(/failed to supersede round1 teaser-price evidence.*status "conflict"/);
  });

  it('foldRound2 throws a real, inspectable error when recording car.hard_constraints evidence hits a genuine append conflict', () => {
    const { deps, caseId } = seededCase();
    const pack = deps.registry.get('car-purchase', '1.0.0')!;
    const conflictingCaseStore = caseStoreConflictingOn(deps.caseStore, (events) =>
      events.some(
        (event) =>
          event.type === 'evidence.accepted' &&
          event.payload.evidenceLink.obligationId === 'car.hard_constraints',
      ),
    );
    const graphResult = fakeGraphResult();
    expect(() =>
      foldRound2({ ...deps, caseStore: conflictingCaseStore }, caseId, pack, graphResult),
    ).toThrow(/failed to record car\.hard_constraints evidence.*status "conflict"/);
  });
});

describe('createCarPurchaseEngine: in-flight-run tracking', () => {
  it('a second trigger for the same case queues behind the first rather than racing it, and both settle', async () => {
    const { engine, runStore, caseStore, activityStore, commandService, idGenerator } =
      buildLiveStack();
    const startResult = commandService.startDemo('cmd-start', { demoId: 'car-purchase' });
    requireOkCommand(startResult);
    const snapshot = requireSnapshot(startResult.value);
    const caseId = snapshot.id;
    seedRealCandidates(caseStore, caseId, snapshot, FIXED_CLOCK, idGenerator);
    void activityStore;

    runStore.create({
      id: 'run-a',
      caseId,
      obligationId: 'car.deal_normalization',
      status: 'queued',
      createdAt: FIXED_CLOCK.now(),
      updatedAt: FIXED_CLOCK.now(),
    });
    runStore.create({
      id: 'run-b',
      caseId,
      obligationId: 'car.deal_normalization',
      status: 'queued',
      createdAt: FIXED_CLOCK.now(),
      updatedAt: FIXED_CLOCK.now(),
    });

    // Deliberately not awaited between the two triggers: the second
    // trigger's Promise is chained behind the first's in-flight promise
    // (createCarPurchaseEngine's own inFlightByCase map), so by the time
    // the *first* run's `.finally` cleanup fires, the map already points
    // at the *second* run's promise -- exercising the "don't delete a
    // newer run's in-flight entry" branch.
    const first = engine.trigger({
      caseId,
      runId: 'run-a',
      obligationId: 'car.deal_normalization',
    });
    const second = engine.trigger({
      caseId,
      runId: 'run-b',
      obligationId: 'car.deal_normalization',
    });

    await Promise.all([first, second]);

    const recordA = runStore.load('run-a');
    const recordB = runStore.load('run-b');
    expect(recordA?.status).toBe('completed');
    expect(recordB?.status).toBe('completed');
  }, 30_000);
});
