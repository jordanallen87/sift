/**
 * Boots the real production Pax server for `pnpm test:e2e`
 * (docs/specs/testing.md "Browser E2E tests": "Playwright starts the real
 * web and agent services with deterministic fixtures").
 *
 * Invoked directly as `playwright.config.ts`'s `webServer.command` -- this
 * is a plain executable script, not a test file itself; Playwright owns
 * this process's lifecycle (spawns it before the suite runs, sends it
 * `SIGTERM` once every project finishes).
 *
 * This calls the exact same `startServer()` `apps/agent/src/server.ts`
 * exports and `server.test.ts` already exercises -- real migrated SQLite
 * (`better-sqlite3`), the real Express `Application` (`app.ts`, including
 * this task's static-hosting addition serving `apps/web/dist`), and the
 * real `car-purchase` engine. That engine's model provider is *always* the
 * scripted, deterministic one (`car-purchase-engine.ts`'s own header
 * comment: `buildCarPurchaseScriptedProviders()` is unconditional, not
 * gated by `PAX_EXECUTION_TARGET` or any live-model flag), so this whole
 * suite genuinely runs offline and deterministically without a test-only
 * server branch or a mocked model anywhere in this process.
 *
 * Isolation: every invocation gets a fresh temporary `PAX_DATA_DIR`
 * (`mkdtempSync`), so `pnpm test:e2e` never touches a developer's real
 * `.pax-data/pax.sqlite` and two separate runs never see each other's
 * cases. All four Playwright viewport projects and every spec file share
 * this one server process/database for the run (matching how Playwright's
 * `webServer` is started once per `playwright test` invocation, not once
 * per project) -- safe because every spec creates its own fresh case via
 * `startDemo` rather than assuming a particular caseId.
 *
 * Fixed port 8080 matches `playwright.config.ts`'s `webServer.url` and
 * `apps/agent/src/server.ts`'s own `DEFAULT_PORT`/Railway convention.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../../apps/agent/src/server.js';

const PORT = 8080;

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), 'pax-e2e-'));

  // Best-effort cleanup: an OS temp directory left behind after a killed
  // process is clutter, not a correctness problem, so failures here are
  // swallowed rather than surfaced.
  const cleanup = (): void => {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };
  process.once('exit', cleanup);

  // `StartedServer.config` reflects `loadConfig()`'s env-derived defaults,
  // not this call's own `dataDir` override (see `server.ts`'s
  // `startServer` -- `config` is returned as-loaded; only the local
  // `dataDir` variable there actually drives `migrate()`/the real stores).
  // Logging the real `dataDir` computed above, not `config.dataDir`, keeps
  // this diagnostic line honest about which directory is actually in use.
  const { migration, server } = await startServer({ dataDir, port: PORT });
  const address = server.address();
  const boundPort = address !== null && typeof address !== 'string' ? address.port : PORT;
  console.log(
    `[pax:e2e] test server listening on port ${boundPort} ` +
      `(dataDir=${dataDir}, migrationsApplied=${migration.applied.length}, ` +
      `migrationsAlreadyApplied=${migration.alreadyApplied.length})`,
  );
}

main().catch((error: unknown) => {
  console.error('[pax:e2e] failed to start the test server:', error);
  process.exitCode = 1;
});
