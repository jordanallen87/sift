/**
 * `GET /api/packs` (docs/specs/architecture.md "HTTP service"): lists the
 * injected `PackRegistry`'s compiled packs. Deliberately takes the registry
 * as an injected dependency rather than importing a built-in pack module
 * directly, per this task's scope note: "`POST /api/cases/demo` should
 * accept a `packId` and look it up from an injected `PackRegistry` instance
 * rather than hardcoding car-purchase specifics" -- the same principle
 * applies here.
 */
import { Router } from 'express';
import { z } from 'zod';
import { CompiledDecisionPackSchema } from '@sift/contracts';
import type { PackRegistry } from '@sift/packs';

export interface PacksRouterDeps {
  readonly registry: PackRegistry;
}

const ListPacksResponseSchema = z.object({ packs: z.array(CompiledDecisionPackSchema) }).strict();

export function createPacksRouter(deps: PacksRouterDeps): Router {
  const router = Router();

  router.get('/api/packs', (_req, res) => {
    res.status(200).json(ListPacksResponseSchema.parse({ packs: deps.registry.list() }));
  });

  return router;
}
