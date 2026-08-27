/**
 * Strands runtime boundary schemas: `ExecutionRequest`, `RunPlan`, and
 * `ExecutionResult` from docs/specs/strands-runtime.md, and
 * `RuntimeCorrelation`/`RuntimeDebugEvent` from
 * docs/specs/debugging-and-observability.md.
 *
 * `RunPlan` and `ExecutionResult` have complete field lists in
 * strands-runtime.md and are translated directly. `ExecutionRequest`
 * references `CaseSummary`, `AttemptSummary`, and `ExecutionLimits` without
 * field lists; each is inferred here and flagged at its definition.
 * `RuntimeCorrelation` and `RuntimeDebugEvent` have complete field lists in
 * debugging-and-observability.md; `RuntimeDebugEvent.stateDiff`'s element
 * type (`JsonPatchOperation`) is named but not defined, and is modeled here
 * as a bounded RFC 6902 JSON Patch operation.
 */
import { z } from 'zod';
import {
  CASE_STATUSES,
  CLAIM_STANCES,
  CriterionSchema,
  EVIDENCE_VERDICTS,
  ObligationStateSchema,
} from './case.js';
import { CaseExtensionSummarySchema } from './extensions.js';
import { EVIDENCE_LEVELS } from './packs.js';

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

const semverString = z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be a semantic version');
const sha256Hex = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'compiledHash must be a lowercase hex SHA-256');

/**
 * Inferred: `ExecutionRequest.caseSummary: CaseSummary` has no field list.
 * Grounded in strands-runtime.md's "Context injection" list ("active
 * obligation and completion rule; current evidence inventory and staleness;
 * ... user criteria ...") and product.md's "Readiness" region grouping
 * ("satisfied, active, blocked, accepted uncertainty, and open"). Kept
 * intentionally compact -- "Only the minimum source excerpts needed for the
 * obligation enter model context" (strands-runtime.md "Execution request").
 */
export const CaseSummarySchema = z
  .object({
    caseId: idString(),
    title: safeString(300),
    status: z.enum(CASE_STATUSES),
    criteria: z.array(CriterionSchema).max(200),
    optionSummaries: z
      .array(
        z
          .object({
            id: idString(),
            label: safeString(300),
            kind: idString(),
          })
          .strict(),
      )
      .max(20),
    evidenceCounts: z
      .object({
        satisfied: z.number().int().min(0),
        active: z.number().int().min(0),
        blocked: z.number().int().min(0),
        acceptedUncertainty: z.number().int().min(0),
        open: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();
export type CaseSummary = z.infer<typeof CaseSummarySchema>;

/**
 * Inferred: `ExecutionRequest.priorAttempts: AttemptSummary[]` has no field
 * list. Grounded in "Retry steering rules": "Deterministic context providers
 * track tool name, normalized arguments, result status, source IDs, and
 * evidence delta."
 */
export const ATTEMPT_RESULT_STATUSES = ['success', 'failed', 'no_new_evidence'] as const;
export type AttemptResultStatus = (typeof ATTEMPT_RESULT_STATUSES)[number];

export const AttemptSummarySchema = z
  .object({
    attemptNumber: z.number().int().min(1),
    toolId: idString().optional(),
    specialistId: idString().optional(),
    resultStatus: z.enum(ATTEMPT_RESULT_STATUSES),
    sourceIds: z.array(idString()).max(50),
    evidenceDelta: z.number().int(),
    timestamp: z.iso.datetime(),
  })
  .strict();
export type AttemptSummary = z.infer<typeof AttemptSummarySchema>;

/**
 * Inferred: `ExecutionRequest.limits: ExecutionLimits` has no field list.
 * Grounded in strands-runtime.md "Default bounds": "three attempts per
 * obligation ... twelve tool calls per run; six graph node executions per
 * run; 120-second model request timeout; five-minute total run timeout."
 */
export const ExecutionLimitsSchema = z
  .object({
    maxAttemptsPerObligation: z.number().int().min(1).max(20),
    maxToolCallsPerRun: z.number().int().min(1).max(200),
    maxGraphNodeExecutionsPerRun: z.number().int().min(1).max(50),
    modelRequestTimeoutMs: z.number().int().min(1000).max(600_000),
    totalRunTimeoutMs: z.number().int().min(1000).max(1_800_000),
  })
  .strict();
export type ExecutionLimits = z.infer<typeof ExecutionLimitsSchema>;

export const ExecutionRequestSchema = z
  .object({
    runId: idString(),
    caseId: idString(),
    pack: z
      .object({
        id: idString(),
        version: semverString,
        compiledHash: sha256Hex,
      })
      .strict(),
    obligation: ObligationStateSchema,
    caseSummary: CaseSummarySchema,
    caseExtensions: z.array(CaseExtensionSummarySchema).max(100),
    availableSkills: z.array(idString()).max(100),
    availableSpecialists: z.array(idString()).max(100),
    allowedTools: z.array(idString()).max(100),
    priorAttempts: z.array(AttemptSummarySchema).max(50),
    limits: ExecutionLimitsSchema,
  })
  .strict();
export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

// --- RunPlan (strands-runtime.md "Case-specific run planning", verbatim) ---

export const RUN_PLAN_STEP_KINDS = [
  'specialist',
  'tool',
  'validate',
  'request_human_evidence',
] as const;
export type RunPlanStepKind = (typeof RUN_PLAN_STEP_KINDS)[number];

export const RunPlanStepSchema = z
  .object({
    kind: z.enum(RUN_PLAN_STEP_KINDS),
    ref: idString(),
    purpose: safeString(500),
  })
  .strict();
export type RunPlanStep = z.infer<typeof RunPlanStepSchema>;

export const RunPlanSchema = z
  .object({
    obligationId: idString(),
    hypothesis: safeString(2000).optional(),
    specialistIds: z.array(idString()).max(50),
    skillIds: z.array(idString()).max(50),
    toolIds: z.array(idString()).max(50),
    orderedSteps: z.array(RunPlanStepSchema).max(100),
    stopConditions: z.array(safeString(500)).max(50),
  })
  .strict();
export type RunPlan = z.infer<typeof RunPlanSchema>;

// --- ExecutionResult (strands-runtime.md "Evidence output", verbatim) ---

export const EXECUTION_DISPOSITIONS = [
  'evidence_found',
  'no_evidence',
  'needs_human',
  'blocked',
] as const;
export type ExecutionDisposition = (typeof EXECUTION_DISPOSITIONS)[number];

/**
 * Deliberately narrower than case.ts's `OBLIGATION_STATUSES`: the model can
 * suggest that an obligation is now open/satisfied/accepted-uncertainty/
 * blocked, but never `active` -- that status means "currently being
 * investigated," an engine-only transitional state the core assigns, never
 * something a `suggestedStatus` output proposes.
 */
export const EXECUTION_SUGGESTED_STATUSES = [
  'open',
  'satisfied',
  'accepted_uncertainty',
  'blocked',
] as const;
export type ExecutionSuggestedStatus = (typeof EXECUTION_SUGGESTED_STATUSES)[number];

export const ExecutionClaimSchema = z
  .object({
    statement: safeString(2000),
    stance: z.enum(CLAIM_STANCES),
    confidence: z.number().min(0).max(1),
    sourceIds: z.array(idString()).max(50),
  })
  .strict();
export type ExecutionClaim = z.infer<typeof ExecutionClaimSchema>;

export const ExecutionEvidenceResultSchema = z
  .object({
    sourceId: idString(),
    level: z.enum(EVIDENCE_LEVELS),
    verdict: z.enum(EVIDENCE_VERDICTS),
    summary: safeString(2000),
  })
  .strict();
export type ExecutionEvidenceResult = z.infer<typeof ExecutionEvidenceResultSchema>;

export const ExecutionResultSchema = z
  .object({
    obligationId: idString(),
    disposition: z.enum(EXECUTION_DISPOSITIONS),
    claims: z.array(ExecutionClaimSchema).max(50),
    evidenceResults: z.array(ExecutionEvidenceResultSchema).max(50),
    limitations: z.array(safeString(2000)).max(50),
    suggestedStatus: z.enum(EXECUTION_SUGGESTED_STATUSES),
  })
  .strict();
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// --- RuntimeCorrelation (debugging-and-observability.md, verbatim) ---

export const RuntimeCorrelationSchema = z
  .object({
    traceId: idString(),
    spanId: idString().optional(),
    parentSpanId: idString().optional(),
    requestId: idString().optional(),
    caseId: idString(),
    runId: idString(),
    sessionId: idString().optional(),
    obligationId: idString().optional(),
    agentId: idString().optional(),
  })
  .strict();
export type RuntimeCorrelation = z.infer<typeof RuntimeCorrelationSchema>;

// --- RuntimeDebugEvent (debugging-and-observability.md, verbatim) ---

export const RUNTIME_DEBUG_CATEGORIES = [
  'case',
  'agent',
  'model',
  'tool',
  'skill',
  'graph',
  'swarm',
  'intervention',
  'goal',
  'context',
  'session',
  'http',
  'storage',
  'error',
] as const;
export type RuntimeDebugCategory = (typeof RUNTIME_DEBUG_CATEGORIES)[number];

export const RUNTIME_DEBUG_PHASES = ['start', 'update', 'finish', 'error'] as const;
export type RuntimeDebugPhase = (typeof RUNTIME_DEBUG_PHASES)[number];

export const RUNTIME_DEBUG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type RuntimeDebugLevel = (typeof RUNTIME_DEBUG_LEVELS)[number];

export const TokenUsageSchema = z
  .object({
    input: z.number().int().min(0),
    output: z.number().int().min(0),
    total: z.number().int().min(0),
  })
  .strict();
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Inferred: `JsonPatchOperation` is named ("JSON Patch-compatible before/
 * after state diff", debugging-and-observability.md) but never defined.
 * Modeled as a bounded RFC 6902 operation: `value` is required for
 * `add`/`replace`/`test`, `from` is required for `move`/`copy`.
 */
export const JSON_PATCH_OPERATIONS = ['add', 'remove', 'replace', 'move', 'copy', 'test'] as const;
export type JsonPatchOp = (typeof JSON_PATCH_OPERATIONS)[number];

const JsonPatchOperationShape = z
  .object({
    op: z.enum(JSON_PATCH_OPERATIONS),
    path: z.string().max(1000),
    value: z.unknown().optional(),
    from: z.string().max(1000).optional(),
  })
  .strict();

export const JsonPatchOperationSchema = JsonPatchOperationShape.superRefine((patch, ctx) => {
  if (
    (patch.op === 'add' || patch.op === 'replace' || patch.op === 'test') &&
    patch.value === undefined
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['value'],
      message: `"value" is required for op "${patch.op}"`,
    });
  }
  if ((patch.op === 'move' || patch.op === 'copy') && patch.from === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['from'],
      message: `"from" is required for op "${patch.op}"`,
    });
  }
});
export type JsonPatchOperation = z.infer<typeof JsonPatchOperationSchema>;

export const RedactionSchema = z
  .object({
    path: z.string().max(1000),
    reason: safeString(500),
  })
  .strict();
export type Redaction = z.infer<typeof RedactionSchema>;

export const RuntimeDebugEventSchema = RuntimeCorrelationSchema.extend({
  schemaVersion: z.literal('1.0'),
  sequence: z.number().int().min(0),
  timestamp: z.iso.datetime(),
  category: z.enum(RUNTIME_DEBUG_CATEGORIES),
  name: safeString(300),
  phase: z.enum(RUNTIME_DEBUG_PHASES),
  level: z.enum(RUNTIME_DEBUG_LEVELS),
  durationMs: z.number().min(0).optional(),
  tokenUsage: TokenUsageSchema.optional(),
  estimatedCostUsd: z.number().min(0).optional(),
  summary: safeString(2000),
  // Spec types these `Record<string, unknown>` / `unknown` directly
  // (debugging-and-observability.md "Runtime event contract") -- redaction
  // is a separate Redactor concern (see the module comment in events.ts),
  // not a Zod-level restriction here.
  attributes: z.record(z.string(), z.unknown()),
  payload: z.unknown().optional(),
  stateDiff: z.array(JsonPatchOperationSchema).max(500).optional(),
  redactions: z.array(RedactionSchema).max(200),
}).strict();
export type RuntimeDebugEvent = z.infer<typeof RuntimeDebugEventSchema>;
