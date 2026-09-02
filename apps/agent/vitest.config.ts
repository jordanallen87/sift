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
     * Nearly every test here drives the real Express app through supertest,
     * which starts an ephemeral-port server per request, and
     * `events.sse.test.ts` opens genuine long-lived SSE connections.
     * Ephemeral ports are a per-machine resource shared across Vitest's
     * worker *processes*, so two files running concurrently can end up with
     * one binding a port the other's socket is still using -- and a request
     * lands on the wrong app.
     *
     * That produced a long-standing intermittent failure that looked
     * impossible in isolation: a 200 for a request deliberately sent with no
     * idempotency key, a 400 where a 404 was expected, a 409 arriving as a
     * 400, snapshots with empty entity arrays. Each one was a test receiving
     * the response to a request another file had sent.
     *
     * Measured, not assumed. `apps/agent/src/routes` with parallelism failed
     * roughly one run in three; with `--no-file-parallelism` it was clean
     * 5/5; excluding only the SSE file (with parallelism on) was also clean
     * 5/5. Destroying that file's lingering client sockets -- a real defect,
     * fixed in the same change -- cut the rate to about one in eight but
     * could not remove it, because supertest's own per-request servers
     * contend for the same resource.
     *
     * Cost: this project goes from ~6s to ~26s. Every test still runs with
     * every assertion intact; only the scheduling changes. The other
     * projects (web, contracts, core, packs, scenarios) touch no ports and
     * keep full parallelism, so `pnpm test:unit` overall stays fast.
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
