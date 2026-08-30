/**
 * `SiftCommands` input/output schemas (docs/specs/architecture.md "Shared
 * command client") and the WebMCP tool input catalog
 * (docs/specs/webmcp.md "Tool catalog").
 *
 * Where a WebMCP tool's input is identical in shape to a `SiftCommands`
 * input, this module defines the `SiftCommands` schema once and exports the
 * WebMCP tool schema as an alias of it (documented at each alias), instead
 * of duplicating the shape. Two WebMCP tools --
 * `sift_set_evidence_disposition` and `sift_request_revision` -- have no
 * corresponding method in architecture.md's `SiftCommands` interface; their
 * schemas are defined independently, grounded directly in webmcp.md. This is
 * a real gap between architecture.md's interface listing and webmcp.md's
 * tool catalog, not a shape I invented -- resolving *which* `SiftCommands`
 * method (if any) a later task wires `sift_set_evidence_disposition` through
 * is an implementation decision for `apps/agent`/`apps/web`, not a contracts
 * concern.
 */
import { z } from 'zod';
import {
  ATTRIBUTE_VALUE_TYPES,
  AttributeValueSchema,
  EVIDENCE_EXPECTATIONS,
  ATTRIBUTE_COMPARISONS,
  CRITERION_DIRECTIONS,
  CRITERION_KINDS,
} from './attributes.js';
import { CaseAttributeIdSchema } from './attributes.js';
import { CaseStateSchema } from './case.js';
import { EVIDENCE_DISPOSITIONS } from './case.js';
import { CaseExtensionReviewDecisionSchema } from './extensions.js';

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

const expectedSequence = z.number().int().min(0);

// --- StartDemoInput ---
// Inferred: has no field list in architecture.md. Grounded in product.md's
// "Demo launcher": "The initial page presents exactly two options ... `car-
// purchase`/`home-energy-guardian` are the two pack ids those options start.

export const DEMO_IDS = ['car-purchase', 'home-energy-guardian'] as const;
export type DemoId = (typeof DEMO_IDS)[number];

export const StartDemoInputSchema = z
  .object({
    demoId: z.enum(DEMO_IDS),
  })
  .strict();
export type StartDemoInput = z.infer<typeof StartDemoInputSchema>;

// --- StartCaseInput ---
// Added for docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md:
// a normal, non-demo case-creation entry point pinned to any registered
// pack id, not just the closed `DemoId` enum `startDemo` is scoped to. A
// sibling command, not an overload of `startDemo` -- see that ADR's
// "Decision" §3 for why `startDemo`'s fixture-reset semantics are kept
// separately intact rather than widened.

export const StartCaseInputSchema = z
  .object({
    packId: idString(),
  })
  .strict();
export type StartCaseInput = z.infer<typeof StartCaseInputSchema>;

// --- SelectPackInput (webmcp.md `sift_select_pack`) ---

export const SelectPackInputSchema = z
  .object({
    caseId: idString(),
    packId: idString(),
    expectedSequence,
  })
  .strict();
export type SelectPackInput = z.infer<typeof SelectPackInputSchema>;

/** Identical shape to `SelectPackInput`; the WebMCP tool and the visible pack picker call the same command. */
export const SiftSelectPackToolInputSchema = SelectPackInputSchema;

// --- UpsertOptionInput (webmcp.md `sift_upsert_option`) ---

const OptionAttributeInputSchema = z
  .object({
    definitionId: idString(),
    label: safeString(200).optional(),
    value: AttributeValueSchema,
    sourceIds: z.array(idString()).max(50).optional(),
  })
  .strict();

export const UpsertOptionInputSchema = z
  .object({
    caseId: idString(),
    optionId: idString().optional(),
    expectedSequence,
    option: z
      .object({
        label: safeString(300),
        kind: idString(),
        attributes: z.array(OptionAttributeInputSchema).max(100),
      })
      .strict(),
  })
  .strict();
export type UpsertOptionInput = z.infer<typeof UpsertOptionInputSchema>;

/** Identical shape to `UpsertOptionInput`. */
export const SiftUpsertOptionToolInputSchema = UpsertOptionInputSchema;

// --- FocusOptionInput (webmcp.md `sift_focus_option`) ---

export const FocusOptionInputSchema = z
  .object({
    caseId: idString(),
    optionId: idString(),
    expectedSequence,
  })
  .strict();
export type FocusOptionInput = z.infer<typeof FocusOptionInputSchema>;

/** Identical shape to `FocusOptionInput`. */
export const SiftFocusOptionToolInputSchema = FocusOptionInputSchema;

// --- DefineCaseAttributeInput (webmcp.md `sift_define_case_attribute`) ---
// Deliberately narrower than `CaseAttributeDefinitionSchema` (attributes.ts):
// `required`, `sensitive`, `origin`, `confirmation`, `proposedBy`, and
// `createdAt` are assigned by the command handler, not supplied by the
// caller, per webmcp.md's exact input shape.

const CaseAttributeDraftSchema = z
  .object({
    id: CaseAttributeIdSchema,
    label: safeString(200),
    valueType: z.enum(ATTRIBUTE_VALUE_TYPES),
    appliesTo: z.array(idString()).max(50),
    unit: safeString(60).optional(),
    allowedValues: z.array(safeString(200)).max(200).optional(),
    evidenceExpectation: z.enum(EVIDENCE_EXPECTATIONS),
    comparison: z.enum(ATTRIBUTE_COMPARISONS),
    reason: safeString(2000),
  })
  .strict();

export const DefineCaseAttributeInputSchema = z
  .object({
    caseId: idString(),
    expectedSequence,
    definition: CaseAttributeDraftSchema,
  })
  .strict();
export type DefineCaseAttributeInput = z.infer<typeof DefineCaseAttributeInputSchema>;

/** Identical shape to `DefineCaseAttributeInput`. */
export const SiftDefineCaseAttributeToolInputSchema = DefineCaseAttributeInputSchema;

// --- ReviewCaseExtensionInput ---
// Inferred: named in architecture.md's `SiftCommands` interface with no field
// list. Grounded in extensions.ts's `CaseExtensionReviewDecisionSchema` and
// webmcp.md's `sift_set_evidence_disposition`/`sift_request_revision` shape
// convention (id + optional free-text reason + expectedSequence).

export const ReviewCaseExtensionInputSchema = z
  .object({
    caseId: idString(),
    extensionId: idString(),
    decision: CaseExtensionReviewDecisionSchema,
    reason: safeString(2000).optional(),
    expectedSequence,
  })
  .strict();
export type ReviewCaseExtensionInput = z.infer<typeof ReviewCaseExtensionInputSchema>;

// --- FocusEvidenceInput (webmcp.md `sift_focus_evidence`) ---

export const FocusEvidenceInputSchema = z
  .object({
    caseId: idString(),
    evidenceId: idString(),
    expectedSequence,
  })
  .strict();
export type FocusEvidenceInput = z.infer<typeof FocusEvidenceInputSchema>;

/** Identical shape to `FocusEvidenceInput`. */
export const SiftFocusEvidenceToolInputSchema = FocusEvidenceInputSchema;

// --- UpdateCriteriaInput (webmcp.md `sift_update_criteria`) ---

const CriterionAddOperationSchema = z
  .object({
    op: z.literal('add'),
    criterion: z
      .object({
        id: idString(),
        label: safeString(200),
        kind: z.enum(CRITERION_KINDS),
        weight: z.number().int().min(0).max(100),
        direction: z.enum(CRITERION_DIRECTIONS),
        target: AttributeValueSchema.optional(),
        appliesToAttribute: idString().optional(),
        question: safeString(2000).optional(),
      })
      .strict(),
  })
  .strict();

const CriterionRemoveOperationSchema = z
  .object({ op: z.literal('remove'), criterionId: idString() })
  .strict();

const CriterionReweightOperationSchema = z
  .object({
    op: z.literal('reweight'),
    criterionId: idString(),
    weight: z.number().int().min(0).max(100),
  })
  .strict();

const CriterionRenameOperationSchema = z
  .object({ op: z.literal('rename'), criterionId: idString(), label: safeString(200) })
  .strict();

export const CriteriaOperationSchema = z.discriminatedUnion('op', [
  CriterionAddOperationSchema,
  CriterionRemoveOperationSchema,
  CriterionReweightOperationSchema,
  CriterionRenameOperationSchema,
]);
export type CriteriaOperation = z.infer<typeof CriteriaOperationSchema>;

export const UpdateCriteriaInputSchema = z
  .object({
    caseId: idString(),
    expectedSequence,
    operations: z.array(CriteriaOperationSchema).min(1).max(50),
  })
  .strict();
export type UpdateCriteriaInput = z.infer<typeof UpdateCriteriaInputSchema>;

/** Identical shape to `UpdateCriteriaInput`. */
export const SiftUpdateCriteriaToolInputSchema = UpdateCriteriaInputSchema;

// --- SubmitSourceInput (webmcp.md `sift_submit_source`) ---

const SourceClaimInputSchema = z
  .object({
    statement: safeString(2000),
    appliesToEntityIds: z.array(idString()).max(20),
  })
  .strict();

const SubmittedSourceInputSchema = z
  .object({
    url: z.url().max(2000),
    title: safeString(500),
    publisher: safeString(200).optional(),
    publishedAt: z.iso.datetime().optional(),
    retrievedAt: z.iso.datetime(),
    excerpt: safeString(5000).optional(),
    claims: z.array(SourceClaimInputSchema).max(50),
  })
  .strict();

export const SubmitSourceInputSchema = z
  .object({
    caseId: idString(),
    expectedSequence,
    source: SubmittedSourceInputSchema,
  })
  .strict();
export type SubmitSourceInput = z.infer<typeof SubmitSourceInputSchema>;

/** Identical shape to `SubmitSourceInput`. */
export const SiftSubmitSourceToolInputSchema = SubmitSourceInputSchema;

// --- sift_set_evidence_disposition ---
// No corresponding `SiftCommands` method name exists in architecture.md; see
// the module-level comment. Shape matches webmcp.md exactly.

export const SetEvidenceDispositionInputSchema = z
  .object({
    caseId: idString(),
    evidenceId: idString(),
    disposition: z.enum(EVIDENCE_DISPOSITIONS),
    reason: safeString(2000),
    expectedSequence,
  })
  .strict();
export type SetEvidenceDispositionInput = z.infer<typeof SetEvidenceDispositionInputSchema>;

// --- RequestInvestigationInput (webmcp.md `sift_request_investigation`) ---

export const RequestInvestigationInputSchema = z
  .object({
    caseId: idString(),
    obligationId: idString().optional(),
    expectedSequence,
  })
  .strict();
export type RequestInvestigationInput = z.infer<typeof RequestInvestigationInputSchema>;

/** Identical shape to `RequestInvestigationInput`. */
export const SiftRequestInvestigationToolInputSchema = RequestInvestigationInputSchema;

// --- sift_request_revision ---
// No corresponding `SiftCommands` method name exists in architecture.md; see
// the module-level comment. Shape matches webmcp.md exactly (no `actor`/
// `decision` fields -- unlike `ReviewProposalInput` below, this tool can only
// ever attach a revision request; "It cannot approve or reject the
// decision.").

export const RequestRevisionInputSchema = z
  .object({
    caseId: idString(),
    proposalId: idString(),
    instructions: safeString(5000),
    expectedSequence,
  })
  .strict();
export type RequestRevisionInput = z.infer<typeof RequestRevisionInputSchema>;

// --- ReviewProposalInput ---
// Inferred: named in architecture.md's `SiftCommands` interface with no field
// list. Grounded in `reviewProposal(caseState, decision): CaseState`
// (architecture.md "Deterministic core"), "`reviewProposal` rejects requests
// whose `actor` is not `human`" (architecture.md "Security and authority"),
// and webmcp.md's `sift_request_revision` (which webmcp exposes as a
// standalone, narrower tool -- see `RequestRevisionInputSchema` above -- but
// which a later task's command-service implementation is expected to route
// through this same `reviewProposal` command, per CLAUDE.md's "Visible UI
// controls and WebMCP callbacks use the same command implementation").
// `actor` deliberately allows `'agent'` structurally, matching
// `DecisionProposalSchema`'s `ActorSchema`: the human-only rule is a
// core-reducer behavior under property test, not a static schema
// restriction.

export const REVIEW_PROPOSAL_DECISIONS = ['approve', 'reject', 'request_revision'] as const;
export type ReviewProposalDecision = (typeof REVIEW_PROPOSAL_DECISIONS)[number];

const ActorSchema = z.enum(['human', 'agent']);

const ReviewProposalInputShape = z
  .object({
    caseId: idString(),
    proposalId: idString(),
    actor: ActorSchema,
    decision: z.enum(REVIEW_PROPOSAL_DECISIONS),
    instructions: safeString(5000).optional(),
    reason: safeString(2000).optional(),
    expectedSequence,
  })
  .strict();

export const ReviewProposalInputSchema = ReviewProposalInputShape.superRefine((input, ctx) => {
  if (input.decision === 'request_revision' && input.instructions === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['instructions'],
      message: 'instructions is required when decision is "request_revision"',
    });
  }
});
export type ReviewProposalInput = z.infer<typeof ReviewProposalInputSchema>;

// --- Read-only WebMCP tools (empty input) ---

export const GetCaseContextInputSchema = z.object({}).strict();
export type GetCaseContextInput = z.infer<typeof GetCaseContextInputSchema>;

export const ListPacksInputSchema = z.object({}).strict();
export type ListPacksInput = z.infer<typeof ListPacksInputSchema>;

// --- CommandReceipt / RunReceipt (architecture.md "Shared command client") ---

/**
 * Inferred: `CommandReceipt.snapshot?: CaseSnapshot` references a
 * `CaseSnapshot` type that is never separately defined -- a snapshot is the
 * case state at the accepted sequence, so this aliases `CaseStateSchema`
 * directly rather than inventing a distinct duplicate shape.
 */
export const CaseSnapshotSchema = CaseStateSchema;

export const CommandReceiptSchema = z
  .object({
    commandId: idString(),
    caseId: idString(),
    acceptedSequence: z.number().int().min(0),
    runId: idString().optional(),
    snapshot: CaseSnapshotSchema.optional(),
  })
  .strict();
export type CommandReceipt = z.infer<typeof CommandReceiptSchema>;

/**
 * `requestInvestigation` returns `Promise<RunReceipt>` rather than
 * `Promise<CommandReceipt>` (architecture.md): a run-starting command always
 * has a `runId`, unlike the general `CommandReceipt` where it is optional.
 */
export const RunReceiptSchema = CommandReceiptSchema.extend({
  runId: idString(),
}).strict();
export type RunReceipt = z.infer<typeof RunReceiptSchema>;

// --- SiftToolResult<T> (webmcp.md "Tool result envelope") ---

export const TOOL_ERROR_CODES = [
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'POLICY',
  'UNAVAILABLE',
  'INTERNAL',
] as const;
export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

export const SiftToolUiSchema = z
  .object({
    changed: z.boolean(),
    focusTarget: idString().optional(),
  })
  .strict();
export type SiftToolUi = z.infer<typeof SiftToolUiSchema>;

export const SiftToolErrorSchema = z
  .object({
    code: z.enum(TOOL_ERROR_CODES),
    retryable: z.boolean(),
  })
  .strict();
export type SiftToolError = z.infer<typeof SiftToolErrorSchema>;

export interface SiftToolResult<T> {
  ok: boolean;
  message: string;
  data?: T;
  commandId?: string;
  runId?: string;
  caseId?: string;
  sequence?: number;
  ui: SiftToolUi;
  error?: SiftToolError;
}

export function SiftToolResultSchema<DataSchema extends z.ZodTypeAny>(dataSchema: DataSchema) {
  return z
    .object({
      ok: z.boolean(),
      message: safeString(2000),
      data: dataSchema.optional(),
      commandId: idString().optional(),
      runId: idString().optional(),
      caseId: idString().optional(),
      sequence: z.number().int().min(0).optional(),
      ui: SiftToolUiSchema,
      error: SiftToolErrorSchema.optional(),
    })
    .strict();
}
