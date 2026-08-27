import { describe, expect, it } from 'vitest';
import { TARIFF_LOOKUP_TOOL_ID, lookupTariff, type TariffLookupResult } from './tariff-lookup.js';

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
}): asserts result is { status: 'ok'; data: TariffLookupResult } {
  expect(result.status).toBe('ok');
}

describe('lookupTariff', () => {
  it('returns both real tariffs when no tariffId is given', () => {
    const result = lookupTariff();
    expectOk(result);
    expect(result.data.tariffs.map((tariff) => tariff.tariffId).sort()).toEqual(
      ['tariff-standard-2024', 'tariff-standard-2026'].sort(),
    );
    expect(result.data.evidence).toHaveLength(2);
  });

  it('returns the current tariff with its real rate figures and change-from-prior detail', () => {
    const result = lookupTariff({ tariffId: 'tariff-standard-2026' });
    expectOk(result);
    expect(result.data.tariffs).toHaveLength(1);
    const [tariff] = result.data.tariffs;
    expect(tariff?.fixedMonthlyCustomerCharge).toEqual({ amount: 13.75, currency: 'USD' });
    expect(tariff?.volumetricRatePerKwh).toEqual({ amount: 0.15, currency: 'USD' });
    expect(tariff?.effectiveTo).toBeNull();
    expect(tariff?.changeFromPriorTariff?.fixedChargeIncreasePercent).toBeCloseTo(22.22, 2);
    expect(tariff?.changeFromPriorTariff?.volumetricRateIncreasePercent).toBeCloseTo(11.11, 2);
  });

  it('returns the prior tariff with no changeFromPriorTariff block', () => {
    const result = lookupTariff({ tariffId: 'tariff-standard-2024' });
    expectOk(result);
    expect(result.data.tariffs[0]?.changeFromPriorTariff).toBeUndefined();
    expect(result.data.tariffs[0]?.effectiveTo).toBe('2026-05-31');
  });

  it('tags each tariff E1 pass with a deterministic, tariff-specific sourceId', () => {
    const result = lookupTariff({ tariffId: 'tariff-standard-2026' });
    expectOk(result);
    const [item] = result.data.evidence;
    expect(item?.level).toBe('E1');
    expect(item?.verdict).toBe('pass');
    expect(item?.sourceId).toBe('source-rate-schedule-tariff-standard-2026');
    expect(item?.summary).toContain('0.15');
  });

  it('returns a deterministic not_found result for an unknown tariffId, without throwing', () => {
    const result = lookupTariff({ tariffId: 'tariff-does-not-exist' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(TARIFF_LOOKUP_TOOL_ID);
    expect(result.query).toBe('tariff-does-not-exist');
  });

  it('is idempotent: calling twice with the same input produces deep-equal output', () => {
    const first = lookupTariff({ tariffId: 'tariff-standard-2026' });
    const second = lookupTariff({ tariffId: 'tariff-standard-2026' });
    expect(second).toEqual(first);
  });

  it('returns a cancelled result when called with an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    const result = lookupTariff({ signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(TARIFF_LOOKUP_TOOL_ID);
  });

  it('checks the signal again mid-flight and honors a late abort', () => {
    const result = lookupTariff({ signal: signalAbortingOnRead(2) });
    expect(result.status).toBe('cancelled');
  });
});
