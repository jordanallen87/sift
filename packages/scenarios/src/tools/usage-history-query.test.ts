import { describe, expect, it } from 'vitest';
import {
  USAGE_HISTORY_QUERY_TOOL_ID,
  queryUsageHistory,
  type UsageHistoryResult,
} from './usage-history-query.js';

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
}): asserts result is { status: 'ok'; data: UsageHistoryResult } {
  expect(result.status).toBe('ok');
}

describe('queryUsageHistory', () => {
  it('returns all 18 real cycles when no cycleLabel is given, each carrying its own evidence', () => {
    const result = queryUsageHistory();
    expectOk(result);
    expect(result.data.cycles).toHaveLength(18);
    expect(result.data.evidence).toHaveLength(18);
    // Cycles come back in the fixture's own chronological order.
    expect(result.data.cycles[0]?.cycleLabel).toBe('2025-03');
    expect(result.data.cycles.at(-1)?.cycleLabel).toBe('2026-08');
  });

  it('returns exactly one cycle when cycleLabel is given, matching the real fixture figures', () => {
    const result = queryUsageHistory({ cycleLabel: '2025-08' });
    expectOk(result);
    expect(result.data.cycles).toHaveLength(1);
    const [cycle] = result.data.cycles;
    expect(cycle?.usageKwh).toBe(1080);
    expect(cycle?.billedAmount).toEqual({ amount: 157.05, currency: 'USD' });
    expect(cycle?.tariffId).toBe('tariff-standard-2024');
  });

  it('surfaces the current (anomalous) cycle exactly matching current-bill.json', () => {
    const result = queryUsageHistory({ cycleLabel: '2026-08' });
    expectOk(result);
    expect(result.data.cycles[0]?.usageKwh).toBe(1565);
    expect(result.data.cycles[0]?.billedAmount).toEqual({ amount: 248.5, currency: 'USD' });
    expect(result.data.cycles[0]?.tariffId).toBe('tariff-standard-2026');
  });

  it('tags every cycle E1 pass with a deterministic, cycle-specific sourceId', () => {
    const result = queryUsageHistory({ cycleLabel: '2026-07' });
    expectOk(result);
    const [item] = result.data.evidence;
    expect(item?.level).toBe('E1');
    expect(item?.verdict).toBe('pass');
    expect(item?.sourceId).toBe('source-usage-history-2026-07');
    expect(item?.summary).toContain('1150');
  });

  it('returns a deterministic not_found result for an unknown cycleLabel, without throwing', () => {
    const result = queryUsageHistory({ cycleLabel: '1999-01' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(USAGE_HISTORY_QUERY_TOOL_ID);
    expect(result.query).toBe('1999-01');
    expect(result.message).toContain('1999-01');
  });

  it('is idempotent: calling twice with the same input produces deep-equal output', () => {
    const first = queryUsageHistory({ cycleLabel: '2026-08' });
    const second = queryUsageHistory({ cycleLabel: '2026-08' });
    expect(second).toEqual(first);
  });

  it('is idempotent for the list-all path too', () => {
    const first = queryUsageHistory();
    const second = queryUsageHistory();
    expect(second).toEqual(first);
  });

  it('returns a cancelled result when called with an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    const result = queryUsageHistory({ signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(USAGE_HISTORY_QUERY_TOOL_ID);
  });

  it('checks the signal again mid-flight and honors a late abort', () => {
    const result = queryUsageHistory({ signal: signalAbortingOnRead(2) });
    expect(result.status).toBe('cancelled');
  });
});
