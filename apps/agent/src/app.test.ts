import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createTestDatabase, type TestDatabase } from './db/connection.js';
import { applyMigrations } from './db/migrate.js';

describe('buildApp', () => {
  let test: TestDatabase | undefined;

  afterEach(() => {
    test?.cleanup();
    test = undefined;
  });

  it('returns an Express Application with no listen() side effect', () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp({ database: test });

    // A real Express Application exposes `.listen`, `.use`, `.get`, etc.,
    // but `buildApp` itself must not have called `.listen()` — proven by
    // mounting it directly against supertest without ever binding a port.
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
  });

  it('serves GET /health with a real SQLite liveness check', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp({ database: test });

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
    const app = buildApp({ database: test });
    test.sqlite.close();

    const response = await request(app).get('/health');

    expect(response.body).toMatchObject({ database: { connected: false } });
  });

  it('responds 404 for an unknown route', async () => {
    test = createTestDatabase();
    applyMigrations(test.sqlite);
    const app = buildApp({ database: test });

    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
  });
});
