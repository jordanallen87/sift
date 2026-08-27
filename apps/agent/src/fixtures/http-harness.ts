/**
 * Shared HTTP integration-test harness: the real Express `Application`
 * (`buildApp`) wired to a real temporary migrated SQLite database
 * (docs/specs/testing.md "HTTP integration tests": "Tests start the real
 * Express application with a migrated temporary SQLite database ...").
 * Used by every `routes/*.test.ts` file so each only needs to describe the
 * one endpoint it is testing.
 */
import type { Application } from 'express';
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

export interface HttpTestHarness {
  readonly app: Application;
  readonly database: TestDatabase;
  readonly caseStore: SqliteCaseStore;
  readonly activityStore: SqliteActivityStore;
  cleanup(): void;
}

export interface HttpTestHarnessOptions {
  readonly sseMaxQueueLength?: number;
}

export function createHttpTestHarness(options: HttpTestHarnessOptions = {}): HttpTestHarness {
  const database = createTestDatabase();
  applyMigrations(database.sqlite);

  const caseStore = new SqliteCaseStore(database);
  const activityStore = new SqliteActivityStore(database);
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
    runStore: new SqliteRunStore(database),
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
    sseHeartbeatIntervalMs: 60_000,
    ...(options.sseMaxQueueLength !== undefined
      ? { sseMaxQueueLength: options.sseMaxQueueLength }
      : {}),
  });

  return {
    app,
    database,
    caseStore,
    activityStore,
    cleanup: () => database.cleanup(),
  };
}
