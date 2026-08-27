/**
 * `pack_test`: "run deterministic conformance and scenario tests"
 * (docs/specs/pack-authoring.md). A thin, bounded wrapper around the real,
 * already-built `runPackConformance` (`@pax/packs`) plus a structural check
 * that every `evaluation.scenarioIds` entry has a matching, well-formed
 * `scenarios/<scenario-id>.json` file on disk covering the four required
 * outcome kinds (`scenario-coverage.ts`).
 *
 * Judgment call: this does NOT execute a live Strands run against the
 * draft's scenario steps. `evaluateReadiness`/`runPackConformance`-style
 * deterministic re-verification of a *compiled* pack's structure is fully
 * in scope for a bounded authoring tool; actually driving a real
 * `Agent`/Graph/Swarm through a freshly authored pack's specialists is a
 * materially heavier capability (it requires the pack's specialists/tools to
 * already be registered application code, wired fixture tools, and a
 * scripted model transcript per scenario) that pack-authoring.md's "No-code
 * pack" path explicitly defers to "compilation, conformance tests, and
 * human approval" before install -- not to the authoring tool itself. The
 * declarative scenario file this function validates is exactly what a human
 * reviewer reads before approving (pack-authoring.md "Human reviews
 * manifest, trajectory, and diff").
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Clock } from '@pax/core';
import { runPackConformance, type CapabilityCatalog, type PackConformanceReport } from '@pax/packs';
import { draftDirFor } from './scaffold.js';
import {
  AuthoringScenarioFileSchema,
  evaluateScenarioCoverage,
  type AuthoringScenarioFile,
  type ScenarioCoverageResult,
} from './scenario-coverage.js';
import { packValidate, type PackValidateResult } from './validate.js';

export const PackTestInputSchema = z.object({ draftId: z.string().min(1).max(100) }).strict();
export type PackTestInput = z.infer<typeof PackTestInputSchema>;

export interface ScenarioFileLoadResult {
  readonly scenarios: readonly AuthoringScenarioFile[];
  readonly issues: readonly string[];
}

/** Loads and validates every `scenarios/<scenario-id>.json` file for `scenarioIds`. A missing or malformed file is a reported issue, not a thrown error -- `pack_test` reports every check's result rather than stopping at the first failure, mirroring `compilePack`/`runPackConformance`'s own exhaustive style. */
export function loadDraftScenarios(
  draftRoot: string,
  draftId: string,
  scenarioIds: readonly string[],
): ScenarioFileLoadResult {
  const draftDir = draftDirFor(draftRoot, draftId);
  const scenarios: AuthoringScenarioFile[] = [];
  const issues: string[] = [];

  for (const scenarioId of scenarioIds) {
    const scenarioPath = join(draftDir, 'scenarios', `${scenarioId}.json`);
    let raw: string;
    try {
      raw = readFileSync(scenarioPath, 'utf8');
    } catch {
      issues.push(
        `Declared scenario "${scenarioId}" has no file at "scenarios/${scenarioId}.json".`,
      );
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw) as unknown;
    } catch (error) {
      issues.push(`scenarios/${scenarioId}.json is not valid JSON: ${(error as Error).message}`);
      continue;
    }
    const parsed = AuthoringScenarioFileSchema.safeParse(json);
    if (!parsed.success) {
      issues.push(
        `scenarios/${scenarioId}.json failed validation: ` +
          parsed.error.issues.map((issue) => issue.message).join('; '),
      );
      continue;
    }
    if (parsed.data.id !== scenarioId) {
      issues.push(
        `scenarios/${scenarioId}.json declares id "${parsed.data.id}", which does not match its filename.`,
      );
      continue;
    }
    scenarios.push(parsed.data);
  }

  return { scenarios, issues };
}

export interface PackTestResult {
  readonly ok: boolean;
  readonly validation: PackValidateResult;
  readonly conformance?: PackConformanceReport;
  readonly scenarioCoverage: ScenarioCoverageResult;
  readonly issues: readonly string[];
}

export function packTest(
  draftRoot: string,
  catalog: CapabilityCatalog,
  clock: Clock,
  rawInput: unknown,
): PackTestResult {
  const input = PackTestInputSchema.parse(rawInput);
  const validation = packValidate(draftRoot, catalog, clock, { draftId: input.draftId });

  const scenarioIds = validation.compiled?.evaluation.scenarioIds ?? [];
  const { scenarios, issues: scenarioLoadIssues } = loadDraftScenarios(
    draftRoot,
    input.draftId,
    scenarioIds,
  );
  const scenarioCoverage = evaluateScenarioCoverage(scenarios);

  if (!validation.ok || validation.compiled === undefined) {
    return {
      ok: false,
      validation,
      scenarioCoverage,
      issues: [
        ...validation.issues.map((issue) => `[${issue.step}] ${issue.message}`),
        ...scenarioLoadIssues,
      ],
    };
  }

  const conformance = runPackConformance(validation.compiled, catalog);
  const issues = [
    ...conformance.checks.filter((check) => !check.passed).map((check) => check.message),
    ...scenarioLoadIssues,
    ...scenarioCoverage.issues,
  ];

  return {
    ok: conformance.passed && scenarioLoadIssues.length === 0 && scenarioCoverage.ok,
    validation,
    conformance,
    scenarioCoverage,
    issues,
  };
}
