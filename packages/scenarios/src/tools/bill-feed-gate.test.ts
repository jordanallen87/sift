import { describe, expect, it } from 'vitest';
import { loadFixture } from './fixture-loader.js';
import { DEFAULT_ANOMALY_THRESHOLD_PERCENT } from './energy-calculator.js';
import { evaluateBillFeed, loadAndEvaluateBillFeed } from './bill-feed-gate.js';

describe('evaluateBillFeed', () => {
  it('opens a case for the real, checked-in 42%-above-baseline bill (current-bill.json)', () => {
    const bill = loadFixture('current-bill');
    const decision = evaluateBillFeed(bill);

    expect(decision.caseShouldOpen).toBe(true);
    expect(decision.percentAboveBaseline).toBe(42);
    expect(decision.thresholdPercent).toBe(DEFAULT_ANOMALY_THRESHOLD_PERCENT);
    expect(decision.currentAmount).toEqual({ amount: 248.5, currency: 'USD' });
    expect(decision.baselineAmount).toEqual({ amount: 175.0, currency: 'USD' });
    expect(decision.reason).toMatch(/42%/);
    expect(decision.reason).toMatch(/abnormal/i);
    // The reason string is shown to a person verbatim (DemoLauncher renders
    // it), so the figures the decision rests on have to actually appear in
    // it. Asserting only /42%/ let `formatMoney` be mutated to return ""
    // -- dropping both dollar amounts from the sentence -- with every test
    // still green. Pinning the rendered amounts, including the two-decimal
    // formatting, is what makes that regression fail here.
    expect(decision.reason).toContain('$248.50 USD');
    expect(decision.reason).toContain('$175.00 USD');
  });

  it('does NOT open a case for the real, checked-in within-threshold bill (current-bill-normal.json)', () => {
    const bill = loadFixture('current-bill-normal');
    const decision = evaluateBillFeed(bill);

    expect(decision.caseShouldOpen).toBe(false);
    expect(decision.percentAboveBaseline).toBeLessThan(15);
    expect(decision.thresholdPercent).toBe(DEFAULT_ANOMALY_THRESHOLD_PERCENT);
    expect(decision.reason).toMatch(/normal|no case/i);
    expect(decision.reason).toContain('$177.25 USD');
    expect(decision.reason).toContain('$169.75 USD');
  });

  it('is a pure function of its bill argument -- no disk I/O, works on a hand-built bill object, no cast needed', () => {
    const decision = evaluateBillFeed({
      currentAmount: { amount: 110, currency: 'USD' },
      baseline: { amount: { amount: 100, currency: 'USD' } },
    });
    expect(decision.percentAboveBaseline).toBe(10);
    expect(decision.caseShouldOpen).toBe(false);
  });

  it('honors a caller-supplied threshold override', () => {
    const bill = loadFixture('current-bill-normal');
    // Push the threshold below this bill's real ~4-5% gap so the same
    // fixture that normally declines now opens -- proves the threshold is
    // a real parameter, not baked into the fixture.
    const decision = evaluateBillFeed(bill, 1);
    expect(decision.thresholdPercent).toBe(1);
    expect(decision.caseShouldOpen).toBe(true);
  });

  it('deep-equals a second call on the same input (deterministic)', () => {
    const bill = loadFixture('current-bill');
    expect(evaluateBillFeed(bill)).toEqual(evaluateBillFeed(bill));
  });
});

describe('loadAndEvaluateBillFeed', () => {
  it('loads "current-bill" from disk and evaluates it (opens a case)', () => {
    const decision = loadAndEvaluateBillFeed('current-bill');
    expect(decision.caseShouldOpen).toBe(true);
    expect(decision.percentAboveBaseline).toBe(42);
  });

  it('loads "current-bill-normal" from disk and evaluates it (does not open a case)', () => {
    const decision = loadAndEvaluateBillFeed('current-bill-normal');
    expect(decision.caseShouldOpen).toBe(false);
  });
});
