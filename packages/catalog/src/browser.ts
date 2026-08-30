// The fs-free subset of @sift/catalog's public API, safe to import from a
// browser bundle. `apps/web` imports from `@sift/catalog/browser`, never the
// package's default barrel (`./index.js`) -- that barrel also re-exports
// `data.ts`/`query.ts`, which import `node:fs`/`node:path`/`node:url` and
// must only ever run server-side (see `apps/agent/src/routes/catalog.ts`'s
// own header comment: "apps/web has no filesystem access and never imports
// @sift/catalog directly [meaning the fs-backed surface] -- these routes are
// the one boundary"). The browser gets catalog *data* only through those
// HTTP routes; this entry point exists solely so the browser can validate
// that JSON response and, once a vehicle is selected, map it into
// `upsertOption` input using the exact same function `apps/agent` would use
// if it ever needed to (docs/decisions/0003-vehicle-catalog-and-normal-case-
// creation.md "one adaptation boundary").
export { VehicleCatalogRecordSchema, VehicleCatalogRecordListSchema } from './schema.js';
export type { VehicleCatalogRecord } from './schema.js';

export { mapCatalogRecordToOption } from './map-to-option.js';
export type { MappedOption, MappedOptionAttribute } from './map-to-option.js';
