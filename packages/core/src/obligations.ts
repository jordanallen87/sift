/**
 * Live obligation derivation, deterministic next-obligation selection, and
 * attempt-budget tracking.
 *
 * Grounded in docs/specs/architecture.md's deterministic-core signatures
 * (`deriveObligations`, `selectNextObligation`), docs/specs/packs-and-routing.md's
 * "Obligation template" section (evidence levels, `maxAttempts`, `dependsOn`,
 * `priority`, `acceptedUncertaintyAllowed`), and docs/specs/strands-runtime.md's
 * "Engine loop" ("select highest-value unresolved obligation").
 *
 * Pure module: every function is a plain data transform over `@pax/contracts`
 * types plus the injected `Clock` port (imported from `./evidence.js`, a
 * sibling file in this same task). It imports nothing from
 * `attributes.ts`/`extensions.ts`/`criteria.ts` or
 * `routing.ts`/`policy.ts`/`errors.ts` (owned by two other concurrent build
 * tasks).
 */
import type {
  Claim,
  EvidenceLink,
  ObligationState,
  ObligationTemplate,
  Source,
} from '@pax/contracts';
import type { Clock } from './evidence.js';
import { meetsRequiredEvidenceLevel } from './evidence.js';

export type { Clock, IdGenerator } from './evidence.js';

const RESOLVED_STATUSES = new Set<ObligationState['status']>(['satisfied', 'accepted_uncertainty']);

/**
 * A case-extension-derived obligation template paired with the ID of the
 * `Criterion` that produced it.
 *
 * Inferred shape: `ObligationTemplate` (packages/contracts/src/packs.ts) has
 * no `criterionId` field -- only `ObligationState` does, and only when
 * `origin === 'case_extension'` (packages/contracts/src/case.ts). Whatever
 * builds a case-extension's obligation template (the `criteria.ts` sibling
 * module, out of this file's scope, following packs-and-routing.md's
 * "the core derives a case obligation from the pack's `userConcern`
 * template") therefore has to hand `deriveObligations` the originating
 * criterion ID out of band alongside the template, so this function can
 * satisfy `ObligationStateSchema`'s requirement that a `case_extension`
 * obligation record its `criterionId`.
 */
export interface CaseExtensionObligationTemplate {
  template: ObligationTemplate;
  criterionId: string;
}

function mergeObligationState(
  template: ObligationTemplate,
  criterionId: string | undefined,
  existing: ObligationState | undefined,
  clock: Clock,
): ObligationState {
  const progress = existing
    ? {
        status: existing.status,
        attemptsUsed: existing.attemptsUsed,
        updatedAt: existing.updatedAt,
      }
    : { status: 'open' as const, attemptsUsed: 0, updatedAt: clock.now() };

  return {
    ...template,
    ...(criterionId !== undefined ? { criterionId } : {}),
    ...progress,
  };
}

/**
 * Turns a compiled pack's `ObligationTemplate[]` plus any already-derived
 * case-extension obligation templates into live `ObligationState` records.
 *
 * Reconciliation semantics: an obligation ID present in `existingObligations`
 * keeps its accumulated `status`/`attemptsUsed`/`updatedAt`; every other
 * templated field (label, question, priority, `dependsOn`, ...) is refreshed
 * from the supplied template. An obligation ID that is new -- including every
 * case-extension obligation the first time its template is supplied -- always
 * starts `open` with zero attempts used, regardless of anything found
 * elsewhere in `existingObligations`: **a freshly derived obligation can
 * never be pre-satisfied.**
 *
 * An obligation ID that no longer appears in either `pack.obligations` or
 * `caseExtensionTemplates` is dropped from the result. Required pack
 * obligations stay safe from this only because the caller is expected to
 * pass the pack's complete `obligations` array on every call -- this
 * function never removes a pack-required obligation on its own initiative.
 */
export function deriveObligations(
  pack: { obligations: readonly ObligationTemplate[] },
  caseExtensionTemplates: readonly CaseExtensionObligationTemplate[],
  existingObligations: readonly ObligationState[],
  clock: Clock,
): ObligationState[] {
  const existingById = new Map(
    existingObligations.map((obligation) => [obligation.id, obligation]),
  );
  const result: ObligationState[] = [];

  for (const template of pack.obligations) {
    if (template.origin !== 'pack') {
      throw new Error(
        `deriveObligations: pack.obligations entry "${template.id}" must have origin "pack"`,
      );
    }
    result.push(mergeObligationState(template, undefined, existingById.get(template.id), clock));
  }

  for (const { template, criterionId } of caseExtensionTemplates) {
    if (template.origin !== 'case_extension') {
      throw new Error(
        `deriveObligations: case-extension obligation template "${template.id}" must have origin "case_extension"`,
      );
    }
    result.push(mergeObligationState(template, criterionId, existingById.get(template.id), clock));
  }

  return result;
}

/**
 * Inferred: architecture.md declares `selectNextObligation(caseState):
 * ObligationSelection` without a field list for the return type. Grounded in
 * `ActiveFocus` (packages/contracts/src/case.ts), which is exactly "the
 * obligation being investigated [and] why it is next" (product.md "Current
 * focus" region) -- so this mirrors its two load-bearing fields: the chosen
 * obligation (or `null` when none is selectable) and a human-readable reason
 * a caller can use directly to populate `ActiveFocus.reason`.
 */
export interface ObligationSelection {
  obligation: ObligationState | null;
  reason: string;
}

/**
 * Selects the next obligation the engine loop should work on
 * (strands-runtime.md "Engine loop": "select highest-value unresolved
 * obligation"). Deterministic ordering:
 *
 * 1. Only `open` obligations are candidates. Judgment call: an `active`
 *    obligation is already the case's current focus
 *    (`CaseState.activeFocus`) and is deliberately not reconsidered here --
 *    reselecting a currently-running obligation would fight with whatever
 *    component manages `activeFocus`. The spec's "unresolved" wording could
 *    be read to include `active` too, but restricting to `open` keeps this
 *    function idempotent between engine moves (calling it again mid-run
 *    does not suggest switching focus).
 * 2. A candidate is only selectable once every ID in its `dependsOn` list
 *    resolves to an obligation that is `satisfied` or `accepted_uncertainty`
 *    in this case. A missing or unresolved dependency -- including a
 *    dangling ID with no matching obligation at all -- fails closed: the
 *    dependent obligation is not selectable.
 * 3. Among selectable candidates, the highest `priority` number wins.
 *    Judgment call: packs-and-routing.md types `priority: number` without
 *    stating a direction; this implementation treats a *higher* number as
 *    *more* urgent, matching the "priority score" convention used elsewhere
 *    in the spec set (e.g. routing `confidence`, where higher is better).
 * 4. Equal-priority candidates tie-break on stable insertion order --
 *    `caseState.obligations` array order, which for a freshly derived case
 *    is pack-manifest declaration order. The first-declared obligation of
 *    equal priority wins, so pack authors control tie-breaking simply by
 *    ordering their manifest's `obligations` array.
 */
export function selectNextObligation(caseState: {
  obligations: readonly ObligationState[];
}): ObligationSelection {
  const byId = new Map(caseState.obligations.map((obligation) => [obligation.id, obligation]));

  const dependenciesResolved = (obligation: ObligationState): boolean =>
    obligation.dependsOn.every((depId) => {
      const dependency = byId.get(depId);
      return dependency !== undefined && RESOLVED_STATUSES.has(dependency.status);
    });

  const candidates = caseState.obligations.filter(
    (o) => o.status === 'open' && dependenciesResolved(o),
  );

  if (candidates.length === 0) {
    const waitingOnDependency = caseState.obligations.some(
      (o) => o.status === 'open' && !dependenciesResolved(o),
    );
    return {
      obligation: null,
      reason: waitingOnDependency
        ? 'No obligation is selectable: every open obligation is waiting on an unresolved dependency.'
        : 'No open obligation remains to select.',
    };
  }

  const selected = candidates.reduce((current, candidate) =>
    candidate.priority > current.priority ? candidate : current,
  );

  return {
    obligation: selected,
    reason: `Selected "${selected.label}" (priority ${selected.priority}) as the highest-priority obligation with all dependencies resolved.`,
  };
}

/**
 * Pure attempt-count increment. Does not decide the resulting status -- see
 * `resolveObligationStatus` below, which a caller runs afterward (typically
 * once any new evidence from the attempt has also been recorded).
 */
export function recordObligationAttempt(
  obligation: ObligationState,
  clock: Clock,
): ObligationState {
  return {
    ...obligation,
    attemptsUsed: obligation.attemptsUsed + 1,
    updatedAt: clock.now(),
  };
}

/**
 * Attempt-budget and completion status decision (packs-and-routing.md
 * "Obligation template": `maxAttempts`, `acceptedUncertaintyAllowed`).
 *
 * - `satisfied` when the obligation's accumulated evidence meets its
 *   `requiredEvidenceLevel` (delegated to `evidence.ts`'s
 *   `meetsRequiredEvidenceLevel`, which also enforces the fail-closed
 *   non-stale `error`/`degraded` block).
 * - Otherwise, once `attemptsUsed >= maxAttempts`: `accepted_uncertainty` if
 *   the obligation allows it, else `blocked` -- "an obligation that has
 *   exhausted `maxAttempts` and has `acceptedUncertaintyAllowed: true`
 *   becomes eligible for accepted-uncertainty rather than infinitely
 *   retried; if `acceptedUncertaintyAllowed: false` and attempts are
 *   exhausted, it becomes `blocked`."
 * - Otherwise the obligation stays retryable: `active` if it already was,
 *   `open` otherwise. This function never itself promotes `open` to
 *   `active` -- that transition belongs to whatever starts a run against the
 *   selected obligation, outside this pure module's scope.
 */
export function resolveObligationStatus(
  obligation: ObligationState,
  evidence: {
    claims: readonly Claim[];
    evidenceLinks: readonly EvidenceLink[];
    sources: readonly Source[];
  },
): ObligationState['status'] {
  if (meetsRequiredEvidenceLevel(obligation, evidence)) {
    return 'satisfied';
  }

  if (obligation.attemptsUsed >= obligation.maxAttempts) {
    return obligation.acceptedUncertaintyAllowed ? 'accepted_uncertainty' : 'blocked';
  }

  return obligation.status === 'active' ? 'active' : 'open';
}

/**
 * Applies `resolveObligationStatus` and returns a new record only when the
 * status actually changes (stamping `updatedAt` via `clock`); otherwise
 * returns the same reference so an unaffected obligation never appears to
 * have changed.
 */
export function advanceObligation(
  obligation: ObligationState,
  evidence: {
    claims: readonly Claim[];
    evidenceLinks: readonly EvidenceLink[];
    sources: readonly Source[];
  },
  clock: Clock,
): ObligationState {
  const status = resolveObligationStatus(obligation, evidence);
  if (status === obligation.status) {
    return obligation;
  }
  return { ...obligation, status, updatedAt: clock.now() };
}
