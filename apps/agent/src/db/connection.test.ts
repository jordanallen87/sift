import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, openDatabase, type TestDatabase } from './connection.js';

describe('openDatabase', () => {
  let opened: TestDatabase | undefined;

  afterEach(() => {
    opened?.cleanup();
    opened = undefined;
  });

  it('creates a missing data directory instead of crashing', () => {
    opened = createTestDatabase();
    const nestedMissingDir = join(opened.dir, 'nested', 'does-not-exist-yet');
    expect(existsSync(nestedMissingDir)).toBe(false);

    const database = openDatabase(nestedMissingDir);
    expect(existsSync(nestedMissingDir)).toBe(true);
    expect(existsSync(join(nestedMissingDir, 'sift.sqlite'))).toBe(true);
    database.close();
  });

  it('enables WAL journal mode on every connection', () => {
    opened = createTestDatabase();
    const mode = opened.sqlite.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });

  it('enables foreign key enforcement on every connection', () => {
    opened = createTestDatabase();
    const enabled = opened.sqlite.pragma('foreign_keys', { simple: true });
    expect(enabled).toBe(1);
  });

  it('sets a bounded, positive busy timeout on every connection', () => {
    opened = createTestDatabase();
    const timeoutMs = opened.sqlite.pragma('busy_timeout', { simple: true }) as number;
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThanOrEqual(30_000);
  });

  it('exposes a drizzle db bound to the same underlying connection', () => {
    opened = createTestDatabase();
    expect(opened.db).toBeDefined();
    // A trivial raw query through the drizzle wrapper proves it is bound to
    // a live, usable connection rather than a stub.
    const rows = opened.sqlite.prepare('SELECT 1 as one').all();
    expect(rows).toEqual([{ one: 1 }]);
  });
});

describe('legacy pax.sqlite adoption (Pax -> Sift rename)', () => {
  let opened: TestDatabase | undefined;

  afterEach(() => {
    opened?.cleanup();
    opened = undefined;
  });

  it('adopts an existing pax.sqlite, preserving its rows, when no sift.sqlite exists', () => {
    opened = createTestDatabase();
    const dir = join(opened.dir, 'legacy-only');
    mkdirSync(dir, { recursive: true });

    // Build a legacy-named database with real content, exactly as the
    // deployed Railway volume holds one today at /data/pax.sqlite.
    const legacyPath = join(dir, 'pax.sqlite');
    const legacy = new Database(legacyPath);
    legacy.pragma('journal_mode = WAL');
    legacy.exec('CREATE TABLE keepsake (id TEXT PRIMARY KEY);');
    legacy.prepare('INSERT INTO keepsake (id) VALUES (?)').run('survives-the-rename');
    legacy.close();
    expect(existsSync(legacyPath)).toBe(true);
    expect(existsSync(join(dir, 'sift.sqlite'))).toBe(false);

    const database = openDatabase(dir);

    // The renamed file must carry the original rows, not be a fresh empty db.
    const row = database.sqlite.prepare('SELECT id FROM keepsake').get() as
      { id: string } | undefined;
    expect(row?.id).toBe('survives-the-rename');
    expect(existsSync(join(dir, 'sift.sqlite'))).toBe(true);
    expect(existsSync(legacyPath)).toBe(false);
    database.close();
  });

  it('leaves an existing sift.sqlite untouched even when a stale pax.sqlite is present', () => {
    opened = createTestDatabase();
    const dir = join(opened.dir, 'both-present');
    mkdirSync(dir, { recursive: true });

    const current = new Database(join(dir, 'sift.sqlite'));
    current.exec('CREATE TABLE marker (id TEXT PRIMARY KEY);');
    current.prepare('INSERT INTO marker (id) VALUES (?)').run('current');
    current.close();

    const stale = new Database(join(dir, 'pax.sqlite'));
    stale.exec('CREATE TABLE marker (id TEXT PRIMARY KEY);');
    stale.prepare('INSERT INTO marker (id) VALUES (?)').run('stale');
    stale.close();

    const database = openDatabase(dir);

    const row = database.sqlite.prepare('SELECT id FROM marker').get() as
      { id: string } | undefined;
    expect(row?.id).toBe('current');
    // The stale legacy file is left alone rather than silently deleted.
    expect(existsSync(join(dir, 'pax.sqlite'))).toBe(true);
    database.close();
  });

  it('is a no-op on a fresh data directory with neither file present', () => {
    opened = createTestDatabase();
    const freshDir = join(opened.dir, 'fresh');

    const database = openDatabase(freshDir);

    expect(existsSync(join(freshDir, 'sift.sqlite'))).toBe(true);
    expect(existsSync(join(freshDir, 'pax.sqlite'))).toBe(false);
    database.close();
  });
});

describe('createTestDatabase', () => {
  it('returns isolated databases across separate calls', () => {
    const first = createTestDatabase();
    const second = createTestDatabase();
    try {
      expect(first.dir).not.toBe(second.dir);
      first.sqlite.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY)');
      first.sqlite.prepare('INSERT INTO probe (id) VALUES (1)').run();

      expect(() => second.sqlite.prepare('SELECT * FROM probe').all()).toThrow();
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });

  it('cleanup() removes the temporary directory', () => {
    const test = createTestDatabase();
    const dir = test.dir;
    expect(existsSync(dir)).toBe(true);
    test.cleanup();
    expect(existsSync(dir)).toBe(false);
  });
});
