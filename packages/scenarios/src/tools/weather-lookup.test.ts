import { describe, expect, it } from 'vitest';
import {
  WEATHER_LOOKUP_TOOL_ID,
  lookupWeather,
  type WeatherLookupResult,
} from './weather-lookup.js';

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
}): asserts result is { status: 'ok'; data: WeatherLookupResult } {
  expect(result.status).toBe('ok');
}

describe('lookupWeather', () => {
  it('returns all 18 real cycles when no cycleLabel is given', () => {
    const result = lookupWeather();
    expectOk(result);
    expect(result.data.cycles).toHaveLength(18);
    expect(result.data.evidence).toHaveLength(18);
    expect(result.data.weatherStation.stationId).toBe('station-northfield-regional');
  });

  it('returns the current cycle with its real HDD/CDD and the fixture-authored weatherAttribution block', () => {
    const result = lookupWeather({ cycleLabel: '2026-08' });
    expectOk(result);
    const [cycle] = result.data.cycles;
    expect(cycle?.hdd).toBe(0);
    expect(cycle?.cdd).toBe(460);
    expect(cycle?.weatherAttribution?.typicalCdd).toBe(380);
    expect(cycle?.weatherAttribution?.actualCdd).toBe(460);
    expect(cycle?.weatherAttribution?.weatherSensitivityKwhPerCdd).toBeCloseTo(2.625, 5);
    expect(cycle?.weatherAttribution?.usageExplainedByWeatherKwh).toBe(210);
  });

  it('returns a prior cycle with no weatherAttribution block', () => {
    const result = lookupWeather({ cycleLabel: '2025-08' });
    expectOk(result);
    expect(result.data.cycles[0]?.weatherAttribution).toBeUndefined();
    expect(result.data.cycles[0]?.cdd).toBe(380);
  });

  it('tags each cycle E1 pass with a deterministic, cycle-specific sourceId', () => {
    const result = lookupWeather({ cycleLabel: '2026-08' });
    expectOk(result);
    const [item] = result.data.evidence;
    expect(item?.level).toBe('E1');
    expect(item?.verdict).toBe('pass');
    expect(item?.sourceId).toBe('source-weather-history-2026-08');
    expect(item?.summary).toContain('460');
  });

  it('returns a deterministic not_found result for an unknown cycleLabel, without throwing', () => {
    const result = lookupWeather({ cycleLabel: '1999-01' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(WEATHER_LOOKUP_TOOL_ID);
    expect(result.query).toBe('1999-01');
  });

  it('is idempotent: calling twice with the same input produces deep-equal output', () => {
    const first = lookupWeather({ cycleLabel: '2026-08' });
    const second = lookupWeather({ cycleLabel: '2026-08' });
    expect(second).toEqual(first);
  });

  it('returns a cancelled result when called with an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    const result = lookupWeather({ signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(WEATHER_LOOKUP_TOOL_ID);
  });

  it('checks the signal again mid-flight and honors a late abort', () => {
    const result = lookupWeather({ signal: signalAbortingOnRead(2) });
    expect(result.status).toBe('cancelled');
  });
});
