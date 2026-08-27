import { describe, expect, it } from 'vitest';
import {
  OWNERSHIP_CALCULATOR_TOOL_ID,
  calculateOwnershipCost,
  computeAmortizedFinancing,
  type OwnershipCostResult,
} from './ownership-calculator.js';

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
}): asserts result is { status: 'ok'; data: OwnershipCostResult } {
  expect(result.status).toBe('ok');
}

/** Independent reference implementation of standard fixed-rate amortization, reimplemented from the textbook formula rather than copied from the tool, to catch a regression in the tool's own math. */
function referenceAmortization(principal: number, apr: number, termMonths: number) {
  const r = apr / 12;
  const payment = r === 0 ? principal / termMonths : (principal * r) / (1 - (1 + r) ** -termMonths);
  const totalPaid = payment * termMonths;
  return { monthlyPayment: payment, totalInterest: totalPaid - principal };
}

describe('computeAmortizedFinancing', () => {
  it('matches a reference amortization formula for a non-zero APR', () => {
    const result = computeAmortizedFinancing(30291.3, 0.065, 60);
    const reference = referenceAmortization(30291.3, 0.065, 60);
    expect(result.monthlyPayment).toBeCloseTo(reference.monthlyPayment, 1);
    expect(result.totalInterest).toBeCloseTo(reference.totalInterest, 1);
    expect(result.totalInterest).toBeGreaterThan(0);
  });

  it('handles a zero APR without dividing by zero: no interest, even principal split', () => {
    const result = computeAmortizedFinancing(6000, 0, 60);
    expect(result.monthlyPayment).toBe(100);
    expect(result.totalPaid).toBe(6000);
    expect(result.totalInterest).toBe(0);
  });

  it('produces a total paid within a rounding cent of monthly payment times term months', () => {
    // Both `monthlyPayment` and `totalPaid` are independently rounded to the
    // cent from the unrounded formula, so their product can differ from
    // `totalPaid` by at most a few cents of compounded rounding across 36
    // months -- not a bug, just floating-point rounding at the boundary.
    const result = computeAmortizedFinancing(20000, 0.05, 36);
    expect(Math.abs(result.totalPaid - result.monthlyPayment * 36)).toBeLessThan(1);
  });
});

describe('calculateOwnershipCost', () => {
  it('itemizes every component and the total equals their exact sum (showing its work, not just a total)', () => {
    const result = calculateOwnershipCost({ candidateId: 'candidate-rav4' });
    expectOk(result);
    const { components, totalFiveYearCost } = result.data;
    const sum =
      components.fuel.amount +
      components.maintenance.amount +
      components.insurance.amount +
      components.depreciation.amount +
      components.financing.amount;
    expect(totalFiveYearCost).toBe(sum);
  });

  it('computes the RAV4 fuel and maintenance costs matching the fixture-documented arithmetic', () => {
    const result = calculateOwnershipCost({ candidateId: 'candidate-rav4' });
    expectOk(result);
    // Fixture arithmeticNote: "60000 mi / 38 mpg = 1578.95 gal; 1578.95 * 3.45 = 5447.37"
    expect(result.data.components.fuel.totalMiles).toBe(60000);
    expect(result.data.components.fuel.amount).toBeCloseTo(5447.37, 1);
    // Fixture arithmeticNote: "60000 mi * 0.08 = 4800.00"
    expect(result.data.components.maintenance.amount).toBe(4800);
    expect(result.data.components.maintenance.powertrainClass).toBe('hybrid');
  });

  it('bases depreciation on the true out-the-door price, not the advertised price', () => {
    const result = calculateOwnershipCost({ candidateId: 'candidate-rav4' });
    expectOk(result);
    // trueOutTheDoorPrice 33291.30 * (1 - 55/100) = 14981.085 -> 14981.09
    expect(result.data.components.depreciation.basisPrice).toBeCloseTo(33291.3, 2);
    expect(result.data.components.depreciation.amount).toBeCloseTo(14981.09, 2);
  });

  it('finances every candidate with the shared financingBaseline apr/term, never the candidate-specific dealer APR', () => {
    const rav4 = calculateOwnershipCost({ candidateId: 'candidate-rav4' });
    const crv = calculateOwnershipCost({ candidateId: 'candidate-crv' });
    expectOk(rav4);
    expectOk(crv);
    // RAV4's actual dealer offer is 7.49%/75mo and CR-V's is 5.9%/60mo
    // (dealer-offers.json); both must use the shared baseline (6.5%/60mo)
    // instead so the comparison stays apples-to-apples.
    expect(rav4.data.components.financing.apr).toBe(0.065);
    expect(rav4.data.components.financing.termMonths).toBe(60);
    expect(crv.data.components.financing.apr).toBe(0.065);
    expect(crv.data.components.financing.termMonths).toBe(60);
  });

  it.each(ALL_CANDIDATE_IDS)(
    'produces a single E3 deterministic-check evidence item for %s',
    (candidateId) => {
      const result = calculateOwnershipCost({ candidateId });
      expectOk(result);
      expect(result.data.evidence).toHaveLength(1);
      expect(result.data.evidence[0]?.level).toBe('E3');
      expect(result.data.evidence[0]?.verdict).toBe('pass');
      expect(result.data.evidence[0]?.sourceId).toContain(candidateId);
      expect(result.data.evidence[0]?.summary).toContain(result.data.totalFiveYearCost.toFixed(2));
    },
  );

  it('is deterministic and reproducible: identical input twice produces deep-equal output', () => {
    const first = calculateOwnershipCost({ candidateId: 'candidate-outback' });
    const second = calculateOwnershipCost({ candidateId: 'candidate-outback' });
    expect(second).toEqual(first);
  });

  it('returns a deterministic not_found result for an unknown candidate id, without throwing', () => {
    const result = calculateOwnershipCost({ candidateId: 'candidate-does-not-exist' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(OWNERSHIP_CALCULATOR_TOOL_ID);
    expect(result.query).toBe('candidate-does-not-exist');
    expect(result.message).toContain('candidate-does-not-exist');
  });

  it('returns a cancelled result when called with an already-aborted signal, before computing anything', () => {
    const controller = new AbortController();
    controller.abort();
    const result = calculateOwnershipCost({
      candidateId: 'candidate-rav4',
      signal: controller.signal,
    });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(OWNERSHIP_CALCULATOR_TOOL_ID);
  });

  it('checks the signal again mid-flight and honors a late abort', () => {
    const result = calculateOwnershipCost({
      candidateId: 'candidate-rav4',
      signal: signalAbortingOnRead(2),
    });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(OWNERSHIP_CALCULATOR_TOOL_ID);
  });

  it.each(ALL_CANDIDATE_IDS)('produces a positive total for %s', (candidateId) => {
    const result = calculateOwnershipCost({ candidateId });
    expectOk(result);
    expect(result.data.totalFiveYearCost).toBeGreaterThan(0);
    expect(result.data.ownershipHorizonYears).toBe(5);
    expect(result.data.currency).toBe('USD');
  });
});
