#!/usr/bin/env tsx
/**
 * Source-integrity guard (docs/specs/testing.md "Static verification" ->
 * "Search gate"). Scans tracked source files for:
 *
 *  - unfinished-work markers (TODO/FIXME/XXX);
 *  - exclusive or skipped test modifiers (`.only(`, `.skip(`, `xdescribe`,
 *    `xit`, `xtest`, ...);
 *  - likely secrets: AWS-shaped access key IDs, credential-named
 *    assignments with a non-placeholder value, and standalone high-entropy
 *    tokens.
 *
 * `checkSource` is the testable core (scripts/check-source.test.ts). The CLI
 * entry point below runs it against the real repository and exits non-zero
 * with a readable report when it finds anything; `pnpm verify` (scripts/verify.ts)
 * runs this as part of the `format:check`/static stage set.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SourceFindingRule =
  'unfinished-marker' | 'exclusive-or-skipped-test' | 'possible-secret';

export interface SourceFinding {
  filePath: string;
  line: number;
  rule: SourceFindingRule;
  message: string;
  excerpt: string;
}

export interface CheckSourceResult {
  ok: boolean;
  filesScanned: number;
  findings: SourceFinding[];
}

export interface CheckSourceOptions {
  rootDir: string;
  /** Paths (relative to rootDir) never scanned. Defaults to this guard's own source. */
  selfExcludePaths?: string[];
}

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'artifacts',
  '.pax-data',
  '.stryker-tmp',
  'playwright-report',
  'test-results',
  'reports',
  '.strata19',
  '.vscode',
  '.idea',
  '.pnpm-store',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

const DEFAULT_SELF_EXCLUDE = ['scripts/check-source.ts', 'scripts/check-source.test.ts'];

const UNFINISHED_MARKER = /\b(TODO|FIXME|XXX)\b/;
const EXCLUSIVE_OR_SKIPPED_TEST = /\.(only|skip)\s*\(|\bx(?:describe|it|test)\s*\(/;
const AWS_ACCESS_KEY_ID = /\bAKIA[0-9A-Z]{16}\b/;
const CREDENTIAL_IDENTIFIER = /SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY/;
const CREDENTIAL_ASSIGNMENT =
  /\b([A-Z][A-Z0-9_]{2,})\s*[:=]\s*(?:(['"])((?:(?!\2)[^\n])+)\2|([^\s'"#]{8,}))/;
const PLACEHOLDER_VALUE =
  /^(your[-_ ]?|change[-_]?me|example|placeholder|xxx+|\*+|<.*>|\$\{.*\}|process\.env|undefined$|null$|redacted|fake|dummy|sample|test[-_]?key)/i;
// Deliberately excludes `/`: bare text (comments, prose) commonly contains
// doc/URL paths like `docs/superpowers/plans/2026-...-build.md`, and `/` lets
// those slash-joined segments look like one long high-entropy token. `/` is
// still allowed inside quoted string literals via STRING_LITERAL below,
// where a real base64-with-slashes secret would actually appear.
const HIGH_ENTROPY_TOKEN = /[A-Za-z0-9+_=-]{40,}/g;
// Only real `'`/`"` string literals, not backticks: this codebase's
// comments routinely wrap file paths and commands in backtick inline-code
// (Markdown style), which are not secret-shaped string values.
const STRING_LITERAL = /(['"])((?:(?!\1)[^\n\\]|\\.)*)\1/g;
const SECRET_SHAPED = /^[A-Za-z0-9+/_=-]+$/;
const HIGH_ENTROPY_THRESHOLD = 4.0;

function isScannablePath(filePath: string): boolean {
  if (SOURCE_EXTENSIONS.has(extname(filePath))) return true;
  return basename(filePath).startsWith('.env');
}

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...listFiles(fullPath));
    } else if (entry.isFile() && isScannablePath(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function redactExcerpt(line: string): string {
  const masked = line
    .replace(
      /(['"])([^'"\n]{4,})\1/g,
      (_match, quote: string) => `${quote}${'*'.repeat(8)}${quote}`,
    )
    .replace(AWS_ACCESS_KEY_ID, 'AKIA****************')
    .trim();
  return masked.slice(0, 160);
}

function scanUnfinishedMarker(line: string): Pick<SourceFinding, 'message' | 'excerpt'> | null {
  const match = UNFINISHED_MARKER.exec(line);
  if (!match) return null;
  return {
    message: `Unfinished-work marker "${match[1]}" found`,
    excerpt: line.trim().slice(0, 160),
  };
}

function scanExclusiveOrSkippedTest(
  line: string,
): Pick<SourceFinding, 'message' | 'excerpt'> | null {
  if (!EXCLUSIVE_OR_SKIPPED_TEST.test(line)) return null;
  return {
    message: 'Exclusive or skipped test modifier found (.only/.skip/x-prefixed)',
    excerpt: line.trim().slice(0, 160),
  };
}

function scanPossibleSecret(line: string): Pick<SourceFinding, 'message' | 'excerpt'> | null {
  if (AWS_ACCESS_KEY_ID.test(line)) {
    return { message: 'Value matches the AWS access key ID shape', excerpt: redactExcerpt(line) };
  }

  const credentialMatch = CREDENTIAL_ASSIGNMENT.exec(line);
  if (credentialMatch) {
    const identifier = credentialMatch[1] ?? '';
    const value = credentialMatch[3] ?? credentialMatch[4] ?? '';
    if (
      CREDENTIAL_IDENTIFIER.test(identifier) &&
      value.length >= 8 &&
      !PLACEHOLDER_VALUE.test(value)
    ) {
      return {
        message: `Credential-looking assignment to "${identifier}"`,
        excerpt: redactExcerpt(line),
      };
    }
  }

  const bareTokens = line.match(HIGH_ENTROPY_TOKEN) ?? [];
  const quotedTokens: string[] = [];
  for (const match of line.matchAll(STRING_LITERAL)) {
    const value = match[2] ?? '';
    if (value.length >= 32 && SECRET_SHAPED.test(value)) quotedTokens.push(value);
  }

  for (const token of [...bareTokens, ...quotedTokens]) {
    if (/^[0-9a-f]+$/i.test(token)) continue; // pure hex: treat as a hash/ID, not a secret.
    if (shannonEntropy(token) > HIGH_ENTROPY_THRESHOLD) {
      return { message: 'High-entropy token resembling a secret', excerpt: redactExcerpt(line) };
    }
  }

  return null;
}

function scanFile(relPath: string, content: string): SourceFinding[] {
  const findings: SourceFinding[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    const marker = scanUnfinishedMarker(line);
    if (marker)
      findings.push({ filePath: relPath, line: lineNumber, rule: 'unfinished-marker', ...marker });

    const exclusive = scanExclusiveOrSkippedTest(line);
    if (exclusive) {
      findings.push({
        filePath: relPath,
        line: lineNumber,
        rule: 'exclusive-or-skipped-test',
        ...exclusive,
      });
    }

    const secret = scanPossibleSecret(line);
    if (secret)
      findings.push({ filePath: relPath, line: lineNumber, rule: 'possible-secret', ...secret });
  });

  return findings;
}

export function checkSource(options: CheckSourceOptions): CheckSourceResult {
  const rootDir = resolve(options.rootDir);
  const selfExcluded = new Set(
    (options.selfExcludePaths ?? DEFAULT_SELF_EXCLUDE).map((path) => resolve(rootDir, path)),
  );

  const findings: SourceFinding[] = [];
  let filesScanned = 0;

  for (const filePath of listFiles(rootDir)) {
    if (selfExcluded.has(filePath)) continue;
    filesScanned += 1;
    const relPath = relative(rootDir, filePath);
    const content = readFileSync(filePath, 'utf8');
    findings.push(...scanFile(relPath, content));
  }

  return { ok: findings.length === 0, filesScanned, findings };
}

function printReport(result: CheckSourceResult): void {
  if (result.ok) {
    console.log(`[pax] check:source: clean (${result.filesScanned} files scanned).`);
    return;
  }

  console.error(
    `[pax] check:source: found ${result.findings.length} issue(s) across ${result.filesScanned} scanned files.\n`,
  );
  for (const finding of result.findings) {
    console.error(`  ${finding.filePath}:${finding.line}  [${finding.rule}]  ${finding.message}`);
    console.error(`    ${finding.excerpt}`);
  }
  console.error(
    '\nRepair the causal defect (finish the work, unfocus/unskip the test, or remove the secret).',
  );
  console.error('Never delete or weaken this scanner to make it pass — see CLAUDE.md.');
}

function isMain(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const result = checkSource({ rootDir: process.cwd() });
  printReport(result);
  process.exit(result.ok ? 0 : 1);
}
