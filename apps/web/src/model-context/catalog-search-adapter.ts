/**
 * Per-pack catalog search adapters behind the generic `sift_search_catalog`
 * WebMCP tool (docs/decisions/0006-webmcp-two-way-collaboration-contract.md
 * decision 5, change-set §19/§20). The tool's registered name, input shape,
 * and registration path stay pack-agnostic; only the adapter a given pack id
 * resolves to is pack-specific -- "a vehicle adapter may be pack-specific"
 * (change-set §20), the contract must not be.
 *
 * `CATALOG_ADAPTERS` below carries exactly one real adapter today
 * (`car-purchase`, over `@sift/catalog`'s bundled vehicle data via the real
 * `GET /api/catalog/vehicles` route through `catalog-client.ts`) because
 * that is the only Decision Pack with a real catalog behind it. No pack
 * manifest field declares catalog availability/filter schema yet
 * (`packages/contracts/src/packs.ts`'s `PresentationDefinitionSchema` has no
 * such field, and `packages/contracts` is out of scope for this task) --
 * this module is the honest, minimal stand-in: a future pack adds a further
 * entry here (and, later, a manifest-declared filter schema) rather than a
 * parallel `sift_search_<domain>` tool.
 */
import {
  searchCatalogVehicles,
  type CatalogClientOptions,
  type SearchCatalogVehiclesParams,
} from '../api/catalog-client.js';
import type { VehicleCatalogRecord } from '@sift/catalog/browser';

export interface CatalogSearchResultItem {
  id: string;
  label: string;
  fields: Record<string, string | number | boolean | null>;
}

export interface CatalogSearchOutput {
  results: CatalogSearchResultItem[];
  total: number;
}

export interface CatalogSearchInput {
  query?: string;
  /** Raw filter bag from the WebMCP call. Each adapter reads only the keys it recognizes (`recognizedFilterKeys`) and ignores the rest -- an unrecognized key is not a validation error, since the tool's input schema is deliberately pack-agnostic. */
  filters: Record<string, string | number>;
  limit?: number;
  offset?: number;
}

export interface CatalogAdapter {
  /** Filter keys this adapter understands, for the tool's own honest introspection (surfaced in `sift_search_catalog`'s response so ChatGPT can learn it without guessing). */
  recognizedFilterKeys: readonly string[];
  search: (input: CatalogSearchInput) => Promise<CatalogSearchOutput>;
}

function filterString(filters: Record<string, string | number>, key: string): string | undefined {
  const value = filters[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function filterInt(filters: Record<string, string | number>, key: string): number | undefined {
  const value = filters[key];
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  return undefined;
}

function vehicleLabel(record: VehicleCatalogRecord): string {
  const parts = [String(record.year), record.make, record.model];
  if (record.trim !== null) parts.push(record.trim);
  return parts.join(' ');
}

/**
 * `source.<key>` -> its flattened `fields` key, e.g. `modifiedOn` becomes
 * `sourceModifiedOn`. A plain prefix-and-capitalize, not a lookup table, so
 * a future `source.*` addition (packages/catalog/src/schema.ts) needs no
 * matching edit here -- see `vehicleFields` below for why that property
 * matters.
 */
function sourceFieldKey(key: string): string {
  return `source${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

/**
 * Maps a full `VehicleCatalogRecord` onto the flat `fields` bag a WebMCP
 * search result carries.
 *
 * This used to be a hand-listed subset of ~20 field names. When the bundled
 * catalog's schema widened from 20 to 83 columns
 * (packages/catalog/src/schema.ts), the hand-list kept returning exactly the
 * original 20 -- five-year fuel savings, EV range, interior volume, engine
 * detail, and 40-odd more fields were sitting in the already-validated HTTP
 * response and silently never reached the model. A literal field list can
 * only ever be as current as the last person who remembered to update it;
 * enumerating `record`'s own keys instead means a *future* schema field
 * requires no matching edit here, because it is simply present in
 * `Object.entries(scalarFields)` the moment `catalog-client.ts`'s response
 * schema accepts it.
 *
 * `source` (EPA provenance) is the one field that cannot flow through this
 * loop unchanged: `VehicleCatalogRecordSchema` types it as a nested object,
 * but `CatalogSearchResultItem['fields']` is deliberately flat --
 * `Record<string, string | number | boolean | null>` -- because a WebMCP
 * result has to stay flat JSON scalars, not an arbitrarily deep object. The
 * destructure below pulls `source` out by name for that reason alone (it is
 * the only field on the record whose *type* forces special handling, not a
 * judgement call about which fields are "worth" exposing); every other key
 * is treated identically and automatically.
 *
 * `source`'s own fields carry real signal for a shopping model rather than
 * being purely internal plumbing -- `createdOn`/`modifiedOn` are "how fresh
 * is this row" and `hasUserMpgData` is "checked against real drivers, not
 * only a dynamometer" (schema.ts's own comments make this explicit). Dropping
 * the whole object, as the previous version of this function did, threw that
 * signal away along with the two fields (`dataset`, `recordId`) that really
 * are internal. Flattening it under a `source`-prefixed key keeps the
 * signal, costs nothing but a few bytes for the two internal fields, and --
 * critically -- applies the same "derive from the schema, do not hand-pick"
 * rule one level down, so `source` gaining a field later does not reopen the
 * exact bug this rewrite fixes.
 */
function vehicleFields(record: VehicleCatalogRecord): CatalogSearchResultItem['fields'] {
  const { source, ...scalarFields } = record;
  const fields: CatalogSearchResultItem['fields'] = {};
  for (const [key, value] of Object.entries(scalarFields)) {
    fields[key] = value;
  }
  for (const [key, value] of Object.entries(source)) {
    fields[sourceFieldKey(key)] = value;
  }
  return fields;
}

// Every filter `SearchCatalogVehiclesParams` (catalog-client.ts) can actually
// forward to `GET /api/catalog/vehicles` through the filter bag. `query`,
// `limit`, and `offset` are also supported, but `search` below reads those
// straight off `CatalogSearchInput` rather than through `filters`, so they
// were never candidates for this list.
//
// This list is a promise: `recognizedFilterKeys` is surfaced in
// `sift_search_catalog`'s response so a model can learn the filters without
// guessing. A key listed here that `search` does not actually read would
// silently return unfiltered results that *look* filtered -- worse than
// having no filter at all. So every entry must be read below AND reach the
// route.
//
// `fuelType` was added once the client and route gained it, which is what
// makes "show me the hybrids" answerable. `vehicleFields` now exposes 90
// fields (83 scalar plus 7 flattened `source.*`, up from the old hand-list's
// 20), and most of them -- engine detail, five-year savings, EV range,
// interior volume, provenance -- remain unfilterable. Widening further is
// real follow-up work, and it starts in `catalog-client.ts`'s
// `SearchCatalogVehiclesParams` and the route behind it, not here.
export const VEHICLE_CATALOG_FILTER_KEYS = [
  'year',
  'make',
  'model',
  'bodyStyle',
  'fuelType',
] as const;

/**
 * The real car-purchase catalog adapter. `searchFn` defaults to the real
 * `searchCatalogVehicles` (`catalog-client.ts`, hitting the real
 * `GET /api/catalog/vehicles` route) but is injectable so this adapter's own
 * mapping logic is unit-testable without a network/MSW boundary; only
 * `catalog-client.test.ts` needs to prove the HTTP leg itself.
 */
export function buildVehicleCatalogAdapter(
  searchFn: (
    params: SearchCatalogVehiclesParams,
    options?: CatalogClientOptions,
  ) => ReturnType<typeof searchCatalogVehicles> = searchCatalogVehicles,
  clientOptions: CatalogClientOptions = {},
): CatalogAdapter {
  return {
    recognizedFilterKeys: VEHICLE_CATALOG_FILTER_KEYS,
    search: async (input) => {
      const year = filterInt(input.filters, 'year');
      const make = filterString(input.filters, 'make');
      const model = filterString(input.filters, 'model');
      const bodyStyle = filterString(input.filters, 'bodyStyle');
      const fuelType = filterString(input.filters, 'fuelType');

      const result = await searchFn(
        {
          ...(input.query !== undefined ? { query: input.query } : {}),
          ...(year !== undefined ? { year } : {}),
          ...(make !== undefined ? { make } : {}),
          ...(model !== undefined ? { model } : {}),
          ...(bodyStyle !== undefined ? { bodyStyle } : {}),
          ...(fuelType !== undefined ? { fuelType } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          ...(input.offset !== undefined ? { offset: input.offset } : {}),
        },
        clientOptions,
      );

      return {
        results: result.records.map((record) => ({
          id: record.id,
          label: vehicleLabel(record),
          fields: vehicleFields(record),
        })),
        total: result.total,
      };
    },
  };
}

/** Built once per `registerSiftTools` call (see that module) so every case-scoped registration generation shares the same adapter instances rather than re-creating one per tool call. */
export function buildDefaultCatalogAdapters(
  clientOptions: CatalogClientOptions = {},
): Record<string, CatalogAdapter> {
  return {
    'car-purchase': buildVehicleCatalogAdapter(searchCatalogVehicles, clientOptions),
  };
}
