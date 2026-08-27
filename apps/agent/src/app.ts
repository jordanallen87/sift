/**
 * Builds the Pax Express `Application`.
 *
 * Extends the health-only skeleton with the full HTTP service described in
 * docs/specs/architecture.md ("HTTP service") that is this task's scope:
 * `GET /api/packs`, `POST /api/cases/demo`, `GET /api/cases/:caseId`,
 * `GET /api/cases/:caseId/events` (SSE + polling fallback),
 * `POST /api/cases/:caseId/commands/:commandName`, and
 * `POST /api/cases/:caseId/run`. `/ping`/`/invocations` for AgentCore and
 * the `/api/debug/runs/*` Runtime Inspector routes are separate, later
 * work.
 *
 * `buildApp` deliberately has no `listen()` side effect — `server.ts` is
 * the only place that binds a port, so integration tests (see
 * `app.test.ts`) can mount the returned `Application` directly against
 * supertest without opening a real socket.
 *
 * Every dependency (`caseStore`, `activityStore`, `registry`,
 * `commandService`, `runService`) is accepted pre-built rather than
 * constructed here, exactly like `database` already was — this keeps
 * `buildApp` a pure composition root that both `server.ts` (real SQLite
 * stores, `runtime-ports.ts`'s system `Clock`/`IdGenerator`) and HTTP
 * integration tests (real SQLite stores with deterministic fakes, or
 * `MemoryCaseStore`/`InMemoryActivityStore` for pure in-process tests) can
 * wire independently.
 */
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import type { PackRegistry } from '@pax/packs';
import type { PaxDatabase } from './db/connection.js';
import { createHealthRouter } from './routes/health.js';
import { createCasesRouter } from './routes/cases.js';
import { createCommandsRouter } from './routes/commands.js';
import { createEventsRouter } from './routes/events.js';
import { createPacksRouter } from './routes/packs.js';
import { createRunsRouter } from './routes/runs.js';
import { sendError } from './routes/http-support.js';
import type { CommandService } from './services/command-service.js';
import type { RunService } from './services/run-service.js';
import type { ActivityStore } from './store/activity-store.js';
import type { CaseStore } from './store/case-store.js';

export interface BuildAppDeps {
  database: PaxDatabase;
  caseStore: CaseStore;
  activityStore: ActivityStore;
  registry: PackRegistry;
  commandService: CommandService;
  runService: RunService;
  /** Passed through to `createEventsRouter` — overridable in tests so an SSE test does not need to wait out a real 15s heartbeat interval. */
  sseHeartbeatIntervalMs?: number;
  /** Passed through to `createEventsRouter` — overridable in tests exercising the slow-consumer resync path without needing genuine socket backpressure. */
  sseMaxQueueLength?: number;
}

export function buildApp(deps: BuildAppDeps): Application {
  const app = express();

  app.use(express.json());
  app.use(createHealthRouter({ database: deps.database }));
  app.use(createPacksRouter({ registry: deps.registry }));
  app.use(createCasesRouter({ commandService: deps.commandService, caseStore: deps.caseStore }));
  app.use(createCommandsRouter({ commandService: deps.commandService }));
  app.use(createRunsRouter({ runService: deps.runService }));
  app.use(
    createEventsRouter({
      caseStore: deps.caseStore,
      activityStore: deps.activityStore,
      ...(deps.sseHeartbeatIntervalMs !== undefined
        ? { heartbeatIntervalMs: deps.sseHeartbeatIntervalMs }
        : {}),
      ...(deps.sseMaxQueueLength !== undefined
        ? { sseMaxQueueLength: deps.sseMaxQueueLength }
        : {}),
    }),
  );

  // Final error-handling middleware (docs/specs/testing.md "HTTP
  // integration tests": "internal-error coverage"). A route handler that
  // throws synchronously is forwarded here automatically by Express;
  // `service-result.ts`'s own header comment documents that a genuine
  // internal error is deliberately left to propagate as a thrown `Error`
  // rather than a typed `ServiceFailure`, precisely so it lands here as a
  // real `500` instead of being silently reclassified as a `4xx`. The real
  // error is logged server-side but never included in the response body,
  // consistent with architecture.md "Security and authority": responses
  // must not leak internals.
  // Express identifies error-handling middleware by arity (4 declared
  // parameters) -- `_next` must stay declared even though this handler
  // never calls it (there is nothing further downstream to delegate to).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[pax] unhandled request error:', err);
    sendError(res, 500, 'INTERNAL', 'An unexpected internal error occurred.', false);
  });

  return app;
}
