/**
 * Pure derivation for the workspace's "next step" banner and progress
 * tracker (round-2 design review, "Knowing what to do next"). Answers two
 * questions the project owner flagged as missing after seeing the live
 * product: "where do I start" and "what do I do next."
 *
 * Deliberately NOT a literal checkout-style stepper: Sift investigates on
 * its own and only truly gates on human approval, so a stage can revert
 * from `done` back to `current` (e.g. new criteria invalidate a ready
 * recommendation) without that being a bug -- the same way a delivery
 * tracker can show "delayed, back in transit" after "out for delivery."
 *
 * Every input here is already computed elsewhere in `App.tsx` from real
 * snapshot/event data (`isRunActive`, `flaggedFindingsCount`) -- this module
 * owns no new source of truth, only the priority/derivation logic, which is
 * why it is a plain function rather than a hook: fully testable without
 * rendering.
 *
 * Deliberately does NOT take a raw "does this case have any events at all"
 * signal: a freshly seeded case already carries real bookkeeping events
 * (e.g. "Added option ...", "Command accepted") before any investigation
 * has ever been requested, which made an earlier version of this function
 * wrongly report "You're all caught up" on a case nobody had looked into
 * yet -- caught by visually inspecting a regenerated Playwright baseline,
 * not by a unit test (see this task's dated build-log entry). `recommendation
 * === null` is the honest signal for "Sift hasn't produced anything yet."
 *
 * `flaggedFindingsCount` intentionally counts only non-passing verdict or
 * staleness (`evidenceLink.verdict !== 'pass' || evidenceLink.stale`), not
 * `evidence.conflicted` events -- conflict ids are not currently
 * correlated from the public activity stream back onto individual
 * evidence items (see docs/build-log.md's dated entry for this task), so
 * counting them here would silently overclaim a signal that never fires
 * in production today. A disclosed, deliberate scope cut, not an oversight.
 */
import type { DecisionProposal, Recommendation } from '@sift/contracts';

export const WORKSPACE_STAGES = ['started', 'investigating', 'pick-ready', 'decided'] as const;
export type WorkspaceStage = (typeof WORKSPACE_STAGES)[number];
export type WorkspaceStageState = 'done' | 'current' | 'upcoming';

export const WORKSPACE_STAGE_LABEL: Record<WorkspaceStage, string> = {
  started: 'Started',
  investigating: 'Investigating',
  'pick-ready': 'Pick ready',
  decided: 'Decided',
};

export type NextStepTone = 'open' | 'active' | 'accepted' | 'ready' | 'calm';

export interface NextStep {
  tone: NextStepTone;
  text: string;
  action?: { label: string };
}

export interface WorkspaceStatusInput {
  isRunActive: boolean;
  recommendation: Recommendation | null;
  proposal: DecisionProposal | null;
  flaggedFindingsCount: number;
}

export interface WorkspaceStatus {
  stages: { stage: WorkspaceStage; state: WorkspaceStageState }[];
  nextStep: NextStep;
}

function pluralFinding(count: number): string {
  return count === 1 ? 'finding' : 'findings';
}

export function deriveWorkspaceStatus(input: WorkspaceStatusInput): WorkspaceStatus {
  const { isRunActive, recommendation, proposal, flaggedFindingsCount } = input;

  const recommendationExists = recommendation !== null;
  const pickReady = recommendation !== null && recommendation.status === 'ready';
  const proposalExists = proposal !== null;
  const decidedSettled = proposal !== null && proposal.status !== 'pending';

  // Each boundary below is "have we moved at least this far," not "is this
  // stage still active" -- see the file header for why a boundary already
  // crossed (e.g. `pickReady`) can become false again later (recommendation
  // goes stale) without that being a bug. The car-purchase engine always
  // appends `recommendation.ready` immediately followed by
  // `proposal.proposed` in the same run (see car-purchase-engine.ts), so
  // `pickReady` and `proposalExists` are effectively the same real-world
  // moment -- either one is enough to have crossed into the "decided"
  // stage's territory.
  //
  // "Started" has no gate at all: this component only ever renders once a
  // case snapshot already exists (`App.tsx`), so the case having "started"
  // is true by construction the moment this function is called -- there is
  // no genuinely-earlier real-world state for it to distinguish.
  //
  // `isRunActive` deliberately does NOT advance `furthestIndex` on its
  // own: an active run without a recommendation yet is still honestly
  // described as "Investigating" being the current stage, exactly like a
  // freshly started case with no run yet -- both are "this is the stage
  // we're at or heading into next," matching the delivery-tracker model
  // this component is built on (see the file header). Only a genuine
  // *result* (a recommendation or proposal) moves the boundary forward.
  const pastInvestigating = recommendationExists || proposalExists;
  const pastPickReady = pickReady || proposalExists;

  const furthestIndex = pastPickReady ? 3 : pastInvestigating ? 2 : 1;

  const stages = WORKSPACE_STAGES.map((stage, index) => {
    if (index < furthestIndex) return { stage, state: 'done' as const };
    if (index > furthestIndex) return { stage, state: 'upcoming' as const };
    if (stage === 'decided' && decidedSettled) return { stage, state: 'done' as const };
    return { stage, state: 'current' as const };
  });

  const nextStep: NextStep =
    proposal !== null && proposal.status === 'pending'
      ? {
          tone: 'ready',
          text: 'Sift has a pick ready. Review it and approve, or send Sift back to look further.',
          action: { label: 'Go to Our pick' },
        }
      : flaggedFindingsCount > 0
        ? {
            tone: 'accepted',
            text: `${flaggedFindingsCount} ${pluralFinding(flaggedFindingsCount)} may need a closer look before Sift can finish.`,
            action: { label: 'Review findings' },
          }
        : isRunActive
          ? {
              tone: 'active',
              text: 'Sift is investigating in the background. Nothing needed from you right now.',
            }
          : recommendation === null
            ? {
                tone: 'open',
                text: "Nothing's been looked into yet.",
                action: { label: 'Request investigation' },
              }
            : {
                tone: 'calm',
                text: "You're all caught up. Sift will let you know if anything changes.",
              };

  return { stages, nextStep };
}
