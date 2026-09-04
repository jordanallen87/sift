/**
 * Pure derivation for the answer-first hero region (`RecommendationHero.tsx`)
 * that merges the recommendation and the human decision into one region
 * driven by one state machine (`docs/decisions/
 * 0004-consumer-workspace-information-architecture.md`, decision item 1;
 * `docs/change-sets/2026-08-30-generic-decision-workspace.md` §33-§42, §64).
 *
 * This module used to derive a *separate* four-stage progress tracker
 * (Started/Investigating/Pick ready/Decided) and next-step banner rendered
 * by the now-retired `WorkspaceStatusHeader`, positioned above -- and
 * disconnected from -- `RecommendationCard`/`ApprovalCard` further down the
 * page. ADR 0004 identifies exactly this seam as the root cause of a real
 * defect: `ApprovalCard` could render "Your decision: No proposal is
 * pending review yet." directly beneath a recommendation region reading
 * "Our pick: READY FOR REVIEW" -- two regions asserting an unreconciled
 * state to the same reader in the same glance, because they had no shared
 * source of truth for "what does Sift currently think, and what, if
 * anything, do you need to do about it." `deriveWorkspaceStatus` is that
 * shared source of truth now: it is still the one place the "what happens
 * next" priority order lives (the underlying logic below is deliberately
 * the same priority chain the original next-step banner used, extended
 * with a `phase` discriminant), but its output now drives ONE region
 * instead of two, so it cannot disagree with itself.
 *
 * The four-stage dot tracker (`WORKSPACE_STAGES` in the retired version of
 * this file) is deliberately NOT carried forward. ADR 0004 decision 4
 * quotes change-set §37 directly: "Do not make lifecycle visualization
 * dominate the page after onboarding. Once inside an active comparison,
 * workspace views are more valuable than a giant permanent process
 * tracker." `phase` still exists as a typed value here (so the hero and its
 * tests can key off it), but nothing renders it as a multi-step visual
 * stepper anymore -- only the phase-appropriate headline/detail/action
 * text does.
 *
 * `HeroPhase` is the five states change-set item 1 names directly:
 * "nothing investigated yet / investigating / recommendation ready but
 * blocked by open questions / decision pending approval / decided." A
 * sixth combination -- `proposal.status` settled as `rejected` or
 * `revision_requested` rather than `approved` -- is folded into `'decided'`
 * too (a judgment call, recorded in the build report for this task): the
 * change set's five-phase list does not separately name these two
 * outcomes, and `ApprovalCard`'s own already-correct, already-tested
 * "settled" branch (`SETTLED_STATUS_META`) already renders a distinct
 * Approved/Rejected/Revision-requested stamp for each, so `'decided'` here
 * means "the human has rendered *a* verdict on this proposal," not
 * specifically "approved."
 */
import { PUBLIC_ACTIVITY_EVENT_TYPES } from '@sift/contracts';
import type {
  DecisionProposal,
  PublicActivityEvent,
  PublicActivityEventType,
  PublicActivityPhase,
  Recommendation,
} from '@sift/contracts';

/**
 * The two `PublicActivityPhase` values that END a lifecycle rather than
 * describe a step within one (`packages/contracts/src/events.ts`:
 * `queued | active | waiting | completed | failed`). Read straight off that
 * union so a new non-terminal phase cannot silently be treated as terminal.
 */
const TERMINAL_PHASES: readonly PublicActivityPhase[] = ['completed', 'failed'];

/**
 * The subset of `PublicActivityEventType` that reports the RUN's own
 * lifecycle -- `run.queued`, `run.started`, `run.completed`, `run.failed`
 * (`apps/agent/src/services/run-service.ts` appends the first;
 * `apps/agent/src/runtime/car-purchase-engine.ts` and `home-energy-engine.ts`
 * append the other three). Derived from the contract's own type list rather
 * than written out here, so a later run-lifecycle event type is picked up by
 * construction instead of being missed by a hand-maintained copy.
 *
 * Every OTHER activity type reports the lifecycle of something *inside* a
 * run -- a tool call, a skill activation, a specialist handoff -- and each of
 * those reaches `phase: 'completed'` many times over the course of one run
 * that is still very much in flight. That distinction is the whole point of
 * this set: only a run-lifecycle event in a terminal phase ends the run.
 */
const RUN_LIFECYCLE_EVENT_TYPES: ReadonlySet<PublicActivityEventType> = new Set(
  PUBLIC_ACTIVITY_EVENT_TYPES.filter((type) => type.startsWith('run.')),
);

/**
 * The id of the run currently in flight, or `null` when no run is.
 *
 * Replaces a derivation that asked only "does the most recent event carry a
 * non-terminal phase?" -- which is not a question about the run at all.
 * Roughly half of a real run's ~73 correlated events (`tool.completed`,
 * `skill.activated`, `specialist.completed`) legitimately carry
 * `phase: 'completed'` while the run continues, so that predicate flickered
 * false on every one of them, and `deriveWorkspaceStatus` below answered
 * "Nothing's been looked into yet." mid-investigation. Invisible only while
 * the whole burst lands inside one ~70 ms frame; once the runtime streams
 * events as the graph progresses, it becomes a visible reversion to the
 * empty state in the middle of a run.
 *
 * The run's ACTUAL lifecycle, as the event contract represents it: a run
 * opens at `run.queued` and every event correlated to it carries its
 * `runId`; it ends when a run-lifecycle event for that same `runId` reports
 * a terminal phase (`run.completed`, or `run.failed` -- which can also
 * follow `run.queued` directly, with no `run.started` in between, when an
 * investigation is refused up front). Only the newest run is considered
 * (the highest-sequence event carrying any `runId`), so a run that died
 * without ever emitting its terminal event cannot pin the workspace to
 * "investigating" forever once a later run has finished.
 *
 * Order-independent by construction: the terminal check scans every event
 * correlated to the run rather than trusting arrival order, so a replayed
 * backlog, a duplicate delivery, or a post-terminal event that still
 * carries the `runId` all reach the same answer.
 */
export function deriveActiveRunId(events: readonly PublicActivityEvent[]): string | null {
  let latestRunId: string | null = null;
  let latestSequence = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    if (event.runId === undefined) continue;
    if (event.sequence > latestSequence) {
      latestSequence = event.sequence;
      latestRunId = event.runId;
    }
  }
  if (latestRunId === null) return null;

  const ended = events.some(
    (event) =>
      event.runId === latestRunId &&
      RUN_LIFECYCLE_EVENT_TYPES.has(event.type) &&
      TERMINAL_PHASES.includes(event.phase),
  );
  return ended ? null : latestRunId;
}

export const HERO_PHASES = [
  'not_started',
  'investigating',
  'ready_blocked',
  'pending_approval',
  'decided',
] as const;
export type HeroPhase = (typeof HERO_PHASES)[number];

export type HeroActionKind = 'request_investigation' | 'review_findings';

/**
 * A verdict a human has actually rendered on a `DecisionProposal` -- the
 * three settled outcomes, never `'pending'`.
 */
export type SettledDecision = Exclude<DecisionProposal['status'], 'pending'>;

export interface HeroAction {
  label: string;
  kind: HeroActionKind;
}

export interface WorkspaceStatusInput {
  /**
   * Whether a run is currently in flight. Callers derive this with
   * `deriveActiveRunId` above rather than inspecting the latest event's
   * phase -- see that function for why the two are not the same question.
   */
  isRunActive: boolean;
  recommendation: Recommendation | null;
  proposal: DecisionProposal | null;
  flaggedFindingsCount: number;
  /**
   * Human label of `recommendation.favoredOptionId`, when the caller can
   * resolve it from `CaseState.entities`.
   *
   * The hero is the answer-first region (ADR 0004), and until this existed
   * the one phase that actually *had* an answer was the only phase whose
   * headline did not state it: a completed investigation favouring the RAV4
   * rendered the words "Current recommendation" with the car named nowhere
   * above the fold. Found by `pnpm test:journey`, which asks after every
   * turn whether the screen and the case agree; the state said
   * `favoredOptionId: candidate-rav4` and the screen said a section label
   * (ADR 0014).
   *
   * Optional because a caller that cannot resolve the label must fall back
   * to the generic heading rather than render a dangling "Leading so far:".
   */
  favoredOptionLabel?: string;
  /**
   * True exactly when the most recent draft was withheld by validation
   * (a `draft.withheld` `PublicActivityEvent`) and no recommendation has
   * been produced/accepted yet. Distinguishes "investigating, nothing
   * found yet" from "investigating, found something plausible but held it
   * back for concrete, statable reasons" (change-set §38's "Not ready yet"
   * with concrete reasons, e.g. "2 important things still need
   * checking.").
   */
  withheld?: boolean;
}

export interface WorkspaceStatus {
  phase: HeroPhase;
  /**
   * The single headline the hero renders, first, above everything else.
   * Never "Our pick" before readiness is earned (change-set §38) -- prefers
   * "Current recommendation" once one exists, and an honest "not ready yet"
   * framing otherwise.
   */
  headline: string;
  /** Optional supporting detail -- concrete reasons a decision isn't ready, or reassurance nothing is needed from the human right now. Omitted (not an empty string) when there is nothing true and useful to add beyond the headline. */
  detail?: string;
  /**
   * The hero's own next action, when exactly one applies. Deliberately
   * omitted once the real controls for this phase (`ApprovalCard`'s
   * Approve/Reject/Revise, or the settled decision stamp) are already
   * rendered directly in the same region -- this module never asks the
   * hero to show a second, redundant button next to a real control.
   */
  action?: HeroAction;
  /**
   * The verdict the human rendered, present exactly in the `decided` phase
   * and absent everywhere else.
   *
   * It travels with the phase because a settled case must not keep
   * describing itself as awaiting one, and only this module knows when that
   * is true. The release baseline screenshot
   * (`decided-chatgpt-pane-640-darwin.png`) caught the alternative: the
   * orientation row read "Decided", this module's own headline read
   * "Decided.", and the status chip inside the same region still read
   * "READY FOR REVIEW" -- because that chip was derived from
   * `Recommendation.status`, which is a fact about the recommendation
   * object and stays `'ready'` forever after the human answers. "Ready for
   * review" is a claim that a person still has to act; on a case they have
   * already acted on it is stale, exactly as the dock offering "Confirm
   * what moves forward" on a closed case was (`deriveNextMoves`,
   * packages/core/src/discovery.ts).
   *
   * Deriving it here rather than letting the chip read the proposal
   * directly keeps the ADR 0004 guarantee intact: one region, one state
   * machine, so the headline and the chip cannot disagree about whether a
   * decision has been made.
   */
  settledDecision?: SettledDecision;
}

function pluralFinding(count: number): string {
  return count === 1 ? 'finding' : 'findings';
}

const DECIDED_HEADLINE: Record<Exclude<DecisionProposal['status'], 'pending'>, string> = {
  approved: 'Decided.',
  rejected: 'Rejected. Sift can keep looking if you want another recommendation.',
  revision_requested: 'Revision requested. Sift will bring back an updated recommendation.',
};

export function deriveWorkspaceStatus(input: WorkspaceStatusInput): WorkspaceStatus {
  const {
    isRunActive,
    recommendation,
    proposal,
    flaggedFindingsCount,
    withheld = false,
    favoredOptionLabel,
  } = input;
  const named = favoredOptionLabel !== undefined && favoredOptionLabel.trim() !== '';

  // Priority order mirrors the original next-step banner exactly (a settled
  // or pending proposal always wins, since it is the most consequential
  // real-world state), with `decided` and `pending_approval` now split into
  // their own named phases per change-set item 1's five-state list, instead
  // of both being folded into a single "decided" tracker stage the way the
  // retired four-stage tracker did.
  if (proposal !== null && proposal.status !== 'pending') {
    return {
      phase: 'decided',
      headline: DECIDED_HEADLINE[proposal.status],
      settledDecision: proposal.status,
    };
  }

  if (proposal !== null && proposal.status === 'pending') {
    return {
      phase: 'pending_approval',
      headline: named
        ? `Sift recommends ${favoredOptionLabel}.`
        : 'Sift has a recommendation ready for your decision.',
      ...(named ? { detail: 'Your decision.' } : {}),
    };
  }

  // "Recommendation ready but blocked by open questions": a real
  // recommendation exists, or a draft was withheld with concrete stated
  // reasons, or there are flagged findings that have not yet resolved into
  // either of those -- any of the three means there is something real to
  // show the human below the headline, even though no proposal exists yet
  // for them to act on. `recommendation !== null` and `withheld` are
  // checked ahead of `flaggedFindingsCount` so the headline reflects the
  // more concrete signal (an actual recommendation, or a stated reason)
  // over a bare count when more than one is true at once.
  if (recommendation !== null || withheld || flaggedFindingsCount > 0) {
    const detail =
      flaggedFindingsCount > 0
        ? `${flaggedFindingsCount} ${pluralFinding(flaggedFindingsCount)} may need a closer look before Sift can finish.`
        : undefined;
    // "Leading so far", never "Our pick": readiness is by definition NOT
    // earned in this phase (change-set §38), so the headline names the
    // answer without claiming it is settled. Naming it is the point --
    // this is the answer-first region, and a person should not have to
    // scroll to learn which option is ahead.
    return {
      phase: 'ready_blocked',
      headline:
        recommendation !== null
          ? named
            ? `Leading so far: ${favoredOptionLabel}`
            : 'Current recommendation'
          : 'Not ready yet',
      ...(detail !== undefined ? { detail } : {}),
      ...(flaggedFindingsCount > 0
        ? { action: { label: 'Review findings', kind: 'review_findings' as const } }
        : {}),
    };
  }

  if (isRunActive) {
    return {
      phase: 'investigating',
      headline: 'Sift is investigating.',
      detail: 'Nothing needed from you right now.',
    };
  }

  return {
    phase: 'not_started',
    headline: "Nothing's been looked into yet.",
    action: { label: 'Request investigation', kind: 'request_investigation' },
  };
}
