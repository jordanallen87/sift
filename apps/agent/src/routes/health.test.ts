import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { createHealthRouter } from './health.js';

describe('createHealthRouter', () => {
  let test: TestDatabase | undefined;

  afterEach(() => {
    test?.cleanup();
    test = undefined;
  });

  it('reports status ok and database.connected true when SELECT 1 actually succeeds', async () => {
    test = createTestDatabase();
    const app = express();
    app.use(createHealthRouter({ database: test }));

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: { connected: true } });
  });

  it('performs a real SELECT-1-style query rather than a hardcoded true', async () => {
    test = createTestDatabase();
    let queried = false;
    // Wrap the real prepare() to prove the route actually issues a query
    // against the connection, instead of returning a constant.
    const originalPrepare = test.sqlite.prepare.bind(test.sqlite);
    test.sqlite.prepare = (sql: string) => {
      queried = true;
      return originalPrepare(sql);
    };

    const app = express();
    app.use(createHealthRouter({ database: test }));
    await request(app).get('/health');

    expect(queried).toBe(true);
  });

  it('reports database.connected: false, still with a 200 status, when the connection is closed', async () => {
    test = createTestDatabase();
    test.sqlite.close();
    const app = express();
    app.use(createHealthRouter({ database: test }));

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: { connected: false } });
  });
});
