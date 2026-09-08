/**
 * Fixture tool: "calculator"
 * (docs/specs/packs-and-routing.md "Home Energy Guardian Decision Pack" ->
 * "Skills, specialists, and tools").
 *
 * Two independent deterministic computations, mirroring
 * `ownership-calculator.ts`'s discipline of *recomputing* derived figures
 * from raw assumptions rather than copying a fixture's own precomputed
 * total, so the resulting evidence is honestly `E3` ("verified by a
 * domain-specific deterministic check", packs-and-routing.md's
 * evidence-level table) rather than a restated `E1` fact:
 *
 * 1. `calculateEnergyAnalysis` -- backs `energy.anomaly` (E3, 1 attempt),
 *    `energy.rate_change` (E2, 2 attempts), and `energy.weather` (E2, 2
 *    attempts). Reads `current-bill.json`, `rate-schedules.json`, and
 *    `weather-history.json` directly and independently recomputes:
 *      - whether the bill is materially abnormal (percent above the
 *        normalized baseline, against a threshold);
 *      - how much of the increase is attributable to the tariff/fee change
 *        alone, holding usage at the normalized baseline (packs-and-
 *        routing.md: "How much of the increase comes from tariff or fee
 *        changes?");
 *      - how much of the usage increase is explained by weather (packs-
 *        and-routing.md: "How much is explained by weather-normalized
 *        usage?"), and the residual gap left over for `energy.
 *        household_change` investigation to explain.
 *
 * 2. `evaluateResponseOptions` -- backs `energy.response_options` (E2, 2
 *    attempts: "Which actions fit the user's cost and conservation
 *    criteria?"). Reads `response-options.json` and scores each option
 *    against caller-supplied cost/conservation weights.
 *
 * Judgment call (anomaly threshold): `thresholdPercent` defaults to `15`.
 * The fixture itself never states a numeric "materially abnormal" cutoff
 * (it only narrates that the actual 42% is abnormal); 15% is a defensible,
 * conservative rule-of-thumb bill-monitoring threshold (comfortably below
 * the real fixture's 42%, comfortably above ordinary month-to-month noise)
 * documented here rather than left implicit, and callers may override it.
 *
 * Judgment call (response-option scoring): the fixture exposes only a
 * `roughCost` amount and a boolean `addressesRootCause` per option -- no
 * continuous "conservation impact" metric exists to score against. This
 * tool therefore operationalizes "conservation criteria" as
 * `addressesRootCause` directly (1.0 if it targets the confirmed root
 * cause, 0.0 otherwise) and "cost criteria" as a linear score normalized
 * against the *most expensive option actually offered*
 * (`maxRoughCostAmongOptions`, computed from the fixture itself, never
 * hardcoded) rather than an arbitrary absolute dollar scale. `fitScore` is
 * the weight-normalized blend of the two, so a caller's weights need not
 * sum to 1. A `maxRoughCost` budget cap is surfaced as an informational
 * `withinBudget` flag rather than silently filtering an option out --
 * packs-and-routing.md's non-negotiable truth that the deterministic core
 * "owns case state, evidence validity, readiness, and human authority"
 * means this tool must show every option to a human, not quietly hide one.
 */
import { loadFixture, type ResponseOption, type Tariff } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const ENERGY_CALCULATOR_TOOL_ID = 'energy-calculator';

/** Default "materially abnormal" threshold -- see the file docstring's judgment-call note. */
const DEFAULT_ANOMALY_THRESHOLD_PERCENT = 15;

/** Default equal weighting between cost and conservation/root-cause fit -- see the file docstring's judgment-call note. */
const DEFAULT_COST_WEIGHT = 0.5;
const DEFAULT_CONSERVATION_WEIGHT = 0.5;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export interface MoneyAmount {
  amount: number;
  currency: string;
}

// --- calculateEnergyAnalysis ---

export interface AnomalyDetermination {
  currentAmount: MoneyAmount;
  baselineAmount: MoneyAmount;
  percentAboveBaseline: number;
  thresholdPercent: number;
  isMateriallyAbnormal: boolean;
}

export interface RateChangeAttribution {
  baselineUsageKwh: number;
  priorTariffId: string;
  currentTariffId: string;
  billUnderPriorTariffAtBaselineUsage: MoneyAmount;
  billUnderCurrentTariffAtBaselineUsage: MoneyAmount;
  rateChangeAttributableAmount: MoneyAmount;
  totalGapVsPriorTariffAtActualUsage: MoneyAmount;
  rateChangeAttributablePercentOfTotalGap: number;
}

export interface WeatherNormalizedUsage {
  cycleLabel: string;
  typicalCdd: number;
  actualCdd: number;
  excessCdd: number;
  weatherSensitivityKwhPerCdd: number;
  usageExplainedByWeatherKwh: number;
  dollarEquivalent: MoneyAmount;
}

export interface UnexplainedUsageGap {
  usageGapAboveBaselineKwh: number;
  usageExplainedByWeatherKwh: number;
  unexplainedUsageKwh: number;
}

export interface EnergyAnalysisResult {
  anomaly: AnomalyDetermination;
  rateChange: RateChangeAttribution;
  weather: WeatherNormalizedUsage;
  unexplainedUsageGap: UnexplainedUsageGap;
  evidence: ToolEvidenceItem[];
}

export interface CalculateEnergyAnalysisInput {
  thresholdPercent?: number;
  /**
   * Test-only fixture-directory override, threaded through to every
   * `loadFixture` call this function makes (`current-bill`,
   * `rate-schedules`, `weather-history`). Mirrors `loadFixture`'s own
   * `baseDir` option (fixture-loader.ts), which exists "purely so tests can
   * exercise ... disk-read failure paths ... without ever touching the
   * checked-in fixtures" -- this option extends that same seam to
   * fixture-*content* edge cases (for example, a rate-schedules fixture
   * that declares no tariff effective before the current one) that the
   * checked-in fixtures never exercise. Real callers never set this.
   */
  fixtureBaseDir?: string;
  signal?: AbortSignal;
}

function energyCalculatorSourceId(concern: string): string {
  return `source-energy-calculator-${concern}`;
}

/**
 * The tariff in effect immediately before `currentTariff`: the tariff with
 * the latest `effectiveFrom` that is still earlier than `currentTariff`'s.
 * Generalizes beyond exactly two tariffs without hardcoding either id.
 */
function findPriorTariff(tariffs: Tariff[], currentTariff: Tariff): Tariff | undefined {
  return tariffs
    .filter((tariff) => tariff.tariffId !== currentTariff.tariffId)
    .filter((tariff) => tariff.effectiveFrom < currentTariff.effectiveFrom)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export function calculateEnergyAnalysis(
  input: CalculateEnergyAnalysisInput = {},
): ToolResult<EnergyAnalysisResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(ENERGY_CALCULATOR_TOOL_ID);
  }

  const fixtureOptions =
    input.fixtureBaseDir !== undefined ? { baseDir: input.fixtureBaseDir } : {};
  const bill = loadFixture('current-bill', fixtureOptions);
  const rateSchedules = loadFixture('rate-schedules', fixtureOptions);
  const weatherHistory = loadFixture('weather-history', fixtureOptions);

  if (isAborted(input.signal)) {
    return cancelledResult(ENERGY_CALCULATOR_TOOL_ID);
  }

  const thresholdPercent = input.thresholdPercent ?? DEFAULT_ANOMALY_THRESHOLD_PERCENT;
  const currency = bill.currentAmount.currency;

  // --- anomaly determination ---
  const percentAboveBaseline = round2(
    ((bill.currentAmount.amount - bill.baseline.amount.amount) / bill.baseline.amount.amount) * 100,
  );
  const anomaly: AnomalyDetermination = {
    currentAmount: { ...bill.currentAmount },
    baselineAmount: { ...bill.baseline.amount },
    percentAboveBaseline,
    thresholdPercent,
    isMateriallyAbnormal: percentAboveBaseline >= thresholdPercent,
  };

  // --- rate-change attribution ---
  // Non-null: `current-bill.json`'s `tariffId` always names a tariff
  // declared in `rate-schedules.json` -- asserted directly in
  // fixture-loader.test.ts's "current-bill.json's tariffId must resolve to
  // a tariff this fixture actually declares" case -- so there is no
  // reachable "unknown current tariff" branch here for the checked-in
  // fixtures.
  const currentTariff = rateSchedules.tariffs.find((tariff) => tariff.tariffId === bill.tariffId)!;
  const priorTariff = findPriorTariff(rateSchedules.tariffs, currentTariff);
  const baselineUsageKwh = bill.baseline.usage.value;
  const billUnderCurrentTariffAtBaselineUsage = round2(
    currentTariff.fixedMonthlyCustomerCharge.amount +
      currentTariff.volumetricRatePerKwh.amount * baselineUsageKwh,
  );
  const billUnderPriorTariffAtBaselineUsage = priorTariff
    ? round2(
        priorTariff.fixedMonthlyCustomerCharge.amount +
          priorTariff.volumetricRatePerKwh.amount * baselineUsageKwh,
      )
    : billUnderCurrentTariffAtBaselineUsage;
  const rateChangeAttributableAmount = round2(
    billUnderCurrentTariffAtBaselineUsage - billUnderPriorTariffAtBaselineUsage,
  );
  const totalGapVsPriorTariffAtActualUsage = round2(
    bill.currentAmount.amount - billUnderPriorTariffAtBaselineUsage,
  );
  const rateChangeAttributablePercentOfTotalGap =
    totalGapVsPriorTariffAtActualUsage === 0
      ? 0
      : round2((rateChangeAttributableAmount / totalGapVsPriorTariffAtActualUsage) * 100);

  const rateChange: RateChangeAttribution = {
    baselineUsageKwh,
    priorTariffId: priorTariff?.tariffId ?? currentTariff.tariffId,
    currentTariffId: currentTariff.tariffId,
    billUnderPriorTariffAtBaselineUsage: { amount: billUnderPriorTariffAtBaselineUsage, currency },
    billUnderCurrentTariffAtBaselineUsage: {
      amount: billUnderCurrentTariffAtBaselineUsage,
      currency,
    },
    rateChangeAttributableAmount: { amount: rateChangeAttributableAmount, currency },
    totalGapVsPriorTariffAtActualUsage: { amount: totalGapVsPriorTariffAtActualUsage, currency },
    rateChangeAttributablePercentOfTotalGap,
  };

  // --- weather-normalized usage ---
  // The current cycle is identified by matching the bill's own billing
  // period against `weather-history.json`'s cycles -- data-driven, not a
  // hardcoded cycle label.
  const currentWeatherCycle = weatherHistory.cycles.find(
    (cycle) =>
      cycle.billingPeriod.start === bill.billingPeriod.start &&
      cycle.billingPeriod.end === bill.billingPeriod.end,
  );
  // Non-null: the real fixture's current billing-period cycle always
  // carries a `weatherAttribution` block (only the current cycle does;
  // see weather-lookup.ts) -- asserted directly in
  // fixture-loader.test.ts's real-disk load test. There is no reachable
  // "missing weather data for the current cycle" branch for the checked-in
  // fixtures.
  const attribution = currentWeatherCycle!.weatherAttribution!;
  const excessCdd = round2(attribution.actualCdd - attribution.typicalCdd);
  const usageExplainedByWeatherKwh = round2(excessCdd * attribution.weatherSensitivityKwhPerCdd);
  const dollarEquivalent = round2(
    usageExplainedByWeatherKwh * currentTariff.volumetricRatePerKwh.amount,
  );

  const weather: WeatherNormalizedUsage = {
    cycleLabel: currentWeatherCycle!.cycleLabel,
    typicalCdd: attribution.typicalCdd,
    actualCdd: attribution.actualCdd,
    excessCdd,
    weatherSensitivityKwhPerCdd: attribution.weatherSensitivityKwhPerCdd,
    usageExplainedByWeatherKwh,
    dollarEquivalent: { amount: dollarEquivalent, currency },
  };

  // --- unexplained (household-change) residual ---
  const usageGapAboveBaselineKwh = bill.anomaly.usageGapAboveBaselineKwh;
  const unexplainedUsageKwh = round2(usageGapAboveBaselineKwh - usageExplainedByWeatherKwh);
  const unexplainedUsageGap: UnexplainedUsageGap = {
    usageGapAboveBaselineKwh,
    usageExplainedByWeatherKwh,
    unexplainedUsageKwh,
  };

  const evidence: ToolEvidenceItem[] = [
    {
      sourceId: energyCalculatorSourceId('anomaly'),
      level: 'E3',
      verdict: 'pass',
      summary: `Current bill $${anomaly.currentAmount.amount.toFixed(2)} is ${percentAboveBaseline}% above the normalized baseline of $${anomaly.baselineAmount.amount.toFixed(2)} (threshold ${thresholdPercent}%): ${anomaly.isMateriallyAbnormal ? 'materially abnormal' : 'within normal range'}.`,
    },
    {
      sourceId: energyCalculatorSourceId('rate-change'),
      level: 'E3',
      verdict: 'pass',
      summary: `At baseline usage (${baselineUsageKwh} kWh), the tariff change from ${rateChange.priorTariffId} to ${rateChange.currentTariffId} accounts for $${rateChangeAttributableAmount.toFixed(2)} (${rateChangeAttributablePercentOfTotalGap}%) of the $${totalGapVsPriorTariffAtActualUsage.toFixed(2)} total gap.`,
    },
    {
      sourceId: energyCalculatorSourceId('weather'),
      level: 'E3',
      verdict: 'pass',
      summary: `${excessCdd} excess CDD (actual ${attribution.actualCdd} vs. typical ${attribution.typicalCdd}) at ${attribution.weatherSensitivityKwhPerCdd} kWh/CDD explains ${usageExplainedByWeatherKwh} kWh ($${dollarEquivalent.toFixed(2)}) of the usage increase.`,
    },
    {
      sourceId: energyCalculatorSourceId('unexplained-usage-gap'),
      level: 'E3',
      verdict: 'pass',
      summary: `${usageGapAboveBaselineKwh} kWh above baseline, minus ${usageExplainedByWeatherKwh} kWh explained by weather, leaves ${unexplainedUsageKwh} kWh unexplained -- the residual for household/appliance-event investigation.`,
    },
  ];

  return okResult(ENERGY_CALCULATOR_TOOL_ID, {
    anomaly,
    rateChange,
    weather,
    unexplainedUsageGap,
    evidence,
  });
}

// --- evaluateResponseOptions ---

export interface ResponseOptionScore {
  optionId: string;
  label: string;
  roughCost: MoneyAmount;
  addressesRootCause: boolean;
  requiresConsequentialAction: boolean;
  costScore: number;
  conservationScore: number;
  fitScore: number;
  withinBudget?: boolean;
}

export interface ResponseOptionsEvaluationResult {
  costWeight: number;
  conservationWeight: number;
  maxRoughCostAmongOptions: number;
  options: ResponseOptionScore[];
  evidence: ToolEvidenceItem[];
}

export interface EvaluateResponseOptionsInput {
  costWeight?: number;
  conservationWeight?: number;
  maxRoughCost?: number;
  optionId?: string;
  /** Test-only fixture-directory override -- see `CalculateEnergyAnalysisInput.fixtureBaseDir`. */
  fixtureBaseDir?: string;
  signal?: AbortSignal;
}

function responseOptionSourceId(optionId: string): string {
  return `source-energy-calculator-response-option-${optionId}`;
}

function scoreOption(
  option: ResponseOption,
  maxRoughCostAmongOptions: number,
  costWeight: number,
  conservationWeight: number,
  maxRoughCost: number | undefined,
): ResponseOptionScore {
  const costScore =
    maxRoughCostAmongOptions === 0
      ? 1
      : round4(1 - option.roughCost.amount / maxRoughCostAmongOptions);
  const conservationScore = option.addressesRootCause ? 1 : 0;
  const totalWeight = costWeight + conservationWeight;
  const fitScore =
    totalWeight === 0
      ? round4((costScore + conservationScore) / 2)
      : round4((costWeight * costScore + conservationWeight * conservationScore) / totalWeight);

  return {
    optionId: option.optionId,
    label: option.label,
    roughCost: { ...option.roughCost },
    addressesRootCause: option.addressesRootCause,
    requiresConsequentialAction: option.requiresConsequentialAction,
    costScore,
    conservationScore,
    fitScore,
    ...(maxRoughCost !== undefined
      ? { withinBudget: option.roughCost.amount <= maxRoughCost }
      : {}),
  };
}

function toEvidenceItem(score: ResponseOptionScore): ToolEvidenceItem {
  return {
    sourceId: responseOptionSourceId(score.optionId),
    level: 'E3',
    verdict: 'pass',
    summary: `"${score.label}" ($${score.roughCost.amount.toFixed(2)}, ${score.addressesRootCause ? 'addresses root cause' : 'does not address root cause'}): costScore ${score.costScore}, conservationScore ${score.conservationScore}, fitScore ${score.fitScore}.`,
  };
}

export function evaluateResponseOptions(
  input: EvaluateResponseOptionsInput = {},
): ToolResult<ResponseOptionsEvaluationResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(ENERGY_CALCULATOR_TOOL_ID);
  }

  const fixture = loadFixture(
    'response-options',
    input.fixtureBaseDir !== undefined ? { baseDir: input.fixtureBaseDir } : {},
  );

  if (isAborted(input.signal)) {
    return cancelledResult(ENERGY_CALCULATOR_TOOL_ID);
  }

  const costWeight = input.costWeight ?? DEFAULT_COST_WEIGHT;
  const conservationWeight = input.conservationWeight ?? DEFAULT_CONSERVATION_WEIGHT;
  const maxRoughCostAmongOptions = Math.max(
    ...fixture.options.map((option) => option.roughCost.amount),
  );

  if (input.optionId !== undefined) {
    const option = fixture.options.find((entry) => entry.optionId === input.optionId);
    if (!option) {
      return notFoundResult(
        ENERGY_CALCULATOR_TOOL_ID,
        input.optionId,
        `no response-options entry found for optionId "${input.optionId}"`,
      );
    }
    const score = scoreOption(
      option,
      maxRoughCostAmongOptions,
      costWeight,
      conservationWeight,
      input.maxRoughCost,
    );
    return okResult(ENERGY_CALCULATOR_TOOL_ID, {
      costWeight,
      conservationWeight,
      maxRoughCostAmongOptions,
      options: [score],
      evidence: [toEvidenceItem(score)],
    });
  }

  const scores = fixture.options
    .map((option) =>
      scoreOption(
        option,
        maxRoughCostAmongOptions,
        costWeight,
        conservationWeight,
        input.maxRoughCost,
      ),
    )
    .sort((a, b) => b.fitScore - a.fitScore || a.optionId.localeCompare(b.optionId));

  return okResult(ENERGY_CALCULATOR_TOOL_ID, {
    costWeight,
    conservationWeight,
    maxRoughCostAmongOptions,
    options: scores,
    evidence: scores.map(toEvidenceItem),
  });
}
