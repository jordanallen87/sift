import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkSource } from './check-source.js';

describe('checkSource', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('flags `.only(` left in a fixture test file', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'sample.test.ts'),
      [
        "import { describe, it } from 'vitest';",
        '',
        "describe.only('x', () => {",
        "  it('works', () => {});",
        '});',
        '',
      ].join('\n'),
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(false);
    expect(
      result.findings.some(
        (finding) =>
          finding.rule === 'exclusive-or-skipped-test' && finding.filePath === 'sample.test.ts',
      ),
    ).toBe(true);
  });

  it('flags a TODO left in production source', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'thing.ts'),
      ['export function thing(): number {', '  // TODO: finish this', '  return 1;', '}', ''].join(
        '\n',
      ),
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.rule === 'unfinished-marker')).toBe(true);
  });

  it('flags a credential-looking assignment', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'config.ts'),
      "export const API_KEY = 'sk-live-a1B2c3D4e5F6g7H8i9J0kL';\n",
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.rule === 'possible-secret')).toBe(true);
  });

  it('does not flag a charset/alphabet-definition string with no repeated characters', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'fixtures.test.ts'),
      "const safeText = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_'.split('');\n",
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(true);
  });

  it('does not flag a long, all-lowercase, multi-segment kebab-case fixture id', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'fixture.test.ts'),
      "expect(item?.sourceId).toBe('source-household-event-event-thermostat-failure-2026-07');\n",
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(true);
  });

  it('still flags a hyphenated token that mixes case (not a plain kebab-case identifier)', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'config.ts'),
      "export const SECRET = 'aZ9k-Q2mP-7xR4-tW1n-L8vB-3cJ6h-F5dS0';\n",
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.rule === 'possible-secret')).toBe(true);
  });

  it('does not flag a long PascalCase TypeScript identifier', () => {
    // `DiscoveryInteractionRequestedEventSchema` is 40 characters of
    // concatenated English words, which lands just over the bare-token
    // length floor with an entropy of 4.09. It is a declaration, not a
    // secret, and the codebase will keep producing names this long.
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'events.ts'),
      'export const DiscoveryInteractionRequestedEventSchema = base.extend({});\n',
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok, JSON.stringify(result.findings)).toBe(true);
  });

  it('does not flag a PascalCase identifier quoted as a test description', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'schema.test.ts'),
      "describe('CompleteBlindSpotReviewInputSchema', () => {});\n",
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok, JSON.stringify(result.findings)).toBe(true);
  });

  it('still flags a mixed-case token containing digits, which no identifier exception covers', () => {
    // The identifier exception must not become a hole for real secrets. A
    // token with digits scattered through it is not a word sequence, so it
    // falls through to the entropy check exactly as before.
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'config.ts'),
      "export const value = 'Xk9RmQ2pLdR4tYuIoPzWvNqBhGfTsEcAwZ1';\n",
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.rule === 'possible-secret')).toBe(true);
  });

  it('still flags an all-uppercase high-entropy run, which has no word boundaries', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'config.ts'),
      "export const value = 'QWKRMZPLDVTYUIOPXSBHGFTNECAWJRUDKQLM';\n",
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.rule === 'possible-secret')).toBe(true);
  });

  it('still flags a high-entropy token that happens to contain repeated characters', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'config.ts'),
      "export const SECRET = 'aZ9kQ2mP7xR4tW1nL8vB3cJ6hF5dS0ga';\n",
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.rule === 'possible-secret')).toBe(true);
  });

  it('does not flag an obvious placeholder credential value', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(join(dir, 'config.ts'), "export const API_TOKEN = 'your-api-token-here';\n");

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(true);
  });

  it('passes on a clean fixture', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(
      join(dir, 'clean.ts'),
      ['export function add(a: number, b: number): number {', '  return a + b;', '}', ''].join(
        '\n',
      ),
    );

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  it('ignores excluded directories such as node_modules and dist', () => {
    dir = mkdtempSync(join(tmpdir(), 'sift-check-source-'));
    writeFileSync(join(dir, 'clean.ts'), 'export {};\n');

    const nested = join(dir, 'node_modules', 'some-pkg');
    // node_modules directory with a TODO inside must not be scanned.
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'vendored.js'), '// TODO: should never be flagged\n');

    const result = checkSource({ rootDir: dir });

    expect(result.ok).toBe(true);
  });
});
