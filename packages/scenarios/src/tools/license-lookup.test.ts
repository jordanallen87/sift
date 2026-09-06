import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadFixture } from './fixture-loader.js';
import {
  LICENSE_LOOKUP_TOOL_ID,
  lookupLicense,
  type LicenseLookupResult,
} from './license-lookup.js';

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

function expectOk<T>(result: { status: string }): asserts result is { status: 'ok'; data: T } {
  expect(result.status).toBe('ok');
}

describe('lookupLicense -- clean licences (Northgate, Cedar)', () => {
  it("Northgate's licence is active, class covers scope, insurance active, and the named insured matches exactly", () => {
    const result = lookupLicense({ licenseNumber: 'PL-4417-NG' });
    expectOk<LicenseLookupResult>(result);
    expect(result.data.license.licenseHolderName).toBe('Northgate Plumbing');
    expect(result.data.license.isActive).toBe(true);
    expect(result.data.license.classCoversScope).toBe(true);
    expect(result.data.license.insurance.isActive).toBe(true);
    expect(result.data.license.insurance.matchesLicenseHolder).toBe(true);
    expect(result.data.license.insurance.namedInsured).toBe('Northgate Plumbing');
  });

  it("Cedar's licence is likewise clean on every check", () => {
    const result = lookupLicense({ licenseNumber: 'PL-2290-CS' });
    expectOk<LicenseLookupResult>(result);
    expect(result.data.license.isActive).toBe(true);
    expect(result.data.license.classCoversScope).toBe(true);
    expect(result.data.license.insurance.isActive).toBe(true);
    expect(result.data.license.insurance.matchesLicenseHolder).toBe(true);
  });

  it('produces two passing E1 evidence items (overall standing + named-insured match) for a clean licence', () => {
    const result = lookupLicense({ licenseNumber: 'PL-4417-NG' });
    expectOk<LicenseLookupResult>(result);
    expect(result.data.evidence).toHaveLength(2);
    for (const item of result.data.evidence) {
      expect(item.level).toBe('E1');
      expect(item.verdict).toBe('pass');
      expect(item.summary.trim()).not.toBe('');
    }
  });
});

describe('lookupLicense -- Two Rivers Mechanical (deliberate named-insured mismatch)', () => {
  it('reports the licence itself active with class coverage and active insurance', () => {
    const result = lookupLicense({ licenseNumber: 'PL-8801-TR' });
    expectOk<LicenseLookupResult>(result);
    expect(result.data.license.licenseHolderName).toBe('Two Rivers Mechanical Inc');
    expect(result.data.license.isActive).toBe(true);
    expect(result.data.license.classCoversScope).toBe(true);
    expect(result.data.license.insurance.isActive).toBe(true);
  });

  it('surfaces the named-insured mismatch as its own distinct, checkable finding -- not buried in the overall summary', () => {
    const result = lookupLicense({ licenseNumber: 'PL-8801-TR' });
    expectOk<LicenseLookupResult>(result);
    expect(result.data.license.insurance.matchesLicenseHolder).toBe(false);
    expect(result.data.license.insurance.namedInsured).toBe('TRM Holdings LLC');

    expect(result.data.evidence).toHaveLength(2);
    const [standing, namedInsured] = result.data.evidence;

    // The overall standing check is unaffected -- licence/class/insurance
    // status alone would look completely clean.
    expect(standing?.sourceId).not.toContain('named-insured');

    // The mismatch is its own item, with its own degraded verdict, distinct
    // sourceId, and both names spelled out.
    expect(namedInsured?.sourceId).toContain('named-insured');
    expect(namedInsured?.verdict).toBe('degraded');
    expect(namedInsured?.summary).toContain('TRM Holdings LLC');
    expect(namedInsured?.summary).toContain('Two Rivers Mechanical Inc');
    expect(namedInsured?.summary).toContain('does not match');
  });
});

describe('lookupLicense -- inactive licence / inactive insurance (via baseDir test seam)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sift-license-lookup-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports isActive: false and a degraded overall verdict for a suspended licence, with no reachable case against the real fixture', () => {
    const realRegistry = loadFixture('license-registry');
    const suspendedRegistry = {
      ...realRegistry,
      entries: realRegistry.entries.map((entry) =>
        entry.licenseNumber === 'PL-4417-NG' ? { ...entry, status: 'suspended' } : entry,
      ),
    };
    writeFileSync(join(tempDir, 'license-registry.json'), JSON.stringify(suspendedRegistry));

    const result = lookupLicense({ licenseNumber: 'PL-4417-NG', baseDir: tempDir });
    expectOk<LicenseLookupResult>(result);
    expect(result.data.license.status).toBe('suspended');
    expect(result.data.license.isActive).toBe(false);
    const [standing] = result.data.evidence;
    expect(standing?.verdict).toBe('degraded');
    expect(standing?.summary).toContain('suspended');
  });

  it('reports insurance.isActive: false for a lapsed policy', () => {
    const realRegistry = loadFixture('license-registry');
    const lapsedRegistry = {
      ...realRegistry,
      entries: realRegistry.entries.map((entry) =>
        entry.licenseNumber === 'PL-2290-CS'
          ? { ...entry, insurance: { ...entry.insurance, status: 'lapsed' } }
          : entry,
      ),
    };
    writeFileSync(join(tempDir, 'license-registry.json'), JSON.stringify(lapsedRegistry));

    const result = lookupLicense({ licenseNumber: 'PL-2290-CS', baseDir: tempDir });
    expectOk<LicenseLookupResult>(result);
    expect(result.data.license.insurance.status).toBe('lapsed');
    expect(result.data.license.insurance.isActive).toBe(false);
    const [standing] = result.data.evidence;
    expect(standing?.verdict).toBe('degraded');
  });
});

describe('lookupLicense -- determinism, not_found, and cancellation', () => {
  it('is deterministic: identical input twice produces deep-equal output', () => {
    const first = lookupLicense({ licenseNumber: 'PL-8801-TR' });
    const second = lookupLicense({ licenseNumber: 'PL-8801-TR' });
    expect(second).toEqual(first);
  });

  it('returns a deterministic not_found result for an unknown licenseNumber, without throwing', () => {
    const result = lookupLicense({ licenseNumber: 'PL-0000-XX' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(LICENSE_LOOKUP_TOOL_ID);
    expect(result.query).toBe('PL-0000-XX');
  });

  it('returns a cancelled result when called with an already-aborted signal, before loading anything', () => {
    const controller = new AbortController();
    controller.abort();
    const result = lookupLicense({ licenseNumber: 'PL-4417-NG', signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(LICENSE_LOOKUP_TOOL_ID);
  });

  it('checks the signal again mid-flight and honors a late abort', () => {
    const result = lookupLicense({
      licenseNumber: 'PL-4417-NG',
      signal: signalAbortingOnRead(2),
    });
    expect(result.status).toBe('cancelled');
  });
});
