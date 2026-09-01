/**
 * Keyboard operation and accessibility coverage (CLAUDE.md "Playwright
 * visual verification": "keyboard use", "valid focus order"; "Run axe in
 * every required state" -- covers the launcher and mid-investigation
 * states in addition to `car-purchase-journey.spec.ts`'s own scans).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { assertNoSeriousAxeViolations } from './helpers/axe.js';
import { installConsoleGuard } from './helpers/console-guard.js';
import { disableAnimations } from './helpers/layout-assertions.js';
import { isNarrowLayout, SiftPage } from './pages/sift-page.js';

/** Presses Tab (bounded) until `target` is focused, or fails with a clear message -- avoids a magic single-Tab assumption about exactly how many focusable ancestors precede the target. */
async function tabUntilFocused(page: Page, target: Locator, maxPresses = 15): Promise<void> {
  for (let attempt = 0; attempt < maxPresses; attempt += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  const isFocused = await target.evaluate((el) => el === document.activeElement);
  expect(isFocused, `Tab order did not reach the target control within ${maxPresses} presses`).toBe(
    true,
  );
}

test.describe('keyboard operation and accessibility', () => {
  test('the launcher is reachable and operable by keyboard alone, and passes an axe scan', async ({
    page,
  }) => {
    await disableAnimations(page);
    const guard = installConsoleGuard(page);
    const sift = new SiftPage(page);
    await sift.open();

    await assertNoSeriousAxeViolations(page, 'launcher (initial load)');

    const target = page.getByTestId('demo-launcher-car-purchase');
    await tabUntilFocused(page, target);
    await expect(target).toBeFocused();

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/api/cases/demo') && res.request().method() === 'POST',
      ),
      page.keyboard.press('Enter'),
    ]);
    expect(response.ok()).toBe(true);
    await expect(page.getByTestId('case-workspace')).toBeVisible();

    guard.assertClean();
  });

  test('the custom concern form and the pending approval are both fully keyboard-operable', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await disableAnimations(page);
    const guard = installConsoleGuard(page);
    const sift = new SiftPage(page);

    await sift.open();
    await sift.launchCarPurchase();
    const round1 = await sift.requestInvestigation();
    await assertNoSeriousAxeViolations(page, 'mid-investigation');
    await sift.waitForInvestigationCompleted(round1.runId);
    await sift.waitForRecommendationReady();

    // "Add a question" is reached differently per layout (ADR 0008): a
    // closed-by-default disclosure row in pane mode (ADR 0002), or a
    // main-column toolbar Sheet in web-app mode -- `openAddConcern` picks
    // the right one for the current viewport before the form fields below
    // become reachable at all.
    await sift.openAddConcern();

    // --- Fill CustomConcernForm using real keystrokes, not `.fill()` ---
    const form = page.getByTestId('custom-concern-form');
    await form.getByLabel('Concern id').focus();
    await page.keyboard.type('dog_crate_fit');
    await form.getByLabel('Label', { exact: true }).focus();
    await page.keyboard.type('Both dog crates fit behind the second row');
    await form.getByLabel('Value type').selectOption('boolean');
    await form.getByLabel('Evidence expectation').selectOption('verification');
    await form.getByLabel('Why this matters to you').focus();
    await page.keyboard.type(
      'The household needs two 36in x 24in x 27in dog travel crates to fit behind the second row.',
    );

    const submit = form.getByTestId('custom-concern-form-submit');
    await tabUntilFocused(page, submit);
    await page.keyboard.press('Enter');
    await expect(form.getByTestId('custom-concern-form-success')).toBeVisible();

    // Web-app mode's "Add a question" region is a real modal Sheet (ADR
    // 0008): closed here via Escape, not a click -- keeps this journey
    // fully keyboard-operable end to end, and a still-open modal would
    // otherwise intercept the "Request investigation" click below. Pane
    // mode's disclosure has no modal to close.
    if (!isNarrowLayout(page)) {
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('workspace-add-concern-sheet')).not.toBeVisible();
    }

    // --- Round 2, then keyboard-activated approval ---
    const round2 = await sift.requestInvestigation();
    await sift.waitForInvestigationCompleted(round2.runId);
    await sift.waitForRecommendationReady();

    const approveButton = page.getByTestId('approval-card-approve');
    await expect(approveButton).toBeVisible();
    await approveButton.focus();
    await expect(approveButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('approval-card-stamp')).toContainText('Approved');

    guard.assertClean();
  });
});
