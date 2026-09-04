/**
 * Reload persistence (docs/engineering-principles.md "Playwright visual verification": "reload
 * persistence"; docs/specs/testing.md "persistence after reload").
 *
 * `App.tsx` only ever remembers a *pointer* to the active case id
 * (`apps/web/src/app/active-case-storage.ts`, `localStorage`); every field
 * of the restored case is always re-fetched fresh from the real server
 * (`GET /api/cases/:caseId` to confirm the id, then `useCaseEvents`'s own
 * initial poll for the full canonical snapshot and activity backlog) --
 * never trusted from stale in-memory/local state. A real full-page
 * `page.reload()` proves this by construction: it discards every byte of
 * React state, so anything that reappears genuinely came back from the
 * server.
 */
import { expect, test } from '@playwright/test';
import { installConsoleGuard } from './helpers/console-guard.js';
import { disableAnimations } from './helpers/layout-assertions.js';
import { SiftPage } from './pages/sift-page.js';

test.describe('reload persistence', () => {
  test('a mid-case reload restores case state from the server, not local state', async ({
    page,
  }) => {
    await disableAnimations(page);
    const guard = installConsoleGuard(page);
    const sift = new SiftPage(page);

    await sift.open();
    const { caseId } = await sift.launchCarPurchase();
    const round1 = await sift.requestInvestigation();
    await sift.waitForInvestigationCompleted(round1.runId);
    await sift.waitForRecommendationReady();

    const titleBefore = await page.getByTestId('workspace-app-bar-title').textContent();
    const rationaleBefore = await page.getByTestId('recommendation-card-rationale').textContent();
    expect(titleBefore, 'a real title must exist before reload').toBeTruthy();
    expect(
      rationaleBefore,
      'a real recommendation rationale must exist before reload',
    ).toBeTruthy();

    // The Decision Pack badge left the consumer surface entirely
    // (`docs/decisions/0004-consumer-workspace-information-architecture.md`
    // decision item 1) -- confirmed absent before reload too, so the
    // negative assertion after reload below is a genuine "still absent"
    // proof, not merely "never existed to begin with here."
    await expect(page.getByTestId('workspace-app-bar-pack-badge')).toHaveCount(0);

    // Track every "start a new case" call across the reload -- if
    // restoration accidentally fell back to creating a fresh case instead
    // of restoring the real one, this would fire again after the reload.
    const demoStartCalls: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/cases/demo')) {
        demoStartCalls.push(request.url());
      }
    });

    await page.reload();

    // Never flashes the plain launcher while the stored caseId is being
    // verified against the server.
    await expect(page.getByTestId('demo-launcher')).not.toBeVisible();

    await expect(page.getByTestId('workspace-app-bar')).toBeVisible({ timeout: 15_000 });
    expect(await page.getByTestId('workspace-app-bar-title').textContent()).toBe(titleBefore);
    await expect(page.getByTestId('workspace-app-bar-pack-badge')).toHaveCount(0);
    await expect(page.getByTestId('recommendation-card-rationale')).toHaveText(
      rationaleBefore ?? '',
    );

    // The activity backlog (not just the canonical snapshot) also came back
    // from the server -- the poll-fallback/initial-load endpoint returns
    // both together.
    //
    // This used to be proven by opening "Sift's work so far" (a
    // closed-by-default disclosure row wrapping `ActivityTimeline`) and
    // counting its rendered items. `docs/decisions/
    // 0004-consumer-workspace-information-architecture.md` decision item
    // 3/4 moved that raw chronological ledger off the consumer surface
    // entirely -- confirmed gone from the DOM below, not merely closed.
    // `LiveRunStatus`, now embedded directly in the answer-first hero, is
    // the replacement proof: it is driven purely by real streamed/replayed
    // `PublicActivityEvent`s correlated to a receipt `App.tsx`'s
    // `deriveReceiptFromEvents` derives from that same replayed history. If
    // only the canonical snapshot had come back and the activity backlog
    // had not, `liveRunStatusReceipt` would stay `null` and this region
    // would render nothing at all (`LiveRunStatus.tsx`'s own "renders
    // nothing before any command" contract) -- so a populated, "Completed"
    // `LiveRunStatus` after a hard reload is real, positive proof the full
    // backlog round-tripped through the server, not just the snapshot.
    await expect(page.getByTestId('disclosure-work-so-far')).toHaveCount(0);
    await expect(page.getByTestId('activity-timeline')).toHaveCount(0);
    await expect(page.getByTestId('live-run-status')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('live-run-status-phase')).toHaveText(/completed/i, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('live-run-status-summary')).not.toBeEmpty();

    expect(demoStartCalls, 'reload must restore the existing case, not start a new one').toEqual(
      [],
    );

    // The case really is the one restored, confirmed via the real API.
    const response = await page.request.get(`/api/cases/${caseId}`);
    expect(response.ok()).toBe(true);

    guard.assertClean();
  });

  test('an invalid stored caseId is discarded and falls back to the launcher', async ({ page }) => {
    await disableAnimations(page);
    const guard = installConsoleGuard(page);
    guard.allowApiFailure(
      (url, status) => url.includes('/api/cases/case-does-not-exist') && status === 404,
    );

    const sift = new SiftPage(page);
    await sift.open();

    await page.evaluate(() => {
      localStorage.setItem('sift:activeCaseId', 'case-does-not-exist');
    });
    await page.reload();

    await expect(page.getByTestId('demo-launcher')).toBeVisible({ timeout: 15_000 });
    const stored = await page.evaluate(() => localStorage.getItem('sift:activeCaseId'));
    expect(stored).toBeNull();

    guard.assertClean();
  });
});
