/**
 * Fixture tool: "historical usage query"
 * (docs/specs/packs-and-routing.md "Home Energy Guardian Decision Pack" ->
 * "Skills, specialists, and tools").
 *
 * Given an optional `cycleLabel` (e.g. `"2026-08"`), returns that single
 * billing cycle's usage/tariff/billed-amount facts from `usage-history.json`,
 * or every one of the 18 real cycles (in the fixture's own chronological
 * order) when no `cycleLabel` is given -- the same list-one-or-all shape as
 * `listing-reader.ts`'s `readListing`.
 *
 * Evidence-level assignment rule: each cycle is one line item from a single
 * traceable meter-history document, so it is tagged `E1` per cycle -- the
 * same per-fact rule `listing-reader.ts`/`safety-reliability-lookup.ts`/
 * `household-fit-matrix.ts` already use. This tool never compares cycles
 * against each other or against weather/rate data itself (that
 * cross-document arithmetic -- the year-over-year and rate/weather
 * attribution -- belongs to `energy-calculator.ts`, whose independently
 * recomputed figures are what earns the higher `E3` evidence the `energy.
 * anomaly`/`energy.rate_change`/`energy.weather` obligations require); this
 * tool's only job is to hand back the raw, traceable per-cycle readings.
 */
import { loadFixture, type UsageCycle } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const USAGE_HISTORY_QUERY_TOOL_ID = 'usage-history-query';

export interface MoneyAmount {
  amount: number;
  currency: string;
}

export interface UsageHistoryCycleFacts {
  cycleLabel: string;
  billingPeriod: { start: string; end: string };
  usageKwh: number;
  tariffId: string;
  billedAmount: MoneyAmount;
}

export interface UsageHistoryResult {
  cycles: UsageHistoryCycleFacts[];
  evidence: ToolEvidenceItem[];
}

export interface UsageHistoryQueryInput {
  cycleLabel?: string;
  signal?: AbortSignal;
}

function usageHistorySourceId(cycleLabel: string): string {
  return `source-usage-history-${cycleLabel}`;
}

function toCycleFacts(cycle: UsageCycle): UsageHistoryCycleFacts {
  return {
    cycleLabel: cycle.cycleLabel,
    billingPeriod: { ...cycle.billingPeriod },
    usageKwh: cycle.usageKwh,
    tariffId: cycle.tariffId,
    billedAmount: { ...cycle.billedAmount },
  };
}

function toEvidenceItem(cycle: UsageCycle): ToolEvidenceItem {
  return {
    sourceId: usageHistorySourceId(cycle.cycleLabel),
    level: 'E1',
    verdict: 'pass',
    summary: `Cycle ${cycle.cycleLabel} (${cycle.billingPeriod.start} to ${cycle.billingPeriod.end}): ${cycle.usageKwh} kWh billed $${cycle.billedAmount.amount.toFixed(2)} under ${cycle.tariffId}.`,
  };
}

export function queryUsageHistory(
  input: UsageHistoryQueryInput = {},
): ToolResult<UsageHistoryResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(USAGE_HISTORY_QUERY_TOOL_ID);
  }

  const fixture = loadFixture('usage-history');

  if (isAborted(input.signal)) {
    return cancelledResult(USAGE_HISTORY_QUERY_TOOL_ID);
  }

  if (input.cycleLabel !== undefined) {
    const cycle = fixture.cycles.find((entry) => entry.cycleLabel === input.cycleLabel);
    if (!cycle) {
      return notFoundResult(
        USAGE_HISTORY_QUERY_TOOL_ID,
        input.cycleLabel,
        `no usage-history cycle found for cycleLabel "${input.cycleLabel}"`,
      );
    }
    return okResult(USAGE_HISTORY_QUERY_TOOL_ID, {
      cycles: [toCycleFacts(cycle)],
      evidence: [toEvidenceItem(cycle)],
    });
  }

  return okResult(USAGE_HISTORY_QUERY_TOOL_ID, {
    cycles: fixture.cycles.map(toCycleFacts),
    evidence: fixture.cycles.map(toEvidenceItem),
  });
}
