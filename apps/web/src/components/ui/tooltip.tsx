/**
 * Sift's Tooltip primitive -- a hover/focus label for a control whose
 * meaning is otherwise carried by an icon alone.
 *
 * ## A tooltip is not an accessible name
 *
 * This is the single rule that governs every use of this file. Radix wires
 * the content to its trigger through `aria-describedby` -- a *description*,
 * never `aria-labelledby` -- and it only ever opens on pointer hover or
 * keyboard focus. On Sift's canonical surface that is not a pedantic
 * distinction: the product lives in a 390-480px ChatGPT right pane that is
 * frequently *touched* rather than pointed at, and on a touch device hover
 * does not exist at all, so the tooltip simply never appears. An icon-only
 * button whose only label is its tooltip is therefore an unlabelled button
 * for every touch user, every screen-reader user, and every voice-control
 * user.
 *
 * So: every trigger wrapped here must already carry a real accessible name
 * (an `aria-label`, or visually-hidden text inside the button) and must
 * still be fully usable with the tooltip deleted. The tooltip only repeats
 * that name for sighted pointer users; nothing depends on it. Sift's
 * convention is that the tooltip string is the control's accessible name
 * verbatim, so the two can never drift apart and a voice-control user can
 * always say what they see (WCAG 2.5.3, "Label in Name").
 *
 * ## Overflow at 390px
 *
 * `docs/specs/product.md`'s "no region introduces horizontal page
 * scrolling" rule applies to a floating layer as much as to page content,
 * and `global.css` sets `overflow-x: hidden` on `html`/`body`, which clips
 * -- rather than reveals -- anything a tooltip pushes past the right edge.
 * Two independent guards, both needed: Radix's collision handling with a
 * real `collisionPadding` keeps the panel inside the viewport, and the
 * content's own `max-w` can never exceed the viewport minus that padding on
 * both sides, so there is nothing to shift in the first place. Verified in
 * a real browser at 390px against a trigger sitting at the right edge of
 * the app bar -- jsdom cannot measure this (see `test/narrow-viewport.tsx`).
 *
 * ## Motion and delay
 *
 * The entrance reuses `global.css`'s existing shared `pop-in` keyframe and
 * `--duration-fast`/`--ease-enter` tokens rather than inventing a curve, so
 * it matches the rest of the app's small fixed motion vocabulary; it is
 * reduced-motion-safe twice over -- `--duration-fast` is zeroed under
 * `prefers-reduced-motion` in `tokens.css`, `global.css` additionally forces
 * `animation-duration: 0.01ms !important` on everything, and the explicit
 * `motion-reduce:animate-none` below states the intent at the component
 * itself instead of relying only on those globals.
 *
 * The open *delay* is not motion -- it is an intent filter. A pane this
 * narrow puts controls close together, so a zero-delay tooltip fires on
 * every cursor transit and the pane flickers; `TOOLTIP_OPEN_DELAY_MS` is
 * long enough that only a deliberate rest opens one.
 *
 * ## Self-providing
 *
 * Radix requires a `Tooltip.Provider` ancestor. `Tooltip` supplies its own
 * rather than depending on one mounted in `AppProviders`, which is what
 * lets any component test render a tooltipped control in isolation exactly
 * as it renders every other primitive here. `TooltipProvider` is still
 * exported for a caller that wants one shared timing group.
 */
'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Long enough that crossing a control on the way to another one never opens
 * a tooltip, short enough that resting on an icon still feels answered.
 * Well under Radix's own 700ms default, which reads as unresponsive for a
 * label the user is actively looking for.
 */
const TOOLTIP_OPEN_DELAY_MS = 400;

/** Once one tooltip has opened, moving to a neighbouring control within this window opens the next one immediately -- scanning a row of icons should not re-pay the delay at every step. */
const TOOLTIP_SKIP_DELAY_MS = 300;

/** `--space-2` (8px) as a number, because Radix's collision API takes CSS pixels, not a token string. The minimum gap kept between the panel and every viewport edge. */
const TOOLTIP_COLLISION_PADDING_PX = 8;

/** `--space-1-5` (6px) as a number, for the same reason: the gap between the trigger and the panel. */
const TOOLTIP_SIDE_OFFSET_PX = 6;

function TooltipProvider({
  delayDuration = TOOLTIP_OPEN_DELAY_MS,
  skipDelayDuration = TOOLTIP_SKIP_DELAY_MS,
  // Nothing this primitive renders is interactive -- it is a label, not a
  // popover -- so keeping it open while the pointer travels onto it only
  // makes it linger over the content beneath.
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  );
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = TOOLTIP_SIDE_OFFSET_PX,
  collisionPadding = TOOLTIP_COLLISION_PADDING_PX,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        data-testid="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          // Inverted ink-on-paper rather than another white card: a tooltip
          // floats over content it must not be confused with, and the flat
          // surface tokens every panel here uses would read as one more
          // card. `--shadow-elevated` is the same "floating above the page
          // with nothing behind it in normal flow" case `sheet.tsx` cites.
          'z-[var(--z-overlay)] rounded-[var(--radius-sm)] bg-[var(--color-ink)] px-[var(--space-2)] py-[var(--space-1)] text-[length:var(--font-size-xs)] leading-[var(--line-height-snug)] font-[var(--font-weight-medium)] text-[var(--color-ink-on-brand)] shadow-[var(--shadow-elevated)] select-none',
          // The overflow guard, stated as a ceiling that holds even if
          // collision handling is ever disabled by a caller: never wider
          // than the viewport less `TOOLTIP_COLLISION_PADDING_PX` on BOTH
          // sides (`--space-4` = 2x8px). 260px is the comfortable measure
          // above that, and applies at every width the pane can reach.
          'max-w-[min(260px,calc(100vw-var(--space-4)))]',
          // Scale from whichever corner Radix actually anchored to after
          // collision handling, so a flipped or shifted panel still grows
          // out of its trigger rather than out of thin air.
          'origin-[var(--radix-tooltip-content-transform-origin)] animate-[pop-in_var(--duration-fast)_var(--ease-enter)] motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  TOOLTIP_OPEN_DELAY_MS,
  TOOLTIP_COLLISION_PADDING_PX,
};
