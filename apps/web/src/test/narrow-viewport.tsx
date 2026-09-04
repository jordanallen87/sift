/**
 * A component-test-level heuristic for docs/engineering-principles.md's non-negotiable "the
 * canonical UI is a 390-480 px ChatGPT right pane" constraint and
 * product.md's "no region introduces horizontal page scrolling" rule at
 * that width.
 *
 * IMPORTANT LIMITATION, stated plainly per this task's brief: jsdom (the
 * environment these Vitest component tests run in) does not run a real
 * layout/rendering engine -- it does not compute box sizes, flex/grid
 * flow, or text wrapping, so `element.scrollWidth`/`clientWidth` are not
 * meaningfully measurable here the way a real browser's would be. Asserting
 * `scrollWidth <= clientWidth` in jsdom would trivially pass (both are
 * always `0`) without proving anything, so this helper does not do that.
 *
 * Instead, this is a *structural* check: it renders the component inside an
 * explicit 390px-wide container and scans the rendered markup for the two
 * concrete ways a component can force horizontal overflow at that width
 * regardless of real layout -- a hard-coded inline `width`/`min-width`
 * greater than the given max, or a Tailwind arbitrary-value class
 * (`w-[500px]`, `min-w-[500px]`, ...) encoding the same thing. It cannot
 * catch overflow caused by real content flow (long unbroken tokens,
 * cumulative flex-basis, etc.) -- that requires a real browser, which is
 * exactly what the later Playwright cross-viewport suite
 * (docs/specs/testing.md "Browser E2E tests") is for. See this task's
 * docs/build-log.md entry for the full caveat.
 */
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

// `max-width`/`max-w-[...]` are deliberately excluded: a maximum is a
// ceiling (e.g. pinning a section to `--pane-width-max: 480px`), never a
// forced overflow, unlike a bare or `min-` width floor.
const FIXED_WIDTH_PATTERN = /(?<!max-)(?:min-)?width:\s*(\d+(?:\.\d+)?)px/gi;
const TAILWIND_ARBITRARY_MIN_WIDTH_PATTERN = /\bmin-w-\[(\d+(?:\.\d+)?)px\]/gi;
const TAILWIND_ARBITRARY_EXACT_WIDTH_PATTERN = /(?<!max-|min-)\bw-\[(\d+(?:\.\d+)?)px\]/gi;

export interface NarrowViewportCheck {
  renderResult: RenderResult;
  /** Every fixed-width declaration found (inline style or Tailwind arbitrary value) wider than the max, as `"<source>: <n>px"`. Empty when the check passes. */
  overflowRisks: string[];
}

/** Renders `ui` inside a `maxWidthPx`-wide container (390px by default -- the narrow end of the canonical pane) and reports any hard-coded width wider than the container found in the rendered markup. */
export function renderAtNarrowWidth(ui: ReactElement, maxWidthPx = 390): NarrowViewportCheck {
  const renderResult = render(
    <div data-testid="narrow-viewport-probe" style={{ width: `${maxWidthPx}px` }}>
      {ui}
    </div>,
  );

  const markup = renderResult.container.innerHTML;
  const overflowRisks: string[] = [];

  for (const match of markup.matchAll(FIXED_WIDTH_PATTERN)) {
    const px = Number(match[1]);
    if (px > maxWidthPx) {
      overflowRisks.push(`inline style: ${match[0]}`);
    }
  }

  for (const match of markup.matchAll(TAILWIND_ARBITRARY_MIN_WIDTH_PATTERN)) {
    const px = Number(match[1]);
    if (px > maxWidthPx) {
      overflowRisks.push(`class: ${match[0]}`);
    }
  }

  for (const match of markup.matchAll(TAILWIND_ARBITRARY_EXACT_WIDTH_PATTERN)) {
    const px = Number(match[1]);
    if (px > maxWidthPx) {
      overflowRisks.push(`class: ${match[0]}`);
    }
  }

  return { renderResult, overflowRisks };
}
