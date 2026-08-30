#!/usr/bin/env tsx
/**
 * Renders the canonical architecture diagram source (docs/architecture.mmd)
 * to the submission-ready export (docs/architecture.png) using
 * @mermaid-js/mermaid-cli (`mmdc`). Run via `pnpm docs:diagram`.
 *
 * docs/architecture.mmd is the source of truth — edit it, then rerun this
 * script. Never hand-edit docs/architecture.png.
 *
 * mermaid-cli renders through Puppeteer, which normally downloads its own
 * pinned Chrome build on install. This repo declines that download
 * (`pnpm-workspace.yaml` sets `allowBuilds.puppeteer: false`) so `pnpm
 * install` never triggers an uncontrolled binary fetch. Instead this script
 * looks for a Chrome-for-Testing/Chromium binary that another tool in this
 * environment already downloaded — Puppeteer's own cache, or Playwright's
 * (see docs/specs/testing.md's Playwright usage) — and points mermaid-cli at
 * it via a generated `puppeteer-config.json` (written to a temp directory,
 * not the repo tree). `PUPPETEER_EXECUTABLE_PATH` overrides the search
 * entirely.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  type Stats,
} from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = join(repoRoot, 'docs', 'architecture.mmd');
const outputPath = join(repoRoot, 'docs', 'architecture.png');
const MAX_BYTES = 35 * 1024 * 1024; // Devpost's 35 MiB architecture-diagram cap.

function findMmdcBinary(): string {
  const binName = platform() === 'win32' ? 'mmdc.cmd' : 'mmdc';
  const local = join(repoRoot, 'node_modules', '.bin', binName);
  if (existsSync(local)) return local;
  throw new Error(
    `Could not find ${binName} at ${local}. Run "pnpm add -D -w @mermaid-js/mermaid-cli" ` +
      `and "pnpm install" first.`,
  );
}

/** Bounded recursive search for files matching `isCandidate`, rooted at `root`. */
function findExecutables(
  root: string,
  maxDepth: number,
  isCandidate: (fullPath: string, stat: Stats) => boolean,
  results: string[] = [],
): string[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (maxDepth > 0) findExecutables(full, maxDepth - 1, isCandidate, results);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stat = statSync(full);
      if (isCandidate(full, stat)) results.push(full);
    } catch {
      // Unreadable file (permissions, broken symlink) — skip it.
    }
  }
  return results;
}

/**
 * Search Puppeteer's and Playwright's local browser caches for an already
 * downloaded Chrome-for-Testing/Chromium executable, so mermaid-cli never
 * needs to download its own copy. Puppeteer's own cache is checked first
 * because it is guaranteed to be the same major line mermaid-cli's bundled
 * Puppeteer expects; Playwright's cache is a fallback. Both searches are
 * bounded to a handful of known, versioned cache roots — never a scan of the
 * whole home directory.
 */
function findCachedChromeExecutable(): string | undefined {
  const home = homedir();
  const os = platform();
  const isMac = os === 'darwin';
  const isWindows = os === 'win32';

  const isCandidate = (fullPath: string, stat: Stats): boolean => {
    if (isMac) {
      // e.g. .../chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
      const name = fullPath.split('/').pop() ?? '';
      return (
        (name === 'Google Chrome for Testing' || name === 'Chromium') &&
        fullPath.includes('.app/Contents/MacOS/')
      );
    }
    if (isWindows) {
      return fullPath.toLowerCase().endsWith('chrome.exe');
    }
    // Linux
    const name = fullPath.split('/').pop() ?? '';
    return (name === 'chrome' || name === 'chrome-headless-shell') && Boolean(stat.mode & 0o111);
  };

  // Puppeteer's default cache dir is `~/.cache/puppeteer` on every platform
  // (see PUPPETEER_CACHE_DIR in Puppeteer's docs) unless overridden.
  const puppeteerCacheRoot = join(home, '.cache', 'puppeteer', 'chrome');
  const playwrightCacheRoot = isMac
    ? join(home, 'Library', 'Caches', 'ms-playwright')
    : isWindows
      ? join(home, 'AppData', 'Local', 'ms-playwright')
      : join(home, '.cache', 'ms-playwright');

  // Directory mtimes are not a reliable "newest build" signal (some caches
  // retain long-untouched legacy Chromium revision downloads that predate
  // the "Chrome for Testing" versioning and are not guaranteed to speak the
  // DevTools protocol version mermaid-cli's bundled Puppeteer expects). Ask
  // each candidate binary for its own version and prefer the highest one
  // that actually runs — this also filters out any broken/incompatible
  // binary before puppeteer ever tries to drive it.
  const versioned: { path: string; version: number[] }[] = [];
  for (const cacheRoot of [puppeteerCacheRoot, playwrightCacheRoot]) {
    for (const candidate of findExecutables(cacheRoot, 7, isCandidate)) {
      try {
        const output = execFileSync(candidate, ['--version'], {
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).toString();
        const match = /(\d+)\.(\d+)\.(\d+)\.(\d+)/.exec(output);
        if (match) {
          versioned.push({ path: candidate, version: match.slice(1, 5).map(Number) });
        }
      } catch {
        // Binary does not run on this machine (stale/incompatible download) — skip it.
      }
    }
    if (versioned.length > 0) break; // Prefer Puppeteer's own cache once it has any working build.
  }

  if (versioned.length === 0) return undefined;

  versioned.sort((a, b) => {
    for (let i = 0; i < 4; i += 1) {
      const av = a.version[i] ?? 0;
      const bv = b.version[i] ?? 0;
      if (av !== bv) return bv - av;
    }
    return 0;
  });
  return versioned[0]?.path;
}

function resolvePuppeteerConfigFile(): string | undefined {
  const explicit = process.env['PUPPETEER_EXECUTABLE_PATH'];
  const executablePath = explicit && existsSync(explicit) ? explicit : findCachedChromeExecutable();

  if (!executablePath) {
    console.warn(
      '[generate-diagram] No cached Chrome/Chromium executable found via PUPPETEER_EXECUTABLE_PATH, ' +
        "Puppeteer's cache (~/.cache/puppeteer), or Playwright's cache (~/Library/Caches/ms-playwright " +
        'or ~/.cache/ms-playwright). Falling back to mermaid-cli/Puppeteer default resolution, which may ' +
        'attempt a network download.',
    );
    return undefined;
  }

  console.log(`[generate-diagram] Using cached Chrome executable: ${executablePath}`);
  const configDir = mkdtempSync(join(tmpdir(), 'sift-mmdc-'));
  const configPath = join(configDir, 'puppeteer-config.json');
  writeFileSync(
    configPath,
    JSON.stringify({ executablePath, args: ['--no-sandbox', '--disable-gpu'] }, null, 2),
  );
  return configPath;
}

function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return `${mib.toFixed(2)} MiB (${bytes.toLocaleString()} bytes)`;
}

/**
 * mermaid@11.17.2 (bundled by @mermaid-js/mermaid-cli@11.16.0) fails to
 * parse a `%%` comment line with no trailing content — the parser reports
 * a bogus "Parse error on line 1" pointing at the diagram-type keyword
 * merged onto the same line as the comments. A comment line with any
 * trailing character (even a lone `-` divider) parses fine. Guard against
 * silently reintroducing this while editing docs/architecture.mmd.
 */
function assertNoBareCommentLines(source: string): void {
  const offendingLine = source.split('\n').findIndex((line) => /^%%\s*$/.test(line));
  if (offendingLine !== -1) {
    throw new Error(
      `docs/architecture.mmd line ${offendingLine + 1} is a bare "%%" comment with no ` +
        'trailing content. This mermaid-cli/mermaid version fails to parse that (it merges ' +
        'the comment block into the next statement). Add trailing content to the comment ' +
        '(e.g. a "---" divider) instead of leaving it empty.',
    );
  }
}

function main(): void {
  if (!existsSync(inputPath)) {
    throw new Error(`Diagram source not found: ${inputPath}`);
  }
  assertNoBareCommentLines(readFileSync(inputPath, 'utf8'));

  const mmdc = findMmdcBinary();
  const puppeteerConfigFile = resolvePuppeteerConfigFile();

  const args = [
    '-i',
    inputPath,
    '-o',
    outputPath,
    '-b',
    'white',
    '-w',
    '2200',
    '-H',
    '1700',
    '-s',
    '2',
  ];
  if (puppeteerConfigFile) {
    args.push('-p', puppeteerConfigFile);
  }

  console.log(`[generate-diagram] Running: ${mmdc} ${args.join(' ')}`);
  execFileSync(mmdc, args, { stdio: 'inherit', cwd: repoRoot });

  if (!existsSync(outputPath)) {
    throw new Error(`mmdc reported success but ${outputPath} does not exist.`);
  }

  const { size } = statSync(outputPath);
  console.log(`[generate-diagram] Wrote ${outputPath} — ${formatBytes(size)}`);

  if (size > MAX_BYTES) {
    throw new Error(
      `${outputPath} is ${formatBytes(size)}, which exceeds the Devpost architecture-diagram ` +
        `limit of 35 MiB. Reduce scale/width in scripts/generate-diagram.ts or simplify the diagram.`,
    );
  }

  console.log('[generate-diagram] docs/architecture.png is within the 35 MiB Devpost limit.');
}

main();
