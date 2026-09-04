/**
 * Pure domain logic for case extensions: the "case-defined attributes"
 * mechanism from docs/specs/pack-authoring.md's "Case-defined attributes"
 * and "Case-specific questions to resolve" sections.
 *
 * This module builds the typed `custom.*` `CaseAttributeDefinition` and the
 * `CaseExtension` record that wraps it with the correct `origin` and
 * `confirmation` state. It does not create the derived case obligation
 * (`obligations.ts`, owned by a different workstream) — it produces the
 * typed extension record that group's code needs as input, matching
 * `CaseExtensionSummary` from `@sift/contracts`.
 *
 * No filesystem, network, or wall-clock access. Every timestamp comes from
 * an injected `Clock`; every generated ID comes from an injected
 * `IdGenerator` (see `attributes.ts`).
 */
import {
  ATTRIBUTE_VALUE_TYPES,
  CaseAttributeDefinitionSchema,
  CaseExtensionSchema,
  type AttributeComparison,
  type AttributeValueType,
  type CaseAttributeDefinition,
  type CaseAttributeOrigin,
  type CaseExtension,
  type CaseExtensionReviewDecision,
  type CaseExtensionSummary,
  type EvidenceExpectation,
} from '@sift/contracts';
import { fail, ok, type Clock, type DomainResult, type IdGenerator } from './attributes.js';

const CASE_ATTRIBUTE_ID_PREFIX = 'custom.';

/**
 * The author-facing shape of a proposed case attribute, matching
 * webmcp.md `sift_define_case_attribute`'s `definition` input field exactly:
 * `required` and `sensitive` are deliberately absent here (the command
 * handler assigns them, per `DefineCaseAttributeInputSchema`'s comment in
 * `packages/contracts/src/commands.ts`), as are `origin`/`confirmation`/
 * `proposedBy`/`createdAt` (assigned below from `context` and `clock`).
 */
export interface CaseAttributeDraft {
  readonly id: string;
  readonly label: string;
  readonly valueType: AttributeValueType;
  readonly appliesTo: readonly string[];
  readonly unit?: string;
  readonly allowedValues?: readonly string[];
  /** Enum grades worst to best. Required for a custom enum to be scoreable at all -- see `scoring.ts` rule 3. */
  readonly orderedValues?: readonly string[];
  readonly evidenceExpectation: EvidenceExpectation;
  readonly comparison: AttributeComparison;
  readonly reason: string;
}

export interface CreateCaseAttributeDefinitionContext {
  /** `'user'` for an explicit user request; `'agent_proposed'` for a
   * runtime-agent proposal (webmcp.md `sift_define_case_attribute`). */
  readonly origin: CaseAttributeOrigin;
  readonly proposedBy: string;
  /** Every attribute definition id already present on the case (pack-defined
   * and previously-defined `custom.*`), used for the duplicate-id check. */
  readonly existingAttributeIds: readonly string[];
  /**
   * ADR 0011: did the case's *pinned pack* pre-authorize this whole class of
   * extension (`extensionPolicy.allowCaseAttributes`)?
   *
   * This is the pack author's standing decision, made at authoring time,
   * that a model may add typed comparison data to a case of this kind. When
   * it is `true`, an `'agent_proposed'` definition lands `confirmed` — it
   * carries its `origin` and `reason` so the workspace can show exactly who
   * added it and why, and a human can reject it afterwards
   * (`reviewCaseExtension` below, which is the undo). When it is `false` or
   * absent, the pre-ADR-0011 behavior is preserved byte-for-byte: an
   * `'agent_proposed'` definition lands `pending` and cannot affect
   * readiness until a human confirms it (`isConfirmedExtension`).
   *
   * Optional, defaulting to `undefined`/`false`, so every existing caller
   * that does not know about pack policy keeps its exact current behavior.
   * The caller that DOES know — `apps/agent`'s `CommandService`, the only
   * layer that can resolve a case's pinned pack — passes the real flag.
   *
   * This is deliberately NOT a way to skip the decision gate: a pack can
   * pre-authorize *extending* a case (adding a typed column and its values),
   * never *deciding* it. `reviewProposal` stays absent from the WebMCP tool
   * catalog and `attributeStatusOriginError` (`attributes.ts`) still refuses
   * `status: 'verified'` from any origin but `'user'`.
   */
  readonly preauthorized?: boolean;
}

/**
 * Creates a new `custom.*` `CaseAttributeDefinition` from a proposed shape.
 *
 * Rejects:
 *  - an id that does not start with `"custom."`;
 *  - a duplicate id (already present in `context.existingAttributeIds`);
 *  - an unsupported `valueType`.
 *
 * Documented judgment calls: `required` always defaults to `false` (a
 * case-defined concern starts as an explicit unknown pending evidence, not
 * a required field the way a pack default can be — see
 * pack-authoring.md "Case-specific questions to resolve"); `sensitive`
 * always defaults to `false` (the draft input carries no signal to infer
 * sensitivity from, per `DefineCaseAttributeInputSchema`).
 *
 * `confirmation` is `'confirmed'` for a `'user'`-origin definition, and for
 * an `'agent_proposed'` one whose pack pre-authorized the extension class
 * (`context.preauthorized`, ADR 0011); otherwise `'pending'`.
 */
export function createCaseAttributeDefinition(
  draft: CaseAttributeDraft,
  context: CreateCaseAttributeDefinitionContext,
  clock: Clock,
): DomainResult<CaseAttributeDefinition> {
  if (!draft.id.startsWith(CASE_ATTRIBUTE_ID_PREFIX)) {
    return fail(`case attribute id "${draft.id}" must start with "${CASE_ATTRIBUTE_ID_PREFIX}"`);
  }
  if (context.existingAttributeIds.includes(draft.id)) {
    return fail(`case attribute id "${draft.id}" is already defined for this case`);
  }
  if (!(ATTRIBUTE_VALUE_TYPES as readonly string[]).includes(draft.valueType)) {
    return fail(`"${draft.valueType}" is not a supported attribute value type`);
  }

  const candidate = {
    id: draft.id,
    label: draft.label,
    valueType: draft.valueType,
    required: false,
    appliesTo: [...draft.appliesTo],
    evidenceExpectation: draft.evidenceExpectation,
    comparison: draft.comparison,
    sensitive: false,
    origin: context.origin,
    reason: draft.reason,
    confirmation:
      context.origin === 'user' || context.preauthorized === true
        ? ('confirmed' as const)
        : ('pending' as const),
    proposedBy: context.proposedBy,
    createdAt: clock.now(),
    ...(draft.unit !== undefined ? { unit: draft.unit } : {}),
    ...(draft.allowedValues !== undefined ? { allowedValues: [...draft.allowedValues] } : {}),
    ...(draft.orderedValues !== undefined ? { orderedValues: [...draft.orderedValues] } : {}),
  };

  const parsed = CaseAttributeDefinitionSchema.safeParse(candidate);
  if (!parsed.success) {
    // The `path.length === 0` fallback below defends against a root-level
    // schema issue (e.g. `.strict()`'s "unrecognized_keys"). `candidate`
    // above is always assembled from fixed named fields — never a shallow
    // spread of caller-supplied `draft` — so that branch is not reachable
    // through this function's current implementation; it is kept as
    // defense-in-depth against a future edit that does spread untrusted
    // input here. See `reviewCaseExtension` below for the sibling case
    // where this fallback *is* reachable (it does spread its input).
    return fail(
      ...parsed.error.issues.map(
        (issue) =>
          `${issue.path.length > 0 ? issue.path.join('.') : 'definition'}: ${issue.message}`,
      ),
    );
  }
  return ok(parsed.data);
}

/**
 * Wraps a `CaseAttributeDefinition` in a `CaseExtension` record, generating
 * its id from the injected `IdGenerator` and its `createdAt` from the
 * injected `Clock`. `linkedCriterionId`/`linkedObligationId` are left unset
 * — they are attached once the criteria/obligations groups derive them.
 */
export function createCaseExtension(
  definition: CaseAttributeDefinition,
  caseId: string,
  idGenerator: IdGenerator,
  clock: Clock,
): DomainResult<CaseExtension> {
  const candidate: CaseExtension = {
    id: idGenerator.next('ext'),
    caseId,
    definition,
    createdAt: clock.now(),
  };

  const parsed = CaseExtensionSchema.safeParse(candidate);
  if (!parsed.success) {
    // Same defense-in-depth note as createCaseAttributeDefinition above:
    // `candidate` is assembled from fixed named fields, not a spread of
    // caller-supplied data, so a root-level (empty-path) issue is not
    // reachable through this function's current implementation.
    return fail(
      ...parsed.error.issues.map(
        (issue) =>
          `${issue.path.length > 0 ? issue.path.join('.') : 'extension'}: ${issue.message}`,
      ),
    );
  }
  return ok(parsed.data);
}

export interface DefineCaseExtensionContext extends CreateCaseAttributeDefinitionContext {
  readonly caseId: string;
}

export interface DefineCaseExtensionPorts {
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

/**
 * Composed entry point: creates the `custom.*` definition and its
 * `CaseExtension` wrapper in one call, sharing a single `clock.now()`
 * moment for both the definition's and the extension's `createdAt`.
 */
export function defineCaseExtension(
  draft: CaseAttributeDraft,
  context: DefineCaseExtensionContext,
  ports: DefineCaseExtensionPorts,
): DomainResult<CaseExtension> {
  const definitionResult = createCaseAttributeDefinition(draft, context, ports.clock);
  if (!definitionResult.ok) {
    return definitionResult;
  }
  return createCaseExtension(
    definitionResult.value,
    context.caseId,
    ports.idGenerator,
    ports.clock,
  );
}

/**
 * Queryable confirmation gate for the readiness/obligations group:
 * `'user'`-origin extensions default to `confirmed` and are immediately
 * usable; so do `'agent_proposed'` extensions whose pack pre-authorized the
 * extension class (`CreateCaseAttributeDefinitionContext.preauthorized`,
 * ADR 0011). Without that pre-authorization an `'agent_proposed'`
 * extension defaults to `pending` and — per
 * architecture.md's "Case extensions may add typed data and questions but
 * cannot add executable capabilities, remove required obligations, or
 * weaken policies" and pack-authoring.md's "Agent-proposed definitions
 * require confirmation before becoming decision criteria" — must not be
 * allowed to affect readiness until a human confirms them. ADR 0011 moves
 * WHO gives that confirmation for a pre-authorized extension (the pack
 * author, once, at authoring time) without changing what confirmation
 * means; an unauthorized one still waits for a live human. This predicate
 * is the single place that rule is expressed so the readiness/obligations
 * layer never has to re-derive it.
 */
export function isConfirmedExtension(extension: CaseExtension): boolean {
  return extension.definition.confirmation === 'confirmed';
}

/**
 * The human's authority over a case extension, in both directions.
 *
 *  - A `pending` extension may be confirmed or rejected — the original
 *    review gate, unchanged.
 *  - A `confirmed` extension may be **rejected**: this is ADR 0011's undo.
 *    Once a pack pre-authorizes model-defined attributes
 *    (`extensionPolicy.allowCaseAttributes`), an agent-originated extension
 *    lands `confirmed` rather than waiting for a click the user — living in
 *    the conversation, not the pane — will never see. Removing the human's
 *    ability to take it back afterwards would trade one silent outcome for a
 *    worse one: a column the model added that nobody can remove. Confirming
 *    an already-`confirmed` extension is an idempotent success (a genuine
 *    re-affirmation, e.g. a human pressing Confirm on a concern the model
 *    already recorded), returning it unchanged.
 *  - A `rejected` extension is terminal. Nothing revives it — not a retry,
 *    and not the model (`reviewCaseExtension` is not in the WebMCP tool
 *    catalog at all; it is a human-only verb).
 */
export function reviewCaseExtension(
  extension: CaseExtension,
  decision: CaseExtensionReviewDecision,
): DomainResult<CaseExtension> {
  if (extension.definition.confirmation === 'rejected') {
    return fail(
      `case extension "${extension.id}" was already rejected and cannot be reviewed again (current confirmation: "${extension.definition.confirmation}")`,
    );
  }

  if (extension.definition.confirmation === 'confirmed' && decision === 'confirm') {
    // Idempotent re-affirmation: nothing to change, and nothing dishonest
    // about saying so. Deliberately re-parsed below like every other branch
    // rather than returned early, so a structurally invalid extension is
    // caught here too.
    const parsedUnchanged = CaseExtensionSchema.safeParse(extension);
    if (!parsedUnchanged.success) {
      return fail(
        ...parsedUnchanged.error.issues.map(
          (issue) =>
            `${issue.path.length > 0 ? issue.path.join('.') : 'extension'}: ${issue.message}`,
        ),
      );
    }
    return ok(parsedUnchanged.data);
  }

  const updated: CaseExtension = {
    ...extension,
    definition: {
      ...extension.definition,
      confirmation: decision === 'confirm' ? 'confirmed' : 'rejected',
    },
  };

  const parsed = CaseExtensionSchema.safeParse(updated);
  if (!parsed.success) {
    return fail(
      ...parsed.error.issues.map(
        (issue) =>
          `${issue.path.length > 0 ? issue.path.join('.') : 'extension'}: ${issue.message}`,
      ),
    );
  }
  return ok(parsed.data);
}

/**
 * Compact projection of a `CaseExtension` matching `CaseExtensionSummary`
 * (`@sift/contracts`), for the obligations group and the Strands Context
 * Injector. Uses the underlying attribute definition's `custom.*` id as the
 * summary's `id` (not the `CaseExtension` wrapper's own storage id) since
 * that is the identity other typed data — `Criterion.appliesToAttribute`,
 * `AttributeRecord.definitionId` — actually references.
 */
export function toCaseExtensionSummary(extension: CaseExtension): CaseExtensionSummary {
  return {
    id: extension.definition.id,
    label: extension.definition.label,
    valueType: extension.definition.valueType,
    reason: extension.definition.reason,
    origin: extension.definition.origin,
    confirmation: extension.definition.confirmation,
  };
}
