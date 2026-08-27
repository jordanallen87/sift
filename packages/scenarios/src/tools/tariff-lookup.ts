/**
 * Fixture tool: "tariff lookup"
 * (docs/specs/packs-and-routing.md "Home Energy Guardian Decision Pack" ->
 * "Skills, specialists, and tools").
 *
 * Given an optional `tariffId`, returns that single tariff's raw rate facts
 * from `rate-schedules.json` (fixed monthly charge, volumetric rate,
 * effective dates, and -- when the fixture declares one -- the
 * `changeFromPriorTariff` detail filed alongside the tariff itself), or both
 * real tariffs when no `tariffId` is given.
 *
 * Judgment call: this tool deliberately does **not** surface `rate-
 * schedules.json`'s top-level `rateChangeImpactOnBaselineUsage` block. That
 * figure crosses two documents (a tariff's own rates plus the current
 * bill's normalized *baseline usage*, from `current-bill.json`), so
 * per-tariff `tariff-lookup.ts` is the wrong place to assert it -- exactly
 * the same "read the raw facts here, compute the cross-document number
 * elsewhere" split `listing-reader.ts` and `ownership-calculator.ts` use in
 * the car-purchase pack. `energy-calculator.ts` independently recomputes
 * the rate-change-attributable dollar amount from this tool's raw rates
 * plus the current bill's baseline usage, earning its own E3 "verified by a
 * domain-specific deterministic check" rather than this tool asserting a
 * number it did not itself derive.
 *
 * Evidence-level assignment rule: each tariff's rate facts come from one
 * traceable regulatory filing document, so each is tagged `E1` per tariff --
 * the same per-fact rule as every other car-purchase/energy reader tool in
 * this directory.
 */
import { loadFixture, type Tariff } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const TARIFF_LOOKUP_TOOL_ID = 'tariff-lookup';

export interface MoneyAmount {
  amount: number;
  currency: string;
}

export interface TariffChangeFacts {
  fixedChargeIncrease: MoneyAmount;
  fixedChargeIncreasePercent: number;
  volumetricRateIncrease: MoneyAmount;
  volumetricRateIncreasePercent: number;
}

export interface TariffFacts {
  tariffId: string;
  label: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  fixedMonthlyCustomerCharge: MoneyAmount;
  volumetricRatePerKwh: MoneyAmount;
  rateStructure: string;
  changeFromPriorTariff?: TariffChangeFacts;
}

export interface TariffLookupResult {
  tariffs: TariffFacts[];
  evidence: ToolEvidenceItem[];
}

export interface TariffLookupInput {
  tariffId?: string;
  signal?: AbortSignal;
}

function tariffSourceId(tariffId: string): string {
  return `source-rate-schedule-${tariffId}`;
}

function toTariffFacts(tariff: Tariff): TariffFacts {
  return {
    tariffId: tariff.tariffId,
    label: tariff.label,
    effectiveFrom: tariff.effectiveFrom,
    effectiveTo: tariff.effectiveTo,
    fixedMonthlyCustomerCharge: { ...tariff.fixedMonthlyCustomerCharge },
    volumetricRatePerKwh: { ...tariff.volumetricRatePerKwh },
    rateStructure: tariff.rateStructure,
    ...(tariff.changeFromPriorTariff
      ? {
          changeFromPriorTariff: {
            fixedChargeIncrease: { ...tariff.changeFromPriorTariff.fixedChargeIncrease },
            fixedChargeIncreasePercent: tariff.changeFromPriorTariff.fixedChargeIncreasePercent,
            volumetricRateIncrease: { ...tariff.changeFromPriorTariff.volumetricRateIncrease },
            volumetricRateIncreasePercent:
              tariff.changeFromPriorTariff.volumetricRateIncreasePercent,
          },
        }
      : {}),
  };
}

function toEvidenceItem(tariff: Tariff): ToolEvidenceItem {
  return {
    sourceId: tariffSourceId(tariff.tariffId),
    level: 'E1',
    verdict: 'pass',
    summary: `${tariff.label} (${tariff.tariffId}), effective ${tariff.effectiveFrom}${tariff.effectiveTo ? ` to ${tariff.effectiveTo}` : ' (current)'}: $${tariff.fixedMonthlyCustomerCharge.amount.toFixed(2)} fixed + $${tariff.volumetricRatePerKwh.amount.toFixed(3)}/kWh.`,
  };
}

export function lookupTariff(input: TariffLookupInput = {}): ToolResult<TariffLookupResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(TARIFF_LOOKUP_TOOL_ID);
  }

  const fixture = loadFixture('rate-schedules');

  if (isAborted(input.signal)) {
    return cancelledResult(TARIFF_LOOKUP_TOOL_ID);
  }

  if (input.tariffId !== undefined) {
    const tariff = fixture.tariffs.find((entry) => entry.tariffId === input.tariffId);
    if (!tariff) {
      return notFoundResult(
        TARIFF_LOOKUP_TOOL_ID,
        input.tariffId,
        `no rate-schedules tariff found for tariffId "${input.tariffId}"`,
      );
    }
    return okResult(TARIFF_LOOKUP_TOOL_ID, {
      tariffs: [toTariffFacts(tariff)],
      evidence: [toEvidenceItem(tariff)],
    });
  }

  return okResult(TARIFF_LOOKUP_TOOL_ID, {
    tariffs: fixture.tariffs.map(toTariffFacts),
    evidence: fixture.tariffs.map(toEvidenceItem),
  });
}
