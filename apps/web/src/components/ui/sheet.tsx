/**
 * Sift's Sheet primitive — an overlay that slides/pops up over the workspace
 * rather than navigating to a new page. Two callers this task adds: the
 * Findings review ("What Sift found") and the Runtime Inspector ("Inspect
 * run"), both reached from a still-visible, non-navigating trigger (ADR
 * 0002 follow-up: "Inspect run becomes the same sheet mechanism, not a new
 * page").
 *
 * `side="bottom"` (the only mode either caller uses, and the default) is
 * responsive rather than one fixed shape: at the canonical <=480px right
 * pane it is the bottom sheet the name implies, but above that width the
 * exact same 480px-capped bottom-anchored geometry renders as a sliver
 * glued to the bottom of the viewport showing only the title -- there is no
 * "bottom edge" of a right pane once the pane itself stops constraining the
 * layout. Past `global.css`'s own `.page-shell` boundary (`min-[481px]`)
 * this becomes a centred dialog instead, so every caller gets a correctly
 * shaped overlay at both the narrow pane and a full desktop viewport without
 * choosing a variant itself. See the `side === 'bottom'` branch below for
 * the mechanics. `top`/`left`/`right` stay edge-anchored at every width --
 * unused by any current caller, kept working, not made responsive.
 *
 * Radix's Dialog primitive underneath supplies focus trapping, Escape-to-
 * close, `role="dialog"`, and scroll locking for free -- this file only
 * layers Sift's own motion and surface tokens on top, matching
 * `docs/design-system.md`'s "Shadow is reserved for things that float
 * above the page with nothing behind them in normal flow" (a sheet is
 * exactly that case, unlike the flat Button/Card primitives).
 *
 * Motion uses this app's own `--duration-*`/`--ease-*` tokens (not a
 * Tailwind animation plugin) via `transition` + `data-[state]` selectors,
 * so it is reduced-motion-safe for free through the same global zeroing
 * `tokens.css` already applies to every other component.
 */
import * as React from 'react';
import { XIcon } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-[var(--z-modal)] bg-black/35 opacity-0 transition-opacity duration-[var(--duration-normal)] ease-[var(--ease-standard)] data-[state=open]:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'bottom',
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          /*
           * `overflow-hidden` here (not just on `SheetBody`) is load-bearing, not
           * decorative: it is what makes `overflowY` on this panel compute to
           * `hidden` instead of the default `visible`, which is the other half of
           * fixing tall content -- `SheetBody` below getting `min-h-0` lets it
           * actually SHRINK to the remaining flex space (a flex item's default
           * `min-height: auto` refuses to shrink below its content size, which is
           * the classic reason a `flex-1 overflow-y-auto` child silently fails to
           * scroll and instead pushes its parent past `max-h-[85vh]`); this rule
           * is the backstop that keeps anything which still slips past that clipped
           * to the panel's rounded corners rather than visibly bleeding out of it.
           */
          'fixed z-[var(--z-modal)] flex flex-col overflow-hidden bg-card shadow-[var(--shadow-elevated)] transition-[transform,opacity] duration-[var(--duration-normal)] ease-[var(--ease-standard)]',
          side === 'bottom' &&
            cn(
              // Narrow pane (<=480px, the canonical ChatGPT right-pane width): unchanged
              // bottom-sheet behaviour -- full width, slides up from the bottom edge,
              // rounded top only, capped at 85% of viewport height with the body
              // scrolling inside it. This is the exact rule this task was told not to
              // regress, so nothing in this line changed.
              'inset-x-0 bottom-0 mx-auto max-h-[85vh] w-full max-w-[var(--pane-width-max)] translate-y-full rounded-t-[var(--radius-lg)] data-[state=open]:translate-y-0',
              /*
               * Expanded pane (>480px): the same trigger/content/Radix wiring now
               * renders a centred dialog instead of a bottom sheet, using the exact
               * 481px boundary `global.css`'s `.page-shell` already established
               * (`min-[481px]:`) rather than inventing a second breakpoint. This is
               * the fix for the reported bug -- at desktop widths the unprefixed
               * rules above pin a 480px-capped panel to the bottom edge, which
               * against a tall viewport renders as a tiny sliver showing only the
               * title. Every property the bottom-sheet rules set (`inset-x-0`,
               * `bottom-0`, `mx-auto`, `w-full`, `max-w-[...]`, `rounded-t-*`) is
               * overridden below by a `min-[481px]:` rule on the SAME CSS property,
               * which -- exactly like this codebase's existing `hidden
               * min-[481px]:grid` pattern (see `VehicleCatalogFlow.tsx`) -- wins at
               * that breakpoint because a plain, unconditioned utility (no other
               * variant at all) always loses to ANY same-property utility carrying
               * one, including a responsive one.
               *
               * `translate-y` is the one property here that needed more care, found
               * by measuring the real rendered result in a browser rather than
               * trusting that reasoning alone: Tailwind v4 utilities set the native
               * CSS `translate`/`scale` properties (not the old `transform:
               * translate(...)` composition), and confirmed live via
               * `getComputedStyle` at 1900px that an unconditioned
               * `min-[481px]:translate-y-[-50%]` LOST the cascade to the narrow
               * rule's `data-[state=open]:translate-y-0` once the panel was open --
               * a same-property fight between a responsive-only selector and a
               * data-attribute-only selector, which (unlike the `hidden
               * min-[481px]:grid` case, where only one side of the fight was ever
               * conditioned) does not resolve the way the rest of this override
               * block does. The fix is to match that rule's own variant with an
               * explicit `min-[481px]:data-[state=open]:translate-y-[-50%]` below,
               * which measurably wins (confirmed `translate: -50% -50%` at open,
               * both axes, at 1900px). The plain `min-[481px]:translate-y-[-50%]`
               * stays too, for the brief pre-open frame where `data-state` isn't
               * `open` yet and nothing else is contesting that property.
               *
               * Centring uses `left-1/2`/`top-1/2` + `translate-x-[-50%]`/
               * `translate-y-[-50%]` (both axes) rather than `inset-0`/`m-auto`,
               * because the entrance motion needs its own independent transform
               * (`scale`) -- position stays constant across data-state, only
               * `scale`/`opacity` move, so this reads as a dialog popping toward
               * the viewer, not a sheet sliding from an edge that no longer exists
               * at this width. `w-[calc(100vw-var(--space-20))]` (an intentionally
               * still-unused token before this fix -- see its "desktop-width
               * gutters only" comment in tokens.css) guarantees a minimum gutter
               * close to the 481px boundary itself, before `max-w-[640px]`
               * (comfortably inside this task's 560-720px guidance) takes over on
               * wider screens.
               */
              'min-[481px]:top-1/2 min-[481px]:right-auto min-[481px]:bottom-auto min-[481px]:left-1/2 min-[481px]:mx-0 min-[481px]:w-[calc(100vw-var(--space-20))] min-[481px]:max-w-[640px] min-[481px]:translate-x-[-50%] min-[481px]:translate-y-[-50%] min-[481px]:scale-95 min-[481px]:rounded-[var(--radius-lg)] min-[481px]:opacity-0 min-[481px]:data-[state=open]:translate-y-[-50%] min-[481px]:data-[state=open]:scale-100 min-[481px]:data-[state=open]:opacity-100',
            ),
          side === 'top' &&
            'inset-x-0 top-0 mx-auto max-h-[85vh] w-full max-w-[var(--pane-width-max)] -translate-y-full rounded-b-[var(--radius-lg)] data-[state=open]:translate-y-0',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-3/4 translate-x-full sm:max-w-sm data-[state=open]:translate-x-0',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-3/4 -translate-x-full sm:max-w-sm data-[state=open]:translate-x-0',
          className,
        )}
        {...props}
      >
        {side === 'bottom' ? (
          <div
            aria-hidden="true"
            // Hidden at expanded width: a grab handle signals "swipe down to
            // dismiss," which is a bottom-sheet-only affordance -- the centred
            // dialog it becomes at >480px has no edge to swipe toward.
            className="mx-auto mt-[var(--space-2)] h-1 w-9 shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-border-strong)] opacity-50 min-[481px]:hidden"
          />
        ) : null}
        {children}
        {showCloseButton && (
          /*
           * Deliberately NOT tooltipped, unlike every other icon-only button
           * in this app -- measured, not assumed. Radix Dialog autofocuses
           * the first tabbable element in the panel, which for most sheets
           * here is this ✕: a focus-opening tooltip therefore popped
           * "Close" unbidden every single time a sheet opened, and worse,
           * Radix Tooltip's own Escape handler consumed the FIRST Escape,
           * so the documented "Escape closes the sheet" contract (asserted
           * in `sheet.test.tsx`) silently needed two presses. A ✕ in an
           * overlay's top-right corner is also the least ambiguous icon in
           * the product, so there was nothing to buy with that cost.
           */
          <SheetPrimitive.Close
            data-testid="sheet-close"
            className="absolute top-[var(--space-3)] right-[var(--space-3)] flex h-[var(--size-touch-target-min)] w-[var(--size-touch-target-min)] items-center justify-center rounded-[var(--radius-full)] bg-muted text-muted-foreground transition-opacity duration-[var(--duration-fast)] hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        'flex shrink-0 flex-col gap-[var(--space-1)] p-[var(--space-4)] pb-[var(--space-2)]',
        className,
      )}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        // `min-h-0` overrides a flex item's default `min-height: auto`, which
        // otherwise refuses to shrink this element below its own content's
        // height even though it's `flex-1` inside a height-capped column --
        // that refusal is what let long content grow `SheetContent` right past
        // `max-h-[85vh]` instead of stopping here and scrolling internally.
        'min-h-0 flex-1 overflow-y-auto px-[var(--space-4)] pb-[var(--space-4)]',
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        'font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] font-[var(--font-weight-medium)] text-card-foreground',
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-[length:var(--font-size-sm)] text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
};
