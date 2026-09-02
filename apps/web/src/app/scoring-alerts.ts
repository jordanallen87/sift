/**
 * Scoring warnings, turned into the alerts a person sees.
 *
 * These say what could *not* be ranked and why — "Advertised price could
 * not be ranked: values use different currencies". They were readable by
 * ChatGPT through `sift_get_ranking` and invisible in the pane, which is an
 * asymmetry in exactly the wrong direction: a criterion that could not be
 * scored is a limit on the answer being shown, and the person looking at
 * the answer is the one who needs to know.
 *
 * Extracted from `App.tsx` rather than left inline so the cap and the
 * overflow wording are testable without mounting the whole workspace.
 */

/**
 * How many warnings appear in full before the rest are counted.
 *
 * Two, because the alert banner sits above the recommendation and a long
 * list of unscorable attributes would push the answer off the screen. The
 * overflow line says how many more there are rather than dropping them
 * silently — the count is the honest part.
 */
export const MAX_VISIBLE_SCORING_WARNINGS = 2;

export interface ScoringAlert {
  readonly id: string;
  readonly tone: 'attention';
  readonly message: string;
}

export function buildScoringAlerts(warnings: readonly string[]): ScoringAlert[] {
  const shown = warnings
    .slice(0, MAX_VISIBLE_SCORING_WARNINGS)
    .map((warning, index): ScoringAlert => ({
      id: `scoring-warning-${String(index)}`,
      tone: 'attention',
      message: warning,
    }));

  const hidden = warnings.length - shown.length;
  if (hidden <= 0) return shown;

  return [
    ...shown,
    {
      id: 'scoring-warning-overflow',
      tone: 'attention',
      message: `${String(hidden)} more thing${hidden === 1 ? '' : 's'} could not be ranked.`,
    },
  ];
}
