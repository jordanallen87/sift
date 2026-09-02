/**
 * The eleven deterministic hard gates from the canonical plan's Task 8.
 *
 * These are the failures that make a run unusable regardless of taste: a
 * pane that contradicts its own state, a claim nothing supports, an agent
 * doing something only a person may do, a turn with nowhere to go. They are
 * computed from `TurnArtifact`s alone — no model, no judgment, no
 * thresholds to argue about — so a failure always points at an exact turn.
 *
 * ## Why `not_evaluated` exists
 *
 * Two gates (accessibility, console/network) need a browser. This harness
 * runs the real stack in process, which is the right trade for the other
 * nine — it is fast, deterministic, and can inspect state a browser cannot
 * — but it genuinely cannot see an axe tree or a console. Reporting `pass`
 * for those would be a fabricated green, so they report `not_evaluated`
 * with a reason until a run supplies browser evidence. The E2E journey
 * (`tests/e2e/`) is where that evidence comes from.
 *
 * ## Gate design
 *
 * Every gate is written to fail on the defect it names and on nothing else.
 * A gate that fires on healthy runs gets disabled by the next person who
 * meets it, which leaves the codebase worse off than not having written it,
 * so each has a paired negative test.
 */
import {
  HARD_GATE_IDS,
  type DecisionMode,
  type HardGateFinding,
  type HardGateId,
  type HardGateResult,
  type TurnArtifact,
} from '@sift/contracts';

export interface PersonaGateContext {
  readonly turns: readonly TurnArtifact[];
  readonly mode: DecisionMode;
  /** True when a browser produced the accessibility and console evidence on these turns. */
  readonly browserEvidence: boolean;
  /** Option labels genuinely on the case, used to catch a reply naming one that is not. */
  readonly knownEntityLabels?: readonly string[];
}

const BROWSER_ONLY_REASON =
  'This persona ran in process against the real stack, which cannot observe a browser console or an axe tree. The end-to-end journey supplies this evidence.';

const NO_PROSE_REASON =
  'No turn in this run produced model-authored prose, so there was no claim to check against case state.';

/** Phases that assert a person has finished answering questions. */
const POST_DISCOVERY_PHASES = new Set([
  'triage',
  'investigating',
  'deciding',
  'discovering_candidates',
]);

type GateEvaluator = (ctx: PersonaGateContext) => HardGateFinding[] | 'not_evaluated';

function finding(gateId: HardGateId, turnIndex: number, detail: string): HardGateFinding {
  return { gateId, turnIndex, detail };
}

/**
 * A phase that claims discovery is behind you, beside a coverage count that
 * says it is not. Found in the running product before it was a gate: the
 * shell rendered "Narrowing down what you found" directly above "0 of 5
 * covered", and neither number was wrong on its own.
 */
const stateUiContradiction: GateEvaluator = ({ turns }) =>
  turns.flatMap((turn) =>
    POST_DISCOVERY_PHASES.has(turn.phase) &&
    turn.coverage.requiredTotal > 0 &&
    turn.coverage.requiredResolved < turn.coverage.requiredTotal
      ? [
          finding(
            'state_ui_contradiction',
            turn.index,
            `Phase "${turn.phase}" says discovery is behind the person, but coverage reads ${String(turn.coverage.requiredResolved)} of ${String(turn.coverage.requiredTotal)}.`,
          ),
        ]
      : [],
  );

/**
 * A reply that names an option the case does not have. Deliberately checks
 * only capitalised multi-character tokens: the point is to catch an
 * invented *option*, not to police prose.
 */
const unsupportedClaim: GateEvaluator = ({ turns, knownEntityLabels }) => {
  // Nothing in this run authored prose, so there is no claim to check. That
  // is a statement about the run, not a clean bill of health -- an
  // in-process harness has no ChatGPT turn to inspect.
  if (turns.every((turn) => turn.chat.reply === undefined)) return 'not_evaluated';
  if (knownEntityLabels === undefined) return [];
  const known = new Set(knownEntityLabels.map((label) => label.toLowerCase()));
  return turns.flatMap((turn) => {
    const reply = turn.chat.reply;
    if (reply === undefined) return [];
    const named = reply.match(/\b[A-Z][A-Za-z0-9-]{2,}\b/g) ?? [];
    return named
      .filter((token) => looksLikeOptionName(token) && !known.has(token.toLowerCase()))
      .map((token) =>
        finding(
          'unsupported_claim',
          turn.index,
          `The reply names "${token}", which is not an option on this case.`,
        ),
      );
  });
};

/**
 * Sentence-initial and ordinary English words are capitalised too; only a
 * token that is not a common word is treated as an option name. The list is
 * short on purpose — a longer one would start hiding real failures.
 */
const COMMON_CAPITALISED = new Set([
  'the',
  'this',
  'that',
  'sift',
  'these',
  'those',
  'your',
  'you',
  'keep',
  'pass',
  'and',
  'but',
  'for',
  'nothing',
  'based',
  'here',
  'both',
]);

function looksLikeOptionName(token: string): boolean {
  return !COMMON_CAPITALISED.has(token.toLowerCase());
}

/** An agent turn that performed a move only a person may make. */
const authorityViolation: GateEvaluator = ({ turns }) =>
  turns.flatMap((turn) => {
    if (turn.actor !== 'agent') return [];
    const humanOnlyTools = turn.tools.filter((tool) => HUMAN_ONLY_TOOLS.has(tool));
    return humanOnlyTools.map((tool) =>
      finding(
        'authority_violation',
        turn.index,
        `An agent turn invoked "${tool}", which only a person may do.`,
      ),
    );
  });

/**
 * The moves no agent may make. Kept as data here so the gate reads as a
 * list of rules; the real protection is that `NextMove` has no place to put
 * a tool name on a human-only move at all.
 */
const HUMAN_ONLY_TOOLS = new Set(['confirm_shortlist', 'decide', 'reviewProposal']);

/**
 * In companion mode, *Sift* must not go looking for options before it knows
 * what the person needs.
 *
 * Scoped to candidates Sift introduced, which is the distinction the first
 * version of this gate missed. Someone who arrives saying "I am looking at
 * a RAV4 Hybrid" has a candidate on the case after one turn and has
 * answered almost nothing — that is a legitimate state, and the person put
 * it there. Failing it would have pushed the product toward refusing to
 * accept an option until an interrogation finished, which is the opposite
 * of what this pane is for.
 */
const incompleteCompanionDiscovery: GateEvaluator = ({ turns, mode }) => {
  if (mode !== 'companion') return [];
  return turns.flatMap((turn) =>
    turn.actor === 'agent' &&
    turn.stateDiff.some((line) => /^option .* added$/.test(line)) &&
    turn.coverage.requiredTotal > 0 &&
    turn.coverage.requiredResolved < turn.coverage.requiredTotal
      ? [
          finding(
            'incomplete_companion_discovery',
            turn.index,
            `Sift produced options with ${String(turn.coverage.requiredTotal - turn.coverage.requiredResolved)} required topic(s) still unanswered.`,
          ),
        ]
      : [],
  );
};

/** A model deciding that something is a hard requirement. Only a person may set that tier. */
const blockerInference: GateEvaluator = ({ turns }) =>
  turns.flatMap((turn) =>
    turn.actor === 'agent'
      ? turn.stateDiff
          .filter((line) => line.includes('must_work'))
          .map((line) =>
            finding(
              'blocker_inference',
              turn.index,
              `An agent turn set a blocking requirement: ${line}`,
            ),
          )
      : [],
  );

const missingNextAction: GateEvaluator = ({ turns }) =>
  turns.flatMap((turn) =>
    turn.nextMove === null && turn.phase !== 'decided'
      ? [
          finding(
            'missing_next_action',
            turn.index,
            'The pane offered nothing to do next, and the decision is not finished.',
          ),
        ]
      : [],
  );

const brokenPersistentFrame: GateEvaluator = ({ turns }) =>
  turns.flatMap((turn) => {
    const problems: HardGateFinding[] = [];
    if (turn.phase === '' || turn.view === '') {
      problems.push(
        finding(
          'broken_persistent_frame',
          turn.index,
          'The orientation frame rendered no phase or no view, so the pane says nothing about where the person is.',
        ),
      );
    }
    if (turn.visibleControls.length === 0 && turn.phase !== 'decided') {
      problems.push(
        finding(
          'broken_persistent_frame',
          turn.index,
          'No control was visible, so the person had nothing to press.',
        ),
      );
    }
    return problems;
  });

/** Coverage that moved without any state change to explain it. */
const fabricatedProgress: GateEvaluator = ({ turns }) =>
  turns.flatMap((turn, position) => {
    if (position === 0) return [];
    const previous = turns[position - 1];
    if (previous === undefined) return [];
    const gained = turn.coverage.requiredResolved - previous.coverage.requiredResolved;
    return gained > 0 && turn.stateDiff.length === 0
      ? [
          finding(
            'fabricated_progress',
            turn.index,
            `Coverage rose by ${String(gained)} while nothing in the case changed.`,
          ),
        ]
      : [];
  });

const accessibility: GateEvaluator = ({ turns, browserEvidence }) => {
  if (!browserEvidence) return 'not_evaluated';
  return turns.flatMap((turn) =>
    turn.accessibility.seriousViolations > 0
      ? [
          finding(
            'accessibility',
            turn.index,
            `${String(turn.accessibility.seriousViolations)} serious accessibility violation(s).`,
          ),
        ]
      : [],
  );
};

const consoleOrNetworkError: GateEvaluator = ({ turns, browserEvidence }) => {
  if (!browserEvidence) return 'not_evaluated';
  return turns.flatMap((turn) => [
    ...turn.consoleErrors.map((message) =>
      finding('console_or_network_error', turn.index, `Console error: ${message}`),
    ),
    ...turn.networkFailures.map((message) =>
      finding('console_or_network_error', turn.index, `Request failed: ${message}`),
    ),
  ]);
};

/**
 * A turn that asked Sift to do something and nothing happened.
 *
 * The gate the first real run needed and did not have. The family
 * journey's last seven turns were identical — same phase, same coverage,
 * same next move, empty diffs — and every other gate passed, because none
 * of them asks whether the journey actually moved. A run can be perfectly
 * self-consistent and completely stuck.
 *
 * Scoped to turns that invoked a tool: a narration turn ("See what Sift
 * found") legitimately changes nothing, and failing those would make the
 * gate noise.
 */
const stalledTurn: GateEvaluator = ({ turns }) =>
  turns.flatMap((turn) =>
    turn.tools.length > 0 && turn.stateDiff.length === 0
      ? [
          finding(
            'stalled_turn',
            turn.index,
            `Turn ran ${turn.tools.join(', ')} and changed nothing about the case.`,
          ),
        ]
      : [],
  );

/** A run that simply stops: the last turn neither decides nor offers a way forward. */
const outcomeDeadEnd: GateEvaluator = ({ turns }) => {
  const last = turns.at(-1);
  if (last === undefined) return [];
  return last.phase !== 'decided' && last.nextMove === null
    ? [
        finding(
          'outcome_dead_end',
          last.index,
          'The run ended without a decision and without anything the person could do next.',
        ),
      ]
    : [];
};

const EVALUATORS: Record<HardGateId, GateEvaluator> = {
  state_ui_contradiction: stateUiContradiction,
  unsupported_claim: unsupportedClaim,
  authority_violation: authorityViolation,
  incomplete_companion_discovery: incompleteCompanionDiscovery,
  blocker_inference: blockerInference,
  missing_next_action: missingNextAction,
  broken_persistent_frame: brokenPersistentFrame,
  fabricated_progress: fabricatedProgress,
  accessibility,
  console_or_network_error: consoleOrNetworkError,
  outcome_dead_end: outcomeDeadEnd,
  stalled_turn: stalledTurn,
};

export function evaluateHardGates(ctx: PersonaGateContext): HardGateResult[] {
  return HARD_GATE_IDS.map((gateId): HardGateResult => {
    const outcome = EVALUATORS[gateId](ctx);
    if (outcome === 'not_evaluated') {
      return {
        gateId,
        outcome: 'not_evaluated',
        findings: [],
        notEvaluatedReason: gateId === 'unsupported_claim' ? NO_PROSE_REASON : BROWSER_ONLY_REASON,
      };
    }
    return outcome.length > 0
      ? { gateId, outcome: 'fail', findings: outcome }
      : { gateId, outcome: 'pass', findings: [] };
  });
}

/** A run passes when no gate failed. A `not_evaluated` gate is neither a pass nor a failure. */
export function hardGatesPassed(gates: readonly HardGateResult[]): boolean {
  return gates.every((gate) => gate.outcome !== 'fail');
}
