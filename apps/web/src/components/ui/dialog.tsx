/**
 * Sift's Dialog primitive -- a centred, blocking overlay for a
 * stop-and-decide moment.
 *
 * ## Why this exists next to `sheet.tsx`, which already renders a dialog
 *
 * `sheet.tsx` is responsive *by shape*: a bottom sheet at the canonical
 * <=480px pane, a centred dialog past `global.css`'s own `min-[481px]`
 * boundary. That is the right treatment for the two panels it serves
 * (`FindingsSheet`, `RuntimeInspector`), because both are **browsable** --
 * the user opens them to read, scrolls, and dismisses without answering
 * anything. An edge-anchored panel capped at `85vh` is a good invitation to
 * scroll.
 *
 * A blocking question is the opposite interaction, and it is the one this
 * file is for: it interrupts, it holds a small fixed amount of content, and
 * the user cannot get back to the case without answering it. Inviting the
 * browsing posture would be a category error there, so this primitive is
 * centred at *every* width and never becomes an edge sheet -- the shape is
 * the signal, and the signal does not change under the user between the
 * pane and a desktop tab. `--z-modal`'s own token comment already names
 * this exact case ("the Runtime Inspector route, confirmation dialogs").
 *
 * The two primitives stay separate rather than one growing a `variant`
 * prop: they share only Radix, and a caller choosing between "a panel to
 * read" and "a question to answer" should be choosing a component, not a
 * string.
 *
 * ## Accessible name is not optional here
 *
 * Radix supplies the focus trap, Escape handling, `role="dialog"`,
 * `aria-modal`, scroll locking, and focus restoration to the trigger. It
 * does **not** supply a name: `DialogContent` logs an error when no
 * `DialogTitle` is rendered inside it, and an unnamed dialog is a real axe
 * failure, not a lint nit. Every caller renders a `DialogTitle` -- always,
 * including when the visual design wants no visible heading, in which case
 * it is wrapped in `sr-only` rather than dropped. `dialog.test.tsx` asserts
 * the name resolves through `getByRole('dialog', { name })` rather than
 * trusting the library for it.
 *
 * ## 390px discipline
 *
 * Two independent guards against `docs/specs/product.md`'s "no region
 * introduces horizontal page scrolling" rule, since `global.css` sets
 * `overflow-x: hidden` on `html`/`body` and would silently *clip* anything
 * pushed past the right edge rather than reveal it:
 *
 * - the panel's own width is `calc(100vw - var(--space-8))`, so a 16px
 *   gutter survives on both sides at any viewport, including 390px;
 * - `max-w` caps it at the pane width first and a real dialog measure only
 *   past the 481px boundary, so it can never be sized for a width the
 *   viewport does not have.
 *
 * Vertically the same problem has a different answer: content taller than
 * the viewport scrolls *inside* the panel. `DialogContent` is a clipped
 * flex column capped at `calc(100dvh - var(--space-8))` (`dvh`, matching
 * `global.css`'s own reasoning for the app shell -- `vh` is the large
 * viewport with mobile toolbars retracted, which is taller than what is
 * actually visible), and everything a caller passes is rendered into one
 * `min-h-0 flex-1 overflow-y-auto` region. `min-h-0` is the load-bearing
 * half: a flex item defaults to `min-height: auto` and refuses to shrink
 * below its content, which is the classic reason a `flex-1 overflow-y-auto`
 * child silently fails to scroll and instead pushes its parent past the
 * cap. Same fix, same reason, as `SheetBody`.
 *
 * That scroll region is also why the close button is a sibling of it rather
 * than inside it -- an `absolute` control inside a scrolling box scrolls
 * away with the content, which for the one control that dismisses a
 * *blocking* overlay is the worst possible thing to lose.
 *
 * ## Motion
 *
 * `--duration-*`/`--ease-*` tokens through `transition` + `data-[state]`
 * selectors, matching `sheet.tsx` rather than adding an animation plugin,
 * and reduced-motion-safe for free through `tokens.css`'s global zeroing of
 * the duration scale.
 *
 * The transitioned properties are `scale` and `opacity`, not `transform`:
 * Tailwind v4 utilities set the native `translate`/`scale`/`rotate`
 * properties instead of composing a `transform` shorthand (a fact
 * `sheet.tsx` records having measured in a real browser), so naming
 * `transform` here would transition nothing. Keeping the entrance on
 * `scale` alone also means it never contends with the `translate` that does
 * the centring -- they are different CSS properties, so unlike the cascade
 * fight `sheet.tsx` documents at length, there is nothing here for a
 * `data-[state=open]` rule to lose.
 */
import * as React from 'react';
import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-[var(--z-modal)] bg-black/35 opacity-0 transition-opacity duration-[var(--duration-normal)] ease-[var(--ease-standard)] data-[state=open]:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        /*
         * Read by `DialogHeader` below through the named group, so the
         * header reserves the close button's hit area only when there is
         * one. Rendered as a real attribute (not just a class) so the
         * relationship is visible in the DOM and assertable in a test
         * without matching on Tailwind punctuation.
         */
        data-close-button={showCloseButton ? 'visible' : 'hidden'}
        className={cn(
          'group/dialog-content fixed top-1/2 left-1/2 z-[var(--z-modal)] flex max-h-[calc(100dvh-var(--space-8))] w-[calc(100vw-var(--space-8))] max-w-[var(--pane-width-max)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-[var(--radius-lg)] bg-card shadow-[var(--shadow-elevated)] min-[481px]:max-w-[560px]',
          'scale-95 opacity-0 transition-[scale,opacity] duration-[var(--duration-normal)] ease-[var(--ease-standard)] data-[state=open]:scale-100 data-[state=open]:opacity-100',
          className,
        )}
        {...props}
      >
        <div
          data-slot="dialog-scroll-area"
          className="flex min-h-0 flex-1 flex-col gap-[var(--space-4)] overflow-y-auto p-[var(--space-4)]"
        >
          {children}
        </div>
        {showCloseButton && (
          /*
           * Deliberately not tooltipped, for the reason `sheet.tsx`
           * measured and recorded: Radix autofocuses the first tabbable
           * element in the panel, a focus-opening tooltip therefore pops
           * unbidden on every open, and Radix Tooltip's own Escape handler
           * eats the first Escape -- which would quietly turn the
           * "Escape closes" contract this file's tests assert into two
           * presses.
           */
          <DialogPrimitive.Close
            data-testid="dialog-close"
            className="absolute top-[var(--space-2)] right-[var(--space-2)] flex h-[var(--size-touch-target-min)] w-[var(--size-touch-target-min)] items-center justify-center rounded-[var(--radius-full)] bg-muted text-muted-foreground transition-opacity duration-[var(--duration-fast)] hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'flex flex-col gap-[var(--space-1)] text-left',
        /*
         * The close button is `absolute` over this row's top-right corner.
         * At 390px the panel is 358px wide and a real title -- "Remove the
         * 2019 Outback from this comparison?" -- wraps to two lines whose
         * first line runs straight under the ✕ without this. One
         * `--size-touch-target-min` of right padding clears the whole hit
         * area, and the named-group variant means a `showCloseButton={false}`
         * dialog does not pay for a gutter it has no control in.
         */
        'group-data-[close-button=visible]/dialog-content:pr-[var(--size-touch-target-min)]',
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        /*
         * `flex-col-reverse` at pane width, so the primary action written
         * last in source order renders *first* on screen: at 390px the
         * actions stack full-width, and the confirming action belongs at
         * the top of that stack under the question, not below a Cancel.
         * Past 481px there is room for one row, and the conventional
         * right-aligned order applies -- which is the same source order,
         * read normally.
         */
        'flex shrink-0 flex-col-reverse gap-[var(--space-2)] min-[481px]:flex-row min-[481px]:justify-end',
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        'font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] font-[var(--font-weight-medium)] text-card-foreground',
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
