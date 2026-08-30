/**
 * Unit tests for `buildVehicleCatalogAdapter`'s pure mapping logic --
 * `catalog-client.test.ts` already proves the real `GET /api/catalog/*` HTTP
 * boundary; this file injects a fake `searchFn` so the adapter's own
 * filter-extraction and result-mapping behavior is tested without a
 * network/MSW dependency (see this module's own header comment).
 */
import { describe, expect, it, vi } from 'vitest';
import type { VehicleCatalogRecord } from '@sift/catalog/browser';
import {
  buildDefaultCatalogAdapters,
  buildVehicleCatalogAdapter,
} from './catalog-search-adapter.js';

function buildRecord(overrides: Partial<VehicleCatalogRecord> = {}): VehicleCatalogRecord {
  return {
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
    cityMpg: null,
    highwayMpg: null,
    annualFuelCostUsd: null,
    fiveYearSavingsVsAverageUsd: null,
    fuelEconomyScore: null,
    greenhouseGasScore: null,
    co2GramsPerMile: null,
    engineDisplacementL: null,
    electricRangeMiles: null,
    charge240Hours: null,
    source: { dataset: 'epa-fueleconomy-gov', recordId: '1' },
    ...overrides,
  };
}

describe('buildVehicleCatalogAdapter', () => {
  it('declares its recognized filter keys', () => {
    const adapter = buildVehicleCatalogAdapter(vi.fn());
    expect(adapter.recognizedFilterKeys).toEqual(['year', 'make', 'model', 'bodyStyle']);
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

  it('maps each VehicleCatalogRecord to a labeled, id-addressable result with real fields, dropping the internal source dataset id', async () => {
    const searchFn = vi.fn().mockResolvedValue({ records: [buildRecord()], total: 1 });
    const adapter = buildVehicleCatalogAdapter(searchFn);

    const output = await adapter.search({ filters: {} });

    expect(output.total).toBe(1);
    expect(output.results).toEqual([
      {
        id: 'veh-1',
        label: '2024 Toyota RAV4 XLE',
        fields: {
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
          cityMpg: null,
          highwayMpg: null,
          annualFuelCostUsd: null,
          fiveYearSavingsVsAverageUsd: null,
          fuelEconomyScore: null,
          greenhouseGasScore: null,
          co2GramsPerMile: null,
          engineDisplacementL: null,
          electricRangeMiles: null,
          charge240Hours: null,
        },
      },
    ]);
    expect(output.results[0]).not.toHaveProperty('source');
  });

  it('omits the trim from the label when the catalog does not report one', async () => {
    const searchFn = vi
      .fn()
      .mockResolvedValue({ records: [buildRecord({ trim: null })], total: 1 });
    const adapter = buildVehicleCatalogAdapter(searchFn);

    const output = await adapter.search({ filters: {} });

    expect(output.results[0]?.label).toBe('2024 Toyota RAV4');
  });
});

describe('buildDefaultCatalogAdapters', () => {
  it('registers exactly the car-purchase adapter today', () => {
    const adapters = buildDefaultCatalogAdapters();
    expect(Object.keys(adapters)).toEqual(['car-purchase']);
  });
});
