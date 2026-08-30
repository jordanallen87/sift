/**
 * Declarative scenario schemas (docs/specs/testing.md "Scenario tests").
 * `ScenarioAssertion` has an exact discriminated-union field list in
 * testing.md and is translated verbatim below. `DemoScenario.seed:
 * ScenarioSeed` and `ScenarioStep` are named without field lists; both are
 * inferred and grounded at their definitions.
 */
import { z } from 'zod';
import { DEMO_IDS } from './commands.js';
import { JsonValueSchema } from './events.js';

const HTML_OR_EXECUTABLE_PATTERN = /<\/?[a-zA-Z!]|javascript:|on[a-zA-Z]+\s*=\s*["']/;

function safeString(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .refine((value) => !HTML_OR_EXECUTABLE_PATTERN.test(value), {
      message: 'value must not contain HTML tags or executable expressions',
    });
}

const idString = (maxLength = 200) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .regex(/^[A-Za-z0-9._-]+$/, 'id must contain only letters, digits, ".", "_", or "-"');

/**
 * Inferred: `DemoScenario.seed: ScenarioSeed` has no field list. Grounded in
 * the plan's `packages/scenarios/src/seeds.ts` file (fixture seed data
 * loaded to instantiate a case) and testing.md's flake policy ("Each
 * scenario starts with a new temporary store and case ID" / injected
 * deterministic `Clock`).
 */
export const ScenarioSeedSchema = z
  .object({
    demoId: z.enum(DEMO_IDS),
    fixtureBundleId: idString(),
    clockIso: z.iso.datetime(),
  })
  .strict();
export type ScenarioSeed = z.infer<typeof ScenarioSeedSchema>;

/**
 * Inferred: `ScenarioStep` has no field list. Grounded in testing.md
 * "Scenario tests execute the actual core, pack, Strands adapter, scripted
 * model, interventions, fixture tools, event store, and API in process" --
 * a step is a call to one real `SiftCommands` method with its input. `command`
 * is restricted to the exact method names in architecture.md's `SiftCommands`
 * interface rather than an arbitrary string, so a malformed scenario file
 * fails validation instead of silently no-op'ing at runtime. `input` is a
 * bounded `JsonValue` here (not the specific per-command Zod schema from
 * commands.ts) because the scenario runner validates each step's `input`
 * against the real command schema at execution time; contracts only needs to
 * guarantee the envelope itself is safe, size-bounded JSON.
 */
export const SCENARIO_COMMAND_NAMES = [
  'startDemo',
  'selectPack',
  'upsertOption',
  'focusOption',
  'defineCaseAttribute',
  'reviewCaseExtension',
  'focusEvidence',
  'updateCriteria',
  'submitSource',
  'requestInvestigation',
  'reviewProposal',
] as const;
export type ScenarioCommandName = (typeof SCENARIO_COMMAND_NAMES)[number];

export const ScenarioStepSchema = z
  .object({
    command: z.enum(SCENARIO_COMMAND_NAMES),
    input: JsonValueSchema,
    description: safeString(500).optional(),
  })
  .strict();
export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;

// --- ScenarioAssertion (testing.md "Scenario tests", verbatim) ---

const PackSelectedAssertionSchema = z
  .object({ kind: z.literal('pack_selected'), packId: idString(), reasonIncludes: safeString(500) })
  .strict();

const CaseExtensionDefinedAssertionSchema = z
  .object({
    kind: z.literal('case_extension_defined'),
    definitionId: idString(),
    origin: safeString(200),
  })
  .strict();

const CaseObligationCreatedAssertionSchema = z
  .object({
    kind: z.literal('case_obligation_created'),
    obligationId: idString(),
    criterionId: idString(),
  })
  .strict();

const SkillActivatedAssertionSchema = z
  .object({ kind: z.literal('skill_activated'), skillId: idString(), obligationId: idString() })
  .strict();

const SpecialistInvokedAssertionSchema = z
  .object({ kind: z.literal('specialist_invoked'), specialistId: idString() })
  .strict();

const GraphNodeAssertionSchema = z
  .object({ kind: z.literal('graph_node'), nodeId: idString() })
  .strict();

const SwarmHandoffAssertionSchema = z
  .object({ kind: z.literal('swarm_handoff'), from: idString(), to: idString() })
  .strict();

const ContextInjectedAssertionSchema = z
  .object({ kind: z.literal('context_injected'), fields: z.array(safeString(200)).max(50) })
  .strict();

const GoalValidationFailedAssertionSchema = z
  .object({ kind: z.literal('goal_validation_failed'), reasonIncludes: safeString(500) })
  .strict();

/**
 * A genuine GoalLoop reject-then-recover cycle: at least one failed
 * validation attempt whose feedback includes `reasonIncludes`, followed by
 * at least one later attempt that passed (`maxAttempts: 2` -- strands-
 * runtime.md "GoalLoop output validation"). Distinct from
 * `goal_validation_failed` (which only proves the rejection half): a pack
 * whose demo trajectory must prove the run recovered and still produced a
 * valid final result (not merely that a draft was once rejected) needs this
 * stronger claim expressed declaratively rather than as an ad hoc inline
 * check, since "reject once, then recover" is a reusable trajectory shape
 * any pack's GoalLoop-gated agent could exercise, not a one-off dynamic
 * value.
 */
const GoalRecoveredAssertionSchema = z
  .object({ kind: z.literal('goal_recovered'), reasonIncludes: safeString(500) })
  .strict();

const SnapshotRestoredAssertionSchema = z
  .object({ kind: z.literal('snapshot_restored'), caseId: idString() })
  .strict();

const DebugEventCorrelatedAssertionSchema = z
  .object({
    kind: z.literal('debug_event_correlated'),
    eventName: safeString(300),
    activityType: safeString(200),
  })
  .strict();

const RedactionCanaryAbsentAssertionSchema = z
  .object({ kind: z.literal('redaction_canary_absent'), canary: safeString(500) })
  .strict();

const ToolCalledAssertionSchema = z
  .object({
    kind: z.literal('tool_called'),
    toolId: idString(),
    count: z.number().int().min(0).optional(),
  })
  .strict();

const InterventionAssertionSchema = z
  .object({
    kind: z.literal('intervention'),
    action: z.enum(['guide', 'confirm', 'deny']),
    handler: safeString(200),
  })
  .strict();

const ClaimLinkedAssertionSchema = z
  .object({
    kind: z.literal('claim_linked'),
    claimId: idString(),
    sourceIds: z.array(idString()).max(50),
  })
  .strict();

const EvidenceStaleAssertionSchema = z
  .object({ kind: z.literal('evidence_stale'), evidenceId: idString() })
  .strict();

const ObligationStatusAssertionSchema = z
  .object({
    kind: z.literal('obligation_status'),
    obligationId: idString(),
    status: safeString(100),
  })
  .strict();

const ReadinessAssertionSchema = z
  .object({
    kind: z.literal('readiness'),
    ready: z.boolean(),
    blockers: z.array(idString()).max(200),
  })
  .strict();

const RecommendationAssertionSchema = z
  .object({ kind: z.literal('recommendation'), favoredOptionId: idString() })
  .strict();

const HumanActionAssertionSchema = z
  .object({ kind: z.literal('human_action'), action: safeString(200) })
  .strict();

const ForbiddenEventAbsentAssertionSchema = z
  .object({ kind: z.literal('forbidden_event_absent'), eventType: safeString(200) })
  .strict();

export const ScenarioAssertionSchema = z.discriminatedUnion('kind', [
  PackSelectedAssertionSchema,
  CaseExtensionDefinedAssertionSchema,
  CaseObligationCreatedAssertionSchema,
  SkillActivatedAssertionSchema,
  SpecialistInvokedAssertionSchema,
  GraphNodeAssertionSchema,
  SwarmHandoffAssertionSchema,
  ContextInjectedAssertionSchema,
  GoalValidationFailedAssertionSchema,
  GoalRecoveredAssertionSchema,
  SnapshotRestoredAssertionSchema,
  DebugEventCorrelatedAssertionSchema,
  RedactionCanaryAbsentAssertionSchema,
  ToolCalledAssertionSchema,
  InterventionAssertionSchema,
  ClaimLinkedAssertionSchema,
  EvidenceStaleAssertionSchema,
  ObligationStatusAssertionSchema,
  ReadinessAssertionSchema,
  RecommendationAssertionSchema,
  HumanActionAssertionSchema,
  ForbiddenEventAbsentAssertionSchema,
]);
export type ScenarioAssertion = z.infer<typeof ScenarioAssertionSchema>;

// --- DemoScenario (testing.md "Scenario tests", verbatim) ---

export const DemoScenarioSchema = z
  .object({
    id: idString(),
    packId: idString(),
    seed: ScenarioSeedSchema,
    steps: z.array(ScenarioStepSchema).max(200),
    assertions: z.array(ScenarioAssertionSchema).max(200),
  })
  .strict();
export type DemoScenario = z.infer<typeof DemoScenarioSchema>;
