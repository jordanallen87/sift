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

function vehicleFields(record: VehicleCatalogRecord): CatalogSearchResultItem['fields'] {
  return {
    year: record.year,
    make: record.make,
    model: record.model,
    trim: record.trim,
    bodyStyle: record.bodyStyle,
    drivetrain: record.drivetrain,
    fuelType: record.fuelType,
    combinedMpg: record.combinedMpg,
    cylinders: record.cylinders,
    transmission: record.transmission,
  };
}

export const VEHICLE_CATALOG_FILTER_KEYS = ['year', 'make', 'model', 'bodyStyle'] as const;

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

      const result = await searchFn(
        {
          ...(input.query !== undefined ? { query: input.query } : {}),
          ...(year !== undefined ? { year } : {}),
          ...(make !== undefined ? { make } : {}),
          ...(model !== undefined ? { model } : {}),
          ...(bodyStyle !== undefined ? { bodyStyle } : {}),
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
