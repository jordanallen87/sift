/**
 * The read-side projection behind `sift_explain_ranking`: Sift's own
 * deterministic scoreboard (`packages/core/src/scoring.ts`), bounded for
 * model context.
 *
 * ## Why this tool exists at all
 *
 * ADR 0012 built a full explained ranking and then listed, under "Still
 * open", the gap this module closes:
 *
 * > No WebMCP read tool exposes the board, so the model cannot read Sift's
 * > analysis and must still re-derive it from raw attributes — the exact
 * > duplication this ADR's thesis argues against.
 *
 * That gap is not cosmetic. Asked "why is the RAV4 first?", a model with
 * only `sift_get_case_context` and `sift_get_option_details` has to
 * reconstruct a weighted comparison from raw `AttributeValue`s in its head.
 * It will get the arithmetic approximately right, it will silently treat a
 * missing value as a bad one, it has no way to know that `pref.deal_value`
 * is scored by its attribute's `lower_better` rather than its own declared
 * `higher_better` (scoring rule 2), it cannot see that the leader's lead
 * rests on a rating the sources contradict each other about (rule 6), and
 * whatever number it produces will disagree with the number on the screen
 * beside it. Two rankings, one of them invented, presented to a person
 * spending forty thousand dollars.
 *
 * The product thesis is that the model and the workspace are separate, and
 * the workspace is where the work is actually done. A ranking the workspace
 * computes and the model cannot read is that thesis half-implemented.
 *
 * ## Why it is a projection rather than the raw board
 *
 * `CaseScoreboard` is unbounded by construction: options × criteria lines,
 * each line optionally carrying an `AttributeValue` that may itself be a
 * 20 000-character `text` or a 200-entry `enum` membership set. architecture
 * .md requires tool outputs to be size-bounded, so every collection here is
 * capped.
 *
 * **A silently truncated analysis is a lying analysis**, so every cap
 * reports what it dropped:
 *
 *  - each bounded collection carries its true `total` beside its `items`,
 *    the same convention `case-context.ts` already uses;
 *  - `omitted` restates the drops as plain counts at the top level, so a
 *    caller does not have to diff two arrays to notice one;
 *  - and criterion breakdowns additionally report `shownWeight`/
 *    `omittedWeight` — the SHARE OF THE DECISION the listed lines account
 *    for. That is the number that actually matters: "6 of 40 lines" says
 *    nothing about whether the payload explains the ranking, while "these
 *    lines carry 0.71 of the weight" says exactly that.
 *
 * Nothing here re-scores, re-sorts, or re-rounds. `buildWorkspaceScoreboard`
 * (`../components/case-scoreboard.js`) is the single shared adapter over
 * `scoreCaseState`, and this module calls it for the same reason the
 * workspace does: one computation, so the ranking the person sees and the
 * ranking the model narrates cannot drift apart. `formatScore` is reused for
 * the same reason at one decimal place further in — a card reading 62% beside
 * a model saying "62.3%" looks like two different measurements of the same
 * thing.
 */
import type { AttributeStatus, AttributeValue, CaseState, CriterionKind } from '@sift/contracts';
import type { CriterionScore, CriterionScoreStatus, InsightKind, OptionScore } from '@sift/core';
import { buildWorkspaceScoreboard, formatScore } from '../components/case-scoreboard.js';
import { bound, truncate, type BoundedList } from './case-context.js';

// --- Bounds -----------------------------------------------------------
//
// Chosen against two reference points: what the shipped packs actually
// contain (so truncation never fires on a real case today and the demo
// payload is complete), and `sift_list_research`'s existing 50-source/
// 50-claim projection (so the worst case here stays in the same order of
// magnitude as a read tool this catalog already ships).

/**
 * Options carrying a summary row. Double the car pack's five-option demo
 * limit, and past the point where a ranking is the person's real problem: a
 * shortlist longer than ten is a filtering question, not an explanation
 * question, and `sift_set_view`'s filters are the tool for that.
 */
const MAX_RANKED_OPTIONS = 10;

/**
 * Criterion lines attached to each option's row. Both shipped packs are
 * covered whole — `car-purchase` seeds five active criteria and
 * `home-energy-guardian` three — so no real case today is truncated here,
 * and a pack would need to more than double the larger of the two before a
 * caller saw an `omittedWeight` above zero.
 */
const MAX_CRITERION_LINES = 6;

/**
 * Criterion lines for the one option a caller named by `optionId`. Five
 * times the default, because asking about a specific option is a request for
 * depth on it; thirty lines exceeds any hand-authored pack's whole criterion
 * set, so a focused call returns a genuinely complete breakdown. The
 * resulting worst case (30 + 9 × 6 = 84 lines) sits just under
 * `sift_list_research`'s own 100-item ceiling.
 */
const MAX_CRITERION_LINES_FOR_REQUESTED_OPTION = 30;

/** `deriveInsights` emits at most one per `INSIGHT_KINDS` entry today; the cap is headroom, not a real constraint. */
const MAX_INSIGHTS = 10;

/** Warnings are per-criterion-per-attribute, so a badly-authored pack could produce many. Ten is enough to establish that the board is untrustworthy; the eleventh adds nothing a caller acts on differently. */
const MAX_WARNINGS = 10;

/**
 * A `CriterionScore.reason` is engine-authored and short — the longest
 * generated form runs well under 200 characters. The exception is a
 * `not_applicable` line, which falls back to the pack's own
 * `Criterion.question`, bounded at 2000 by `CriterionSchema`. 300 keeps a
 * long authored question readable while stopping one criterion from
 * dominating the payload.
 */
const REASON_MAX = 300;

/** Insight headlines/details interpolate every affected option's label, so a wide case genuinely can exceed this. 500 matches `SOURCE_SUMMARY_MAX`/`NOTE_BODY_MAX`, this catalog's established bound for model-facing free text. */
const INSIGHT_TEXT_MAX = 500;

/** Warnings interpolate an attribute label plus an engine sentence; both are short, so this is a guard rather than an expected truncation. */
const WARNING_MAX = 300;

/**
 * The ids an insight names. `coverage_gap` lists every thinly-evidenced
 * option, so this scales with the case rather than with the insight; capped
 * at the option bound above, since ids beyond the options this payload shows
 * are not resolvable by the caller anyway.
 */
const MAX_INSIGHT_IDS = MAX_RANKED_OPTIONS;

/**
 * Free text inside an `AttributeValue`. A `text` value is bounded at 20 000
 * characters by `TextAttributeValueSchema` and a `string` at 2000 — orders of
 * magnitude past what identifying the fact behind a score requires. The
 * numbers that actually drive a score (`money`, `number`, `duration`,
 * `range`) are never truncated, because they are already small and losing a
 * digit would falsify them.
 */
const VALUE_TEXT_MAX = 200;

/** Entries kept from a `string_list` value, itself bounded at 50 × 500 characters. */
const MAX_VALUE_LIST_ITEMS = 10;

// --- Public shapes ----------------------------------------------------

export interface RankedCriterionLine {
  criterionId: string;
  criterionLabel: string;
  kind: CriterionKind;
  /** Normalized share of the case's total active criterion weight, 0..1. Sums to 1 across a complete breakdown. */
  weight: number;
  /** 0..1 against the candidate set, where 1 is the best value present. `null` for every unscorable status — never 0, which would assert a measurement nobody made. */
  score: number | null;
  /**
   * Passed through from `CriterionScore` exactly as the engine set it, never
   * collapsed to a scored/unscored boolean. The distinctions it draws are the
   * whole point: `disputed` and `scored` both carry a number, and a caller
   * that could not tell them apart would report a contested measurement as an
   * established one.
   */
  status: CriterionScoreStatus;
  /** The engine's own plain-English sentence, passed through verbatim (only length-bounded). */
  reason: string;
  value?: AttributeValue;
  valueStatus?: AttributeStatus;
  constraintViolated: boolean;
}

export interface BoundedCriterionBreakdown extends BoundedList<RankedCriterionLine> {
  /** Share of this option's normalized criterion weight the listed lines account for, 0..1. */
  shownWeight: number;
  /** Share of weight this breakdown left out, 0..1. Exactly 0 when nothing was truncated. */
  omittedWeight: number;
}

export interface RankedOptionSummary {
  optionId: string;
  optionLabel: string;
  /** 1-based rank among options that could be scored at all. `null` for an option with no total — deliberately unranked rather than ranked last, since "#4 of 4" is a claim about how it compares and nothing was compared. */
  rank: number | null;
  /** Weighted mean over SCORED criteria only, 0..1. `null` when nothing could be scored. */
  score: number | null;
  /** `score` rendered exactly as the workspace renders it. `null` whenever `score` is. */
  scorePercent: string | null;
  /** Share of total active criterion weight that was actually measurable for this option, 0..1. A LOW coverage means unmeasured, not bad. */
  coverage: number;
  coveragePercent: string;
  /** Criteria this option fails outright. A flag, never an elimination — the option is still ranked and still shown. */
  violatedConstraintIds: string[];
  /**
   * Criteria this option scored on, but from at least one value whose
   * sources contradict each other (scoring rule 6).
   *
   * Carried separately from `coverage` here for the same reason `OptionScore`
   * carries it separately: coverage answers "how much did we measure", this
   * answers "how much of what we measured is actually settled", and a caller
   * that only read `coverage` would report a fully-covered option built on a
   * contested rating as fully established. On the real car scenario that is
   * exactly the available mistake — the Outback leads every measured
   * criterion, on a reliability rating the sources disagree about.
   */
  disputedCriterionIds: string[];
  criteria: BoundedCriterionBreakdown;
}

export interface RankingInsightSummary {
  id: string;
  kind: InsightKind;
  severity: 'info' | 'attention';
  headline: string;
  detail: string;
  optionIds: string[];
  criterionIds: string[];
}

export interface RankingExplanation {
  caseId: string;
  /**
   * False when this case cannot be ranked at all — fewer than two options
   * could be scored, because there are no options, no active criteria, or
   * nothing measurable. Distinct from an empty ranking, which would read as
   * "we compared them and found no difference".
   */
  isRankable: boolean;
  /** Present only when the call named an `optionId`. `ranked: false` means the option exists on the case but no active criterion measures anything declared for its kind, so it has no place in the ranking. */
  requested?: { optionId: string; ranked: boolean };
  options: BoundedList<RankedOptionSummary>;
  /** Criteria on which every option scored identically: they carry weight but change no ordering. */
  nonDiscriminatingCriterionIds: string[];
  insights: BoundedList<RankingInsightSummary>;
  /** Authoring and data problems found while scoring — a mixed-currency comparison, an enum with no declared ordering. Every one of them means a number here is less trustworthy than it looks. */
  warnings: BoundedList<string>;
  /** What this payload left out, restated as plain counts so a caller need not diff `items` against `total` to notice. */
  omitted: { options: number; criterionLines: number };
}

// --- Value bounding ---------------------------------------------------

/**
 * Caps the free text inside an `AttributeValue` while preserving its
 * discriminated-union shape, so a caller still gets a typed value rather
 * than a stringified summary of one.
 *
 * `enum.allowedValues` is dropped outright rather than truncated: it is a
 * MEMBERSHIP set of up to 200 × 200 characters that says nothing about the
 * score. What ordered an enum is the definition's `orderedValues`
 * (`AttributeDefinitionSchema`), and the engine has already applied it and
 * explained the result in `reason` — so shipping the membership set would
 * cost up to 40 KB to answer a question nobody asked.
 */
function boundValue(value: AttributeValue): AttributeValue {
  switch (value.type) {
    case 'string':
      return { type: 'string', value: truncate(value.value, VALUE_TEXT_MAX) };
    case 'text':
      return {
        type: 'text',
        value: truncate(value.value, VALUE_TEXT_MAX),
        ...(value.format !== undefined ? { format: value.format } : {}),
      };
    case 'enum':
      return { type: 'enum', value: value.value };
    case 'string_list':
      return {
        type: 'string_list',
        values: value.values
          .slice(0, MAX_VALUE_LIST_ITEMS)
          .map((entry) => truncate(entry, VALUE_TEXT_MAX)),
      };
    default:
      // Every remaining variant (`number`, `money`, `boolean`, `date`,
      // `duration`, `range`) is a small fixed record of numbers and short
      // codes. Truncating one would falsify it, not bound it.
      return value;
  }
}

// --- Criterion breakdown ----------------------------------------------

/**
 * Orders a breakdown heaviest-criterion-first, so truncation drops the
 * criteria the case itself declared least important.
 *
 * Deliberately NOT ordered by contribution (`weight × score`), which is what
 * a card's "why is it here" summary uses. Contribution ordering sinks every
 * `unknown` and `not_comparable` line to the bottom, where the cap removes
 * exactly the lines that explain why an option's coverage is low — turning a
 * bounded analysis into a confidently incomplete one. Weight ordering is
 * status-neutral: a 30%-weight unknown stays at the top, visible, carrying
 * the engine's own sentence about why it is not counted against the option.
 *
 * The `criterionId` tiebreak keeps the order total, so equal-weight criteria
 * never reorder between two calls on identical state.
 */
function orderByWeight(lines: readonly CriterionScore[]): CriterionScore[] {
  return [...lines].sort(
    (a, b) =>
      b.weight - a.weight ||
      (a.criterionId < b.criterionId ? -1 : a.criterionId > b.criterionId ? 1 : 0),
  );
}

function projectLine(line: CriterionScore): RankedCriterionLine {
  return {
    criterionId: line.criterionId,
    criterionLabel: line.criterionLabel,
    kind: line.kind,
    weight: line.weight,
    score: line.score,
    status: line.status,
    reason: truncate(line.reason, REASON_MAX),
    ...(line.value !== undefined ? { value: boundValue(line.value) } : {}),
    ...(line.valueStatus !== undefined ? { valueStatus: line.valueStatus } : {}),
    constraintViolated: line.constraintViolated,
  };
}

function sumWeight(lines: readonly { weight: number }[]): number {
  return lines.reduce((total, line) => total + line.weight, 0);
}

function buildBreakdown(option: OptionScore, maxLines: number): BoundedCriterionBreakdown {
  const ordered = orderByWeight(option.criteria);
  const shown = ordered.slice(0, maxLines);
  const shownWeight = sumWeight(shown);
  return {
    items: shown.map(projectLine),
    total: ordered.length,
    shownWeight,
    // Computed from the lines actually dropped rather than as `1 -
    // shownWeight`: a case whose active weights do not total exactly 1 (a
    // criterion carrying weight 0, float accumulation across many lines)
    // would otherwise report a phantom omission when nothing was dropped.
    omittedWeight: sumWeight(ordered.slice(maxLines)),
  };
}

// --- Insights and warnings --------------------------------------------

function projectInsight(insight: {
  id: string;
  kind: InsightKind;
  severity: 'info' | 'attention';
  headline: string;
  detail: string;
  optionIds: readonly string[];
  criterionIds: readonly string[];
}): RankingInsightSummary {
  return {
    id: insight.id,
    kind: insight.kind,
    severity: insight.severity,
    headline: truncate(insight.headline, INSIGHT_TEXT_MAX),
    detail: truncate(insight.detail, INSIGHT_TEXT_MAX),
    optionIds: insight.optionIds.slice(0, MAX_INSIGHT_IDS),
    criterionIds: insight.criterionIds.slice(0, MAX_INSIGHT_IDS),
  };
}

// --- Entry point ------------------------------------------------------

/**
 * Projects the case's deterministic scoreboard for one WebMCP read call.
 *
 * Returns `null` — never a fabricated empty ranking — when `requestedOptionId`
 * names nothing on the case at all; `register-sift-tools.ts` maps that to an
 * honest `NOT_FOUND`, matching `buildOptionDetails`'s existing convention. An
 * id that names a real entity the ranking does not cover (an energy case's
 * bill, say, which no active criterion measures) is a different answer and
 * gets one: the board comes back with `requested.ranked: false`.
 */
export function buildRankingExplanation(
  caseState: CaseState,
  requestedOptionId?: string,
): RankingExplanation | null {
  const scoreboard = buildWorkspaceScoreboard(caseState);
  const { board, insights, rankByOptionId } = scoreboard;

  let requested: RankingExplanation['requested'];
  if (requestedOptionId !== undefined) {
    const onBoard = scoreboard.byOptionId.has(requestedOptionId);
    if (!onBoard && !caseState.entities.some((entity) => entity.id === requestedOptionId)) {
      return null;
    }
    requested = { optionId: requestedOptionId, ranked: onBoard };
  }

  // The head of the ranking, plus — always — the row for the option the
  // caller actually asked about. Answering "why is this one last?" with a
  // payload that truncated that very option away would be a worse failure
  // than any amount of extra weight in the response.
  const head = board.options.slice(0, MAX_RANKED_OPTIONS);
  const requestedRow =
    requestedOptionId !== undefined && !head.some((option) => option.optionId === requestedOptionId)
      ? scoreboard.byOptionId.get(requestedOptionId)
      : undefined;
  const selected = requestedRow === undefined ? head : [...head, requestedRow];

  const items = selected.map((option) => ({
    optionId: option.optionId,
    optionLabel: option.optionLabel,
    rank: rankByOptionId.get(option.optionId) ?? null,
    score: option.total,
    scorePercent: option.total === null ? null : formatScore(option.total),
    coverage: option.coverage,
    coveragePercent: formatScore(option.coverage),
    violatedConstraintIds: [...option.violatedConstraintIds],
    disputedCriterionIds: [...option.disputedCriterionIds],
    criteria: buildBreakdown(
      option,
      option.optionId === requestedOptionId
        ? MAX_CRITERION_LINES_FOR_REQUESTED_OPTION
        : MAX_CRITERION_LINES,
    ),
  }));

  return {
    caseId: caseState.id,
    isRankable: scoreboard.isRankable,
    ...(requested !== undefined ? { requested } : {}),
    options: { items, total: board.options.length },
    nonDiscriminatingCriterionIds: [...board.nonDiscriminatingCriterionIds],
    insights: bound(insights.map(projectInsight), MAX_INSIGHTS),
    warnings: bound(
      board.warnings.map((warning) => truncate(warning, WARNING_MAX)),
      MAX_WARNINGS,
    ),
    omitted: {
      options: board.options.length - items.length,
      criterionLines: items.reduce(
        (total, option) => total + (option.criteria.total - option.criteria.items.length),
        0,
      ),
    },
  };
}
