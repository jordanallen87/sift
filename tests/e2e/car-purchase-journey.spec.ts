/**
 * The complete "Choose Our Next Car" demo journey, run against the real
 * production Express + Vite build and the real six-node Strands Graph
 * (docs/specs/demos-and-submission.md "Required sequence";
 * `apps/agent/src/runtime/car-purchase-scenario.ts`'s proven reference
 * trajectory). Runs identically across all four configured viewport
 * projects (`playwright.config.ts`).
 *
 * Covers: launch -> 4 seeded candidates -> round-1 investigation streamed
 * live over SSE -> a recommendation with cited sources -> a criteria
 * reweight (the real `updateCriteria` command, invalidating the
 * recommendation live) -> a custom concern defined through the visible
 * `CustomConcernForm` -> round-2 investigation -> a revised recommendation
 * -> human-only approval of the pending proposal.
 *
 * "Criteria reweight" has no dedicated visible control yet (confirmed: no
 * criteria-editing UI exists anywhere in `apps/web/src/components` today --
 * `updateCriteria` is reachable only through the WebMCP tool catalog and
 * this same `/api/cases/:caseId/commands/updateCriteria` HTTP route). Real
 * WebMCP is genuinely unavailable in stock Chromium (`WebMcpStatus`'s
 * `adapter.supported()` check, asserted directly below), so this spec
 * exercises the identical command contract a WebMCP tool call would use via
 * `postCommand` (see `pages/pax-page.ts`'s header comment) and then proves
 * the browser reflects that external mutation live over SSE, with no click
 * and no reload -- the concrete, observable meaning of CLAUDE.md's "shared
 * human-agent control".
 */
import { expect, test } from '@playwright/test';
import { assertNoSeriousAxeViolations } from './helpers/axe.js';
import { installConsoleGuard } from './helpers/console-guard.js';
import { assertRightPaneIntegrity, disableAnimations } from './helpers/layout-assertions.js';
import { dynamicScreenshotMasks, withVolatileRegionsHidden } from './helpers/visual-masks.js';
import {
  CAR_PURCHASE_CANDIDATE_IDS,
  CAR_PURCHASE_CRITERION_IDS,
  getCaseState,
  PaxPage,
  postCommand,
} from './pages/pax-page.js';

test.describe('Choose our next car -- full demo journey', () => {
  test('launch, investigate, recommend, reweight, custom concern, revise, approve', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await disableAnimations(page);
    const guard = installConsoleGuard(page);
    const pax = new PaxPage(page);
    const masks = dynamicScreenshotMasks(page);
    // The real six-node Strands Graph genuinely fans four specialist nodes
    // out in parallel (car-purchase-engine.ts's `drainGraphToActivity`) --
    // confirmed by an actual failed double-run: three independent round-1
    // investigations against the same fixture converged on an identical
    // final case state and an identical *set* of 87 activity events every
    // time, but the exact interleaved *order* those events streamed in
    // genuinely differed run to run (real concurrent async completion
    // timing, not a bug). `ActivityTimeline` renders in that arrival order,
    // and `LiveRunStatus`'s phase breadcrumb (built by walking the same
    // order) varies in *line count*, not just content -- so a plain `mask`
    // is not enough (it paints over an existing box without changing that
    // box's size); every screenshot captured after round 1 starts wraps the
    // capture in `withVolatileRegionsHidden`, which removes both regions
    // from layout for the duration of the capture and restores them
    // immediately after (see `visual-masks.ts`'s header comment for the
    // full causal chain -- including the actual failed-double-run evidence
    // -- and why forcing artificial ordering onto a genuinely concurrent
    // Strands Graph is not the correct fix here). Home Energy Guardian's
    // Swarm, by contrast, hands off between specialists strictly
    // sequentially (`HOME_ENERGY_SEQUENTIAL_SPECIALIST_IDS`), which is why
    // `home-energy-guardian-journey.spec.ts` needs no equivalent treatment.

    // --- Launch ---
    await pax.open();
    await assertNoSeriousAxeViolations(page, 'initial load (launcher)');
    await assertRightPaneIntegrity(page, [
      'demo-launcher-car-purchase',
      'demo-launcher-home-energy-guardian',
    ]);
    await expect(page.getByTestId('demo-launcher')).toHaveScreenshot('initial-launcher.png', {
      maxDiffPixelRatio: 0.01,
    });

    const { caseId } = await pax.launchCarPurchase();
    expect(caseId).toMatch(/.+/);

    // Real WebMCP is genuinely unavailable in this browser -- the page must
    // say so and stay fully usable through visible controls (webmcp.md
    // "Browser adapter"; CLAUDE.md "Non-negotiable product truths").
    await expect(page.getByTestId('webmcp-status-unsupported')).toBeVisible();

    // --- 4 seeded candidates ---
    for (const candidateId of CAR_PURCHASE_CANDIDATE_IDS) {
      await expect(page.getByTestId(`option-comparison-header-${candidateId}`)).toBeVisible();
    }

    // Fully settled, non-racing checkpoint: case loaded, seeded, nothing
    // investigated yet -- a stable baseline before any async run starts.
    await expect(page.getByTestId('current-focus-empty')).toBeVisible();
    await expect(page.getByTestId('case-workspace')).toHaveScreenshot('seeded-case.png', {
      mask: masks,
      maxDiffPixelRatio: 0.01,
    });

    // --- Round 1: real live streaming investigation ---
    const round1 = await pax.requestInvestigation();
    // Mid-investigation state: the activity timeline is already populating
    // live from real streamed events (not a static end state).
    await expect(page.getByTestId('activity-timeline')).toBeVisible();
    await assertNoSeriousAxeViolations(page, 'mid-investigation');
    await assertRightPaneIntegrity(page, ['request-investigation', 'case-header-reset-demo']);

    await pax.waitForInvestigationCompleted(round1.runId);
    await pax.waitForRecommendationReady();

    // Recommendation carries a rationale and cited, source-linked evidence.
    await expect(page.getByTestId('recommendation-card-rationale')).not.toBeEmpty();
    await expect(page.getByTestId('recommendation-card-sources')).toBeVisible();
    const round1SourceCount = await page
      .getByTestId('recommendation-card-sources')
      .locator('li')
      .count();
    expect(round1SourceCount).toBeGreaterThan(0);

    await withVolatileRegionsHidden(page, () =>
      expect(page.getByTestId('case-workspace')).toHaveScreenshot('recommendation-ready.png', {
        maxDiffPixelRatio: 0.01,
      }),
    );

    // --- Criteria reweight: the real command route, no click, no reload ---
    const beforeReweight = await getCaseState(page.request, caseId);
    const reweightResponse = await postCommand(page.request, caseId, 'updateCriteria', {
      expectedSequence: beforeReweight['eventSequence'],
      operations: [
        { op: 'reweight', criterionId: CAR_PURCHASE_CRITERION_IDS.drivingComfort, weight: 25 },
        { op: 'reweight', criterionId: CAR_PURCHASE_CRITERION_IDS.ownershipCost, weight: 15 },
      ],
    });
    expect(reweightResponse.ok(), await reweightResponse.text()).toBe(true);

    // The browser -- already open, subscribed via SSE -- reflects this
    // external mutation live: the existing recommendation is invalidated.
    await expect(page.getByTestId('recommendation-card-status')).toContainText('Stale', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('recommendation-card-stale-note')).toBeVisible();

    // A stable, fully-settled pause point (nothing is in flight -- round 2
    // has not been requested yet).
    await withVolatileRegionsHidden(page, () =>
      expect(page.getByTestId('case-workspace')).toHaveScreenshot('recommendation-stale.png', {
        maxDiffPixelRatio: 0.01,
      }),
    );

    // --- Custom concern: the visible-control equivalent of pax_define_case_attribute ---
    await pax.submitCustomConcern({
      slug: 'dog_crate_fit',
      label: 'Both dog crates fit behind the second row',
      reason:
        'The household needs two 36in x 24in x 27in dog travel crates to fit behind the second row without folding either seat.',
      valueType: 'boolean',
      evidenceExpectation: 'verification',
      comparison: 'target',
    });

    // A user-origin concern is auto-confirmed (packages/core/src/extensions.ts) --
    // no separate confirmation step is required before it takes effect.
    const afterConcern = await getCaseState(page.request, caseId);
    expect(
      (
        afterConcern['caseExtensions'] as { id: string; definition: { confirmation: string } }[]
      ).some((extension) => extension.definition.confirmation === 'confirmed'),
    ).toBe(true);

    // --- Round 2: independently detected from the confirmed concern (car-purchase-engine.ts) ---
    const round2 = await pax.requestInvestigation();
    expect(round2.runId).not.toBe(round1.runId);
    await pax.waitForInvestigationCompleted(round2.runId);
    await pax.waitForRecommendationReady();

    // --- Revised recommendation + human-only approval ---
    await expect(page.getByTestId('approval-card-pending')).toBeVisible();
    await assertNoSeriousAxeViolations(page, 'awaiting human approval');
    await assertRightPaneIntegrity(page, ['approval-card-approve', 'approval-card-reject']);
    await withVolatileRegionsHidden(page, () =>
      expect(page.getByTestId('case-workspace')).toHaveScreenshot('awaiting-approval.png', {
        maxDiffPixelRatio: 0.01,
      }),
    );

    await pax.approveProposal();
    await expect(page.getByTestId('approval-card-settled')).toBeVisible();
    await withVolatileRegionsHidden(page, () =>
      expect(page.getByTestId('case-workspace')).toHaveScreenshot('decided.png', {
        maxDiffPixelRatio: 0.01,
      }),
    );

    const finalState = await getCaseState(page.request, caseId);
    expect(finalState['status']).toBe('decided');
    expect((finalState['proposal'] as { status: string } | null)?.status).toBe('approved');

    guard.assertClean();
  });
});
