/**
 * `POST /api/cases/:caseId/run` (docs/specs/architecture.md "HTTP
 * service"), dispatching to `RunService.requestInvestigation`. See
 * `services/run-service.ts`'s header comment for why this is a separate
 * service/route from `CommandService`/`routes/commands.ts`.
 */
import { Router } from 'express';
import { RunReceiptSchema } from '@pax/contracts';
import type { RunService } from '../services/run-service.js';
import { readCommandId, respondWithServiceResult } from './http-support.js';

export interface RunsRouterDeps {
  readonly runService: RunService;
}

export function createRunsRouter(deps: RunsRouterDeps): Router {
  const router = Router();

  router.post('/api/cases/:caseId/run', (req, res) => {
    const commandId = readCommandId(req, res);
    if (commandId === undefined) return;

    const rawBody: Record<string, unknown> =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};
    const input = { ...rawBody, caseId: req.params.caseId };

    const result = deps.runService.requestInvestigation(commandId, input);
    respondWithServiceResult(res, result, (value) => RunReceiptSchema.parse(value));
  });

  return router;
}
