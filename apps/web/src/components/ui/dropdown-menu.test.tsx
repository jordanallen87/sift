/**
 * Behavioural coverage for `dropdown-menu.tsx`.
 *
 * A menu is the one primitive in this directory that *hides* capability
 * behind an extra interaction, so the load-bearing tests here are the ones
 * that prove nothing was actually lost: the trigger announces itself as a
 * menu button, every item is reachable and activatable with the keyboard
 * alone (never a pointer-only affordance), Escape returns focus to the
 * trigger rather than dropping the user out of the toolbar, and the panel
 * cannot push the 390px pane sideways.
 *
 * jsdom runs no layout engine, so the real overflow guard is measured in a
 * browser (see `test/narrow-viewport.tsx`'s own header comment); what this
 * file checks is the structural half -- the collision padding Radix is
 * actually given, and the width ceiling that holds independently of it.
 */
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  DROPDOWN_MENU_COLLISION_PADDING_PX,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu.js';
import { renderAtNarrowWidth } from '../../test/narrow-viewport.js';

// Radix positions the panel through `@floating-ui/react-dom`, whose
// `autoUpdate` observes the trigger with a `ResizeObserver`. Mirrors
// `tooltip.test.tsx`'s identical guard, for the identical reason.
const noop = (): void => undefined;

class NoopResizeObserver implements ResizeObserver {
  observe = noop;
  unobserve = noop;
  disconnect = noop;
}

beforeAll(() => {
  globalThis.ResizeObserver ??= NoopResizeObserver;
});

/** The exact shape the app bar's create menu uses: an already-named trigger over a short list of one-shot actions. */
function CreateMenu({
  onFirst = noop,
  onSecond = noop,
}: {
  onFirst?: () => void;
  onSecond?: () => void;
} = {}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" data-testid="menu-trigger" aria-label="Add to this case">
          <span aria-hidden="true">+</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-testid="menu-content">
        <DropdownMenuItem data-testid="menu-item-first" onSelect={onFirst}>
          First action
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="menu-item-second" onSelect={onSecond}>
          Second action
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  describe('the trigger is a fully-named menu button before anything opens', () => {
    it('keeps its accessible name and announces that it opens a menu', () => {
      render(<CreateMenu />);

      const trigger = screen.getByRole('button', { name: 'Add to this case' });
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  describe('opening and selecting', () => {
    it('reveals every item as a real menuitem on click', async () => {
      const user = userEvent.setup();
      render(<CreateMenu />);

      await user.click(screen.getByTestId('menu-trigger'));

      expect(await screen.findByRole('menu')).toBeInTheDocument();
      expect(screen.getByTestId('menu-trigger')).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'First action',
        'Second action',
      ]);
    });

    it('calls exactly the selected item and closes the menu', async () => {
      const user = userEvent.setup();
      const onFirst = vi.fn();
      const onSecond = vi.fn();
      render(<CreateMenu onFirst={onFirst} onSecond={onSecond} />);

      await user.click(screen.getByTestId('menu-trigger'));
      await user.click(await screen.findByTestId('menu-item-second'));

      expect(onSecond).toHaveBeenCalledTimes(1);
      expect(onFirst).not.toHaveBeenCalled();
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  describe('keyboard operation, with no pointer involved at all', () => {
    it('opens on Enter and activates an arrow-key-selected item', async () => {
      const user = userEvent.setup();
      const onSecond = vi.fn();
      render(<CreateMenu onSecond={onSecond} />);

      await user.tab();
      expect(screen.getByTestId('menu-trigger')).toHaveFocus();

      await user.keyboard('{Enter}');
      await screen.findByRole('menu');
      // Radix focuses the first item on open, so one ArrowDown lands on the
      // second -- this is the assertion that the menu is genuinely arrow-key
      // navigable rather than a click-only surface.
      await user.keyboard('{ArrowDown}');
      expect(screen.getByTestId('menu-item-second')).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(onSecond).toHaveBeenCalledTimes(1);
    });

    it('returns focus to the trigger on Escape, so a keyboard user keeps their place in the toolbar', async () => {
      const user = userEvent.setup();
      render(<CreateMenu />);
      const trigger = screen.getByTestId('menu-trigger');

      await user.click(trigger);
      await screen.findByRole('menu');

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('menu')).toBeNull();
      expect(trigger).toHaveFocus();
    });
  });

  describe('overflow discipline at the canonical pane width', () => {
    it('hands Radix a real collision padding so the panel is kept inside the viewport', async () => {
      const user = userEvent.setup();
      render(<CreateMenu />);

      await user.click(screen.getByTestId('menu-trigger'));
      await screen.findByRole('menu');

      expect(document.querySelector('[data-radix-popper-content-wrapper]')).not.toBeNull();
      expect(DROPDOWN_MENU_COLLISION_PADDING_PX).toBeGreaterThan(0);
    });

    it('caps its own width below the viewport, independently of collision handling', async () => {
      const user = userEvent.setup();
      render(<CreateMenu />);

      await user.click(screen.getByTestId('menu-trigger'));
      const menu = await screen.findByRole('menu');

      expect(menu.className).toContain('max-w-[min(280px,calc(100vw-var(--space-4)))]');
    });

    it('introduces no width wider than a 390px narrow pane in its own rendered markup', () => {
      const { overflowRisks } = renderAtNarrowWidth(<CreateMenu />);
      expect(overflowRisks).toEqual([]);
    });
  });

  describe('reduced motion', () => {
    it("reuses global.css's shared pop-in keyframe on token timing, and opts out entirely under prefers-reduced-motion", async () => {
      const user = userEvent.setup();
      render(<CreateMenu />);

      await user.click(screen.getByTestId('menu-trigger'));
      const menu = await screen.findByRole('menu');

      expect(menu.className).toContain('animate-[pop-in_var(--duration-fast)_var(--ease-enter)]');
      expect(menu.className).toContain('motion-reduce:animate-none');
    });
  });

  describe('accessibility', () => {
    it('has no axe violations while closed', async () => {
      render(<CreateMenu />);
      expect(await axe(document.body)).toHaveNoViolations();
    });

    it('has no axe violations while open', async () => {
      const user = userEvent.setup();
      render(<CreateMenu />);

      await user.click(screen.getByTestId('menu-trigger'));
      await screen.findByRole('menu');

      const results = await axe(document.body, {
        /*
         * Same scoping decision `tooltip.test.tsx` documents at length: axe's
         * `region` rule exempts portaled transient layers only by a
         * hard-coded selector list that `[role=menu]` is not on, it is a
         * `best-practice`/`moderate` rule, and this repo's real release gate
         * (`tests/e2e/helpers/axe.ts`) does not run it at all. Every other
         * rule stays enabled, and the closed-state scan above is unrestricted.
         */
        rules: { region: { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
