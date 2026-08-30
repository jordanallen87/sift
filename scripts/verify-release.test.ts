import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runReleaseVerification } from './verify-release.js';
import type { VerificationReport } from './verify.js';

describe('runReleaseVerification', () => {
  let outDir: string | undefined;

  afterEach(() => {
    if (outDir) {
      rmSync(outDir, { recursive: true, force: true });
      outDir = undefined;
    }
  });

  it('writes a passed report when every stage succeeds, to release-latest not latest', async () => {
    outDir = mkdtempSync(join(tmpdir(), 'sift-verify-release-'));

    const report = await runReleaseVerification({
      outDir,
      runId: 'release-test-passing',
      now: () => new Date('2026-08-27T00:00:00.000Z'),
      resolveGitSha: () => 'deadbeef',
      stages: [
        { name: 'verify', command: process.execPath, args: ['-e', 'process.exit(0)'] },
        { name: 'test:mutation', command: process.execPath, args: ['-e', 'process.exit(0)'] },
      ],
    });

    expect(report.schemaVersion).toBe('1.0');
    expect(report.status).toBe('passed');
    expect(report.gitSha).toBe('deadbeef');
    expect(report.stages).toHaveLength(2);
    expect(report.stages.every((s) => s.status === 'passed')).toBe(true);

    const releaseLatestPath = join(outDir, 'release-latest', 'report.json');
    expect(existsSync(releaseLatestPath)).toBe(true);
    // The plain `latest/` path (owned by the nested real `pnpm verify`
    // stage's own report) must never be written by this script directly.
    expect(existsSync(join(outDir, 'latest', 'report.json'))).toBe(false);

    const runReportPath = join(outDir, 'release-test-passing', 'report.json');
    expect(existsSync(runReportPath)).toBe(true);
  });

  it('fails fast: a real stage failure skips every later stage', async () => {
    outDir = mkdtempSync(join(tmpdir(), 'sift-verify-release-'));

    const report = await runReleaseVerification({
      outDir,
      runId: 'release-test-failing',
      now: () => new Date('2026-08-27T00:00:00.000Z'),
      resolveGitSha: () => 'deadbeef',
      stages: [
        { name: 'verify', command: process.execPath, args: ['-e', 'process.exit(0)'] },
        {
          name: 'test:mutation',
          command: process.execPath,
          args: ['-e', 'console.error("mutation survivors"); process.exit(1)'],
        },
        { name: 'release:build', command: process.execPath, args: ['-e', 'process.exit(0)'] },
      ],
    });

    expect(report.status).toBe('failed');
    const mutationStage = report.stages.find((s) => s.stage === 'test:mutation');
    expect(mutationStage?.status).toBe('failed');
    const buildStage = report.stages.find((s) => s.stage === 'release:build');
    expect(buildStage?.status).toBe('skipped');
    expect(buildStage?.note).toMatch(/earlier stage/i);

    expect(report.failures).toHaveLength(1);
    const [failure] = report.failures;
    expect(failure?.stage).toBe('test:mutation');
    expect(failure?.message).toContain('mutation survivors');
    expect(failure?.fingerprint).toBeTruthy();

    const summaryPath = join(outDir, 'release-latest', 'summary.md');
    expect(existsSync(summaryPath)).toBe(true);
    expect(readFileSync(summaryPath, 'utf8')).toContain('test:mutation');
  });

  it('records an unavailable stage (e.g. Docker missing) as skipped, not failed, and does not fail-fast subsequent stages', async () => {
    outDir = mkdtempSync(join(tmpdir(), 'sift-verify-release-'));

    const report = await runReleaseVerification({
      outDir,
      runId: 'release-test-docker-skip',
      now: () => new Date('2026-08-27T00:00:00.000Z'),
      resolveGitSha: () => 'deadbeef',
      stages: [
        { name: 'verify', command: process.execPath, args: ['-e', 'process.exit(0)'] },
        {
          name: 'release:docker',
          command: 'docker',
          args: ['build', '-t', 'sift-release-check', '.'],
          isAvailable: () => false,
          unavailableNote: 'Docker is not available in this environment.',
        },
        { name: 'test:submission', command: process.execPath, args: ['-e', 'process.exit(0)'] },
      ],
    });

    expect(report.status).toBe('passed');
    const dockerStage = report.stages.find((s) => s.stage === 'release:docker');
    expect(dockerStage?.status).toBe('skipped');
    expect(dockerStage?.note).toBe('Docker is not available in this environment.');
    // The stage after the skip must still run for real (skip != fail-fast).
    const submissionStage = report.stages.find((s) => s.stage === 'test:submission');
    expect(submissionStage?.status).toBe('passed');
    expect(report.failures).toHaveLength(0);
  });

  it('fails the gate when an available Docker stage genuinely fails', async () => {
    outDir = mkdtempSync(join(tmpdir(), 'sift-verify-release-'));

    const report = await runReleaseVerification({
      outDir,
      runId: 'release-test-docker-fail',
      now: () => new Date('2026-08-27T00:00:00.000Z'),
      resolveGitSha: () => 'deadbeef',
      stages: [
        {
          name: 'release:docker',
          command: process.execPath,
          args: ['-e', 'console.error("no such Dockerfile"); process.exit(1)'],
          isAvailable: () => true,
        },
      ],
    });

    expect(report.status).toBe('failed');
    const dockerStage = report.stages.find((s) => s.stage === 'release:docker');
    expect(dockerStage?.status).toBe('failed');
    expect(report.failures[0]?.message).toContain('no such Dockerfile');
  });

  it('writes the same VerificationReport shape verify.ts uses', async () => {
    outDir = mkdtempSync(join(tmpdir(), 'sift-verify-release-'));

    await runReleaseVerification({
      outDir,
      runId: 'release-test-shape',
      now: () => new Date('2026-08-27T00:00:00.000Z'),
      resolveGitSha: () => null,
      stages: [{ name: 'verify', command: process.execPath, args: ['-e', 'process.exit(0)'] }],
    });

    const written = JSON.parse(
      readFileSync(join(outDir, 'release-latest', 'report.json'), 'utf8'),
    ) as VerificationReport;
    expect(written.schemaVersion).toBe('1.0');
    expect(written.gitSha).toBeNull();
    expect(Array.isArray(written.stages)).toBe(true);
    expect(Array.isArray(written.failures)).toBe(true);
  });
});
