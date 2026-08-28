/**
 * The genuinely-dynamic-content mask list for `toHaveScreenshot()` calls
 * (CLAUDE.md "Playwright visual verification": "Capture named visual
 * baselines with deterministic fonts, clocks, IDs, and animations
 * disabled").
 *
 * Two real sources of run-to-run visual non-determinism exist in the
 * running app today, confirmed directly against it (not assumed):
 *
 * 1. `apps/agent/src/runtime-ports.ts` `createSystemClock` is a genuine
 *    wall-clock (`new Date().toISOString()`) -- `server.ts`'s `startServer`
 *    always uses it, with no override, so every `CaseEvent`/
 *    `PublicActivityEvent` this app produces carries the real time it was
 *    created. `ActivityTimeline.tsx` renders each event's own `<time>`
 *    element via `formatTimestamp` (`toLocaleString()`), so those strings
 *    genuinely differ between any two separate test runs (and, within one
 *    `pnpm test:e2e` invocation, `tests/e2e/helpers/test-server.ts`'s own
 *    header comment documents that every spec/project shares one server
 *    process -- concurrent commands from unrelated specs interleave freely,
 *    so even the exact ids below cannot be pinned by a deterministic
 *    counter).
 * 2. `createSystemIdGenerator` is `randomUUID()`-based -- also with no
 *    override -- so every command/run id is genuinely random each run.
 *    `LiveRunStatus.tsx` renders the active receipt's raw `commandId`/
 *    `runId` as visible text (`live-run-status-command-id`/`-run-id`).
 *
 * Every screenshot in `car-purchase-journey.spec.ts` and
 * `home-energy-guardian-journey.spec.ts` is captured only at a fully
 * *settled* checkpoint (never a genuinely in-flight, still-streaming
 * moment -- see each spec's own header comment for why), so masking these
 * two regions is sufficient: nothing else visible in either journey reads a
 * timestamp or a generated id (confirmed by grepping every workspace
 * component for `<time`/`toLocaleString`/`generatedAt`/`createdAt`/
 * `reviewedAt` rendering -- `ActivityTimeline.tsx` and `LiveRunStatus.tsx`
 * are the only two).
 *
 * The `<time>` element itself is masked at its *parent row*
 * (`ActivityTimeline.tsx`'s `<div className="flex flex-wrap items-center
 * gap-... ">`), not the bare `<time>` tag -- confirmed necessary by an
 * actual failed double-run: masking only `<time>` still left a genuine,
 * real 1-2px pixel diff, because `toLocaleString()`'s real wall-clock
 * output is a *content-sized* inline box (e.g. "8/27/2026, 7:35:43 PM" vs.
 * "12/3/2026, 11:05:03 AM" differ in character count), so its rendered
 * width genuinely differs run to run, nudging the unmasked "#<sequence>"
 * span immediately after it (same flex row, `gap-2`) sideways by a pixel.
 * The parent row's own box, by contrast, is a block-level flex container
 * sized by its card's fixed width, not by the timestamp text inside it --
 * masking it (still leaving the item's label/summary/detail text, the
 * genuinely deterministic content, fully compared) removes the causal
 * defect rather than papering over the symptom.
 */
import type { Page } from '@playwright/test';

export function dynamicScreenshotMasks(page: Page) {
  return [
    page.locator('time').locator('xpath=..'),
    page.getByTestId('live-run-status-command-id'),
    page.getByTestId('live-run-status-run-id'),
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
 * the card's height) depends on the same interleaved event-arrival order
 * that already made `ActivityTimeline`'s content order non-deterministic.
 */
const VOLATILE_LAYOUT_TEST_IDS = ['activity-timeline', 'live-run-status'] as const;

/**
 * Removes `VOLATILE_LAYOUT_TEST_IDS` from layout (`display: none`) for the
 * duration of `capture`, restoring each element's original inline
 * `display` value immediately afterward (in a `finally`, so a screenshot
 * assertion failure still restores real layout) -- every later assertion
 * in the same test (e.g. `waitForInvestigationCompleted` reading
 * `live-run-status-run-id`/`-phase`, or a later `activity-timeline`
 * visibility check) keeps working against the real, normal page.
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
