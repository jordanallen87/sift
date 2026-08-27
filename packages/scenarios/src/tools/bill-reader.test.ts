import { describe, expect, it } from 'vitest';
import { BILL_READER_TOOL_ID, readCurrentBill, type CurrentBillResult } from './bill-reader.js';

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
}): asserts result is { status: 'ok'; data: CurrentBillResult } {
  expect(result.status).toBe('ok');
}

describe('readCurrentBill', () => {
  it('returns the real current-bill.json facts: billing period, tariff, usage, charges, baseline, anomaly', () => {
    const result = readCurrentBill();
    expectOk(result);
    const { data } = result;

    expect(data.householdId).toBe('household-demo-energy-01');
    expect(data.billingPeriod).toEqual({ start: '2026-07-16', end: '2026-08-14', days: 30 });
    expect(data.tariffId).toBe('tariff-standard-2026');
    expect(data.usage).toEqual({ value: 1565, unit: 'kWh' });
    expect(data.currentAmount).toEqual({ amount: 248.5, currency: 'USD' });
    expect(data.baseline.amount).toEqual({ amount: 175.0, currency: 'USD' });
    expect(data.baseline.usage).toEqual({ value: 1075, unit: 'kWh' });
    expect(data.anomaly.percentAboveBaseline).toBe(42);
    expect(data.anomaly.usageGapAboveBaselineKwh).toBe(490);
  });

  it('surfaces the itemized charges without collapsing them into just the total', () => {
    const result = readCurrentBill();
    expectOk(result);
    expect(result.data.charges.fixedMonthlyCustomerCharge).toEqual({
      amount: 13.75,
      currency: 'USD',
    });
    expect(result.data.charges.volumetricCharge.amount).toBe(234.75);
    expect(result.data.charges.totalAmount.amount).toBe(248.5);
  });

  it('tags the bill as a single traceable source at E1, verdict pass', () => {
    const result = readCurrentBill();
    expectOk(result);
    expect(result.data.evidence).toHaveLength(1);
    const [item] = result.data.evidence;
    expect(item?.level).toBe('E1');
    expect(item?.verdict).toBe('pass');
    expect(item?.sourceId).toBe('source-current-bill-household-demo-energy-01');
    expect(item?.summary).toContain('248.50');
    expect(item?.summary).toContain('42%');
  });

  it('is idempotent: calling twice produces deep-equal output', () => {
    const first = readCurrentBill();
    const second = readCurrentBill();
    expect(second).toEqual(first);
  });

  it('returns a cancelled result when called with an already-aborted signal, before reading anything', () => {
    const controller = new AbortController();
    controller.abort();
    const result = readCurrentBill({ signal: controller.signal });
    if (result.status !== 'cancelled') {
      throw new Error(`expected status "cancelled", got "${result.status}"`);
    }
    expect(result.toolId).toBe(BILL_READER_TOOL_ID);
    expect(result.message).toContain('cancelled');
  });

  it('checks the signal again mid-flight, after the fixture loads, and honors a late abort', () => {
    const result = readCurrentBill({ signal: signalAbortingOnRead(2) });
    if (result.status !== 'cancelled') {
      throw new Error(`expected status "cancelled", got "${result.status}"`);
    }
    expect(result.toolId).toBe(BILL_READER_TOOL_ID);
  });
});
