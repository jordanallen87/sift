/**
 * Pure domain logic for extensible `Criterion` management: add/remove/
 * rename/reweight, weight normalization for scoring, and the predicate that
 * decides whether a criterion change needs a derived case obligation.
 * Grounded in docs/specs/pack-authoring.md "Extensible criteria" and
 * docs/specs/packs-and-routing.md "Flexible attributes and criteria".
 *
 * No filesystem, network, or wall-clock access, and no generated IDs:
 * webmcp.md `pax_update_criteria`'s `add` operation always supplies the new
 * criterion's `id` itself (see `CriterionAddOperationSchema` in
 * `packages/contracts/src/commands.ts`), so this module needs no injected
 * `IdGenerator`/`Clock` port — `Criterion` (`@pax/contracts`) also carries
 * no timestamp field.
 */
import { CriterionSchema, type Criterion, type CriterionOrigin } from '@pax/contracts';
import { fail, ok, type DomainResult } from './attributes.js';

/**
 * The author-facing shape of a new criterion, matching webmcp.md
 * `pax_update_criteria`'s `add` operation's `criterion` field exactly.
 */
export interface CriterionAddInput {
  readonly id: string;
  readonly label: string;
  readonly kind: Criterion['kind'];
  readonly weight: number;
  readonly direction: Criterion['direction'];
  readonly target?: Criterion['target'];
  readonly appliesToAttribute?: string;
  readonly question?: string;
}

/**
 * Adds a new criterion. Rejects a duplicate `id`. `origin` is assigned by
 * the caller from command context (the webmcp.md `add` operation payload
 * carries no `origin` field, the same convention `extensions.ts` uses for
 * `CaseAttributeDraft` — see `CreateCaseAttributeDefinitionContext`): an
 * agent-proposed criterion is only ever added here once a human has
 * confirmed it, so every criterion actually present in `CaseState.criteria`
 * starts `status: 'active'` regardless of origin. `origin` is retained only
 * as a provenance label for the UI, the same way `AttributeRecord.origin`
 * and `CaseAttributeDefinition.origin` persist after confirmation.
 */
export function addCriterion(
  criteria: readonly Criterion[],
  input: CriterionAddInput,
  origin: CriterionOrigin,
): DomainResult<Criterion[]> {
  if (criteria.some((criterion) => criterion.id === input.id)) {
    return fail(`criterion id "${input.id}" already exists on this case`);
  }

  const candidate: Criterion = {
    id: input.id,
    label: input.label,
    kind: input.kind,
    weight: input.weight,
    direction: input.direction,
    origin,
    status: 'active',
    ...(input.target !== undefined ? { target: input.target } : {}),
    ...(input.appliesToAttribute !== undefined
      ? { appliesToAttribute: input.appliesToAttribute }
      : {}),
    ...(input.question !== undefined ? { question: input.question } : {}),
  };

  const parsed = CriterionSchema.safeParse(candidate);
  if (!parsed.success) {
    return fail(...formatIssues(parsed.error.issues));
  }

  return ok([...criteria, parsed.data]);
}

function findCriterion(criteria: readonly Criterion[], criterionId: string): Criterion | undefined {
  return criteria.find((criterion) => criterion.id === criterionId);
}

function formatIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map(
    (issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'criterion'}: ${issue.message}`,
  );
}

/**
 * Removes (excludes) a criterion. Documented judgment call: this sets
 * `status: 'excluded'` rather than deleting the entry from the array.
 * `Criterion.status` (`@pax/contracts`) is exactly `'active' | 'excluded'`
 * for this purpose, matching the same non-destructive convention
 * `EvidenceLink.disposition`'s `'excluded'` state uses elsewhere in the case
 * model (architecture.md: an evidence exclusion "does not delete the
 * source"). Physically deleting would orphan any `ObligationState.
 * criterionId` or `Criterion.appliesToAttribute` back-reference and lose
 * the audit trail webmcp.md alludes to ("Removing a criterion referenced by
 * a decided case is rejected" only makes sense if a removed criterion
 * remains addressable).
 *
 * Rejects removing a criterion that is not found, or one listed in
 * `protectedCriterionIds` (pack-authoring.md: "Pack-required safety or
 * policy criteria ... cannot be deleted."). Removing an already-excluded
 * criterion is treated as an idempotent no-op success.
 */
export function removeCriterion(
  criteria: readonly Criterion[],
  criterionId: string,
  protectedCriterionIds: readonly string[],
): DomainResult<Criterion[]> {
  const existing = findCriterion(criteria, criterionId);
  if (existing === undefined) {
    return fail(`criterion id "${criterionId}" was not found on this case`);
  }
  if (protectedCriterionIds.includes(criterionId)) {
    return fail(`criterion "${criterionId}" is protected and cannot be removed`);
  }

  return ok(
    criteria.map((criterion) =>
      criterion.id === criterionId ? { ...criterion, status: 'excluded' } : criterion,
    ),
  );
}

/**
 * Renames a criterion's label. Documented judgment call: unlike removal and
 * reweighting, pack-authoring.md's "Extensible criteria" section places no
 * protection on renaming a pack-required/protected criterion — only
 * "delete" and "reweight" are named as restricted for protected criteria —
 * so renaming is allowed regardless of protected status.
 */
export function renameCriterion(
  criteria: readonly Criterion[],
  criterionId: string,
  label: string,
): DomainResult<Criterion[]> {
  const existing = findCriterion(criteria, criterionId);
  if (existing === undefined) {
    return fail(`criterion id "${criterionId}" was not found on this case`);
  }

  const parsed = CriterionSchema.safeParse({ ...existing, label });
  if (!parsed.success) {
    return fail(...formatIssues(parsed.error.issues));
  }

  return ok(criteria.map((criterion) => (criterion.id === criterionId ? parsed.data : criterion)));
}

export interface ReweightCriterionOptions {
  readonly protectedCriterionIds: readonly string[];
  /** Pack-authoring.md: "Pack-required safety or policy criteria can be
   * reweighted only when the manifest allows it." The caller resolves that
   * manifest permission (`extensionPolicy`/pack-level) and passes it here;
   * this function only enforces the gate. */
  readonly allowProtectedReweight: boolean;
}

/**
 * Reweights a criterion. Rejects reweighting a protected criterion unless
 * `options.allowProtectedReweight` is explicitly `true`.
 */
export function reweightCriterion(
  criteria: readonly Criterion[],
  criterionId: string,
  weight: number,
  options: ReweightCriterionOptions,
): DomainResult<Criterion[]> {
  const existing = findCriterion(criteria, criterionId);
  if (existing === undefined) {
    return fail(`criterion id "${criterionId}" was not found on this case`);
  }
  if (options.protectedCriterionIds.includes(criterionId) && !options.allowProtectedReweight) {
    return fail(`criterion "${criterionId}" is protected and cannot be reweighted`);
  }

  const parsed = CriterionSchema.safeParse({ ...existing, weight });
  if (!parsed.success) {
    return fail(...formatIssues(parsed.error.issues));
  }

  return ok(criteria.map((criterion) => (criterion.id === criterionId ? parsed.data : criterion)));
}

export interface NormalizedCriterionWeight {
  readonly criterionId: string;
  readonly weight: number;
}

/**
 * Normalizes `active` criteria weights (stored as integers 0-100 on
 * `Criterion.weight`) to floats that sum to 1, for scoring use. Excluded
 * criteria are omitted entirely — they do not participate in scoring.
 *
 * Documented judgment call (all active weights are zero): returns an
 * **equal split** across every active criterion rather than an all-zero
 * result. An all-zero normalized output would make every option tie
 * regardless of its attributes, which is a worse default than treating
 * "nobody set a priority yet" as "everything currently being considered
 * matters equally". When there are zero active criteria at all, returns an
 * empty array (there is nothing to normalize; the sum is vacuously not
 * claimed to be 1).
 */
export function normalizeCriterionWeights(
  criteria: readonly Criterion[],
): NormalizedCriterionWeight[] {
  const active = criteria.filter((criterion) => criterion.status === 'active');
  if (active.length === 0) {
    return [];
  }

  const totalWeight = active.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (totalWeight === 0) {
    const equalShare = 1 / active.length;
    return active.map((criterion) => ({ criterionId: criterion.id, weight: equalShare }));
  }

  return active.map((criterion) => ({
    criterionId: criterion.id,
    weight: criterion.weight / totalWeight,
  }));
}

export interface ExistingEvidenceSignal {
  readonly attributeDefinitionId: string;
  readonly hasSourcedValue: boolean;
}

/**
 * Pure predicate for the obligations group: does this criterion change
 * require deriving a new case obligation from the pack's `userConcern`
 * template (packs-and-routing.md "Obligation template";
 * pack-authoring.md "Case-specific questions to resolve")?
 *
 * Documented judgment calls:
 *  - `'consideration'`-kind criteria never need a derived obligation — the
 *    task instructions frame this rule as "a preference/hard_constraint
 *    criterion ... needs one", naming only those two kinds; a
 *    `consideration` is explicitly the lightest-weight kind and does not
 *    gate a decision the way a constraint or preference does.
 *  - an `'excluded'`-status criterion never needs one — there is nothing to
 *    actively investigate for a criterion the user has removed.
 *  - a criterion with no `appliesToAttribute` (a pure human-judgment
 *    concern with no existing typed attribute behind it, e.g. "does it feel
 *    comfortable on a test drive") always needs one — by definition no
 *    sourced fact could possibly already answer it.
 *  - otherwise, it needs one unless the caller-supplied `existingEvidence`
 *    reports an already-sourced value for that attribute id.
 */
export function criterionNeedsEvidenceQuestion(
  criterion: Criterion,
  existingEvidence: readonly ExistingEvidenceSignal[],
): boolean {
  if (criterion.status === 'excluded') {
    return false;
  }
  if (criterion.kind === 'consideration') {
    return false;
  }
  if (criterion.appliesToAttribute === undefined) {
    return true;
  }

  const signal = existingEvidence.find(
    (item) => item.attributeDefinitionId === criterion.appliesToAttribute,
  );
  return !signal?.hasSourcedValue;
}
