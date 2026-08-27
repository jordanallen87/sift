import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import { SqliteActivityStore } from './activity-store.js';
import { runActivityStoreContractTests } from '../fixtures/activity-store-contract.js';

let test: TestDatabase | undefined;

afterEach(() => {
  test?.cleanup();
  test = undefined;
});

function insertCaseRow(db: TestDatabase, caseId: string): void {
  const now = '2026-08-27T00:00:00.000Z';
  db.sqlite
    .prepare(
      `INSERT INTO cases
        (id, title, status, pack_id, pack_version, pack_compiled_hash, pack_selected_by, event_sequence, snapshot, created_at, updated_at)
       VALUES (?, 'Test case', 'draft', 'car-purchase', '1.0.0', ?, 'user', 0, '{}', ?, ?)`,
    )
    .run(caseId, '0'.repeat(64), now, now);
}

function createStore(): SqliteActivityStore {
  test = createTestDatabase();
  applyMigrations(test.sqlite);
  // activity_events.case_id has a real foreign key against cases.id --
  // the contract suite exercises 'case-1' and 'case-2'; 'unknown' is only
  // ever read, never appended to, so it needs no row.
  insertCaseRow(test, 'case-1');
  insertCaseRow(test, 'case-2');
  return new SqliteActivityStore(test);
}

runActivityStoreContractTests(createStore);

describe('SqliteActivityStore persistence specifics', () => {
  it('persists activity events durably across a second store instance over the same database', () => {
    const db = createTestDatabase();
    applyMigrations(db.sqlite);
    test = db;
    insertCaseRow(db, 'case-1');

    const first = new SqliteActivityStore(db);
    first.append({
      timestamp: '2026-08-27T00:00:00.000Z',
      caseId: 'case-1',
      type: 'command.accepted',
      phase: 'completed',
      summary: 'Command accepted',
    });

    const second = new SqliteActivityStore(db);
    const replay = second.replayFrom('case-1', 0);
    expect(replay).toHaveLength(1);
    expect(replay[0]?.summary).toBe('Command accepted');
  });

  it('rejects an activity event for a case that does not exist (foreign key)', () => {
    const db = createTestDatabase();
    applyMigrations(db.sqlite);
    test = db;
    const store = new SqliteActivityStore(db);

    expect(() =>
      store.append({
        timestamp: '2026-08-27T00:00:00.000Z',
        caseId: 'no-such-case',
        type: 'command.accepted',
        phase: 'completed',
        summary: 'Command accepted',
      }),
    ).toThrow(/FOREIGN KEY/i);
  });
});
