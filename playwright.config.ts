import { defineConfig, devices } from '@playwright/test';

// Task 12: wired against the real Express + Vite production build.
// `tests/e2e/helpers/test-server.ts` boots the actual `startServer()` from
// `apps/agent/src/server.ts` (real SQLite, real Strands Graph via the
// scripted car-purchase providers `car-purchase-engine.ts` always uses --
// see that file's own header comment -- so this is genuinely offline and
// deterministic, not a fixture stand-in) against an isolated temporary
// `SIFT_DATA_DIR`, on the fixed port `8080` `apps/agent/src/server.ts`
// defaults to. `apps/web`'s production bundle must be built first
// (`pnpm --filter @sift/web build`, wired into `test:e2e`'s `package.json`
// script rather than into this `command` so a plain `playwright test`
// invocation and `playwright show-report` reruns do not silently rebuild
// stale output) -- `app.ts`'s static-hosting addition then serves that
// `dist/` alongside the API from the same origin, matching
// docs/specs/architecture.md "Deployment": "Express serves the Vite
// production build and the Sift API from the same origin."
//
// Viewports match docs/specs/testing.md: `right-pane` is the canonical
// visual acceptance surface at 390x844, 430x900, and 480x900; `desktop` is
// the secondary project at 1440x1000. Every spec under `tests/e2e` runs
// against all four projects.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/verification/playwright-report', open: 'never' }],
    ['json', { outputFile: 'artifacts/verification/playwright-report/results.json' }],
  ],
  outputDir: 'artifacts/verification/test-results',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Deterministic release evidence (CLAUDE.md "Playwright visual
    // verification": "Capture named visual baselines with deterministic
    // fonts, clocks, IDs, and animations disabled"). CSS animations/
    // transitions are additionally force-disabled per-page in
    // `helpers/sift-page.ts` so a slow CI runner never races a mid-transition
    // screenshot.
    launchOptions: {
      // Consistent, judge-machine-independent font metrics for any pixel
      // comparison a later task adds on top of this gate.
      args: ['--font-render-hinting=none'],
    },
  },
  projects: [
    {
      name: 'right-pane-390',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'right-pane-430',
      use: { ...devices['Desktop Chrome'], viewport: { width: 430, height: 900 } },
    },
    {
      name: 'right-pane-480',
      use: { ...devices['Desktop Chrome'], viewport: { width: 480, height: 900 } },
    },
    {
      /**
       * ChatGPT's own side pane, and the reason this project exists.
       *
       * The matrix used to run 390/430/480/1440 and step straight over the
       * band from 481 to ~765, where the expanded layout rendered a 300px
       * sidebar plus a ~360px card into a 284px main column and tore its
       * content across the right edge. The single most important viewport
       * this product has was in that gap the whole time, and no gate could
       * see it: `html, body { overflow-x: hidden }` hides the symptom from
       * any document-level check.
       *
       * Testing the widths a product is designed for is not the same as
       * testing the widths it is used at.
       */
      name: 'chatgpt-pane-640',
      use: { ...devices['Desktop Chrome'], viewport: { width: 640, height: 900 } },
    },
    {
      /**
       * Just above `NARROW_MAX_WIDTH_PX` (800), so the expanded layout is
       * exercised at the narrowest width it is ever allowed to render at --
       * the width where it is most likely to break first.
       */
      name: 'expanded-820',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 900 } },
    },
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: {
    command: 'tsx tests/e2e/helpers/test-server.ts',
    url: 'http://127.0.0.1:8080/health',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
