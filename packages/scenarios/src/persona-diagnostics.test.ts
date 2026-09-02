/**
 * Diagnostic scores: the part of the harness that is a judgment rather than
 * a measurement, and therefore the part most at risk of being quietly
 * invented.
 *
 * The rule these tests exist to hold: **a run with no diagnostic pass is
 * unscored, not scored zero and not scored five.** Everything else here is
 * threshold arithmetic; this is the honesty boundary.
 */
import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_DIMENSIONS,
  DiagnosticScoreSchema,
  type DiagnosticScore,
} from '@sift/contracts';
import { summarizeDiagnostics, DIAGNOSTIC_MEDIAN_FLOOR } from './persona-diagnostics.js';

function score(
  dimension: DiagnosticScore['dimension'],
  value: number,
  turnIndex = 0,
): DiagnosticScore {
  return {
    dimension,
    turnIndex,
    score: value,
    evidence: { turnIndex, quote: 'Next: Tell Sift your budget' },
  };
}

/** One score of `value` for every dimension, which is the shape a full pass produces. */
function allDimensions(value: number): DiagnosticScore[] {
  return DIAGNOSTIC_DIMENSIONS.map((dimension) => score(dimension, value));
}

describe('DiagnosticScore: a score with nothing behind it is unrepresentable', () => {
  it('refuses a score that cites no turn evidence', () => {
    const { evidence: _omitted, ...withoutEvidence } = score('orientation', 4);
    expect(DiagnosticScoreSchema.safeParse(withoutEvidence).success).toBe(false);
  });

  it('refuses a score outside 1 to 5', () => {
    expect(DiagnosticScoreSchema.safeParse(score('orientation', 0)).success).toBe(false);
    expect(DiagnosticScoreSchema.safeParse(score('orientation', 6)).success).toBe(false);
  });
});

describe('summarizeDiagnostics', () => {
  it('reports "not scored" when no diagnostic pass has run', () => {
    // Not zero, not five, and not "passed by default". The distinction
    // between "we looked and it was fine" and "nobody looked" is the whole
    // reason this function exists.
    const summary = summarizeDiagnostics(undefined);

    expect(summary.scored).toBe(false);
    expect(summary.passed).toBe(false);
    expect(summary.medians).toEqual({});
    expect(summary.reason).toMatch(/no diagnostic pass/i);
  });

  it('reports "not scored" for an empty score list, which is the same fact', () => {
    expect(summarizeDiagnostics([]).scored).toBe(false);
  });

  it('computes a median per dimension', () => {
    const summary = summarizeDiagnostics([
      score('orientation', 3, 0),
      score('orientation', 5, 1),
      score('orientation', 4, 2),
      ...allDimensions(5),
    ]);

    // 3, 4, 5, and the 5 from `allDimensions` -> median of [3,4,5,5] is 4.5.
    expect(summary.medians.orientation).toBe(4.5);
  });

  it('fails when any dimension`s median falls below the floor', () => {
    const summary = summarizeDiagnostics([
      ...allDimensions(5).filter((entry) => entry.dimension !== 'efficiency'),
      score('efficiency', 3),
    ]);

    expect(summary.passed).toBe(false);
    expect(summary.failures.some((failure) => failure.includes('efficiency'))).toBe(true);
  });

  it('passes when every dimension meets the floor', () => {
    const summary = summarizeDiagnostics(allDimensions(DIAGNOSTIC_MEDIAN_FLOOR));
    expect(summary.passed).toBe(true);
    expect(summary.failures).toEqual([]);
  });

  it('fails when a single orientation turn scores below 3, even with a healthy median', () => {
    // The canonical plan's stricter rule for the two dimensions a person
    // cannot recover from on their own: one bad turn is a failure, not an
    // outlier to be averaged away.
    const summary = summarizeDiagnostics([...allDimensions(5), score('orientation', 2, 4)]);

    expect(summary.passed).toBe(false);
    expect(summary.failures.some((failure) => failure.includes('turn 4'))).toBe(true);
  });

  it('applies the per-turn floor to next-action clarity as well', () => {
    const summary = summarizeDiagnostics([...allDimensions(5), score('next_action_clarity', 2, 7)]);
    expect(summary.passed).toBe(false);
  });

  it('does not apply the per-turn floor to the other six dimensions', () => {
    const summary = summarizeDiagnostics([...allDimensions(5), score('efficiency', 2, 3)]);
    // Median across [5, 2] is 3.5 -- below the floor, so it still fails,
    // but for the median reason rather than the per-turn one.
    expect(summary.failures.every((failure) => !failure.includes('turn 3'))).toBe(true);
  });

  it('fails when a dimension was never scored at all', () => {
    const summary = summarizeDiagnostics(
      allDimensions(5).filter((entry) => entry.dimension !== 'trust_evidence'),
    );

    expect(summary.passed).toBe(false);
    expect(summary.failures.some((failure) => failure.includes('trust_evidence'))).toBe(true);
  });
});
