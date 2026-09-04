/**
 * Behavioural coverage for `dialog.tsx`.
 *
 * A blocking overlay is the one surface in this app where a missing
 * accessible name or a broken dismissal is not a cosmetic defect -- the
 * user cannot get back to the case without answering it. So the
 * load-bearing tests here are the ones a library cannot be trusted for:
 * the dialog resolves a real accessible name from its `DialogTitle`, focus
 * actually enters the panel and comes back to the trigger afterwards, Tab
 * cannot escape it, and every documented way out (Escape, the overlay, the
 * ✕, a `DialogClose`) genuinely closes it without firing the confirming
 * action.
 *
 * jsdom runs no layout engine, so the geometry half of this file's contract
 * (the panel really staying inside a 390px viewport, its body really
 * scrolling) is measured by the Playwright cross-viewport gate, exactly as
 * `test/narrow-viewport.tsx`'s own header comment describes for every
 * component test in this codebase. What is asserted here instead is the
 * structural contract that geometry depends on -- a viewport-relative
 * width with no fixed pixel width anywhere in the portal, a clipped flex
 * column with a `min-h-0 flex-1` scroll region inside it, and the ✕ sitting
 * outside that region so it cannot scroll away.
 */
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.js';

const TITLE = 'Remove the 2019 Outback from this comparison?';
const DESCRIPTION = 'Its evidence stays in the case record either way.';

const noop = (): void => undefined;

/** The shape a real confirmation takes: a named trigger, a question, a dismissing action, and a consequential action that is NOT a `DialogClose`. */
function ConfirmDialog({
  onConfirm = noop,
  // Spread rather than passed through a named parameter with a default, so
  // that omitting it here really does exercise `DialogContent`'s own
  // default (the repo runs with `exactOptionalPropertyTypes`, under which
  // an explicit `showCloseButton={undefined}` is a type error, not a
  // synonym for "not passed"). Same pattern as `sheet.test.tsx`.
  ...contentProps
}: { onConfirm?: () => void } & Pick<
  ComponentProps<typeof DialogContent>,
  'showCloseButton'
> = {}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" data-testid="dialog-trigger">
          Remove option
        </button>
      </DialogTrigger>
      <DialogContent {...contentProps}>
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <button type="button" data-testid="dialog-cancel">
              Keep it
            </button>
          </DialogClose>
          <button type="button" data-testid="dialog-confirm" onClick={onConfirm}>
            Remove
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByTestId('dialog-trigger'));
  return screen.findByRole('dialog');
}

describe('Dialog', () => {
  describe('accessible name and description', () => {
    it('takes its name from DialogTitle, so it is findable by that name and not merely by role', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);

      await user.click(screen.getByTestId('dialog-trigger'));

      // `{ name }` is the assertion, not the query convenience: an unnamed
      // dialog still matches `getByRole('dialog')`, so only naming the
      // expected string proves `DialogTitle` is actually wired to
      // `aria-labelledby` rather than rendered as decorative text.
      expect(await screen.findByRole('dialog', { name: TITLE })).toBeInTheDocument();
    });

    it('wires DialogDescription to aria-describedby', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);

      const dialog = await openDialog(user);

      expect(dialog).toHaveAccessibleDescription(DESCRIPTION);
    });

    it('does not exist in the document at all before the trigger is used', () => {
      render(<ConfirmDialog />);

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('dialog-trigger')).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('focus management', () => {
    it('moves focus into the panel on open and back to the trigger on close', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);
      const trigger = screen.getByTestId('dialog-trigger');

      const dialog = await openDialog(user);
      expect(dialog.contains(document.activeElement)).toBe(true);

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger).toHaveFocus();
    });

    it('traps Tab inside the panel rather than letting focus walk out into the case behind it', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);

      const dialog = await openDialog(user);

      // More presses than there are focusable controls (cancel, confirm,
      // ✕), so this only passes if the scope genuinely loops back to the
      // first one instead of falling off the end into the page.
      for (let press = 0; press < 5; press += 1) {
        await user.tab();
        expect(dialog.contains(document.activeElement)).toBe(true);
      }
    });
  });

  describe('every documented way out closes it, and none of them decides anything', () => {
    it('closes on Escape', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(<ConfirmDialog onConfirm={onConfirm} />);
      await openDialog(user);

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('closes when the overlay behind it is clicked', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(<ConfirmDialog onConfirm={onConfirm} />);
      await openDialog(user);

      const overlay = document.querySelector('[data-slot="dialog-overlay"]');
      expect(overlay).not.toBeNull();
      await user.click(overlay!);

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('closes via the ✕, which keeps a full 44px hit area', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);
      await openDialog(user);

      const closeButton = screen.getByTestId('dialog-close');
      expect(closeButton.className).toContain('h-[var(--size-touch-target-min)]');
      expect(closeButton.className).toContain('w-[var(--size-touch-target-min)]');

      await user.click(closeButton);

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes via a DialogClose-wrapped action without invoking the consequential one next to it', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(<ConfirmDialog onConfirm={onConfirm} />);
      await openDialog(user);

      await user.click(screen.getByTestId('dialog-cancel'));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('leaves the panel open when the consequential action runs, so the caller owns that transition', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(<ConfirmDialog onConfirm={onConfirm} />);
      await openDialog(user);

      await user.click(screen.getByTestId('dialog-confirm'));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('showCloseButton', () => {
    it('renders the ✕ and marks the panel so the header reserves its hit area', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);

      const dialog = await openDialog(user);

      expect(screen.getByTestId('dialog-close')).toBeInTheDocument();
      expect(dialog).toHaveAttribute('data-close-button', 'visible');
      expect(dialog.className).toContain('group/dialog-content');

      // The header's gutter is a variant of that attribute, not a class the
      // header adds for itself -- asserted as a pair so neither half can be
      // dropped without the other failing.
      const header = dialog.querySelector('[data-slot="dialog-header"]');
      expect(header?.className).toContain(
        'group-data-[close-button=visible]/dialog-content:pr-[var(--size-touch-target-min)]',
      );
    });

    it('omits the ✕ and the reserved gutter when a caller turns it off', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog showCloseButton={false} />);

      const dialog = await openDialog(user);

      expect(screen.queryByTestId('dialog-close')).toBeNull();
      expect(dialog).toHaveAttribute('data-close-button', 'hidden');
    });
  });

  describe('scroll containment', () => {
    it('clips the panel and caps it against the dynamic viewport height', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);

      const dialog = await openDialog(user);

      expect(dialog.className).toContain('overflow-hidden');
      expect(dialog.className).toContain('flex-col');
      // `dvh`, not `vh`: `vh` is the LARGE viewport (mobile toolbars
      // retracted), which is taller than what is actually visible -- the
      // same reasoning global.css records for the app shell's own height.
      expect(dialog.className).toContain('max-h-[calc(100dvh-var(--space-8))]');
      expect(dialog.className).not.toContain('max-h-[calc(100vh');
    });

    it('gives the content one scroll region that can actually shrink inside the flex column', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);

      const dialog = await openDialog(user);
      const scrollArea = dialog.querySelector('[data-slot="dialog-scroll-area"]');

      expect(scrollArea).not.toBeNull();
      // `min-h-0` is the half that is easy to lose in a refactor and
      // silently breaks scrolling: a flex item defaults to
      // `min-height: auto` and refuses to shrink below its content, so the
      // panel grows past its cap instead of the region scrolling.
      expect(scrollArea?.className).toContain('min-h-0');
      expect(scrollArea?.className).toContain('flex-1');
      expect(scrollArea?.className).toContain('overflow-y-auto');
    });

    it('keeps the ✕ outside the scroll region, so the one way out cannot scroll away', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);

      const dialog = await openDialog(user);
      const scrollArea = dialog.querySelector('[data-slot="dialog-scroll-area"]');
      const closeButton = screen.getByTestId('dialog-close');

      expect(dialog.contains(closeButton)).toBe(true);
      expect(scrollArea?.contains(closeButton)).toBe(false);
    });
  });

  describe('overflow discipline at the canonical pane width', () => {
    it('sizes itself from the viewport, capped at the pane width before any expanded measure', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);

      const dialog = await openDialog(user);

      // A gutter that survives at 390px, stated relative to the viewport
      // rather than to a breakpoint guess.
      expect(dialog.className).toContain('w-[calc(100vw-var(--space-8))]');
      expect(dialog.className).toContain('max-w-[var(--pane-width-max)]');
      // The wider measure is scoped to global.css's own established
      // narrow/expanded boundary, not a second invented breakpoint.
      expect(dialog.className).toContain('min-[481px]:max-w-[560px]');
    });

    it('introduces no fixed pixel width wider than a 390px pane anywhere in the portal', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);
      await openDialog(user);

      /*
       * `test/narrow-viewport.tsx`'s shared probe is deliberately NOT used
       * here: it scans the render container, and every part of this
       * component that could overflow is portaled to `document.body`,
       * outside that container -- so the shared helper would return an
       * empty result for a panel of any width at all. The same check is
       * therefore run against the markup that actually exists.
       */
      const portalMarkup = document.body.innerHTML;
      const risks = [
        // The same three shapes the shared probe looks for, and the same
        // reason `max-` is excluded from two of them: a maximum is a
        // ceiling, never a forced overflow.
        ...portalMarkup.matchAll(/(?<!max-|min-)\bw-\[(\d+(?:\.\d+)?)px\]/g),
        ...portalMarkup.matchAll(/\bmin-w-\[(\d+(?:\.\d+)?)px\]/g),
        ...portalMarkup.matchAll(/(?<!max-)(?:min-)?width:\s*(\d+(?:\.\d+)?)px/gi),
      ]
        .filter((match) => Number(match[1]) > 390)
        .map((match) => match[0]);

      expect(risks).toEqual([]);
    });
  });

  describe('motion', () => {
    it("animates on this app's own duration/ease tokens, and on the properties Tailwind v4 actually sets", async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);

      const dialog = await openDialog(user);

      // `scale`/`opacity`, not `transform`: Tailwind v4 utilities set the
      // native `translate`/`scale` properties rather than composing a
      // `transform` shorthand (measured and recorded in sheet.tsx), so a
      // `transition-transform` here would transition nothing at all.
      expect(dialog.className).toContain('transition-[scale,opacity]');
      expect(dialog.className).toContain('duration-[var(--duration-normal)]');
      expect(dialog.className).toContain('ease-[var(--ease-standard)]');
      expect(dialog.className).toContain('data-[state=open]:scale-100');
      expect(dialog.className).toContain('data-[state=open]:opacity-100');
    });

    it('centres on both axes and never re-declares translate under a state variant', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);

      const dialog = await openDialog(user);

      expect(dialog.className).toContain('translate-x-[-50%]');
      expect(dialog.className).toContain('translate-y-[-50%]');
      // The cascade fight sheet.tsx had to measure its way out of exists
      // only where a state or responsive variant contests `translate`.
      // Keeping the entrance on `scale` means nothing here contests it, and
      // this assertion is what keeps that true.
      expect(dialog.className).not.toMatch(/data-\[state=[a-z]+\]:translate-/);
    });
  });

  describe('accessibility', () => {
    it('has no axe violations while open', async () => {
      const user = userEvent.setup();
      render(<ConfirmDialog />);
      await openDialog(user);

      expect(await axe(document.body)).toHaveNoViolations();
    });

    it('has no axe violations while closed', async () => {
      render(<ConfirmDialog />);

      expect(await axe(document.body)).toHaveNoViolations();
    });
  });
});
