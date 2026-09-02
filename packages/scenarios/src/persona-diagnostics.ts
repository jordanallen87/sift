/**
 * Diagnostic scores: the judgment half of the persona harness.
 *
 * The hard gates are measurements — a pane either contradicts its state or
 * it does not. These eight dimensions are opinions about whether the thing
 * is any *good*, and opinions cannot be computed. A model or a person
 * supplies them; this module only validates, aggregates, and enforces the
 * thresholds the canonical plan sets.
 *
 * That division is the whole point. A harness that generated its own
 * usability scores would produce a number for every run, which reads as
 * evidence and is not. `summarizeDiagnostics(undefined)` therefore reports
 * `scored: false` and `passed: false` with a reason, never a default.
 *
 * ## Two thresholds, for two different failures
 *
 * - **Median ≥ 4 in every dimension.** A product that is mostly fine but
 *   occasionally poor is still fine; this catches one that is consistently
 *   mediocre.
 * - **No single turn below 3 in orientation or next-action clarity.** These
 *   two are different in kind: a person who cannot tell where they are or
 *   what to do next has no way to recover on their own, so one bad turn is
 *   a real failure rather than an outlier to average away.
 */
import {
  CRITICAL_DIAGNOSTIC_DIMENSIONS,
  DIAGNOSTIC_DIMENSIONS,
  type DiagnosticDimension,
  type DiagnosticScore,
} from '@sift/contracts';

/** Every dimension's median must reach this. */
export const DIAGNOSTIC_MEDIAN_FLOOR = 4;

/** No single turn may fall below this in `orientation` or `next_action_clarity`. */
export const CRITICAL_TURN_FLOOR = 3;

export interface DiagnosticSummary {
  /** False when no diagnostic pass has run. Distinct from "ran and scored badly". */
  readonly scored: boolean;
  readonly medians: Partial<Record<DiagnosticDimension, number>>;
  readonly failures: string[];
  readonly passed: boolean;
  /** Present only when `scored` is false, explaining what is missing. */
  readonly reason?: string;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function summarizeDiagnostics(
  scores: readonly DiagnosticScore[] | undefined,
): DiagnosticSummary {
  if (scores === undefined || scores.length === 0) {
    return {
      scored: false,
      medians: {},
      failures: [],
      passed: false,
      reason:
        'No diagnostic pass has been run for this persona, so its usability is unmeasured — which is not the same as acceptable.',
    };
  }

  const byDimension = new Map<DiagnosticDimension, number[]>();
  for (const entry of scores) {
    byDimension.set(entry.dimension, [...(byDimension.get(entry.dimension) ?? []), entry.score]);
  }

  const medians: Partial<Record<DiagnosticDimension, number>> = {};
  const failures: string[] = [];

  for (const dimension of DIAGNOSTIC_DIMENSIONS) {
    const values = byDimension.get(dimension);
    if (values === undefined) {
      failures.push(`${dimension} was never scored, so this run cannot claim it is acceptable.`);
      continue;
    }
    const value = median(values);
    medians[dimension] = value;
    if (value < DIAGNOSTIC_MEDIAN_FLOOR) {
      failures.push(
        `${dimension} has a median of ${String(value)}, below the floor of ${String(DIAGNOSTIC_MEDIAN_FLOOR)}.`,
      );
    }
  }

  const critical = new Set<string>(CRITICAL_DIAGNOSTIC_DIMENSIONS);
  for (const entry of scores) {
    if (critical.has(entry.dimension) && entry.score < CRITICAL_TURN_FLOOR) {
      failures.push(
        `${entry.dimension} scored ${String(entry.score)} on turn ${String(entry.turnIndex)}; a person cannot recover from a turn that leaves them lost.`,
      );
    }
  }

  return { scored: true, medians, failures, passed: failures.length === 0 };
}
