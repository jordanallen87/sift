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
