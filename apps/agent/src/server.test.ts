import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer, type StartedServer } from './server.js';

describe('startServer', () => {
  let started: StartedServer | undefined;
  let dataDir: string | undefined;

  afterEach(async () => {
    if (started) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
      started.database.close();
    }
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    started = undefined;
    dataDir = undefined;
  });

  it('runs migrations, then listens and actually serves GET /health over a real socket', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'pax-server-test-'));
    started = await startServer({ port: 0, dataDir });

    const address = started.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected server to bind a real TCP address');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = (await response.json()) as { status: string; database: { connected: boolean } };

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.database.connected).toBe(true);
  });

  it('is safe to run twice against the same data directory (idempotent migrations on every boot)', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'pax-server-test-'));
    const first = await startServer({ port: 0, dataDir });
    await new Promise<void>((resolve) => first.server.close(() => resolve()));
    first.database.close();

    started = await startServer({ port: 0, dataDir });
    expect(started.migration.applied).toEqual([]);
    expect(started.migration.alreadyApplied).toEqual(['0001_initial.sql']);
  });
});
