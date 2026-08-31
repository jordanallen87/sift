/**
 * Typed, validated fetch functions for the read-only `GET /api/catalog/*`
 * routes (`apps/agent/src/routes/catalog.ts`,
 * docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md). Mirrors
 * `sift-client.ts`'s own validate-before-and-after-the-network-call
 * discipline, but for plain `GET` reads rather than `SiftCommands` mutations
 * -- there is no command envelope, idempotency key, or `CommandReceipt`
 * here, matching architecture.md's "Catalog API / query layer" being a
 * separate, read-only boundary from the command layer.
 *
 * Every function accepts the same `{ baseUrl?, fetchImpl? }` shape
 * `App.tsx`'s own `GET /api/packs` fetch and `useCaseEvents` already use
 * (`AppProviders.tsx`'s `ApiConfig`), so the same test-injection seam covers
 * this module without inventing a new one.
 */
import { VehicleCatalogRecordSchema, type VehicleCatalogRecord } from '@sift/catalog/browser';
import { z } from 'zod';

export interface CatalogClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class CatalogClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CatalogClientError';
    this.status = status;
  }
}

const ListYearsResponseSchema = z.object({ years: z.array(z.number().int()) }).strict();
const ListMakesResponseSchema = z.object({ makes: z.array(z.string()) }).strict();
const ListBodyStylesResponseSchema = z.object({ bodyStyles: z.array(z.string()) }).strict();
const ListFuelTypesResponseSchema = z.object({ fuelTypes: z.array(z.string()) }).strict();
const SearchVehiclesResponseSchema = z
  .object({
    records: z.array(VehicleCatalogRecordSchema).max(1000),
    total: z.number().int().nonnegative(),
  })
  .strict();

async function getJson(
  options: CatalogClientOptions,
  path: string,
  outputSchema: z.ZodTypeAny,
): Promise<unknown> {
  const baseUrl = options.baseUrl ?? '';
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`);
  } catch {
    throw new CatalogClientError('Could not reach the vehicle catalog.', 0);
  }

  if (!response.ok) {
    throw new CatalogClientError(
      `The vehicle catalog request failed (status ${response.status}).`,
      response.status,
    );
  }

  const payload: unknown = await response.json().catch(() => undefined);
  const parsed = outputSchema.safeParse(payload);
  if (!parsed.success) {
    throw new CatalogClientError(
      'The vehicle catalog returned a response that did not match its contract.',
      response.status,
    );
  }
  return parsed.data;
}

export async function fetchCatalogYears(options: CatalogClientOptions = {}): Promise<number[]> {
  const data = (await getJson(options, '/api/catalog/years', ListYearsResponseSchema)) as {
    years: number[];
  };
  return data.years;
}

export async function fetchCatalogMakes(
  params: { year?: number } = {},
  options: CatalogClientOptions = {},
): Promise<string[]> {
  const search = params.year !== undefined ? `?year=${params.year}` : '';
  const data = (await getJson(options, `/api/catalog/makes${search}`, ListMakesResponseSchema)) as {
    makes: string[];
  };
  return data.makes;
}

export async function fetchCatalogBodyStyles(
  options: CatalogClientOptions = {},
): Promise<string[]> {
  const data = (await getJson(
    options,
    '/api/catalog/body-styles',
    ListBodyStylesResponseSchema,
  )) as { bodyStyles: string[] };
  return data.bodyStyles;
}

/** Fetches the distinct fuel types present in the catalog, for populating a picker from data rather than a hardcoded list. */
export async function fetchCatalogFuelTypes(options: CatalogClientOptions = {}): Promise<string[]> {
  const data = (await getJson(options, '/api/catalog/fuel-types', ListFuelTypesResponseSchema)) as {
    fuelTypes: string[];
  };
  return data.fuelTypes;
}

export interface SearchCatalogVehiclesParams {
  query?: string;
  year?: number;
  make?: string;
  model?: string;
  bodyStyle?: string;
  /** Exact match on the catalog's normalised fuel type ("Hybrid", "Electric", ...). See `fetchCatalogFuelTypes`. */
  fuelType?: string;
  limit?: number;
  offset?: number;
}

export interface SearchCatalogVehiclesResult {
  records: VehicleCatalogRecord[];
  total: number;
}

export async function searchCatalogVehicles(
  params: SearchCatalogVehiclesParams = {},
  options: CatalogClientOptions = {},
): Promise<SearchCatalogVehiclesResult> {
  const search = new URLSearchParams();
  if (params.query !== undefined && params.query.length > 0) search.set('query', params.query);
  if (params.year !== undefined) search.set('year', String(params.year));
  if (params.make !== undefined) search.set('make', params.make);
  if (params.model !== undefined) search.set('model', params.model);
  if (params.bodyStyle !== undefined) search.set('bodyStyle', params.bodyStyle);
  if (params.fuelType !== undefined) search.set('fuelType', params.fuelType);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  const qs = search.toString();
  const data = (await getJson(
    options,
    `/api/catalog/vehicles${qs.length > 0 ? `?${qs}` : ''}`,
    SearchVehiclesResponseSchema,
  )) as SearchCatalogVehiclesResult;
  return data;
}
