#!/usr/bin/env tsx
/**
 * `pnpm verify:release` (docs/specs/testing.md "Commands and gates": "verify
 * + mutation + build + Docker contract + submission checks").
 *
 * This composes on top of `scripts/verify.ts`'s real, already-working
 * infrastructure and reporting discipline (the same `VerificationReport`
 * shape, the same fail-fast/skip semantics, the same
 * `artifacts/verification/**` artifact-writing convention) rather than
 * inventing a parallel one — it reuses `verify.ts`'s exported types
 * directly. It deliberately does NOT import or call `runVerification` (the
 * function) in-process, for two reasons:
 *
 *  1. `pnpm verify` must remain runnable and reportable as its own real
 *     black-box command exactly the way every other stage here is (`pnpm
 *     test:mutation`, `pnpm test:submission`) — running it as a real child
 *     process is what actually re-executes and re-writes the canonical
 *     `artifacts/verification/latest/report.json` that `test:submission`'s
 *     `release-verification-sha` check reads, proving the two scripts are
 *     genuinely composed rather than one silently reimplementing the other.
 *  2. The Docker stage needs a dynamic "is the tool even installed"
 *     pre-check with an honest skip-not-fail outcome
 *     (CLAUDE.md/this task: "check if docker is available ... report an
 *     honest skip with reason if not, don't fail the whole gate over an
 *     environment limitation, but don't silently pass either"). `verify.ts`'s
 *     `StageDefinition.kind` is a static `'real' | 'not-implemented'`
 *     decided ahead of time by the caller, not a runtime probe — so this
 *     script implements its own minimal stage runner (same shape, same
 *     fail-fast/skip discipline as `verify.ts`'s) rather than editing
 *     `verify.ts` itself, which stays untouched here.
 *
 * Composed stages, in the exact order this task specifies: `pnpm verify`,
 * `pnpm test:mutation` (invoked purely as an external command by its
 * package.json script name — a concurrent task owns its real
 * implementation and `stryker.config.mjs`; this script never depends on
 * its internals), a production build check (`pnpm --filter @sift/web
 * build`; `pnpm --filter @sift/agent typecheck` is intentionally NOT
 * re-run as a separate stage here because the composed `pnpm verify` stage
 * immediately before this one already runs the root `typecheck` script,
 * which recursively runs every workspace package's own `typecheck`
 * — including `@sift/agent`'s — via `pnpm -r --if-present run typecheck`;
 * re-running it here would be redundant, not "or equivalent" as the spec
 * allows), a Docker build contract check (`docker build -t
 * sift-release-check .`, skipped with an honest reason if `docker` is not
 * installed), and `pnpm test:submission`.
 *
 * Writes its own report to `artifacts/verification/release-<runId>/report.json`
 * and `artifacts/verification/release-latest/report.json` (plus
 * `summary.md` on failure) — deliberately NOT to the plain `.../latest/`
 * path, which stays reserved for the nested `pnpm verify` stage's own
 * report (see reason 1 above; overwriting it here would make
 * `test:submission`'s SHA check compare against the wrong report).
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VerificationFailure, VerificationReport, VerificationStageResult } from './verify.js';

export interface ReleaseStageSpec {
  name: string;
  command: string;
  args: string[];
  /** When provided and returns false, the stage is recorded 'skipped' with `unavailableNote` instead of being run — an honest environment-limitation skip, not a failure. */
  isAvailable?: () => boolean;
  unavailableNote?: string;
}

function isDockerAvailable(): boolean {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_RELEASE_STAGES: ReleaseStageSpec[] = [
  { name: 'verify', command: 'pnpm', args: ['run', 'verify'] },
  { name: 'test:mutation', command: 'pnpm', args: ['run', 'test:mutation'] },
  { name: 'release:build', command: 'pnpm', args: ['--filter', '@sift/web', 'build'] },
  {
    name: 'release:docker',
    command: 'docker',
    args: ['build', '-t', 'sift-release-check', '.'],
    isAvailable: isDockerAvailable,
    unavailableNote:
      'Docker is not available in this environment (`docker` command not found or not runnable). ' +
      'Skipped, not silently passed — install Docker to exercise this stage.',
  },
  { name: 'test:submission', command: 'pnpm', args: ['run', 'test:submission'] },
];

export interface RunReleaseVerificationOptions {
  cwd?: string;
  outDir?: string;
  stages?: ReleaseStageSpec[];
  runId?: string;
  now?: () => Date;
  resolveGitSha?: () => string | null;
}

function defaultGitSha(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n… [truncated]` : value;
}

function fingerprint(stage: string, message: string): string {
  return createHash('sha256').update(`${stage}\0${message}`).digest('hex').slice(0, 16);
}

function focusedRerunCommand(stage: ReleaseStageSpec): string {
  return `${stage.command} ${stage.args.join(' ')}`;
}

interface CommandOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorMessage: string | null;
}

function runCommand(command: string, args: string[], cwd: string): Promise<CommandOutcome> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      resolvePromise({ exitCode: null, stdout, stderr, errorMessage: error.message });
    });

    child.on('close', (exitCode) => {
      resolvePromise({ exitCode, stdout, stderr, errorMessage: null });
    });
  });
}

/**
 * Runs the composed release-gate stages and always writes a
 * `VerificationReport`-shaped report — reusing `verify.ts`'s exact schema —
 * even when an early stage fails. Fail-fast: the first genuine stage
 * *failure* skips every later stage; an honest environment-unavailable
 * *skip* (Docker missing) does not fail-fast and does not count as a
 * failure.
 */
export async function runReleaseVerification(
  options: RunReleaseVerificationOptions = {},
): Promise<VerificationReport> {
  const cwd = options.cwd ?? process.cwd();
  const outDir = resolve(options.outDir ?? join(cwd, 'artifacts', 'verification'));
  const stages = options.stages ?? DEFAULT_RELEASE_STAGES;
  const runId =
    options.runId ??
    `release-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const now = options.now ?? (() => new Date());
  const resolveGitSha = options.resolveGitSha ?? (() => defaultGitSha(cwd));

  const runDir = join(outDir, runId);
  const logsDir = join(runDir, 'logs');
  mkdirSync(logsDir, { recursive: true });

  const startedAt = now().toISOString();
  const stageResults: VerificationStageResult[] = [];
  const failures: VerificationFailure[] = [];
  let fastFailed = false;

  for (const stage of stages) {
    const stageStartedAt = now().toISOString();

    if (fastFailed) {
      stageResults.push({
        stage: stage.name,
        command: focusedRerunCommand(stage),
        status: 'skipped',
        startedAt: stageStartedAt,
        finishedAt: stageStartedAt,
        durationMs: 0,
        exitCode: null,
        note: 'Not run: an earlier stage failed (fail-fast).',
      });
      continue;
    }

    if (stage.isAvailable && !stage.isAvailable()) {
      stageResults.push({
        stage: stage.name,
        command: focusedRerunCommand(stage),
        status: 'skipped',
        startedAt: stageStartedAt,
        finishedAt: stageStartedAt,
        durationMs: 0,
        exitCode: null,
        note:
          stage.unavailableNote ?? 'Not run: this stage is unavailable in the current environment.',
      });
      continue;
    }

    const startMs = Date.now();
    const result = await runCommand(stage.command, stage.args, cwd);
    const durationMs = Date.now() - startMs;
    const stageFinishedAt = now().toISOString();
    const exitCode = result.exitCode;
    const passed = exitCode === 0 && !result.errorMessage;

    const combinedOutput = [result.stdout, result.stderr, result.errorMessage ?? '']
      .filter(Boolean)
      .join('\n');

    const logPath = join(logsDir, `${stage.name.replace(/[^a-z0-9:_-]/gi, '_')}.log`);
    writeFileSync(logPath, combinedOutput || '(no output)\n', 'utf8');

    stageResults.push({
      stage: stage.name,
      command: focusedRerunCommand(stage),
      status: passed ? 'passed' : 'failed',
      startedAt: stageStartedAt,
      finishedAt: stageFinishedAt,
      durationMs,
      exitCode: exitCode ?? null,
      logPath,
    });

    if (!passed) {
      fastFailed = true;
      const message = truncate(
        combinedOutput.trim() || `Stage "${stage.name}" exited with code ${String(exitCode)}`,
        4000,
      );
      failures.push({
        fingerprint: fingerprint(stage.name, message),
        stage: stage.name,
        message,
        relatedRequirements: [],
        artifactPaths: [logPath],
        focusedRerunCommand: focusedRerunCommand(stage),
      });
    }
  }

  const finishedAt = now().toISOString();
  const status: VerificationReport['status'] = failures.length === 0 ? 'passed' : 'failed';

  const report: VerificationReport = {
    schemaVersion: '1.0',
    runId,
    startedAt,
    finishedAt,
    gitSha: resolveGitSha(),
    status,
    stages: stageResults,
    failures,
  };

  writeReport(report, runDir, join(outDir, 'release-latest'));

  return report;
}

function renderSummaryMarkdown(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push(`# Sift verify:release report — ${report.status.toUpperCase()}`);
  lines.push('');
  lines.push(`- Run ID: \`${report.runId}\``);
  lines.push(`- Git SHA: \`${report.gitSha ?? 'unknown'}\``);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push('');
  lines.push('## Stages');
  lines.push('');
  lines.push('| Stage | Status | Command |');
  lines.push('| --- | --- | --- |');
  for (const stage of report.stages) {
    lines.push(`| ${stage.stage} | ${stage.status} | \`${stage.command}\` |`);
  }
  if (report.failures.length > 0) {
    lines.push('');
    lines.push('## Failures');
    lines.push('');
    for (const failure of report.failures) {
      lines.push(`### ${failure.stage} (\`${failure.fingerprint}\`)`);
      lines.push('');
      lines.push(`Rerun: \`${failure.focusedRerunCommand}\``);
      lines.push('');
      lines.push('```');
      lines.push(failure.message);
      lines.push('```');
      lines.push('');
    }
  }
  return lines.join('\n');
}

function writeReport(report: VerificationReport, runDir: string, latestDir: string): void {
  mkdirSync(runDir, { recursive: true });
  if (existsSync(latestDir)) rmSync(latestDir, { recursive: true, force: true });
  mkdirSync(latestDir, { recursive: true });

  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(join(runDir, 'report.json'), json, 'utf8');
  writeFileSync(join(latestDir, 'report.json'), json, 'utf8');

  if (report.status === 'failed') {
    const summary = renderSummaryMarkdown(report);
    writeFileSync(join(runDir, 'summary.md'), summary, 'utf8');
    writeFileSync(join(latestDir, 'summary.md'), summary, 'utf8');
  }
}

function printConsoleSummary(report: VerificationReport): void {
  console.log(`\n[sift] verify:release: ${report.status.toUpperCase()} (run ${report.runId})`);
  for (const stage of report.stages) {
    const marker = stage.status === 'passed' ? 'PASS' : stage.status === 'failed' ? 'FAIL' : 'SKIP';
    console.log(`  [${marker}] ${stage.stage}${stage.note ? ` — ${stage.note}` : ''}`);
  }
  if (report.failures.length > 0) {
    console.log('\n[sift] Failures:');
    for (const failure of report.failures) {
      console.log(
        `  - ${failure.stage} (${failure.fingerprint}): rerun with \`${failure.focusedRerunCommand}\``,
      );
    }
  }
  console.log(`\n[sift] Report: artifacts/verification/release-latest/report.json`);
}

function isMain(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const report = await runReleaseVerification();
  printConsoleSummary(report);
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
