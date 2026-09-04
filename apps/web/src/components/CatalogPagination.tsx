/**
 * The page control for the vehicle catalog.
 *
 * `pagination-window.ts` decides which page numbers belong on screen and
 * `ui/pagination.tsx` draws them; this is the assembly, including the two
 * things neither of those owns -- the "1-20 of 853" summary and the page
 * size.
 *
 * ## Numbers are an expanded-width luxury
 *
 * At 390px the pane has about 358px of usable width, and this repo's
 * pagination items are 44px (the touch-target minimum in
 * `docs/design-system.md`), not the shadcn registry's 36px. Seven slots is
 * 7x44 + 6x4 = 332px and fits; the nine slots a `siblingCount` of 1 can
 * reach is 428px and does not. Rather than shrink the hit targets, the
 * narrow pane shows `Page 3 of 43` between the arrows and the numbered
 * pages appear at `min-[481px]`, where 449px of width makes room for them.
 *
 * That is also what shadcn does on its own dense surface: its
 * `DataTablePagination` never renders page numbers at all. With 43 pages,
 * numbers are weak navigation anyway -- nobody wants page 27 specifically --
 * so the arrows and the count carry the narrow case, which is the one that
 * matters here.
 */
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { PAGE_GAP, pageCountFor, pageRange, pageWindow } from './pagination-window.js';

/**
 * `packages/catalog/src/query.ts` clamps a request to `MAX_SEARCH_RESULTS`
 * (50), so offering more would silently return fewer than the label promises.
 */
export const CATALOG_PAGE_SIZES = [10, 20, 50] as const;

export interface CatalogPaginationProps {
  /** Matching records as the server counts them, not this page's length. */
  totalCount: number;
  pageSize: number;
  /** 1-based. */
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Disables every control while a fetch is in flight, without unmounting the bar. */
  busy?: boolean;
}

export function CatalogPagination({
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  onPageSizeChange,
  busy = false,
}: CatalogPaginationProps): React.JSX.Element | null {
  const pageCount = pageCountFor(totalCount, pageSize);
  // One page needs no controls, and zero results are already explained by the
  // empty state above -- a bar reading "0-0 of 0" would only add noise.
  if (pageCount <= 1) return null;

  const { from, to, total } = pageRange(totalCount, pageSize, currentPage);
  const slots = pageWindow({ totalCount, pageSize, currentPage });
  const onFirstPage = currentPage <= 1;
  const onLastPage = currentPage >= pageCount;

  return (
    <div
      className="flex flex-col gap-[var(--space-3)]"
      data-testid="catalog-pagination"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
        {/*
          Announced rather than merely redrawn: paging is a content swap with
          no navigation, so without a live region a screen reader reports
          nothing at all after the arrow is pressed.
        */}
        <p
          className="text-[length:var(--font-size-sm)] text-muted-foreground tabular-nums"
          data-testid="catalog-pagination-range"
          aria-live="polite"
        >
          {from.toLocaleString('en-US')}&ndash;{to.toLocaleString('en-US')} of{' '}
          {total.toLocaleString('en-US')}
        </p>

        {/*
          A native select, matching every other select on this screen.
          shadcn's own guidance for a page size is a `Select` opening upward,
          because a portalled menu at the bottom of a pane would otherwise
          render off-screen -- but a native control has no such problem to
          solve. The platform picker handles its own placement, and on the
          touch surface this pane is designed for it is the better control
          anyway.
        */}
        <select
          className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] border-0 bg-muted px-[var(--space-2)] text-[length:var(--font-size-sm)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Results per page"
          data-testid="catalog-page-size"
          value={String(pageSize)}
          disabled={busy}
          onChange={(event) => {
            onPageSizeChange(Number(event.target.value));
          }}
        >
          {CATALOG_PAGE_SIZES.map((size) => (
            <option key={size} value={String(size)}>
              {size} per page
            </option>
          ))}
        </select>
      </div>

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              disabled={onFirstPage || busy}
              onClick={() => {
                onPageChange(currentPage - 1);
              }}
              data-testid="catalog-pagination-previous"
            />
          </PaginationItem>

          {/* The narrow pane's stand-in for the numbers hidden beside it. */}
          <li
            className="px-[var(--space-2)] text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] tabular-nums min-[481px]:hidden"
            data-testid="catalog-pagination-position"
          >
            Page {currentPage.toLocaleString('en-US')} of {pageCount.toLocaleString('en-US')}
          </li>

          {slots.map((slot, index) =>
            slot === PAGE_GAP ? (
              // A gap is only ever between two numbers, so its index is a
              // stable key here even though the pages around it change.
              <PaginationItem key={`gap-${String(index)}`} className="hidden min-[481px]:block">
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={slot} className="hidden min-[481px]:block">
                <PaginationLink
                  isActive={slot === currentPage}
                  disabled={busy}
                  aria-label={`Go to page ${String(slot)}`}
                  onClick={() => {
                    onPageChange(slot);
                  }}
                >
                  {slot}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationNext
              disabled={onLastPage || busy}
              onClick={() => {
                onPageChange(currentPage + 1);
              }}
              data-testid="catalog-pagination-next"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
