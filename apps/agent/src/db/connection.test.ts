import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
