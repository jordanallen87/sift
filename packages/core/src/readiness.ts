/**
 * `evaluateReadiness(caseState): ReadinessResult` -- the single most
 * safety-critical function this task produces (CLAUDE.md: "The deterministic
 * core, not an LLM, owns case state, evidence validity, readiness, and human
 * authority.").
 *
 * Groups every obligation into the five Readiness-region buckets from
 * docs/specs/product.md's workspace layout ("Readiness -- required
 * obligations grouped by satisfied, active, blocked, accepted uncertainty,
 * and open") and computes an overall `ready` boolean that gates the entire
 * product's human-authority boundary: nothing downstream may treat a case as
 * ready for a recommendation while this function says otherwise.
 *
 * Pure module: reads only `CaseState` fields, generates no IDs or
 * timestamps, and imports nothing from `attributes.ts`/`extensions.ts`/
 * `criteria.ts` or `routing.ts`/`policy.ts`/`errors.ts` (owned by two other
 * concurrent build tasks) or from this task's own `obligations.ts`/
 * `evidence.ts` -- readiness only ever reads the already-resolved
 * `ObligationState.status` field, never re-derives it, so this file has the
 * smallest possible blast radius of anything that could make it wrong.
 */
import type { CaseState, ObligationState } from '@sift/contracts';

// NOTE: this file's original comment block below documented a genuine gap --
// `CaseState` had no `caseExtensions` array, so confirmation state for an
// agent-proposed case extension was unreachable from this function's only
// input. That gap has since been closed at the contracts layer
// (`CaseState.caseExtensions: CaseExtension[]`, packages/contracts/src/
// case.ts) during the Task 2 integration pass. `countsTowardReadiness` below
// now checks `CaseExtension.definition.confirmation` directly instead of
// relying solely on the `Criterion.status === 'excluded'` proxy; the proxy
// check is retained as a second, independent defensive layer rather than
// removed, since a criterion the reducer has excluded for any other reason
// must also never count.

/**
 * Inferred: architecture.md declares `evaluateReadiness(caseState):
 * ReadinessResult` without a field list. Grounded directly in product.md's
 * Readiness region description ("required obligations grouped by satisfied,
 * active, blocked, accepted uncertainty, and open") for the five bucket
 * fields, plus an overall `ready` boolean and a `blockers: string[]` of
 * human-readable reasons the task description requires this function to
 * report.
 */
export interface ReadinessResult {
  ready: boolean;
  satisfied: ObligationState[];
  active: ObligationState[];
  blocked: ObligationState[];
  acceptedUncertainty: ObligationState[];
  open: ObligationState[];
  blockers: string[];
}

/**
 * Whether an obligation's resolution is allowed to affect the overall
 * `ready` gate at all.
 *
 * A `case_extension`-origin obligation must never count toward readiness
 * unless its originating `CaseExtension`'s `definition.confirmation` is
 * `'confirmed'` -- an agent-proposed extension defaults to `'pending'` and
 * must stay uncounted until a human confirms it (architecture.md "Security
 * and authority"; pack-authoring.md "Agent-proposed definitions require
 * confirmation before becoming decision criteria"). This is checked two
 * independent ways, and both must agree the obligation counts:
 *
 * 1. The linked `Criterion.status` must not be `'excluded'` (the reducer is
 *    expected to keep a pending, unconfirmed agent-proposed criterion
 *    excluded until confirmed).
 * 2. The `CaseExtension` record itself (`caseState.caseExtensions`, matched
 *    by `linkedCriterionId`) must exist and report `confirmation ===
 *    'confirmed'`.
 *
 * Failing closed on either check (an excluded criterion, a missing
 * extension record, or an unconfirmed extension) means a reducer bug in one
 * layer cannot silently make a case ready before a human has actually
 * confirmed the concern that obligation exists to resolve.
 */
function countsTowardReadiness(obligation: ObligationState, caseState: CaseState): boolean {
  if (obligation.origin !== 'case_extension' || obligation.criterionId === undefined) {
    return true;
  }
  const criterion = caseState.criteria.find((c) => c.id === obligation.criterionId);
  if (criterion === undefined || criterion.status === 'excluded') {
    return false;
  }
  const extension = caseState.caseExtensions.find(
    (ext) => ext.linkedCriterionId === obligation.criterionId,
  );
  return extension?.definition.confirmation === 'confirmed';
}

function describeBlocker(obligation: ObligationState): string {
  if (obligation.status === 'blocked') {
    return `"${obligation.label}" is blocked: ${obligation.attemptsUsed} of ${obligation.maxAttempts} attempts used and accepted uncertainty is not allowed for this obligation.`;
  }
  if (obligation.status === 'active') {
    return `"${obligation.label}" is still being investigated and has not yet reached its required ${obligation.requiredEvidenceLevel} evidence level.`;
  }
  return `"${obligation.label}" is open: it has not yet reached its required ${obligation.requiredEvidenceLevel} evidence level.`;
}

/**
 * Overall readiness computation. `ready` is derived directly from
 * `blockers.length === 0`, never computed independently, so the two can
 * never diverge: **no code path may report `ready: true` while a required,
 * non-`accepted_uncertainty` obligation is unresolved and counted.**
 *
 * `ready === true` requires every REQUIRED, counted obligation to be
 * `satisfied` or `accepted_uncertainty`. A case with zero required, counted
 * obligations is vacuously ready (an empty product of true conditions); this
 * matches ordinary boolean "every" semantics and is a deliberate, documented
 * choice rather than an oversight.
 */
export function evaluateReadiness(caseState: CaseState): ReadinessResult {
  const satisfied: ObligationState[] = [];
  const active: ObligationState[] = [];
  const blocked: ObligationState[] = [];
  const acceptedUncertainty: ObligationState[] = [];
  const open: ObligationState[] = [];
  const blockers: string[] = [];

  for (const obligation of caseState.obligations) {
    switch (obligation.status) {
      case 'satisfied':
        satisfied.push(obligation);
        break;
      case 'active':
        active.push(obligation);
        break;
      case 'blocked':
        blocked.push(obligation);
        break;
      case 'accepted_uncertainty':
        acceptedUncertainty.push(obligation);
        break;
      case 'open':
        open.push(obligation);
        break;
    }

    const isUnresolved =
      obligation.status !== 'satisfied' && obligation.status !== 'accepted_uncertainty';
    if (obligation.required && isUnresolved && countsTowardReadiness(obligation, caseState)) {
      blockers.push(describeBlocker(obligation));
    }
  }

  return {
    ready: blockers.length === 0,
    satisfied,
    active,
    blocked,
    acceptedUncertainty,
    open,
    blockers,
  };
}
