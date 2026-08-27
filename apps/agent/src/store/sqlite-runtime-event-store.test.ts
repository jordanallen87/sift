import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import { SqliteRuntimeEventStore } from './runtime-event-store.js';
import { runRuntimeEventStoreContractTests } from '../fixtures/runtime-event-store-contract.js';

let test: TestDatabase | undefined;

afterEach(() => {
  test?.cleanup();
  test = undefined;
});

const now = '2026-08-27T00:00:00.000Z';

function insertCaseRow(db: TestDatabase, caseId: string): void {
  db.sqlite
    .prepare(
      `INSERT INTO cases
        (id, title, status, pack_id, pack_version, pack_compiled_hash, pack_selected_by, event_sequence, snapshot, created_at, updated_at)
       VALUES (?, 'Test case', 'draft', 'car-purchase', '1.0.0', ?, 'user', 0, '{}', ?, ?)`,
    )
    .run(caseId, '0'.repeat(64), now, now);
}

function insertRunRow(db: TestDatabase, runId: string, caseId: string): void {
  db.sqlite
    .prepare(
      `INSERT INTO runs (id, case_id, obligation_id, status, created_at, updated_at)
       VALUES (?, ?, 'obligation-1', 'queued', ?, ?)`,
    )
    .run(runId, caseId, now, now);
}

function createStore(): SqliteRuntimeEventStore {
  test = createTestDatabase();
  applyMigrations(test.sqlite);
  // runtime_events.case_id/run_id both carry real foreign keys -- the
  // contract suite exercises 'case-1'/'run-1' and 'run-2' (sharing
  // 'case-1'); 'does-not-exist' is only ever read, never appended to.
  insertCaseRow(test, 'case-1');
  insertRunRow(test, 'run-1', 'case-1');
  insertRunRow(test, 'run-2', 'case-1');
  return new SqliteRuntimeEventStore(test);
}

runRuntimeEventStoreContractTests(createStore);

describe('SqliteRuntimeEventStore persistence specifics', () => {
  it('persists runtime events durably across a second store instance over the same database', () => {
    const db = createTestDatabase();
    applyMigrations(db.sqlite);
    test = db;
    insertCaseRow(db, 'case-1');
    insertRunRow(db, 'run-1', 'case-1');

    const first = new SqliteRuntimeEventStore(db);
    first.append({
      schemaVersion: '1.0',
      sequence: 0,
      timestamp: now,
      traceId: 'trace-1',
      caseId: 'case-1',
      runId: 'run-1',
      category: 'tool',
      name: 'tool.listing_reader',
      phase: 'start',
      level: 'info',
      summary: 'Calling tool "listing_reader".',
      attributes: { toolName: 'listing_reader' },
      redactions: [],
    });

    const second = new SqliteRuntimeEventStore(db);
    const replay = second.listByRun('run-1');
    expect(replay).toHaveLength(1);
    expect(replay[0]?.summary).toBe('Calling tool "listing_reader".');
  });

  it('rejects a runtime event referencing a run that does not exist (foreign key)', () => {
    const db = createTestDatabase();
    applyMigrations(db.sqlite);
    test = db;
    insertCaseRow(db, 'case-1');
    const store = new SqliteRuntimeEventStore(db);

    expect(() =>
      store.append({
        schemaVersion: '1.0',
        sequence: 0,
        timestamp: now,
        traceId: 'trace-1',
        caseId: 'case-1',
        runId: 'no-such-run',
        category: 'tool',
        name: 'tool.listing_reader',
        phase: 'start',
        level: 'info',
        summary: 'Calling tool "listing_reader".',
        attributes: {},
        redactions: [],
      }),
    ).toThrow(/FOREIGN KEY/i);
  });
});
