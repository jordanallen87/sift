/**
 * `GET /health` (docs/specs/architecture.md "HTTP service": "`GET /health`
 * for the web deployment"). Returns a simple process-liveness status plus a
 * real SQLite liveness check — a `SELECT 1`-style query actually issued
 * against the live connection, not a hardcoded `true`.
 *
 * Judgment call: the top-level `status` always reports `'ok'` with HTTP
 * `200` as long as the process can handle the request at all (a liveness
 * probe); `database.connected` is the separate, real readiness signal a
 * caller checks to know whether canonical persistence is actually reachable
 * right now. The task text — "a simple healthy status *plus* whether the
 * SQLite connection is alive" — reads as exactly this two-part shape, not a
 * single collapsed pass/fail.
 */
import { Router } from 'express';
import type { PaxDatabase } from '../db/connection.js';

export interface HealthRouterDeps {
  database: PaxDatabase;
}

function isDatabaseAlive(database: PaxDatabase): boolean {
  try {
    // A real query against the live connection: `SELECT 1` fails once the
    // underlying `better-sqlite3` handle is closed or otherwise unusable,
    // which is exactly the condition this check exists to catch.
    database.sqlite.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

export function createHealthRouter(deps: HealthRouterDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      database: { connected: isDatabaseAlive(deps.database) },
    });
  });

  return router;
}
