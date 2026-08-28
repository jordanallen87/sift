import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Flat by design (docs/build-log.md): no border/shadow -- a field
        // reads as editable via a distinct muted fill against the white
        // card it sits on, the same background-contrast mechanism as
        // card.tsx, plus the focus ring below (an a11y indicator, not
        // decorative chrome, kept regardless of the flat mandate).
        'h-9 w-full min-w-0 rounded-[var(--radius-sm)] bg-muted px-3 py-1 text-base transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
