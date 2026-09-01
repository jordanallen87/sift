/**
 * Validates a model-proposed recommendation against the deterministic
 * scoreboard, and derives the recommendation's `confidence`, `facts`, and
 * `limitations` from measurements rather than from assertion.
 *
 * ## What this changes
 *
 * The car-purchase engine took `proposedRecommendation.candidateIds[0]` as
 * the favored option and shipped it with `confidence: 0.75`, `facts: []`,
 * and a single hand-written limitation string. Every one of those four
 * numbers and lists was the model's word, or a constant, presented to a
 * person as if it were a finding.
 *
 * CLAUDE.md is explicit that the model "may propose candidate events and
 * recommendations" but that the deterministic core owns state and
 * readiness. A ranking is a claim about a case, so it belongs to the core.
 * This module is the seam: the model still proposes, and its rationale is
 * still what the person reads, but the *numbers* attached to that proposal
 * now come from `scoreCaseState`.
 *
 * ## The divergence case is the important one
 *
 * When the model's favorite is not the deterministic leader, the honest
 * response is neither to silently overwrite the model's pick nor to
 * silently accept it. Both hide a real disagreement between two things the
 * product claims to trust. So the disagreement is stated in `limitations`,
 * in the person's own terms, and confidence drops sharply — because a
 * recommendation its own scoreboard does not support is exactly the
 * situation where a human should look harder before deciding.
 */
import { deriveInsights, scoreCaseState, type CaseScoreboard, type OptionScore } from '@sift/core';

/**
 * Exactly the slice of `CaseState` this module reads. Narrower than
 * `CaseState` on purpose: a function that declares it needs a whole case
 * invites callers to believe it consults things it does not, and forces
 * every test to assemble twenty irrelevant fields to exercise four.
 */
export type ScorableCase = Parameters<typeof scoreCaseState>[0];

export interface ScoredRecommendationFields {
  /** A deterministic function of coverage and margin — see `deriveConfidence`. */
  readonly confidence: number;
  /** What the scoreboard actually established about the favored option. */
  readonly facts: string[];
  /** What it could not establish, plus any disagreement with the model. */
  readonly limitations: string[];
  /** True when the model's pick is also the deterministic leader. */
  readonly agreesWithScoreboard: boolean;
  readonly board: CaseScoreboard;
}

/**
 * Confidence is a stated function of two measured quantities, not an
 * estimate:
 *
 *   confidence = coverage × (0.6 + 0.4 × min(1, margin / 0.1))
 *
 * `coverage` is the share of the case's criterion weight that was actually
 * measurable for this option; `margin` is how far it leads the runner-up.
 * A fully-evidenced, clearly-leading recommendation reaches 1.0; a
 * fully-evidenced dead heat reaches 0.6, because "we measured everything
 * and they are tied" is genuine knowledge about a genuinely close call.
 * Missing evidence scales the whole thing down proportionally.
 *
 * Both inputs are reported alongside the number in `facts`, so a reader can
 * check the arithmetic rather than take the figure on trust. That is the
 * whole reason for preferring a stated formula over a model's self-assessed
 * confidence, which cannot be checked at all.
 */
function deriveConfidence(favored: OptionScore, runnerUp: OptionScore | undefined): number {
  const total = favored.total;
  if (total === null) return 0;
  const margin = runnerUp?.total == null ? 1 : total - runnerUp.total;
  const marginFactor = 0.6 + 0.4 * Math.min(1, Math.max(0, margin) / 0.1);
  return Math.min(1, Math.max(0, favored.coverage * marginFactor));
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Only criteria carrying real weight are worth reporting as a gap. A 2%
 * criterion nobody established is noise; a 30% one is the story.
 */
const MATERIAL_WEIGHT = 0.1;

/**
 * Combines limitations an engine already knows about (a named unverified
 * obligation, a swarm context's own caveat) with the ones derived from the
 * board.
 *
 * Merged rather than replaced: the engines' existing strings are specific,
 * hand-checked, and often name something the scoreboard cannot see —
 * "whether both dog crates fit behind the second row remains unverified" is
 * a better sentence than any derivation would produce. Dropping them to
 * make room for derived text would trade real information for uniformity.
 * Deduplicated and bounded to the schema's limits.
 */
export function mergeLimitations(
  existing: readonly string[],
  derived: readonly string[],
): string[] {
  return [...new Set([...existing, ...derived])].slice(0, 50).map((entry) => entry.slice(0, 2000));
}

export function deriveScoredRecommendationFields(
  caseState: ScorableCase,
  proposedFavoredOptionId: string | null,
): ScoredRecommendationFields {
  const board = scoreCaseState(caseState);
  const ranked = board.options.filter((option) => option.total !== null);
  const compliant = ranked.filter((option) => option.violatedConstraintIds.length === 0);
  const leader = compliant[0];
  const runnerUp = compliant[1];

  const favored =
    proposedFavoredOptionId === null
      ? undefined
      : board.options.find((option) => option.optionId === proposedFavoredOptionId);

  const facts: string[] = [];
  const limitations: string[] = [];

  // An unrankable board is not a failure to report — a case with no
  // measurable criteria is a real state, and saying so beats emitting an
  // empty `facts` list that reads as "nothing was found".
  if (favored === undefined || favored.total === null) {
    if (leader !== undefined) {
      limitations.push(
        `The favored option could not be scored against this case's criteria, so this recommendation rests on the rationale alone rather than on the comparison.`,
      );
    }
    return {
      confidence: 0,
      facts,
      limitations,
      agreesWithScoreboard: false,
      board,
    };
  }

  // Agreement is about SCORE, not identity. When several options tie at the
  // top, `leader` is merely whichever one the tiebreak happened to put
  // first, and calling the model's equally-scoring pick a disagreement
  // produces the flatly false sentence "scoring puts X ahead (100% to
  // 100%)". The model choosing among co-leaders is exactly the judgment
  // it is there to exercise.
  const agrees =
    leader !== undefined &&
    (leader.optionId === favored.optionId ||
      (leader.total !== null && favored.total >= leader.total - 1e-9));
  const comparisonPeer = agrees ? runnerUp : leader;

  facts.push(
    `${favored.optionLabel} scores ${percent(favored.total)} against the criteria on this case, measured across ${percent(favored.coverage)} of the weight assigned to them.`,
  );

  // The strongest and weakest measured lines, by weighted contribution.
  // These are the sentences a person actually uses to sanity-check a
  // ranking: what carried it, and what it lost on.
  const measured = favored.criteria.filter((line) => line.score !== null);
  const byContribution = [...measured].sort(
    (a, b) => b.weight * (b.score as number) - a.weight * (a.score as number),
  );
  const strongest = byContribution[0];
  const weakest = byContribution[byContribution.length - 1];
  if (strongest !== undefined) {
    facts.push(`Strongest on ${strongest.criterionLabel}: ${strongest.reason}.`);
  }
  if (weakest !== undefined && weakest.criterionId !== strongest?.criterionId) {
    facts.push(`Weakest on ${weakest.criterionLabel}: ${weakest.reason}.`);
  }
  if (comparisonPeer !== undefined && comparisonPeer.total !== null) {
    facts.push(
      `${comparisonPeer.optionLabel} scores ${percent(comparisonPeer.total)} on the same criteria.`,
    );
  }

  // The disagreement case. Stated in the person's terms and never resolved
  // silently in either direction.
  if (!agrees && leader !== undefined && leader.total !== null) {
    limitations.push(
      `This recommendation favors ${favored.optionLabel}, but scoring your criteria puts ${leader.optionLabel} ahead (${percent(leader.total)} to ${percent(favored.total)}). The reasoning above may account for something the scoring does not — it is worth reading before deciding.`,
    );
  }

  for (const line of favored.criteria) {
    if (line.weight < MATERIAL_WEIGHT) continue;
    if (line.status === 'unknown' || line.status === 'not_applicable' || line.status === 'not_comparable') {
      limitations.push(
        `${line.criterionLabel} carries ${percent(line.weight)} of the weight on this case but is not part of the score: ${line.reason}`,
      );
    }
  }

  if (favored.violatedConstraintIds.length > 0) {
    limitations.push(
      `${favored.optionLabel} does not meet ${favored.violatedConstraintIds.length === 1 ? 'a requirement' : 'requirements'} recorded as non-negotiable on this case.`,
    );
  }

  for (const insight of deriveInsights(board)) {
    if (insight.kind === 'decisive_criterion' && insight.optionIds.includes(favored.optionId)) {
      limitations.push(`${insight.headline} ${insight.detail}`);
    }
  }

  const confidence = agrees
    ? deriveConfidence(favored, comparisonPeer)
    : // A recommendation its own scoreboard contradicts is capped hard.
      // Not zero: the model may be accounting for something unmeasured, and
      // reporting no confidence at all would overstate the disagreement as
      // much as ignoring it would understate it.
      Math.min(0.4, deriveConfidence(favored, undefined));

  return {
    confidence: Number(confidence.toFixed(4)),
    // Both fields are bounded by `RecommendationSchema` (max 50 entries,
    // 2000 chars each); truncating here keeps a pathological case from
    // failing schema validation at append time, where the failure would
    // surface as a lost recommendation rather than a shortened one.
    facts: facts.slice(0, 50).map((fact) => fact.slice(0, 2000)),
    limitations: limitations.slice(0, 50).map((limitation) => limitation.slice(0, 2000)),
    agreesWithScoreboard: agrees,
    board,
  };
}
