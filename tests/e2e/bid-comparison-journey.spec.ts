/**
 * The complete "Bid Comparison" demo journey (the AWS/Strands-hero pack), run
 * against the real production Express + Vite build and the real six-node,
 * bounded Strands Swarm (`apps/agent/src/runtime/bid-comparison-swarm.ts`,
 * driven live by `bid-comparison-engine.ts`; `scripted-beats/
 * bid-comparison.ts`'s proven reference trajectory). Runs identically across
 * all six configured viewport projects (`playwright.config.ts`), mirroring
 * `home-energy-guardian-journey.spec.ts` -- this pack's closest analogue:
 * same Swarm-based shape, same round1/round2-by-criteria-weight structure,
 * same `postCommand`/`getCaseState`/`postRunRequest` "real HTTP route, not a
 * bypass" discipline documented in `pages/sift-page.ts`'s own header comment
 * -- most closely, with one genuine, confirmed difference from that pack
 * noted below.
 *
 * Covers: launch -> 3 seeded bid entities / 6 criteria / 5 obligations ->
 * a human answering a real explicit-unknown attribute through the visible
 * `OptionEditor` before any investigation runs -> round-1 investigation
 * streamed live over SSE, with a required `Deny` (price-analyst reaching for
 * `license-lookup`) and `Guide` (scope-analyst repeating a query family) both
 * genuinely fired -> a recommendation favoring Northgate Plumbing with cited
 * sources -> a pending award proposal gated by `ConsequenceGuard` -> a
 * criteria reweight through the real, now-shipped `CriteriaEditor` UI,
 * reopening exactly the one `dependsOnCriteria` obligation -> round-2
 * investigation, re-run through the SAME generic "Request investigation"
 * control -> a revised recommendation, still Northgate Plumbing (a genuine
 * scored outcome, not a coincidence -- see the round-2 section below) -> the
 * pending proposal's own human-only approval.
 *
 * --- Two things this task's own brief asked to "prove or disprove
 * honestly" that have not been driven end to end before this spec. Both are
 * genuinely reachable; one carries a real, confirmed product-narrative
 * limitation worth recording here rather than routing around. ---
 *
 * **6a, the explicit unknown -- reachable, but NOT what blocks readiness.**
 * Cedar & Sons' bid document states a workmanship warranty with no term in
 * writing, so `bid.warranty_months` seeds `status: 'unknown'`, no `value`
 * (`packages/scenarios/src/seeds.ts` -- "never a fabricated 0-month
 * warranty"). That is genuinely visible on the consumer surface
 * (`OptionCardSignals`' `option-card-signal-unresolved-bid-cedar` chip, "1
 * unknown") and a human genuinely can supply it, through the same visible
 * `OptionEditor` "Edit" control every other option field uses -- both
 * asserted below.
 *
 * What is NOT true, confirmed directly against the real running app before
 * writing a single assertion about it (per this suite's own discipline):
 * this does NOT block `evaluateReadiness` (`packages/core/src/readiness.ts`).
 * Readiness is computed purely from `ObligationState.status`; no obligation
 * in this pack's manifest targets `bid.warranty_months` at all, so an
 * unknown attribute value never appears in `ReadinessPanel`'s "Why this
 * case isn't ready yet" list by construction. The real blockers after round
 * 1 -- confirmed below via the real `ReadinessPanel` -- are
 * `bid.scope_normalization` and `bid.credential_verification`, both still
 * `open` because their own evidence links carry a genuine `degraded` verdict
 * (`meetsRequiredEvidenceLevel`'s fail-closed rule, `packages/core/src/
 * evidence.ts`) -- Cedar's own missing-scope gap and Two Rivers' named-
 * insured mismatch, neither about warranty at all. This spec asserts the
 * true blockers and asserts the blocker list never mentions "warranty",
 * rather than asserting the false premise or silently dropping the check.
 *
 * **6b, the criteria reweight -- the mechanics are genuinely correct; the
 * round-2 narrative text is not dynamically grounded in the actual weights
 * supplied.** `docs/bid-comparison/plan.md`'s own suggested reweight is
 * "move weight off `adjusted_total` toward `scope_completeness` and
 * `payment_risk`" -- this spec's reweight below does exactly that (`bid.
 * adjusted_total` 45->10, `bid.scope_completeness` 20->30, `bid.payment_risk`
 * 15->40, `bid.schedule_fit`/`bid.warranty` untouched at 10/10).
 * `scripted-beats/bid-comparison.ts`'s own module header records that its
 * shipped `ROUND2_CRITERIA_WEIGHTS` deliberately substitutes `bid.warranty`
 * for `bid.scope_completeness` in that same target ("adjusted to
 * `bid.warranty` in place of `bid.scope_completeness` ... the reweight needs
 * to give the bid under test its best real case, not an arbitrary one") --
 * so this spec's own weights are a real, independent point in criteria
 * space, not a copy of the pack's own scripted one.
 *
 * Confirmed real and correct, independent of that narrative-text question:
 * `updateCriteria` reopens exactly the one `dependsOnCriteria: true`
 * obligation (`bid.award_recommendation`) and no other, `bid.credentials_valid`
 * is structurally unreweightable, and `determineBidComparisonRound`
 * (`bid-comparison-engine.ts`) reads the real weights on the case, so the
 * generic "Request investigation" control genuinely re-runs round 2 --
 * unlike `home-energy-guardian-journey.spec.ts`'s own documented round-2 gap,
 * this pack's round 2 needs no `postRunRequest` workaround, because
 * `bid.award_recommendation`'s `maxAttempts: 2` (vs. that pack's `1`) leaves
 * a real attempt budget for `updateCriteria`'s own reopening rule to spend.
 * Northgate Plumbing winning again is independently verified below by
 * reproducing the real `scoreBids` computation (`scripted-beats/
 * bid-comparison.ts`) against this spec's OWN weights, not merely asserted
 * from the product's prose.
 *
 * What is NOT dynamically grounded: `decision-synthesizer`'s round-2
 * `strands_structured_output` text (`DECISION_TEXT_ROUND2`) is one fixed
 * scripted string, keyed only to which SIDE of the round-1/round-2 threshold
 * `determineBidComparisonRound` lands on -- never to the actual weight
 * values supplied. Confirmed directly: this spec's own weights never touch
 * `bid.warranty` at all, yet the resulting rationale still names "a
 * 36-month warranty" and a "0.81" score -- the exact `ROUND2_CRITERIA_
 * WEIGHTS` narrative, not a recomputation against this run's real inputs.
 * This spec therefore asserts only what the real text genuinely contains
 * (still names "Northgate Plumbing," the real, independently-verified
 * winner) and does not assert that it names `bid.scope_completeness` or this
 * spec's own weight values, which would be a false assertion about the
 * product. Filed here rather than silently asserted around, exactly as
 * `home-energy-guardian-journey.spec.ts` files its own round-2 gap.
 *
 * Ordering note: the human answers Cedar's warranty (6a) BEFORE round 1 runs
 * (`upsertOption`'s own `invalidatesRecommendation` guard reads
 * `snapshot.recommendation !== null`, so editing an attribute before any
 * recommendation exists invalidates nothing -- confirmed directly), and the
 * criteria reweight (6b) happens on the STILL-`ready` round-1 recommendation,
 * before that later edit would otherwise apply. This is not an arbitrary
 * ordering choice: confirmed directly against the real running app, doing
 * 6a between round 1 and the reweight (rather than before round 1) leaves
 * `snapshot.recommendation.status` already `'stale'` by the time
 * `updateCriteria` runs, and `invalidatesRecommendation` there is gated on
 * `status === 'ready'` -- so the very reopening this spec exists to prove
 * silently no-ops. Sequencing 6a first is the only ordering that lets both
 * beats be proven cleanly and independently.
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
  BID_COMPARISON_AWARD_RECOMMENDATION_OBLIGATION_ID,
  BID_COMPARISON_CRITERION_IDS,
  BID_COMPARISON_ENTITY_IDS,
  BID_COMPARISON_OBLIGATION_IDS,
  getActivityLabel,
  getCaseState,
  getPublicActivityEvents,
  isNarrowLayout,
  SiftPage,
} from './pages/sift-page.js';

/**
 * A reproduction of `scripted-beats/bid-comparison.ts`'s own real `scoreBids`
 * computation, restricted to this spec's exact reweight below, so "Northgate
 * Plumbing wins again" is asserted as a real, independently-derived scored
 * outcome of THIS spec's own weights, not merely copied from the product's
 * prose (which -- see this file's header comment -- names different,
 * scripted numbers). Every input figure is the same real, checked-in fixture
 * fact `scripted-beats/bid-comparison.ts`'s own `BID_FACTS` documents (never
 * invented here): adjusted totals $18,400/$18,600/$19,250, scope
 * completeness 100%/62.5%/100%, deposits 25%/45%/20%, and Two Rivers'
 * permanent `bid.credentials_valid` failure (its certificate of insurance
 * does not name its license holder) -- `packages/core/src/scoring.ts`'s own
 * documented hard-constraint rule ("flags, never eliminates ... ranked below
 * compliant ones") is reproduced here exactly, matching that module's own
 * `compareOptionScores`.
 */
function verifyNorthgateWinsUnderReweight(): void {
  const facts = [
    { bidId: 'bid-northgate', adjustedTotal: 18400, scopeCompleteness: 1, depositPercent: 25, credentialsValid: true },
    { bidId: 'bid-cedar', adjustedTotal: 18600, scopeCompleteness: 0.625, depositPercent: 45, credentialsValid: true },
    { bidId: 'bid-tworivers', adjustedTotal: 19250, scopeCompleteness: 1, depositPercent: 20, credentialsValid: false },
  ] as const;
  // This spec's own reweight, below: adjustedTotal 10 / scopeCompleteness 30
  // / paymentRisk 40 (scheduleFit/warranty untouched at their round-1
  // defaults, 10 each -- omitted from this scoring reproduction exactly as
  // `scripted-beats/bid-comparison.ts`'s own `scoreBids` would still weigh
  // them, but their contribution is identical for every bid's *relative*
  // ranking question this function asks, since neither this spec nor the
  // scripted round-2 weighting touches `bid.schedule_fit`; the pack's own
  // `bid.warranty` DOES move in the shipped scenario -- which is exactly
  // the divergence this file's header comment records).
  const weights = { adjustedTotal: 10, scopeCompleteness: 30, paymentRisk: 40 };
  const totals = facts.map((f) => f.adjustedTotal);
  const completenesses = facts.map((f) => f.scopeCompleteness);
  const deposits = facts.map((f) => f.depositPercent);
  const normLowerBetter = (values: readonly number[], value: number): number => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return max === min ? 1 : (max - value) / (max - min);
  };
  const normHigherBetter = (values: readonly number[], value: number): number => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return max === min ? 1 : (value - min) / (max - min);
  };
  const scored = facts.map((f) => ({
    bidId: f.bidId,
    constraintViolated: !f.credentialsValid,
    score:
      weights.adjustedTotal * normLowerBetter(totals, f.adjustedTotal) +
      weights.scopeCompleteness * normHigherBetter(completenesses, f.scopeCompleteness) +
      weights.paymentRisk * normLowerBetter(deposits, f.depositPercent),
  }));
  scored.sort((a, b) => {
    const aViolates = a.constraintViolated ? 1 : 0;
    const bViolates = b.constraintViolated ? 1 : 0;
    if (aViolates !== bViolates) return aViolates - bViolates;
    return b.score - a.score;
  });
  expect(
    scored[0]?.bidId,
    `real scoreBids reproduction under this spec's own reweight: ${JSON.stringify(scored)}`,
  ).toBe('bid-northgate');
}

test.describe('Bid Comparison -- full demo journey', () => {
  test('launch, answer an unknown, investigate, recommend, reweight, revise, approve', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    verifyNorthgateWinsUnderReweight();

    await disableAnimations(page);
    const guard = installConsoleGuard(page);
    const sift = new SiftPage(page);
    const masks = dynamicScreenshotMasks(page);

    // --- Launch ---
    await sift.open();
    await assertNoSeriousAxeViolations(page, 'initial load (launcher)');
    await assertRightPaneIntegrity(page, [
      'demo-launcher-car-purchase',
      'demo-launcher-home-energy-guardian',
      'demo-launcher-bid-comparison',
    ]);
    await expect(page.getByTestId('demo-launcher')).toBeVisible();
    await expectNamedScreenshot(
      page,
      page.getByTestId('demo-launcher'),
      'initial-launcher.png',
      { testId: 'demo-launcher', text: 'Start a Sift case' },
      { maxDiffPixelRatio: 0.01 },
    );

    const { caseId } = await sift.launchBidComparison();
    expect(caseId).toMatch(/.+/);

    // Real WebMCP is genuinely unavailable in this browser (webmcp.md
    // "Browser adapter"; docs/engineering-principles.md "Non-negotiable
    // product truths") -- matches both sibling journeys' identical check.
    await expect(page.getByTestId('webmcp-status-unsupported')).toBeVisible();

    // --- 3 seeded bid entities / 6 criteria / 5 obligations ---
    await expect(page.getByTestId('workspace-app-bar-option-count')).toHaveText(
      `${BID_COMPARISON_ENTITY_IDS.length} options`,
    );

    const seededState = await getCaseState(page.request, caseId);
    const seededEntities = seededState['entities'] as { id: string }[];
    const seededCriteria = seededState['criteria'] as { id: string }[];
    const seededObligations = seededState['obligations'] as { id: string }[];
    expect(seededEntities.map((e) => e.id).sort()).toEqual([...BID_COMPARISON_ENTITY_IDS].sort());
    expect(seededCriteria.map((c) => c.id).sort()).toEqual(
      Object.values(BID_COMPARISON_CRITERION_IDS).sort(),
    );
    expect(seededObligations.map((o) => o.id).sort()).toEqual(
      [...BID_COMPARISON_OBLIGATION_IDS].sort(),
    );
    expect(seededState['recommendation']).toBeNull();

    // A stable, non-racing checkpoint before any async run starts.
    await expect(page.getByTestId('recommendation-hero-status')).toHaveAttribute(
      'data-phase',
      'not_started',
    );
    await expect(page.getByTestId('recommendation-hero-headline')).toHaveText(
      "Nothing's been looked into yet.",
    );

    // --- Negative assertions: regions ADR 0004 removed from the consumer
    // surface stay removed -- same checks both sibling journeys make. ---
    await expect(page.getByTestId('current-focus')).toHaveCount(0);
    await expect(page.getByTestId('current-focus-empty')).toHaveCount(0);
    await expect(page.getByTestId('workspace-app-bar-pack-badge')).toHaveCount(0);
    await expect(page.getByTestId('workspace-app-bar-run-status')).toHaveCount(0);

    await assertRecommendationHeroAboveTheFold(page);

    if (!isNarrowLayout(page)) {
      await expect(page.getByTestId('workspace-expanded-layout')).toBeVisible();
      await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
      await expect(page.getByTestId('disclosure-decision-profile')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('workspace-sidebar')).toHaveCount(0);
    }

    // ADR 0009: the filter surface is pack-agnostic, exercised a third time
    // here against a THIRD pack's own declared attributes/`optionLabelPlural`
    // ("Bids").
    await expect(page.getByTestId('workspace-filter-bar')).toBeVisible();
    await expect(page.getByTestId('workspace-filter-open')).toBeVisible();

    await expectNamedScreenshot(
      page,
      page.getByTestId('case-workspace'),
      'seeded-case.png',
      { testId: 'recommendation-hero-headline', text: "Nothing's been looked into yet." },
      { mask: masks, maxDiffPixelRatio: 0.01 },
    );

    // --- Workspace view switcher: Compare narrows to a head-to-head pair
    // (real entity order -- `BID_COMPARISON_ENTITY_IDS` needs no separate
    // "real order" export, unlike Home Energy Guardian's own response
    // options; see that constant's own header comment). ---
    await expect(page.getByTestId('workspace-view-switcher')).toBeVisible();
    await sift.selectWorkspaceView('compare');
    await expect(page.getByTestId('workspace-view-content-compare')).toBeVisible();
    await expect(
      page.getByTestId(`option-compare-view-header-${BID_COMPARISON_ENTITY_IDS[0]}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`option-compare-view-header-${BID_COMPARISON_ENTITY_IDS[1]}`),
    ).toBeVisible();
    if (isNarrowLayout(page)) {
      await expect(page.getByTestId('option-compare-view-narrow-note')).toContainText(
        `2 of ${BID_COMPARISON_ENTITY_IDS.length}`,
      );
    } else {
      await expect(page.getByTestId('option-compare-view-narrow-note')).toHaveCount(0);
      for (const entityId of BID_COMPARISON_ENTITY_IDS) {
        await expect(page.getByTestId(`option-compare-view-header-${entityId}`)).toBeVisible();
      }
    }

    // Switching to List proves all 3 seeded bids genuinely render, and is
    // where `OptionCardSignals` (the "N unknown" chip 6a below answers)
    // actually lives.
    await sift.selectWorkspaceView('list');
    for (const entityId of BID_COMPARISON_ENTITY_IDS) {
      await expect(page.getByTestId(`option-list-view-card-${entityId}`)).toBeVisible();
    }

    // --- 6a: the explicit unknown, genuinely visible, then genuinely
    // answered by a human through the real, existing `OptionEditor` visible
    // control -- see this file's header comment for the full "does this
    // block readiness" finding and why this happens before round 1. ---
    await expect(page.getByTestId('option-card-signal-unresolved-bid-cedar')).toContainText(
      '1 unknown',
    );

    await sift.openManageOptionsSheet();
    for (const entityId of BID_COMPARISON_ENTITY_IDS) {
      await expect(page.getByTestId(`option-editor-option-${entityId}`)).toBeVisible();
    }
    await page.getByTestId('option-editor-edit-bid-cedar').click();
    const warrantyField = page.getByTestId('dynamic-attribute-field-bid.warranty_months');
    await expect(warrantyField).toBeVisible();
    // The explicit-unknown proof itself: the form shows no fabricated
    // default, only a genuinely empty field -- `OptionEditor.tsx`'s own
    // `formFromEntity` reads `record.value`, which an `unknown`-status
    // `AttributeRecord` never carries.
    await expect(warrantyField.locator('input')).toHaveValue('');
    await assertPrimaryTouchTargets(page, ['option-editor-save', 'option-editor-cancel']);
    await warrantyField.locator('input').fill('18');
    const [warrantySaveResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/commands/upsertOption') && res.request().method() === 'POST',
      ),
      page.getByTestId('option-editor-save').click(),
    ]);
    expect(warrantySaveResponse.ok(), await warrantySaveResponse.text()).toBe(true);
    await sift.closeManageOptionsSheet();

    // The chip is gone -- not merely re-labelled -- once a real value
    // exists: `summarizeOptionSignals` (`option-profile.ts`) buckets a
    // record only by `status`, and this write is `status: 'asserted'`.
    await expect(page.getByTestId('option-card-signal-unresolved-bid-cedar')).toHaveCount(0);

    const afterWarrantyAnswer = await getCaseState(page.request, caseId);
    const cedarEntity = (afterWarrantyAnswer['entities'] as { id: string; attributes: Record<string, { status: string; value?: { value: number } }> }[]).find(
      (e) => e.id === 'bid-cedar',
    );
    expect(cedarEntity?.attributes['bid.warranty_months']?.status).toBe('asserted');
    expect(cedarEntity?.attributes['bid.warranty_months']?.value?.value).toBe(18);
    // Recorded, but not yet consequential: no recommendation exists yet for
    // this edit to invalidate (see this file's header comment's "Ordering
    // note").
    expect(afterWarrantyAnswer['recommendation']).toBeNull();

    // --- The hard constraint is structurally unreweightable -- checked
    // once, early, independent of 6b's later functional reweight below. ---
    await sift.openPriorities();
    await expect(page.getByTestId('workspace-priorities-sheet')).toBeVisible();
    await expect(
      page.getByTestId(`criteria-editor-protected-${BID_COMPARISON_CRITERION_IDS.credentialsValid}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`criteria-editor-weight-${BID_COMPARISON_CRITERION_IDS.credentialsValid}`),
    ).toHaveCount(0);
    for (const criterionId of [
      BID_COMPARISON_CRITERION_IDS.adjustedTotal,
      BID_COMPARISON_CRITERION_IDS.scopeCompleteness,
      BID_COMPARISON_CRITERION_IDS.paymentRisk,
      BID_COMPARISON_CRITERION_IDS.scheduleFit,
      BID_COMPARISON_CRITERION_IDS.warranty,
    ]) {
      await expect(page.getByTestId(`criteria-editor-weight-${criterionId}`)).toBeVisible();
    }
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId('workspace-priorities-sheet')).not.toBeVisible();

    // --- Round 1: real live streaming investigation, driven by the visible control ---
    const round1 = await sift.requestInvestigation();
    await expect(page.getByTestId('live-run-status')).toBeVisible();
    await assertNoSeriousAxeViolations(page, 'mid-investigation');
    await assertRightPaneIntegrity(page, ['request-investigation', 'workspace-app-bar-reset-demo']);

    await sift.waitForInvestigationCompleted(round1.runId);
    await sift.waitForRecommendationReady();

    // --- Item 2: the swarm ran -- specialist handoffs and skill activations
    // are both genuinely visible, on two different real surfaces. ---
    // `SpecialistActivityPanel` -- the consumer-facing team view -- shows
    // all six specialists, in real handoff order, every one settled clean
    // (no visible failure from the Deny below).
    await expect(page.getByTestId('specialist-activity-panel')).toBeVisible();
    const specialistRows = page.getByTestId('specialist-row');
    await expect(specialistRows).toHaveCount(6);
    // The bid pack's own four measurement specialists have no curated
    // `SpecialistActivityPanel` identity yet (`SPECIALIST_IDENTITIES` only
    // names Choose Our Next Car's and Home Energy Guardian's own agents) --
    // confirmed directly against the real running app -- so these four
    // render through `identityFor`'s generic humanized-id fallback rather
    // than a curated name, unlike `source-challenger`/`decision-synthesizer`
    // (shared by all packs). Asserted as what genuinely renders today, not
    // papered over as the curated names a later task could still add.
    await expect(page.getByTestId('specialist-row-name')).toHaveText([
      'Scope analyst',
      'Price analyst',
      'Credential checker',
      'Schedule analyst',
      'Source check',
      'Recommendation',
    ]);
    for (const row of await specialistRows.all()) {
      await expect(row).toHaveAttribute('data-state', 'completed');
    }

    // Skill activations: real events in the real public activity stream
    // (`getPublicActivityEvents`; see that helper's own header comment for
    // why this route, not a live DOM read, is the honest way to assert a
    // sub-100ms transition on this deterministic test server).
    const round1Events = await getPublicActivityEvents(page.request, caseId);
    const activatedSkills = round1Events
      .filter((event) => event['type'] === 'skill.activated')
      .map((event) => String(event['summary']));
    for (const skillId of [
      'scope-normalization',
      'price-arithmetic',
      'credential-verification',
      'schedule-analysis',
    ]) {
      expect(activatedSkills.some((summary) => summary.includes(skillId))).toBe(true);
    }

    // --- Item 3: a blocked action is visible in the PUBLIC stream, and
    // there is NO user-facing failure message naming `license-lookup`. ---
    const deniedEvents = round1Events.filter((event) => event['type'] === 'intervention.denied');
    expect(deniedEvents).toHaveLength(1);
    expect(String(deniedEvents[0]?.['summary'])).toContain('license-lookup');
    // The real, product-declared consumer label for this event type
    // (product.md terminology table, verbatim) -- imported, not duplicated.
    expect(getActivityLabel('intervention.denied').label).toBe('Action blocked');
    const failedLicenseLookup = round1Events.filter(
      (event) =>
        event['type'] === 'tool.failed' && String(event['summary']).includes('license-lookup'),
    );
    expect(failedLicenseLookup).toEqual([]);

    // --- The real blockers, disproving the literal "unknown blocks
    // readiness" premise -- see this file's header comment. ---
    await sift.openReadiness();
    await expect(page.getByTestId('readiness-panel-status')).toContainText(
      'Not ready for decision',
    );
    const blockers = page.getByTestId('readiness-panel-blockers');
    await expect(blockers).toContainText('Scope normalization');
    await expect(blockers).toContainText('Credential verification');
    await expect(blockers).not.toContainText(/warranty/i);
    await sift.closeReadiness();

    // --- Item 4: recommendation resolves to Northgate, rationale legible. ---
    await expect(page.getByTestId('recommendation-card-rationale')).toContainText(
      'Northgate Plumbing',
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
    ).toBe('bid-northgate');

    await sift.selectWorkspaceView('quick_pick');
    await assertNoSeriousAxeViolations(page, 'recommendation ready');
    await withVolatileRegionsHidden(page, async () => {
      await expectNamedScreenshot(
        page,
        page.getByTestId('case-workspace'),
        'recommendation-ready.png',
        { testId: 'recommendation-card-status', text: 'Ready for review' },
        { mask: masks, maxDiffPixelRatio: 0.01 },
      );
    });

    // --- Item 5 (part one): `propose_award` is consequential -- the
    // proposal is genuinely pending, and a visible human control to approve
    // it genuinely exists. The click itself is deferred to the very end of
    // this journey (see this file's header comment's "Ordering note") so 6b's
    // own reweight below runs against a still-`ready` recommendation. ---
    await expect(page.getByTestId('approval-card-pending')).toBeVisible();
    await assertRightPaneIntegrity(page, ['approval-card-approve', 'approval-card-reject']);

    // --- Item 6b: the criteria reweight, through the real, now-shipped
    // `CriteriaEditor` visible control (no `postCommand` bypass needed --
    // unlike this pack's own predecessor journeys before that UI existed).
    // See this file's header comment for the full mechanics-vs-narrative
    // finding and the real `verifyNorthgateWinsUnderReweight` proof above. ---
    const beforeReweight = await getCaseState(page.request, caseId);
    const obligationStatusBefore = new Map(
      (beforeReweight['obligations'] as { id: string; status: string }[]).map((o) => [
        o.id,
        o.status,
      ]),
    );
    expect(obligationStatusBefore.get(BID_COMPARISON_AWARD_RECOMMENDATION_OBLIGATION_ID)).toBe(
      'satisfied',
    );

    await sift.reweightCriteria({
      [BID_COMPARISON_CRITERION_IDS.adjustedTotal]: 10,
      [BID_COMPARISON_CRITERION_IDS.scopeCompleteness]: 30,
      [BID_COMPARISON_CRITERION_IDS.paymentRisk]: 40,
    });

    await expect(page.getByTestId('recommendation-card-status')).toContainText('Stale', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('recommendation-card-stale-note')).toBeVisible();

    const afterReweight = await getCaseState(page.request, caseId);
    const obligationStatusAfter = new Map(
      (afterReweight['obligations'] as { id: string; status: string }[]).map((o) => [
        o.id,
        o.status,
      ]),
    );
    // ONLY `bid.award_recommendation` (`dependsOnCriteria: true`) reopens.
    expect(obligationStatusAfter.get(BID_COMPARISON_AWARD_RECOMMENDATION_OBLIGATION_ID)).toBe(
      'open',
    );
    for (const obligationId of BID_COMPARISON_OBLIGATION_IDS) {
      if (obligationId === BID_COMPARISON_AWARD_RECOMMENDATION_OBLIGATION_ID) continue;
      expect(
        obligationStatusAfter.get(obligationId),
        `obligation "${obligationId}" must be unaffected by the reweight`,
      ).toBe(obligationStatusBefore.get(obligationId));
    }

    await withVolatileRegionsHidden(page, async () => {
      await expectNamedScreenshot(
        page,
        page.getByTestId('case-workspace'),
        'recommendation-stale.png',
        { testId: 'recommendation-card-status', text: 'Stale' },
        { mask: masks, maxDiffPixelRatio: 0.01 },
      );
    });

    // --- Round 2: the SAME generic visible "Request investigation" control
    // -- genuinely reachable here (see this file's header comment for why
    // this pack's round 2, unlike Home Energy Guardian's, needs no
    // `postRunRequest` workaround). ---
    const round2 = await sift.requestInvestigation();
    expect(round2.runId).not.toBe(round1.runId);
    await sift.waitForInvestigationCompleted(round2.runId);
    await sift.waitForRecommendationReady();

    // The real, re-derived, deterministic re-rank: still Northgate Plumbing
    // -- proven above as a genuine scored outcome of THIS reweight
    // (`verifyNorthgateWinsUnderReweight`), not merely copied from the
    // product's own (differently-weighted) narrative text. The rationale
    // text itself is asserted only for what it genuinely contains -- see
    // this file's header comment for why this spec does not assert it names
    // `bid.scope_completeness` or this run's own weight values.
    await expect(page.getByTestId('recommendation-card-rationale')).toContainText(
      'Northgate Plumbing',
    );
    const round2State = await getCaseState(page.request, caseId);
    expect(
      (round2State['recommendation'] as { favoredOptionId: string } | null)?.favoredOptionId,
    ).toBe('bid-northgate');

    // --- Item 5 (part two): a fresh pending proposal from the revised
    // recommendation, still gated on human-only approval. ---
    await expect(page.getByTestId('approval-card-pending')).toBeVisible();
    await assertNoSeriousAxeViolations(page, 'awaiting human approval');

    await sift.openFindingsSheet();
    await assertPrimaryTouchTargets(page, [
      'evidence-card-disposition-option-included',
      'evidence-card-disposition-option-excluded',
      'evidence-card-disposition-option-questioned',
    ]);
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId('findings-sheet')).not.toBeVisible();

    await assertRightPaneIntegrity(page, ['approval-card-approve', 'approval-card-reject']);

    await withVolatileRegionsHidden(page, async () => {
      await expectNamedScreenshot(
        page,
        page.getByTestId('case-workspace'),
        'awaiting-approval.png',
        { testId: 'approval-card-pending', text: 'Your approval needed' },
        { mask: masks, maxDiffPixelRatio: 0.01 },
      );
    });

    // --- Only the person awards. ---
    await sift.approveProposal();
    await expect(page.getByTestId('approval-card-settled')).toBeVisible();
    await withVolatileRegionsHidden(page, async () => {
      await expectNamedScreenshot(
        page,
        page.getByTestId('case-workspace'),
        'decided.png',
        { testId: 'approval-card-stamp', text: 'Approved' },
        { mask: masks, maxDiffPixelRatio: 0.01 },
      );
    });

    const finalState = await getCaseState(page.request, caseId);
    expect(finalState['status']).toBe('decided');
    expect((finalState['proposal'] as { status: string } | null)?.status).toBe('approved');
    expect(
      (finalState['recommendation'] as { favoredOptionId: string } | null)?.favoredOptionId,
    ).toBe('bid-northgate');

    guard.assertClean();
  });
});
