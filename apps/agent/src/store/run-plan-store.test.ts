/**
 * Both `RunPlanStore` implementations against the one shared contract, plus
 * the persistence facts only the SQLite one can prove: that plan history
 * genuinely survives a process restart, and that a case's plans go away
 * with the case.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import { MemoryRunPlanStore, SqliteRunPlanStore } from './run-plan-store.js';
import { runRunPlanStoreContractTests } from '../fixtures/run-plan-store-contract.js';
import { buildRunPlan, reviseRunPlan, type RunPlan } from '../runtime/run-plan.js';
import {
  candidate,
  concernObligation,
  packWithCapabilities,
  planCase,
  withDisposition,
} from '../runtime/run-plan.fixture.js';

const NOW = '2026-09-02T12:00:00.000Z';
const LATER = '2026-09-02T12:05:00.000Z';

let test: TestDatabase | undefined;

afterEach(() => {
  test?.cleanup();
  test = undefined;
});

function insertCaseRow(db: TestDatabase, caseId: string): void {
  db.sqlite
    .prepare(
      `INSERT INTO cases
        (id, title, status, pack_id, pack_version, pack_compiled_hash, pack_selected_by, event_sequence, snapshot, created_at, updated_at)
       VALUES (?, 'Test case', 'draft', 'car-purchase', '1.0.0', ?, 'user', 0, '{}', ?, ?)`,
    )
    .run(caseId, '0'.repeat(64), NOW, NOW);
}

runRunPlanStoreContractTests(() => new MemoryRunPlanStore());

runRunPlanStoreContractTests(
  () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    return new SqliteRunPlanStore(test);
  },
  (caseId) => {
    if (test !== undefined) insertCaseRow(test, caseId);
  },
);

function planFor(caseId: string, now: string): RunPlan {
  const state = withDisposition(
    planCase({
      entities: [candidate('rav4')],
      obligations: [concernObligation('reliability')],
    }),
    'rav4',
    'keep',
  );
  return buildRunPlan(`plan-${caseId}`, {
    caseState: { ...state, id: caseId },
    pack: packWithCapabilities(),
    now,
  });
}

describe('SqliteRunPlanStore persistence specifics', () => {
  it('keeps the whole revision history across a restart', () => {
    // The claim this proves: the "what was reused" evidence a judge can
    // open is durable, not an artifact of the process that produced it.
    const db = createTestDatabase();
    applyMigrations(db.sqlite);
    test = db;
    insertCaseRow(db, 'case-a');

    const first = planFor('case-a', NOW);
    const writer = new SqliteRunPlanStore(db);
    writer.save(first);
    writer.save(
      reviseRunPlan(
        first,
        {
          caseState: { ...planCase({ entities: [candidate('rav4')] }), id: 'case-a' },
          pack: packWithCapabilities(),
          now: LATER,
        },
        { reason: 'new_concern', trigger: 'dog_crate' },
      ),
    );

    // A second store over the same database is the closest honest analogue
    // of a restart available in-process.
    const reader = new SqliteRunPlanStore(db);
    const versions = reader.listVersions('case-a');

    expect(versions.map((plan) => plan.version)).toEqual([1, 2]);
    expect(versions[1]?.revision?.trigger).toBe('dog_crate');
  });

  it('removes a case`s plans when the case itself is deleted', () => {
    const db = createTestDatabase();
    applyMigrations(db.sqlite);
    test = db;
    insertCaseRow(db, 'case-a');

    const store = new SqliteRunPlanStore(db);
    store.save(planFor('case-a', NOW));
    db.sqlite.prepare('DELETE FROM cases WHERE id = ?').run('case-a');

    expect(store.listVersions('case-a')).toEqual([]);
  });

  it('rejects a plan for a case that does not exist', () => {
    const db = createTestDatabase();
    applyMigrations(db.sqlite);
    test = db;

    const store = new SqliteRunPlanStore(db);
    expect(() => {
      store.save(planFor('case-missing', NOW));
    }).toThrow();
  });
});
