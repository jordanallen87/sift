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
 * Rewritten this task for `docs/decisions/
 * 0004-consumer-workspace-information-architecture.md`: the answer-first
 * `RecommendationHero` (merging the retired `WorkspaceStatusHeader`,
 * `RecommendationCard`, and `ApprovalCard` into one region) replaces the old
 * "current focus" card and stacked recommendation/approval regions; "Compare
 * the options" is renamed to "Manage options" (`disclosure-options`) and no
 * longer contains the comparison table, which moved to the always-expanded
 * `WorkspaceViewSwitcher` (Quick Pick / List / Compare / Board tabs); the
 * Decision Pack badge and the raw chronological activity ledger ("Sift's
 * work so far") both left the consumer surface entirely. Each removed
 * region is proven gone with an explicit negative assertion below, not
 * silently dropped, per this task's own rule for preserving regression
 * value on a deliberate removal.
 *
 * "Criteria reweight" has no dedicated visible control yet (confirmed: no
 * criteria-editing UI exists anywhere in `apps/web/src/components` today --
 * `updateCriteria` is reachable only through the WebMCP tool catalog and
 * this same `/api/cases/:caseId/commands/updateCriteria` HTTP route). Real
 * WebMCP is genuinely unavailable in stock Chromium (`WebMcpStatus`'s
 * `adapter.supported()` check, asserted directly below), so this spec
 * exercises the identical command contract a WebMCP tool call would use via
 * `postCommand` (see `pages/sift-page.ts`'s header comment) and then proves
 * the browser reflects that external mutation live over SSE, with no click
 * and no reload -- the concrete, observable meaning of CLAUDE.md's "shared
 * human-agent control".
 */
import { expect, test } from '@playwright/test';
import { assertNoSeriousAxeViolations } from './helpers/axe.js';
import { installConsoleGuard } from './helpers/console-guard.js';
import {
  assertPrimaryTouchTargets,
  assertRecommendationHeroAboveTheFold,
  assertRightPaneIntegrity,
  disableAnimations,
  expectNamedScreenshot,
} from './helpers/layout-assertions.js';
import { dynamicScreenshotMasks, withVolatileRegionsHidden } from './helpers/visual-masks.js';
import {
  CAR_PURCHASE_CANDIDATE_IDS,
  CAR_PURCHASE_CRITERION_IDS,
  getCaseState,
  SiftPage,
  postCommand,
} from './pages/sift-page.js';

test.describe('Choose our next car -- full demo journey', () => {
  test('launch, investigate, recommend, reweight, custom concern, revise, approve', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await disableAnimations(page);
    const guard = installConsoleGuard(page);
    const sift = new SiftPage(page);
    const masks = dynamicScreenshotMasks(page);
    // The real six-node Strands Graph genuinely fans four specialist nodes
    // out in parallel (car-purchase-engine.ts's `drainGraphToActivity`) --
    // confirmed by an actual failed double-run: three independent round-1
    // investigations against the same fixture converged on an identical
    // final case state and an identical *set* of 87 activity events every
    // time, but the exact interleaved *order* those events streamed in
    // genuinely differed run to run (real concurrent async completion
    // timing, not a bug). `LiveRunStatus`'s phase breadcrumb (built by
    // walking that same arrival order) varies in *line count*, not just
    // content -- so a plain `mask` is not enough (it paints over an existing
    // box without changing that box's size); every screenshot captured after
    // round 1 starts wraps the capture in `withVolatileRegionsHidden`, which
    // removes it from layout for the duration of the capture and restores it
    // immediately after (see `visual-masks.ts`'s header comment for the full
    // causal chain -- including the actual failed-double-run evidence, and
    // why `ActivityTimeline` needed the identical treatment before ADR 0004
    // moved it off the consumer surface entirely -- and why forcing
    // artificial ordering onto a genuinely concurrent Strands Graph is not
    // the correct fix here). Home Energy Guardian's Swarm, by contrast,
    // hands off between specialists strictly sequentially
    // (`HOME_ENERGY_SEQUENTIAL_SPECIALIST_IDS`), which is why
    // `home-energy-guardian-journey.spec.ts` needs no equivalent treatment.

    // --- Launch ---
    await sift.open();
    await assertNoSeriousAxeViolations(page, 'initial load (launcher)');
    await assertRightPaneIntegrity(page, [
      'demo-launcher-car-purchase',
      'demo-launcher-home-energy-guardian',
    ]);
    await expectNamedScreenshot(
      page,
      page.getByTestId('demo-launcher'),
      'initial-launcher.png',
      { testId: 'demo-launcher', text: 'Start a Sift case' },
      { maxDiffPixelRatio: 0.01 },
    );

    const { caseId } = await sift.launchCarPurchase();
    expect(caseId).toMatch(/.+/);

    // Real WebMCP is genuinely unavailable in this browser -- the page must
    // say so and stay fully usable through visible controls (webmcp.md
    // "Browser adapter"; CLAUDE.md "Non-negotiable product truths").
    await expect(page.getByTestId('webmcp-status-unsupported')).toBeVisible();

    // --- 4 seeded candidates (ADR 0004: "Manage options" -- renamed from
    // "Compare the options" -- is a closed-by-default disclosure row; the
    // seeded count is proven from its own live meta summary rather than the
    // options list itself, which is not yet in the DOM's visible flow). ---
    await expect(page.getByTestId('disclosure-options-meta')).toHaveText(
      `${CAR_PURCHASE_CANDIDATE_IDS.length} options`,
    );

    // Fully settled, non-racing checkpoint: case loaded, seeded, nothing
    // investigated yet -- a stable baseline before any async run starts.
    // `RecommendationHero` (ADR 0004 item 1) is the one region that says
    // what Sift currently thinks; its `not_started` phase is the honest
    // "nothing looked into yet" signal that replaces the retired
    // "What Sift is doing" / `current-focus-empty` card below.
    await expect(page.getByTestId('recommendation-hero-status')).toHaveAttribute(
      'data-phase',
      'not_started',
    );
    await expect(page.getByTestId('recommendation-hero-headline')).toHaveText(
      "Nothing's been looked into yet.",
    );

    // --- Negative assertions: regions ADR 0004 deliberately removed from
    // the consumer surface stay removed. Preserved here (rather than simply
    // deleted along with the old positive checks) so a regression that
    // reintroduces any of them is still caught. ---
    // The "What Sift is doing" / `activeFocus` card: structurally dead code
    // (nothing ever wrote a non-null `activeFocus` in production) deleted
    // outright, per ADR 0004 decision item 5.
    await expect(page.getByTestId('current-focus')).toHaveCount(0);
    await expect(page.getByTestId('current-focus-empty')).toHaveCount(0);
    // The Decision Pack badge/id/compiled-hash and the case-status badge:
    // moved to developer-only detail entirely, per ADR 0004 decision item 1.
    await expect(page.getByTestId('case-header-pack-badge')).toHaveCount(0);
    await expect(page.getByTestId('case-header-run-status')).toHaveCount(0);

    // ADR 0004 decision item 6: the answer must be reachable without
    // scrolling at each canonical narrow width -- the machine-checked
    // above-the-fold invariant added specifically because this property
    // regressed once already, silently.
    await assertRecommendationHeroAboveTheFold(page);

    await expectNamedScreenshot(
      page,
      page.getByTestId('case-workspace'),
      'seeded-case.png',
      { testId: 'recommendation-hero-headline', text: "Nothing's been looked into yet." },
      { mask: masks, maxDiffPixelRatio: 0.01 },
    );

    // --- Workspace view switcher (ADR 0004 item 5; ADR 0005): always
    // expanded, never a disclosure -- renders directly below "Manage
    // options" and replaces the old unconditional comparison table.
    //
    // Compare is no longer the DEFAULT tab -- task A10 changed the opening
    // view to Quick Pick because an always-fully-expanded attribute table
    // made a freshly seeded 390px workspace ~3379px tall, working directly
    // against change-set §64's "reduce apparent complexity". So this step
    // now selects Compare explicitly rather than assuming it is open. The
    // switch is one tap on the always-visible tab strip; nothing became
    // unreachable.
    //
    // At narrow widths Compare shows a head-to-head pair rather than all 4
    // candidates, so this proves the real narrowed behavior instead of the
    // old unconditional-table behavior. ---
    await expect(page.getByTestId('workspace-view-switcher')).toBeVisible();
    await sift.selectWorkspaceView('compare');
    await expect(page.getByTestId('workspace-view-content-compare')).toBeVisible();
    await expect(
      page.getByTestId(`option-compare-view-header-${CAR_PURCHASE_CANDIDATE_IDS[0]}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`option-compare-view-header-${CAR_PURCHASE_CANDIDATE_IDS[1]}`),
    ).toBeVisible();

    // Narrowing is now genuinely width-dependent, so this assertion is too.
    // Task B3 replaced `OptionCompareView`'s hardcoded `layout="narrow"`
    // with real width detection (`useWidthMode`, boundary 480px), which is
    // what change-set §27 asks for: head-to-head in the canonical right
    // pane, multi-column when there is room. Asserting the narrow note at
    // every viewport would now be asserting the old hardcoded defect.
    const viewportWidth = page.viewportSize()?.width ?? 0;
    if (viewportWidth <= 480) {
      await expect(page.getByTestId('option-compare-view-narrow-note')).toContainText(
        `2 of ${CAR_PURCHASE_CANDIDATE_IDS.length}`,
      );
    } else {
      // Expanded: every candidate is a column, and no narrowing note is
      // rendered at all (never render what cannot be true).
      await expect(page.getByTestId('option-compare-view-narrow-note')).toHaveCount(0);
      for (const candidateId of CAR_PURCHASE_CANDIDATE_IDS) {
        await expect(page.getByTestId(`option-compare-view-header-${candidateId}`)).toBeVisible();
      }
    }

    // Switching to List proves all 4 seeded candidates genuinely render
    // somewhere in the workspace, not narrowed -- the direct DOM-presence
    // proof the old comparison-table loop made, now against the view that
    // actually shows every option unconditionally.
    await sift.selectWorkspaceView('list');
    for (const candidateId of CAR_PURCHASE_CANDIDATE_IDS) {
      await expect(page.getByTestId(`option-list-view-card-${candidateId}`)).toBeVisible();
    }
    // Returns to the default tab before continuing -- every later
    // screenshot in this journey should show the workspace as a real user
    // would first reach it, not a tab this test happened to select last.
    await sift.selectWorkspaceView('compare');

    // Opened once here and left open for the rest of the journey (the
    // "Manage options" row) -- every later step that reaches `OptionEditor`
    // content depends on it, and re-toggling it closed and open again
    // between each step would add fragile sequencing with no real coverage
    // benefit.
    await sift.openDisclosure('options');
    for (const candidateId of CAR_PURCHASE_CANDIDATE_IDS) {
      await expect(page.getByTestId(`option-editor-option-${candidateId}`)).toBeVisible();
    }

    // Option-editor edit/cancel row: real rendered geometry, not just
    // className presence -- entering and leaving edit mode here is a pure
    // local-UI-state toggle (`OptionEditor.tsx`'s `startEdit`/`startNew`),
    // no `upsertOption` command fires, so it leaves no trace on the case and
    // does not affect any later screenshot. This is also the only way to
    // observe `option-editor-save` and `option-editor-cancel` rendered
    // together in the same flex row, which is exactly the state that had
    // the two buttons at mismatched heights before tonight's fix.
    await page.getByTestId(`option-editor-edit-${CAR_PURCHASE_CANDIDATE_IDS[0]}`).click();
    await expect(page.getByTestId('option-editor-cancel')).toBeVisible();
    await assertPrimaryTouchTargets(page, ['option-editor-save', 'option-editor-cancel']);
    await page.getByTestId('option-editor-cancel').click();
    await expect(page.getByTestId('option-editor-cancel')).toBeHidden();

    // --- Round 1: real live streaming investigation ---
    const round1 = await sift.requestInvestigation();
    // Mid-investigation state: `LiveRunStatus`, now embedded directly in
    // `RecommendationHero`, is already populating live from real streamed
    // events (not a static end state) -- the answer-first hero's own proof
    // that something is happening, without needing to open anything.
    await expect(page.getByTestId('live-run-status')).toBeVisible();
    // The raw chronological activity ledger ("Sift's work so far") that
    // used to live in its own disclosure row here is developer-only content
    // now (ADR 0004 item 3/4) -- confirmed gone from the consumer surface
    // entirely, not merely closed.
    await expect(page.getByTestId('disclosure-work-so-far')).toHaveCount(0);
    await expect(page.getByTestId('activity-timeline')).toHaveCount(0);
    await assertNoSeriousAxeViolations(page, 'mid-investigation');
    await assertRightPaneIntegrity(page, [
      'request-investigation',
      'case-header-reset-demo',
      'option-editor-new',
      'option-editor-save',
      `option-editor-edit-${CAR_PURCHASE_CANDIDATE_IDS[0]}`,
    ]);

    // Runtime Inspector: `open-runtime-inspector` only becomes visible once
    // a run has been requested (`liveRunStatusReceipt?.runId`, `App.tsx`),
    // which just happened above -- this is the first point in the journey
    // it is genuinely reachable. Real rendered geometry for the view
    // selector tabs and "Refresh" (all fixed for 44px touch targets tonight
    // -- design-system.md names the view selector verbatim). It is now a
    // Sheet overlay, not a route swap (round-2 design review: "show these
    // in ... a side sliding sheet"), closed via the Sheet's own close
    // control -- opening/closing still fires no case command, so it does
    // not disturb the investigation running underneath or any later
    // screenshot.
    await page.getByTestId('open-runtime-inspector').click();
    await expect(page.getByTestId('runtime-inspector')).toBeVisible();
    await assertPrimaryTouchTargets(page, [
      'sheet-close',
      'runtime-inspector-tab-overview',
      'runtime-inspector-tab-timeline',
      'runtime-inspector-refresh',
    ]);
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId('runtime-inspector')).not.toBeVisible();
    await expect(page.getByTestId('case-workspace')).toBeVisible();

    await sift.waitForInvestigationCompleted(round1.runId);
    await sift.waitForRecommendationReady();

    // Recommendation carries a rationale and cited, source-linked evidence.
    await expect(page.getByTestId('recommendation-card-rationale')).not.toBeEmpty();
    await expect(page.getByTestId('recommendation-card-sources')).toBeVisible();
    const round1SourceCount = await page
      .getByTestId('recommendation-card-sources')
      .locator('li')
      .count();
    expect(round1SourceCount).toBeGreaterThan(0);

    // Pin the workspace view immediately before capturing.
    //
    // `case-workspace` includes the view switcher, so the captured image
    // depends on which tab is active -- and by this point the journey has
    // clicked through several. Diffing two failed baselines showed exactly
    // that: one run captured List, another Compare, from the same test. The
    // view is persisted state now (Task A11), written by a command that can
    // legitimately lose a sequence race against the live run, so "whichever
    // tab happens to be active" is genuinely nondeterministic here.
    //
    // Selecting one explicitly removes the variable by construction rather
    // than tolerating it. This does not weaken the assertion: every tab
    // still has its own dedicated coverage earlier in this same journey, and
    // the baseline now captures a defined state instead of an accidental one.
    await sift.selectWorkspaceView('quick_pick');
    await withVolatileRegionsHidden(page, () =>
      expectNamedScreenshot(
        page,
        page.getByTestId('case-workspace'),
        'recommendation-ready.png',
        { testId: 'recommendation-card-status', text: 'Ready for review' },
        { maxDiffPixelRatio: 0.01 },
      ),
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
      expectNamedScreenshot(
        page,
        page.getByTestId('case-workspace'),
        'recommendation-stale.png',
        { testId: 'recommendation-card-status', text: 'Stale' },
        { maxDiffPixelRatio: 0.01 },
      ),
    );

    // --- Custom concern: the visible-control equivalent of sift_define_case_attribute ---
    await sift.submitCustomConcern({
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
    const round2 = await sift.requestInvestigation();
    expect(round2.runId).not.toBe(round1.runId);
    await sift.waitForInvestigationCompleted(round2.runId);
    await sift.waitForRecommendationReady();

    // --- Revised recommendation + human-only approval ---
    await expect(page.getByTestId('approval-card-pending')).toBeVisible();
    await assertNoSeriousAxeViolations(page, 'awaiting human approval');

    // Evidence exists for real by this point (both rounds' evidence has
    // landed), but every evidence card now lives inside the "What Sift
    // found" review Sheet, not inline (round-2 design review) -- opened
    // just for this touch-target check, then closed again before the
    // baseline screenshot below, which must show the normal workspace, not
    // a Sheet overlay on top of it.
    await sift.openFindingsSheet();
    await assertPrimaryTouchTargets(page, [
      // The same `evidence-card-disposition-option-*` testid repeats per
      // card; `assertPrimaryTouchTargets` checks the first match, which is
      // representative of every card since they share one ToggleGroup config.
      'evidence-card-disposition-option-included',
      'evidence-card-disposition-option-excluded',
      'evidence-card-disposition-option-questioned',
    ]);
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId('findings-sheet')).not.toBeVisible();

    await assertRightPaneIntegrity(page, [
      'approval-card-approve',
      'approval-card-reject',
      'option-editor-new',
      'option-editor-save',
      `option-editor-edit-${CAR_PURCHASE_CANDIDATE_IDS[0]}`,
    ]);
    await withVolatileRegionsHidden(page, () =>
      expectNamedScreenshot(
        page,
        page.getByTestId('case-workspace'),
        'awaiting-approval.png',
        { testId: 'approval-card-pending', text: 'Your approval needed' },
        { maxDiffPixelRatio: 0.01 },
      ),
    );

    await sift.approveProposal();
    await expect(page.getByTestId('approval-card-settled')).toBeVisible();
    await withVolatileRegionsHidden(page, () =>
      expectNamedScreenshot(
        page,
        page.getByTestId('case-workspace'),
        'decided.png',
        { testId: 'approval-card-stamp', text: 'Approved' },
        { maxDiffPixelRatio: 0.01 },
      ),
    );

    const finalState = await getCaseState(page.request, caseId);
    expect(finalState['status']).toBe('decided');
    expect((finalState['proposal'] as { status: string } | null)?.status).toBe('approved');

    guard.assertClean();
  });
});
