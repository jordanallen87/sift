/**
 * Sift's DropdownMenu primitive -- a short list of one-shot actions opened
 * from a single button, for the case where a toolbar has more capabilities
 * than a 390px row has room for.
 *
 * ## Why this primitive exists at all, given ADR 0008
 *
 * `WorkspaceAppBar.tsx`'s own header comment records a deliberate earlier
 * decision NOT to build one: "a real overflow menu would need a new
 * interactive disclosure primitive this task's file-ownership boundary does
 * not include," and grouping-with-a-separator was the right fix for a purely
 * *visual* crowding complaint. This file is not a reversal of that. It answers
 * a different, later complaint -- "Add a note and add a question should be in
 * either the header or footer toolbars, not at the bottom of the stack" plus
 * "the header is consuming more space than it needs to... I think it's
 * possible by using things like menus." Three create actions cannot each get
 * their own always-visible button in a 390px row; a menu is the only shape
 * that fits all three without a second header line, and it is what was asked
 * for by name.
 *
 * ADR 0008's "every capability must be reachable in both [modes]" is
 * satisfied by construction here rather than by luck: the trigger renders
 * identically in narrow and expanded layouts, so the same menu holds the same
 * items at every width -- nothing is a pointer-only or wide-only affordance.
 *
 * ## A menu costs an interaction, so it must never cost a capability
 *
 * This is the rule that governs every use of this file, and it is the reason
 * the primitive is Radix's `DropdownMenu` rather than a hand-rolled popover:
 *
 * - The trigger must carry a real accessible name of its own (`aria-label`,
 *   or visible text). Radix adds `aria-haspopup="menu"`/`aria-expanded` on
 *   top of that; it does not supply the name.
 * - Every item is reachable with the keyboard alone -- Radix's roving
 *   tabindex gives arrow keys, Home/End, typeahead, Enter/Space to activate,
 *   and Escape to dismiss, and it restores focus to the trigger on close so a
 *   keyboard user never loses their place in the toolbar.
 * - Items are `role="menuitem"`, not buttons, so a screen-reader user is told
 *   how many there are and where they are in the list.
 *
 * All of that is asserted behaviourally in `dropdown-menu.test.tsx` rather
 * than assumed from the library.
 *
 * ## Overflow at 390px
 *
 * Identical discipline to `tooltip.tsx`, for the identical reason:
 * `docs/specs/product.md`'s "no region introduces horizontal page scrolling"
 * rule applies to a floating layer as much as to page content, and
 * `global.css` sets `overflow-x: hidden` on `html`/`body`, which clips --
 * rather than reveals -- anything a panel pushes past the right edge. Two
 * independent guards: Radix's collision handling with a real
 * `collisionPadding`, and a `max-w` that can never exceed the viewport minus
 * that padding on both sides even if a caller ever disabled collisions. The
 * app bar's trigger sits at the right edge of the row, which is exactly the
 * position that would overflow without both.
 *
 * ## Surface and motion
 *
 * `bg-card` (not the inverted ink of a tooltip): this panel holds real
 * controls the user reads and clicks, so it is a small floating surface, not
 * a label. `--shadow-elevated` is `docs/design-system.md`'s "things that
 * float above the page with nothing behind them in normal flow" case, the
 * same one `sheet.tsx` cites. The entrance reuses `global.css`'s existing
 * shared `pop-in` keyframe with `--duration-fast`/`--ease-enter` rather than
 * inventing a curve, and is reduced-motion-safe twice over (`--duration-fast`
 * is zeroed under `prefers-reduced-motion` in `tokens.css`, and the explicit
 * `motion-reduce:animate-none` states the intent at the component itself).
 *
 * Every item carries the same `--size-touch-target-min` floor every other
 * control in this app does (`docs/design-system.md`'s touch-target section):
 * the canonical pane is touched at least as often as it is pointed at, and a
 * menu of 32px rows is not usable with a thumb.
 */
'use client';

import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/** `--space-2` (8px) as a number, because Radix's collision API takes CSS pixels, not a token string. The minimum gap kept between the panel and every viewport edge. */
const DROPDOWN_MENU_COLLISION_PADDING_PX = 8;

/** `--space-1-5` (6px) as a number, for the same reason: the gap between the trigger and the panel. */
const DROPDOWN_MENU_SIDE_OFFSET_PX = 6;

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuGroup({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = DROPDOWN_MENU_SIDE_OFFSET_PX,
  collisionPadding = DROPDOWN_MENU_COLLISION_PADDING_PX,
  align = 'start',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        align={align}
        className={cn(
          'z-[var(--z-overlay)] flex min-w-[11rem] flex-col gap-[var(--space-0-5)] overflow-hidden rounded-[var(--radius-md)] bg-card p-[var(--space-1)] shadow-[var(--shadow-elevated)]',
          // The overflow ceiling, stated so it holds even if a caller ever
          // turns collision handling off: never wider than the viewport less
          // `DROPDOWN_MENU_COLLISION_PADDING_PX` on BOTH sides (`--space-4` =
          // 2x8px). 280px is a comfortable measure for a short action label
          // at every width the pane can reach.
          'max-w-[min(280px,calc(100vw-var(--space-4)))]',
          // Scale from whichever corner Radix actually anchored to after
          // collision handling, so a flipped or shifted panel still grows out
          // of its trigger rather than out of thin air.
          'origin-[var(--radix-dropdown-menu-content-transform-origin)] animate-[pop-in_var(--duration-fast)_var(--ease-enter)] motion-reduce:animate-none',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn(
        'label-caps px-[var(--space-2)] py-[var(--space-1)] text-[var(--color-ink-muted)]',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        // `data-[highlighted]` rather than `:hover`/`:focus`: Radix drives one
        // roving highlight from pointer AND keyboard, so styling the real
        // attribute is what makes an arrow-key user see the same emphasis a
        // mouse user does.
        "flex min-h-[var(--size-touch-target-min)] cursor-default items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-[var(--space-2)] text-[length:var(--font-size-sm)] leading-[var(--line-height-snug)] outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn(
        'pointer-events-none -mx-[var(--space-1)] my-[var(--space-1)] h-px bg-border',
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DROPDOWN_MENU_COLLISION_PADDING_PX,
};
