/**
 * The complete "Home Energy Guardian" demo journey, run against the real
 * production Express + Vite build and the real six-node, bounded Strands
 * Swarm (`apps/agent/src/runtime/home-energy-swarm.ts`, driven live by
 * `home-energy-engine.ts`; `home-energy-guardian-scenario.ts`'s proven
 * reference trajectory). Runs identically across all four configured
 * viewport projects (`playwright.config.ts`), mirroring
 * `car-purchase-journey.spec.ts` exactly in structure and command-route
 * discipline (see that file's and `pages/pax-page.ts`'s header comments for
 * the shared rules this spec also follows: no shortcut around the real HTTP
 * routes, `postCommand`/`postRunRequest` exercise the identical contract a
 * WebMCP tool call or a visible control would use).
 *
 * Covers: launch -> 4 seeded response options -> round-1 investigation
 * streamed live over SSE -> a recommendation favoring `monitor-one-cycle`
 * with cited sources -> a criteria reweight (the real `updateCriteria`
 * command, invalidating the recommendation live, no click, no reload) ->
 * round-2 investigation -> a revised recommendation favoring
 * `request-hvac-inspection` -> a pending proposal gated by
 * `ConsequenceGuard` -> human-only approval.
 *
 * --- A genuine, honestly-encountered gap: round 2 has no visible-control path ---
 *
 * Confirmed directly against the real running app (clicked through with a
 * live Playwright browser before writing any assertion below, per this
 * task's own discipline): round 1 satisfies every one of Home Energy
 * Guardian's five obligations (`energy.anomaly`, `energy.rate_change`,
 * `energy.weather`, `energy.household_change`, `energy.response_options`).
 * Unlike `car-purchase`, whose round 2 the existing sibling spec drives
 * through a plain click on the generic "Request investigation" button
 * because submitting a custom concern reopens an obligation for it to
 * auto-select, Home Energy Guardian's required trajectory has no such step
 * -- after the reweight below, every obligation remains `satisfied`, so
 * that same generic click genuinely fails with a real `400`
 * ("No obligation is available to investigate ... No open obligation
 * remains to select"), and `ReadinessPanel` (the only other place any
 * obligation is rendered) exposes no "investigate this" control. This is a
 * real product gap, not a test artifact -- there is currently no way for a
 * human, through this app's visible UI alone, to re-open Home Energy
 * Guardian's investigation once its one obligation has already been
 * satisfied once. Filed here rather than silently routed around: round 2 is
 * driven below via `postRunRequest`, the exact same
 * `POST /api/cases/:caseId/run` route and `RequestInvestigationInput`
 * contract (including its real, documented `obligationId` field) the
 * visible control itself calls -- genuinely the same command
 * implementation, not a bypass of it (CLAUDE.md "Visible UI controls and
 * WebMCP callbacks use the same command implementation") -- see
 * `pax-page.ts`'s `postRunRequest`/`waitForRecommendationRationaleContains`
 * for the full mechanics.
 */
import { expect, test } from '@playwright/test';
import { assertNoSeriousAxeViolations } from './helpers/axe.js';
import { installConsoleGuard } from './helpers/console-guard.js';
import { assertRightPaneIntegrity, disableAnimations } from './helpers/layout-assertions.js';
import { dynamicScreenshotMasks } from './helpers/visual-masks.js';
import {
  getCaseState,
  HOME_ENERGY_CRITERION_IDS,
  HOME_ENERGY_RESPONSE_OPTION_IDS,
  HOME_ENERGY_RESPONSE_OPTIONS_OBLIGATION_ID,
  PaxPage,
  postCommand,
  postRunRequest,
} from './pages/pax-page.js';

test.describe('Home Energy Guardian -- full demo journey', () => {
  test('launch, investigate, recommend, reweight, revise, approve', async ({ page }) => {
    test.setTimeout(120_000);
    await disableAnimations(page);
    const guard = installConsoleGuard(page);
    const pax = new PaxPage(page);
    // A plain `mask` (timestamp rows + generated-id spans) is sufficient
    // for every screenshot below -- unlike `car-purchase-journey.spec.ts`
    // (see that spec's own header comment for the full causal chain, plus
    // `visual-masks.ts`'s), Home Energy Guardian's Swarm hands off between
    // specialists strictly sequentially
    // (`HOME_ENERGY_SEQUENTIAL_SPECIALIST_IDS`), so `ActivityTimeline`'s
    // item order and `LiveRunStatus`'s phase-breadcrumb length are both
    // genuinely deterministic here -- confirmed empirically by multiple
    // clean, zero-diff repeated runs of this exact spec.
    const masks = dynamicScreenshotMasks(page);

    // --- Launch ---
    await pax.open();
    await assertNoSeriousAxeViolations(page, 'initial load (launcher)');
    await assertRightPaneIntegrity(page, [
      'demo-launcher-car-purchase',
      'demo-launcher-home-energy-guardian',
    ]);
    await expect(page.getByTestId('demo-launcher')).toBeVisible();
    await expect(page.getByTestId('demo-launcher')).toHaveScreenshot('initial-launcher.png', {
      maxDiffPixelRatio: 0.01,
    });

    const { caseId } = await pax.launchHomeEnergyGuardian();
    expect(caseId).toMatch(/.+/);

    // Real WebMCP is genuinely unavailable in this browser -- the page must
    // say so and stay fully usable through visible controls (webmcp.md
    // "Browser adapter"; CLAUDE.md "Non-negotiable product truths").
    await expect(page.getByTestId('webmcp-status-unsupported')).toBeVisible();

    // --- 4 seeded response options ---
    for (const optionId of HOME_ENERGY_RESPONSE_OPTION_IDS) {
      await expect(page.getByTestId(`option-comparison-header-${optionId}`)).toBeVisible();
    }

    // Fully settled, non-racing checkpoint: case loaded, seeded, nothing
    // investigated yet -- a stable baseline before any async run starts.
    await expect(page.getByTestId('current-focus-empty')).toBeVisible();
    await expect(page.getByTestId('case-workspace')).toHaveScreenshot('seeded-case.png', {
      mask: masks,
      maxDiffPixelRatio: 0.01,
    });

    // --- Round 1: real live streaming investigation, driven by the visible control ---
    const round1 = await pax.requestInvestigation();
    await expect(page.getByTestId('activity-timeline')).toBeVisible();
    await assertNoSeriousAxeViolations(page, 'mid-investigation');
    await assertRightPaneIntegrity(page, ['request-investigation', 'case-header-reset-demo']);

    await pax.waitForInvestigationCompleted(round1.runId);
    await pax.waitForRecommendationReady();

    // Recommendation carries a rationale and cited, source-linked evidence,
    // and (per the real proven scenario trajectory) favors monitoring for
    // one more billing cycle at the pack's default 50/50 weighting.
    await expect(page.getByTestId('recommendation-card-rationale')).toContainText(
      'monitor-one-cycle',
    );
    await expect(page.getByTestId('recommendation-card-sources')).toBeVisible();
    const round1SourceCount = await page
      .getByTestId('recommendation-card-sources')
      .locator('li')
      .count();
    expect(round1SourceCount).toBeGreaterThan(0);

    const round1State = await getCaseState(page.request, caseId);
    expect(
      (round1State['recommendation'] as { favoredOptionId: string } | null)?.favoredOptionId,
    ).toBe('monitor-one-cycle');

    await expect(page.getByTestId('case-workspace')).toHaveScreenshot('recommendation-ready.png', {
      mask: masks,
      maxDiffPixelRatio: 0.01,
    });

    // --- Criteria reweight: the real command route, no click, no reload ---
    const beforeReweight = await getCaseState(page.request, caseId);
    const reweightResponse = await postCommand(page.request, caseId, 'updateCriteria', {
      expectedSequence: beforeReweight['eventSequence'],
      operations: [
        { op: 'reweight', criterionId: HOME_ENERGY_CRITERION_IDS.cost, weight: 20 },
        { op: 'reweight', criterionId: HOME_ENERGY_CRITERION_IDS.conservation, weight: 80 },
      ],
    });
    expect(reweightResponse.ok(), await reweightResponse.text()).toBe(true);

    // The browser -- already open, subscribed via SSE -- reflects this
    // external mutation live: the existing recommendation is invalidated.
    // This is genuinely the same "shared human-agent control" proof
    // car-purchase's own spec makes with `updateCriteria`.
    await expect(page.getByTestId('recommendation-card-status')).toContainText('Stale', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('recommendation-card-stale-note')).toBeVisible();

    // A stable, fully-settled pause point (nothing is in flight -- round 2
    // has not been requested yet) -- see this file's header comment for why
    // this replaces a genuinely racy "mid-round-2" capture.
    await expect(page.getByTestId('case-workspace')).toHaveScreenshot('recommendation-stale.png', {
      mask: masks,
      maxDiffPixelRatio: 0.01,
    });

    // --- Round 2: no visible control can reach this obligation any more (see header comment) ---
    const afterReweight = await getCaseState(page.request, caseId);
    const round2Response = await postRunRequest(page.request, caseId, {
      obligationId: HOME_ENERGY_RESPONSE_OPTIONS_OBLIGATION_ID,
      expectedSequence: afterReweight['eventSequence'],
    });
    expect(round2Response.ok(), await round2Response.text()).toBe(true);
    const round2Body = (await round2Response.json()) as { runId: string };
    expect(round2Body.runId).not.toBe(round1.runId);

    // --- Revised recommendation, reflected live purely from streamed CaseState ---
    await pax.waitForRecommendationRationaleContains('request-hvac-inspection');

    const round2State = await getCaseState(page.request, caseId);
    expect(
      (round2State['recommendation'] as { favoredOptionId: string } | null)?.favoredOptionId,
    ).toBe('request-hvac-inspection');

    // --- Pending proposal, gated by ConsequenceGuard server-side, awaiting human-only approval ---
    await expect(page.getByTestId('approval-card-pending')).toBeVisible();
    await assertNoSeriousAxeViolations(page, 'awaiting human approval');
    await assertRightPaneIntegrity(page, ['approval-card-approve', 'approval-card-reject']);
    await expect(page.getByTestId('case-workspace')).toHaveScreenshot('awaiting-approval.png', {
      mask: masks,
      maxDiffPixelRatio: 0.01,
    });

    await pax.approveProposal();
    await expect(page.getByTestId('approval-card-settled')).toBeVisible();
    await expect(page.getByTestId('case-workspace')).toHaveScreenshot('decided.png', {
      mask: masks,
      maxDiffPixelRatio: 0.01,
    });

    const finalState = await getCaseState(page.request, caseId);
    expect(finalState['status']).toBe('decided');
    expect((finalState['proposal'] as { status: string } | null)?.status).toBe('approved');
    expect(
      (finalState['recommendation'] as { favoredOptionId: string } | null)?.favoredOptionId,
    ).toBe('request-hvac-inspection');

    guard.assertClean();
  });
});
