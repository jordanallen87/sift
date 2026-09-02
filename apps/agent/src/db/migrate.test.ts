import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type SiftDatabase } from './connection.js';
import { applyMigrations, migrate, MigrationIntegrityError } from './migrate.js';

const REQUIRED_TABLES = [
  'cases',
  'case_events',
  'activity_events',
  'runs',
  'idempotency_keys',
  'runtime_events',
  // Added by `0002_run_plans.sql`: one row per RunPlan *version*, so the
  // "what was reused when the concern changed" evidence outlives the
  // process that produced it.
  'run_plans',
  'schema_migrations',
];

/**
 * Every migration, in the exact order the runner must apply them. Written
 * out by name rather than read from the directory: a test that derives its
 * expectation from the same source as the implementation would still pass
 * if a migration were accidentally added, renamed, or dropped, which is
 * precisely what this list exists to catch.
 */
const ALL_MIGRATIONS = ['0001_initial.sql', '0002_run_plans.sql'];

function tableNames(database: SiftDatabase): string[] {
  const rows = database.sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[];
  return rows.map((row) => row.name);
}

describe('applyMigrations', () => {
  let database: SiftDatabase | undefined;
  let dir: string | undefined;

  afterEach(() => {
    database?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
    database = undefined;
    dir = undefined;
  });

  it('creates all seven required tables from a fresh connection', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-migrate-test-'));
    database = openDatabase(dir);

    const result = applyMigrations(database.sqlite);

    expect(result.applied).toEqual(ALL_MIGRATIONS);
    expect(result.alreadyApplied).toEqual([]);
    for (const table of REQUIRED_TABLES) {
      expect(tableNames(database)).toContain(table);
    }
  });

  it('is a no-op the second time it runs against the same database', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-migrate-test-'));
    database = openDatabase(dir);

    const first = applyMigrations(database.sqlite);
    const second = applyMigrations(database.sqlite);

    expect(first.applied).toEqual(ALL_MIGRATIONS);
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toEqual(ALL_MIGRATIONS);

    const ledgerRows = database.sqlite.prepare('SELECT * FROM schema_migrations').all();
    expect(ledgerRows).toHaveLength(ALL_MIGRATIONS.length);
  });

  it('throws MigrationIntegrityError when an already-applied migration file is edited afterward', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-migrate-test-'));
    const migrationsDir = mkdtempSync(join(tmpdir(), 'sift-migrate-files-'));
    // A real (if minimal) migration: it must create `schema_migrations`
    // itself, exactly like the generated `0001_initial.sql` does, since a
    // fresh database has no ledger table yet — the first-ever migration is
    // always the one that brings it into existence.
    writeFileSync(
      join(migrationsDir, '0001_initial.sql'),
      `CREATE TABLE probe (id INTEGER PRIMARY KEY);
--> statement-breakpoint
CREATE TABLE schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`,
    );
    const opened = openDatabase(dir);
    database = opened;

    applyMigrations(opened.sqlite, migrationsDir);
    // Tamper with the already-applied file's content.
    writeFileSync(
      join(migrationsDir, '0001_initial.sql'),
      `CREATE TABLE probe (id INTEGER PRIMARY KEY); -- tampered
--> statement-breakpoint
CREATE TABLE schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`,
    );

    expect(() => applyMigrations(opened.sqlite, migrationsDir)).toThrow(MigrationIntegrityError);
    rmSync(migrationsDir, { recursive: true, force: true });
  });
});

describe('migrate', () => {
  let dir: string | undefined;
  let database: SiftDatabase | undefined;

  afterEach(() => {
    database?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
    database = undefined;
  });

  it('creates a missing/nested data directory and applies migrations rather than crashing', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-migrate-boot-'));
    const nestedDataDir = join(dir, 'deeply', 'nested', 'data');
    expect(existsSync(nestedDataDir)).toBe(false);

    const outcome = migrate(nestedDataDir);
    database = outcome.database;

    expect(existsSync(nestedDataDir)).toBe(true);
    expect(outcome.result.applied).toEqual(ALL_MIGRATIONS);
    for (const table of REQUIRED_TABLES) {
      expect(tableNames(database)).toContain(table);
    }
  });

  it('is idempotent and safe to call repeatedly (as on every service boot)', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-migrate-boot-'));

    const firstBoot = migrate(dir);
    firstBoot.database.close();
    const secondBoot = migrate(dir);
    database = secondBoot.database;

    expect(firstBoot.result.applied).toEqual(ALL_MIGRATIONS);
    expect(secondBoot.result.applied).toEqual([]);
    expect(secondBoot.result.alreadyApplied).toEqual(ALL_MIGRATIONS);
  });
});
