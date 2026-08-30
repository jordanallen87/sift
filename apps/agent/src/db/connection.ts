/**
 * Opens the canonical `better-sqlite3` connection Sift uses everywhere
 * (docs/specs/architecture.md "Persistence": "`better-sqlite3`, Drizzle
 * migrations, foreign keys, WAL mode, and a bounded busy timeout").
 *
 * This module only opens connections and applies the required pragmas; it
 * does not create tables (`migrate.ts` does that) and does not read
 * `SIFT_DATA_DIR` itself (`config.ts` resolves that into a plain `dataDir`
 * string, which callers pass in here) — keeping config resolution and
 * connection-opening as separate, independently testable concerns.
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from './schema.js';

/**
 * Bounded busy timeout applied to every connection
 * (architecture.md "Persistence": "a bounded busy timeout"). Not a value
 * named anywhere in the spec set — 5 seconds is a deliberate judgment call:
 * long enough to ride out a concurrent writer's transaction under the
 * hackathon's single-writable-replica deployment (architecture.md
 * "Deployment": "one writable Railway application replica"), short enough
 * that a genuinely stuck lock still surfaces as a real `SQLITE_BUSY` error
 * rather than hanging a request indefinitely.
 */
export const BUSY_TIMEOUT_MS = 5_000;

export const SQLITE_FILE_NAME = 'sift.sqlite';

export type SiftDrizzleDatabase = BetterSQLite3Database<typeof schema>;

export interface SiftDatabase {
  /** The raw `better-sqlite3` handle — used directly for pragmas and low-level checks (e.g. the health route's liveness probe). */
  sqlite: Database.Database;
  /** The Drizzle query-builder wrapper bound to the same connection. */
  db: SiftDrizzleDatabase;
  close(): void;
}

function configurePragmas(sqlite: Database.Database): void {
  // WAL mode and the busy timeout must be set on every opened connection
  // (architecture.md "Persistence") — WAL is a database-level (not purely
  // per-connection) setting but SQLite still requires it to be requested on
  // each connection that wants WAL-aware behavior; setting it here keeps
  // every code path that opens a Sift database consistent.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
}

/**
 * Opens (creating if necessary) the canonical SQLite database under
 * `dataDir`. `dataDir` defaults to `.sift-data` locally and `/data` on
 * Railway per architecture.md — resolving *which* directory to use is
 * `config.ts`'s job; this function only guarantees the directory exists
 * before opening the file inside it, so a missing or not-yet-created data
 * directory (e.g. a fresh checkout, or a fresh Railway volume) is created
 * rather than crashing.
 */
/**
 * The pre-rename database filename. Sift was called Pax until 2026-08-30,
 * and the deployed Railway service holds a real, populated database at
 * `/data/pax.sqlite` on a persistent volume. Renaming `SQLITE_FILE_NAME`
 * without this adoption step would silently open a fresh, empty database
 * beside the old one — the deployment would appear to have lost every case
 * rather than failing loudly.
 */
export const LEGACY_SQLITE_FILE_NAME = 'pax.sqlite';

/**
 * One-time, idempotent adoption of a pre-rename `pax.sqlite`.
 *
 * Runs only when there is no `sift.sqlite` yet AND a legacy file exists, so
 * it is a no-op on every fresh checkout and on every boot after the first.
 * An existing `sift.sqlite` always wins; a stale legacy file beside it is
 * left on disk untouched rather than deleted, since destroying data on the
 * basis of a filename guess is not this function's call to make.
 *
 * The WAL checkpoint before the rename is load-bearing, not defensive
 * boilerplate: the database is opened in WAL mode, so recently committed
 * pages can still live in a `pax.sqlite-wal` sidecar. Renaming the main file
 * alone would strand them under a filename SQLite will never look for again,
 * silently losing the most recent writes. `wal_checkpoint(TRUNCATE)` folds
 * the WAL back into the main file first, after which the sidecars carry no
 * unique data and can be removed.
 */
function adoptLegacyDatabaseFile(dataDir: string): void {
  const currentPath = join(dataDir, SQLITE_FILE_NAME);
  if (existsSync(currentPath)) return;

  const legacyPath = join(dataDir, LEGACY_SQLITE_FILE_NAME);
  if (!existsSync(legacyPath)) return;

  const legacy = new Database(legacyPath);
  try {
    legacy.pragma('journal_mode = WAL');
    legacy.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    legacy.close();
  }

  renameSync(legacyPath, currentPath);
  for (const suffix of ['-wal', '-shm']) {
    rmSync(`${legacyPath}${suffix}`, { force: true });
  }
}

export function openDatabase(dataDir: string): SiftDatabase {
  mkdirSync(dataDir, { recursive: true });
  adoptLegacyDatabaseFile(dataDir);
  const filePath = join(dataDir, SQLITE_FILE_NAME);
  const sqlite = new Database(filePath);
  configurePragmas(sqlite);
  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    close: () => sqlite.close(),
  };
}

export interface TestDatabase extends SiftDatabase {
  /** The isolated temporary directory backing this database. */
  dir: string;
  /** Closes the connection and removes the temporary directory. */
  cleanup(): void;
}

/**
 * Opens an isolated, file-backed SQLite database under a freshly created
 * temporary directory, for tests. Deliberately file-backed rather than
 * `:memory:`: SQLite does not support WAL mode for in-memory databases (the
 * pragma silently no-ops back to `memory`), which would make this the wrong
 * fixture for any test that needs to prove WAL is actually enabled. Every
 * call gets its own `mkdtempSync` directory, so parallel tests never share
 * state.
 */
export function createTestDatabase(): TestDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'sift-agent-test-'));
  const opened = openDatabase(dir);
  return {
    ...opened,
    dir,
    cleanup: () => {
      opened.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
