/**
 * The curated hero cohort.
 *
 * The bundled EPA catalog is real and is the discovery universe, but it does
 * not carry a single field a family actually decides on: no cargo
 * dimensions, no child-seat layout, no safety or reliability rating, no
 * ownership cost, no price. This module supplies those for eight models and
 * labels every one of them `curated_demo`.
 *
 * The tests below exist to keep that arrangement honest in three specific
 * ways: the curated layer must attach to *real* catalog records rather than
 * invent vehicles, it must never claim a price or an availability it cannot
 * have, and enrichment must not change a candidate's identity — the hero
 * journey has to be a genuinely discovered catalog record that later gained
 * detail, not a seeded case wearing a discovered record's name.
 */
import { describe, expect, it } from 'vitest';
import { getVehicle, searchVehicles } from './query.js';
import {
  DEMO_PROFILE_DISCLOSURE,
  getDemoProfile,
  listDemoProfiles,
  enrichWithDemoProfile,
} from './demo-profiles.js';

describe('the curated cohort attaches to the real catalog', () => {
  it('ships eight profiles', () => {
    expect(listDemoProfiles()).toHaveLength(8);
  });

  it('keys every profile to a record that actually exists in the bundled catalog', () => {
    // A curated profile pointing at a vehicle the catalog does not contain
    // would be a fabricated car with a real-looking id.
    for (const profile of listDemoProfiles()) {
      expect(
        getVehicle(profile.catalogRecordId),
        `no catalog record for ${profile.catalogRecordId}`,
      ).toBeDefined();
    }
  });

  it('never claims a current, local, or transactable price', () => {
    for (const profile of listDemoProfiles()) {
      // An indicative band for a model at a trim level is the strongest
      // price claim the data supports. There is deliberately no field for a
      // single price, a dealer price, or an out-the-door figure.
      expect(profile).not.toHaveProperty('price');
      expect(profile).not.toHaveProperty('dealerPrice');
      expect(profile).not.toHaveProperty('availability');
      expect(profile.indicativePriceBandUsd.low).toBeLessThan(profile.indicativePriceBandUsd.high);
    }
  });

  it('carries a disclosure sentence the pane can render verbatim', () => {
    expect(DEMO_PROFILE_DISCLOSURE).toMatch(/curated demo data/i);
    expect(DEMO_PROFILE_DISCLOSURE).toMatch(/not measured|illustrative/i);
  });

  it('returns undefined for a catalog record with no curated profile', () => {
    // Most of the 853 records have none, and that has to read as "no
    // curated data", never as a default or a zero.
    expect(getDemoProfile('veh-2025-audi-a4-s-line-quattro-47974')).toBeUndefined();
  });

  it('keeps a genuinely contested rating contested', () => {
    // One profile carries `reliabilityRating: 'disputed'` on purpose. An
    // averaged-away disagreement is the failure mode the whole evidence
    // model exists to prevent.
    const outback = listDemoProfiles().find((profile) => profile.displayName.includes('Outback'));
    expect(outback?.reliabilityRating).toBe('disputed');
    expect(outback?.reliabilityDispute).toBeDefined();
  });
});

describe('enrichWithDemoProfile: enrichment adds detail without changing identity', () => {
  const HERO = 'veh-2026-honda-cr-v-awd-49488';

  it('keeps the discovered record`s identity exactly', () => {
    const record = getVehicle(HERO);
    if (record === undefined) throw new Error('fixture record missing');

    const enriched = enrichWithDemoProfile(record);

    expect(enriched.record.id).toBe(record.id);
    expect(enriched.record.make).toBe(record.make);
    expect(enriched.record.model).toBe(record.model);
    expect(enriched.record.year).toBe(record.year);
  });

  it('labels every curated field as curated and every catalog field as catalog', () => {
    const record = getVehicle(HERO);
    if (record === undefined) throw new Error('fixture record missing');

    const enriched = enrichWithDemoProfile(record);

    expect(enriched.provenanceByField['combinedMpg']).toBe('catalog');
    expect(enriched.provenanceByField['annualFuelCostUsd']).toBe('catalog');
    expect(enriched.provenanceByField['cargoBehindSecondRowCuFt']).toBe('curated_demo');
    expect(enriched.provenanceByField['fiveYearOwnershipCostUsd']).toBe('curated_demo');
    expect(enriched.provenanceByField['crashSafetyRating']).toBe('curated_demo');
  });

  it('reports a record with no curated profile as unenriched rather than empty', () => {
    const record = getVehicle('veh-2025-audi-a4-s-line-quattro-47974');
    if (record === undefined) throw new Error('fixture record missing');

    const enriched = enrichWithDemoProfile(record);

    expect(enriched.enriched).toBe(false);
    expect(enriched.profile).toBeUndefined();
    // The catalog fields are still there and still labelled.
    expect(enriched.provenanceByField['combinedMpg']).toBe('catalog');
    expect(enriched.provenanceByField['cargoBehindSecondRowCuFt']).toBeUndefined();
  });

  it('is a pure function of its input', () => {
    const record = getVehicle(HERO);
    if (record === undefined) throw new Error('fixture record missing');

    expect(enrichWithDemoProfile(record)).toEqual(enrichWithDemoProfile(record));
  });
});

describe('the whole catalog remains the discovery universe', () => {
  it('searches all 853 records, not just the curated eight', () => {
    // The single most important truth about this arrangement: discovery is
    // real and broad, and enrichment is a later, narrower step.
    expect(searchVehicles({ limit: 1 }).total).toBe(853);
  });

  it('finds records outside the curated cohort', () => {
    const result = searchVehicles({ make: 'Audi', limit: 5 });
    expect(result.total).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(getDemoProfile(record.id)).toBeUndefined();
    }
  });
});
