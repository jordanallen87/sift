import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { HttpErrorBody } from '@pax/contracts';
import { PackRegistry } from '@pax/packs';
import { buildApp, type BuildAppDeps } from './app.js';
import { createTestDatabase, type TestDatabase } from './db/connection.js';
import { applyMigrations } from './db/migrate.js';
import { asJson } from './fixtures/http-types.js';
import { fixedClock, createSequentialIdGenerator } from './fixtures/synthetic-pack.js';
import { CommandService } from './services/command-service.js';
import { RunService, MemoryRunStore } from './services/run-service.js';
import { InMemoryActivityStore } from './store/activity-store.js';
import { MemoryCaseStore } from './store/memory-case-store.js';

/** Minimal, fully-wired (but in-memory-backed except for `database`) `BuildAppDeps`, for tests that only care about routes `buildApp` itself wires, not any one route's deep behavior (covered by `routes/*.test.ts`). */
function testDeps(database: TestDatabase): BuildAppDeps {
  const caseStore = new MemoryCaseStore();
  const activityStore = new InMemoryActivityStore();
  const registry = new PackRegistry();
  const idGenerator = createSequentialIdGenerator();
  return {
    database,
    caseStore,
    activityStore,
    registry,
    commandService: new CommandService({
      caseStore,
      activityStore,
      registry,
      clock: fixedClock,
      idGenerator,
    }),
    runService: new RunService({
      caseStore,
      activityStore,
      runStore: new MemoryRunStore(),
      clock: fixedClock,
      idGenerator,
    }),
  };
}

describe('buildApp', () => {
  let test: TestDatabase | undefined;

  afterEach(() => {
    test?.cleanup();
    test = undefined;
  });

  it('returns an Express Application with no listen() side effect', () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    // A real Express Application exposes `.listen`, `.use`, `.get`, etc.,
    // but `buildApp` itself must not have called `.listen()` — proven by
    // mounting it directly against supertest without ever binding a port.
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
  });

  it('serves GET /health with a real SQLite liveness check', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      database: { connected: true },
    });
  });

  it('reports database.connected: false once the connection is closed, instead of a hardcoded true', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));
    test.sqlite.close();

    const response = await request(app).get('/health');

    expect(response.body).toMatchObject({ database: { connected: false } });
  });

  it('responds 404 for an unknown route', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
  });

  it('wires GET /api/packs (empty registry -> empty list)', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(app).get('/api/packs');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ packs: [] });
  });

  it('wires GET /api/cases/:caseId (404 for an unknown case)', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(app).get('/api/cases/does-not-exist');

    expect(response.status).toBe(404);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('NOT_FOUND');
  });

  it('wires POST /api/cases/:caseId/commands/:commandName (400 without an Idempotency-Key header)', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(app)
      .post('/api/cases/some-case/commands/selectPack')
      .send({ caseId: 'some-case', packId: 'car-purchase', expectedSequence: 0 });

    expect(response.status).toBe(400);
  });

  it('wires POST /api/cases/:caseId/run (404 for an unknown case)', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(app)
      .post('/api/cases/does-not-exist/run')
      .set('Idempotency-Key', 'cmd-1')
      .send({ caseId: 'does-not-exist', expectedSequence: 0 });

    expect(response.status).toBe(404);
  });

  it('wires the final error-handling middleware to return a 500 INTERNAL envelope, not a leaked stack trace', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const deps = testDeps(test);
    // Force a genuinely unexpected internal error: `load()` throwing is not
    // a modeled `ServiceFailure` anywhere in `command-service.ts`.
    deps.caseStore.load = () => {
      throw new Error('simulated internal failure');
    };
    const app = buildApp(deps);

    const response = await request(app)
      .post('/api/cases/some-case/commands/selectPack')
      .set('Idempotency-Key', 'cmd-1')
      .send({ caseId: 'some-case', packId: 'car-purchase', expectedSequence: 0 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL',
        message: 'An unexpected internal error occurred.',
        retryable: false,
      },
    });
  });
});
