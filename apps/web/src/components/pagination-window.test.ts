import { describe, expect, it } from 'vitest';
import {
  PAGE_GAP,
  clampPage,
  pageCountFor,
  pageRange,
  pageWindow,
  type PageSlot,
} from './pagination-window.js';

/** The catalog this bar actually has to paginate. */
const CATALOG_TOTAL = 853;

/** Renders a window the way it reads on screen, so expectations are legible. */
const shown = (slots: PageSlot[]): string => slots.join(' ');

describe('pageWindow', () => {
  it('renders no bar for an empty result set rather than "page 1 of 0"', () => {
    expect(pageWindow({ totalCount: 0, pageSize: 20, currentPage: 1 })).toEqual([]);
  });

  it('shows every page when they all fit, with no gaps', () => {
    expect(shown(pageWindow({ totalCount: 80, pageSize: 20, currentPage: 1 }))).toBe('1 2 3 4');
  });

  it('opens the catalog with a leading run and a single trailing gap', () => {
    const slots = pageWindow({ totalCount: CATALOG_TOTAL, pageSize: 20, currentPage: 1 });
    expect(shown(slots)).toBe(`1 2 3 4 5 ${PAGE_GAP} 43`);
  });

  it('brackets the current page with gaps on both sides in the middle', () => {
    const slots = pageWindow({ totalCount: CATALOG_TOTAL, pageSize: 20, currentPage: 20 });
    expect(shown(slots)).toBe(`1 ${PAGE_GAP} 19 20 21 ${PAGE_GAP} 43`);
  });

  it('flips to a trailing run at the end of the catalog', () => {
    const slots = pageWindow({ totalCount: CATALOG_TOTAL, pageSize: 20, currentPage: 43 });
    expect(shown(slots)).toBe(`1 ${PAGE_GAP} 39 40 41 42 43`);
  });

  it('never hides just one page behind a gap, which would cost width and say less', () => {
    // Page 3 of 7: a naive rule would emit "1 … 2 3 4 … 7", where each gap
    // conceals a single page.
    const slots = pageWindow({ totalCount: 140, pageSize: 20, currentPage: 3 });
    expect(slots).not.toContain(PAGE_GAP);
    expect(shown(slots)).toBe('1 2 3 4 5 6 7');
  });

  it('always returns a defined window for every page of the catalog', () => {
    // The widely copied implementation of this algorithm can fall through
    // its branches and return undefined; every page must produce slots.
    for (let page = 1; page <= pageCountFor(CATALOG_TOTAL, 20); page += 1) {
      for (const siblingCount of [0, 1, 2]) {
        const slots = pageWindow({
          totalCount: CATALOG_TOTAL,
          pageSize: 20,
          currentPage: page,
          siblingCount,
        });
        expect(Array.isArray(slots)).toBe(true);
        expect(slots.length).toBeGreaterThan(0);
      }
    }
  });

  it('fits a 390px pane at siblingCount 0 and never exceeds 7 slots', () => {
    // 7 slots is 7x44px + 6x4px = 332px, inside the 358px a 390px pane
    // leaves after gutters. siblingCount 1 reaches 9 slots / 428px, which
    // does not fit -- hence the narrow pane either drops to 0 siblings or
    // hides the numbers, as `CatalogPagination` does.
    for (let page = 1; page <= 43; page += 1) {
      const slots = pageWindow({
        totalCount: CATALOG_TOTAL,
        pageSize: 20,
        currentPage: page,
        siblingCount: 0,
      });
      expect(slots.length).toBeLessThanOrEqual(7);
    }
  });

  it('always keeps the first and last page reachable in one click', () => {
    for (let page = 1; page <= 43; page += 1) {
      const slots = pageWindow({ totalCount: CATALOG_TOTAL, pageSize: 20, currentPage: page });
      expect(slots[0]).toBe(1);
      expect(slots.at(-1)).toBe(43);
    }
  });

  it('never renders two gaps in a row or a duplicated page number', () => {
    for (let page = 1; page <= 43; page += 1) {
      const slots = pageWindow({ totalCount: CATALOG_TOTAL, pageSize: 20, currentPage: page });
      const numbers = slots.filter((slot): slot is number => slot !== PAGE_GAP);
      expect(new Set(numbers).size).toBe(numbers.length);
      expect([...numbers]).toEqual([...numbers].sort((a, b) => a - b));
      for (let i = 1; i < slots.length; i += 1) {
        expect(slots[i] === PAGE_GAP && slots[i - 1] === PAGE_GAP).toBe(false);
      }
    }
  });

  it('clamps a current page that is out of range instead of throwing', () => {
    expect(shown(pageWindow({ totalCount: 80, pageSize: 20, currentPage: 99 }))).toBe('1 2 3 4');
    expect(shown(pageWindow({ totalCount: 80, pageSize: 20, currentPage: 0 }))).toBe('1 2 3 4');
  });
});

describe('pageRange', () => {
  it('summarises the first page of the catalog', () => {
    expect(pageRange(CATALOG_TOTAL, 20, 1)).toEqual({ from: 1, to: 20, total: 853 });
  });

  it('reports a short final page honestly rather than rounding up', () => {
    // 43 pages of 20 would be 860; the last page holds 13.
    expect(pageRange(CATALOG_TOTAL, 20, 43)).toEqual({ from: 841, to: 853, total: 853 });
  });

  it('reports zeroes for an empty result set', () => {
    expect(pageRange(0, 20, 1)).toEqual({ from: 0, to: 0, total: 0 });
  });
});

describe('clampPage', () => {
  it('pulls the reader to the last populated page when the page size grows', () => {
    // Page 40 of 43 at size 20 does not exist at size 50 (18 pages).
    expect(clampPage(40, CATALOG_TOTAL, 50)).toBe(18);
  });

  it('keeps a valid page untouched', () => {
    expect(clampPage(5, CATALOG_TOTAL, 20)).toBe(5);
  });

  it('falls back to page 1 when a filter empties the results', () => {
    expect(clampPage(12, 0, 20)).toBe(1);
  });
});
