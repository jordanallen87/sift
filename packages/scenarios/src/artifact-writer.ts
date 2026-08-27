/**
 * `writeScenarioArtifacts`: writes the final snapshot, event log, normalized
 * trajectory, and assertion report for one scenario run to
 * `artifacts/verification/scenarios/<scenarioId>/` (docs/specs/testing.md
 * "Scenario tests": "The runner writes the final snapshot, event log,
 * normalized agent trajectory, and assertion report to
 * `artifacts/verification/scenarios/<scenarioId>/`.").
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaseEvent, CaseState } from '@pax/contracts';
import type { AssertionReport } from './assertions.js';
import type { ScenarioTrajectory } from './trajectory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// `packages/scenarios/src/artifact-writer.ts` -> repository root.
const DEFAULT_ARTIFACTS_ROOT = join(
  __dirname,
  '..',
  '..',
  '..',
  'artifacts',
  'verification',
  'scenarios',
);

export interface WriteScenarioArtifactsInput {
  readonly scenarioId: string;
  readonly finalCaseState: CaseState | undefined;
  readonly eventLog: readonly CaseEvent[];
  readonly trajectory: ScenarioTrajectory;
  readonly assertionReport: AssertionReport;
  /** Overrides the artifacts root directory. Defaults to the real `artifacts/verification/scenarios` at the repository root. Tests use this to write into a temporary directory. */
  readonly baseDir?: string;
}

export interface ScenarioArtifactPaths {
  readonly dir: string;
  readonly finalSnapshotPath: string;
  readonly eventLogPath: string;
  readonly trajectoryPath: string;
  readonly assertionReportPath: string;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * Writes the four required scenario artifacts for `input.scenarioId` and
 * returns their paths. Creates the target directory (and any missing
 * parents) if it does not already exist.
 */
export function writeScenarioArtifacts(input: WriteScenarioArtifactsInput): ScenarioArtifactPaths {
  const baseDir = input.baseDir ?? DEFAULT_ARTIFACTS_ROOT;
  const dir = join(baseDir, input.scenarioId);
  mkdirSync(dir, { recursive: true });

  const paths: ScenarioArtifactPaths = {
    dir,
    finalSnapshotPath: join(dir, 'final-snapshot.json'),
    eventLogPath: join(dir, 'event-log.json'),
    trajectoryPath: join(dir, 'trajectory.json'),
    assertionReportPath: join(dir, 'assertion-report.json'),
  };

  writeJson(paths.finalSnapshotPath, input.finalCaseState ?? null);
  writeJson(paths.eventLogPath, input.eventLog);
  writeJson(paths.trajectoryPath, input.trajectory);
  writeJson(paths.assertionReportPath, input.assertionReport);

  return paths;
}
