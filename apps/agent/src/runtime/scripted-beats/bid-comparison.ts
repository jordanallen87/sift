/**
 * The exact scripted `ModelProvider` response sequence driving the real Bid
 * Comparison Strands Swarm (`../bid-comparison-swarm.js`) deterministically
 * through the pack's required demo trajectory (docs/bid-comparison/plan.md
 * "The Strands beats, placed deliberately"), the analogous file to
 * `scripted-beats/home-energy-guardian.ts` for this codebase's second
 * Swarm-orchestrated pack.
 *
 * - `round1`: the initial investigation under the pack's default criteria
 *   weighting (`bid.adjusted_total` 45 / `bid.scope_completeness` 20 /
 *   `bid.payment_risk` 15 / `bid.schedule_fit` 10 / `bid.warranty` 10,
 *   `packages/packs/src/bid-comparison.ts`'s own `criteria.defaults`).
 *   Exercises, in order, all four beats this task requires reachable in one
 *   shipped trajectory:
 *     - **Deny** -- `price-analyst` reaches for `license-lookup`, granted
 *       only to `credential-checker`.
 *     - **Guide** -- `scope-analyst` runs `scope-differ` twice on the same
 *       bid pair with no new angle, then a third, genuinely different call
 *       (the full three-bid comparison) succeeds.
 *     - **GoalLoop** -- `decision-synthesizer`'s first draft ranks bids on
 *       raw quoted totals and is rejected; the corrected draft ranks on
 *       scope-normalized adjusted totals and cites the plug numbers.
 *     - **Confirm** -- `decision-synthesizer` calls `propose_award`, gated
 *       by `ConsequenceGuard` on human confirmation.
 *   Round 1 recommends awarding to Northgate Plumbing: once Cedar & Sons'
 *   bid is adjusted for the three required scope items it leaves absent,
 *   its $18,600.00 adjusted total is higher than Northgate's $18,400.00,
 *   and Northgate also leads on scope completeness (100% vs. 62.5%) and
 *   payment risk (25% vs. 45% deposit) -- the two next-heaviest-weighted
 *   criteria. Two Rivers Mechanical is never a contender: its certificate
 *   of insurance does not name its license holder, so its credentials do
 *   not verify as valid (the pack's protected `bid.credentials_valid` hard
 *   constraint).
 * - `round2`: the household reweights toward warranty length and payment
 *   risk (`bid.warranty` and `bid.payment_risk` raised, `bid.adjusted_total`
 *   reduced accordingly -- `ROUND2_CRITERIA_WEIGHTS`). Run starting directly
 *   at `decision-synthesizer` (mirroring `home-energy-guardian.ts`'s
 *   identical round2 structure), this is the pack's one genuine exercise of
 *   the protected `bid.credentials_valid` hard constraint (never triggered
 *   in round1, where the cost-heavy default weighting already puts Two
 *   Rivers Mechanical behind on ordinary preference grounds too):
 *   `scoreBids(ROUND2_CRITERIA_WEIGHTS)` gives Two Rivers Mechanical the
 *   highest raw score of all three bids -- it genuinely leads on both
 *   upweighted criteria (a 36-month warranty and a 20% deposit) -- and it is
 *   still not recommended, because its certificate of insurance names "TRM
 *   Holdings LLC," not its license holder "Two Rivers Mechanical Inc."
 *   `packages/core/src/scoring.ts`'s own rule 4 ("A hard constraint flags;
 *   it never silently eliminates ... ranked below compliant ones") is what
 *   `scoreBids`'s sort mirrors, so the award stays with Northgate Plumbing
 *   -- the higher-scoring of the two bids whose credentials are fully valid
 *   (Northgate's scope-normalized adjusted total, $18,400.00, is still lower
 *   than Cedar & Sons', $18,600.00) -- and `decision-synthesizer` names the
 *   exact discrepancy rather than a generic "constraint failed." This is the
 *   same thesis as round1's GoalLoop rejection (an unresolved fact blocks an
 *   otherwise-attractive number from being acted on) applied to a different
 *   kind of unresolved fact, one document-provenance rather than one
 *   scope-normalization.
 *
 *   A schedule-urgency reweight (`bid.schedule_fit` raised instead) was
 *   tried first and rejected on narrative grounds, not arithmetic ones: it
 *   is the only lever in this fixture set that can move the *award* itself
 *   off Northgate Plumbing (Northgate leads Cedar & Sons on the other four
 *   of five preference criteria), but the resulting recommendation --
 *   awarding to Cedar & Sons, the bid whose silence on $3,700 of required
 *   scope this exact Swarm run just caught -- undercuts the round1 finding
 *   rather than building on it. `scoreBids`'s tests still cover that
 *   direction directly (it never even closes the Northgate/Cedar gap, let
 *   alone reverses it) as a documented, verified rejection.
 *
 * Every number below is the REAL output of the real fixture data
 * (`packages/scenarios/fixtures/bids/*.json` plus
 * `packages/scenarios/src/tools/{bid-reader,scope-differ,bid-calculator,
 * license-lookup}.ts`, run directly while authoring this file -- see the
 * dated docs/build-log.md entry for this task for the full trace).
 */
import type { ExecutionResult } from '@sift/contracts';
import type { JSONValue } from '@strands-agents/sdk';
import { PROPOSE_AWARD_TOOL_ID } from '../bid-comparison-swarm.js';
import { ScriptedModelProvider, type ScriptedTurn } from '../model-provider.js';
import {
  BID_COMPARISON_SWARM_NODE_IDS,
  type BidComparisonSwarmNodeId,
} from '../bid-comparison-swarm.js';

export const BID_COMPARISON_SCENARIO_BEATS = ['round1', 'round2'] as const;
export type BidComparisonScenarioBeat = (typeof BID_COMPARISON_SCENARIO_BEATS)[number];

interface ScriptedHandoffOutput {
  agentId?: string;
  message: string;
  context?: ExecutionResult;
}

function structuredOutputTurn(output: ScriptedHandoffOutput): ScriptedTurn {
  return {
    toolCalls: [{ name: 'strands_structured_output', input: output as unknown as JSONValue }],
  };
}

// --- Criteria weights (see module header) ---

/** The pack's own shipped default weighting (`bid-comparison.ts`'s `criteria.defaults`). Round 1 uses this weighting verbatim -- `bid-comparison-swarm.test.ts` fails if this drifts out of sync with the manifest. */
export const ROUND1_CRITERIA_WEIGHTS = {
  adjustedTotal: 45,
  scopeCompleteness: 20,
  paymentRisk: 15,
  scheduleFit: 10,
  warranty: 10,
} as const;

/**
 * This is `docs/bid-comparison/plan.md`'s own suggested reweight target --
 * "move weight off `adjusted_total` toward `scope_completeness` and
 * `payment_risk`" -- adjusted to `bid.warranty` in place of
 * `bid.scope_completeness`, since scope completeness is where Two Rivers
 * Mechanical (the bid this reweight is meant to test) is merely tied with
 * Northgate Plumbing (both price all 8 required items), while warranty (36
 * months vs. Northgate's 24) is where it genuinely leads -- the reweight
 * needs to give the bid under test its best real case, not an arbitrary one.
 *
 * Verified with `scoreBids`, not hand-tuned to it: this weighting gives Two
 * Rivers Mechanical the highest raw score of all three bids (0.81 vs.
 * Northgate's 0.58 and Cedar & Sons' 0.31) -- it leads on both of the two
 * upweighted criteria -- and it still sorts last, because
 * `packages/core/src/scoring.ts`'s own rule 4 ranks any hard-constraint
 * violator below every compliant bid regardless of score. Northgate
 * Plumbing remains the higher-scoring of the two credentials-valid bids
 * (0.58 vs. Cedar & Sons' 0.31), so the award stays with Northgate: the
 * numbers move, the constraint does not, and the recommendation names both.
 *
 * A schedule-urgency reweight (raising `bid.schedule_fit` instead) was
 * tried and rejected on narrative, not arithmetic, grounds -- see the
 * module header. It remains the only lever in this fixture set that can
 * move the *award itself* off Northgate Plumbing (Northgate leads Cedar &
 * Sons on the other four of five preference criteria), which the tests
 * below verify directly as a documented, rejected alternative.
 */
export const ROUND2_CRITERIA_WEIGHTS = {
  adjustedTotal: 15,
  scopeCompleteness: 10,
  paymentRisk: 40,
  scheduleFit: 5,
  warranty: 30,
} as const;

/** The bid round 1's default weighting recommends. Exported so a pack-level test can assert this against the pack's own shipped default, mirroring `home-energy-guardian.ts`'s `ROUND1_RECOMMENDED_OPTION_ID`. */
export const ROUND1_RECOMMENDED_BID_ID = 'bid-northgate';
/**
 * The bid round 2's warranty/payment-risk-weighted criteria actually award.
 * Deliberately the SAME bid as round1: round2 is not a flip, it is
 * `bid-tworivers` scoring highest and being refused anyway -- see the
 * module header and `ROUND2_CRITERIA_WEIGHTS`'s own doc comment.
 */
export const ROUND2_RECOMMENDED_BID_ID = 'bid-northgate';

// --- Deterministic scoring parity proof (see module header) ---
//
// `home-energy-guardian.ts` proves its own round1/round2 crossover with a
// direct `fitScore` reproduction rather than merely asserting prose; this
// pack's ranking has five weighted criteria (one of them composed of two
// attributes) plus a protected hard constraint instead of two plain
// preference criteria, so the equivalent proof here is `scoreBids` below:
// real per-bid facts (the same figures this file's contexts and
// `decision-synthesizer` texts already cite), min-max normalized per
// criterion across the full three-bid set, weighted by whichever criteria
// weights a test supplies, and sorted by `packages/core/src/scoring.ts`'s
// own documented hard-constraint rule (see `scoreBids`'s doc comment) rather
// than by score alone. `bid-comparison.test.ts` exercises this directly to
// prove `ROUND1_RECOMMENDED_BID_ID`/`ROUND2_RECOMMENDED_BID_ID` are genuine
// scored outcomes of `ROUND1_CRITERIA_WEIGHTS`/`ROUND2_CRITERIA_WEIGHTS`,
// not just asserted text -- and, separately, that no weighting of these five
// criteria can ever put `bid-tworivers` first, because its hard-constraint
// violation is real and permanent, not a matter of degree.

export interface BidFacts {
  bidId: string;
  adjustedTotal: number;
  scopeCompleteness: number;
  depositPercent: number;
  startWeeks: number;
  durationDays: number;
  /** `null` mirrors `bid-calculator.ts`'s own `warrantyMonths: number | null` -- an explicit unknown, never coalesced to `0`. */
  warrantyMonths: number | null;
  /** The pack's protected `bid.credentials_valid` hard constraint. A bid with `false` here can still be scored and ranked by `scoreBids`, but never sorts above a bid with `true` here, at any weighting -- see `scoreBids`'s doc comment for the authoritative rule this mirrors. */
  credentialsValid: boolean;
}

/** The three bids' real, fixture-derived facts -- see this file's module header for where each figure comes from. */
export const BID_FACTS: readonly BidFacts[] = [
  {
    bidId: 'bid-northgate',
    adjustedTotal: 18400,
    scopeCompleteness: 1,
    depositPercent: 25,
    startWeeks: 3,
    durationDays: 9,
    warrantyMonths: 24,
    credentialsValid: true,
  },
  {
    bidId: 'bid-cedar',
    adjustedTotal: 18600,
    scopeCompleteness: 0.625,
    depositPercent: 45,
    startWeeks: 1,
    durationDays: 7,
    warrantyMonths: null,
    credentialsValid: true,
  },
  {
    bidId: 'bid-tworivers',
    adjustedTotal: 19250,
    scopeCompleteness: 1,
    depositPercent: 20,
    startWeeks: 5,
    durationDays: 8,
    warrantyMonths: 36,
    // Its certificate of insurance does not name its license holder (see
    // `CREDENTIAL_CONTEXT` below) -- a settled, deterministic fact, not an
    // open question -- so it fails the protected `bid.credentials_valid`
    // hard constraint. Per `packages/core/src/scoring.ts`'s own rule 4, this
    // never removes it from the board, but it also never lets it outrank a
    // compliant bid, however favorably it would otherwise score.
    credentialsValid: false,
  },
];

export interface BidComparisonCriteriaWeights {
  adjustedTotal: number;
  scopeCompleteness: number;
  paymentRisk: number;
  scheduleFit: number;
  warranty: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 1.0 for the lowest `value` among `values`, 0.0 for the highest, linear between. All-equal values score 1.0 for every entry (no basis to prefer one over another). */
function normalizeLowerBetter(values: readonly number[], value: number): number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 1;
  return (max - value) / (max - min);
}

/** 1.0 for the highest `value` among `values`, 0.0 for the lowest, linear between. All-equal values score 1.0 for every entry. */
function normalizeHigherBetter(values: readonly number[], value: number): number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 1;
  return (value - min) / (max - min);
}

/** One bid's weighted score, plus whether it fails the protected `bid.credentials_valid` hard constraint. See `scoreBids`. */
export interface ScoredBid {
  readonly bidId: string;
  readonly score: number;
  readonly constraintViolated: boolean;
}

/**
 * Scores every bid in `BID_FACTS` against `weights`, normalized 0..1 per
 * criterion across the FULL three-bid candidate set -- matching
 * `packages/core/src/scoring.ts`'s own `buildScale`, which normalizes across
 * every option passed to `scoreCase`, constraint violators included, not
 * just the compliant subset.
 *
 * `bid.schedule_fit` is scored as the average of its two composed
 * attributes' own normalized scores (`bid-comparison.ts`'s own
 * `composedOfAttributes: ['bid.start_weeks', 'bid.duration_days']`), each
 * independently lower-is-better. A bid whose warranty term is an explicit
 * unknown (`warrantyMonths: null`) scores a neutral `0.5` on that one
 * criterion rather than the worst or best score -- it is genuinely unknown,
 * not a zero-month warranty and not a generous one.
 *
 * **Sort order is not "highest score wins".** `packages/core/src/
 * scoring.ts`'s own rule 4 ("A hard constraint flags; it never silently
 * eliminates. A violating option stays on the board, fully scored and
 * visibly labelled, ranked below compliant ones.") and its
 * `compareOptionScores` comparator ("Constraint violations dominate
 * everything ... ranked last, never removed, then score") are both
 * authoritative and verified directly against the installed source while
 * fixing this function for this task -- see the dated docs/build-log.md
 * entry. `bid-tworivers` therefore never sorts above a compliant bid here,
 * no matter how high its own weighted score computes, because its
 * insurance certificate does not name its license holder
 * (`CREDENTIAL_CONTEXT` below) -- a settled, deterministic fact, not an
 * unresolved unknown. An earlier version of this function modeled a failed
 * hard constraint as removing the bid from consideration entirely (filtering
 * it out of the returned list); that does not match the real engine's own
 * documented "flags, never eliminates" rule, so this version scores every
 * bid and sorts constraint violators after every compliant bid instead,
 * exactly as `compareOptionScores` does.
 *
 * Returns bids sorted best-first under that rule.
 */
export function scoreBids(weights: BidComparisonCriteriaWeights): ScoredBid[] {
  const all = BID_FACTS;
  const adjustedTotals = all.map((bid) => bid.adjustedTotal);
  const scopeCompletenesses = all.map((bid) => bid.scopeCompleteness);
  const depositPercents = all.map((bid) => bid.depositPercent);
  const startWeeksList = all.map((bid) => bid.startWeeks);
  const durationDaysList = all.map((bid) => bid.durationDays);
  const numericWarranties = all
    .map((bid) => bid.warrantyMonths)
    .filter((months): months is number => months !== null);

  const totalWeight =
    weights.adjustedTotal +
    weights.scopeCompleteness +
    weights.paymentRisk +
    weights.scheduleFit +
    weights.warranty;

  const scored: ScoredBid[] = all.map((bid) => {
    const adjustedTotalScore = normalizeLowerBetter(adjustedTotals, bid.adjustedTotal);
    const scopeCompletenessScore = normalizeHigherBetter(
      scopeCompletenesses,
      bid.scopeCompleteness,
    );
    const paymentRiskScore = normalizeLowerBetter(depositPercents, bid.depositPercent);
    const scheduleFitScore =
      (normalizeLowerBetter(startWeeksList, bid.startWeeks) +
        normalizeLowerBetter(durationDaysList, bid.durationDays)) /
      2;
    const warrantyScore =
      bid.warrantyMonths === null
        ? 0.5
        : normalizeHigherBetter(numericWarranties, bid.warrantyMonths);

    const weighted =
      weights.adjustedTotal * adjustedTotalScore +
      weights.scopeCompleteness * scopeCompletenessScore +
      weights.paymentRisk * paymentRiskScore +
      weights.scheduleFit * scheduleFitScore +
      weights.warranty * warrantyScore;

    return {
      bidId: bid.bidId,
      score: round2(weighted / totalWeight),
      constraintViolated: !bid.credentialsValid,
    };
  });

  return scored.sort((a, b) => {
    const aViolates = a.constraintViolated ? 1 : 0;
    const bViolates = b.constraintViolated ? 1 : 0;
    if (aViolates !== bViolates) return aViolates - bViolates;
    return b.score - a.score;
  });
}

// --- bid.scope_normalization (scope-analyst) -- the required Guide moment ---

export const SCOPE_CONTEXT: ExecutionResult = {
  obligationId: 'bid.scope_normalization',
  disposition: 'evidence_found',
  claims: [
    {
      statement:
        'Northgate Plumbing and Two Rivers Mechanical each price all 8 required scope items. Cedar & Sons is missing 3 of 8 required scope items -- shower valve rough-in and blocking for the curbless shower, plumbing permit filing and inspection scheduling, and haul-away and disposal of demolition debris -- so its $14,900.00 quoted total is not yet comparable to the other two bids on the same scope basis.',
      stance: 'supports',
      confidence: 0.95,
      sourceIds: [
        'source-scope-diff-bid-northgate',
        'source-scope-diff-bid-cedar',
        'source-scope-diff-bid-tworivers',
      ],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-scope-diff-bid-northgate',
      level: 'E3',
      verdict: 'pass',
      summary:
        'Northgate Plumbing (bid-northgate) prices all 8 required scope items -- nothing absent.',
    },
    {
      sourceId: 'source-scope-diff-bid-cedar',
      level: 'E3',
      verdict: 'degraded',
      summary:
        'Cedar & Sons (bid-cedar) is missing 3 of 8 required scope items: Shower valve rough-in and blocking for the curbless shower; Plumbing permit filing and inspection scheduling; Haul-away and disposal of demolition debris.',
    },
    {
      sourceId: 'source-scope-diff-bid-tworivers',
      level: 'E3',
      verdict: 'pass',
      summary:
        'Two Rivers Mechanical (bid-tworivers) prices all 8 required scope items -- nothing absent.',
    },
  ],
  limitations: [],
  suggestedStatus: 'satisfied',
};

/**
 * `scope-analyst`'s first two `scope-differ` calls deliberately repeat the
 * same `bidIds` pair -- `RetrySteering`'s `matchesPriorQueryFamily`
 * condition (strands-runtime.md "Retry steering rules": "a search repeats a
 * prior query family without explaining a new angle") fires `Guide` on the
 * second call. The third call widens the comparison to all three bids --
 * docs/bid-comparison/plan.md's own words, "RetrySteering redirects it to
 * the third bid" -- a genuinely different technique, before the specialist
 * hands off to `price-analyst`.
 */
function buildScopeAnalystProvider(): ScriptedModelProvider {
  return new ScriptedModelProvider({
    beats: {
      round1: [
        { toolCalls: [{ name: 'skills', input: { skill_name: 'scope-normalization' } }] },
        {
          toolCalls: [{ name: 'scope-differ', input: { bidIds: ['bid-northgate', 'bid-cedar'] } }],
        },
        {
          toolCalls: [{ name: 'scope-differ', input: { bidIds: ['bid-northgate', 'bid-cedar'] } }],
        },
        {
          toolCalls: [
            {
              name: 'scope-differ',
              input: { bidIds: ['bid-northgate', 'bid-cedar', 'bid-tworivers'] },
            },
          ],
        },
        structuredOutputTurn({
          agentId: 'price-analyst',
          message:
            'All three bids are now compared on the same scope basis: Northgate Plumbing and Two Rivers Mechanical price every required item, Cedar & Sons is silent on 3 of 8, per source-scope-diff-bid-cedar. Handing off to price-analyst to compute the scope-normalized adjusted totals.',
          context: SCOPE_CONTEXT,
        }),
      ],
    },
  });
}

// --- bid.price_verification (price-analyst) -- the required Deny moment ---

export const PRICE_CONTEXT: ExecutionResult = {
  obligationId: 'bid.price_verification',
  disposition: 'evidence_found',
  claims: [
    {
      statement:
        "Cedar & Sons' bid quotes $14,900.00 for 5 of 8 required scope items (62.5% scope completeness); adjusted for the three items it leaves absent using Northgate Plumbing's own priced amounts as plug numbers (permits-inspections $1,200.00, shower-valve-rough-in $2,100.00, debris-haul-away $400.00), its scope-normalized adjusted total is $18,600.00 -- higher than Northgate Plumbing's own adjusted total of $18,400.00. Two Rivers Mechanical's adjusted total equals its quoted total, $19,250.00, since it prices every required item.",
      stance: 'supports',
      confidence: 0.95,
      sourceIds: [
        'source-bid-calculator-bid-northgate-adjusted-total',
        'source-bid-calculator-bid-cedar-adjusted-total',
        'source-bid-calculator-bid-tworivers-adjusted-total',
      ],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-bid-calculator-bid-northgate-adjusted-total',
      level: 'E3',
      verdict: 'pass',
      summary:
        "Northgate Plumbing's bid quotes $18,400.00 and prices all 8 required scope items -- no plug-number adjustment needed.",
    },
    {
      sourceId: 'source-bid-calculator-bid-cedar-adjusted-total',
      level: 'E3',
      verdict: 'pass',
      summary:
        "Cedar & Sons's bid quotes $14,900.00; adjusted for 3 unpriced required item(s) using the supplied plug numbers, the adjusted total is $18,600.00.",
    },
    {
      sourceId: 'source-bid-calculator-bid-tworivers-adjusted-total',
      level: 'E3',
      verdict: 'pass',
      summary:
        "Two Rivers Mechanical's bid quotes $19,250.00 and prices all 8 required scope items -- no plug-number adjustment needed.",
    },
  ],
  limitations: [],
  suggestedStatus: 'satisfied',
};

/**
 * `price-analyst`'s deliberate overreach: having just adjusted Cedar &
 * Sons' total, it reaches for `license-lookup` to check Cedar's credentials
 * too -- a tool the compiled pack grants only to `credential-checker`
 * (`allowedTools` here is `bid-reader`/`bid-calculator`). The real
 * `ScopeAuthorization` intervention denies it before it executes. Same
 * rationale as `home-energy-guardian.ts`'s `anomaly-investigator` overreach:
 * a scripted provider only ever asks for what it is told to ask for, so
 * this is the one place `Deny` -- one of the three intervention outcomes
 * that must be visible on every run -- genuinely fires in the shipped
 * trajectory rather than only inside a unit test that patches the provider.
 */
function buildPriceAnalystProvider(): ScriptedModelProvider {
  return new ScriptedModelProvider({
    beats: {
      round1: [
        { toolCalls: [{ name: 'skills', input: { skill_name: 'price-arithmetic' } }] },
        { toolCalls: [{ name: 'bid-calculator', input: { bidId: 'bid-northgate' } }] },
        { toolCalls: [{ name: 'bid-reader', input: { bidId: 'bid-northgate' } }] },
        { toolCalls: [{ name: 'license-lookup', input: { licenseNumber: 'PL-2290-CS' } }] },
        {
          toolCalls: [
            {
              name: 'bid-calculator',
              input: {
                bidId: 'bid-cedar',
                plugNumbers: {
                  'permits-inspections': 1200,
                  'shower-valve-rough-in': 2100,
                  'debris-haul-away': 400,
                },
              },
            },
          ],
        },
        { toolCalls: [{ name: 'bid-calculator', input: { bidId: 'bid-tworivers' } }] },
        structuredOutputTurn({
          agentId: 'credential-checker',
          message:
            "Cedar & Sons' scope-normalized adjusted total is $18,600.00, higher than Northgate Plumbing's $18,400.00, per source-bid-calculator-bid-cedar-adjusted-total. Handing off to credential-checker to verify each contractor's license and insurance.",
          context: PRICE_CONTEXT,
        }),
      ],
    },
  });
}

// --- bid.credential_verification (credential-checker) ---

export const CREDENTIAL_CONTEXT: ExecutionResult = {
  obligationId: 'bid.credential_verification',
  disposition: 'evidence_found',
  claims: [
    {
      statement:
        'Northgate Plumbing\'s and Cedar & Sons\' licenses are active, cover this scope, and their insurance certificates name the license holder exactly -- both bids\' credentials are fully valid. Two Rivers Mechanical\'s license and insurance are active, but its certificate of insurance names "TRM Holdings LLC", not the license holder "Two Rivers Mechanical Inc" -- its credentials do not verify as valid.',
      stance: 'supports',
      confidence: 0.95,
      sourceIds: [
        'source-license-pl-4417-ng',
        'source-license-pl-2290-cs',
        'source-license-pl-8801-tr-named-insured',
      ],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-license-pl-4417-ng',
      level: 'E1',
      verdict: 'pass',
      summary:
        'Northgate Plumbing (PL-4417-NG): licence active, Class C-36 Plumbing Contractor (fictional state classification) covers this scope, insurance active.',
    },
    {
      sourceId: 'source-license-pl-4417-ng-named-insured',
      level: 'E1',
      verdict: 'pass',
      summary:
        'Certificate of insurance names "Northgate Plumbing", matching the licence holder "Northgate Plumbing".',
    },
    {
      sourceId: 'source-license-pl-2290-cs',
      level: 'E1',
      verdict: 'pass',
      summary:
        'Cedar & Sons (PL-2290-CS): licence active, Class C-36 Plumbing Contractor (fictional state classification) covers this scope, insurance active.',
    },
    {
      sourceId: 'source-license-pl-2290-cs-named-insured',
      level: 'E1',
      verdict: 'pass',
      summary:
        'Certificate of insurance names "Cedar & Sons", matching the licence holder "Cedar & Sons".',
    },
    {
      sourceId: 'source-license-pl-8801-tr',
      level: 'E1',
      verdict: 'pass',
      summary:
        'Two Rivers Mechanical Inc (PL-8801-TR): licence active, Class C-36 Plumbing Contractor (fictional state classification) covers this scope, insurance active.',
    },
    {
      sourceId: 'source-license-pl-8801-tr-named-insured',
      level: 'E1',
      verdict: 'degraded',
      summary:
        'Certificate of insurance names "TRM Holdings LLC", which does not match the licence holder "Two Rivers Mechanical Inc" -- needs a human answer before this bid\'s credentials can be marked verified.',
    },
  ],
  limitations: [
    "Two Rivers Mechanical's named-insured mismatch needs a human answer before its credentials can be marked verified; until then its bid.credentials_valid attribute is false.",
  ],
  suggestedStatus: 'satisfied',
};

function buildCredentialCheckerProvider(): ScriptedModelProvider {
  return new ScriptedModelProvider({
    beats: {
      round1: [
        { toolCalls: [{ name: 'skills', input: { skill_name: 'credential-verification' } }] },
        { toolCalls: [{ name: 'license-lookup', input: { licenseNumber: 'PL-4417-NG' } }] },
        { toolCalls: [{ name: 'license-lookup', input: { licenseNumber: 'PL-2290-CS' } }] },
        { toolCalls: [{ name: 'license-lookup', input: { licenseNumber: 'PL-8801-TR' } }] },
        structuredOutputTurn({
          agentId: 'schedule-analyst',
          message:
            "Northgate Plumbing and Cedar & Sons both carry fully valid credentials; Two Rivers Mechanical's insurance certificate does not name its license holder, per source-license-pl-8801-tr-named-insured. Handing off to schedule-analyst to evaluate each bid's start date and duration.",
          context: CREDENTIAL_CONTEXT,
        }),
      ],
    },
  });
}

// --- bid.schedule_feasibility (schedule-analyst) ---

export const SCHEDULE_CONTEXT: ExecutionResult = {
  obligationId: 'bid.schedule_feasibility',
  disposition: 'evidence_found',
  claims: [
    {
      statement:
        "All three bids' stated start dates and durations are credible for this scope of work: Northgate Plumbing starts in 3 weeks over 9 working days, Cedar & Sons in 1 week over 7 working days, and Two Rivers Mechanical in 5 weeks over 8 working days -- none is implausibly fast or slow for a full plumbing re-rough and fixture-set installation of this size.",
      stance: 'supports',
      confidence: 0.75,
      sourceIds: ['source-bid-northgate', 'source-bid-cedar', 'source-bid-tworivers'],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-bid-northgate',
      level: 'E1',
      verdict: 'pass',
      summary:
        'Northgate Plumbing (bid-northgate): $18,400.00 total across 8 line items, 25% deposit.',
    },
    {
      sourceId: 'source-bid-cedar',
      level: 'E1',
      verdict: 'pass',
      summary: 'Cedar & Sons (bid-cedar): $14,900.00 total across 5 line items, 45% deposit.',
    },
    {
      sourceId: 'source-bid-tworivers',
      level: 'E1',
      verdict: 'pass',
      summary:
        'Two Rivers Mechanical (bid-tworivers): $19,250.00 total across 8 line items, 20% deposit.',
    },
  ],
  limitations: [
    "Schedule credibility is a plausibility judgment from each bid's own stated dates, not independently verified against contractor capacity or permitting timelines.",
  ],
  suggestedStatus: 'accepted_uncertainty',
};

function buildScheduleAnalystProvider(): ScriptedModelProvider {
  return new ScriptedModelProvider({
    beats: {
      round1: [
        { toolCalls: [{ name: 'skills', input: { skill_name: 'schedule-analysis' } }] },
        { toolCalls: [{ name: 'bid-reader', input: { bidId: 'bid-northgate' } }] },
        { toolCalls: [{ name: 'bid-reader', input: { bidId: 'bid-cedar' } }] },
        { toolCalls: [{ name: 'bid-reader', input: { bidId: 'bid-tworivers' } }] },
        structuredOutputTurn({
          agentId: 'source-challenger',
          message:
            "Every bid's stated start date and duration is credible for this scope, per source-bid-northgate, source-bid-cedar, and source-bid-tworivers. Handing off to source-challenger to review the full evidence chain before synthesis.",
          context: SCHEDULE_CONTEXT,
        }),
      ],
    },
  });
}

// --- bid.award_recommendation review (source-challenger) ---

export const CHALLENGE_CONTEXT: ExecutionResult = {
  obligationId: 'bid.award_recommendation',
  disposition: 'evidence_found',
  claims: [
    {
      statement:
        "Re-verified: Cedar & Sons' bid document and its scope-diff both check out against their own source documents with no contradictions. The scope, price, credential, and schedule findings are ready for synthesis.",
      stance: 'supports',
      confidence: 0.9,
      sourceIds: ['source-bid-cedar', 'source-scope-diff-bid-cedar'],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-bid-cedar',
      level: 'E1',
      verdict: 'pass',
      summary: 'Re-verified against the bid-reader source: no contradictions found.',
    },
    {
      sourceId: 'source-scope-diff-bid-cedar',
      level: 'E3',
      verdict: 'pass',
      summary:
        'Re-verified against the scope-differ source: the three absent items and their status check out.',
    },
  ],
  limitations: [],
  suggestedStatus: 'open',
};

function buildSourceChallengerProvider(): ScriptedModelProvider {
  return new ScriptedModelProvider({
    beats: {
      round1: [
        { toolCalls: [{ name: 'bid-reader', input: { bidId: 'bid-cedar' } }] },
        { toolCalls: [{ name: 'scope-differ', input: { bidIds: ['bid-cedar'] } }] },
        structuredOutputTurn({
          agentId: 'decision-synthesizer',
          message:
            'Every finding checks out with no contradictions, per source-bid-cedar and source-scope-diff-bid-cedar. Handing off to decision-synthesizer for the final award recommendation.',
          context: CHALLENGE_CONTEXT,
        }),
      ],
    },
  });
}

// --- bid.award_recommendation synthesis (decision-synthesizer) ---

export const PROPOSED_AWARD_ROUND1 = {
  bidId: 'bid-northgate',
  rationale:
    'Lowest scope-normalized adjusted total ($18,400.00) among bids with fully valid credentials, and leads on scope completeness (100%) and payment risk (25% deposit).',
};

/**
 * `decision-synthesizer` still proposes Northgate Plumbing in round 2 --
 * this is not a flip, it is `bid-tworivers` scoring highest and being
 * refused anyway. The rationale names the exact discrepancy (the specific
 * mismatched entity names, per this task's own requirement), not a generic
 * "constraint failed."
 */
export const PROPOSED_AWARD_ROUND2 = {
  bidId: 'bid-northgate',
  rationale:
    'Two Rivers Mechanical scores highest under the household\'s warranty- and payment-risk-weighted criteria (0.81 vs. Northgate\'s 0.58), but its certificate of insurance names "TRM Holdings LLC," not its license holder "Two Rivers Mechanical Inc," so its credentials do not verify as valid. Of the two bids with fully valid credentials, Northgate Plumbing scores highest and its scope-normalized adjusted total ($18,400.00) remains the lower of the two.',
};

const DECISION_TEXT_ROUND1_DRAFT =
  "Cedar & Sons offers the lowest total at $14,900.00 (source-bid-cedar), versus Northgate Plumbing's $18,400.00 (source-bid-northgate) and Two Rivers Mechanical's $19,250.00 (source-bid-tworivers). Recommend awarding to Cedar & Sons on lowest price.";

const DECISION_TEXT_ROUND1 =
  "Correcting for scope: Cedar & Sons' $14,900.00 quote is missing three required items -- permits and inspections ($1,200.00), shower-valve rough-in ($2,100.00), and debris haul-away ($400.00) -- so its scope-normalized adjusted total is $18,600.00 (source-bid-calculator-bid-cedar-adjusted-total), not $14,900.00. That is higher than Northgate Plumbing's adjusted total of $18,400.00 (source-bid-calculator-bid-northgate-adjusted-total), which already prices every required item and carries fully valid license and insurance credentials (source-license-pl-4417-ng). Two Rivers Mechanical's adjusted total is $19,250.00 (source-bid-calculator-bid-tworivers-adjusted-total) and its insurance certificate does not name its license holder (source-license-pl-8801-tr-named-insured), so its credentials do not verify as valid. Recommend awarding to Northgate Plumbing.";

const DECISION_TEXT_ROUND2 =
  'With the household now weighting warranty length and payment risk most heavily, Two Rivers Mechanical scores highest of the three bids (0.81) -- it leads on both upweighted criteria: a 36-month warranty (source-bid-tworivers) and a 20% deposit (source-bid-tworivers), the lowest payment risk of the three. It is still not recommended: its certificate of insurance names "TRM Holdings LLC," not its license holder "Two Rivers Mechanical Inc" (source-license-pl-8801-tr-named-insured), so its credentials do not verify as valid. Of the two bids whose credentials are fully valid, Northgate Plumbing scores highest (0.58 vs. Cedar & Sons\' 0.31) and its scope-normalized adjusted total ($18,400.00, source-bid-calculator-bid-northgate-adjusted-total) remains lower than Cedar & Sons\' ($18,600.00, source-bid-calculator-bid-cedar-adjusted-total). Recommend awarding to Northgate Plumbing. Correcting the named-insured discrepancy on Two Rivers Mechanical\'s certificate of insurance would reopen this recommendation.';

/**
 * `decision-synthesizer`'s round 1 begins with a draft that sounds entirely
 * reasonable and ranks bids on their raw quoted totals -- exactly the
 * failure mode this whole pack exists to catch. `DEFAULT_SYNTHESIZER_
 * VALIDATOR` genuinely rejects it (it never mentions an adjusted total or
 * reaches Cedar & Sons' own $18,600.00 adjusted figure), and the corrected
 * second attempt is what actually reaches the case. `maxAttempts: 2` means
 * there is exactly one retry.
 *
 * Between the rejected first attempt and the corrected second attempt, the
 * agent calls `propose_award` -- a normal tool call, not a
 * `strands_structured_output` call, so it does not itself count as a
 * GoalLoop attempt (mirroring `home-energy-guardian.ts`'s `propose_
 * inspection` placement in its own round2). `ConsequenceGuard` gates it on
 * human confirmation before the proposal is recorded -- the required
 * Confirm moment, reachable in this same round1 trajectory alongside Deny,
 * Guide, and GoalLoop.
 *
 * Round 2's own draft passes `DEFAULT_SYNTHESIZER_VALIDATOR` on the first
 * attempt (no rejection is scripted for it, matching
 * `home-energy-guardian.ts`'s identical round2 shape): it cites a source,
 * and it still grounds the comparison in the two compliant bids' real
 * scope-normalized adjusted totals ($18,400.00 / $18,600.00) alongside the
 * new warranty/payment-risk finding -- the same scope-normalization
 * discipline round1 established, not abandoned once the story moves on to
 * credentials.
 */
function buildDecisionSynthesizerProvider(): ScriptedModelProvider {
  return new ScriptedModelProvider({
    beats: {
      round1: [
        structuredOutputTurn({ message: DECISION_TEXT_ROUND1_DRAFT }),
        { toolCalls: [{ name: PROPOSE_AWARD_TOOL_ID, input: { ...PROPOSED_AWARD_ROUND1 } }] },
        structuredOutputTurn({ message: DECISION_TEXT_ROUND1 }),
      ],
      round2: [
        { toolCalls: [{ name: PROPOSE_AWARD_TOOL_ID, input: { ...PROPOSED_AWARD_ROUND2 } }] },
        structuredOutputTurn({ message: DECISION_TEXT_ROUND2 }),
      ],
    },
  });
}

export interface BidComparisonSwarmScriptedProviders extends Record<
  BidComparisonSwarmNodeId,
  ScriptedModelProvider
> {
  'scope-analyst': ScriptedModelProvider;
  'price-analyst': ScriptedModelProvider;
  'credential-checker': ScriptedModelProvider;
  'schedule-analyst': ScriptedModelProvider;
  'source-challenger': ScriptedModelProvider;
  'decision-synthesizer': ScriptedModelProvider;
}

/**
 * Builds one fresh `ScriptedModelProvider` per Bid Comparison Swarm node.
 * `decision-synthesizer` carries both `round1`/`round2` beats; the other
 * five carry only `round1` (they are never visited when a test starts the
 * Swarm directly at `decision-synthesizer` for the round2 reweight
 * scenario). The caller calls `provider.setBeat(...)` on every provider it
 * intends to exercise before invoking the Swarm.
 */
export function buildBidComparisonSwarmScriptedProviders(
  /** Optional demo pacing, forwarded to every provider. 0 (the default) is what every test and gate uses -- see `ScriptedModelProvider.turnDelayMs`. */
  turnDelayMs = 0,
): BidComparisonSwarmScriptedProviders {
  const paced = <T extends ScriptedModelProvider>(provider: T): T => {
    provider.setTurnDelayMs(turnDelayMs);
    return provider;
  };
  return {
    'scope-analyst': paced(buildScopeAnalystProvider()),
    'price-analyst': paced(buildPriceAnalystProvider()),
    'credential-checker': paced(buildCredentialCheckerProvider()),
    'schedule-analyst': paced(buildScheduleAnalystProvider()),
    'source-challenger': paced(buildSourceChallengerProvider()),
    'decision-synthesizer': paced(buildDecisionSynthesizerProvider()),
  };
}

/** `BidComparisonSwarmDeps.modelFor` built directly from a `BidComparisonSwarmScriptedProviders` bundle. */
export function scriptedModelFor(
  providers: BidComparisonSwarmScriptedProviders,
): (nodeId: BidComparisonSwarmNodeId) => ScriptedModelProvider {
  return (nodeId) => providers[nodeId];
}

/** Sets every provider in the bundle to the same beat, before one `executeBidComparisonSwarm` round. */
export function setScenarioBeat(
  providers: BidComparisonSwarmScriptedProviders,
  beat: BidComparisonScenarioBeat,
): void {
  for (const nodeId of BID_COMPARISON_SWARM_NODE_IDS) {
    providers[nodeId].setBeat(beat);
  }
}
