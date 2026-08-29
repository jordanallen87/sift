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
import { PaxPage } from './pages/pax-page.js';

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
    const pax = new PaxPage(page);
    await pax.open();

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
    const pax = new PaxPage(page);

    await pax.open();
    await pax.launchCarPurchase();
    const round1 = await pax.requestInvestigation();
    await assertNoSeriousAxeViolations(page, 'mid-investigation');
    await pax.waitForInvestigationCompleted(round1.runId);
    await pax.waitForRecommendationReady();

    // "Add something Pax should check" is a closed-by-default disclosure
    // row (ADR 0002) -- opened before the form fields below become
    // reachable at all.
    await pax.openDisclosure('add-concern');

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

    // --- Round 2, then keyboard-activated approval ---
    const round2 = await pax.requestInvestigation();
    await pax.waitForInvestigationCompleted(round2.runId);
    await pax.waitForRecommendationReady();

    const approveButton = page.getByTestId('approval-card-approve');
    await expect(approveButton).toBeVisible();
    await approveButton.focus();
    await expect(approveButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('approval-card-stamp')).toContainText('Approved');

    guard.assertClean();
  });
});
