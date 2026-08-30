import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeScenarioArtifacts } from './artifact-writer.js';
import { emptyScenarioTrajectory } from './trajectory.js';
import { checkAssertions } from './assertions.js';

let dir: string | undefined;
afterEach(() => {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});
function tempDir(): string {
  dir = mkdtempSync(join(tmpdir(), 'sift-scenario-artifacts-'));
  return dir;
}

describe('writeScenarioArtifacts', () => {
  it('writes final snapshot, event log, trajectory, and assertion report as JSON files', () => {
    const baseDir = tempDir();
    const trajectory = emptyScenarioTrajectory();
    const assertionReport = checkAssertions(trajectory, []);

    const paths = writeScenarioArtifacts({
      scenarioId: 'car-purchase',
      finalCaseState: undefined,
      eventLog: [],
      trajectory,
      assertionReport,
      baseDir,
    });

    expect(paths.dir).toBe(join(baseDir, 'car-purchase'));
    for (const path of [
      paths.finalSnapshotPath,
      paths.eventLogPath,
      paths.trajectoryPath,
      paths.assertionReportPath,
    ]) {
      expect(existsSync(path)).toBe(true);
    }

    const parsedReport = JSON.parse(readFileSync(paths.assertionReportPath, 'utf8')) as {
      passed: boolean;
    };
    expect(parsedReport.passed).toBe(true);
  });

  it('creates missing parent directories', () => {
    const baseDir = join(tempDir(), 'nested', 'dirs');
    const trajectory = emptyScenarioTrajectory();
    const paths = writeScenarioArtifacts({
      scenarioId: 'car-purchase',
      finalCaseState: undefined,
      eventLog: [],
      trajectory,
      assertionReport: checkAssertions(trajectory, []),
      baseDir,
    });
    expect(existsSync(paths.dir)).toBe(true);
  });
});
