import { defineConfig, devices } from '@playwright/test';

// Minimal Task 1 skeleton. Task 12 wires this up fully against the real
// Express + Vite production build (tests/e2e/helpers/test-server.ts) and adds
// the actual specs, checked-in screenshots, and console/network guards
// required by docs/specs/testing.md. `pnpm test:e2e` intentionally prints
// "not yet implemented" until that task lands rather than running this
// config against a web app that does not exist yet.
//
// Viewports match docs/specs/testing.md: `right-pane` is the canonical
// visual acceptance surface at 390x844, 430x900, and 480x900; `desktop` is
// the secondary project at 1440x1000.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/verification/playwright-report', open: 'never' }],
  ],
  outputDir: 'artifacts/verification/test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  // webServer: {
  //   command: 'pnpm --filter @pax/agent start', // serves the built web app + API together (Task 14 contract)
  //   url: 'http://localhost:8080/health',
  //   reuseExistingServer: !process.env['CI'],
  //   timeout: 60_000,
  // },
});
