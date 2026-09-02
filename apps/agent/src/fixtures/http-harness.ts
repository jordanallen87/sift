/**
 * Shared HTTP integration-test harness: the real Express `Application`
 * (`buildApp`) wired to a real temporary migrated SQLite database
 * (docs/specs/testing.md "HTTP integration tests": "Tests start the real
 * Express application with a migrated temporary SQLite database ...").
 * Used by every `routes/*.test.ts` file so each only needs to describe the
 * one endpoint it is testing.
 */
import type { Application } from 'express';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { buildApp } from '../app.js';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import {
  createRegistryWithSyntheticPack,
  createSequentialIdGenerator,
  fixedClock,
} from './synthetic-pack.js';
import { CommandService } from '../services/command-service.js';
import { RunService, SqliteRunStore } from '../services/run-service.js';
import { SqliteActivityStore } from '../store/activity-store.js';
import { SqliteCaseStore } from '../store/sqlite-case-store.js';
import { SqliteRuntimeEventStore } from '../store/runtime-event-store.js';

export interface HttpTestHarness {
  readonly app: Application;
  /**
   * One already-listening server per harness, and what tests hand to
   * supertest instead of `app`.
   *
   * `request(app)` starts a *fresh* ephemeral-port server for every single
   * request. Across this suite that is ~138 call sites and many hundreds of
   * short-lived listeners. Ephemeral ports are a per-machine resource shared
   * with every other process on the box, and on a busy machine a socket
   * occasionally reaches a port that has already been recycled: tests here
   * have received a `401` and a `403`, statuses this application does not
   * produce on those routes at all. Reusing one listener per harness cuts
   * that exposure by roughly an order of magnitude.
   *
   * This is why `createHttpTestHarness` is async: `listen()` is, and
   * supertest reads `server.address()` synchronously when it builds a
   * request. Returning before the `listening` event would hand it a server
   * with a null address.
   */
  readonly server: Server;
  readonly database: TestDatabase;
  readonly caseStore: SqliteCaseStore;
  readonly activityStore: SqliteActivityStore;
  readonly runStore: SqliteRunStore;
  readonly runtimeEventStore: SqliteRuntimeEventStore;
  cleanup(): void;
}

export interface HttpTestHarnessOptions {
  readonly sseMaxQueueLength?: number;
  /** Passed through to `buildApp`'s `debugEnabled` — lets `routes/debug.test.ts` exercise the "disabled" 404 path without a second harness implementation. Defaults to `true`. */
  readonly debugEnabled?: boolean;
}

export async function createHttpTestHarness(
  options: HttpTestHarnessOptions = {},
): Promise<HttpTestHarness> {
  const database = createTestDatabase();
  applyMigrations(database.sqlite);

  const caseStore = new SqliteCaseStore(database);
  const activityStore = new SqliteActivityStore(database);
  const runStore = new SqliteRunStore(database);
  const runtimeEventStore = new SqliteRuntimeEventStore(database);
  const registry = createRegistryWithSyntheticPack();
  const idGenerator = createSequentialIdGenerator();
  const commandService = new CommandService({
    caseStore,
    activityStore,
    registry,
    clock: fixedClock,
    idGenerator,
  });
  const runService = new RunService({
    caseStore,
    activityStore,
    runStore,
    clock: fixedClock,
    idGenerator,
  });

  const app = buildApp({
    database,
    caseStore,
    activityStore,
    registry,
    commandService,
    runService,
    runStore,
    runtimeEventStore,
    clock: fixedClock,
    debugEnabled: options.debugEnabled ?? true,
    sseHeartbeatIntervalMs: 60_000,
    ...(options.sseMaxQueueLength !== undefined
      ? { sseMaxQueueLength: options.sseMaxQueueLength }
      : {}),
  });

  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    app,
    server,
    database,
    caseStore,
    activityStore,
    runStore,
    runtimeEventStore,
    cleanup: () => {
      // Drop live connections before closing. `close()` alone only stops the
      // server accepting new ones, and a socket that outlives its server is
      // exactly what lets a later listener inherit its port.
      server.closeAllConnections();
      server.close();
      database.cleanup();
    },
  };
}
