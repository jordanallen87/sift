/**
 * Turning "this could not be ranked" into something a person sees.
 *
 * The cap is the interesting part. Two warnings shown and the rest counted
 * is a deliberate trade: the alert banner sits above the recommendation, so
 * an uncapped list would push the answer off the screen — but dropping the
 * remainder silently would be the product hiding its own limits, which is
 * the failure mode this whole codebase is built against. The count is what
 * keeps the trade honest.
 */
import { describe, expect, it } from 'vitest';
import { buildScoringAlerts, MAX_VISIBLE_SCORING_WARNINGS } from './scoring-alerts.js';

describe('buildScoringAlerts', () => {
  it('says nothing when everything could be ranked', () => {
    expect(buildScoringAlerts([])).toEqual([]);
  });

  it('passes a warning through in the scorer`s own words', () => {
    // Not rewritten: `packages/core` already phrases these for a person
    // ("Advertised price could not be ranked: values use different
    // currencies"), and paraphrasing here would put the wording in two
    // places that can drift apart.
    const alerts = buildScoringAlerts(['Advertised price could not be ranked: mixed currencies']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.message).toBe('Advertised price could not be ranked: mixed currencies');
    expect(alerts[0]?.tone).toBe('attention');
  });

  it('shows up to the cap in full', () => {
    const alerts = buildScoringAlerts(['a', 'b']);
    expect(alerts.map((alert) => alert.message)).toEqual(['a', 'b']);
  });

  it('counts the rest rather than dropping them', () => {
    const alerts = buildScoringAlerts(['a', 'b', 'c', 'd']);
    expect(alerts).toHaveLength(MAX_VISIBLE_SCORING_WARNINGS + 1);
    expect(alerts.at(-1)?.message).toBe('2 more things could not be ranked.');
  });

  it('reads correctly when exactly one is hidden', () => {
    expect(buildScoringAlerts(['a', 'b', 'c']).at(-1)?.message).toBe(
      '1 more thing could not be ranked.',
    );
  });

  it('gives every alert a distinct id, so React never collapses two warnings into one', () => {
    const ids = buildScoringAlerts(['a', 'b', 'c']).map((alert) => alert.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
