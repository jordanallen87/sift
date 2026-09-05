import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CaseEvent } from '@sift/contracts';
import type { Clock, IdGenerator } from '@sift/core';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import { InMemoryActivityStore } from '../store/activity-store.js';
import { MemoryCaseStore } from '../store/memory-case-store.js';
import { SqliteCaseStore } from '../store/sqlite-case-store.js';
import { MemoryRunStore, RunService, SqliteRunStore, type RunRecord } from './run-service.js';

const now = '2026-08-27T00:00:00.000Z';

const fixedClock: Clock = { now: () => now };

function idGeneratorFrom(values: readonly string[]): IdGenerator {
  let index = 0;
  return {
    next: (prefix?: string) => {
      const value = values[index];
      index += 1;
      if (value === undefined) {
        throw new Error('idGenerator exhausted');
      }
      return prefix !== undefined ? `${prefix}-${value}` : value;
    },
  };
}

function caseCreatedEvent(caseId: string): CaseEvent {
  return {
    eventId: `${caseId}-ev-1`,
    caseId,
    sequence: 1,
    timestamp: now,
    type: 'case.created',
    payload: {
      title: 'Choose Our Next Car',
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: '0'.repeat(64),
        selectedBy: 'user',
        reasons: ['Selected from the launcher'],
      },
    },
  };
}

function obligationUpdatedEvent(
  caseId: string,
  sequence: number,
  obligationId: string,
  overrides: Partial<{ status: 'open' | 'satisfied'; dependsOn: string[] }> = {},
): CaseEvent {
  return {
    eventId: `${caseId}-ev-${sequence}`,
    caseId,
    sequence,
    timestamp: now,
    type: 'obligation.updated',
    payload: {
      obligation: {
        id: obligationId,
        label: 'Hard constraints',
        question: 'Which cars satisfy hard constraints?',
        category: 'constraints',
        required: true,
        priority: 10,
        requiredEvidenceLevel: 'E1',
        maxAttempts: 2,
        acceptedUncertaintyAllowed: false,
        dependsOn: overrides.dependsOn ?? [],
        preferredSkills: [],
        preferredSpecialists: [],
        completionRule: {
          minimumEvidenceLevel: 'E1',
          minimumIndependentSources: 1,
          acceptedUncertaintyAllowed: false,
        },
        origin: 'pack',
        status: overrides.status ?? 'open',
        attemptsUsed: 0,
        updatedAt: now,
      },
    },
  };
}

describe('RunService.requestInvestigation', () => {
  let caseStore: MemoryCaseStore;
  let activityStore: InMemoryActivityStore;
  let runStore: MemoryRunStore;
  let service: RunService;

  beforeEach(() => {
    caseStore = new MemoryCaseStore();
    activityStore = new InMemoryActivityStore();
    runStore = new MemoryRunStore();
    service = new RunService({
      caseStore,
      activityStore,
      runStore,
      clock: fixedClock,
      idGenerator: idGeneratorFrom(['run-1', 'run-2']),
    });
    caseStore.append(
      'case-1',
      [caseCreatedEvent('case-1'), obligationUpdatedEvent('case-1', 2, 'obligation-1')],
      0,
    );
  });

  it('creates a queued run, records it durably, and returns a RunReceipt (success)', () => {
    const result = service.requestInvestigation('cmd-1', {
      caseId: 'case-1',
      expectedSequence: 2,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.value.runId).toBe('run-run-1');
    expect(result.value.caseId).toBe('case-1');
    expect(result.value.acceptedSequence).toBe(2);
    expect(result.value.snapshot?.id).toBe('case-1');
  });

  it('selects the highest-priority open obligation when obligationId is omitted', () => {
    const result = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 2 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');

    const activity = activityStore.replayFrom('case-1', 0);
    expect(activity).toHaveLength(1);
    expect(activity[0]?.type).toBe('run.queued');
    expect(activity[0]?.obligationId).toBe('obligation-1');
  });

  it('accepts an explicit obligationId that exists on the case', () => {
    const result = service.requestInvestigation('cmd-1', {
      caseId: 'case-1',
      obligationId: 'obligation-1',
      expectedSequence: 2,
    });
    expect(result.status).toBe('ok');
  });

  it('rejects invalid input (validation)', () => {
    const result = service.requestInvestigation('cmd-1', { caseId: '', expectedSequence: -1 });
    expect(result.status).toBe('validation');
  });

  it('rejects an obligationId that does not exist on the case (validation)', () => {
    const result = service.requestInvestigation('cmd-1', {
      caseId: 'case-1',
      obligationId: 'does-not-exist',
      expectedSequence: 2,
    });
    expect(result.status).toBe('validation');
  });

  it('rejects when no obligation is selectable (validation)', () => {
    caseStore.append(
      'case-1',
      [obligationUpdatedEvent('case-1', 3, 'obligation-1', { status: 'satisfied' })],
      2,
    );
    const result = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 3 });
    expect(result.status).toBe('validation');
  });

  it('returns not_found for a case that does not exist', () => {
    const result = service.requestInvestigation('cmd-1', {
      caseId: 'missing',
      expectedSequence: 0,
    });
    expect(result.status).toBe('not_found');
  });

  it('returns conflict (with the latest snapshot) for a stale expectedSequence', () => {
    const result = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 1 });
    expect(result.status).toBe('conflict');
    if (result.status !== 'conflict') throw new Error('expected conflict');
    expect(result.actualSequence).toBe(2);
    expect(result.snapshot.eventSequence).toBe(2);
  });

  it('is idempotent: retrying the same commandId returns the original RunReceipt without creating a second run', () => {
    const first = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 2 });
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') throw new Error('expected ok');

    const second = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 2 });
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') throw new Error('expected ok');
    expect(second.value.runId).toBe(first.value.runId);

    // Only one run.queued activity event exists -- the retry did not create a second run.
    expect(activityStore.replayFrom('case-1', 0)).toHaveLength(1);
  });

  it('throws (real integrity violation, not a ServiceFailure) if an idempotency record references a case that no longer exists', () => {
    const first = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 2 });
    expect(first.status).toBe('ok');

    caseStore.resetDemo('case-1');

    expect(() =>
      service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 2 }),
    ).toThrow(
      /idempotency record for commandId "cmd-1" references case "case-1", which no longer exists/,
    );
  });
});

function runRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 'run-1',
    caseId: 'case-1',
    obligationId: 'obligation-1',
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('MemoryRunStore.updateStatus', () => {
  it('throws (real integrity violation) when the run does not exist', () => {
    const store = new MemoryRunStore();
    expect(() => store.updateStatus('missing', { status: 'running', updatedAt: now })).toThrow(
      /MemoryRunStore.updateStatus: run "missing" was not found/,
    );
  });

  it('applies only the provided optional fields on the first status update, leaving traceId/sessionId/result absent when omitted', () => {
    const store = new MemoryRunStore();
    store.create(runRecord());

    store.updateStatus('run-1', { status: 'running', updatedAt: now, traceId: 'trace-1' });

    const loaded = store.load('run-1');
    expect(loaded?.status).toBe('running');
    expect(loaded?.traceId).toBe('trace-1');
    expect(loaded?.sessionId).toBeUndefined();
    expect(loaded?.result).toBeUndefined();
    // Preserved from the original record via `...existing`, not overwritten.
    expect(loaded?.obligationId).toBe('obligation-1');
  });

  it('applies sessionId and result on a later update while leaving an earlier-set traceId untouched (an omitted field never clears a prior value)', () => {
    const store = new MemoryRunStore();
    store.create(runRecord());
    store.updateStatus('run-1', { status: 'running', updatedAt: now, traceId: 'trace-1' });

    store.updateStatus('run-1', {
      status: 'completed',
      updatedAt: now,
      sessionId: 'session-1',
      result: { round: 1 },
    });

    const loaded = store.load('run-1');
    expect(loaded?.status).toBe('completed');
    expect(loaded?.sessionId).toBe('session-1');
    expect(loaded?.result).toEqual({ round: 1 });
    expect(loaded?.traceId).toBe('trace-1');
  });
});

describe('SqliteRunStore', () => {
  let test: TestDatabase | undefined;

  afterEach(() => {
    test?.cleanup();
    test = undefined;
  });

  function createStore(): SqliteRunStore {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    // `runs.case_id` foreign-keys onto `cases.id` (foreign_keys = ON), so a
    // real case row must exist first.
    new SqliteCaseStore(test).append('case-1', [caseCreatedEvent('case-1')], 0);
    return new SqliteRunStore(test);
  }

  it('round-trips traceId/sessionId/result through real SQLite across two separate updateStatus() calls', () => {
    const store = createStore();
    store.create(runRecord());

    store.updateStatus('run-1', { status: 'running', updatedAt: now, traceId: 'trace-1' });
    let loaded = store.load('run-1');
    expect(loaded?.status).toBe('running');
    expect(loaded?.traceId).toBe('trace-1');
    expect(loaded?.sessionId).toBeUndefined();
    expect(loaded?.result).toBeUndefined();

    store.updateStatus('run-1', {
      status: 'completed',
      updatedAt: now,
      sessionId: 'session-1',
      result: { round: 1 },
    });
    loaded = store.load('run-1');
    expect(loaded?.status).toBe('completed');
    expect(loaded?.sessionId).toBe('session-1');
    expect(loaded?.result).toEqual({ round: 1 });
    // COALESCE(?, trace_id) in the real UPDATE: an omitted field on this
    // second call does not clear the value the first call durably wrote.
    expect(loaded?.traceId).toBe('trace-1');
  });

  it('returns undefined for a run that was never created', () => {
    const store = createStore();
    expect(store.load('missing')).toBeUndefined();
  });

  // I1 (ADR 0006 decision 8): the durable half of "this assistant's tool
  // call caused this entire run".
  describe('origin (I1: WebMCP call provenance)', () => {
    it('round-trips a webmcp origin through real SQLite and survives the run advancing to completion', () => {
      const store = createStore();
      store.create(runRecord({ origin: 'webmcp' }));

      expect(store.load('run-1')?.origin).toBe('webmcp');

      // `RunStatusUpdate` carries no origin at all -- provenance is stated
      // once, when the run is created, and no later lifecycle write can
      // rewrite or clear who asked for it.
      store.updateStatus('run-1', { status: 'running', updatedAt: now, traceId: 'trace-1' });
      store.updateStatus('run-1', { status: 'completed', updatedAt: now, result: { round: 1 } });
      expect(store.load('run-1')?.origin).toBe('webmcp');
      expect(store.load('run-1')?.status).toBe('completed');
    });

    it('stores NULL and reads back an absent field when no origin was stated -- never a substituted default', () => {
      const store = createStore();
      store.create(runRecord());

      const row = test?.sqlite.prepare('SELECT origin FROM runs WHERE id = ?').get('run-1') as
        { origin: string | null } | undefined;
      expect(row?.origin).toBeNull();

      const loaded = store.load('run-1');
      expect(loaded?.origin).toBeUndefined();
      expect('origin' in (loaded ?? {})).toBe(false);
    });

    it('reads an origin token outside COMMAND_ORIGINS back as "not stated" rather than reporting it as real provenance', () => {
      const store = createStore();
      store.create(runRecord());
      // Only reachable by editing the database directly: the write path
      // accepts nothing but an already-validated `CommandOrigin`.
      test?.sqlite.prepare("UPDATE runs SET origin = 'ui' WHERE id = ?").run('run-1');

      expect(store.load('run-1')?.origin).toBeUndefined();
    });
  });
});
