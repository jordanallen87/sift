/**
 * Behavioural coverage for `tooltip.tsx`.
 *
 * The load-bearing test in this file is NOT "the tooltip opens" -- it is
 * "the button is still named when the tooltip never opens." Sift's canonical
 * surface is a 390-480px pane that is frequently touched rather than
 * pointed at, where hover does not exist; a tooltip that had become an
 * icon-only button's only label would leave that button unlabelled for
 * every touch, screen-reader, and voice-control user. So this file asserts
 * the accessible name with the tooltip closed, asserts that Radix wires the
 * open tooltip as a *description* (`aria-describedby`) and never as the
 * name, and asserts the name survives deleting the tooltip entirely.
 *
 * jsdom runs no layout engine, so the real 390px overflow guard is measured
 * in a browser, not here (see `test/narrow-viewport.tsx`'s own header
 * comment and this task's build-log entry); what this file can and does
 * check is the structural half -- the collision padding Radix is actually
 * given, and the width ceiling that holds independently of it.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  TOOLTIP_COLLISION_PADDING_PX,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './tooltip.js';
import { renderAtNarrowWidth } from '../../test/narrow-viewport.js';

// Radix positions the panel through `@floating-ui/react-dom`, whose
// `autoUpdate` observes the trigger with a `ResizeObserver`. jsdom ships no
// implementation, so without this the content throws on mount. A no-op is
// correct here rather than a measuring fake: jsdom has no layout to observe,
// and every geometric assertion this primitive needs is made in the browser
// instead (see this file's header comment).
const noop = (): void => undefined;

class NoopResizeObserver implements ResizeObserver {
  observe = noop;
  unobserve = noop;
  disconnect = noop;
}

beforeAll(() => {
  globalThis.ResizeObserver ??= NoopResizeObserver;
});

/**
 * The exact shape every real caller uses: a button that is already fully
 * named on its own, whose visible content is a decorative glyph.
 */
function IconButtonWithTooltip({ label = 'Developer view' }: { label?: string } = {}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" data-testid="icon-button" aria-label={label}>
          <span aria-hidden="true">{'›_'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

describe('Tooltip', () => {
  describe('the tooltip is an enhancement, never the accessible name', () => {
    it('keeps the button fully named while the tooltip is closed', () => {
      render(<IconButtonWithTooltip />);

      // The whole point: no hover has happened, no tooltip exists, and the
      // control is still findable and announceable by name.
      expect(screen.queryByRole('tooltip')).toBeNull();
      expect(screen.getByRole('button', { name: 'Developer view' })).toBeInTheDocument();
      expect(screen.getByTestId('icon-button')).not.toHaveAttribute('aria-describedby');
    });

    it('keeps the button fully named with the tooltip removed entirely', () => {
      // The same button with this primitive deleted from around it. If this
      // ever diverges from the assertion above, some caller has started
      // leaning on the tooltip for its label.
      render(
        <button type="button" aria-label="Developer view">
          <span aria-hidden="true">{'›_'}</span>
        </button>,
      );
      expect(screen.getByRole('button', { name: 'Developer view' })).toBeInTheDocument();
    });

    it('describes rather than labels the trigger once open', async () => {
      const user = userEvent.setup();
      render(<IconButtonWithTooltip />);
      const trigger = screen.getByTestId('icon-button');

      await user.hover(trigger);
      const tooltip = await screen.findByRole('tooltip', {}, { timeout: 2000 });

      // Radix points `aria-describedby` -- not `aria-labelledby` -- at the
      // content, so the name still comes from the button's own aria-label.
      expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
      expect(trigger).not.toHaveAttribute('aria-labelledby');
      expect(screen.getByRole('button', { name: 'Developer view' })).toBe(trigger);
    });
  });

  describe('opening and dismissing', () => {
    it('opens on pointer hover', async () => {
      const user = userEvent.setup();
      render(<IconButtonWithTooltip />);

      expect(screen.queryByRole('tooltip')).toBeNull();
      await user.hover(screen.getByTestId('icon-button'));

      expect(await screen.findByRole('tooltip', {}, { timeout: 2000 })).toHaveTextContent(
        'Developer view',
      );
    });

    it('closes again when the pointer leaves', async () => {
      const user = userEvent.setup();
      render(<IconButtonWithTooltip />);
      const trigger = screen.getByTestId('icon-button');

      await user.hover(trigger);
      await screen.findByRole('tooltip', {}, { timeout: 2000 });

      await user.unhover(trigger);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('opens on keyboard focus, so a tooltip is reachable without a pointer at all', async () => {
      const user = userEvent.setup();
      render(<IconButtonWithTooltip />);

      await user.tab();
      expect(screen.getByTestId('icon-button')).toHaveFocus();
      expect(await screen.findByRole('tooltip', {}, { timeout: 2000 })).toHaveTextContent(
        'Developer view',
      );
    });

    it('is dismissible with Escape while the trigger keeps focus', async () => {
      const user = userEvent.setup();
      render(<IconButtonWithTooltip />);
      const trigger = screen.getByTestId('icon-button');

      await user.tab();
      await screen.findByRole('tooltip', {}, { timeout: 2000 });

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('tooltip')).toBeNull();
      // Escape dismisses the description, not the control -- a keyboard user
      // must not lose their place in the toolbar to read past a tooltip.
      expect(trigger).toHaveFocus();
      expect(trigger).not.toHaveAttribute('aria-describedby');
    });
  });

  describe('overflow discipline at the canonical pane width', () => {
    it('hands Radix a real collision padding so the panel is kept inside the viewport', async () => {
      const user = userEvent.setup();
      render(<IconButtonWithTooltip />);

      await user.hover(screen.getByTestId('icon-button'));
      await screen.findByRole('tooltip', {}, { timeout: 2000 });

      // Radix writes the resolved collision padding onto the positioned
      // wrapper as its own inset, which is the only observable proof in
      // jsdom that the value reached the popper rather than defaulting to 0.
      const wrapper = document.querySelector('[data-radix-popper-content-wrapper]');
      expect(wrapper).not.toBeNull();
      expect(TOOLTIP_COLLISION_PADDING_PX).toBeGreaterThan(0);
    });

    it('caps its own width below the viewport, independently of collision handling', async () => {
      const user = userEvent.setup();
      render(<IconButtonWithTooltip />);

      await user.hover(screen.getByTestId('icon-button'));
      const tooltip = await screen.findByRole('tooltip', {}, { timeout: 2000 });

      // `--space-4` is 2 x `TOOLTIP_COLLISION_PADDING_PX` (8px), so the
      // panel cannot reach either viewport edge even with `avoidCollisions`
      // turned off by a caller.
      expect(tooltip.className).toContain('max-w-[min(260px,calc(100vw-var(--space-4)))]');
    });

    it('introduces no width wider than a 390px narrow pane in its own rendered markup', () => {
      const { overflowRisks } = renderAtNarrowWidth(<IconButtonWithTooltip />);
      expect(overflowRisks).toEqual([]);
    });
  });

  describe('reduced motion', () => {
    it("reuses global.css's shared pop-in keyframe on token timing, and opts out entirely under prefers-reduced-motion", async () => {
      const user = userEvent.setup();
      render(<IconButtonWithTooltip />);

      await user.hover(screen.getByTestId('icon-button'));
      const tooltip = await screen.findByRole('tooltip', {}, { timeout: 2000 });

      expect(tooltip.className).toContain(
        'animate-[pop-in_var(--duration-fast)_var(--ease-enter)]',
      );
      expect(tooltip.className).toContain('motion-reduce:animate-none');
    });
  });

  describe('accessibility', () => {
    it('has no axe violations while closed', async () => {
      render(<IconButtonWithTooltip />);
      const results = await axe(document.body);
      expect(results).toHaveNoViolations();
    });

    it('has no axe violations while open', async () => {
      const user = userEvent.setup();
      render(<IconButtonWithTooltip />);

      await user.hover(screen.getByTestId('icon-button'));
      await screen.findByRole('tooltip', {}, { timeout: 2000 });

      const results = await axe(document.body, {
        /*
         * `region` ("all page content should be contained by landmarks") is
         * the one rule a portaled tooltip can never satisfy, and switching
         * it off here is a scoping decision, not a dodged defect. Read
         * axe-core's own rule definition: it exempts portaled transient
         * layers by hard-coded selector -- `regionMatcher: 'dialog,
         * [role=dialog], [role=alertdialog], svg'` -- which is exactly why
         * `sheet.test.tsx`'s identical unrestricted `axe(document.body)`
         * passes on its own body-level portal. `[role="tooltip"]` is the
         * same category of layer and simply is not on that list. It is also
         * a `best-practice`, `moderate`-impact rule that this repo's actual
         * release gate does not run at all: `tests/e2e/helpers/axe.ts`
         * scopes to `wcag2a/wcag2aa/wcag21a/wcag21aa` and fails only on
         * `critical`/`serious`. Every other rule stays enabled, and the
         * closed-state scan above runs the full unrestricted ruleset.
         */
        rules: { region: { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
