/**
 * Behavioural coverage for `pagination.tsx`.
 *
 * Pagination is mostly boring markup with two things in it that are easy to
 * get wrong and invisible when you do: which item claims `aria-current`
 * (the only thing that tells a screen-reader user where they are in a row
 * of otherwise-identical numbers), and what a boundary control does when
 * there is no previous or next page. This file spends its assertions there.
 *
 * The boundary case is also where this primitive departs from the shadcn
 * registry -- upstream renders an `<a>` unconditionally, which has no
 * disabled state -- so the tests below check the *effect* rather than the
 * element: an unavailable control does not fire its handler, is not
 * reachable by Tab, and says so to assistive technology, in both the button
 * form this app actually uses and the anchor form kept for a future caller
 * that genuinely navigates.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './pagination.js';
import { renderAtNarrowWidth } from '../../test/narrow-viewport.js';

const LAST_PAGE = 9;
const noop = (): void => undefined;

/** The shape a real caller builds: a truncated page run, an ellipsis for the gap, and boundary-aware Previous/Next. */
function PageBar({
  page,
  onSelect = noop,
}: {
  page: number;
  onSelect?: (nextPage: number) => void;
}) {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            disabled={page === 1}
            onClick={() => {
              onSelect(page - 1);
            }}
          />
        </PaginationItem>
        {[1, 2, 3].map((pageNumber) => (
          <PaginationItem key={pageNumber}>
            <PaginationLink
              isActive={pageNumber === page}
              aria-label={`Go to page ${pageNumber}`}
              onClick={() => {
                onSelect(pageNumber);
              }}
            >
              {pageNumber}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink
            isActive={page === LAST_PAGE}
            aria-label={`Go to page ${LAST_PAGE}`}
            onClick={() => {
              onSelect(LAST_PAGE);
            }}
          >
            {LAST_PAGE}
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            disabled={page === LAST_PAGE}
            onClick={() => {
              onSelect(page + 1);
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

describe('Pagination', () => {
  describe('landmark and list semantics', () => {
    it('is a named navigation landmark, so it is distinguishable from any other nav region', () => {
      render(<PageBar page={2} />);

      expect(screen.getByRole('navigation', { name: 'pagination' })).toBeInTheDocument();
    });

    it('exposes the page run as a real list, so its length is announced', () => {
      render(<PageBar page={2} />);

      expect(screen.getByRole('list')).toBeInTheDocument();
      // previous + pages 1/2/3 + ellipsis + page 9 + next
      expect(screen.getAllByRole('listitem')).toHaveLength(7);
    });
  });

  describe('aria-current marks exactly one page', () => {
    it('puts aria-current="page" on the active page and nowhere else', () => {
      render(<PageBar page={2} />);

      expect(screen.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('button', { name: 'Go to page 1' })).not.toHaveAttribute(
        'aria-current',
      );
      // The whole rendered tree, not just the pages this fixture expected to
      // be inactive: a second `aria-current` anywhere (a Previous/Next that
      // inherited `isActive`, say) is exactly as broken as a missing one.
      expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);
    });

    it('moves aria-current with the active page rather than pinning it to a position', () => {
      const { rerender } = render(<PageBar page={2} />);

      rerender(<PageBar page={LAST_PAGE} />);

      expect(screen.getByRole('button', { name: `Go to page ${LAST_PAGE}` })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('button', { name: 'Go to page 2' })).not.toHaveAttribute(
        'aria-current',
      );
    });

    it('carries the active state as a data attribute too, so the styling is not the only signal', () => {
      render(<PageBar page={2} />);

      expect(screen.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute(
        'data-active',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Go to page 1' })).not.toHaveAttribute(
        'data-active',
      );
    });
  });

  describe('selecting a page', () => {
    it('calls exactly the chosen page', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<PageBar page={1} onSelect={onSelect} />);

      await user.click(screen.getByRole('button', { name: 'Go to page 3' }));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(3);
    });

    it('advances and retreats by one from the boundary controls', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<PageBar page={2} onSelect={onSelect} />);

      await user.click(screen.getByRole('button', { name: 'Go to next page' }));
      expect(onSelect).toHaveBeenLastCalledWith(3);

      await user.click(screen.getByRole('button', { name: 'Go to previous page' }));
      expect(onSelect).toHaveBeenLastCalledWith(1);
    });
  });

  describe('boundaries', () => {
    it('disables Previous on the first page: no handler, not focusable, announced as disabled', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<PageBar page={1} onSelect={onSelect} />);

      const previous = screen.getByRole('button', { name: 'Go to previous page' });
      expect(previous).toBeDisabled();

      await user.click(previous);
      expect(onSelect).not.toHaveBeenCalled();

      // The real point of using a `<button>` here rather than upstream's
      // anchor: `disabled` takes the control out of the tab order without
      // any code of ours running, so the first Tab lands on page 1.
      await user.tab();
      expect(screen.getByRole('button', { name: 'Go to page 1' })).toHaveFocus();
    });

    it('leaves Next available on the first page', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<PageBar page={1} onSelect={onSelect} />);

      const next = screen.getByRole('button', { name: 'Go to next page' });
      expect(next).toBeEnabled();

      await user.click(next);
      expect(onSelect).toHaveBeenCalledWith(2);
    });

    it('disables Next on the last page and leaves Previous available', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<PageBar page={LAST_PAGE} onSelect={onSelect} />);

      const next = screen.getByRole('button', { name: 'Go to next page' });
      expect(next).toBeDisabled();

      await user.click(next);
      expect(onSelect).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Go to previous page' }));
      expect(onSelect).toHaveBeenCalledWith(LAST_PAGE - 1);
    });

    it('keeps its accessible name at pane width, where the visible word is not painted', () => {
      render(<PageBar page={2} />);

      // At <=480px only the chevron shows (`hidden min-[481px]:inline` on
      // the label), so the name has to come from `aria-label` -- querying by
      // it is what proves the control is not icon-only-and-nameless in the
      // one viewport this product is designed for.
      const previous = screen.getByRole('button', { name: 'Go to previous page' });
      expect(previous.querySelector('span.hidden')?.className).toContain('min-[481px]:inline');
    });
  });

  describe('the anchor form, kept for a caller that genuinely navigates', () => {
    it('renders a real link when given an href', () => {
      render(
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationLink href="/cases?page=2" aria-label="Go to page 2">
                2
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>,
      );

      expect(screen.getByRole('link', { name: 'Go to page 2' })).toHaveAttribute(
        'href',
        '/cases?page=2',
      );
    });

    it('disables an anchor by removing what makes it a link, not by faking it', () => {
      render(
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="/cases?page=0" disabled />
            </PaginationItem>
          </PaginationContent>
        </Pagination>,
      );

      // An `<a>` with no `href` is not exposed as a link and is not tabbable
      // -- that IS the disabling. `aria-disabled` explains it, and the
      // explicit `tabIndex` covers a caller who had forced it into the tab
      // order.
      expect(screen.queryByRole('link')).toBeNull();
      const previous = screen.getByLabelText('Go to previous page');
      expect(previous).not.toHaveAttribute('href');
      expect(previous).toHaveAttribute('aria-disabled', 'true');
      expect(previous).toHaveAttribute('tabindex', '-1');
      expect(previous.className).toContain('aria-disabled:pointer-events-none');
    });

    it('leaves an enabled anchor in the tab order with its href intact', async () => {
      const user = userEvent.setup();
      render(
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationNext href="/cases?page=3" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>,
      );

      await user.tab();

      const next = screen.getByRole('link', { name: 'Go to next page' });
      expect(next).toHaveFocus();
      expect(next).not.toHaveAttribute('aria-disabled');
    });
  });

  describe('the ellipsis says something', () => {
    it('hides the glyph but keeps "More pages" in the accessibility tree', () => {
      render(<PageBar page={2} />);

      const ellipsis = document.querySelector('[data-slot="pagination-ellipsis"]');
      expect(ellipsis).not.toBeNull();
      /*
       * Upstream marks the whole span `aria-hidden` AND puts an `sr-only`
       * label inside it, which can never be read -- text in an
       * `aria-hidden` subtree is removed from the accessibility tree. Here
       * only the icon is hidden, so a screen-reader user hearing
       * "1, 2, 3, More pages, 9" learns what the glyph tells everyone else.
       */
      expect(ellipsis).not.toHaveAttribute('aria-hidden');
      expect(ellipsis?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByText('More pages')).toBeInTheDocument();
    });

    it('is not an actionable control', () => {
      render(<PageBar page={2} />);

      // Seven list items, but only six things a user can act on -- the gap
      // marker must never become a button that goes nowhere.
      expect(screen.getAllByRole('button')).toHaveLength(6);
    });
  });

  describe('the canonical 390px pane', () => {
    it('wraps to a second row instead of pushing the pane sideways', () => {
      render(<PageBar page={2} />);

      const list = screen.getByRole('list');
      // `global.css` sets `overflow-x: hidden` on html/body, so an
      // unwrapped row would be silently CLIPPED rather than scrollable --
      // the least visible way to fail product.md's no-horizontal-scroll
      // rule.
      expect(list.className).toContain('flex-wrap');
      expect(list.className).toContain('justify-center');
    });

    it('gives every actionable item a full 44px hit area', () => {
      render(<PageBar page={2} />);

      for (const control of screen.getAllByRole('button')) {
        expect(control.className).toContain('min-h-[var(--size-touch-target-min)]');
        expect(control.className).toContain('min-w-[var(--size-touch-target-min)]');
      }
    });

    it('introduces no width wider than a 390px narrow pane in its own rendered markup', () => {
      const { overflowRisks } = renderAtNarrowWidth(<PageBar page={2} />);

      expect(overflowRisks).toEqual([]);
    });
  });

  describe('accessibility', () => {
    it('has no axe violations mid-run, with both boundary controls live', async () => {
      render(<PageBar page={2} />);

      expect(await axe(document.body)).toHaveNoViolations();
    });

    it('has no axe violations at a boundary, with a disabled control on screen', async () => {
      render(<PageBar page={1} />);

      expect(await axe(document.body)).toHaveNoViolations();
    });
  });
});
