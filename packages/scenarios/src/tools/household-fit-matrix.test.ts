import { describe, expect, it } from 'vitest';
import {
  HOUSEHOLD_FIT_MATRIX_TOOL_ID,
  lookupHouseholdFit,
  type HouseholdFitResult,
} from './household-fit-matrix.js';

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
}): asserts result is { status: 'ok'; data: HouseholdFitResult } {
  expect(result.status).toBe('ok');
}

describe('lookupHouseholdFit', () => {
  it.each(ALL_CANDIDATE_IDS)(
    'returns known spec-derived facts as attribute records with real values for %s',
    (candidateId) => {
      const result = lookupHouseholdFit({ candidateId });
      expectOk(result);
      expect(result.data.knownFacts.length).toBeGreaterThan(0);
      for (const fact of result.data.knownFacts) {
        expect(fact.status).not.toBe('unknown');
        expect(fact.value).toBeDefined();
      }
    },
  );

  it.each(ALL_CANDIDATE_IDS)(
    'never fabricates a value for a fact the fixture marks unknown, for %s',
    (candidateId) => {
      const result = lookupHouseholdFit({ candidateId });
      expectOk(result);
      expect(result.data.unknowns.length).toBeGreaterThan(0);
      for (const unknown of result.data.unknowns) {
        expect(unknown.status).toBe('unknown');
        // The core invariant this test exists to prove: an unknown fact must
        // never carry a `value` key at all, fabricated or otherwise.
        expect('value' in unknown).toBe(false);
        expect(unknown.reason.length).toBeGreaterThan(0);
        expect(unknown.resolutionPath.length).toBeGreaterThan(0);
      }
      // Specifically the two documented unknowns for every candidate.
      expect(result.data.unknowns.map((unknown) => unknown.id).sort()).toEqual([
        'unknown.driving_comfort',
        'unknown.rear_cargo_crate_compatibility',
      ]);
    },
  );

  it('reports the RAV4 actual cargo dimensions as known values (not guesses)', () => {
    const result = lookupHouseholdFit({ candidateId: 'candidate-rav4' });
    expectOk(result);
    const cargoWidth = result.data.knownFacts.find(
      (fact) => fact.definitionId === 'car.cargo_width_between_wheel_wells_in',
    );
    expect(cargoWidth).toBeDefined();
    expect(cargoWidth?.value).toEqual({ type: 'number', value: 41.3, unit: 'in' });
  });

  it('includes the household dog-crate profile so a caller can compare it against known cargo dimensions itself, without the tool guessing fit', () => {
    const result = lookupHouseholdFit({ candidateId: 'candidate-rav4' });
    expectOk(result);
    expect(result.data.householdDogCrateProfile.crateCount).toBe(2);
    expect(result.data.householdDogCrateProfile.eachCrateDimensionsIn).toEqual({
      lengthIn: 36,
      widthIn: 24,
      heightIn: 27,
    });
  });

  it('tags known facts E1 pass and never emits evidence for an unknown', () => {
    const result = lookupHouseholdFit({ candidateId: 'candidate-cx5' });
    expectOk(result);
    expect(result.data.evidence.length).toBe(result.data.knownFacts.length);
    for (const item of result.data.evidence) {
      expect(item.level).toBe('E1');
      expect(item.verdict).toBe('pass');
    }
  });

  it('is idempotent: calling twice with the same input produces deep-equal output', () => {
    const first = lookupHouseholdFit({ candidateId: 'candidate-outback' });
    const second = lookupHouseholdFit({ candidateId: 'candidate-outback' });
    expect(second).toEqual(first);
  });

  it('returns a deterministic not_found result for an unknown candidate id, without throwing', () => {
    const result = lookupHouseholdFit({ candidateId: 'candidate-does-not-exist' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(HOUSEHOLD_FIT_MATRIX_TOOL_ID);
    expect(result.query).toBe('candidate-does-not-exist');
    expect(result.message).toContain('candidate-does-not-exist');
  });

  it('returns a cancelled result when called with an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    const result = lookupHouseholdFit({ candidateId: 'candidate-rav4', signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(HOUSEHOLD_FIT_MATRIX_TOOL_ID);
  });

  it('checks the signal again mid-flight and honors a late abort', () => {
    const result = lookupHouseholdFit({
      candidateId: 'candidate-rav4',
      signal: signalAbortingOnRead(2),
    });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(HOUSEHOLD_FIT_MATRIX_TOOL_ID);
  });
});
