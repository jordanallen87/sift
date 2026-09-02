// @sift/catalog -- bundled vehicle catalog, bounded query functions, and the
// catalog-record-to-pack-option adaptation boundary. See
// docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md.

export { VehicleCatalogRecordSchema, VehicleCatalogRecordListSchema } from './schema.js';
export type { VehicleCatalogRecord } from './schema.js';

export { loadCatalog, clearCatalogCache, CatalogLoadError, MAX_CATALOG_BYTES } from './data.js';

export {
  listYears,
  listMakes,
  listModels,
  listTrims,
  listBodyStyles,
  listFuelTypes,
  getVehicle,
  searchVehicles,
  MAX_SEARCH_RESULTS,
  DEFAULT_SEARCH_LIMIT,
} from './query.js';
export type { SearchVehiclesParams, SearchVehiclesResult } from './query.js';

export { mapCatalogRecordToOption } from './map-to-option.js';
export type { MappedOption, MappedOptionAttribute } from './map-to-option.js';

// The curated hero cohort: decision-relevant fields the EPA source does not
// carry, supplied for eight models and labelled `curated_demo`. Node-only
// (reads from disk); the browser receives enriched data through the catalog
// HTTP routes like every other catalog value.
export {
  DEMO_PROFILE_DISCLOSURE,
  DEMO_RATINGS,
  DemoProfileSchema,
  clearDemoProfileCache,
  enrichWithDemoProfile,
  getDemoProfile,
  listDemoProfiles,
} from './demo-profiles.js';
export type { DemoProfile, DemoRating, EnrichedVehicle, FieldProvenance } from './demo-profiles.js';
