/**
 * `GET /api/catalog/*` (docs/decisions/0003-vehicle-catalog-and-normal-case-
 * creation.md): the browser's only access to `@pax/catalog`'s bundled
 * vehicle data. `apps/web` has no filesystem access and never imports
 * `@pax/catalog` directly (`packages/catalog/src/query.ts`'s own header
 * comment) -- these routes are the one boundary that calls its synchronous,
 * already-bounded query functions and serializes the result. No store, no
 * command dispatch, no idempotency key: every route here is read-only and
 * pulls from the same in-process, already-validated catalog array on every
 * request, so there is nothing to inject beyond the query functions
 * themselves.
 *
 * Every response is still validated against a `.strict()` Zod schema before
 * being sent, matching this codebase's "every route validates input and
 * output through schemas" convention (`routes/packs.ts`, `routes/cases.ts`).
 * Query-string parsing is deliberately best-effort where a filter is merely
 * advisory (an unparseable `year`/`limit`/`offset` is a genuine client
 * error, not something to silently coerce away), so those are rejected with
 * `400 VALIDATION` via `sendError` rather than ignored -- see the inline
 * comments below for exactly which parameters are load-bearing.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  getVehicle,
  listBodyStyles,
  listMakes,
  listModels,
  listYears,
  searchVehicles,
  VehicleCatalogRecordSchema,
  VehicleCatalogRecordListSchema,
} from '@pax/catalog';
import { sendError } from './http-support.js';

const ListYearsResponseSchema = z.object({ years: z.array(z.number().int()) }).strict();
const ListMakesResponseSchema = z.object({ makes: z.array(z.string()) }).strict();
const ListModelsResponseSchema = z.object({ models: z.array(z.string()) }).strict();
const ListBodyStylesResponseSchema = z.object({ bodyStyles: z.array(z.string()) }).strict();
const SearchVehiclesResponseSchema = z
  .object({ records: VehicleCatalogRecordListSchema, total: z.number().int().nonnegative() })
  .strict();

/**
 * Parses a query-string parameter as a finite integer. Returns `undefined`
 * when `raw` is absent (the filter simply is not applied); returns `null`
 * when `raw` is present but not a valid integer, which every call site below
 * treats as a `400 VALIDATION` -- a garbled value is a real client error,
 * not something to quietly drop.
 */
function parseOptionalInt(raw: string | undefined): number | undefined | null {
  if (raw === undefined) return undefined;
  if (!/^-?\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) ? value : null;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

export function createCatalogRouter(): Router {
  const router = Router();

  router.get('/api/catalog/years', (_req, res) => {
    res.status(200).json(ListYearsResponseSchema.parse({ years: listYears() }));
  });

  router.get('/api/catalog/makes', (req, res) => {
    const yearParam = parseOptionalInt(firstString(req.query['year']));
    if (yearParam === null) {
      sendError(res, 400, 'VALIDATION', '"year" must be a valid integer.', false);
      return;
    }
    res.status(200).json(
      ListMakesResponseSchema.parse({
        makes: listMakes(yearParam === undefined ? {} : { year: yearParam }),
      }),
    );
  });

  router.get('/api/catalog/models', (req, res) => {
    const make = firstString(req.query['make']);
    if (make === undefined || make.length === 0) {
      sendError(res, 400, 'VALIDATION', 'A non-empty "make" query parameter is required.', false);
      return;
    }
    const yearParam = parseOptionalInt(firstString(req.query['year']));
    if (yearParam === null) {
      sendError(res, 400, 'VALIDATION', '"year" must be a valid integer.', false);
      return;
    }
    res.status(200).json(
      ListModelsResponseSchema.parse({
        models: listModels(yearParam === undefined ? { make } : { make, year: yearParam }),
      }),
    );
  });

  router.get('/api/catalog/body-styles', (_req, res) => {
    res.status(200).json(ListBodyStylesResponseSchema.parse({ bodyStyles: listBodyStyles() }));
  });

  router.get('/api/catalog/vehicles', (req, res) => {
    const year = parseOptionalInt(firstString(req.query['year']));
    const limit = parseOptionalInt(firstString(req.query['limit']));
    const offset = parseOptionalInt(firstString(req.query['offset']));
    if (year === null) {
      sendError(res, 400, 'VALIDATION', '"year" must be a valid integer.', false);
      return;
    }
    if (limit === null) {
      sendError(res, 400, 'VALIDATION', '"limit" must be a valid integer.', false);
      return;
    }
    if (offset === null) {
      sendError(res, 400, 'VALIDATION', '"offset" must be a valid integer.', false);
      return;
    }

    const query = firstString(req.query['query']);
    const make = firstString(req.query['make']);
    const model = firstString(req.query['model']);
    const bodyStyle = firstString(req.query['bodyStyle']);

    const result = searchVehicles({
      ...(query !== undefined ? { query } : {}),
      ...(year !== undefined ? { year } : {}),
      ...(make !== undefined ? { make } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(bodyStyle !== undefined ? { bodyStyle } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    });
    res.status(200).json(SearchVehiclesResponseSchema.parse(result));
  });

  router.get('/api/catalog/vehicles/:id', (req, res) => {
    const { id } = req.params;
    const record = getVehicle(id);
    if (record === undefined) {
      sendError(res, 404, 'NOT_FOUND', `Vehicle "${id}" was not found in the catalog.`, false);
      return;
    }
    res.status(200).json(VehicleCatalogRecordSchema.parse(record));
  });

  return router;
}
