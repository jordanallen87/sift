import { describe, expect, it } from 'vitest';
import {
  SAFETY_RELIABILITY_LOOKUP_TOOL_ID,
  lookupSafetyReliability,
  type SafetyReliabilityResult,
} from './safety-reliability-lookup.js';

const ALL_CANDIDATE_IDS = ['candidate-rav4', 'candidate-crv', 'candidate-cx5', 'candidate-outback'];

/** See listing-reader.test.ts for the full rationale. */
function signalAbortingOnRead(n: number): AbortSignal {
  let reads = 0;
  return {
    get aborted() {
      reads += 1;
      return reads >= n;
    },
  } as unknown as AbortSignal;
}

function expectOk(result: {
  status: string;
}): asserts result is { status: 'ok'; data: SafetyReliabilityResult } {
  expect(result.status).toBe('ok');
}

describe('lookupSafetyReliability', () => {
  it.each(ALL_CANDIDATE_IDS)(
    'returns one claim per source finding for %s, with real source provenance',
    (candidateId) => {
      const result = lookupSafetyReliability({ candidateId });
      expectOk(result);
      expect(result.data.claims.length).toBeGreaterThanOrEqual(4);
      for (const claim of result.data.claims) {
        expect(claim.publisher.length).toBeGreaterThan(0);
        expect(claim.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(claim.url).toMatch(/^https?:\/\//);
      }
    },
  );

  it('surfaces the one material disagreement for the Outback rather than silently picking a winner', () => {
    const result = lookupSafetyReliability({ candidateId: 'candidate-outback' });
    expectOk(result);

    expect(result.data.disagreements).toHaveLength(1);
    const disagreement = result.data.disagreements[0];
    expect(disagreement?.category).toBe('reliability');
    expect(disagreement?.sourceIdA).toBe('source-consumer-drive-index');
    expect(disagreement?.ratingA).toBe('Above Average');
    expect(disagreement?.sourceIdB).toBe('source-autotrust-reliability-survey');
    expect(disagreement?.ratingB).toBe('Below Average');
    expect(disagreement?.requiresSourceChallengeReview).toBe(true);

    // Both conflicting claims must still be present -- neither is dropped or
    // silently preferred over the other.
    const reliabilityClaims = result.data.claims.filter(
      (claim) => claim.category === 'reliability',
    );
    expect(reliabilityClaims).toHaveLength(2);
    expect(reliabilityClaims.map((claim) => claim.rating).sort()).toEqual([
      'Above Average',
      'Below Average',
    ]);

    // Both conflicting evidence items are degraded, not silently passed --
    // packs-and-routing.md: "A non-stale error or degraded evidence result
    // blocks completion", which is exactly right for an unresolved
    // disagreement pending source-challenger review.
    const conflictedEvidence = result.data.evidence.filter(
      (item) =>
        item.sourceId === 'source-consumer-drive-index' ||
        item.sourceId === 'source-autotrust-reliability-survey',
    );
    expect(conflictedEvidence).toHaveLength(2);
    for (const item of conflictedEvidence) {
      expect(item.verdict).toBe('degraded');
      expect(item.level).toBe('E1');
    }
  });

  it('has no disagreements and only pass verdicts for a candidate with no fixture-recorded conflict', () => {
    const result = lookupSafetyReliability({ candidateId: 'candidate-rav4' });
    expectOk(result);
    expect(result.data.disagreements).toHaveLength(0);
    for (const item of result.data.evidence) {
      expect(item.verdict).toBe('pass');
      expect(item.level).toBe('E1');
    }
  });

  it('tags every evidence item with the real fixture sourceId (no synthesized id)', () => {
    const result = lookupSafetyReliability({ candidateId: 'candidate-crv' });
    expectOk(result);
    expect(result.data.evidence.map((item) => item.sourceId).sort()).toEqual(
      [
        'source-autotrust-reliability-survey',
        'source-consumer-drive-index',
        'source-national-crash-safety-consortium',
        'source-northfield-vehicle-safety-lab',
      ].sort(),
    );
  });

  it('is idempotent: calling twice with the same input produces deep-equal output', () => {
    const first = lookupSafetyReliability({ candidateId: 'candidate-outback' });
    const second = lookupSafetyReliability({ candidateId: 'candidate-outback' });
    expect(second).toEqual(first);
  });

  it('returns a deterministic not_found result for an unknown candidate id, without throwing', () => {
    const result = lookupSafetyReliability({ candidateId: 'candidate-does-not-exist' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(SAFETY_RELIABILITY_LOOKUP_TOOL_ID);
    expect(result.query).toBe('candidate-does-not-exist');
    expect(result.message).toContain('candidate-does-not-exist');
  });

  it('returns a cancelled result when called with an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    const result = lookupSafetyReliability({
      candidateId: 'candidate-rav4',
      signal: controller.signal,
    });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(SAFETY_RELIABILITY_LOOKUP_TOOL_ID);
  });

  it('checks the signal again mid-flight and honors a late abort', () => {
    const result = lookupSafetyReliability({
      candidateId: 'candidate-rav4',
      signal: signalAbortingOnRead(2),
    });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(SAFETY_RELIABILITY_LOOKUP_TOOL_ID);
  });
});
