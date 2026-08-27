/**
 * Proves the real gap this task closes: a live, SQLite-backed `RunService`
 * whose `requestInvestigation` genuinely triggers the real six-node
 * `home-energy-guardian` Strands Swarm in the background -- mirroring
 * `car-purchase-engine.test.ts`'s own proof for the other hero pack. Every
 * store here is the real SQLite implementation
 * (`SqliteCaseStore`/`SqliteActivityStore`/`SqliteRunStore`), every command
 * goes through the real `CommandService`/`RunService`, and round detection
 * is read purely from the case's own persisted criteria weights --
 * `determineHomeEnergyRound` is never told which round to run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CommandReceipt, RunReceipt } from '@pax/contracts';
import type { Clock, IdGenerator } from '@pax/core';
import { compileHomeEnergyGuardianPack, PackRegistry } from '@pax/packs';
import { buildHomeEnergyResponseOptionEntities } from '@pax/scenarios';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import { CommandService } from '../services/command-service.js';
import { RunService, SqliteRunStore, type RunRecord } from '../services/run-service.js';
import { SqliteActivityStore } from '../store/activity-store.js';
import { SqliteCaseStore } from '../store/sqlite-case-store.js';
import { SqliteRuntimeEventStore } from '../store/runtime-event-store.js';
import {
  createHomeEnergyEngine,
  determineHomeEnergyRound,
  homeEnergyCapabilityCatalog,
  type HomeEnergyEngine,
} from './home-energy-engine.js';

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

/** Polls the real `SqliteRunStore` until `runId` settles into a terminal status -- no fixed sleep, mirroring `car-purchase-engine.test.ts`'s identical helper. */
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
  engine: HomeEnergyEngine;
  idGenerator: IdGenerator;
} {
  const database = createTestDatabase();
  test = database;
  applyMigrations(database.sqlite);

  const registry = new PackRegistry();
  const pack = compileHomeEnergyGuardianPack(homeEnergyCapabilityCatalog(), FIXED_CLOCK);
  registry.register(pack);

  const caseStore = new SqliteCaseStore(database);
  const activityStore = new SqliteActivityStore(database);
  const runStore = new SqliteRunStore(database);
  const runtimeEventStore = new SqliteRuntimeEventStore(database);
  const idGenerator = fixedIdGenerator();

  const engine = createHomeEnergyEngine({
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
    demoSeedEntities: { 'home-energy-guardian': buildHomeEnergyResponseOptionEntities },
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
  };
}

describe('determineHomeEnergyRound', () => {
  function stateWithCriteria(
    criteria: { id: string; weight: number }[],
  ): Parameters<typeof determineHomeEnergyRound>[0] {
    return {
      criteria: criteria.map((entry) => ({
        id: entry.id,
        label: entry.id,
        kind: 'preference',
        weight: entry.weight,
        direction: 'lower_better',
        origin: 'pack',
        status: 'active',
      })),
    } as Parameters<typeof determineHomeEnergyRound>[0];
  }

  it('is round1 when energy.cost/energy.conservation criteria are absent', () => {
    expect(determineHomeEnergyRound(stateWithCriteria([]))).toBe('round1');
  });

  it('is round1 at the pack default 50/50 weighting', () => {
    const state = stateWithCriteria([
      { id: 'energy.cost', weight: 50 },
      { id: 'energy.conservation', weight: 50 },
    ]);
    expect(determineHomeEnergyRound(state)).toBe('round1');
  });

  it('is round1 while cost still outweighs conservation', () => {
    const state = stateWithCriteria([
      { id: 'energy.cost', weight: 80 },
      { id: 'energy.conservation', weight: 20 },
    ]);
    expect(determineHomeEnergyRound(state)).toBe('round1');
  });

  it('is round2 once conservation outweighs cost', () => {
    const state = stateWithCriteria([
      { id: 'energy.cost', weight: 20 },
      { id: 'energy.conservation', weight: 80 },
    ]);
    expect(determineHomeEnergyRound(state)).toBe('round2');
  });
});

describe('home-energy-engine (live, real Swarm, real SQLite)', () => {
  it('runs round1 then round2 purely from real case state, with no external round flag', async () => {
    const { caseStore, activityStore, runStore, runtimeEventStore, commandService, runService } =
      buildLiveStack();

    // --- Seed the case exactly as POST /api/cases/demo would ---
    const startResult = commandService.startDemo('cmd-start', { demoId: 'home-energy-guardian' });
    requireOkCommand(startResult);
    let snapshot = startResult.value.snapshot!;
    const caseId = snapshot.id;
    expect(determineHomeEnergyRound(snapshot)).toBe('round1');
    // The demo-seeding gap this task closed: the four response-option
    // entities exist before any investigation runs, so the eventual
    // recommendation's favoredOptionId resolves to a real, renderable
    // EntityRecord.
    expect(snapshot.entities.map((entity) => entity.id).sort()).toEqual(
      [
        'change-rate-plan',
        'monitor-one-cycle',
        'request-energy-audit',
        'request-hvac-inspection',
      ].sort(),
    );

    // --- POST .../run: the real, only trigger for round1 (auto-selects energy.anomaly, the only open, dependsOn-free obligation) ---
    const run1Result = runService.requestInvestigation('cmd-run-1', {
      caseId,
      expectedSequence: snapshot.eventSequence,
    });
    requireOkRun(run1Result);
    const run1Id = run1Result.value.runId;

    const run1Record = await waitForRunSettled(runStore, run1Id);
    expect(run1Record.status).toBe('completed');
    expect(run1Record.result).toMatchObject({ round: 'round1' });

    snapshot = caseStore.load(caseId)!;
    expect(snapshot).toBeDefined();

    // --- Real round-1 progress genuinely happened ---
    const activityAfterRound1 = activityStore.replayFrom(caseId, 0);
    expect(activityAfterRound1.some((event) => event.type === 'run.started')).toBe(true);
    expect(activityAfterRound1.some((event) => event.type === 'run.completed')).toBe(true);
    expect(activityAfterRound1.some((event) => event.type === 'skill.activated')).toBe(true);
    expect(activityAfterRound1.some((event) => event.type === 'specialist.started')).toBe(true);
    expect(activityAfterRound1.some((event) => event.type === 'specialist.completed')).toBe(true);
    expect(activityAfterRound1.some((event) => event.type === 'evidence.accepted')).toBe(true);

    const anomalyObligation = snapshot.obligations.find((o) => o.id === 'energy.anomaly');
    expect(anomalyObligation?.attemptsUsed).toBeGreaterThan(0);
    expect(snapshot.evidenceLinks.length).toBeGreaterThan(0);
    expect(snapshot.recommendation).not.toBeNull();
    expect(snapshot.recommendation?.favoredOptionId).toBe('monitor-one-cycle');
    expect(snapshot.proposal).toBeNull();

    // --- The real Runtime Inspector persistence path: every normalized
    // RuntimeEvent the real Swarm run produced is durably queryable back out
    // of runtime_events, correlated by the exact same runId/caseId/traceId
    // as the run itself. ---
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
        (event) => event.category === 'swarm' && event.name === 'swarm.node_completed',
      ),
    ).toBe(true);
    expect(
      runtimeEventsRound1.some(
        (event) => event.category === 'swarm' && event.name === 'swarm.handoff',
      ),
    ).toBe(true);
    expect(runtimeEventsRound1.some((event) => event.category === 'tool')).toBe(true);
    expect(runtimeEventsRound1.some((event) => event.category === 'skill')).toBe(true);
    // The required "repeated weather work -> Guide -> handoff" steering moment.
    expect(
      runtimeEventsRound1.some(
        (event) =>
          event.category === 'intervention' &&
          event.name === 'intervention.guide' &&
          event.agentId === 'weather-analyst',
      ),
    ).toBe(true);
    expect(run1Record.traceId).toBeTruthy();

    // --- The household reweights toward long-term waste reduction (real command, no engine involvement) ---
    const criteriaResult = commandService.updateCriteria('cmd-criteria', {
      caseId,
      expectedSequence: snapshot.eventSequence,
      operations: [
        { op: 'reweight', criterionId: 'energy.cost', weight: 20 },
        { op: 'reweight', criterionId: 'energy.conservation', weight: 80 },
      ],
    });
    requireOkCommand(criteriaResult);
    snapshot = criteriaResult.value.snapshot!;

    // Now reweighted: the engine should independently determine round2 from this real state.
    expect(determineHomeEnergyRound(snapshot)).toBe('round2');

    // --- POST .../run again, explicitly against energy.response_options
    // (already "satisfied" from round1, so it is not auto-selectable) --
    // mirrors the "Energy moment" WebMCP demo's pax_update_criteria +
    // pax_request_investigation pairing. ---
    const run2Result = runService.requestInvestigation('cmd-run-2', {
      caseId,
      obligationId: 'energy.response_options',
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
    expect(snapshot.recommendation?.favoredOptionId).toBe('request-hvac-inspection');
    expect(snapshot.proposal).not.toBeNull();
    expect(snapshot.proposal?.status).toBe('pending');

    // --- Round 2 produces its own, separately-sequenced runtime_events,
    // correlated to run2Id and never mixed with round 1's, including the
    // required ConsequenceGuard Confirm before the proposal existed. ---
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
        (event) =>
          event.category === 'intervention' &&
          event.name === 'intervention.confirm' &&
          event.agentId === 'decision-synthesizer',
      ),
    ).toBe(true);

    // A human, never the engine, approves the proposal -- proven by the
    // engine's own output: it only ever appended
    // intervention.confirmation_required, never proposal.reviewed.
    expect(
      activityStore
        .replayFrom(caseId, 0)
        .some((event) => event.type === 'intervention.confirmation_required'),
    ).toBe(true);
  }, 30_000);

  it('logs a real, inspectable trace when the case does not exist at all', async () => {
    const { engine } = buildLiveStack();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await engine.trigger({
        caseId: 'case-does-not-exist',
        runId: 'run-missing-case',
        obligationId: 'energy.anomaly',
      });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('was not found'));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('marks a run failed with a real error activity event when the pinned pack is not registered for this engine', async () => {
    const { database, caseStore, activityStore, runStore, commandService, idGenerator } =
      buildLiveStack();

    const startResult = commandService.startDemo('cmd-start', { demoId: 'home-energy-guardian' });
    requireOkCommand(startResult);
    const caseId = startResult.value.snapshot!.id;

    const brokenEngine = createHomeEnergyEngine({
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
      obligationId: 'energy.anomaly',
      status: 'queued',
      createdAt: FIXED_CLOCK.now(),
      updatedAt: FIXED_CLOCK.now(),
    });

    await brokenEngine.trigger({
      caseId,
      runId: 'run-broken-registry',
      obligationId: 'energy.anomaly',
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
