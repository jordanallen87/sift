import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validCatalog, validManifest } from '@pax/packs/src/fixtures/manifest.js';
import { packScaffold } from './scaffold.js';
import { packTest } from './test.js';
import type { AuthoringScenarioFile } from './scenario-coverage.js';

const FIXED_CLOCK = { now: () => '2026-08-27T00:00:00.000Z' };

let draftRoot: string;

beforeEach(() => {
  draftRoot = mkdtempSync(join(tmpdir(), 'pax-authoring-test-'));
});

afterEach(() => {
  rmSync(draftRoot, { recursive: true, force: true });
});

function scenarioFile(overrides: Partial<AuthoringScenarioFile> = {}): AuthoringScenarioFile {
  return {
    id: 'apt-success',
    packId: 'apartment-hunt',
    kind: 'success',
    description: 'x',
    steps: [],
    assertions: [],
    ...overrides,
  };
}

function scaffoldFullDraft(scenarios: AuthoringScenarioFile[]): void {
  const manifest = validManifest({
    evaluation: { scenarioIds: scenarios.map((s) => s.id), requiresNegativeCase: true },
  });
  packScaffold(draftRoot, {
    draftId: 'apartment-hunt',
    files: [
      { relativePath: 'pack.json', content: JSON.stringify(manifest) },
      ...scenarios.map((scenario) => ({
        relativePath: `scenarios/${scenario.id}.json`,
        content: JSON.stringify(scenario),
      })),
    ],
  });
}

describe('packTest', () => {
  it('fails when the draft has not been validated (invalid manifest)', () => {
    packScaffold(draftRoot, {
      draftId: 'broken',
      files: [{ relativePath: 'pack.json', content: '{"schemaVersion":"1.0"}' }],
    });
    const result = packTest(draftRoot, validCatalog(), FIXED_CLOCK, { draftId: 'broken' });
    expect(result.ok).toBe(false);
    expect(result.validation.ok).toBe(false);
    expect(result.conformance).toBeUndefined();
  });

  it('fails when a declared scenarioId has no matching scenario file', () => {
    // validManifest()'s default evaluation.scenarioIds is non-empty but no scenario files exist.
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [{ relativePath: 'pack.json', content: JSON.stringify(validManifest()) }],
    });
    const result = packTest(draftRoot, validCatalog(), FIXED_CLOCK, { draftId: 'apartment-hunt' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('has no file at'))).toBe(true);
  });

  it('fails when scenario coverage is missing required kinds (only a success scenario present)', () => {
    scaffoldFullDraft([scenarioFile()]);
    const result = packTest(draftRoot, validCatalog(), FIXED_CLOCK, { draftId: 'apartment-hunt' });
    expect(result.ok).toBe(false);
    expect(result.scenarioCoverage.ok).toBe(false);
    expect(result.conformance?.passed).toBe(true); // conformance itself still passes independently
  });

  it('passes when the manifest compiles, conformance passes, and all four scenario kinds are present', () => {
    scaffoldFullDraft([
      scenarioFile({ id: 'apt-success', kind: 'success' }),
      scenarioFile({ id: 'apt-incomplete', kind: 'incomplete_evidence' }),
      scenarioFile({ id: 'apt-steering', kind: 'steering' }),
      scenarioFile({ id: 'apt-boundary', kind: 'human_boundary' }),
    ]);
    const result = packTest(draftRoot, validCatalog(), FIXED_CLOCK, { draftId: 'apartment-hunt' });
    expect(result.ok).toBe(true);
    expect(result.conformance?.passed).toBe(true);
    expect(result.scenarioCoverage.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports a scenario file whose declared id does not match its filename', () => {
    const manifest = validManifest({
      evaluation: { scenarioIds: ['apt-success'], requiresNegativeCase: true },
    });
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [
        { relativePath: 'pack.json', content: JSON.stringify(manifest) },
        {
          relativePath: 'scenarios/apt-success.json',
          content: JSON.stringify(scenarioFile({ id: 'a-different-id' })),
        },
      ],
    });
    const result = packTest(draftRoot, validCatalog(), FIXED_CLOCK, { draftId: 'apartment-hunt' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('does not match its filename'))).toBe(true);
  });
});
