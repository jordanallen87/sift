/**
 * The genuinely-dynamic-content mask list for `toHaveScreenshot()` calls
 * (docs/engineering-principles.md "Playwright visual verification": "Capture named visual
 * baselines with deterministic fonts, clocks, IDs, and animations
 * disabled").
 *
 * One real source of run-to-run visual non-determinism remains in the
 * running app today, confirmed directly against it (not assumed):
 * `apps/agent/src/runtime-ports.ts` `createSystemClock` is a genuine
 * wall-clock (`new Date().toISOString()`) -- `server.ts`'s `startServer`
 * always uses it, with no override, so every `CaseEvent`/
 * `PublicActivityEvent` this app produces carries the real time it was
 * created. The Runtime Inspector's Timeline view (`RuntimeInspector.tsx`'s
 * `TimelineItem`) renders each event's own `<time>` element via
 * `formatTimestamp` (`toLocaleString()`), so those strings genuinely differ
 * between any two separate test runs -- masked generically below via
 * `page.locator('time')` rather than that one component's specific
 * `data-testid`, so this stays correct regardless of which region a given
 * screenshot happens to have open.
 *
 * A second source this mask list used to guard against -- `LiveRunStatus.tsx`
 * rendering the active receipt's raw `commandId`/`runId` as visible text --
 * no longer applies: `docs/decisions/
 * 0004-consumer-workspace-information-architecture.md` decision item 3 moved
 * both off the consumer surface entirely (`live-run-status-command-id`/
 * `-run-id` no longer exist anywhere in the DOM; see that component's own
 * header comment), so there is nothing left to mask there. Every screenshot
 * in `car-purchase-journey.spec.ts` and `home-energy-guardian-journey.spec.ts`
 * is also captured only at a fully *settled* checkpoint, with the Runtime
 * Inspector Sheet (the only remaining `<time>`-rendering region) always
 * closed again first -- see each spec's own header comment for why -- so the
 * generic `<time>` mask below is defense-in-depth, not something either
 * journey currently exercises live.
 *
 * The `<time>` element itself is masked at its *parent row*, not the bare
 * `<time>` tag -- confirmed necessary by an actual failed double-run:
 * masking only `<time>` still left a genuine, real 1-2px pixel diff, because
 * `toLocaleString()`'s real wall-clock output is a *content-sized* inline
 * box (e.g. "8/27/2026, 7:35:43 PM" vs. "12/3/2026, 11:05:03 AM" differ in
 * character count), so its rendered width genuinely differs run to run,
 * nudging an unmasked sibling in the same flex row sideways by a pixel. The
 * parent row's own box, by contrast, is a block-level flex container sized
 * by its card's fixed width, not by the timestamp text inside it -- masking
 * it removes the causal defect rather than papering over the symptom.
 */
import type { Page } from '@playwright/test';

export function dynamicScreenshotMasks(page: Page) {
  return [
    page.locator('time').locator('xpath=..'),
    // `SpecialistActivityPanel`'s per-specialist elapsed time. This is a
    // REAL measured duration -- the whole point of that column is that it
    // reports what the run actually took -- so it is different on every
    // run by construction, and a baseline that captured "211ms" failed the
    // next time the same specialist took 299ms.
    //
    // It is masked for exactly the reason the `<time>` rows above are: the
    // value is genuine and non-deterministic, which is what masking is for.
    // Its correctness is asserted where it can be asserted properly --
    // `home-energy-engine.test.ts` checks each duration against the
    // correlated `swarm.node_completed` runtime event, and
    // `SpecialistActivityPanel.test.tsx` checks the formatting -- rather
    // than by pixel-comparing a stopwatch.
    page.getByTestId('specialist-row-duration'),
  ];
}

/**
 * Regions whose own bounding-box *height* -- not merely their pixel content
 * -- is genuinely non-deterministic for a real Strands Graph that fans
 * specialist nodes out in parallel (confirmed by an actual failed
 * double-run against `car-purchase-journey.spec.ts`; see that spec's own
 * header comment for the full causal chain). `mask` alone cannot help here:
 * it paints over an element's *existing* box without changing that box's
 * size, and a still-variable size still shifts every sibling below it down
 * by a variable amount, which is exactly what the earlier failure's 23px
 * image-height mismatch traced back to -- `LiveRunStatus.tsx`'s
 * `phaseSequence` breadcrumb (`Queued → In progress → Completed → ...`)
 * dedupes only *consecutive* repeats, so its rendered line count (and thus
 * the card's height) depends on the same interleaved event-arrival order.
 *
 * `'activity-timeline'` (`ActivityTimeline.tsx`) previously needed the same
 * treatment for the identical reason -- its item order was non-deterministic
 * for the same real concurrent fan-out. It is dropped from this list now:
 * `docs/decisions/0004-consumer-workspace-information-architecture.md`
 * decision item 3 moved the raw chronological activity ledger off the
 * consumer surface entirely (developer-only, reachable only through the
 * Runtime Inspector) -- `ActivityTimeline` is no longer imported or mounted
 * anywhere in `App.tsx` (confirmed directly), so no element with that
 * `data-testid` can ever exist in either journey's DOM for this list to hide.
 * `LiveRunStatus` remains the one region genuinely subject to this
 * variability, since it still renders inside the answer-first hero.
 */
const VOLATILE_LAYOUT_TEST_IDS = ['live-run-status'] as const;

/**
 * Removes `VOLATILE_LAYOUT_TEST_IDS` from layout (`display: none`) for the
 * duration of `capture`, restoring each element's original inline
 * `display` value immediately afterward (in a `finally`, so a screenshot
 * assertion failure still restores real layout) -- every later assertion in
 * the same test (e.g. `waitForInvestigationCompleted` polling `live-run-
 * status-phase`) keeps working against the real, normal page.
 */
export async function withVolatileRegionsHidden(
  page: Page,
  capture: () => Promise<void>,
): Promise<void> {
  await page.evaluate((ids: readonly string[]) => {
    for (const id of ids) {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (el === null) continue;
      el.dataset['e2eRestoreDisplay'] = el.style.display;
      el.style.display = 'none';
    }
  }, VOLATILE_LAYOUT_TEST_IDS);
  try {
    await capture();
  } finally {
    await page.evaluate((ids: readonly string[]) => {
      for (const id of ids) {
        const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
        if (el === null) continue;
        el.style.display = el.dataset['e2eRestoreDisplay'] ?? '';
        delete el.dataset['e2eRestoreDisplay'];
      }
    }, VOLATILE_LAYOUT_TEST_IDS);
  }
}
