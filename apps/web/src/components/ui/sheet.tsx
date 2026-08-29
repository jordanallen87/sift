/**
 * Pax's Sheet primitive — a bottom sheet that slides up over the workspace
 * rather than navigating to a new page. Two callers this task adds: the
 * Findings review ("What Pax found") and the Runtime Inspector ("Inspect
 * run"), both reached from a still-visible, non-navigating trigger (ADR
 * 0002 follow-up: "Inspect run becomes the same sheet mechanism, not a new
 * page").
 *
 * Radix's Dialog primitive underneath supplies focus trapping, Escape-to-
 * close, `aria-modal`, and scroll locking for free -- this file only
 * layers Pax's own motion and surface tokens on top, matching
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

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
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
          'fixed z-[var(--z-modal)] flex flex-col bg-card shadow-[var(--shadow-elevated)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-standard)]',
          side === 'bottom' &&
            'inset-x-0 bottom-0 mx-auto max-h-[85vh] w-full max-w-[var(--pane-width-max)] translate-y-full rounded-t-[var(--radius-lg)] data-[state=open]:translate-y-0',
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
          <div aria-hidden="true" className="mx-auto mt-[var(--space-2)] h-1 w-9 shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-border-strong)] opacity-50" />
        ) : null}
        {children}
        {showCloseButton && (
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
      className={cn('flex shrink-0 flex-col gap-[var(--space-1)] p-[var(--space-4)] pb-[var(--space-2)]', className)}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-body"
      className={cn('flex-1 overflow-y-auto px-[var(--space-4)] pb-[var(--space-4)]', className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] font-[var(--font-weight-medium)] text-card-foreground', className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
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
