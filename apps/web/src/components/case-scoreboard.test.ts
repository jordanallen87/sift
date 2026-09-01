/**
 * Tests for the workspace's adapter onto the deterministic scoreboard.
 *
 * The arithmetic itself belongs to `packages/core/src/scoring.ts` and is
 * tested there; nothing here re-asserts a percentage. What IS tested here is
 * every rule the UI depends on the adapter to enforce, because each one is a
 * lie the workspace would otherwise tell:
 *
 *  - an option with no total is UNRANKED, never ranked last;
 *  - a case with nothing to compare is not rankable at all, so the views
 *    render nothing rather than an empty ranking;
 *  - the "this option is thinly measured" verdict comes from the engine's
 *    own `coverage_gap` insight rather than from a threshold copied into
 *    the UI, where it could drift.
 */
import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceScoreboard,
  selectOptionRanking,
  formatScore,
  topContributions,
} from './case-scoreboard.js';
import { buildFixtureCaseState } from '../test/fixtures.js';
import {
  buildCarCaseState,
  buildEnergyCaseState,
  CAR_CRITERIA,
  CAR_DEFINITIONS,
} from '../test/scoreboard-fixtures.js';

describe('buildWorkspaceScoreboard', () => {
  it('ranks the car case best-first and leaves the unmeasured option out of the ranking entirely', () => {
    const scoreboard = buildWorkspaceScoreboard(buildCarCaseState());

    expect(scoreboard.isRankable).toBe(true);
    expect(scoreboard.rankByOptionId.get('candidate-outback')).toBeUndefined();
    expect(scoreboard.byOptionId.get('candidate-outback')?.total).toBeNull();

    // Three cars carry a total, so the ranks run 1..3 -- the fourth is
    // absent from the map rather than holding position 4.
    expect([...scoreboard.rankByOptionId.values()].sort()).toEqual([1, 2, 3]);
  });

  it('ranks the energy case, including the option that trips a hard constraint', () => {
    const scoreboard = buildWorkspaceScoreboard(buildEnergyCaseState());

    expect(scoreboard.isRankable).toBe(true);
    // Rule 4: a violator is ranked LAST, not removed -- it still holds a
    // real position on the board.
    const audit = scoreboard.byOptionId.get('option-audit');
    expect(audit?.violatedConstraintIds).toEqual(['custom.no_consequential_action']);
    expect(scoreboard.rankByOptionId.get('option-audit')).toBe(4);

    // ...and the billing cycle, which no active criterion can measure, is
    // unranked even though it sorts ABOVE the violator. "Unranked" is not a
    // synonym for "last".
    expect(scoreboard.rankByOptionId.get('billing-cycle-2026-07')).toBeUndefined();
  });

  it('is not rankable when there is nothing to compare', () => {
    // No options at all.
    expect(buildWorkspaceScoreboard(buildCarCaseState({ entities: [] })).isRankable).toBe(false);
    // No active criteria, so no option can be scored on anything.
    expect(buildWorkspaceScoreboard(buildCarCaseState({ criteria: [] })).isRankable).toBe(false);
    // A single option: there is a score, but no ranking, because a field of
    // one has no order.
    const single = buildWorkspaceScoreboard(
      buildCarCaseState({ entities: buildCarCaseState().entities.slice(0, 1) }),
    );
    expect(single.isRankable).toBe(false);
    // And a null snapshot, so callers need no separate branch.
    expect(buildWorkspaceScoreboard(null).isRankable).toBe(false);
  });
});

describe('selectOptionRanking', () => {
  it('returns null for every option when the case is not rankable', () => {
    // A field of one: the option IS on the board and DOES carry a total, so
    // this is the case the gate exists for -- there is a number to show and
    // showing it as a ranking would still be a lie, because nothing was
    // ranked against anything.
    const scoreboard = buildWorkspaceScoreboard(
      buildCarCaseState({ entities: buildCarCaseState().entities.slice(0, 1) }),
    );
    expect(scoreboard.board.options).toHaveLength(1);
    expect(scoreboard.board.options[0]?.total).not.toBeNull();
    expect(scoreboard.isRankable).toBe(false);

    for (const option of scoreboard.board.options) {
      expect(selectOptionRanking(scoreboard, option.optionId)).toBeNull();
    }
  });

  it('returns a null rank -- not a last-place rank -- for an option with no total', () => {
    const scoreboard = buildWorkspaceScoreboard(buildCarCaseState());
    const ranking = selectOptionRanking(scoreboard, 'candidate-outback');

    expect(ranking).not.toBeNull();
    expect(ranking?.rank).toBeNull();
    expect(ranking?.score.total).toBeNull();
    expect(ranking?.rankedCount).toBe(3);
  });

  it('carries the position, the count, and the option score for a ranked option', () => {
    const scoreboard = buildWorkspaceScoreboard(buildCarCaseState());
    const ranking = selectOptionRanking(scoreboard, 'candidate-rav4');

    expect(ranking?.rank).toBe(2);
    expect(ranking?.rankedCount).toBe(3);
    expect(ranking?.score.optionId).toBe('candidate-rav4');
    expect(ranking?.score.coverage).toBe(1);
  });

  it('flags thin coverage from the engine`s own coverage_gap insight, never a threshold of its own', () => {
    const scoreboard = buildWorkspaceScoreboard(buildCarCaseState());
    const gap = scoreboard.insights.find((insight) => insight.kind === 'coverage_gap');
    expect(gap).toBeDefined();

    // Exactly the options the engine named, and no others.
    for (const option of scoreboard.board.options) {
      const ranking = selectOptionRanking(scoreboard, option.optionId);
      expect(ranking?.coverageFlagged).toBe(gap?.optionIds.includes(option.optionId));
    }
    expect(selectOptionRanking(scoreboard, 'candidate-forester')?.coverageFlagged).toBe(true);
    expect(selectOptionRanking(scoreboard, 'candidate-crv')?.coverageFlagged).toBe(false);
  });

  it('returns null for an option id the board does not hold', () => {
    const scoreboard = buildWorkspaceScoreboard(buildCarCaseState());
    expect(selectOptionRanking(scoreboard, 'candidate-nonexistent')).toBeNull();
  });

  it('returns null for an entity the criteria cannot speak to', () => {
    // A note-shaped entity nothing measures never reaches the board at all,
    // so there is no ranking to show for it.
    const state = buildFixtureCaseState({
      attributeDefinitions: CAR_DEFINITIONS,
      criteria: CAR_CRITERIA,
      entities: [
        ...buildCarCaseState().entities,
        {
          id: 'dealer-1',
          kind: 'dealer',
          label: 'Bay Area Toyota',
          attributes: {},
          createdAt: '2026-08-27T00:00:00.000Z',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
    });
    const scoreboard = buildWorkspaceScoreboard(state);
    expect(selectOptionRanking(scoreboard, 'dealer-1')).toBeNull();
  });
});

describe('formatScore and topContributions', () => {
  it('formats a 0..1 score as a whole percentage', () => {
    expect(formatScore(0)).toBe('0%');
    expect(formatScore(0.4524)).toBe('45%');
    expect(formatScore(1)).toBe('100%');
  });

  it('returns the strongest scored contributions for a card, never an unscored line', () => {
    const scoreboard = buildWorkspaceScoreboard(buildEnergyCaseState());
    const monitor = scoreboard.byOptionId.get('option-monitor');
    expect(monitor).toBeDefined();

    const top = topContributions(monitor!, 2);
    for (const line of top) {
      expect(line.score).not.toBeNull();
      expect(line.status).not.toBe('tied');
    }
  });
});
