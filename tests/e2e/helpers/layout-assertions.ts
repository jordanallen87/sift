/**
 * Right-pane geometry assertions (CLAUDE.md "Playwright visual
 * verification"; docs/specs/testing.md's identical requirements): no
 * horizontal overflow, no fixed/sticky control overlapping a focused
 * card/approval controls/WebMCP status, primary controls stay inside the
 * viewport with at least a 44x44 CSS-pixel target.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { isNarrowWidth } from '../../../apps/web/src/hooks/width-mode-constants.js';

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
 * No element anywhere on the page holds content wider than its own box.
 *
 * `assertNoHorizontalOverflow` above measures the *document*, and this app
 * deliberately sets `html, body { overflow-x: hidden }`
 * (`apps/web/src/styles/global.css`), which pins the document's
 * `scrollWidth` to `clientWidth` no matter how badly a descendant
 * overflows. That backstop is correct -- a person should never be able to
 * scroll the pane sideways -- but it makes the document-level check blind
 * to the entire class of defect underneath it.
 *
 * `assertElementsWithinViewport` narrows the gap but only for testids a
 * caller thought to name, which cannot catch an element nobody suspected.
 * This sweeps every element instead.
 *
 * Written after the expanded layout was found rendering a 300px sidebar
 * plus a ~360px card into a 284px main column at 640px -- **ChatGPT's own
 * side-pane width** -- overflowing by 124px, with content torn across the
 * right edge. Every existing gate passed: the document-level check was
 * blinded by `overflow-x: hidden`, and 640 was not in the viewport matrix
 * at all (390/430/480/1440 stepped straight over the band from 481 to
 * ~765 where the layout could not fit).
 *
 * **Only `overflow-x: visible` is a defect**, and the distinction is the
 * whole assertion:
 *
 * - `visible` (the default) means the content genuinely *escapes* its box
 *   and is painted over whatever sits beside it. That is the tearing this
 *   exists to catch, and it is what the 640px expanded layout was doing.
 * - `auto`/`scroll` means the element *declared* its content is wider,
 *   which is the documented way for a table or a trace to behave.
 * - `hidden` means the element took responsibility for the clip. Nearly
 *   always Tailwind's `truncate` (`overflow: hidden` + `text-overflow:
 *   ellipsis`), where `scrollWidth > clientWidth` is the normal, intended
 *   state of every truncated label on the page -- flagging it would have
 *   made this assertion fire on correct code, which is how a check gets
 *   loosened until it means nothing.
 *
 * Content clipped by `hidden` with no ellipsis is a real but *different*
 * defect -- silently cut rather than torn -- and belongs to
 * `assertElementsWithinViewport`, which measures specific elements'
 * geometry directly.
 */
export async function assertNoElementOverflow(page: Page, label: string): Promise<void> {
  const offenders = await page.evaluate(() => {
    const found: { id: string; over: number; client: number; scroll: number }[] = [];
    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      if (element.clientWidth === 0) continue;
      const overflow = element.scrollWidth - element.clientWidth;
      // 2px, not 0: sub-pixel layout rounding routinely reports a 1px
      // difference on boxes that are visually exact.
      if (overflow <= 2) continue;
      if (getComputedStyle(element).overflowX !== 'visible') continue;
      found.push({
        id: element.getAttribute('data-testid') ?? `<${element.tagName.toLowerCase()}>`,
        over: overflow,
        client: element.clientWidth,
        scroll: element.scrollWidth,
      });
    }
    return found.sort((a, b) => b.over - a.over).slice(0, 5);
  });

  expect(
    offenders,
    `${label}: ${String(offenders.length)} element(s) hold content wider than their own box, which ` +
      `\`html, body { overflow-x: hidden }\` hides rather than fixes -- ` +
      offenders
        .map(
          (o) =>
            `${o.id} overflows by ${String(o.over)}px (${String(o.client)} -> ${String(o.scroll)})`,
        )
        .join('; '),
  ).toEqual([]);
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
 * any of `protectedTestIds`' bounding boxes -- UNLESS that sticky/fixed
 * element is an ANCESTOR of the protected element itself. Originally
 * written when the right-pane layout (`apps/web/src/app/App.tsx`,
 * `CaseHeader.tsx`, ...) had no sticky/fixed chrome at all, so it passed
 * trivially; `docs/decisions/0008-two-mode-product-architecture.md`
 * introduced the first real one, `WorkspaceAppBar`, deliberately pinned
 * (`sticky top-0`) so the case title/connection status/"Add option"/
 * "Findings"/"Reset demo"/"Developer view" controls it owns stay reachable
 * even after the page scrolls -- the literal fix for the project owner's
 * "these should be at the top... they'll never even see it" complaint (see
 * that component's own header comment).
 *
 * A control that lives INSIDE that pinned bar (e.g.
 * `workspace-app-bar-reset-demo`) is not "covered by" it in any meaningful
 * sense -- it is part of the same element, always exactly as visible as the
 * bar itself, which is the intended behavior, not the layout defect this
 * assertion exists to catch (a SEPARATE overlay hiding an unrelated
 * control, e.g. a bottom nav bar drawn over a form's submit button). The
 * ancestor check below is what makes that distinction; without it, this
 * assertion would fail for every single control a sticky header legitimately
 * contains, which is not the rule's own stated contract ("must not be
 * covered BY a fixed/sticky control" -- being part of one is not being
 * covered by it).
 */
export async function assertNoStickyOverlap(
  page: Page,
  protectedTestIds: readonly string[],
): Promise<void> {
  const hasStickyChrome = await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  });
  if (!hasStickyChrome) return;

  for (const testId of protectedTestIds) {
    const locator = page.getByTestId(testId).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible())) continue;
    const box = await locator.boundingBox();
    if (box === null) continue;

    const coveringTag = await locator.evaluate((protectedEl, protectedBox) => {
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const style = getComputedStyle(element);
        if (style.position !== 'fixed' && style.position !== 'sticky') continue;
        // A sticky/fixed ANCESTOR of the protected element is not covering
        // it -- the control is legitimately part of that pinned chrome, not
        // obscured by a separate overlay. Only a sticky/fixed element that
        // is not an ancestor can genuinely cover another control.
        if (element.contains(protectedEl)) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const overlaps =
          protectedBox.x < rect.x + rect.width &&
          protectedBox.x + protectedBox.width > rect.x &&
          protectedBox.y < rect.y + rect.height &&
          protectedBox.y + protectedBox.height > rect.y;
        if (overlaps) return element.tagName;
      }
      return null;
      // `box` is captured as of the `boundingBox()` call above, not
      // re-measured inside the browser -- both sides of the comparison must
      // agree on one snapshot in time, and passing it in as an argument
      // (rather than re-deriving `protectedEl.getBoundingClientRect()`
      // in-page) keeps this a single source of truth for "the protected
      // element's box" shared with the touch-target/viewport assertions
      // above, rather than reintroducing the exact two-separate-reads race
      // this rewrite otherwise avoids.
    }, box);

    expect(coveringTag, `${testId} must not be covered by a fixed/sticky control`).toBeNull();
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
  label = 'right-pane integrity',
): Promise<void> {
  await assertNoHorizontalOverflow(page);
  // The element-level sweep runs beside the document-level one rather than
  // instead of it: they catch different things, and the document check is
  // the one that would notice `overflow-x: hidden` being removed. Wiring
  // it in here rather than at each call site means every state that
  // already asserts pane integrity gets it -- twelve of them at the time
  // of writing -- instead of only the states someone remembers to update.
  await assertNoElementOverflow(page, label);
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
 *
 * The 480 below is therefore NOT the narrow/expanded layout boundary and must
 * not be replaced with `isNarrowWidth`. It is ADR 0004's enumerated scope,
 * quoted above. Those two numbers happened to coincide until the layout
 * boundary moved to 800; they are separate claims and only one of them moved.
 *
 * Known gap, deliberately not closed here: 640px -- ChatGPT's actual side
 * pane -- is narrow layout but outside ADR 0004's enumeration, so the
 * above-the-fold invariant is not asserted at the width where it arguably
 * matters most. Widening it is an ADR amendment, not a test edit.
 */
export async function assertRecommendationHeroAboveTheFold(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  const ADR_0004_CANONICAL_NARROW_MAX_PX = 480;
  if (!viewport || viewport.width > ADR_0004_CANONICAL_NARROW_MAX_PX) return;

  const hero = page.getByTestId('recommendation-hero');
  await expect(
    hero,
    'the recommendation hero must be present and rendered to measure it',
  ).toBeVisible();

  // Measured from the top of the pane, and measured WITHOUT moving anything.
  //
  // Both halves became load-bearing when the case workspace became a
  // fixed-height pane shell (`apps/web/src/app/App.tsx`): the thing that
  // scrolls is now an element, not the document. That breaks the previous
  // implementation in a way that would have gone unnoticed, because it
  // breaks in the direction of passing -- `locator.boundingBox()` scrolls
  // its target into view before it measures, so it would have scrolled the
  // pane down to the hero and then reported, truthfully but uselessly, that
  // the hero was on screen. The assertion would have held for any layout at
  // all, including the exact regression ADR 0004 added it to catch.
  //
  // `getBoundingClientRect()` inside `evaluate` reads the element where it
  // currently sits and moves nothing, and the pane is put back to the top
  // first, because "within the first viewport height" is a claim about what
  // a person meets when they arrive in this state -- not about what is
  // reachable once they have scrolled. This is strictly stronger than the
  // document-scroll version it replaces: the hero must now fit in the pane
  // that is actually visible, rather than merely in the first 844px of a
  // 2358px document.
  const top = await hero.evaluate((element) => {
    for (let node = element.parentElement; node !== null; node = node.parentElement) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') {
        node.scrollTop = 0;
        break;
      }
    }
    return element.getBoundingClientRect().top;
  });

  expect(
    top,
    `recommendation-hero's top edge (${top}px) must fall within the first viewport height ` +
      `(${viewport.height}px) at ${viewport.width}px -- ADR 0004's above-the-fold invariant`,
  ).toBeLessThan(viewport.height);
}

/**
 * A8 (`docs/superpowers/plans/2026-08-30-generic-decision-workspace.md`):
 * `maxDiffPixelRatio: 0.01` alone let a whole product rename (Pax -> Sift)
 * pass with stale baselines -- every named screenshot still rendered
 * "Start a Pax case," and the suite stayed green throughout, because a
 * raster pixel-diff at a 1% tolerance never actually reads the rendered
 * characters. Lowering the ratio further trades that failure mode for pure
 * flakiness (font antialiasing/subpixel jitter across CI runners) without
 * closing the actual hole: a pixel-diff cannot distinguish "the copy
 * changed" from "a font rendered one pixel differently."
 *
 * The fix the plan specifies is a second, independent signal: a real text
 * assertion against the exact visible string that gives a given screen its
 * identity (a heading, a status word, a primary action's label), asserted
 * immediately before the screenshot is taken. `expectNamedScreenshot` is the
 * one shared call site for that pairing (rather than a copy-pasted
 * `expect(...).toContainText(...)` above each of this suite's ~13
 * `toHaveScreenshot` call sites) -- a renamed product, an emptied region, or
 * a silently changed primary action now fails a plain, readable text
 * assertion long before any pixel comparison runs, with a message that
 * names the exact missing text rather than a diff image a person still has
 * to go look at.
 */
export interface ScreenshotIdentityCheck {
  /** The `data-testid` that carries this screen's identifying text. */
  testId: string;
  /** The exact visible substring (or pattern) that must be present. `toContainText` semantics -- not required to be the element's entire text content. */
  text: string | RegExp;
}

function isIdentityCheckList(
  value: ScreenshotIdentityCheck | readonly ScreenshotIdentityCheck[],
): value is readonly ScreenshotIdentityCheck[] {
  return Array.isArray(value);
}

/**
 * Waits until `target`'s rendered height stops changing before a capture.
 *
 * Root-caused from a real, reproducible failure pattern: `recommendation-
 * ready.png` intermittently failed in BOTH hero journeys, at several
 * viewports, and the received image was ALWAYS TALLER than the baseline
 * (e.g. 480x5037 expected vs 480x5378 received; 480x6491 vs 480x6740). A
 * consistently-taller result is not antialiasing and not flake noise — it
 * means more content had rendered by the time the screenshot fired.
 *
 * The cause is that "the run finished" and "the page has finished reacting
 * to the run" are different instants. Both journeys already wait on
 * `waitForInvestigationCompleted` and `waitForRecommendationReady`, but a
 * recommendation becomes ready while further `evidence.accepted` /
 * `obligation.updated` events are still streaming over SSE and still
 * growing regions like the readiness lists. Under full-suite parallelism
 * that tail lands slightly later, so an isolated run and a loaded run
 * capture genuinely different pages.
 *
 * Hiding more regions would not fix this — the content is real and belongs
 * in the baseline; it simply had not all arrived. Raising
 * `maxDiffPixelRatio` would have been worse still: it would mask real
 * layout regressions everywhere to paper over one timing artifact. Waiting
 * for the page to actually settle is the causal fix, and it strengthens
 * every named screenshot rather than weakening any of them.
 *
 * What is measured is the CONTENT extent, not the target's own box, and
 * that distinction is now load-bearing. This originally read
 * `boundingBox().height`, which worked while the case workspace grew with
 * its content. Since `apps/web/src/app/App.tsx` became a fixed-height pane
 * shell, `case-workspace` is exactly one viewport tall by construction, so
 * that reading is a constant: it would have "settled" on its first three
 * polls no matter how much content was still streaming in, silently
 * deleting the wait this function exists to perform. Reading the target's
 * own `scrollHeight` and that of every scrollable box inside it keeps the
 * measurement pointed at the thing that actually still grows.
 */
async function waitForStableHeight(target: Locator, name: string): Promise<void> {
  const STABLE_READINGS_REQUIRED = 3;
  const POLL_MS = 120;
  const TIMEOUT_MS = 15_000;

  const start = Date.now();
  let lastHeight = -1;
  let stableReadings = 0;

  while (Date.now() - start < TIMEOUT_MS) {
    const height = await target.evaluate((element) => {
      let extent = element.scrollHeight;
      for (const descendant of Array.from(element.querySelectorAll<HTMLElement>('*'))) {
        const overflowY = getComputedStyle(descendant).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          extent = Math.max(extent, descendant.scrollHeight);
        }
      }
      return extent;
    });
    stableReadings = height === lastHeight && height > 0 ? stableReadings + 1 : 0;
    lastHeight = height;
    if (stableReadings >= STABLE_READINGS_REQUIRED) return;
    await target.page().waitForTimeout(POLL_MS);
  }

  throw new Error(
    `screenshot "${name}": target content height never settled within ${TIMEOUT_MS}ms ` +
      `(last reading ${lastHeight}px). The page is still mutating, so any baseline ` +
      `captured here would be non-deterministic.`,
  );
}

/**
 * Returns the pane's scrolling region to the top before a capture.
 *
 * Also a consequence of the fixed-height pane shell. While the document was
 * the scroll container, an element screenshot of `case-workspace` captured
 * the whole element regardless of scroll position, so a baseline could not
 * depend on where the page happened to be scrolled. Now the element is
 * exactly one viewport tall and the capture shows whichever slice of the
 * pane is currently scrolled into view — and several assertions on the way
 * to a screenshot (anything reaching `locator.boundingBox()`, which scrolls
 * its target into view) leave that scroll position somewhere the journey
 * never explicitly chose. That is a real new source of flake, not a
 * cosmetic one: two runs of the same test could legitimately capture two
 * different slices.
 *
 * Resetting to the top makes the capture a deterministic statement — "the
 * pane as a person meets it in this state" — without weakening anything the
 * screenshot proves. It is also the slice that matters: every state this
 * suite names its baselines after is identified by the app bar, the
 * orientation shell and `RecommendationHero`, all of which live at the top
 * of the pane.
 */
async function resetPaneScroll(target: Locator): Promise<void> {
  await target.evaluate((element) => {
    for (const descendant of Array.from(element.querySelectorAll<HTMLElement>('*'))) {
      const overflowY = getComputedStyle(descendant).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') descendant.scrollTop = 0;
    }
  });
}

export async function expectNamedScreenshot(
  page: Page,
  target: Locator,
  name: string,
  identity: ScreenshotIdentityCheck | readonly ScreenshotIdentityCheck[],
  screenshotOptions?: Parameters<Locator['screenshot']>[0] & {
    mask?: Locator[];
    maxDiffPixelRatio?: number;
  },
): Promise<void> {
  const checks: readonly ScreenshotIdentityCheck[] = isIdentityCheckList(identity)
    ? identity
    : [identity];
  for (const check of checks) {
    await expect(
      page.getByTestId(check.testId),
      `screenshot "${name}": identity text missing on "${check.testId}"`,
    ).toContainText(check.text);
  }
  await waitForStableHeight(target, name);
  await resetPaneScroll(target);
  await expect(target).toHaveScreenshot(name, screenshotOptions);
}

/**
 * At an expanded (desktop) viewport, the page's main content must actually
 * USE the width rather than rendering the narrow pane centred in dead space.
 *
 * This is the assertion whose absence let the defect ADR 0007 describes ship
 * and deploy. Three top-level components each independently pinned
 * `max-w-[480px]`, so at a 1440px viewport the entire product rendered in a
 * 448px column with roughly 500px of empty grey on either side. Every gate
 * passed: the component tests pass `layout` directly and never render the
 * shell; `assertNoHorizontalOverflow` only ever gets *more* true as content
 * gets narrower; and the `desktop-1440` visual baselines were themselves
 * captured from the capped layout, so pixel equality confirmed the bug
 * instead of catching it.
 *
 * Deliberately a lower bound on width, not a snapshot: it asserts the
 * property the spec actually requires (change-set §7's "two intentional
 * information architectures"; `docs/specs/product.md` §69) without pinning a
 * particular design, so a future layout change does not have to update it.
 *
 * No-op below the narrow ceiling, so the same journey can call it at every
 * viewport in the matrix without branching at the call site.
 */
export async function assertExpandedLayoutUsesWidth(
  page: Page,
  containerTestId: string,
): Promise<void> {
  const viewportWidth = page.viewportSize()?.width ?? 0;
  if (isNarrowWidth(viewportWidth)) return;

  const container = page.getByTestId(containerTestId);
  await expect(container).toBeVisible();
  const box = await container.boundingBox();
  expect(
    box,
    `"${containerTestId}" must have a measurable box at ${viewportWidth}px`,
  ).not.toBeNull();

  // The bar is a fraction of the viewport, not a fixed pixel count.
  //
  // It used to be `NARROW_MAX_WIDTH_PX + 100`, tuned when that constant was
  // 480. That is unusable now for two separate reasons. It is *absolute*, so
  // it silently got 320px stricter when the boundary moved to 800 -- and at
  // the `expanded-820` viewport it became unsatisfiable, demanding a >900px
  // box inside an 820px window: a test that cannot pass regardless of what
  // the product renders. It also measured the wrong thing: what this asserts
  // is "the expanded layout spends the width it was given", which is
  // inherently relative to the width it was given.
  //
  // 70% of the viewport rejects the shape this exists to catch -- a shell
  // capped at the pane width and centred in dead space, which measures ~31%
  // at 1440 and ~55% at 820 -- while holding at both expanded viewports. At
  // 1440 it is a materially stricter bar than the 580px it replaces (40%).
  const minimumWidth = viewportWidth * 0.7;
  expect(
    box!.width,
    `at a ${viewportWidth}px viewport, "${containerTestId}" is ${Math.round(box!.width)}px wide -- ` +
      `the expanded layout must use the available width (at least ${Math.round(minimumWidth)}px here), ` +
      `not render a capped pane centred in dead space ` +
      `(change-set §7, docs/specs/product.md §69, ADR 0007)`,
  ).toBeGreaterThan(minimumWidth);
}
