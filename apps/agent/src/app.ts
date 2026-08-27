/**
 * Builds the Pax Express `Application`.
 *
 * Current scope: only `GET /health` is wired here. The full HTTP service
 * described in docs/specs/architecture.md ("HTTP service") —
 * `GET /api/packs`, `POST /api/cases/demo`, `GET /api/cases/:caseId`, the
 * case/debug SSE routes, `POST /api/cases/:caseId/commands/:commandName`,
 * `POST /api/cases/:caseId/run`, and `/ping`/`/invocations` for AgentCore —
 * depends on the case store, activity store, command service, and run
 * service, which in turn depend on `applyCaseEvent`/`evaluateReadiness`
 * from `packages/core`. That package is a separate, still-in-progress
 * workstream as of this task; those routes land in the later task that
 * builds `apps/agent/src/routes/{packs,cases,commands,runs,events}.ts` once
 * `packages/core` is ready.
 *
 * `buildApp` deliberately has no `listen()` side effect — `server.ts` is
 * the only place that binds a port, so integration tests (see
 * `app.test.ts`) can mount the returned `Application` directly against
 * supertest without opening a real socket.
 */
import express, { type Application } from 'express';
import type { PaxDatabase } from './db/connection.js';
import { createHealthRouter } from './routes/health.js';

export interface BuildAppDeps {
  database: PaxDatabase;
}

export function buildApp(deps: BuildAppDeps): Application {
  const app = express();

  app.use(express.json());
  app.use(createHealthRouter({ database: deps.database }));

  return app;
}
