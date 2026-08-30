/**
 * Idempotent SQLite migration runner (docs/specs/architecture.md
 * "Persistence": "SQLite ... `better-sqlite3`, Drizzle migrations ...").
 *
 * Deliberately does not use `drizzle-orm/better-sqlite3/migrator`'s own
 * `migrate()` function. That helper is real and works, but it manages its
 * own bookkeeping table (`__drizzle_migrations` by default, columns
 * `id`/`hash`/`created_at`, created via raw SQL outside of Drizzle's own
 * schema builder) — architecture.md instead names `schema_migrations` as
 * one of the seven *required* Sift tables, which this repo needs to define
 * (with its own real, task-controlled columns) in `schema.ts` exactly like
 * every other table. Rather than run two different migration ledgers (a
 * Drizzle-owned one for bookkeeping and a separately-hand-maintained
 * `schema_migrations` purely for spec-shape compliance), this module reads
 * the same drizzle-kit-*generated* `.sql` files
 * (`drizzle-kit generate`; see `apps/agent/drizzle.config.ts` and
 * `apps/agent/drizzle/0001_initial.sql`) and applies them itself, recording
 * each in the one real `schema_migrations` table.
 *
 * `--> statement-breakpoint` lines (drizzle-kit's own multi-statement
 * marker, needed by drivers that can't execute several DDL statements in
 * one call) are used here only to split a migration file into individual
 * statements for `better-sqlite3`'s `Database#exec`, which *can* run
 * multiple `;`-separated statements at once — so this is a parsing
 * convenience, not a semantic requirement.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { openDatabase, type SiftDatabase } from './connection.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
// This file lives at apps/agent/src/db/migrate.ts (or the mirrored
// dist/db/migrate.js after a build); drizzle-kit's `out` is apps/agent/drizzle
// — two directories up from either location.
const DEFAULT_MIGRATIONS_DIR = join(currentDir, '..', '..', 'drizzle');

const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

export interface MigrateResult {
  /** Migration filenames applied during this call, in the order applied. */
  applied: string[];
  /** Migration filenames that were already recorded as applied and were skipped. */
  alreadyApplied: string[];
}

export class MigrationIntegrityError extends Error {
  constructor(name: string) {
    super(
      `Migration "${name}" is recorded as applied, but its current file content no longer ` +
        'matches the hash recorded when it was applied. Migration files must never be edited ' +
        'after being applied — add a new migration instead.',
    );
    this.name = 'MigrationIntegrityError';
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function listMigrationFiles(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function ledgerTableExists(sqlite: Database.Database): boolean {
  const row = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`)
    .get();
  return row !== undefined;
}

interface LedgerRow {
  name: string;
  hash: string;
}

/** Applied migrations recorded in `schema_migrations`, keyed by filename. Empty when the ledger table itself does not exist yet (a genuinely fresh database — the first migration creates the ledger table as part of its own DDL). */
function readLedger(sqlite: Database.Database): Map<string, LedgerRow> {
  if (!ledgerTableExists(sqlite)) return new Map();
  const rows = sqlite.prepare('SELECT name, hash FROM schema_migrations').all() as LedgerRow[];
  return new Map(rows.map((row) => [row.name, row]));
}

/**
 * Applies every not-yet-applied `.sql` file in `migrationsDir` (default:
 * `apps/agent/drizzle`) to `sqlite`, in filename order, each inside its own
 * transaction, recording it in `schema_migrations` immediately afterward.
 * Safe to call repeatedly against the same connection — an already-applied
 * migration is skipped (and reported in `alreadyApplied`) rather than
 * re-run.
 */
export function applyMigrations(
  sqlite: Database.Database,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): MigrateResult {
  const files = listMigrationFiles(migrationsDir);
  const ledger = readLedger(sqlite);

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const fileName of files) {
    const content = readFileSync(join(migrationsDir, fileName), 'utf8');
    const hash = sha256(content);

    const existing = ledger.get(fileName);
    if (existing) {
      if (existing.hash !== hash) {
        throw new MigrationIntegrityError(fileName);
      }
      alreadyApplied.push(fileName);
      continue;
    }

    const statements = content
      .split(STATEMENT_BREAKPOINT)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    const runMigration = sqlite.transaction(() => {
      for (const statement of statements) {
        sqlite.exec(statement);
      }
      sqlite
        .prepare('INSERT INTO schema_migrations (name, hash, applied_at) VALUES (?, ?, ?)')
        .run(fileName, hash, new Date().toISOString());
    });
    runMigration();

    applied.push(fileName);
  }

  return { applied, alreadyApplied };
}

export interface MigrateOptions {
  migrationsDir?: string;
}

export interface MigrateOutcome {
  database: SiftDatabase;
  result: MigrateResult;
}

/**
 * Boot-time entry point: opens the canonical database at `dataDir`
 * (creating a missing or not-yet-created data directory — see
 * `connection.ts`'s `openDatabase` — rather than crashing) and applies
 * every pending migration. Idempotent and safe to call on every service
 * boot (`server.ts` does exactly this before listening).
 */
export function migrate(dataDir: string, options: MigrateOptions = {}): MigrateOutcome {
  const database = openDatabase(dataDir);
  const result = applyMigrations(database.sqlite, options.migrationsDir);
  return { database, result };
}
