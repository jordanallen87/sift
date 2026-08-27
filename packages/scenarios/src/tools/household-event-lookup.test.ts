import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HOUSEHOLD_EVENT_LOOKUP_TOOL_ID,
  lookupHouseholdEvents,
  type HouseholdEventLookupResult,
} from './household-event-lookup.js';

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
}): asserts result is { status: 'ok'; data: HouseholdEventLookupResult } {
  expect(result.status).toBe('ok');
}

describe('lookupHouseholdEvents', () => {
  it('returns both real events when no eventId is given', () => {
    const result = lookupHouseholdEvents();
    expectOk(result);
    expect(result.data.events.map((event) => event.eventId).sort()).toEqual(
      ['event-hvac-maintenance-2026-05', 'event-thermostat-failure-2026-07'].sort(),
    );
    expect(result.data.evidence).toHaveLength(2);
  });

  it('returns the supported thermostat-malfunction event with its device and relevance detail', () => {
    const result = lookupHouseholdEvents({ eventId: 'event-thermostat-failure-2026-07' });
    expectOk(result);
    const [event] = result.data.events;
    expect(event?.type).toBe('thermostat_malfunction');
    expect(event?.date).toBe('2026-07-19');
    expect(event?.device).toEqual({
      make: 'ClimaSync (fictional)',
      model: 'ClimaSync Home 3',
      deviceIdFictional: 'FICTIONAL-THERM-4471',
    });
    expect(event?.status).toBe('newly_failing_unresolved');
    expect(event?.relevanceNote).toContain('280 kWh');
  });

  it('returns the HVAC maintenance event, which has no device block', () => {
    const result = lookupHouseholdEvents({ eventId: 'event-hvac-maintenance-2026-05' });
    expectOk(result);
    expect(result.data.events[0]?.device).toBeUndefined();
    expect(result.data.events[0]?.performedBy).toBe('Northfield Comfort Services (fictional)');
  });

  it('filters by event type across all events when eventId is omitted but type is given', () => {
    const result = lookupHouseholdEvents({ type: 'thermostat_malfunction' });
    expectOk(result);
    expect(result.data.events).toHaveLength(1);
    expect(result.data.events[0]?.eventId).toBe('event-thermostat-failure-2026-07');
  });

  it('tags each event E1 pass with a deterministic, event-specific sourceId', () => {
    const result = lookupHouseholdEvents({ eventId: 'event-thermostat-failure-2026-07' });
    expectOk(result);
    const [item] = result.data.evidence;
    expect(item?.level).toBe('E1');
    expect(item?.verdict).toBe('pass');
    expect(item?.sourceId).toBe('source-household-event-event-thermostat-failure-2026-07');
    expect(item?.summary).toContain('thermostat');
  });

  it('returns a deterministic not_found result for an unknown eventId, without throwing', () => {
    const result = lookupHouseholdEvents({ eventId: 'event-does-not-exist' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(HOUSEHOLD_EVENT_LOOKUP_TOOL_ID);
    expect(result.query).toBe('event-does-not-exist');
  });

  it('returns a deterministic not_found result for a type with no matching events', () => {
    const result = lookupHouseholdEvents({ type: 'gas_leak' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.query).toBe('gas_leak');
  });

  it('is idempotent: calling twice with the same input produces deep-equal output', () => {
    const first = lookupHouseholdEvents({ eventId: 'event-thermostat-failure-2026-07' });
    const second = lookupHouseholdEvents({ eventId: 'event-thermostat-failure-2026-07' });
    expect(second).toEqual(first);
  });

  it('returns a cancelled result when called with an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    const result = lookupHouseholdEvents({ signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(HOUSEHOLD_EVENT_LOOKUP_TOOL_ID);
  });

  it('checks the signal again mid-flight and honors a late abort', () => {
    const result = lookupHouseholdEvents({ signal: signalAbortingOnRead(2) });
    expect(result.status).toBe('cancelled');
  });
});

describe('lookupHouseholdEvents -- no-events-at-all edge case (via fixtureBaseDir test seam)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pax-household-event-lookup-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns a not_found result with an empty-string query -- not "undefined" -- when neither eventId nor type is given and household-events.json has no events at all', () => {
    writeFileSync(
      join(tempDir, 'household-events.json'),
      JSON.stringify({
        _provenance: 'synthetic test fixture with zero events',
        caseId: 'case-demo-energy-guardian',
        householdId: 'household-demo-energy-01',
        events: [],
      }),
    );

    const result = lookupHouseholdEvents({ fixtureBaseDir: tempDir });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(HOUSEHOLD_EVENT_LOOKUP_TOOL_ID);
    expect(result.query).toBe('');
    expect(result.message).toContain('undefined');
  });
});
