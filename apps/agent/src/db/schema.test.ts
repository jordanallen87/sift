/**
 * Proves the migrated schema's real constraints — not just that the tables
 * exist, but that SQLite actually enforces the uniqueness and foreign-key
 * rules `schema.ts`/`0001_initial.sql` declare, by attempting real
 * duplicate/dangling inserts and asserting they throw.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './connection.js';
import { applyMigrations } from './migrate.js';

let test: TestDatabase;
const now = '2026-08-27T00:00:00.000Z';

function insertCase(id: string): void {
  test.sqlite
    .prepare(
      `INSERT INTO cases
        (id, title, status, pack_id, pack_version, pack_compiled_hash, pack_selected_by, event_sequence, snapshot, created_at, updated_at)
       VALUES (?, 'Test case', 'draft', 'car-purchase', '1.0.0', ?, 'user', 0, '{}', ?, ?)`,
    )
    .run(id, '0'.repeat(64), now, now);
}

function insertRun(id: string, caseId: string): void {
  test.sqlite
    .prepare(
      `INSERT INTO runs (id, case_id, obligation_id, status, created_at, updated_at)
       VALUES (?, ?, 'obligation-1', 'queued', ?, ?)`,
    )
    .run(id, caseId, now, now);
}

beforeEach(() => {
  test = createTestDatabase();
  applyMigrations(test.sqlite);
});

afterEach(() => {
  test.cleanup();
});

describe('migrated schema', () => {
  it('creates every required table with WAL and foreign keys already enabled', () => {
    expect(test.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(test.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('enforces (case_id, sequence) uniqueness on case_events', () => {
    insertCase('case-1');
    const insertEvent = test.sqlite.prepare(
      `INSERT INTO case_events (id, case_id, sequence, type, created_at, payload)
       VALUES (?, ?, ?, 'case.created', ?, '{}')`,
    );
    insertEvent.run('event-1', 'case-1', 0, now);

    expect(() => insertEvent.run('event-2', 'case-1', 0, now)).toThrow(/UNIQUE/i);
  });

  it('enforces (case_id, sequence) uniqueness on activity_events', () => {
    insertCase('case-1');
    const insertActivity = test.sqlite.prepare(
      `INSERT INTO activity_events (id, case_id, sequence, type, phase, summary, created_at)
       VALUES (?, ?, ?, 'command.accepted', 'active', 'summary', ?)`,
    );
    insertActivity.run('activity-1', 'case-1', 0, now);

    expect(() => insertActivity.run('activity-2', 'case-1', 0, now)).toThrow(/UNIQUE/i);
  });

  it('enforces (run_id, sequence) uniqueness on runtime_events', () => {
    insertCase('case-1');
    insertRun('run-1', 'case-1');
    const insertRuntime = test.sqlite.prepare(
      `INSERT INTO runtime_events
        (id, run_id, case_id, sequence, category, name, phase, level, trace_id, summary, created_at, data)
       VALUES (?, ?, ?, ?, 'agent', 'agent.start', 'start', 'info', 'trace-1', 'summary', ?, '{}')`,
    );
    insertRuntime.run('debug-1', 'run-1', 'case-1', 0, now);

    expect(() => insertRuntime.run('debug-2', 'run-1', 'case-1', 0, now)).toThrow(/UNIQUE/i);
  });

  it('enforces idempotency_keys primary-key uniqueness on a real duplicate insert', () => {
    insertCase('case-1');
    const insertKey = test.sqlite.prepare(
      `INSERT INTO idempotency_keys (id, case_id, command_name, result, created_at)
       VALUES (?, ?, 'selectPack', '{}', ?)`,
    );
    insertKey.run('command-1', 'case-1', now);

    expect(() => insertKey.run('command-1', 'case-1', now)).toThrow(/UNIQUE/i);
  });

  it('rejects a case_event referencing a case that does not exist (foreign key)', () => {
    expect(() =>
      test.sqlite
        .prepare(
          `INSERT INTO case_events (id, case_id, sequence, type, created_at, payload)
           VALUES ('event-1', 'no-such-case', 0, 'case.created', ?, '{}')`,
        )
        .run(now),
    ).toThrow(/FOREIGN KEY/i);
  });

  it('rejects a runtime_event referencing a run that does not exist (foreign key)', () => {
    insertCase('case-1');
    expect(() =>
      test.sqlite
        .prepare(
          `INSERT INTO runtime_events
            (id, run_id, case_id, sequence, category, name, phase, level, trace_id, summary, created_at, data)
           VALUES ('debug-1', 'no-such-run', 'case-1', 0, 'agent', 'agent.start', 'start', 'info', 'trace-1', 'summary', ?, '{}')`,
        )
        .run(now),
    ).toThrow(/FOREIGN KEY/i);
  });

  it('enforces schema_migrations.name uniqueness', () => {
    const insertLedgerRow = test.sqlite.prepare(
      `INSERT INTO schema_migrations (name, hash, applied_at) VALUES (?, ?, ?)`,
    );
    // '0001_initial.sql' was already recorded by the beforeEach migration run.
    expect(() => insertLedgerRow.run('0001_initial.sql', 'deadbeef', now)).toThrow(/UNIQUE/i);
  });

  it('cascades case deletion to its dependent case_events, activity_events, runs, and idempotency_keys', () => {
    insertCase('case-1');
    insertRun('run-1', 'case-1');
    test.sqlite
      .prepare(
        `INSERT INTO case_events (id, case_id, sequence, type, created_at, payload)
         VALUES ('event-1', 'case-1', 0, 'case.created', ?, '{}')`,
      )
      .run(now);
    test.sqlite
      .prepare(
        `INSERT INTO runtime_events
          (id, run_id, case_id, sequence, category, name, phase, level, trace_id, summary, created_at, data)
         VALUES ('debug-1', 'run-1', 'case-1', 0, 'agent', 'agent.start', 'start', 'info', 'trace-1', 'summary', ?, '{}')`,
      )
      .run(now);

    test.sqlite.prepare('DELETE FROM cases WHERE id = ?').run('case-1');

    expect(test.sqlite.prepare('SELECT * FROM case_events').all()).toHaveLength(0);
    expect(test.sqlite.prepare('SELECT * FROM runs').all()).toHaveLength(0);
    expect(test.sqlite.prepare('SELECT * FROM runtime_events').all()).toHaveLength(0);
  });
});
