#!/usr/bin/env tsx
/**
 * Top-level verification orchestrator (docs/specs/testing.md "Commands and
 * gates" / "Failure artifacts"). `pnpm verify` runs this.
 *
 * It runs a defined, ordered list of stages, fails fast on the first real
 * stage failure, and ALWAYS writes a machine-readable VerificationReport to
 * `artifacts/verification/<runId>/report.json` and
 * `artifacts/verification/latest/report.json` — even when an early stage
 * fails. `summary.md` is written alongside the report only when the run
 * failed.
 *
 * `format:check`, `lint`, `typecheck`, `test:unit`, `test:scenario`, and
 * `test:e2e` are wired for real. The remaining stages in `pnpm verify`'s
 * eventual composition (`test:pack`, `test:integration`, `test:contract` —
 * see testing.md) are declared here as `not-implemented` so the report
 * stays honest about what actually ran versus what is still stubbed; later
 * tasks flip each to `kind: 'real'` as they land.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type StageStatus = 'passed' | 'failed' | 'skipped';

export interface StageDefinition {
  /** Stage name. For a real stage this is also its `pnpm run <name>` script name. */
  name: string;
  kind: 'real' | 'not-implemented';
  /** Required when kind === 'real'. Defaults to `pnpm` with `['run', name]`. */
  command?: string;
  args?: string[];
}

export interface VerificationStageResult {
  stage: string;
  command: string;
  status: StageStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number | null;
  note?: string;
  logPath?: string;
}

export interface VerificationFailure {
  fingerprint: string;
  stage: string;
  testFile?: string;
  testName?: string;
  message: string;
  relatedRequirements: string[];
  artifactPaths: string[];
  focusedRerunCommand: string;
}

export interface VerificationReport {
  schemaVersion: '1.0';
  runId: string;
  startedAt: string;
  finishedAt: string;
  gitSha: string | null;
  status: 'passed' | 'failed';
  stages: VerificationStageResult[];
  failures: VerificationFailure[];
}

export interface RunVerificationOptions {
  cwd?: string;
  outDir?: string;
  stages?: StageDefinition[];
  runId?: string;
  now?: () => Date;
  resolveGitSha?: () => string | null;
}

/**
 * The real `pnpm verify` composition per docs/specs/testing.md. `test:pack`/
 * `test:integration` are real, named subsets of the same test files
 * `test:unit` already runs in full (`vitest run` with explicit path
 * arguments, filtered against the one root `test.projects` set) -- the same
 * relationship `test:scenario` already has to `test:unit` (the `tests`
 * project's scenario test is also picked up by a full unscoped
 * `test:unit` run). This is deliberate, not redundant: testing.md's
 * "Commands and gates" table names these as distinct, semantically-labeled
 * release-gate signals for CI/review, not a disjoint partition of the
 * suite. `test:contract` remains declared until its own task lands.
 */
export const DEFAULT_STAGES: StageDefinition[] = [
  { name: 'format:check', kind: 'real' },
  { name: 'lint', kind: 'real' },
  { name: 'typecheck', kind: 'real' },
  { name: 'test:unit', kind: 'real' },
  { name: 'test:pack', kind: 'real' },
  { name: 'test:integration', kind: 'real' },
  { name: 'test:contract', kind: 'not-implemented' },
  { name: 'test:scenario', kind: 'real' },
  { name: 'test:e2e', kind: 'real' },
];

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

/**
 * The reproducible, human-facing command for a stage. Always the real
 * `pnpm run <name>` invocation — even when a test injects a stand-in
 * `command`/`args` pair to run in place of the real script, the rerun
 * command reported to a human or to Claude Code must be the one that
 * actually reproduces the real stage.
 */
function focusedRerunCommand(stage: StageDefinition): string {
  return `pnpm run ${stage.name}`;
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

export async function runVerification(
  options: RunVerificationOptions = {},
): Promise<VerificationReport> {
  const cwd = options.cwd ?? process.cwd();
  const outDir = resolve(options.outDir ?? join(cwd, 'artifacts', 'verification'));
  const stages = options.stages ?? DEFAULT_STAGES;
  const runId =
    options.runId ??
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
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

    // A declared-but-not-yet-implemented stage is reported as such
    // regardless of fail-fast state: that is the true, primary reason it
    // did not run, independent of whether an earlier real stage failed.
    if (stage.kind === 'not-implemented') {
      stageResults.push({
        stage: stage.name,
        command: focusedRerunCommand(stage),
        status: 'skipped',
        startedAt: stageStartedAt,
        finishedAt: stageStartedAt,
        durationMs: 0,
        exitCode: null,
        note: 'Declared, not yet implemented. Not silently reported as passed — see docs/superpowers/plans/2026-08-26-pax-hackathon-build.md.',
      });
      continue;
    }

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

    const command = stage.command ?? 'pnpm';
    const args = stage.args ?? ['run', stage.name];
    const startMs = Date.now();

    const result = await runCommand(command, args, cwd);

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

  writeReport(report, runDir, join(outDir, 'latest'));

  return report;
}

function renderSummaryMarkdown(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push(`# Pax verification report — ${report.status.toUpperCase()}`);
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
  console.log(`\n[pax] verify: ${report.status.toUpperCase()} (run ${report.runId})`);
  for (const stage of report.stages) {
    const marker = stage.status === 'passed' ? 'PASS' : stage.status === 'failed' ? 'FAIL' : 'SKIP';
    console.log(`  [${marker}] ${stage.stage}${stage.note ? ` — ${stage.note}` : ''}`);
  }
  if (report.failures.length > 0) {
    console.log('\n[pax] Failures:');
    for (const failure of report.failures) {
      console.log(
        `  - ${failure.stage} (${failure.fingerprint}): rerun with \`${failure.focusedRerunCommand}\``,
      );
    }
  }
  console.log(`\n[pax] Report: artifacts/verification/latest/report.json`);
}

function isMain(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const report = await runVerification();
  printConsoleSummary(report);
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
