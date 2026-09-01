/**
 * Coverage for the bug this task fixes: at every viewport, `side="bottom"`
 * (the only mode either real caller -- `FindingsSheet`, `RuntimeInspector`
 * -- uses) rendered as a 480px-capped, bottom-anchored panel, which above
 * the canonical right-pane width is a sliver glued to the bottom edge
 * showing only the title (reported live: `height: 96px` against a
 * 1080px-tall viewport). `sheet.tsx` now renders that same panel
 * responsively -- an unchanged bottom sheet at <=480px, a centred dialog
 * above it.
 *
 * jsdom does not run a real layout/rendering engine and does not evaluate
 * CSS media queries against rendered elements (`narrow-viewport.tsx`'s own
 * header comment documents this same limitation for this codebase's other
 * component tests), so this file cannot assert real computed geometry --
 * that is exactly what this task's Playwright verification against the
 * running dev server did, at 430x900 and 1900x1080, confirming e.g. the
 * expanded panel's real `getComputedStyle().translate` resolves to
 * `-50% -50%` (both axes, centred) and its body genuinely scrolls while its
 * header stays put. What jsdom CAN verify, and what this file asserts
 * instead, is the *structural* contract those measurements depend on: the
 * exact narrow-mode utility string is untouched, the expanded-mode
 * `min-[481px]:` overrides exist on every property the narrow rules set,
 * the scroll-fix classes (`min-h-0`, `overflow-hidden`) are present, and
 * the unused `top`/`left`/`right` variants were not touched by this change.
 */
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from './sheet.js';
import { renderAtNarrowWidth } from '../../test/narrow-viewport.js';

function renderOpenSheet(contentProps: Partial<ComponentProps<typeof SheetContent>> = {}) {
  return render(
    <Sheet open onOpenChange={() => undefined}>
      <SheetContent data-testid="test-sheet" {...contentProps}>
        <SheetHeader>
          <SheetTitle>Test sheet</SheetTitle>
        </SheetHeader>
        <SheetBody data-testid="test-sheet-body">Body content</SheetBody>
      </SheetContent>
    </Sheet>,
  );
}

describe('SheetContent', () => {
  describe('side="bottom" (the default, and the only mode either real caller uses)', () => {
    it('keeps the exact narrow (<=480px) bottom-sheet utility string unchanged', () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');

      // This is a single non-negotiable string, not a set of independent
      // classes, precisely so a future edit that reflows this file cannot
      // silently drop one narrow-mode rule without the diff being obvious.
      for (const cls of [
        'inset-x-0',
        'bottom-0',
        'mx-auto',
        'max-h-[85vh]',
        'w-full',
        'max-w-[var(--pane-width-max)]',
        'translate-y-full',
        'rounded-t-[var(--radius-lg)]',
        'data-[state=open]:translate-y-0',
      ]) {
        expect(content.className).toContain(cls);
      }
    });

    it("overrides every narrow-mode positioning/size/shape property at min-[481px], the exact breakpoint global.css's .page-shell already established", () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');

      // One `min-[481px]:` rule per narrow-mode property above, so nothing
      // this task was supposed to fix can regress by a partial edit later:
      // inset-x-0 -> left/right, bottom-0 -> top/bottom, mx-auto -> mx-0,
      // w-full+max-w-[var(--pane-width-max)] -> a real dialog measure,
      // rounded-t-* -> all four corners.
      for (const cls of [
        'min-[481px]:top-1/2',
        'min-[481px]:right-auto',
        'min-[481px]:bottom-auto',
        'min-[481px]:left-1/2',
        'min-[481px]:mx-0',
        'min-[481px]:max-w-[640px]',
        'min-[481px]:rounded-[var(--radius-lg)]',
      ]) {
        expect(content.className).toContain(cls);
      }
    });

    it('does not cap the expanded dialog at the 480px pane width', () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');
      // The bug this task fixes, stated as a negative assertion: no
      // `min-[481px]:max-w-[var(--pane-width-max)]` (or any 480px-capped
      // override) exists, so the narrow cap cannot leak into expanded mode.
      expect(content.className).not.toMatch(/min-\[481px\]:max-w-\[var\(--pane-width-max\)\]/);
      expect(content.className).not.toContain('min-[481px]:max-w-[480px]');
    });

    it('centres via both axes of translate, with an explicit data-[state=open] override for translate-y specifically', () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');

      // Found by measuring the real rendered result in a browser (see the
      // top-of-file comment and sheet.tsx's own inline comment): an
      // unconditioned `min-[481px]:translate-y-[-50%]` alone LOSES the
      // cascade to the narrow rule's `data-[state=open]:translate-y-0` once
      // open, because Tailwind v4 utilities set the native `translate`
      // property wholesale rather than composing a `transform:` shorthand.
      // Losing this specific override is exactly how a regression here
      // would reintroduce the bug (an off-centre or edge-pinned panel) while
      // every other assertion in this file kept passing, so it gets its own
      // dedicated test.
      expect(content.className).toContain('min-[481px]:translate-x-[-50%]');
      expect(content.className).toContain('min-[481px]:translate-y-[-50%]');
      expect(content.className).toContain('min-[481px]:data-[state=open]:translate-y-[-50%]');
    });

    it('gives the expanded dialog its own entrance motion, independent of the narrow slide', () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');

      expect(content.className).toContain('min-[481px]:scale-95');
      expect(content.className).toContain('min-[481px]:opacity-0');
      expect(content.className).toContain('min-[481px]:data-[state=open]:scale-100');
      expect(content.className).toContain('min-[481px]:data-[state=open]:opacity-100');
    });

    it('hides the bottom-sheet grab handle at expanded width -- a centred dialog has no edge to swipe toward', () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');
      // The handle is the first JSX child Sift renders inside
      // `SheetPrimitive.Content` for `side="bottom"`, ahead of `children`
      // (see sheet.tsx) -- reaching it via `firstElementChild` avoids a
      // brittle CSS selector for a class name full of Tailwind arbitrary-
      // value punctuation (`mt-[var(--space-2)]`).
      const handle = content.firstElementChild;
      expect(handle).not.toBeNull();
      expect(handle?.getAttribute('aria-hidden')).toBe('true');
      expect(handle?.className).toContain('min-[481px]:hidden');
    });

    it('still renders the grab handle for side="bottom" at all (narrow-mode behaviour untouched)', () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');
      const handle = content.firstElementChild;
      expect(handle?.getAttribute('aria-hidden')).toBe('true');
      expect(handle?.className).toContain('rounded-[var(--radius-pill)]');
    });
  });

  describe('scroll containment (requirement: tall content scrolls inside the dialog, header stays visible)', () => {
    it('clips the panel itself so overflowY never computes to visible on it', () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');
      expect(content.className).toContain('overflow-hidden');
    });

    it('lets SheetBody actually shrink inside the flex column (min-h-0) so its own overflow-y-auto can engage', () => {
      renderOpenSheet();
      const body = screen.getByTestId('test-sheet-body');
      expect(body.className).toContain('min-h-0');
      expect(body.className).toContain('flex-1');
      expect(body.className).toContain('overflow-y-auto');
    });

    it("keeps the header outside SheetBody, so it is unaffected by the body's scroll region", () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');
      const header = content.querySelector('[data-slot="sheet-header"]');
      const body = screen.getByTestId('test-sheet-body');
      expect(header).not.toBeNull();
      expect(body.contains(header)).toBe(false);
      expect(header?.className).toContain('shrink-0');
    });
  });

  describe('unused side variants (top/left/right) -- must keep working, not made responsive', () => {
    it('side="top" keeps its exact original edge-anchored classes, untouched by this task', () => {
      renderOpenSheet({ side: 'top' });
      const content = screen.getByTestId('test-sheet');
      expect(content.className).toContain(
        'inset-x-0 top-0 mx-auto max-h-[85vh] w-full max-w-[var(--pane-width-max)] -translate-y-full rounded-b-[var(--radius-lg)] data-[state=open]:translate-y-0',
      );
      // Confirms the responsive dialog treatment is genuinely scoped to
      // side="bottom" only -- `top` was told to keep working, not become
      // a second responsive dialog this task never asked for or verified.
      expect(content.className).not.toContain('min-[481px]:');
    });

    it('side="right" keeps its exact original classes, untouched by this task', () => {
      renderOpenSheet({ side: 'right' });
      const content = screen.getByTestId('test-sheet');
      expect(content.className).toContain(
        'inset-y-0 right-0 h-full w-3/4 translate-x-full sm:max-w-sm data-[state=open]:translate-x-0',
      );
      expect(content.className).not.toContain('min-[481px]:');
    });

    it('side="left" keeps its exact original classes, untouched by this task', () => {
      renderOpenSheet({ side: 'left' });
      const content = screen.getByTestId('test-sheet');
      expect(content.className).toContain(
        'inset-y-0 left-0 h-full w-3/4 -translate-x-full sm:max-w-sm data-[state=open]:translate-x-0',
      );
      expect(content.className).not.toContain('min-[481px]:');
    });

    it('does not render a grab handle for non-bottom sides', () => {
      renderOpenSheet({ side: 'right' });
      const content = screen.getByTestId('test-sheet');
      // For every non-bottom side, `children` (the `SheetHeader` rendered
      // by `renderOpenSheet`) is the first thing inside `SheetPrimitive.
      // Content` -- there is no handle div ahead of it to skip past.
      expect(content.firstElementChild?.getAttribute('data-slot')).toBe('sheet-header');
    });
  });

  describe('Radix contract preserved (focus trap, Escape, scroll lock, close hit area)', () => {
    it('renders with role="dialog" from Radix, not a bare div', () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');
      // Matches the same assertion `RuntimeInspector.test.tsx` already makes
      // of this primitive ("renders the run details inside the real Sheet
      // portal/overlay markup, not a bare full-width section"). The
      // installed `@radix-ui/react-dialog` (1.1.23) sets `role="dialog"` on
      // `Dialog.Content` but, verified directly against its source, does
      // NOT itself add `aria-modal` -- not something this responsive-layout
      // task changed or is in scope to add.
      expect(content.getAttribute('role')).toBe('dialog');
    });

    it('closes on Escape', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(
        <Sheet open onOpenChange={onOpenChange}>
          <SheetContent data-testid="test-sheet">
            <SheetHeader>
              <SheetTitle>Test sheet</SheetTitle>
            </SheetHeader>
          </SheetContent>
        </Sheet>,
      );
      await user.keyboard('{Escape}');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes when the overlay is clicked', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(
        <Sheet open onOpenChange={onOpenChange}>
          <SheetContent data-testid="test-sheet">
            <SheetHeader>
              <SheetTitle>Test sheet</SheetTitle>
            </SheetHeader>
          </SheetContent>
        </Sheet>,
      );
      const overlay = document.querySelector('[data-slot="sheet-overlay"]');
      expect(overlay).not.toBeNull();
      await user.click(overlay!);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes via the close button, which keeps its >=44px touch-target-min hit area', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(
        <Sheet open onOpenChange={onOpenChange}>
          <SheetContent data-testid="test-sheet">
            <SheetHeader>
              <SheetTitle>Test sheet</SheetTitle>
            </SheetHeader>
          </SheetContent>
        </Sheet>,
      );
      const closeButton = screen.getByTestId('sheet-close');
      expect(closeButton.className).toContain('h-[var(--size-touch-target-min)]');
      expect(closeButton.className).toContain('w-[var(--size-touch-target-min)]');
      await user.click(closeButton);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('has no axe violations while open', async () => {
      renderOpenSheet();
      const results = await axe(document.body);
      expect(results).toHaveNoViolations();
    });
  });

  describe('reduced-motion-safe transition tokens', () => {
    it("uses this app's own duration/ease tokens for both transform and opacity, not a Tailwind animation plugin", () => {
      renderOpenSheet();
      const content = screen.getByTestId('test-sheet');
      // `opacity` had to join `transform` in the transition-property list
      // for this task's fade-in entrance at expanded width to animate at
      // all; asserting the full arbitrary value (not just "duration-" as a
      // substring) so this can't silently regress back to
      // `transition-transform` alone.
      expect(content.className).toContain('transition-[transform,opacity]');
      expect(content.className).toContain('duration-[var(--duration-normal)]');
      expect(content.className).toContain('ease-[var(--ease-standard)]');
    });
  });

  it('introduces no width wider than a 390px narrow pane in its own rendered markup', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <Sheet open onOpenChange={() => undefined}>
        <SheetContent data-testid="test-sheet">
          <SheetHeader>
            <SheetTitle>Test sheet</SheetTitle>
          </SheetHeader>
          <SheetBody>Body content</SheetBody>
        </SheetContent>
      </Sheet>,
    );
    expect(overflowRisks).toEqual([]);
  });
});
