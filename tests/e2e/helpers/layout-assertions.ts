/**
 * Right-pane geometry assertions (CLAUDE.md "Playwright visual
 * verification"; docs/specs/testing.md's identical requirements): no
 * horizontal overflow, no fixed/sticky control overlapping a focused
 * card/approval controls/WebMCP status, primary controls stay inside the
 * viewport with at least a 44x44 CSS-pixel target.
 */
import { expect, type Page } from '@playwright/test';

/** `document.documentElement.scrollWidth <= clientWidth` at the current viewport/state. */
export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    `document scrollWidth (${scrollWidth}) must not exceed clientWidth (${clientWidth}) -- the page must not scroll horizontally`,
  ).toBeLessThanOrEqual(clientWidth);
}

/**
 * Every currently-visible element among `testIds` has at least a 44x44
 * CSS-pixel bounding box and sits fully inside the viewport. A `testId` not
 * present (or not visible) in the current state is skipped -- callers pass
 * the primary actions relevant to whichever state they are asserting.
 */
export async function assertPrimaryTouchTargets(
  page: Page,
  testIds: readonly string[],
): Promise<void> {
  const viewport = page.viewportSize();
  for (const testId of testIds) {
    const locator = page.getByTestId(testId).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible())) continue;
    const box = await locator.boundingBox();
    if (box === null) continue;
    expect(
      box.width,
      `${testId} width (${box.width}px) must be at least 44px`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      box.height,
      `${testId} height (${box.height}px) must be at least 44px`,
    ).toBeGreaterThanOrEqual(44);
    if (viewport) {
      expect(box.x, `${testId} must not start left of the viewport`).toBeGreaterThanOrEqual(0);
      expect(
        box.x + box.width,
        `${testId} (right edge ${box.x + box.width}) must stay inside the viewport width (${viewport.width})`,
      ).toBeLessThanOrEqual(viewport.width + 1); // +1px tolerance for sub-pixel rounding
    }
  }
}

/**
 * Confirms each of `testIds` -- when present and visible -- keeps its right
 * edge (via Playwright's real `boundingBox()`, not a computed-style guess)
 * inside the current viewport width. Unlike `assertPrimaryTouchTargets`,
 * this carries no minimum-size requirement -- it exists for non-interactive,
 * label/badge-style elements that must still stay visually inside the pane
 * even though they are not actionable controls (e.g. the connection-status
 * badge `CaseHeader.tsx` renders today; the Decision Pack badge this
 * assertion was originally written against was removed from the consumer
 * surface entirely by `docs/decisions/
 * 0004-consumer-workspace-information-architecture.md` -- see
 * `car-purchase-journey.spec.ts`'s negative assertion proving that removal
 * holds, rather than this general-purpose helper still naming it).
 *
 * `assertNoHorizontalOverflow` alone cannot catch this class of bug: this
 * app's deliberate `html, body { overflow-x: hidden }` backstop
 * (`apps/web/src/styles/global.css`) keeps `document.documentElement.scrollWidth`
 * pinned to `clientWidth` even when a child element is silently clipped past
 * the viewport edge -- exactly how the case-header pack badge's own overflow
 * (before it was removed) went undetected by the automated suite before its
 * `min-w-0`/`truncate` fix. This assertion checks a specific element's own
 * geometry directly, so the next instance of this bug class (a different
 * element) is still caught even though the document-level scrollWidth proxy
 * stays green.
 */
export async function assertElementsWithinViewport(
  page: Page,
  testIds: readonly string[],
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) return;
  for (const testId of testIds) {
    const locator = page.getByTestId(testId).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible())) continue;
    const box = await locator.boundingBox();
    if (box === null) continue;
    expect(box.x, `${testId} must not start left of the viewport`).toBeGreaterThanOrEqual(0);
    expect(
      box.x + box.width,
      `${testId} (right edge ${box.x + box.width}) must stay inside the viewport width (${viewport.width})`,
    ).toBeLessThanOrEqual(viewport.width + 1); // +1px tolerance for sub-pixel rounding
  }
}

/**
 * No `position: fixed`/`position: sticky` element's bounding box overlaps
 * any of `protectedTestIds`' bounding boxes. The current right-pane layout
 * (`apps/web/src/app/App.tsx`, `CaseHeader.tsx`, ...) has no sticky/fixed
 * chrome at all, so this genuinely exercises the rule (it enumerates real
 * computed styles rather than hardcoding an expected selector) and passes
 * trivially today -- it will start actually constraining layout the moment
 * a sticky header or bottom bar is introduced.
 */
export async function assertNoStickyOverlap(
  page: Page,
  protectedTestIds: readonly string[],
): Promise<void> {
  const stickyBoxes = await page.evaluate(() => {
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      boxes.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
    return boxes;
  });
  if (stickyBoxes.length === 0) return;

  for (const testId of protectedTestIds) {
    const locator = page.getByTestId(testId).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible())) continue;
    const box = await locator.boundingBox();
    if (box === null) continue;
    for (const sticky of stickyBoxes) {
      const overlaps =
        box.x < sticky.x + sticky.width &&
        box.x + box.width > sticky.x &&
        box.y < sticky.y + sticky.height &&
        box.y + box.height > sticky.y;
      expect(overlaps, `${testId} must not be covered by a fixed/sticky control`).toBe(false);
    }
  }
}

/** Disables CSS animations/transitions for deterministic, non-flaky assertions and screenshots (CLAUDE.md "deterministic ... animations disabled"). Call before navigation; persists across reloads on the same `page`. */
export async function disableAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const apply = () => {
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          scroll-behavior: auto !important;
        }
      `;
      document.head.appendChild(style);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    } else {
      apply();
    }
  });
}

/**
 * The full right-pane integrity check for one state (CLAUDE.md "Playwright
 * visual verification"). Combines overflow, sticky-overlap, and
 * touch-target assertions in one call.
 */
export async function assertRightPaneIntegrity(
  page: Page,
  primaryActionTestIds: readonly string[] = [],
): Promise<void> {
  await assertNoHorizontalOverflow(page);
  await assertNoStickyOverlap(page, primaryActionTestIds);
  await assertPrimaryTouchTargets(page, primaryActionTestIds);
}

/**
 * The machine-checked above-the-fold invariant `docs/decisions/
 * 0004-consumer-workspace-information-architecture.md` decision item 6
 * requires: "A Playwright assertion is added verifying that the
 * recommendation region's top edge falls within the first viewport height
 * at each of the three canonical narrow widths -- 390, 430, and 480."
 *
 * This exists specifically because `product.md`'s "primary actions remain
 * visible without scrolling" promise (originally established by ADR 0002)
 * regressed once, silently -- two unspecced regions (`WorkspaceStatusHeader`,
 * `WebMcpStatus`) grew the page to 2040px tall with the answer starting
 * below the fold at 430px, and nothing in the test suite measured it (ADR
 * 0004 §1, quoted directly: "Nothing in the test suite measured whether the
 * answer stayed above the fold, so no gate caught the regression when it
 * happened"). A spec sentence alone already failed to hold this property
 * once; this assertion is the gate that replaces relying on that sentence
 * alone.
 *
 * Scoped to the three canonical narrow widths (<= 480px) exactly as ADR
 * 0004 states it -- `desktop-1440` is the secondary, non-canonical
 * project (`testing.md`), and the invariant is not claimed there, so this
 * is a deliberate no-op at that width rather than a silently-skipped
 * assertion.
 */
export async function assertRecommendationHeroAboveTheFold(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 480) return;

  const box = await page.getByTestId('recommendation-hero').boundingBox();
  expect(box, 'the recommendation hero must be present and rendered to measure it').not.toBeNull();
  if (box === null) return;

  expect(
    box.y,
    `recommendation-hero's top edge (${box.y}px) must fall within the first viewport height ` +
      `(${viewport.height}px) at ${viewport.width}px -- ADR 0004's above-the-fold invariant`,
  ).toBeLessThan(viewport.height);
}
