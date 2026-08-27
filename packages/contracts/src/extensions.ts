/**
 * Case-extension-specific schemas built on top of attributes.ts.
 *
 * `CaseExtension` and `CaseExtensionSummary` are named in the Task 2 plan
 * interfaces (`docs/superpowers/plans/2026-08-26-pax-hackathon-build.md`)
 * and in `docs/specs/strands-runtime.md`'s `ExecutionRequest.
 * caseExtensions: CaseExtensionSummary[]`, but neither has an explicit field
 * list anywhere in the spec set. Both are inferred here, grounded in
 * pack-authoring.md's "Case-defined attributes" and "Case-specific questions
 * to resolve" sections: a case extension is a `CaseAttributeDefinition`
 * (the typed concern itself) plus, once created, the ids of the `Criterion`
 * and case-derived `ObligationState` it produced downstream.
 */
import { z } from 'zod';
import {
  ATTRIBUTE_VALUE_TYPES,
  CASE_ATTRIBUTE_CONFIRMATIONS,
  CASE_ATTRIBUTE_ORIGINS,
  CaseAttributeDefinitionSchema,
} from './attributes.js';

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
 * The full case extension record: the typed concern plus, once the reducer
 * has derived them, the ids of the `Criterion` and case-derived
 * `ObligationState` it produced. `linkedCriterionId`/`linkedObligationId`
 * are absent until those downstream records exist (e.g. a proposed
 * extension awaiting confirmation, or a definition-only concern with no
 * evidence question yet).
 */
export const CaseExtensionSchema = z
  .object({
    id: idString(),
    caseId: idString(),
    definition: CaseAttributeDefinitionSchema,
    linkedCriterionId: idString().optional(),
    linkedObligationId: idString().optional(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type CaseExtension = z.infer<typeof CaseExtensionSchema>;

/**
 * Compact projection of a `CaseExtension` for Strands Context Injector
 * (strands-runtime.md "Context injection": "Injected context includes
 * pack-defined and case-defined criteria and attributes with origin
 * labels"). Deliberately omits `proposedBy`/timestamps/downstream links —
 * only the fields a model needs to reason about the concern.
 */
export const CaseExtensionSummarySchema = z
  .object({
    id: idString(),
    label: safeString(200),
    valueType: z.enum(ATTRIBUTE_VALUE_TYPES),
    reason: safeString(2000),
    origin: z.enum(CASE_ATTRIBUTE_ORIGINS),
    confirmation: z.enum(CASE_ATTRIBUTE_CONFIRMATIONS),
  })
  .strict();
export type CaseExtensionSummary = z.infer<typeof CaseExtensionSummarySchema>;

/**
 * The human review decision on a pending agent-proposed extension, referenced
 * by `ReviewCaseExtensionInput` (commands.ts). A human confirms or rejects;
 * there is no third option, consistent with architecture.md's "Agent-proposed
 * case extensions remain explicitly unconfirmed until a human accepts them."
 */
export const CASE_EXTENSION_REVIEW_DECISIONS = ['confirm', 'reject'] as const;
export const CaseExtensionReviewDecisionSchema = z.enum(CASE_EXTENSION_REVIEW_DECISIONS);
export type CaseExtensionReviewDecision = z.infer<typeof CaseExtensionReviewDecisionSchema>;
