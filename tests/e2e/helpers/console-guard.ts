/**
 * Fails a test on any uncaught page exception, unexpected console error, or
 * failed same-origin `/api/*` request (docs/engineering-principles.md "Playwright visual
 * verification": "Fail on page exceptions, unexpected console errors,
 * failed API calls, or hydration warnings").
 *
 * On "hydration warnings": `@sift/web` is a plain client-rendered Vite/React
 * SPA (`apps/web/src/main.tsx` calls `createRoot(...).render(...)`, never
 * `hydrateRoot`) -- there is no server-rendered markup for the client to
 * reconcile against, so there is no hydration step and no distinct
 * "hydration warning" class of message to special-case. React still logs a
 * genuine rendering problem (e.g. a key warning, a controlled/uncontrolled
 * input mismatch) as a `console.error`, which this guard already fails the
 * test on -- the requirement is covered, not skipped.
 *
 * Attach once per test via `installConsoleGuard(page)`, call `assertClean()`
 * at the end of the test (or register it as a fixture teardown). A test
 * that deliberately triggers a real HTTP failure (the error-recovery spec)
 * calls `allowApiFailure(...)` first so that expected failure is not
 * reported as a guard violation.
 */
import type { ConsoleMessage, Page } from '@playwright/test';

export interface ConsoleGuard {
  readonly pageErrors: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly failedApiRequests: readonly string[];
  /** Marks a same-origin `/api/*` response matching `matcher(url, status)` as an expected failure -- excluded from `assertClean()`. */
  allowApiFailure(matcher: (url: string, status: number) => boolean): void;
  /** Throws (with every collected problem in the message) if anything unexpected was recorded since the guard was installed. */
  assertClean(): void;
}

export function installConsoleGuard(page: Page): ConsoleGuard {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedApiRequests: string[] = [];
  // A `409 CONFLICT` on `POST .../run` is allowed by default, everywhere:
  // `App.tsx`'s `handleRequestInvestigation` automatically retries it once
  // using the conflict envelope's own `actualSequence`
  // (architecture.md "Commands use optimistic concurrency": "A stale
  // `eventSequence` produces HTTP `409`" -- a real, expected, self-healing
  // race in a real-time system, not a defect; proven by a dedicated unit
  // test in `apps/web/src/app/App.test.tsx`). Every other conflict/failure
  // remains reported -- a spec that deliberately manufactures one of those
  // (`error-recovery.spec.ts`) still calls `allowApiFailure` itself.
  const allowlist: ((url: string, status: number) => boolean)[] = [
    (url, status) => status === 409 && /\/api\/cases\/[^/]+\/run$/.test(url),
  ];

  page.on('pageerror', (error: Error) => {
    pageErrors.push(error.stack ?? error.message);
  });

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    // A failed `fetch`/XHR also produces the browser's own generic
    // "Failed to load resource: the server responded with a status of NNN"
    // console line, independent of the `response` listener below --
    // `allowApiFailure`'s matcher governs both, so a deliberately-triggered
    // expected failure (the error-recovery/reload-persistence specs) is not
    // reported twice under two different guard buckets.
    const resourceFailureMatch = /Failed to load resource.*status of (\d{3})/.exec(message.text());
    if (resourceFailureMatch) {
      const status = Number(resourceFailureMatch[1]);
      const url = message.location().url;
      if (allowlist.some((matcher) => matcher(url, status))) return;
    }
    consoleErrors.push(message.text());
  });

  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const status = response.status();
    if (status < 400) return;
    if (allowlist.some((matcher) => matcher(url, status))) return;
    failedApiRequests.push(`${status} ${response.request().method()} ${url}`);
  });

  return {
    pageErrors,
    consoleErrors,
    failedApiRequests,
    allowApiFailure(matcher) {
      allowlist.push(matcher);
    },
    assertClean() {
      const problems: string[] = [];
      if (pageErrors.length > 0) {
        problems.push(`Uncaught page error(s):\n${pageErrors.join('\n---\n')}`);
      }
      if (consoleErrors.length > 0) {
        problems.push(`Unexpected console error(s):\n${consoleErrors.join('\n---\n')}`);
      }
      if (failedApiRequests.length > 0) {
        problems.push(`Unexpected failed API request(s):\n${failedApiRequests.join('\n')}`);
      }
      if (problems.length > 0) {
        throw new Error(problems.join('\n\n'));
      }
    },
  };
}
