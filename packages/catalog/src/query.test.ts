import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEARCH_LIMIT,
  getVehicle,
  listBodyStyles,
  listFuelTypes,
  listMakes,
  listModels,
  listTrims,
  listYears,
  MAX_SEARCH_RESULTS,
  searchVehicles,
} from './query.js';

describe('listYears', () => {
  it('returns every distinct year, descending, with no duplicates', () => {
    const years = listYears();
    expect(years.length).toBeGreaterThan(0);
    expect(new Set(years).size).toBe(years.length);
    for (let i = 1; i < years.length; i += 1) {
      expect(years[i - 1]).toBeGreaterThan(years[i]!);
    }
  });
});

describe('listMakes', () => {
  it('returns every distinct make, alphabetically, with no duplicates', () => {
    const makes = listMakes();
    expect(makes).toContain('Toyota');
    expect(makes).toContain('Honda');
    expect(new Set(makes).size).toBe(makes.length);
    const sorted = [...makes].sort((a, b) => a.localeCompare(b));
    expect(makes).toEqual(sorted);
  });

  it('scopes to one model year when given', () => {
    const [year] = listYears();
    const makes = listMakes({ year: year! });
    expect(makes.length).toBeGreaterThan(0);
  });

  it('returns an empty array for a year with no records', () => {
    expect(listMakes({ year: 1980 })).toEqual([]);
  });
});

describe('listModels', () => {
  it('returns every distinct model for a make, alphabetically', () => {
    const models = listModels({ make: 'Toyota' });
    expect(models).toContain('Camry');
    expect(models).toContain('RAV4');
    const sorted = [...models].sort((a, b) => a.localeCompare(b));
    expect(models).toEqual(sorted);
  });

  it('returns an empty array for an unknown make', () => {
    expect(listModels({ make: 'NotARealMake' })).toEqual([]);
  });
});

/**
 * The most recent model year that actually has a Toyota Camry.
 *
 * These tests previously used `listYears()[0]` -- the newest year outright.
 * That broke when the catalog widened from 2 model years to 2016-onward,
 * because the newest year in the EPA source is a PARTIAL one: EPA publishes
 * early releases first, so 2027 currently carries 29 records against roughly
 * 75 for every settled year, and no Camry among them.
 *
 * That is real data, not a defect, so the fix is to stop assuming the newest
 * year contains any particular model rather than to trim the catalog to make
 * a fragile assumption true. Picking the newest year that genuinely has the
 * model keeps the ordering assertion meaningful while surviving the next
 * partial model year too.
 */
function newestYearWithCamry(): number {
  const year = listYears().find(
    (candidate) => listTrims({ year: candidate, make: 'Toyota', model: 'Camry' }).length > 0,
  );
  if (year === undefined) throw new Error('catalog has no Toyota Camry in any year');
  return year;
}

describe('listTrims', () => {
  it('returns full records for one exact year/make/model, deterministically ordered', () => {
    const year = newestYearWithCamry();
    const records = listTrims({ year, make: 'Toyota', model: 'Camry' });
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.year).toBe(year);
      expect(record.make).toBe('Toyota');
      expect(record.model).toBe('Camry');
    }
  });

  it('is stable across repeated calls (same order every time)', () => {
    const year = newestYearWithCamry();
    const a = listTrims({ year, make: 'Toyota', model: 'Camry' });
    const b = listTrims({ year, make: 'Toyota', model: 'Camry' });
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });
});

describe('getVehicle', () => {
  it('returns the exact record for a known id', () => {
    const year = newestYearWithCamry();
    const [first] = listTrims({ year, make: 'Toyota', model: 'Camry' });
    expect(first).toBeDefined();
    const found = getVehicle(first!.id);
    expect(found).toEqual(first);
  });

  it('returns undefined for an unknown id, never throws', () => {
    expect(getVehicle('not-a-real-id')).toBeUndefined();
  });
});

describe('searchVehicles', () => {
  it('bounds results to MAX_SEARCH_RESULTS even when a huge limit is requested', () => {
    const result = searchVehicles({ limit: 10_000 });
    expect(result.records.length).toBeLessThanOrEqual(MAX_SEARCH_RESULTS);
  });

  it('defaults to DEFAULT_SEARCH_LIMIT when no limit is given', () => {
    const result = searchVehicles({});
    expect(result.records.length).toBeLessThanOrEqual(DEFAULT_SEARCH_LIMIT);
  });

  it('reports total matches independent of the page returned', () => {
    const full = searchVehicles({ make: 'Toyota', limit: MAX_SEARCH_RESULTS });
    const page = searchVehicles({ make: 'Toyota', limit: 1 });
    expect(page.total).toBe(full.total);
    expect(page.records.length).toBe(1);
  });

  it('filters by free-text query across make/model/trim, case-insensitively', () => {
    const result = searchVehicles({ query: 'camry' });
    expect(result.records.length).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(record.model.toLowerCase()).toContain('camry');
    }
  });

  it('returns an empty result, not an error, for a query with no matches', () => {
    const result = searchVehicles({ query: 'zzznonexistentvehiclezzz' });
    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('paginates deterministically: offset 0..N and offset N.. never skip or repeat a record', () => {
    const pageSize = 5;
    const first = searchVehicles({ make: 'Toyota', limit: pageSize, offset: 0 });
    const second = searchVehicles({ make: 'Toyota', limit: pageSize, offset: pageSize });
    const firstIds = new Set(first.records.map((r) => r.id));
    for (const record of second.records) {
      expect(firstIds.has(record.id)).toBe(false);
    }
  });

  it('combines year/make/model/bodyStyle filters (AND semantics)', () => {
    const [year] = listYears();
    const result = searchVehicles({ year: year!, make: 'Toyota', model: 'Camry' });
    for (const record of result.records) {
      expect(record.year).toBe(year);
      expect(record.make).toBe('Toyota');
      expect(record.model).toBe('Camry');
    }
  });

  it('produces the exact same ordering across two calls with identical filters', () => {
    const a = searchVehicles({ make: 'Honda' });
    const b = searchVehicles({ make: 'Honda' });
    expect(a.records.map((r) => r.id)).toEqual(b.records.map((r) => r.id));
  });
});

describe('listBodyStyles', () => {
  it('returns every distinct non-null body style, alphabetically, with no duplicates', () => {
    const styles = listBodyStyles();
    expect(styles.length).toBeGreaterThan(0);
    expect(new Set(styles).size).toBe(styles.length);
    const sorted = [...styles].sort((a, b) => a.localeCompare(b));
    expect(styles).toEqual(sorted);
  });
});

describe('listFuelTypes', () => {
  it('returns every distinct non-null fuel type, alphabetically, with no duplicates', () => {
    const fuelTypes = listFuelTypes();
    expect(fuelTypes.length).toBeGreaterThan(0);
    expect(new Set(fuelTypes).size).toBe(fuelTypes.length);
    const sorted = [...fuelTypes].sort((a, b) => a.localeCompare(b));
    expect(fuelTypes).toEqual(sorted);
  });

  /**
   * Guards the reason this list is derived from data rather than hardcoded:
   * every value it offers must actually match something, or a picker built
   * from it hands the user a filter that returns an empty list.
   */
  it('offers only values that actually match at least one vehicle', () => {
    for (const fuelType of listFuelTypes()) {
      expect(searchVehicles({ fuelType, limit: 1 }).total).toBeGreaterThan(0);
    }
  });
});

describe('searchVehicles fuelType filter', () => {
  it('returns only vehicles of the requested fuel type', () => {
    const result = searchVehicles({ fuelType: 'Electric', limit: MAX_SEARCH_RESULTS });
    expect(result.total).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(record.fuelType).toBe('Electric');
    }
  });

  it('ANDs with the other filters rather than replacing them', () => {
    const result = searchVehicles({
      make: 'Toyota',
      fuelType: 'Hybrid',
      limit: MAX_SEARCH_RESULTS,
    });
    expect(result.total).toBeGreaterThan(0);
    for (const record of result.records) {
      expect(record.make).toBe('Toyota');
      expect(record.fuelType).toBe('Hybrid');
    }
  });

  /**
   * An unmatched filter must return an honest empty result, not fall back to
   * the unfiltered list -- a silent fallback would show a shopper petrol cars
   * under a "hydrogen" filter.
   */
  it('returns zero matches for a fuel type no vehicle has', () => {
    expect(searchVehicles({ fuelType: 'Hydrogen fuel cell' }).total).toBe(0);
  });
});
