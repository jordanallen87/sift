/**
 * Sift's Pagination primitive -- the page control for any list too long to
 * render whole in a 390px pane.
 *
 * ## Why it renders buttons, not links, unless told otherwise
 *
 * This is the one substantive departure from the shadcn/ui registry's
 * version, and it exists because that version cannot express the state this
 * control spends most of its life in: `PaginationPrevious` on page 1 and
 * `PaginationNext` on the last page are *unavailable*, and an `<a>` has no
 * disabled state. Upstream renders an anchor unconditionally, which leaves
 * a caller two bad options -- ship a boundary control that looks live and
 * does nothing, or drop the `href` and ship an anchor that is not focusable
 * or activatable at all, i.e. a control a keyboard user cannot reach.
 *
 * So `PaginationLink` picks its element from its props:
 *
 * - no `href` (the default, and the only case this app has -- `apps/web`
 *   has no router; a page change here is component state, not navigation)
 *   renders `<button type="button">`, where `disabled` is a real,
 *   natively-honoured attribute: not focusable, not clickable, announced as
 *   dimmed, and skipped by Tab without any of our own code running;
 * - a real `href` renders `<a>`, keeping upstream's shape for a future
 *   caller that genuinely navigates. Disabling *that* uses the accessible
 *   link idiom rather than a fake one -- the `href` is dropped (an anchor
 *   without one is not a link and not tabbable), `aria-disabled` states the
 *   reason, and `tabIndex={-1}` removes it from the tab order explicitly
 *   for browsers that keep a focusable anchor around.
 *
 * The upstream export name is kept regardless of which element comes out,
 * because the name describes the role in the pagination row, and renaming
 * it would make every shadcn pagination example wrong for this codebase for
 * no gain.
 *
 * ## 390px discipline
 *
 * Two changes from upstream, both forced by the canonical pane rather than
 * chosen:
 *
 * - **Wrapping, not a single row.** Upstream's `flex-row` with no wrap
 *   pushes a nine-page list straight past the right edge, and `global.css`
 *   sets `overflow-x: hidden` on `html`/`body`, so that content is silently
 *   *clipped*, not revealed -- `docs/specs/product.md`'s "no region
 *   introduces horizontal page scrolling" failing in the least visible way
 *   possible. `flex-wrap` + `justify-center` turns the same overflow into a
 *   second centred row.
 * - **44px hit areas.** Upstream sizes items with the button registry's
 *   `icon` size (36px). `docs/design-system.md`'s touch-target section is
 *   explicit that this is not negotiable for an *actionable* control
 *   regardless of how small its label looks, so every item carries a
 *   `--size-touch-target-min` floor. `min-w`/`min-h` rather than a
 *   replacement size, so the floor wins over `size-9` without having to
 *   re-derive the button variants' geometry.
 *
 * At pane width `PaginationPrevious`/`PaginationNext` are chevron-only and
 * carry their name in `aria-label`; the visible word appears past
 * `global.css`'s own `min-[481px]` boundary, where there is room for it.
 * That is the repo's established narrow/expanded boundary -- upstream's
 * `sm:` (640px) sits above the entire pane range, so the label would never
 * appear at any width the pane can reach.
 *
 * ## What the ellipsis announces
 *
 * Upstream marks the whole ellipsis `aria-hidden` and *also* puts an
 * `sr-only` "More pages" inside it -- text inside an `aria-hidden` subtree
 * is removed from the accessibility tree, so that label can never be read.
 * Here only the icon is hidden and the label stays announced: skipped pages
 * are information, and a screen-reader user reading "1, 2, 3, More pages,
 * 17" learns something a sighted user learns from the glyph.
 */
import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon, EllipsisIcon } from 'lucide-react';
import { type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    // No explicit `role="navigation"`: `<nav>` already carries it, and the
    // duplicate upstream adds is the kind of redundant ARIA that makes a
    // reviewer wonder which one is load-bearing. The `aria-label` is what
    // actually matters -- it is what distinguishes this landmark from any
    // other navigation region on the page.
    <nav
      aria-label="pagination"
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn(
        'flex flex-row flex-wrap items-center justify-center gap-[var(--space-1)]',
        className,
      )}
      {...props}
    />
  );
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />;
}

/** Shared between both elements `PaginationLink` can render, so the button and anchor forms are never a different size or a different disabled treatment. */
const PAGINATION_ITEM_CLASSES =
  'min-h-[var(--size-touch-target-min)] min-w-[var(--size-touch-target-min)] aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:font-[var(--font-weight-semibold)]';

interface PaginationLinkOwnProps {
  /** The page the user is currently on. Sets `aria-current="page"` -- the only thing that tells a screen-reader user where they are in the list. */
  isActive?: boolean;
  /** Unavailable in the current state (`Previous` on the first page, `Next` on the last). See this file's header for why each element form disables differently. */
  disabled?: boolean;
  size?: VariantProps<typeof buttonVariants>['size'];
}

/**
 * A union rather than one prop type with an optional `href`, so the element
 * that actually renders and the props that are legal on it can never
 * disagree: `target`/`rel`/`download` are only accepted alongside a real
 * `href`, and `form`/`name`/`value` only without one.
 */
type PaginationLinkProps = PaginationLinkOwnProps &
  (
    | ({ href: string } & Omit<React.ComponentProps<'a'>, 'href'>)
    | ({ href?: undefined } & Omit<React.ComponentProps<'button'>, 'type'>)
  );

function PaginationLink(props: PaginationLinkProps) {
  const { className, isActive = false, disabled = false, size = 'icon' } = props;

  const shared = {
    'data-slot': 'pagination-link',
    'data-active': isActive ? 'true' : undefined,
    'aria-current': isActive ? ('page' as const) : undefined,
    className: cn(
      buttonVariants({ variant: isActive ? 'outline' : 'ghost', size }),
      PAGINATION_ITEM_CLASSES,
      className,
    ),
  };

  if (props.href !== undefined) {
    const {
      className: _className,
      isActive: _isActive,
      disabled: _disabled,
      size: _size,
      href,
      tabIndex,
      ...anchorProps
    } = props;

    return (
      <a
        {...anchorProps}
        {...shared}
        // Dropping the `href` is the disabling, not a side effect of it: an
        // anchor without one is not exposed as a link and is not tabbable,
        // which is exactly the state wanted. `aria-disabled` says *why* to
        // anyone who reaches it another way, and the explicit `tabIndex`
        // covers a caller who had put this anchor in the tab order by hand.
        href={disabled ? undefined : href}
        aria-disabled={disabled ? true : undefined}
        tabIndex={disabled ? -1 : tabIndex}
      />
    );
  }

  const {
    className: _className,
    isActive: _isActive,
    disabled: _disabled,
    size: _size,
    href: _href,
    ...buttonProps
  } = props;

  return <button {...buttonProps} {...shared} type="button" disabled={disabled} />;
}

/** `--space-2-5` is the horizontal padding an icon-plus-label control needs to keep both ends off the 44px hit box's edge; the `size="default"` variant's own `px-4` is tuned for a text-only button. */
const PAGINATION_DIRECTION_CLASSES = 'gap-[var(--space-1)] px-[var(--space-2-5)]';

function PaginationPrevious(props: PaginationLinkProps) {
  return (
    // Props are spread whole rather than destructured: `PaginationLinkProps`
    // is a discriminated union, and pulling `className` out of it first
    // would separate `href` from the element-specific props it discriminates,
    // leaving the rest object un-narrowable.
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      {...props}
      className={cn(PAGINATION_DIRECTION_CLASSES, props.className)}
    >
      <ChevronLeftIcon aria-hidden="true" />
      <span className="hidden min-[481px]:inline">Previous</span>
    </PaginationLink>
  );
}

function PaginationNext(props: PaginationLinkProps) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      {...props}
      className={cn(PAGINATION_DIRECTION_CLASSES, props.className)}
    >
      <span className="hidden min-[481px]:inline">Next</span>
      <ChevronRightIcon aria-hidden="true" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="pagination-ellipsis"
      className={cn(
        'flex min-h-[var(--size-touch-target-min)] min-w-[var(--size-touch-target-min)] items-center justify-center text-muted-foreground',
        className,
      )}
      {...props}
    >
      <EllipsisIcon aria-hidden="true" className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
export type { PaginationLinkProps };
