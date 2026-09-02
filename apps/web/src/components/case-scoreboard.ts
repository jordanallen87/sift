/**
 * The workspace's view onto the deterministic scoreboard.
 *
 * `scoreCaseState` (`@sift/core`) is pure and cheap, and `apps/web` already
 * depends on `@sift/core`, so the board is computed **in the browser from
 * the snapshot the workspace already holds** rather than fetched. That is
 * not an optimization — it is what makes live what-if possible at all. A
 * reweight arriving over SSE re-renders the ranking in the same frame as
 * every other snapshot-derived value, with no request, no cache to
 * invalidate, and no window in which the visible order disagrees with the
 * visible weights.
 *
 * Critically it is the SAME function `apps/agent` calls when it validates a
 * recommendation. Two implementations that agree today are two
 * implementations that can drift, and the failure mode is a workspace
 * showing one leader while the recommendation names another.
 *
 * This module is deliberately a thin adapter and holds no scoring logic of
 * its own. Everything about how a score is computed — and every honesty
 * rule it is built around — lives in `packages/core/src/scoring.ts`.
 */
import type { CaseState } from '@sift/contracts';
import {
  deriveInsights,
  scoreCaseState,
  type CaseScoreboard,
  type Insight,
  type OptionScore,
} from '@sift/core';

export interface WorkspaceScoreboard {
  readonly board: CaseScoreboard;
  readonly insights: readonly Insight[];
  /** optionId -> its `OptionScore`, for the option views to look up by id. */
  readonly byOptionId: ReadonlyMap<string, OptionScore>;
  /** optionId -> 1-based rank among ranked options. Absent for an unrankable option. */
  readonly rankByOptionId: ReadonlyMap<string, number>;
  /**
   * False when the case cannot be ranked at all — no active criteria, no
   * options, or nothing measurable. The UI must render nothing rather than
   * an empty ranking, because an empty ranking reads as "we looked and
   * found no difference" when the truth is "there was nothing to look at".
   */
  readonly isRankable: boolean;
}

const EMPTY: WorkspaceScoreboard = {
  board: { options: [], nonDiscriminatingCriterionIds: [], warnings: [] },
  insights: [],
  byOptionId: new Map(),
  rankByOptionId: new Map(),
  isRankable: false,
};

/**
 * Builds the workspace scoreboard from a case snapshot. Returns an empty,
 * explicitly-unrankable board for a null snapshot so callers need no
 * separate null branch.
 */
export function buildWorkspaceScoreboard(snapshot: CaseState | null): WorkspaceScoreboard {
  if (snapshot === null) return EMPTY;

  const board = scoreCaseState(snapshot);
  const byOptionId = new Map(board.options.map((option) => [option.optionId, option]));

  // Rank is assigned only over options that actually have a total. An
  // unscorable option is deliberately unranked rather than ranked last:
  // "#4 of 4" is a claim about how it compares, and nothing was compared.
  const rankByOptionId = new Map<string, number>();
  let rank = 0;
  for (const option of board.options) {
    if (option.total === null) continue;
    rank += 1;
    rankByOptionId.set(option.optionId, rank);
  }

  // Whether the weights being scored are this person's, or the pack's
  // defaults they have not touched yet. Before any topic is confirmed the
  // criteria are the pack's, and insight copy claiming "what you said
  // matters" is untrue on the first screen a new person ever sees. See
  // `InsightContext` in `packages/core/src/scoring.ts`.
  const weightsAreTheirs = (snapshot.discovery?.topics ?? []).some(
    (topic) => topic.status === 'confirmed',
  );

  return {
    board,
    insights: deriveInsights(board, { weightsAreTheirs }),
    byOptionId,
    rankByOptionId,
    isRankable: rank > 1,
  };
}

/**
 * One option's place on the board, in exactly the form a card or a profile
 * needs to render it — and deliberately no other form, so no component has
 * to remember the two rules below.
 */
export interface OptionRanking {
  /** This option's full row on the board, criterion lines included. */
  readonly score: OptionScore;
  /**
   * 1-based position among the options that actually have a total, or
   * `null` when this option has none.
   *
   * `null` is emphatically NOT "last". "#4 of 4" is a claim about how an
   * option compared, and an option with no total was never compared — it
   * had nothing to compare on. Rendering the two the same way turns "we did
   * not look" into "it is the worst," which is the single most damaging
   * thing an automated ranking can assert.
   */
  readonly rank: number | null;
  /** How many options carry a rank at all — the denominator of `#n of m`, and never the total option count. */
  readonly rankedCount: number;
  /**
   * Whether the engine itself flagged this option's evidence as thin.
   *
   * Read off `deriveInsights`'s own `coverage_gap` verdict rather than by
   * comparing `coverage` against a threshold copied into the UI. The
   * threshold lives in one place (`scoring.ts`'s
   * `COVERAGE_ATTENTION_THRESHOLD`), is not exported, and a second copy here
   * would be free to drift until a card called a measurement thin that the
   * insight panel directly above it called fine.
   */
  readonly coverageFlagged: boolean;
}

/**
 * This option's ranking, or `null` when there is nothing honest to show.
 *
 * Returns `null` in two distinct situations, both of which mean the caller
 * renders NOTHING rather than an empty or hedged ranking:
 *
 *  1. the case is not rankable at all (`isRankable`) — an empty ranking
 *     reads as "we compared them and found no difference" when the truth is
 *     "there was nothing to compare";
 *  2. this option has no row on the board — either an unknown id, or an
 *     entity no active criterion can speak to (`scoreCaseState` deliberately
 *     excludes those; an energy case holds the bill itself, and ranking it
 *     would produce a nonsense row sitting at zero coverage).
 *
 * Centralized here on purpose. Three surfaces render this and each one
 * getting the `isRankable` gate right by convention is three chances to
 * ship an empty ranking.
 */
export function selectOptionRanking(
  scoreboard: WorkspaceScoreboard,
  optionId: string,
): OptionRanking | null {
  if (!scoreboard.isRankable) return null;

  const score = scoreboard.byOptionId.get(optionId);
  if (score === undefined) return null;

  return {
    score,
    rank: scoreboard.rankByOptionId.get(optionId) ?? null,
    rankedCount: scoreboard.rankByOptionId.size,
    coverageFlagged: scoreboard.insights.some(
      (insight) => insight.kind === 'coverage_gap' && insight.optionIds.includes(optionId),
    ),
  };
}

/**
 * The criterion lines worth putting on a card, strongest contribution
 * first. Cards are small and a full breakdown belongs in the profile, so
 * this is the "why is it here" summary rather than the audit trail.
 *
 * Unscored lines are excluded: a card is not the right surface for "we did
 * not establish this", which the coverage figure already communicates in
 * one number and the profile explains in full.
 */
export function topContributions(option: OptionScore, limit = 2) {
  return [...option.criteria]
    .filter((line) => line.score !== null && line.status !== 'tied')
    .sort((a, b) => b.weight * b.score! - a.weight * a.score!)
    .slice(0, limit);
}

/**
 * Formats a 0..1 score as a percentage string. Centralized so the ranking,
 * the cards, the profile, and the WebMCP projection can never disagree
 * about rounding — a card reading 62% beside a profile reading 61.5% looks
 * like two different measurements of the same thing.
 */
export function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}
