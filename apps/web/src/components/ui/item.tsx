/**
 * Sift's Item primitive -- the generic "one row of a list, with a title, a
 * supporting line, optional leading media, and trailing actions" shape that
 * `ActivityTimeline`, evidence lists, and candidate lists each currently
 * rebuild by hand. Pure `div` + `cva`; the only Radix import is `Slot`, so
 * `asChild` can turn a row into a link or a button without nesting
 * interactive elements.
 *
 * Three deliberate departures from shadcn's upstream registry source, each
 * following a rule this repo states in writing:
 *
 * 1. Radius. `tailwind.css`'s own header records the rule -- "Every shadcn
 *    component pulled into this codebase has its `rounded-md`/`rounded-lg`/
 *    etc. utility classes hand-edited to Sift's existing
 *    `rounded-[var(--radius-md)]` arbitrary-value convention instead ... one
 *    consistent radius mechanism, not two." The resolved pixel value is
 *    identical either way (tokens.css is unlayered, so its `:root` wins over
 *    Tailwind's `layer(theme)` defaults for the same variable name); the
 *    token form is used because it says out loud which scale it means.
 *
 * 2. Borders. `tokens.css`: "no card, panel, or button uses them as its
 *    primary boundary" -- flat surfaces separate themselves from the page by
 *    background lightness. So `variant="outline"` is a raised `bg-card`
 *    surface rather than a hairline rectangle, exactly as `ui/badge.tsx`
 *    redefines its own `outline` variant, and `ItemMedia`'s icon chip drops
 *    upstream's `border` since its `bg-muted` fill already is the boundary.
 *    The base keeps `border border-transparent` because the focus ring paints
 *    that border -- it is layout-only and never visible at rest.
 *
 * 3. Motion. `global.css`: "Component-level transitions should read their
 *    durations from tokens.css's --duration-* variables (already zeroed under
 *    prefers-reduced-motion there)." Upstream's hard-coded `duration-100`
 *    becomes `--duration-fast`, which is both the app's shared hover timing
 *    and reduced-motion-safe for free.
 *
 * `ItemGroup` is a real `role="list"`, which upstream leaves half-wired: a
 * `list` whose children are not `listitem`s is an `aria-required-children`
 * failure, and a bare `listitem` outside a list is an `aria-required-parent`
 * failure, so neither role can be hard-coded. The group publishes its
 * presence through context and each `Item` inside one takes `role="listitem"`
 * from that, leaving a standalone `Item` roleless. See `item.test.tsx`.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

/** True only for `Item`s rendered inside an `ItemGroup`, which is the only place `role="listitem"` is valid. */
const ItemGroupContext = React.createContext(false);

function ItemGroup({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="list"
      data-slot="item-group"
      className={cn('group/item-group flex flex-col', className)}
      {...props}
    >
      <ItemGroupContext.Provider value={true}>{children}</ItemGroupContext.Provider>
    </div>
  );
}

function ItemSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      // `Separator` defaults to `decorative`, which Radix renders as
      // `role="none"` -- the one thing that may sit between two `listitem`s
      // without breaking the group's `aria-required-children` contract.
      className={cn('my-0', className)}
      {...props}
    />
  );
}

const itemVariants = cva(
  'group/item flex flex-wrap items-center rounded-[var(--radius-md)] border border-transparent text-sm outline-none transition-colors duration-[var(--duration-fast)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [a]:transition-colors [a]:hover:bg-accent/50',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'bg-card',
        muted: 'bg-muted/50',
      },
      size: {
        default: 'gap-4 p-4',
        sm: 'gap-2.5 px-4 py-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Item({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  role,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof itemVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'div';
  const isInGroup = React.useContext(ItemGroupContext);

  return (
    <Comp
      data-slot="item"
      data-variant={variant}
      data-size={size}
      role={role ?? (isInGroup ? 'listitem' : undefined)}
      className={cn(itemVariants({ variant, size }), className)}
      {...props}
    />
  );
}

const itemMediaVariants = cva(
  'flex shrink-0 items-center justify-center gap-2 group-has-[[data-slot=item-description]]/item:translate-y-0.5 group-has-[[data-slot=item-description]]/item:self-start [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "size-8 rounded-[var(--radius-sm)] bg-muted [&_svg:not([class*='size-'])]:size-4",
        image:
          'size-10 overflow-hidden rounded-[var(--radius-sm)] [&_img]:size-full [&_img]:object-cover',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function ItemMedia({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof itemMediaVariants>) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant }), className)}
      {...props}
    />
  );
}

function ItemContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-content"
      // A second content column (a trailing value, a timestamp) sizes to its
      // own text instead of splitting the row in half with the first.
      className={cn('flex flex-1 flex-col gap-1 [&+[data-slot=item-content]]:flex-none', className)}
      {...props}
    />
  );
}

function ItemTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-title"
      className={cn('flex w-fit items-center gap-2 text-sm leading-snug font-medium', className)}
      {...props}
    />
  );
}

function ItemDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="item-description"
      // `line-clamp-2` is what keeps a row a row at the 390px pane: a long
      // rationale truncates rather than pushing every following item down the
      // stack. Callers that must show the whole string override it.
      className={cn(
        'line-clamp-2 text-sm leading-normal font-normal text-balance text-muted-foreground',
        '[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
        className,
      )}
      {...props}
    />
  );
}

function ItemActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="item-actions" className={cn('flex items-center gap-2', className)} {...props} />
  );
}

function ItemHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-header"
      // `basis-full` against the root's `flex-wrap`: a header claims its own
      // line above the media/content/actions row rather than competing with
      // them for the 390px it has.
      className={cn('flex basis-full items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

function ItemFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-footer"
      className={cn('flex basis-full items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  itemVariants,
};
