import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import { SqliteCaseStore } from './sqlite-case-store.js';
import { runCaseStoreContractTests } from '../fixtures/case-store-contract.js';

let test: TestDatabase | undefined;

afterEach(() => {
  test?.cleanup();
  test = undefined;
});

function createStore(): SqliteCaseStore {
  test = createTestDatabase();
  applyMigrations(test.sqlite);
  return new SqliteCaseStore(test);
}

runCaseStoreContractTests(createStore);

describe('SqliteCaseStore persistence specifics', () => {
  it('persists events and the snapshot durably across a second store instance over the same database', () => {
    const db = createTestDatabase();
    applyMigrations(db.sqlite);
    test = db;

    const first = new SqliteCaseStore(db);
    first.append(
      'case-1',
      [
        {
          eventId: 'ev-1',
          caseId: 'case-1',
          sequence: 1,
          timestamp: '2026-08-27T00:00:00.000Z',
          type: 'case.created',
          payload: {
            title: 'Test case',
            pack: {
              id: 'car-purchase',
              version: '1.0.0',
              compiledHash: '0'.repeat(64),
              selectedBy: 'user',
              reasons: ['Selected from the launcher'],
            },
          },
        },
      ],
      0,
    );

    // A fresh store instance over the *same* open connection proves this is
    // reading real durable rows, not in-process JS object state.
    const second = new SqliteCaseStore(db);
    const snapshot = second.load('case-1');
    expect(snapshot?.eventSequence).toBe(1);
    expect(snapshot?.title).toBe('Test case');

    const subscription = second.subscribe('case-1');
    expect(subscription.replay).toHaveLength(1);
    expect(subscription.replay[0]?.type).toBe('case.created');
  });

  it('rolls back the whole append transaction if a later insert step would violate a DB constraint', () => {
    const db = createTestDatabase();
    applyMigrations(db.sqlite);
    test = db;
    const store = new SqliteCaseStore(db);

    // Two events claiming the exact same sequence number is impossible via
    // foldEvents' own contiguity check for a *single* append call, but two
    // interleaved commandIds writing the same (case_id, sequence) pair via
    // the real unique index is exactly what the transaction must reject
    // atomically. Simulate it by pre-inserting a colliding case_events row
    // directly, then attempting an append that would produce the same row.
    db.sqlite
      .prepare(
        `INSERT INTO cases (id, title, status, pack_id, pack_version, pack_compiled_hash, pack_selected_by, event_sequence, snapshot, created_at, updated_at)
         VALUES ('case-1', 'Test case', 'draft', 'car-purchase', '1.0.0', ?, 'user', 1, '{}', ?, ?)`,
      )
      .run('0'.repeat(64), '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z');
    db.sqlite
      .prepare(
        `INSERT INTO case_events (id, case_id, sequence, type, created_at, payload)
         VALUES ('ev-collide', 'case-1', 2, 'case.created', ?, '{}')`,
      )
      .run('2026-08-27T00:00:00.000Z');

    expect(() =>
      store.append(
        'case-1',
        [
          {
            eventId: 'ev-new',
            caseId: 'case-1',
            sequence: 2,
            timestamp: '2026-08-27T00:00:00.000Z',
            type: 'criteria.updated',
            payload: { criteria: [] },
          },
        ],
        1,
      ),
    ).toThrow();

    // The cases row must be untouched (still event_sequence 1) — the
    // transaction rolled back rather than partially applying.
    const row = db.sqlite
      .prepare('SELECT event_sequence as eventSequence FROM cases WHERE id = ?')
      .get('case-1') as { eventSequence: number };
    expect(row.eventSequence).toBe(1);
  });
});
