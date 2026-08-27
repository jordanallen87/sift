/**
 * Fixture tool: "weather lookup"
 * (docs/specs/packs-and-routing.md "Home Energy Guardian Decision Pack" ->
 * "Skills, specialists, and tools").
 *
 * Given an optional `cycleLabel`, returns that single billing cycle's
 * heating/cooling degree-day facts from `weather-history.json` (`hdd`,
 * `cdd`, and -- only for the current cycle, which is the only cycle the
 * fixture attaches one to -- the fixture-authored `weatherAttribution`
 * block: the typical/actual CDD comparison and the household's own
 * regression-derived `weatherSensitivityKwhPerCdd` coefficient), or every
 * one of the 18 real cycles when no `cycleLabel` is given.
 *
 * Judgment call: `weatherAttribution` is passed through rather than
 * recomputed here, unlike `rate-schedules.json`'s cross-document
 * `rateChangeImpactOnBaselineUsage` (which `tariff-lookup.ts` deliberately
 * omits -- see that file's docstring). The difference: `weatherAttribution`
 * lives entirely inside this one document, scoped to this one cycle, so
 * surfacing it here is still a same-document, single-source `E1` fact, not
 * a cross-document derivation. `energy-calculator.ts` still independently
 * *recomputes* `excessCdd` and `usageExplainedByWeatherKwh` from this
 * tool's raw `typicalCdd`/`actualCdd`/`weatherSensitivityKwhPerCdd` inputs
 * for its own `E3` "verified by a domain-specific deterministic check"
 * evidence, exactly as `ownership-calculator.ts` recomputes fuel cost from
 * `mpg`/price-per-gallon assumptions rather than copying a fixture's
 * precomputed total -- this tool's copy of the fixture's own arithmetic is
 * informational, not what the calculator's evidence rests on.
 *
 * Evidence-level assignment rule: each cycle's readings come from one
 * traceable weather-station record, so each cycle is tagged `E1`, the same
 * per-fact rule as every other reader tool in this directory.
 */
import { loadFixture, type WeatherAttribution, type WeatherCycle } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const WEATHER_LOOKUP_TOOL_ID = 'weather-lookup';

export interface WeatherAttributionFacts {
  typicalCdd: number;
  actualCdd: number;
  excessCdd: number;
  weatherSensitivityKwhPerCdd: number;
  usageExplainedByWeatherKwh: number;
}

export interface WeatherCycleFacts {
  cycleLabel: string;
  billingPeriod: { start: string; end: string };
  hdd: number;
  cdd: number;
  weatherAttribution?: WeatherAttributionFacts;
}

export interface WeatherLookupResult {
  weatherStation: { stationId: string; name: string; degreeDayBaseF: number };
  cycles: WeatherCycleFacts[];
  evidence: ToolEvidenceItem[];
}

export interface WeatherLookupInput {
  cycleLabel?: string;
  signal?: AbortSignal;
}

function weatherSourceId(cycleLabel: string): string {
  return `source-weather-history-${cycleLabel}`;
}

function toAttributionFacts(attribution: WeatherAttribution): WeatherAttributionFacts {
  return {
    typicalCdd: attribution.typicalCdd,
    actualCdd: attribution.actualCdd,
    excessCdd: attribution.excessCdd,
    weatherSensitivityKwhPerCdd: attribution.weatherSensitivityKwhPerCdd,
    usageExplainedByWeatherKwh: attribution.usageExplainedByWeatherKwh,
  };
}

function toCycleFacts(cycle: WeatherCycle): WeatherCycleFacts {
  return {
    cycleLabel: cycle.cycleLabel,
    billingPeriod: { ...cycle.billingPeriod },
    hdd: cycle.hdd,
    cdd: cycle.cdd,
    ...(cycle.weatherAttribution
      ? { weatherAttribution: toAttributionFacts(cycle.weatherAttribution) }
      : {}),
  };
}

function toEvidenceItem(cycle: WeatherCycle): ToolEvidenceItem {
  return {
    sourceId: weatherSourceId(cycle.cycleLabel),
    level: 'E1',
    verdict: 'pass',
    summary: `Cycle ${cycle.cycleLabel} (${cycle.billingPeriod.start} to ${cycle.billingPeriod.end}): ${cycle.hdd} HDD, ${cycle.cdd} CDD.`,
  };
}

export function lookupWeather(input: WeatherLookupInput = {}): ToolResult<WeatherLookupResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(WEATHER_LOOKUP_TOOL_ID);
  }

  const fixture = loadFixture('weather-history');

  if (isAborted(input.signal)) {
    return cancelledResult(WEATHER_LOOKUP_TOOL_ID);
  }

  const weatherStation = { ...fixture.weatherStation };

  if (input.cycleLabel !== undefined) {
    const cycle = fixture.cycles.find((entry) => entry.cycleLabel === input.cycleLabel);
    if (!cycle) {
      return notFoundResult(
        WEATHER_LOOKUP_TOOL_ID,
        input.cycleLabel,
        `no weather-history cycle found for cycleLabel "${input.cycleLabel}"`,
      );
    }
    return okResult(WEATHER_LOOKUP_TOOL_ID, {
      weatherStation,
      cycles: [toCycleFacts(cycle)],
      evidence: [toEvidenceItem(cycle)],
    });
  }

  return okResult(WEATHER_LOOKUP_TOOL_ID, {
    weatherStation,
    cycles: fixture.cycles.map(toCycleFacts),
    evidence: fixture.cycles.map(toEvidenceItem),
  });
}
