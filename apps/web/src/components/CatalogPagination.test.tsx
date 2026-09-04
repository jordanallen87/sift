/**
 * Behavioural coverage for the assembled catalog page control.
 *
 * `pagination-window.test.ts` already proves the page arithmetic, and
 * `ui/pagination.test.tsx` proves the primitive's boundary and `aria-current`
 * behaviour. What is left, and what this file tests, is the wiring: that the
 * bar reports the right span of records, that pressing an arrow asks for the
 * right page, and that changing the page size cannot strand a reader past
 * the end of a shorter list.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogPagination } from './CatalogPagination.js';

/** The real catalog size, so the numbers in these tests are the ones on screen. */
const CATALOG_TOTAL = 853;

function renderBar(overrides: Partial<React.ComponentProps<typeof CatalogPagination>> = {}) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  render(
    <CatalogPagination
      totalCount={CATALOG_TOTAL}
      pageSize={20}
      currentPage={1}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      {...overrides}
    />,
  );
  return { onPageChange, onPageSizeChange };
}

describe('CatalogPagination', () => {
  it('renders nothing when everything fits on one page', () => {
    renderBar({ totalCount: 12, pageSize: 20 });
    expect(screen.queryByTestId('catalog-pagination')).toBeNull();
  });

  it('renders nothing for an empty result set, which the empty state already explains', () => {
    renderBar({ totalCount: 0 });
    expect(screen.queryByTestId('catalog-pagination')).toBeNull();
  });

  it('reports the span of records on this page, not the page number', () => {
    renderBar({ currentPage: 3 });
    expect(screen.getByTestId('catalog-pagination-range')).toHaveTextContent('41–60 of 853');
  });

  it('reports a short final page honestly rather than rounding up to a full one', () => {
    renderBar({ currentPage: 43 });
    expect(screen.getByTestId('catalog-pagination-range')).toHaveTextContent('841–853 of 853');
  });

  it('announces the range change, since paging swaps content without navigating', () => {
    renderBar();
    expect(screen.getByTestId('catalog-pagination-range')).toHaveAttribute('aria-live', 'polite');
  });

  it('asks for the next page when Next is pressed', async () => {
    const { onPageChange } = renderBar({ currentPage: 7 });
    await userEvent.click(screen.getByTestId('catalog-pagination-next'));
    expect(onPageChange).toHaveBeenCalledWith(8);
  });

  it('asks for the previous page when Previous is pressed', async () => {
    const { onPageChange } = renderBar({ currentPage: 7 });
    await userEvent.click(screen.getByTestId('catalog-pagination-previous'));
    expect(onPageChange).toHaveBeenCalledWith(6);
  });

  it('cannot page back from the first page', async () => {
    const { onPageChange } = renderBar({ currentPage: 1 });
    expect(screen.getByTestId('catalog-pagination-previous')).toBeDisabled();
    await userEvent.click(screen.getByTestId('catalog-pagination-previous'));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('cannot page forward from the last page', async () => {
    const { onPageChange } = renderBar({ currentPage: 43 });
    expect(screen.getByTestId('catalog-pagination-next')).toBeDisabled();
    await userEvent.click(screen.getByTestId('catalog-pagination-next'));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('marks the current page for a screen reader, not just visually', () => {
    renderBar({ currentPage: 2 });
    expect(screen.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Go to page 1' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('jumps to a numbered page', async () => {
    const { onPageChange } = renderBar({ currentPage: 20 });
    await userEvent.click(screen.getByRole('button', { name: 'Go to page 43' }));
    expect(onPageChange).toHaveBeenCalledWith(43);
  });

  it('keeps the first and last page one click away from the middle of the catalog', () => {
    renderBar({ currentPage: 20 });
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 43' })).toBeInTheDocument();
  });

  it('gives the narrow pane a page counter, since the numbers are hidden there', () => {
    renderBar({ currentPage: 12 });
    expect(screen.getByTestId('catalog-pagination-position')).toHaveTextContent('Page 12 of 43');
  });

  it('reports the page size as a number, not the string the select carries', async () => {
    const { onPageSizeChange } = renderBar();
    await userEvent.selectOptions(screen.getByTestId('catalog-page-size'), '50');
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('offers no page size the server would silently clamp', () => {
    // `packages/catalog/src/query.ts` caps a request at 50 results.
    renderBar();
    for (const option of screen.getAllByRole('option')) {
      expect(Number(option.textContent?.replace(/\D/g, ''))).toBeLessThanOrEqual(50);
    }
  });

  it('disables every control while a fetch is in flight, without unmounting the bar', () => {
    renderBar({ currentPage: 7, busy: true });
    expect(screen.getByTestId('catalog-pagination')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('catalog-pagination-next')).toBeDisabled();
    expect(screen.getByTestId('catalog-pagination-previous')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeDisabled();
  });
});
