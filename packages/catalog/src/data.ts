/**
 * Disk-backed loader for `data/vehicle-catalog.json`, following the exact
 * pattern `packages/scenarios/src/tools/fixture-loader.ts` already
 * establishes for this codebase: read once, defensively size-bound, Zod
 * validate, cache in memory. No network access at any point
 * (docs/engineering-principles.md "Fixture mode must execute the complete product without
 * network access after installation") -- see
 * `docs/reuse-attribution.md` for how this file was produced (a one-time,
 * offline transform of the EPA fueleconomy.gov bulk CSV export, not fetched
 * at runtime).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VehicleCatalogRecordListSchema, type VehicleCatalogRecord } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = join(__dirname, '..', 'data', 'vehicle-catalog.json');

/**
 * Defensive upper bound on the catalog file's byte size. The real file is
 * ~2.5MB (853 records x 83 fields); 16MB keeps generous headroom while still
 * refusing to parse a runaway file.
 *
 * This constant has now been outgrown twice -- the comment here claimed
 * "~60KB" while the file was already 574KB -- so the bound is set well clear
 * of the current size rather than just above it. It exists to stop a
 * corrupted or hostile file, not to assert how big the legitimate catalog
 * happens to be today.
 */
export const MAX_CATALOG_BYTES = 16_000_000;

export class CatalogLoadError extends Error {
  constructor(message: string) {
    super(`catalog: ${message}`);
    this.name = 'CatalogLoadError';
  }
}

let cached: VehicleCatalogRecord[] | undefined;

/** Loads and Zod-validates the full bundled catalog, caching the result in memory. `catalogPath` is overridable for tests only. */
export function loadCatalog(catalogPath: string = DEFAULT_CATALOG_PATH): VehicleCatalogRecord[] {
  if (cached !== undefined && catalogPath === DEFAULT_CATALOG_PATH) {
    return cached;
  }

  let raw: string;
  try {
    raw = readFileSync(catalogPath, 'utf8');
  } catch (error) {
    throw new CatalogLoadError(`failed to read catalog file at ${catalogPath}: ${String(error)}`);
  }

  if (Buffer.byteLength(raw, 'utf8') > MAX_CATALOG_BYTES) {
    throw new CatalogLoadError(
      `catalog file exceeds the ${MAX_CATALOG_BYTES}-byte defensive bound`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CatalogLoadError(`catalog file is not valid JSON: ${String(error)}`);
  }

  const result = VehicleCatalogRecordListSchema.safeParse(parsed);
  if (!result.success) {
    throw new CatalogLoadError(`catalog file failed schema validation: ${result.error.message}`);
  }

  if (catalogPath === DEFAULT_CATALOG_PATH) {
    cached = result.data;
  }
  return result.data;
}

/** Test-only: clears the in-memory cache so a test can reload from a different path. */
export function clearCatalogCache(): void {
  cached = undefined;
}
