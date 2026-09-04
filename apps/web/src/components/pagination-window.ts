/**
 * Which page numbers a pagination bar should render, and where the gaps go.
 *
 * shadcn's `Pagination` is presentational only -- it draws links, ellipses
 * and prev/next, and has no opinion about which numbers belong on screen.
 * That decision is this module, kept separate from the components so it can
 * be tested as arithmetic rather than through a DOM.
 *
 * ## Why the width matters more than it looks
 *
 * The catalog is 853 vehicles. At 20 a page that is 43 pages, and the widest
 * bar has to fit inside a 390px pane -- 358px after the shell's gutters.
 * `ui/pagination.tsx` sizes its items to the 44px touch-target minimum
 * `docs/design-system.md` requires, not the shadcn registry's 36px, so with
 * `gap-1` (4px) between them:
 *
 *   siblingCount 1 -> up to 9 slots -> 9x44 + 8x4 = 428px  (does not fit)
 *   siblingCount 0 -> up to 7 slots -> 7x44 + 6x4 = 332px
 *
 * A caller that shows numbers at 390px therefore has to pass
 * `siblingCount: 0`. `CatalogPagination` takes the other available route --
 * it hides the numbers below 481px entirely and shows a `Page n of m`
 * counter instead, which is what shadcn's own `DataTablePagination` does --
 * so it can afford `siblingCount: 1` in the width where numbers appear.
 * Callers choose; this module just honours it.
 */

/** The gap marker. A string so a caller can `=== PAGE_GAP` without a type guard. */
export const PAGE_GAP = '…';

export type PageSlot = number | typeof PAGE_GAP;

export interface PageWindowInput {
  /** Total matching records, as the server reports them -- not the current page's length. */
  totalCount: number;
  pageSize: number;
  /** 1-based. */
  currentPage: number;
  /** Page numbers to show either side of the current one. */
  siblingCount?: number;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => index + start);
}

export function pageCountFor(totalCount: number, pageSize: number): number {
  if (pageSize <= 0) return 0;
  return Math.ceil(Math.max(totalCount, 0) / pageSize);
}

/**
 * The slots to render, left to right.
 *
 * Returns `[]` for an empty result set, so a caller renders no bar at all
 * rather than a lone "Page 1 of 0".
 */
export function pageWindow({
  totalCount,
  pageSize,
  currentPage,
  siblingCount = 1,
}: PageWindowInput): PageSlot[] {
  const pageCount = pageCountFor(totalCount, pageSize);
  if (pageCount === 0) return [];

  // first + last + current + two gaps + the siblings either side.
  const maxSlots = siblingCount + 5;
  if (maxSlots >= pageCount) return range(1, pageCount);

  const page = Math.min(Math.max(currentPage, 1), pageCount);
  const leftSibling = Math.max(page - siblingCount, 1);
  const rightSibling = Math.min(page + siblingCount, pageCount);

  const gapOnLeft = leftSibling > 2;
  const gapOnRight = rightSibling < pageCount - 1;

  if (!gapOnLeft && !gapOnRight) return range(1, pageCount);
  if (!gapOnLeft) return fillLoneGaps([...range(1, 3 + 2 * siblingCount), PAGE_GAP, pageCount]);
  if (!gapOnRight) {
    return fillLoneGaps([1, PAGE_GAP, ...range(pageCount - (3 + 2 * siblingCount) + 1, pageCount)]);
  }
  return fillLoneGaps([1, PAGE_GAP, ...range(leftSibling, rightSibling), PAGE_GAP, pageCount]);
}

/**
 * Replaces any gap that conceals exactly one page with that page.
 *
 * The branches above decide where a run ends, not how much a gap hides, so
 * they can produce `1 2 3 4 5 … 7` -- an ellipsis standing in for page 6
 * alone. That occupies the same slot the number would and tells the reader
 * strictly less, so the number wins. Slot count is unchanged either way,
 * which is what keeps the bar's width predictable.
 */
function fillLoneGaps(slots: PageSlot[]): PageSlot[] {
  return slots.map((slot, index) => {
    if (slot !== PAGE_GAP) return slot;
    const before = slots[index - 1];
    const after = slots[index + 1];
    const hidesOnePage =
      typeof before === 'number' && typeof after === 'number' && after - before === 2;
    return hidesOnePage ? before + 1 : slot;
  });
}

export interface PageRange {
  /** 1-based index of the first record on this page. */
  from: number;
  /** 1-based index of the last record on this page, clamped to `totalCount`. */
  to: number;
  total: number;
}

/**
 * The "1-20 of 853" summary.
 *
 * Reads from `totalCount` and the page position rather than from the
 * returned array's length, so a short final page still reports the right
 * numbers.
 */
export function pageRange(totalCount: number, pageSize: number, currentPage: number): PageRange {
  const total = Math.max(totalCount, 0);
  if (total === 0 || pageSize <= 0) return { from: 0, to: 0, total };
  const page = Math.min(Math.max(currentPage, 1), pageCountFor(total, pageSize));
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(page * pageSize, total), total };
}

/**
 * Keeps a page number in range after the result set or page size changes.
 *
 * Growing the page size while deep in a list would otherwise strand the user
 * past the end and render an empty page; this pulls them to the last page
 * that still has records on it.
 */
export function clampPage(currentPage: number, totalCount: number, pageSize: number): number {
  const pageCount = pageCountFor(totalCount, pageSize);
  if (pageCount === 0) return 1;
  return Math.min(Math.max(currentPage, 1), pageCount);
}
