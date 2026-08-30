/**
 * Declarative authoring-time scenario file schema and required-coverage
 * check, used by `pack_test`/`pack_publish` (docs/specs/pack-authoring.md
 * "`pack-authoring` Strands skill" item 8: "at least one success,
 * incomplete-evidence, steering, and human-boundary scenario").
 *
 * Judgment call: this is deliberately NOT `DemoScenarioSchema`
 * (`@sift/contracts` `scenario.ts`). `DemoScenarioSchema.seed.demoId` is
 * `z.enum(DEMO_IDS)` where `DEMO_IDS = ['car-purchase',
 * 'home-energy-guardian']` (`commands.ts`) -- a closed enum of only the two
 * hero packs. A freshly authored pack (e.g. `apartment-hunt`, or any pack a
 * user authors through `pnpm sift pack:author`) can never have a `demoId`
 * from that set, so a `scenarios/<scenario-id>.json` file belonging to an
 * authored pack structurally cannot validate against `DemoScenarioSchema` --
 * that schema is scoped to the demo-launcher/scenario-runner system for the
 * two built-in packs, not to pack-authoring's bundle layout. This module
 * defines the narrower envelope pack-authoring.md's bundle layout actually
 * needs: an explicit `kind` categorizing which of the four required outcome
 * categories the scenario demonstrates, reusing the REAL
 * `ScenarioStepSchema`/`ScenarioAssertionSchema` types for its inner
 * `steps`/`assertions` shape rather than redefining them.
 */
import { z } from 'zod';
import { ScenarioAssertionSchema, ScenarioStepSchema } from '@sift/contracts';

/** The four scenario outcome categories pack-authoring.md's authoring interview requires at least one of each. */
export const AUTHORING_SCENARIO_KINDS = [
  'success',
  'incomplete_evidence',
  'steering',
  'human_boundary',
] as const;
export type AuthoringScenarioKind = (typeof AUTHORING_SCENARIO_KINDS)[number];

const idString = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._-]+$/, 'id must contain only letters, digits, ".", "_", or "-"');

/** One `scenarios/<scenario-id>.json` file's declarative content. */
export const AuthoringScenarioFileSchema = z
  .object({
    id: idString,
    packId: idString,
    kind: z.enum(AUTHORING_SCENARIO_KINDS),
    description: z.string().min(1).max(2000),
    steps: z.array(ScenarioStepSchema).max(200).default([]),
    assertions: z.array(ScenarioAssertionSchema).max(200).default([]),
  })
  .strict();
export type AuthoringScenarioFile = z.infer<typeof AuthoringScenarioFileSchema>;

export interface ScenarioCoverageResult {
  readonly ok: boolean;
  readonly coveredKinds: readonly AuthoringScenarioKind[];
  readonly missingKinds: readonly AuthoringScenarioKind[];
  readonly issues: readonly string[];
}

/**
 * `ok` is true only when every one of `AUTHORING_SCENARIO_KINDS` is
 * demonstrated by at least one scenario file -- the "negative scenario"
 * pack_publish rejects a draft for missing (pack-authoring.md's "missing
 * negative scenarios" rejection) is precisely "any kind other than
 * `success`", so this one check subsumes both the positive- and
 * negative-coverage requirements.
 */
export function evaluateScenarioCoverage(
  scenarios: readonly AuthoringScenarioFile[],
): ScenarioCoverageResult {
  const covered = new Set(scenarios.map((scenario) => scenario.kind));
  const missingKinds = AUTHORING_SCENARIO_KINDS.filter((kind) => !covered.has(kind));
  return {
    ok: missingKinds.length === 0,
    coveredKinds: AUTHORING_SCENARIO_KINDS.filter((kind) => covered.has(kind)),
    missingKinds,
    issues: missingKinds.map((kind) => `Missing required "${kind}" scenario coverage.`),
  };
}
