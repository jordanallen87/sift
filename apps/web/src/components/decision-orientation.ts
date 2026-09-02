/**
 * Turns case state into the six answers `DecisionOrientationShell` renders.
 *
 * Kept out of the component for the usual reason — a pure function is
 * testable without a DOM — but also for a specific one: the phase, the focus,
 * and the next step are *claims about the decision*, and claims belong
 * somewhere they can be asserted directly rather than inferred from rendered
 * text.
 *
 * Two rules run through everything here:
 *
 * 1. **Never fill a field with a placeholder.** `currentFocus` and
 *    `latestChange` are `null` when there genuinely is nothing to say. A
 *    shell that says "In focus: —" has started lying in a small way, and the
 *    person stops trusting the rest of it.
 * 2. **`nextStepLabel` is never empty.** It is the one answer the pane owes a
 *    person at every moment, including before a pack has finished loading.
 */
import type { CaseState, CompiledDecisionPack } from '@sift/contracts';
import { deriveDiscoveryReadiness, deriveNextMoves } from '@sift/core';
import type { DecisionOrientation } from './DecisionOrientationShell.js';

/**
 * The phases a person moves through, and what each one is called in the
 * pane. The left column is the state machine's word and appears only in
 * `data-` attributes; the right is what renders.
 */
const PHASE_LABELS: Record<string, string> = {
  discovery: 'Understanding what you need',
  blind_spot_review: 'Checking for anything missed',
  discovering_candidates: 'Finding models that fit',
  triage: 'Narrowing down what you found',
  investigating: 'Looking into what you kept',
  deciding: 'Ready for your decision',
  decided: 'Decided',
};

const ROUTE_TO_OUTCOME: Record<string, string> = {
  discovery: 'Then one quick check for anything missed, and Sift searches the catalog.',
  blind_spot_review: 'Then Sift searches the catalog and you triage what it finds.',
  discovering_candidates: 'Then you keep or pass on each one, and Sift digs into what you keep.',
  triage: 'Then Sift investigates what you kept and shows you where things stand.',
  investigating: 'Then you confirm which models are worth going to see.',
  deciding: 'Confirming the shortlist is yours alone — Sift cannot do it for you.',
  decided: 'This decision is complete. Nothing further is needed.',
};

const FALLBACK_NEXT_STEP = 'Open the case to see where it stands';

function phaseOf(caseState: CaseState, readiness: ReturnType<typeof deriveDiscoveryReadiness>) {
  if (caseState.status === 'decided') return 'decided';
  if (caseState.recommendation !== null && caseState.recommendation.status === 'ready') {
    return 'deciding';
  }

  const candidates = caseState.entities.filter((entity) => entity.kind === 'candidate');
  if (candidates.length > 0) {
    const dispositions = new Map(
      (caseState.discovery?.dispositions ?? []).map((record) => [
        record.entityId,
        record.disposition,
      ]),
    );
    const untriaged = candidates.filter(
      (candidate) => (dispositions.get(candidate.id) ?? 'unreviewed') === 'unreviewed',
    );
    return untriaged.length > 0 ? 'triage' : 'investigating';
  }

  if (readiness.readyToDiscover) return 'discovering_candidates';

  const requiredComplete =
    readiness.coverage.requiredResolved === readiness.coverage.requiredTotal &&
    readiness.coverage.requiredTotal > 0;
  return requiredComplete ? 'blind_spot_review' : 'discovery';
}

/**
 * The last thing that actually changed about the decision, in the person's
 * own words where possible.
 *
 * Read from the most recently updated *answered* topic rather than from the
 * activity stream: the activity stream carries plenty of things that are not
 * changes to the decision (a view switch, a poll), and the shell's job here
 * is to remind someone what they told Sift, not to narrate the system.
 */
function latestChangeOf(caseState: CaseState): string | null {
  const answered = (caseState.discovery?.topics ?? []).filter(
    (topic) => topic.valueSummary !== undefined && topic.status !== 'unknown',
  );
  if (answered.length === 0) return null;

  const latest = answered.reduce((newest, topic) =>
    topic.updatedAt > newest.updatedAt ? topic : newest,
  );
  return latest.status === 'inferred_pending'
    ? `Sift read this as: ${latest.valueSummary ?? ''}`
    : `You said: ${latest.valueSummary ?? ''}`;
}

export function buildDecisionOrientation(
  caseState: CaseState,
  pack: CompiledDecisionPack | null,
): DecisionOrientation {
  /**
   * A case that arrived with candidates but never ran discovery -- the
   * seeded demo cases do exactly this -- gets no coverage claim.
   *
   * Found by rendering it: the shell showed "Narrowing down what you found"
   * directly above "0 of 5 covered", which is two contradictory statements
   * about the same case, and precisely the state/UI contradiction the
   * persona hard gates exist to fail. Neither number was wrong on its own;
   * the pairing was. Reporting the phase honestly and declining to invent a
   * denominator for a journey that never asked a question is the truthful
   * reading.
   */
  const startedDiscovery = caseState.discovery !== undefined;

  if (pack === null || !startedDiscovery) {
    // The packs request can still be in flight while a case renders. Report
    // what is genuinely known and no more — an invented coverage denominator
    // here would be a number the person could watch change for no reason.
    const emptyCoverage = {
      requiredTotal: 0,
      requiredResolved: 0,
      softTotal: 0,
      softResolved: 0,
      blindSpotReviewComplete: false,
    } as const;
    const phase =
      pack === null
        ? 'discovery'
        : phaseOf(caseState, {
            ...deriveDiscoveryReadiness(caseState, pack),
            coverage: emptyCoverage,
            readyToDiscover: false,
          });
    const moves = pack === null ? [] : deriveNextMoves(caseState, pack);

    return {
      decisionTitle: caseState.title,
      packName: packNameFor(caseState, pack),
      phase,
      phaseLabel: PHASE_LABELS[phase] ?? 'In progress',
      coverage: emptyCoverage,
      currentFocus: null,
      latestChange: latestChangeOf(caseState),
      nextStepLabel: moves[0]?.label ?? FALLBACK_NEXT_STEP,
      routeToOutcome: ROUTE_TO_OUTCOME[phase] ?? '',
      provisional: false,
    };
  }

  const readiness = deriveDiscoveryReadiness(caseState, pack);
  const moves = deriveNextMoves(caseState, pack);
  const phase = phaseOf(caseState, readiness);

  const focusTopic =
    readiness.nextTopicId === null
      ? undefined
      : readiness.topics.find((topic) => topic.topicId === readiness.nextTopicId);

  const nextStepLabel = moves[0]?.label ?? FALLBACK_NEXT_STEP;
  const focusLabel = focusTopic?.label ?? null;

  return {
    decisionTitle: caseState.title,
    packName: packNameFor(caseState, pack),
    phase,
    phaseLabel: PHASE_LABELS[phase] ?? 'In progress',
    coverage: readiness.coverage,
    // Suppressed when it would merely repeat the next step. "In focus:
    // Budget" directly above "Next: Budget" is two lines saying one thing,
    // and it crowds out the lines that are saying different things.
    currentFocus: focusLabel === nextStepLabel ? null : focusLabel,
    latestChange: latestChangeOf(caseState),
    nextStepLabel,
    routeToOutcome: ROUTE_TO_OUTCOME[phase] ?? '',
    provisional: readiness.provisional,
  };
}

/**
 * The pack name, unless the case is already called that.
 *
 * A demo case's title *is* the pack name, so rendering both put "Vehicle
 * Selection" on screen twice inside the shell and three times counting the
 * app bar above it. An empty string here means the shell renders no pack
 * chip at all.
 */
function packNameFor(caseState: CaseState, pack: CompiledDecisionPack | null): string {
  const name = pack?.identity.name ?? caseState.pack.id;
  return name === caseState.title ? '' : name;
}
