import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// See apps/web/vitest.config.ts's comment: `root: '.'` resolves against the
// process cwd, not this file's own directory, when aggregated via the root
// config's `test.projects` -- an absolute path keeps this project correctly
// self-scoped regardless of invocation directory.
const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'agent',
    root: packageRoot,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    /**
     * This project's tests bind real TCP ports, so its files must not run
     * against each other.
     *
     * Ephemeral ports are a per-machine resource shared with every other
     * process on the box, and Vitest's workers are separate OS processes.
     * When two of this project's files run concurrently, a socket can reach
     * a port that has already been recycled — and a request lands somewhere
     * it was never sent. That produced a long-standing intermittent failure
     * whose symptoms were impossible to explain in isolation: a 200 for a
     * request deliberately sent with no idempotency key, a 400 where a 404
     * was expected, snapshots with empty entity arrays, and — conclusively —
     * a `401` and a `403`, statuses this application does not produce on the
     * routes that received them.
     *
     * Three fixes, each measured, and all three were needed:
     *
     * 1. `events.sse.test.ts` opened real SSE client sockets and never
     *    destroyed them. `Server.close()` stops a server *accepting*
     *    connections but does not terminate open ones, so a client socket
     *    outlived its server and its port could be recycled while still in
     *    use. Rate: ~1 in 3 runs → ~1 in 8.
     * 2. `createHttpTestHarness` now holds one already-listening server per
     *    harness instead of letting supertest start a fresh ephemeral-port
     *    server per request (~138 call sites, many hundreds of listeners).
     *    This is why that factory is async: `listen()` is, and supertest
     *    reads `server.address()` synchronously.
     * 3. This flag. Removing it after fix 2 still failed 1 run in 8; with
     *    it, 10 consecutive clean runs.
     *
     * Cost: this project goes from ~6s to ~26s. Every test still runs with
     * every assertion intact; only the scheduling changes. The other
     * projects touch no ports and keep full parallelism.
     */
    fileParallelism: false,
    coverage: {
      // Mirrors the root `vitest.config.ts`'s coverage `exclude` so a
      // package-scoped `pnpm --filter @sift/agent test --coverage` run
      // reports the same meaningful percentages as the aggregated
      // `pnpm test:unit` run: test-support code under `src/fixtures/`
      // (synthetic packs, HTTP test harnesses, shared contract-test
      // helpers) is exercised incidentally by every test file that imports
      // it, not directly tested, and its own TypeScript-narrowing
      // `if (...) throw` guards are never taken in a passing run --
      // counting those against coverage would be misleading, exactly like
      // excluding `*.test.ts` files' own bodies already is.
      exclude: ['**/dist/**', '**/*.config.*', '**/*.test.ts', '**/fixtures/**'],
    },
  },
});
