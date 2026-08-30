import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogLoadError, clearCatalogCache, loadCatalog, MAX_CATALOG_BYTES } from './data.js';

describe('loadCatalog', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    clearCatalogCache();
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('loads and validates the real bundled catalog file', () => {
    const records = loadCatalog();
    expect(records.length).toBeGreaterThan(50);
    const [first] = records;
    expect(typeof first?.id).toBe('string');
    expect(typeof first?.year).toBe('number');
  });

  it('caches the real bundled catalog across calls (same array reference)', () => {
    const first = loadCatalog();
    const second = loadCatalog();
    expect(first).toBe(second);
  });

  it('throws CatalogLoadError for a missing file', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sift-catalog-'));
    const missingPath = join(tempDir, 'does-not-exist.json');
    expect(() => loadCatalog(missingPath)).toThrow(CatalogLoadError);
  });

  it('throws CatalogLoadError for malformed JSON', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sift-catalog-'));
    const filePath = join(tempDir, 'catalog.json');
    writeFileSync(filePath, '{ not valid json', 'utf8');
    expect(() => loadCatalog(filePath)).toThrow(CatalogLoadError);
  });

  it('throws CatalogLoadError for JSON that fails schema validation', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sift-catalog-'));
    const filePath = join(tempDir, 'catalog.json');
    writeFileSync(filePath, JSON.stringify([{ id: 'x' }]), 'utf8');
    expect(() => loadCatalog(filePath)).toThrow(CatalogLoadError);
  });

  it('throws CatalogLoadError for a file exceeding the defensive byte bound', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sift-catalog-'));
    const filePath = join(tempDir, 'catalog.json');
    // A single oversized JSON array literal -- never actually JSON.parse'd,
    // since the byte-size guard runs first.
    writeFileSync(filePath, '[' + '1'.repeat(MAX_CATALOG_BYTES + 1) + ']', 'utf8');
    expect(() => loadCatalog(filePath)).toThrow(CatalogLoadError);
  });
});
