/**
 * Unit tests for `buildVehicleCatalogAdapter`'s pure mapping logic --
 * `catalog-client.test.ts` already proves the real `GET /api/catalog/*` HTTP
 * boundary; this file injects a fake `searchFn` so the adapter's own
 * filter-extraction and result-mapping behavior is tested without a
 * network/MSW dependency (see this module's own header comment).
 *
 * Records are built with `@sift/catalog`'s shared `buildVehicleCatalogRecord`
 * test factory rather than a local object literal. `VehicleCatalogRecordSchema`
 * is `.strict()` and the record now carries 83 fields, so a literal covering
 * only the fields a given test cares about would fail to satisfy the type --
 * the factory defaults everything else to `null` (or `false` for the two
 * non-nullable flag booleans) and takes an override bag instead.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildVehicleCatalogRecord } from '@sift/catalog/test-support';
import { VehicleCatalogRecordSchema } from '@sift/catalog/browser';
import {
  buildDefaultCatalogAdapters,
  buildVehicleCatalogAdapter,
} from './catalog-search-adapter.js';

describe('buildVehicleCatalogAdapter', () => {
  it('declares its recognized filter keys', () => {
    const adapter = buildVehicleCatalogAdapter(vi.fn());
    expect(adapter.recognizedFilterKeys).toEqual([
      'year',
      'make',
      'model',
      'bodyStyle',
      'fuelType',
    ]);
  });

  /**
   * `recognizedFilterKeys` is surfaced to the model in
   * `sift_search_catalog`'s response, so it is a promise about what the tool
   * can do. A key that is declared but never read would return an
   * *unfiltered* list that looks filtered -- a silent wrong answer, which is
   * worse than the tool simply not supporting the filter.
   *
   * Driving the assertion off `recognizedFilterKeys` itself, rather than a
   * list written out here, means declaring a new key without wiring it into
   * `search` fails immediately instead of shipping that silent lie.
   */
  it('actually forwards every filter key it declares', async () => {
    const searchFn = vi.fn().mockResolvedValue({ records: [], total: 0 });
    const adapter = buildVehicleCatalogAdapter(searchFn);

    // A plausible value per declared key. `year` is the one non-string
    // filter, so it gets a number; everything else is matched as a string.
    const sampleValues: Record<string, string | number> = {
      year: 2024,
      make: 'Toyota',
      model: 'RAV4',
      bodyStyle: 'SUV',
      fuelType: 'Hybrid',
    };

    for (const key of adapter.recognizedFilterKeys) {
      const value = sampleValues[key];
      expect(value, `add a sample value for the newly declared filter key "${key}"`).toBeDefined();

      searchFn.mockClear();
      await adapter.search({ filters: { [key]: value! } });

      expect(
        searchFn,
        `filter key "${key}" is declared in recognizedFilterKeys but never reaches searchCatalogVehicles`,
      ).toHaveBeenCalledWith({ [key]: value }, {});
    }
  });

  it('extracts known filter keys and forwards them, ignoring unrecognized ones', async () => {
    const searchFn = vi.fn().mockResolvedValue({ records: [], total: 0 });
    const adapter = buildVehicleCatalogAdapter(searchFn);

    await adapter.search({
      query: 'family SUV',
      filters: { year: 2024, make: 'Toyota', bodyStyle: 'SUV', unrecognizedKey: 'ignored' },
      limit: 10,
      offset: 5,
    });

    expect(searchFn).toHaveBeenCalledWith(
      { query: 'family SUV', year: 2024, make: 'Toyota', bodyStyle: 'SUV', limit: 10, offset: 5 },
      {},
    );
  });

  it('parses a numeric-looking string filter value into a real year', async () => {
    const searchFn = vi.fn().mockResolvedValue({ records: [], total: 0 });
    const adapter = buildVehicleCatalogAdapter(searchFn);

    await adapter.search({ filters: { year: '2024' } });

    expect(searchFn).toHaveBeenCalledWith({ year: 2024 }, {});
  });

  it('maps each VehicleCatalogRecord to a labeled, id-addressable result with all real fields, flattening source rather than dropping it', async () => {
    const record = buildVehicleCatalogRecord({
      id: 'veh-1',
      year: 2024,
      make: 'Toyota',
      model: 'RAV4',
      trim: 'XLE',
      bodyStyle: 'SUV',
      drivetrain: 'AWD',
      fuelType: 'gasoline',
      combinedMpg: 30,
      cylinders: 4,
      transmission: '8-speed automatic',
      // Fields the old ~20-field hand-list never returned at all -- proves
      // the rewrite actually surfaces them, not merely that it still
      // compiles against the widened schema.
      fiveYearSavingsVsAverageUsd: -450,
      passengerVolumeCuFt: 98,
      epaModel: 'RAV4 4WD',
      source: {
        dataset: 'epa-fueleconomy-gov',
        recordId: '42',
        epaEngineId: 'eng-7',
        manufacturerCode: null,
        createdOn: '2023-10-01',
        modifiedOn: '2024-01-15',
        hasUserMpgData: true,
      },
    });
    const searchFn = vi.fn().mockResolvedValue({ records: [record], total: 1 });
    const adapter = buildVehicleCatalogAdapter(searchFn);

    const output = await adapter.search({ filters: {} });

    expect(output.total).toBe(1);
    const result = output.results[0];
    expect(result?.id).toBe('veh-1');
    expect(result?.label).toBe('2024 Toyota RAV4 XLE');

    // Representative fields -- including ones the old hand-list dropped --
    // map straight through with their real values.
    expect(result?.fields).toMatchObject({
      id: 'veh-1',
      year: 2024,
      make: 'Toyota',
      model: 'RAV4',
      trim: 'XLE',
      bodyStyle: 'SUV',
      drivetrain: 'AWD',
      fuelType: 'gasoline',
      combinedMpg: 30,
      cylinders: 4,
      transmission: '8-speed automatic',
      fiveYearSavingsVsAverageUsd: -450,
      passengerVolumeCuFt: 98,
      epaModel: 'RAV4 4WD',
    });

    // `source` cannot survive as a nested object -- `fields` is typed
    // `Record<string, string | number | boolean | null>` -- so it must be
    // flattened under prefixed keys rather than left in place or dropped.
    expect(result?.fields).not.toHaveProperty('source');
    expect(result?.fields).toMatchObject({
      sourceDataset: 'epa-fueleconomy-gov',
      sourceRecordId: '42',
      sourceEpaEngineId: 'eng-7',
      sourceManufacturerCode: null,
      sourceCreatedOn: '2023-10-01',
      sourceModifiedOn: '2024-01-15',
      sourceHasUserMpgData: true,
    });

    // Every field this particular record has -- the 83 scalar record
    // fields plus the 7 flattened `source.*` fields, whatever their
    // values -- shows up exactly once. (The dedicated completeness test
    // below independently checks this against the schema itself, rather
    // than against this one record's own key set.)
    const { source, ...scalarFields } = record;
    expect(Object.keys(result?.fields ?? {})).toHaveLength(
      Object.keys(scalarFields).length + Object.keys(source).length,
    );
  });

  it('omits the trim from the label when the catalog does not report one', async () => {
    const searchFn = vi
      .fn()
      .mockResolvedValue({ records: [buildVehicleCatalogRecord({ trim: null })], total: 1 });
    const adapter = buildVehicleCatalogAdapter(searchFn);

    const output = await adapter.search({ filters: {} });

    expect(output.results[0]?.label).toBe('2025 Toyota Camry');
  });

  it("keeps the schema's non-nullable and nullable boolean fields as real booleans, not strings", async () => {
    const record = buildVehicleCatalogRecord({
      turbocharged: true,
      supercharged: false,
      startStopSystem: true,
      phevBlended: false,
    });
    const searchFn = vi.fn().mockResolvedValue({ records: [record], total: 1 });
    const adapter = buildVehicleCatalogAdapter(searchFn);

    const output = await adapter.search({ filters: {} });
    const fields = output.results[0]?.fields;

    expect(fields?.['turbocharged']).toBe(true);
    expect(fields?.['supercharged']).toBe(false);
    expect(fields?.['startStopSystem']).toBe(true);
    expect(fields?.['phevBlended']).toBe(false);
    for (const key of ['turbocharged', 'supercharged', 'startStopSystem', 'phevBlended']) {
      expect(typeof fields?.[key]).toBe('boolean');
    }
  });

  describe('field exposure completeness', () => {
    // This is the regression guard the old hand-listed `vehicleFields`
    // could not provide: it derives the expected key set from
    // `VehicleCatalogRecordSchema.shape` itself -- not from a list
    // maintained in this test file -- so it fails the moment the adapter
    // stops exposing a field the schema declares, including a field added
    // after this test was written. A hardcoded expected-key list here would
    // recreate exactly the defect this task fixes: it would go stale the
    // same way `vehicleFields`'s old hand-list did.
    it('exposes every field VehicleCatalogRecordSchema declares, including every flattened source.* field', async () => {
      const topLevelShape = VehicleCatalogRecordSchema.shape;
      const sourceShape = topLevelShape.source.shape;

      const expectedTopLevelKeys = Object.keys(topLevelShape).filter((key) => key !== 'source');
      const expectedSourceKeys = Object.keys(sourceShape).map(
        (key) => `source${key.charAt(0).toUpperCase()}${key.slice(1)}`,
      );
      const expectedKeys = [...expectedTopLevelKeys, ...expectedSourceKeys].sort();

      // A record with every field null still has to expose every key --
      // "unknown" is a present value in this catalog (schema.ts), not an
      // absent one, and `fields` must reflect that rather than omitting
      // keys whose value happens to be null.
      const record = buildVehicleCatalogRecord();
      const searchFn = vi.fn().mockResolvedValue({ records: [record], total: 1 });
      const adapter = buildVehicleCatalogAdapter(searchFn);

      const output = await adapter.search({ filters: {} });
      const actualKeys = Object.keys(output.results[0]?.fields ?? {}).sort();

      expect(actualKeys).toEqual(expectedKeys);
    });
  });
});

describe('buildDefaultCatalogAdapters', () => {
  it('registers exactly the car-purchase adapter today', () => {
    const adapters = buildDefaultCatalogAdapters();
    expect(Object.keys(adapters)).toEqual(['car-purchase']);
  });
});
