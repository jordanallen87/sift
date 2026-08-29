/**
 * `POST /api/cases/demo`, `POST /api/cases`, and `GET /api/cases/:caseId`
 * (docs/specs/architecture.md "HTTP service").
 *
 * `POST /api/cases/demo` dispatches to `CommandService.startDemo`, which
 * resolves `demoId` against the injected `PackRegistry` rather than
 * hardcoding a specific pack -- see `command-service.ts` and
 * `routes/packs.ts` for the same principle.
 *
 * `POST /api/cases` dispatches to `CommandService.startCase`
 * (docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md): a
 * normal, non-demo case-creation entry point pinned to any registered pack
 * id. Distinct from `POST /api/cases/demo` rather than folding into it --
 * see that ADR's "Decision" §3.
 */
import { Router } from 'express';
import { CaseStateSchema } from '@pax/contracts';
import type { CommandService } from '../services/command-service.js';
import type { CaseStore } from '../store/case-store.js';
import { readCommandId, respondWithServiceResult, sendError } from './http-support.js';

export interface CasesRouterDeps {
  readonly commandService: CommandService;
  readonly caseStore: CaseStore;
}

export function createCasesRouter(deps: CasesRouterDeps): Router {
  const router = Router();

  router.post('/api/cases/demo', (req, res) => {
    const commandId = readCommandId(req, res);
    if (commandId === undefined) return;

    const result = deps.commandService.startDemo(commandId, req.body);
    respondWithServiceResult(res, result);
  });

  router.post('/api/cases', (req, res) => {
    const commandId = readCommandId(req, res);
    if (commandId === undefined) return;

    const result = deps.commandService.startCase(commandId, req.body);
    respondWithServiceResult(res, result);
  });

  router.get('/api/cases/:caseId', (req, res) => {
    const { caseId } = req.params;
    const snapshot = deps.caseStore.load(caseId);
    if (snapshot === undefined) {
      sendError(res, 404, 'NOT_FOUND', `Case "${caseId}" was not found.`, false);
      return;
    }
    res.status(200).json(CaseStateSchema.parse(snapshot));
  });

  return router;
}
