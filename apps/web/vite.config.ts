/**
 * Vite configuration for `@pax/web` (docs/specs/architecture.md "Runtime
 * components" -> "Browser application"; the locked file map calls this out
 * explicitly in docs/superpowers/plans/2026-08-26-pax-hackathon-build.md
 * Task 9).
 *
 * Two responsibilities beyond the React plugin:
 *
 * 1. Dev-only `/api` proxy to the Express agent service, so the browser app
 *    can call same-origin-shaped `/api/...` paths in development exactly as
 *    it will in production (architecture.md "Deployment": "Express serves
 *    the Vite production build and the Pax API from the same origin ...
 *    Deployed browser requests remain same-origin"). The proxy target port
 *    (8080) matches `apps/agent/src/server.ts`'s `DEFAULT_PORT` -- the local
 *    Express dev server's default listen port.
 * 2. `build.outDir: 'dist'` -- a static output directory Express serves in
 *    production (architecture.md "Deployment").
 *
 * No Node globals (`process`, `path`, `__dirname`) are used here on purpose:
 * `apps/web/tsconfig.json` deliberately sets `"types": []` (browser-only
 * ambient types, see that file's comment history) and
 * `eslint.config.js` grants this whole `apps/web/**` glob only
 * `globals.browser`, not `globals.node` -- see docs/build-log.md's entry for
 * this task for the full rationale. Keeping this file free of Node globals
 * means it type-checks and lints cleanly under that same browser-only
 * configuration without a second Node-flavored tsconfig/eslint carve-out.
 * The `@/*` import alias below (shadcn/ui's standard convention, matching
 * `tsconfig.json`'s own `paths`) is resolved the same Node-global-free way,
 * via the standard `URL`/`import.meta.url` web platform APIs rather than
 * `node:path`'s `__dirname`.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const AGENT_DEV_PROXY_TARGET = 'http://localhost:8080';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: AGENT_DEV_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
