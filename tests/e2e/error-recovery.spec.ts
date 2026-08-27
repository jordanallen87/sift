/**
 * Real error-path coverage (CLAUDE.md "Playwright visual verification":
 * "errors"; docs/specs/testing.md "network interruption and recovery").
 *
 * A conflict is deterministically manufactured, not raced: `page.route`
 * rewrites the real `defineCaseAttribute` request's `expectedSequence` to a
 * value the server no longer accepts before letting the request continue.
 * Both sides of the exchange are genuine -- the server's real
 * `loadForMutation` conflict check (`command-service.ts`) and the client's
 * real `.catch()` -> `setError(...)` rendering path
 * (`CustomConcernForm.tsx`) -- only the *input* (a stale sequence number)
 * is engineered, which is the only way to hit this path deterministically;
 * a genuine two-actor race would be flaky by construction and CLAUDE.md
 * prohibits flaky release-gate tests.
 */
import { expect, test } from '@playwright/test';
import { installConsoleGuard } from './helpers/console-guard.js';
import { disableAnimations } from './helpers/layout-assertions.js';
import { getCaseState, PaxPage, postCommand } from './pages/pax-page.js';

test.describe('error recovery', () => {
  test('a real 409 conflict surfaces in the UI, and the case remains usable afterward', async ({
    page,
  }) => {
    await disableAnimations(page);
    const guard = installConsoleGuard(page);
    guard.allowApiFailure(
      (url, status) => url.includes('/commands/defineCaseAttribute') && status === 409,
    );

    const pax = new PaxPage(page);
    await pax.open();
    const { caseId } = await pax.launchCarPurchase();

    await page.route('**/api/cases/*/commands/defineCaseAttribute', async (route) => {
      const original = route.request().postDataJSON() as Record<string, unknown>;
      await route.continue({ postData: JSON.stringify({ ...original, expectedSequence: 0 }) });
    });

    const concern = {
      slug: 'stale_conflict_test',
      label: 'A concern submitted with a stale sequence',
      reason: 'Deterministically forces a real 409 CONFLICT from the server.',
    };
    await pax.fillAndSubmitCustomConcern(concern);

    const form = page.getByTestId('custom-concern-form');
    await expect(form.getByTestId('custom-concern-form-error')).toBeVisible();
    const errorText = await form.getByTestId('custom-concern-form-error').textContent();
    expect(errorText?.length ?? 0).toBeGreaterThan(0);
    // The rejected attempt never applied -- the case must not carry a
    // "custom.stale_conflict_test" extension.
    const stateAfterConflict = await getCaseState(page.request, caseId);
    expect(
      (stateAfterConflict['caseExtensions'] as { definition: { id: string } }[]).some(
        (extension) => extension.definition.id === 'custom.stale_conflict_test',
      ),
    ).toBe(false);

    // The case remains fully usable: the interception removed, an identical
    // retry succeeds through the same real UI.
    await page.unroute('**/api/cases/*/commands/defineCaseAttribute');
    await pax.submitCustomConcern(concern);

    const stateAfterRetry = await getCaseState(page.request, caseId);
    expect(
      (stateAfterRetry['caseExtensions'] as { definition: { id: string } }[]).some(
        (extension) => extension.definition.id === 'custom.stale_conflict_test',
      ),
    ).toBe(true);

    guard.assertClean();
  });

  test('the real command HTTP endpoint returns a structurally correct 409 conflict envelope', async ({
    page,
  }) => {
    await disableAnimations(page);
    const pax = new PaxPage(page);
    await pax.open();
    const { caseId } = await pax.launchCarPurchase();

    const response = await postCommand(page.request, caseId, 'focusOption', {
      optionId: 'candidate-rav4',
      expectedSequence: 0, // deliberately stale -- the case's real sequence is already > 0 after seeding
    });

    expect(response.status()).toBe(409);
    const body = (await response.json()) as {
      error: { code: string; retryable: boolean; expectedSequence: number; actualSequence: number };
      snapshot: { id: string };
    };
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.retryable).toBe(true);
    expect(body.error.expectedSequence).toBe(0);
    expect(body.error.actualSequence).toBeGreaterThan(0);
    // webmcp.md "Conflicts return the latest sequence so ChatGPT can call
    // pax_get_case_context before retrying" -- the latest snapshot is
    // included directly in the conflict body, not a separate round trip.
    expect(body.snapshot.id).toBe(caseId);
  });
});
