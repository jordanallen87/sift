/**
 * Bounded, deterministic query functions over the loaded catalog
 * (docs/specs -- car-catalog spec brief §7 "Catalog API / query layer":
 * "bounded result sizes; deterministic ordering; ... no arbitrary SQL
 * exposed to the browser"). Every function is a pure, synchronous filter
 * over `loadCatalog()`'s already-validated in-memory array -- no network,
 * no arbitrary query string, no unbounded result.
 *
 * `apps/agent`'s catalog routes call these directly and serialize the
 * result; `apps/web` never imports this module (it has no filesystem
 * access) -- it only ever sees catalog data through the HTTP routes.
 */
import { loadCatalog } from './data.js';
import type { VehicleCatalogRecord } from './schema.js';

export const MAX_SEARCH_RESULTS = 50;
export const DEFAULT_SEARCH_LIMIT = 20;

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/** Every model year present in the catalog, descending (most recent first -- the order a shopper wants to see first). */
export function listYears(): number[] {
  return [...new Set(loadCatalog().map((record) => record.year))].sort((a, b) => b - a);
}

/** Every distinct make, optionally scoped to one model year, alphabetically. */
export function listMakes(params: { year?: number } = {}): string[] {
  const records = loadCatalog().filter(
    (record) => params.year === undefined || record.year === params.year,
  );
  return sortedUnique(records.map((record) => record.make));
}

/** Every distinct model for a given make, optionally scoped to one model year, alphabetically. */
export function listModels(params: { make: string; year?: number }): string[] {
  const records = loadCatalog().filter(
    (record) =>
      record.make === params.make && (params.year === undefined || record.year === params.year),
  );
  return sortedUnique(records.map((record) => record.model));
}

/** Every trim/variant record for one exact year/make/model, ordered deterministically by trim label then id. */
export function listTrims(params: {
  year: number;
  make: string;
  model: string;
}): VehicleCatalogRecord[] {
  return loadCatalog()
    .filter(
      (record) =>
        record.year === params.year && record.make === params.make && record.model === params.model,
    )
    .sort((a, b) => (a.trim ?? '').localeCompare(b.trim ?? '') || a.id.localeCompare(b.id));
}

/** A single catalog record by id, or `undefined` if no such record exists -- explicit not-found, never a throw. */
export function getVehicle(id: string): VehicleCatalogRecord | undefined {
  return loadCatalog().find((record) => record.id === id);
}

export interface SearchVehiclesParams {
  /** Free-text match against make, model, and trim (case-insensitive substring). */
  query?: string;
  year?: number;
  make?: string;
  model?: string;
  bodyStyle?: string;
  /**
   * Exact match against the catalog's normalised `fuelType` ("Hybrid",
   * "Electric", "Gasoline", "Plug-in hybrid", "Diesel", "Flex-fuel",
   * "Gasoline (premium)").
   *
   * Added because "show me the hybrids" is one of the most common ways a
   * shopper narrows a list, and it was previously unanswerable: the
   * free-text `query` only searches make/model/trim, so a fuel-type search
   * silently returned nothing rather than filtering. Use `listFuelTypes()`
   * to populate a picker rather than hardcoding the values, which are data,
   * not a closed enum.
   */
  fuelType?: string;
  /**
   * Several fuel types at once. "A hybrid or an EV" is one thought, and
   * forcing it into two queries makes the caller re-implement pagination
   * and ordering to merge them back together.
   */
  fuelTypes?: readonly string[];
  /** Several body styles at once, for the same reason as `fuelTypes`. */
  bodyStyles?: readonly string[];
  /** Exact match against the catalog's `drivetrain` ("AWD", "FWD", "RWD", "4WD (part-time)", ...). */
  drivetrain?: string;
  minYear?: number;
  maxYear?: number;
  minCombinedMpg?: number;
  maxAnnualFuelCostUsd?: number;
  minElectricRangeMiles?: number;
  /** Bounded to `MAX_SEARCH_RESULTS`; defaults to `DEFAULT_SEARCH_LIMIT`. */
  limit?: number;
  offset?: number;
}

/**
 * Whether a record's value for a numeric constraint passes.
 *
 * **An unknown never passes.** A null `combinedMpg` is not "economical
 * enough", and a null `annualFuelCostUsd` is not "cheap enough". Treating a
 * missing measurement as a satisfied constraint is the single most tempting
 * shortcut in this file and the one that would quietly put vehicles in front
 * of someone that nobody has established meet their requirement.
 *
 * The caller that wants to say "these could not be checked" reads them back
 * with the constraint removed and compares -- an explicit unknown, not a
 * silent pass.
 */
function passesNumericFloor(value: number | null | undefined, floor: number | undefined): boolean {
  if (floor === undefined) return true;
  if (value === null || value === undefined) return false;
  return value >= floor;
}

/** The categorical counterpart to `passesNumericFloor`. A null value fails an explicit filter rather than passing it. */
function passesEnumFilter(
  value: string | null | undefined,
  allowed: readonly string[] | undefined,
): boolean {
  if (allowed === undefined) return true;
  if (value === null || value === undefined) return false;
  return allowed.includes(value);
}

function passesNumericCeiling(
  value: number | null | undefined,
  ceiling: number | undefined,
): boolean {
  if (ceiling === undefined) return true;
  if (value === null || value === undefined) return false;
  return value <= ceiling;
}

export interface SearchVehiclesResult {
  records: VehicleCatalogRecord[];
  /** Total matches before pagination -- lets a caller show "12 of 43 vehicles" without a second query. */
  total: number;
}

/**
 * Bounded, deterministically-ordered vehicle search. Ordering is always
 * make, then model, then descending year, then trim -- the same order
 * regardless of which filters are applied, so pagination (`offset`/`limit`)
 * never skips or repeats a record between two calls with the same filters.
 */
export function searchVehicles(params: SearchVehiclesParams = {}): SearchVehiclesResult {
  const query = params.query?.trim().toLowerCase();
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_RESULTS);
  const offset = Math.max(params.offset ?? 0, 0);

  const filtered = loadCatalog().filter((record) => {
    if (params.year !== undefined && record.year !== params.year) return false;
    if (params.make !== undefined && record.make !== params.make) return false;
    if (params.model !== undefined && record.model !== params.model) return false;
    if (params.bodyStyle !== undefined && record.bodyStyle !== params.bodyStyle) return false;
    if (params.fuelType !== undefined && record.fuelType !== params.fuelType) return false;
    // A null value never satisfies an explicit filter, for the same reason a
    // null MPG never satisfies a floor: "not recorded" is not "matches".
    if (!passesEnumFilter(record.fuelType, params.fuelTypes)) return false;
    if (!passesEnumFilter(record.bodyStyle, params.bodyStyles)) return false;
    if (params.drivetrain !== undefined && record.drivetrain !== params.drivetrain) return false;
    if (params.minYear !== undefined && record.year < params.minYear) return false;
    if (params.maxYear !== undefined && record.year > params.maxYear) return false;
    if (!passesNumericFloor(record.combinedMpg, params.minCombinedMpg)) return false;
    if (!passesNumericCeiling(record.annualFuelCostUsd, params.maxAnnualFuelCostUsd)) return false;
    if (!passesNumericFloor(record.electricRangeMiles, params.minElectricRangeMiles)) return false;
    if (query !== undefined && query.length > 0) {
      const haystack = `${record.make} ${record.model} ${record.trim ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  filtered.sort(
    (a, b) =>
      a.make.localeCompare(b.make) ||
      a.model.localeCompare(b.model) ||
      b.year - a.year ||
      (a.trim ?? '').localeCompare(b.trim ?? '') ||
      a.id.localeCompare(b.id),
  );

  return {
    records: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}

/** Every distinct catalog-reported body style, alphabetically -- used to populate a body-style filter without inventing a closed enum. */
export function listBodyStyles(): string[] {
  return sortedUnique(
    loadCatalog()
      .map((record) => record.bodyStyle)
      .filter((value): value is string => value !== null),
  );
}

/**
 * Every distinct catalog-reported fuel type, alphabetically.
 *
 * Same reasoning as `listBodyStyles`: these come from the data rather than a
 * hardcoded list, so a re-import that introduces a new powertrain (a
 * hydrogen vehicle, say) shows up in the filter automatically instead of
 * being silently unselectable.
 */
export function listFuelTypes(): string[] {
  return sortedUnique(
    loadCatalog()
      .map((record) => record.fuelType)
      .filter((value): value is string => value !== null),
  );
}
