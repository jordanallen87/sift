/**
 * `reviewProposal(caseState, decision): CaseState` (docs/specs/architecture.md
 * "Deterministic core"), and the "Three-layer adaptability model" boundary
 * predicate (docs/specs/pack-authoring.md).
 *
 * This is the single most safety-critical rule in the product
 * (docs/engineering-principles.md: "The model may propose candidate events and recommendations.
 * It may never approve a consequential decision."). Every branch below is
 * covered by both example-based and property-based tests in
 * `policy.test.ts`.
 *
 * Judgment calls (see docs/build-log.md for the dated entry with full
 * reasoning):
 *
 * 1. `decision`'s real shape is `ReviewProposalInput`
 *    (`@sift/contracts` `commands.ts`) -- `{ caseId, proposalId, actor,
 *    decision: 'approve'|'reject'|'request_revision', instructions?,
 *    reason?, expectedSequence }` -- not the placeholder
 *    `{ actor, proposalId, outcome, instructions }` shape sketched in the
 *    task description. This module is grounded in the real contract.
 * 2. Every timestamp (`DecisionProposal.reviewedAt`, `CaseState.updatedAt`)
 *    comes from an injected `Clock`, per docs/engineering-principles.md's non-negotiable rule.
 *    `IdGenerator` is still defined below (no other module had defined it
 *    yet) so sibling `packages/core` modules and the later reducer
 *    integration layer share one minimal port shape -- but `reviewProposal`
 *    itself does not take one: reviewing a proposal only ever mutates an
 *    *existing* `DecisionProposal`/`CaseState` in place (status,
 *    `reviewedAt`, `reviewedByActor`, `revisionInstructions`, case
 *    `status`/`updatedAt`); no new entity or event ID is minted by this
 *    function. Accepting an unused `idGenerator` parameter here would fail
 *    `noUnusedParameters`/`noUnusedLocals` (`tsconfig.base.json`) for no
 *    real benefit.
 * 3. Case-status transition: approval alone moves `CaseState.status` to
 *    `'decided'`. Rejection and revision-request leave `status` untouched
 *    -- the case is not concluded, it still needs further work, and
 *    nothing in the spec set assigns them a specific different status.
 * 4. `reason` (always-optional on `ReviewProposalInput`) IS persisted, onto
 *    `DecisionProposal.reviewReason` (`@sift/contracts` `case.ts`), for
 *    every decision (approve/reject/request_revision alike) it is supplied
 *    with -- not only `revisionInstructions` for the request_revision case.
 *    This was a real, user-reachable defect until fixed: `ApprovalCard`
 *    (`apps/web`) already collects this free-text explanation from the
 *    person reviewing a consequential proposal and `App.tsx`'s
 *    `handleReviewProposal` already sends it over the wire, but nothing
 *    downstream ever kept it -- it was validated, accepted, and silently
 *    discarded, so a human's stated reason for declining or approving
 *    vanished the instant they submitted it. `dispositionReason` on
 *    `EvidenceLink` (a materially identical "the reviewer explains why" field
 *    on a sibling human-authority action) was the precedent this now
 *    matches.
 */
import type {
  CaseState,
  DecisionProposal,
  ReviewProposalDecision,
  ReviewProposalInput,
} from '@sift/contracts';
import { PolicyViolationError, ValidationFailedError } from './errors.js';

/** Injected time source. Every `packages/core` timestamp must come from here -- never `Date.now()` or `new Date()`. */
export interface Clock {
  now(): string;
}

/** Injected ID source. Every `packages/core`-generated identifier must come from here -- never `crypto.randomUUID()` or a local counter. Defined here for sibling modules and the reducer integration layer to share; see judgment call #2 above for why `reviewProposal` itself does not consume one. */
export interface IdGenerator {
  nextId(): string;
}

// --- Three-layer adaptability boundary (docs/specs/pack-authoring.md) ---

/**
 * Changes to the "Case and run plan" layer a runtime model is permitted to
 * make: "formulate hypotheses, select an allowed capability, propose a new
 * case concern, request a handoff, and revise its plan."
 */
export const MODEL_PERMITTED_CHANGE_KINDS = [
  'formulate_hypothesis',
  'select_allowed_capability',
  'propose_case_concern',
  'request_handoff',
  'revise_run_plan',
] as const;

/**
 * Changes to the Engine or Compiled Decision Pack layers a runtime model may
 * never make: "invent a tool, remove a required obligation, lower evidence
 * thresholds, change human approval rules, publish a pack, or approve its
 * own recommendation."
 */
export const MODEL_PROHIBITED_CHANGE_KINDS = [
  'invent_tool',
  'remove_required_obligation',
  'lower_evidence_threshold',
  'change_human_approval_rule',
  'publish_pack',
  'approve_own_recommendation',
] as const;

export type ModelPermittedChangeKind = (typeof MODEL_PERMITTED_CHANGE_KINDS)[number];
export type ModelProhibitedChangeKind = (typeof MODEL_PROHIBITED_CHANGE_KINDS)[number];
export type ModelChangeKind = ModelPermittedChangeKind | ModelProhibitedChangeKind;

const PERMITTED_CHANGE_KIND_SET: ReadonlySet<string> = new Set(MODEL_PERMITTED_CHANGE_KINDS);

/**
 * Pure predicate over the "Three-layer adaptability model" table
 * (docs/specs/pack-authoring.md): does the model-proposed `changeKind` stay
 * within the "Case and run plan" layer it may adapt, or does it reach into
 * the Engine/Compiled Decision Pack layers it may not? Later callers (the
 * reducer, the Strands adapter's Context Injector/GoalLoop validators)
 * should consult this rather than re-deriving the model-may/model-may-not
 * list themselves.
 */
export function isModelPermittedChange(changeKind: ModelChangeKind): boolean {
  return PERMITTED_CHANGE_KIND_SET.has(changeKind);
}

// --- reviewProposal ---

function mapDecisionToProposalStatus(decision: ReviewProposalDecision): DecisionProposal['status'] {
  switch (decision) {
    case 'approve':
      return 'approved';
    case 'reject':
      return 'rejected';
    case 'request_revision':
      return 'revision_requested';
  }
}

/**
 * Reviews a case's pending `DecisionProposal`. Rejects -- unconditionally,
 * before any other check -- any request whose `actor` is not the literal
 * string `'human'` (docs/specs/architecture.md "Security and authority":
 * "`reviewProposal` rejects requests whose `actor` is not `human`"). This
 * makes it structurally impossible for any caller, including one holding a
 * model `ExecutionResult`, to produce an approved decision through this
 * function without a literal `'human'` actor string: the check is a plain
 * `!==` string comparison against `'human'`, performed first, with no
 * case-insensitive, trimmed, or prefix-matching allowance.
 *
 * On human approval, the case moves to `'decided'`. The function never
 * touches `obligations`, `criteria`, or any other field that could weaken a
 * required obligation or protected criterion -- it only ever replaces
 * `proposal` and `status`/`updatedAt`.
 */
export function reviewProposal(
  caseState: CaseState,
  decision: ReviewProposalInput,
  clock: Clock,
): CaseState {
  if (decision.actor !== 'human') {
    throw new PolicyViolationError(
      `Only a human actor may review a decision proposal; received actor "${decision.actor}".`,
      {
        details: { actor: decision.actor, caseId: caseState.id, proposalId: decision.proposalId },
      },
    );
  }

  const proposal = caseState.proposal;
  if (proposal === null) {
    throw new ValidationFailedError(`Case "${caseState.id}" has no pending proposal to review.`, {
      details: { caseId: caseState.id, proposalId: decision.proposalId },
    });
  }

  if (proposal.id !== decision.proposalId) {
    throw new ValidationFailedError(
      `Proposal id "${decision.proposalId}" does not match the case's pending proposal "${proposal.id}".`,
      {
        details: {
          caseId: caseState.id,
          expectedProposalId: proposal.id,
          receivedProposalId: decision.proposalId,
        },
      },
    );
  }

  if (proposal.status !== 'pending') {
    throw new ValidationFailedError(
      `Proposal "${proposal.id}" has already been reviewed (status: "${proposal.status}").`,
      { details: { caseId: caseState.id, proposalId: proposal.id, status: proposal.status } },
    );
  }

  if (decision.decision === 'request_revision' && decision.instructions === undefined) {
    throw new ValidationFailedError(
      'instructions is required when decision is "request_revision".',
      {
        details: { caseId: caseState.id, proposalId: proposal.id },
      },
    );
  }

  const reviewedAt = clock.now();
  const nextProposal: DecisionProposal = {
    ...proposal,
    status: mapDecisionToProposalStatus(decision.decision),
    reviewedAt,
    reviewedByActor: 'human',
    ...(decision.decision === 'request_revision' && decision.instructions !== undefined
      ? { revisionInstructions: decision.instructions }
      : {}),
    // See judgment call #4 above: a reviewer-supplied reason is persisted
    // for every decision, never fabricated when absent.
    ...(decision.reason !== undefined ? { reviewReason: decision.reason } : {}),
  };

  return {
    ...caseState,
    status: decision.decision === 'approve' ? 'decided' : caseState.status,
    proposal: nextProposal,
    updatedAt: reviewedAt,
  };
}
