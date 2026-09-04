/**
 * `POST /api/cases/:caseId/run` (docs/specs/architecture.md "HTTP
 * service"), dispatching to `RunService.requestInvestigation`. See
 * `services/run-service.ts`'s header comment for why this is a separate
 * service/route from `CommandService`/`routes/commands.ts`.
 *
 * Separate service, but the *same* `X-Sift-Command-Origin` provenance
 * marker (I1 -- ADR 0006 decision 8): see the `POST .../run` handler below.
 */
import { Router } from 'express';
import { RunReceiptSchema } from '@sift/contracts';
import type { RunService } from '../services/run-service.js';
import type { RunPlanService } from '../services/run-plan-service.js';
import { readCommandId, readCommandOrigin, respondWithServiceResult } from './http-support.js';

export interface RunsRouterDeps {
  readonly runService: RunService;
  /**
   * Optional so a deployment with no plan wired serves every other route
   * unchanged. When absent, the run-plan endpoint reports 404 rather than
   * an empty plan — "this build has no plans" and "this case has no plan
   * yet" are different facts, and an empty body would conflate them.
   */
  readonly runPlanService?: RunPlanService;
}

export function createRunsRouter(deps: RunsRouterDeps): Router {
  const router = Router();

  /**
   * The current plan plus its full version history.
   *
   * History is returned alongside the current plan rather than behind a
   * second endpoint because the two are only meaningful together: the
   * product's claim is not "here is a plan" but "here is what changed and
   * what survived," and that comparison needs both.
   */
  router.get('/api/cases/:caseId/run-plan', (req, res) => {
    const planService = deps.runPlanService;
    if (planService === undefined) {
      res.status(404).json({ error: 'Run plans are not enabled on this deployment.' });
      return;
    }
    const caseId = req.params.caseId;
    // A case with no plan yet answers 200 with `plan: null`, not 404.
    //
    // Most of discovery happens before anyone asks Sift to investigate, so
    // "no plan yet" is the ordinary state of a valid case, and a 404 made
    // the browser log a failed resource on nearly every case load -- caught
    // by the E2E console guard, correctly. A missing *resource* and an
    // *empty* answer are different things; only the first is a 404.
    //
    // The build-level 404 above stays: "this deployment has no plans at
    // all" genuinely is a missing route, and conflating it with "this case
    // has none yet" would hide a misconfiguration.
    const plan = planService.currentPlan(caseId) ?? null;
    res.json({ plan, history: plan === null ? [] : planService.history(caseId) });
  });

  router.post('/api/cases/:caseId/run', (req, res) => {
    const commandId = readCommandId(req, res);
    if (commandId === undefined) return;

    // The same optional `X-Sift-Command-Origin` marker `routes/commands.ts`
    // reads, through the same `readCommandOrigin` reader, against the same
    // closed `COMMAND_ORIGINS` vocabulary and the same failure contract (an
    // unrecognized value is already answered `400 VALIDATION` by the reader
    // itself; a missing header is `origin: undefined`, never a default).
    //
    // This route needs it more than any other: `sift_request_investigation`
    // is the WebMCP tool that *starts a run*, so without threading the
    // marker here, the project's central causal claim -- "this assistant's
    // tool call caused this entire run" -- was recorded nowhere, and a
    // WebMCP-triggered investigation was indistinguishable from a click.
    const originResult = readCommandOrigin(req, res);
    if (!originResult.ok) return;

    const rawBody: Record<string, unknown> =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};
    const input = { ...rawBody, caseId: req.params.caseId };

    const result = deps.runService.requestInvestigation(commandId, input, originResult.origin);
    respondWithServiceResult(res, result, (value) => RunReceiptSchema.parse(value));
  });

  return router;
}
