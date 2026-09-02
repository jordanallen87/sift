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
 * being one of the `.env.example`-documented `SIFT_*` variables validated in
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
import { compileCarPurchasePack, compileHomeEnergyGuardianPack, PackRegistry } from '@sift/packs';
import {
  buildCarPurchaseCandidateEntities,
  buildHomeEnergyResponseOptionEntities,
} from '@sift/scenarios';
import { buildApp } from './app.js';
import { loadConfig, type SiftConfig } from './config.js';
import type { SiftDatabase } from './db/connection.js';
import { migrate, type MigrateResult } from './db/migrate.js';
import { carPurchaseCapabilityCatalog } from './runtime/car-purchase-scenario.js';
import { createCarPurchaseEngine } from './runtime/car-purchase-engine.js';
import {
  createHomeEnergyEngine,
  homeEnergyCapabilityCatalog,
} from './runtime/home-energy-engine.js';
import { createSystemClock, createSystemIdGenerator } from './runtime-ports.js';
import { CommandService } from './services/command-service.js';
import { RunPlanService } from './services/run-plan-service.js';
import { SqliteRunPlanStore } from './store/run-plan-store.js';
import { RunService, SqliteRunStore, type InvestigationEngine } from './services/run-service.js';
import { SqliteActivityStore } from './store/activity-store.js';
import { SqliteCaseStore } from './store/sqlite-case-store.js';
import { SqliteRuntimeEventStore } from './store/runtime-event-store.js';

const DEFAULT_PORT = 8080;

export interface StartServerOptions {
  /** Overrides `config.dataDir` — used by tests to point at an isolated temporary directory. */
  dataDir?: string;
  /** Overrides the listen port (`0` binds an OS-assigned ephemeral port, used by tests). Defaults to `PORT` env var, then 8080. */
  port?: number;
}

export interface StartedServer {
  app: Application;
  database: SiftDatabase;
  server: Server;
  config: SiftConfig;
  migration: MigrateResult;
}

export function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  const config = loadConfig();
  const dataDir = options.dataDir ?? config.dataDir;
  const port = options.port ?? Number(process.env['PORT'] ?? DEFAULT_PORT);

  const { database, result: migration } = migrate(dataDir);

  const caseStore = new SqliteCaseStore(database);
  const activityStore = new SqliteActivityStore(database);
  const clock = createSystemClock();
  const idGenerator = createSystemIdGenerator();
  const registry = new PackRegistry();
  // The real `car-purchase` and `home-energy-guardian` Decision Packs,
  // compiled and registered at boot so a real browser session's
  // `POST /api/cases/demo` (`demoId: "car-purchase"` or
  // `"home-energy-guardian"`) and `POST /api/cases/:caseId/run` have
  // something real to run against -- registering `car-purchase` this way
  // was a genuine, confirmed gap an earlier task closed alongside that
  // pack's live run engine (see the dated `docs/build-log.md` entry:
  // without a registered pack, no live case could ever be created at all).
  // `home-energy-guardian`'s identical gap (it was never compiled or
  // registered here at all, so `POST /api/cases/demo {demoId:
  // "home-energy-guardian"}` 404'd even though `apps/web`'s `DemoLauncher`
  // already offered the "Investigate my energy bill" card) is this task's
  // own closure of the same class of bug for the second hero pack.
  const carPurchasePack = compileCarPurchasePack(carPurchaseCapabilityCatalog(), clock);
  registry.register(carPurchasePack);
  const homeEnergyGuardianPack = compileHomeEnergyGuardianPack(
    homeEnergyCapabilityCatalog(),
    clock,
  );
  registry.register(homeEnergyGuardianPack);
  const skillsRootDir = fileURLToPath(new URL('../skills', import.meta.url));

  const runStore = new SqliteRunStore(database);
  const runtimeEventStore = new SqliteRuntimeEventStore(database);
  const carPurchaseEngine = createCarPurchaseEngine({
    caseStore,
    activityStore,
    runStore,
    runtimeEventStore,
    registry,
    clock,
    idGenerator,
    skillsRootDir,
  });
  const homeEnergyEngine = createHomeEnergyEngine({
    caseStore,
    activityStore,
    runStore,
    runtimeEventStore,
    registry,
    clock,
    idGenerator,
    skillsRootDir,
  });
  const engines: Readonly<Record<string, InvestigationEngine>> = {
    [carPurchasePack.identity.id]: carPurchaseEngine,
    [homeEnergyGuardianPack.identity.id]: homeEnergyEngine,
  };

  // The continuous RunPlan. Constructed before `commandService` because
  // the command service is what tells it a person changed something.
  const runPlanService = new RunPlanService({
    caseStore,
    planStore: new SqliteRunPlanStore(database),
    activityStore,
    registry,
    clock,
    idGenerator,
  });

  const commandService = new CommandService({
    caseStore,
    activityStore,
    registry,
    clock,
    idGenerator,
    runPlanRevisor: runPlanService,
    // Real gap closed alongside each pack's live run engine
    // (docs/build-log.md): instantiateCase always seeds entities: [], so
    // without this a freshly started demo case had no candidates/response
    // options for a live "Investigate" click to ever run against or for the
    // resulting recommendation to resolve to a renderable entity.
    demoSeedEntities: {
      'car-purchase': buildCarPurchaseCandidateEntities,
      'home-energy-guardian': buildHomeEnergyResponseOptionEntities,
    },
  });
  const runService = new RunService({
    caseStore,
    activityStore,
    runStore,
    clock,
    idGenerator,
    engines,
    runPlanService,
  });

  const app = buildApp({
    database,
    caseStore,
    activityStore,
    registry,
    commandService,
    runService,
    runPlanService,
    runStore,
    runtimeEventStore,
    clock,
    debugEnabled: config.debugEnabled,
  });

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
        `[sift] agent listening on port ${port} ` +
          `(executionTarget=${config.executionTarget}, dataDir=${config.dataDir}, ` +
          `migrationsApplied=${migration.applied.length}, migrationsAlreadyApplied=${migration.alreadyApplied.length})`,
      );
    })
    .catch((error: unknown) => {
      console.error('[sift] agent failed to start:', error);
      process.exitCode = 1;
    });
}
