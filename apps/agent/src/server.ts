/**
 * Local/Railway entry point (docs/specs/architecture.md "Deployment":
 * Express serves the API — and eventually the built web app — from one
 * origin). Loads config, runs pending migrations (idempotent — safe on
 * every boot, including every Railway restart/redeploy), builds the
 * Express app via `app.ts`, and listens.
 *
 * `PORT` follows the standard Node/Railway convention (Railway injects it
 * automatically; architecture.md separately notes the AgentCore Strands
 * image listens on `8080`, used here as the local default too) rather than
 * being one of the `.env.example`-documented `PAX_*` variables validated in
 * `config.ts` — see `config.ts`'s module comment for why.
 *
 * `startServer` returns the started `server`/`app`/`database`/`config`
 * instead of only having a side effect, so tests (`server.test.ts`) can
 * start a real instance on an ephemeral port (`{ port: 0 }`) against an
 * isolated temporary data directory and close it deterministically,
 * without depending on this module's `isMain()`-guarded top-level run.
 */
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Application } from 'express';
import { buildApp } from './app.js';
import { loadConfig, type PaxConfig } from './config.js';
import type { PaxDatabase } from './db/connection.js';
import { migrate, type MigrateResult } from './db/migrate.js';

const DEFAULT_PORT = 8080;

export interface StartServerOptions {
  /** Overrides `config.dataDir` — used by tests to point at an isolated temporary directory. */
  dataDir?: string;
  /** Overrides the listen port (`0` binds an OS-assigned ephemeral port, used by tests). Defaults to `PORT` env var, then 8080. */
  port?: number;
}

export interface StartedServer {
  app: Application;
  database: PaxDatabase;
  server: Server;
  config: PaxConfig;
  migration: MigrateResult;
}

export function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  const config = loadConfig();
  const dataDir = options.dataDir ?? config.dataDir;
  const port = options.port ?? Number(process.env['PORT'] ?? DEFAULT_PORT);

  const { database, result: migration } = migrate(dataDir);
  const app = buildApp({ database });

  return new Promise((resolvePromise) => {
    const server = app.listen(port, () => {
      resolvePromise({ app, database, server, config, migration });
    });
  });
}

function isMain(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  startServer()
    .then(({ config, migration, server }) => {
      const address = server.address();
      const port = address !== null && typeof address !== 'string' ? address.port : DEFAULT_PORT;
      console.log(
        `[pax] agent listening on port ${port} ` +
          `(executionTarget=${config.executionTarget}, dataDir=${config.dataDir}, ` +
          `migrationsApplied=${migration.applied.length}, migrationsAlreadyApplied=${migration.alreadyApplied.length})`,
      );
    })
    .catch((error: unknown) => {
      console.error('[pax] agent failed to start:', error);
      process.exitCode = 1;
    });
}
