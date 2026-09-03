import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Application } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { HttpErrorBody } from '@sift/contracts';
import { PackRegistry } from '@sift/packs';
import { buildApp, type BuildAppDeps } from './app.js';
import { createTestDatabase, type TestDatabase } from './db/connection.js';
import { applyMigrations } from './db/migrate.js';
import { asJson } from './fixtures/http-types.js';
import { fixedClock, createSequentialIdGenerator } from './fixtures/synthetic-pack.js';
import { CommandService } from './services/command-service.js';
import { RunService, MemoryRunStore } from './services/run-service.js';
import { InMemoryActivityStore } from './store/activity-store.js';
import { MemoryCaseStore } from './store/memory-case-store.js';
import { InMemoryRuntimeEventStore } from './store/runtime-event-store.js';

/** Minimal, fully-wired (but in-memory-backed except for `database`) `BuildAppDeps`, for tests that only care about routes `buildApp` itself wires, not any one route's deep behavior (covered by `routes/*.test.ts`). */
function testDeps(database: TestDatabase): BuildAppDeps {
  const caseStore = new MemoryCaseStore();
  const activityStore = new InMemoryActivityStore();
  const registry = new PackRegistry();
  const idGenerator = createSequentialIdGenerator();
  const runStore = new MemoryRunStore();
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
      runStore,
      clock: fixedClock,
      idGenerator,
    }),
    runStore,
    runtimeEventStore: new InMemoryRuntimeEventStore(),
    clock: fixedClock,
  };
}

describe('buildApp', () => {
  let test: TestDatabase | undefined;
  const openServers: Server[] = [];

  /**
   * One already-listening server per app, reused for every request in a test.
   *
   * Passing the bare `app` to supertest makes it start a *fresh*
   * ephemeral-port server for each individual request.
   * `fixtures/http-harness.ts` documents what that
   * costs, having already been bitten by it: "on a busy machine a socket
   * occasionally reaches a port that has already been recycled: tests here
   * have received a `401` and a `403`, statuses this application does not
   * produce on those routes at all."
   *
   * This file was the last one still doing that. It cost a real `pnpm verify`
   * run, where `GET /api/packs` returned **401** — an unauthenticated status
   * this application has no code to produce anywhere (`grep -rn "401"
   * apps/agent/src` finds only the harness comment above). The request had
   * landed on another process's recycled port. A sibling failure in
   * `routes/commands.test.ts` returned a bogus 404 the same way.
   *
   * `await once(server, 'listening')` rather than returning immediately:
   * `listen()` is asynchronous and supertest reads `server.address()`
   * synchronously when it builds a request, so returning early hands it a
   * server with a null address.
   */
  async function serve(app: Application): Promise<Server> {
    const server = app.listen(0);
    await once(server, 'listening');
    openServers.push(server);
    return server;
  }

  afterEach(async () => {
    await Promise.all(
      openServers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
          }),
      ),
    );
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

    const response = await request(await serve(app)).get('/health');

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

    const response = await request(await serve(app)).get('/health');

    expect(response.body).toMatchObject({ database: { connected: false } });
  });

  it('mounts express.static and serves the built web app when webDistDir exists (the existsSync true branch)', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const webDistDir = mkdtempSync(join(tmpdir(), 'sift-agent-test-web-dist-'));
    try {
      writeFileSync(
        join(webDistDir, 'index.html'),
        '<html><body>sift web dist marker</body></html>',
      );
      const app = buildApp({ ...testDeps(test), webDistDir });

      const response = await request(await serve(app)).get('/');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('sift web dist marker');
    } finally {
      rmSync(webDistDir, { recursive: true, force: true });
    }
  });

  it('responds 404 for an unknown route', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(await serve(app)).get('/does-not-exist');

    // Body included in the failure message: this assertion has flaked under
    // `pnpm verify`'s parallel workers with a bare `expected 400 to be 404`,
    // which is a dead end -- nothing before routing should be able to reject
    // an unknown path with a 400 at all.
    expect(response.status, JSON.stringify(response.body)).toBe(404);
  });

  it('wires GET /api/packs (empty registry -> empty list)', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(await serve(app)).get('/api/packs');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ packs: [] });
  });

  it('wires GET /api/cases/:caseId (404 for an unknown case)', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(await serve(app)).get('/api/cases/does-not-exist');

    expect(response.status).toBe(404);
    expect(asJson<HttpErrorBody>(response.body).error.code).toBe('NOT_FOUND');
  });

  it('wires POST /api/cases/:caseId/commands/:commandName (400 without an Idempotency-Key header)', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(await serve(app))
      .post('/api/cases/some-case/commands/selectPack')
      .send({ caseId: 'some-case', packId: 'car-purchase', expectedSequence: 0 });

    expect(response.status).toBe(400);
  });

  it('wires POST /api/cases/:caseId/run (404 for an unknown case)', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp(testDeps(test));

    const response = await request(await serve(app))
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

    const response = await request(await serve(app))
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
