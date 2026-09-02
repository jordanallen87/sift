import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    dataDir = mkdtempSync(join(tmpdir(), 'sift-server-test-'));
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
    dataDir = mkdtempSync(join(tmpdir(), 'sift-server-test-'));
    const first = await startServer({ port: 0, dataDir });
    await new Promise<void>((resolve) => first.server.close(() => resolve()));
    first.database.close();

    started = await startServer({ port: 0, dataDir });
    expect(started.migration.applied).toEqual([]);
    expect(started.migration.alreadyApplied).toEqual(['0001_initial.sql', '0002_run_plans.sql']);
  });

  it('falls back to config.dataDir and to a PORT read from the environment when neither StartServerOptions field is given (every other test above always passes both explicitly)', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'sift-server-test-'));
    const previousDataDir = process.env['SIFT_DATA_DIR'];
    const previousPort = process.env['PORT'];
    // PORT=0 (not omitted) so this still binds a real ephemeral OS-assigned
    // port -- a fixed, non-zero PORT would risk colliding with another
    // process's own listener (this repo runs several agents' vitest suites
    // concurrently right now).
    process.env['SIFT_DATA_DIR'] = dataDir;
    process.env['PORT'] = '0';
    try {
      started = await startServer({});
    } finally {
      if (previousDataDir === undefined) delete process.env['SIFT_DATA_DIR'];
      else process.env['SIFT_DATA_DIR'] = previousDataDir;
      if (previousPort === undefined) delete process.env['PORT'];
      else process.env['PORT'] = previousPort;
    }

    expect(started.config.dataDir).toBe(dataDir);
    const address = started.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected server to bind a real TCP address');
    }
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(response.status).toBe(200);
  });

  // The DEFAULT_PORT (8080) fallback sub-branch of `Number(process.env['PORT']
  // ?? DEFAULT_PORT)` is deliberately not covered: proving it requires a real
  // process.env['PORT'] genuinely unset *and* no `port` option, which would
  // bind the real, non-ephemeral port 8080 -- unsafe here since this repo
  // runs several agents' vitest suites concurrently right now (a genuine
  // port collision with another concurrently-running process is a real,
  // not merely theoretical, risk).

  it("runs the real CLI entrypoint (isMain() true) when invoked directly as the main module via tsx, logging its bound port -- startServer() alone (every test above) never exercises server.ts's own top-level `if (isMain())` block", async () => {
    const dataDirForCli = mkdtempSync(join(tmpdir(), 'sift-server-cli-test-'));
    const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../..');
    const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');
    const serverEntry = join(repoRoot, 'apps', 'agent', 'src', 'server.ts');

    const child = spawn(tsxBin, [serverEntry], {
      cwd: join(repoRoot, 'apps', 'agent'),
      env: { ...process.env, PORT: '0', SIFT_DATA_DIR: dataDirForCli },
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    try {
      await new Promise<void>((resolveWait, rejectWait) => {
        const timer = setTimeout(() => {
          rejectWait(
            new Error(
              `CLI entrypoint did not log its listening line in time.\nstdout: ${stdout}\nstderr: ${stderr}`,
            ),
          );
        }, 15_000);
        child.stdout?.on('data', () => {
          if (/\[sift\] agent listening on port \d+/.test(stdout)) {
            clearTimeout(timer);
            resolveWait();
          }
        });
        child.on('exit', (code) => {
          clearTimeout(timer);
          rejectWait(
            new Error(
              `CLI entrypoint exited early (code ${code}).\nstdout: ${stdout}\nstderr: ${stderr}`,
            ),
          );
        });
      });

      expect(stdout).toMatch(
        /\[sift\] agent listening on port \d+ \(executionTarget=local, dataDir=.*, migrationsApplied=\d+, migrationsAlreadyApplied=\d+\)/,
      );
    } finally {
      child.kill('SIGTERM');
      await new Promise<void>((resolveClose) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolveClose();
          return;
        }
        child.on('close', () => resolveClose());
      });
      rmSync(dataDirForCli, { recursive: true, force: true });
    }
  }, 20_000);
});
