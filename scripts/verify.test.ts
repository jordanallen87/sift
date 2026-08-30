import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runVerification, type VerificationReport } from './verify.js';

describe('runVerification', () => {
  let outDir: string | undefined;

  afterEach(() => {
    if (outDir) {
      rmSync(outDir, { recursive: true, force: true });
      outDir = undefined;
    }
  });

  it('writes a valid VerificationReport when a child stage fails, and skips (not silently passes) later stages', async () => {
    outDir = mkdtempSync(join(tmpdir(), 'sift-verify-'));

    const report = await runVerification({
      outDir,
      runId: 'test-run-failing',
      now: () => new Date('2026-08-27T00:00:00.000Z'),
      resolveGitSha: () => 'deadbeef',
      stages: [
        {
          name: 'format:check',
          kind: 'real',
          command: process.execPath,
          args: ['-e', 'process.exit(0)'],
        },
        {
          name: 'lint',
          kind: 'real',
          command: process.execPath,
          args: ['-e', 'console.error("boom: two problems"); process.exit(1)'],
        },
        {
          name: 'typecheck',
          kind: 'real',
          command: process.execPath,
          args: ['-e', 'process.exit(0)'],
        },
        { name: 'test:pack', kind: 'not-implemented' },
      ],
    });

    expect(report.schemaVersion).toBe('1.0');
    expect(report.runId).toBe('test-run-failing');
    expect(report.status).toBe('failed');
    expect(report.gitSha).toBe('deadbeef');
    expect(report.stages).toHaveLength(4);

    const formatStage = report.stages.find((stage) => stage.stage === 'format:check');
    expect(formatStage?.status).toBe('passed');

    const lintStage = report.stages.find((stage) => stage.stage === 'lint');
    expect(lintStage?.status).toBe('failed');

    // Fail-fast: a real stage declared after a failure must not silently run
    // or silently claim to have passed — it is honestly marked skipped.
    const typecheckStage = report.stages.find((stage) => stage.stage === 'typecheck');
    expect(typecheckStage?.status).toBe('skipped');
    expect(typecheckStage?.note).toMatch(/earlier stage/i);

    // A declared-but-not-yet-implemented stage is also skipped, never passed.
    const notImplementedStage = report.stages.find((stage) => stage.stage === 'test:pack');
    expect(notImplementedStage?.status).toBe('skipped');
    expect(notImplementedStage?.note).toMatch(/not yet implemented/i);

    expect(report.failures).toHaveLength(1);
    const [failure] = report.failures;
    expect(failure).toBeDefined();
    expect(failure?.stage).toBe('lint');
    expect(failure?.fingerprint).toBeTruthy();
    expect(failure?.focusedRerunCommand).toContain('lint');
    expect(failure?.message).toContain('boom: two problems');
    expect(failure?.artifactPaths.length).toBeGreaterThan(0);

    const latestReportPath = join(outDir, 'latest', 'report.json');
    expect(existsSync(latestReportPath)).toBe(true);
    const written = JSON.parse(readFileSync(latestReportPath, 'utf8')) as VerificationReport;
    expect(written.status).toBe('failed');
    expect(written.runId).toBe('test-run-failing');
    expect(written.stages).toHaveLength(4);

    const latestSummaryPath = join(outDir, 'latest', 'summary.md');
    expect(existsSync(latestSummaryPath)).toBe(true);
    expect(readFileSync(latestSummaryPath, 'utf8')).toContain('lint');

    const runReportPath = join(outDir, 'test-run-failing', 'report.json');
    expect(existsSync(runReportPath)).toBe(true);
  });

  it('writes a passed report with no summary.md when every real stage succeeds', async () => {
    outDir = mkdtempSync(join(tmpdir(), 'sift-verify-'));

    const report = await runVerification({
      outDir,
      runId: 'test-run-passing',
      now: () => new Date('2026-08-27T00:00:00.000Z'),
      resolveGitSha: () => null,
      stages: [
        {
          name: 'format:check',
          kind: 'real',
          command: process.execPath,
          args: ['-e', 'process.exit(0)'],
        },
        { name: 'test:pack', kind: 'not-implemented' },
      ],
    });

    expect(report.status).toBe('passed');
    expect(report.failures).toEqual([]);
    expect(report.gitSha).toBeNull();
    expect(report.stages.find((stage) => stage.stage === 'format:check')?.status).toBe('passed');
    expect(report.stages.find((stage) => stage.stage === 'test:pack')?.status).toBe('skipped');

    const latestReportPath = join(outDir, 'latest', 'report.json');
    expect(existsSync(latestReportPath)).toBe(true);

    const latestSummaryPath = join(outDir, 'latest', 'summary.md');
    expect(existsSync(latestSummaryPath)).toBe(false);
  });
});
