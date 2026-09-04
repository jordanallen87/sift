/**
 * Behavioural coverage for `item.tsx`.
 *
 * `Item` is a layout primitive, so most of its contract genuinely *is* the
 * class string -- but "renders a div" is worth nothing as a test, so this
 * file asserts only the parts a caller would notice breaking: the exact
 * size/variant utilities each option resolves to (a silently swapped
 * `p-4`/`py-3` is how a list stops looking like one list), the media
 * variants' fixed square + image-fitting rules, that a caller's own
 * className survives the `cn` merge and wins conflicts, and that `asChild`
 * hands the row's identity to a real interactive element instead of nesting
 * one inside a div.
 *
 * The genuinely behavioural part is the list semantics: `ItemGroup` is a
 * `role="list"`, and a `list` whose children are not `listitem`s -- or a
 * `listitem` with no `list` parent -- is an axe failure in both directions,
 * so the role is derived from context rather than hard-coded. That is
 * asserted here as observable roles plus a real axe pass, not as an
 * implementation detail.
 */
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
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
} from './item.js';
import { renderAtNarrowWidth } from '../../test/narrow-viewport.js';

/** Class tokens rather than a substring scan: `not.toContain('p-4')` is satisfied by `gap-4`, which makes a negative substring assertion quietly meaningless. */
function classesOf(element: HTMLElement): string[] {
  return element.className.split(/\s+/).filter(Boolean);
}

/**
 * A landmark wrapper for axe runs. axe's `region` rule ("all page content
 * should be contained by landmarks") is a property of the *page*, not of a
 * layout primitive -- a bare `render()` into `document.body` fails it for
 * anything that renders visible text. Wrapping in `<main>` keeps the entire
 * ruleset enabled while still exercising the real markup.
 */
function renderInLandmark(ui: ReactElement) {
  return render(<main>{ui}</main>);
}

function CandidateRow({ onCompare = () => undefined }: { onCompare?: () => void } = {}) {
  return (
    <Item data-testid="item">
      <ItemMedia data-testid="media" variant="image">
        <img src="/fixtures/cx-5.png" alt="" />
      </ItemMedia>
      <ItemContent data-testid="content">
        <ItemTitle data-testid="title">2023 Mazda CX-5</ItemTitle>
        <ItemDescription data-testid="description">
          Third-row seating unconfirmed; 2 of 4 must-haves verified.
        </ItemDescription>
      </ItemContent>
      <ItemActions data-testid="actions">
        <button type="button" onClick={onCompare}>
          Compare
        </button>
      </ItemActions>
    </Item>
  );
}

describe('Item', () => {
  describe('composition', () => {
    it('renders every slot it was given, each tagged with its own data-slot hook', () => {
      render(<CandidateRow />);

      expect(screen.getByTestId('item')).toHaveAttribute('data-slot', 'item');
      expect(screen.getByTestId('media')).toHaveAttribute('data-slot', 'item-media');
      expect(screen.getByTestId('content')).toHaveAttribute('data-slot', 'item-content');
      expect(screen.getByTestId('title')).toHaveAttribute('data-slot', 'item-title');
      expect(screen.getByTestId('description')).toHaveAttribute('data-slot', 'item-description');
      expect(screen.getByTestId('actions')).toHaveAttribute('data-slot', 'item-actions');

      // The slots are nested, not siblings flattened into the row -- the
      // title/description pair has to live inside one content column for the
      // media's `group-has-[[data-slot=item-description]]` rules to apply.
      const content = screen.getByTestId('content');
      expect(within(content).getByText('2023 Mazda CX-5')).toBe(screen.getByTestId('title'));
      expect(content).toContainElement(screen.getByTestId('description'));
    });

    it('keeps trailing actions interactive inside the row', async () => {
      const user = userEvent.setup();
      const onCompare = vi.fn();
      render(<CandidateRow onCompare={onCompare} />);

      await user.click(screen.getByRole('button', { name: 'Compare' }));
      expect(onCompare).toHaveBeenCalledTimes(1);
    });

    it('renders header and footer as their own full-width lines', () => {
      render(
        <Item data-testid="item">
          <ItemHeader data-testid="header">Evidence</ItemHeader>
          <ItemContent>
            <ItemTitle>Registration</ItemTitle>
          </ItemContent>
          <ItemFooter data-testid="footer">Verified 2026-08-14</ItemFooter>
        </Item>,
      );

      // `basis-full` against the root's `flex-wrap` is what makes these own a
      // line rather than compete with media/content/actions for the 390px pane.
      for (const testId of ['header', 'footer']) {
        expect(classesOf(screen.getByTestId(testId))).toContain('basis-full');
      }
      expect(classesOf(screen.getByTestId('item'))).toContain('flex-wrap');
    });

    it('hands the row over to a real element with asChild rather than nesting one', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(
        <Item asChild data-testid="item" variant="outline">
          <button type="button" onClick={onSelect}>
            <ItemContent>
              <ItemTitle>Open the case</ItemTitle>
            </ItemContent>
          </button>
        </Item>,
      );

      const row = screen.getByRole('button', { name: 'Open the case' });
      expect(row).toBe(screen.getByTestId('item'));
      expect(row.tagName).toBe('BUTTON');
      // The variant classes land on the button itself, so there is no
      // wrapper div swallowing the row's own padding or focus ring.
      expect(classesOf(row)).toContain('bg-card');
      expect(row.querySelector('button')).toBeNull();

      await user.click(row);
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe('size and variant', () => {
    it('defaults to the roomy size and a transparent surface', () => {
      render(<CandidateRow />);
      const item = screen.getByTestId('item');

      expect(item).toHaveAttribute('data-size', 'default');
      expect(item).toHaveAttribute('data-variant', 'default');
      expect(classesOf(item)).toEqual(expect.arrayContaining(['gap-4', 'p-4', 'bg-transparent']));
    });

    it('trades vertical padding, not horizontal, for the compact size', () => {
      render(
        <Item data-testid="item" size="sm">
          <ItemContent>
            <ItemTitle>Compact</ItemTitle>
          </ItemContent>
        </Item>,
      );
      const item = screen.getByTestId('item');

      // The horizontal inset stays at `px-4` so a compact row still lines up
      // with a default one in the same stack; only the row's height changes.
      expect(item).toHaveAttribute('data-size', 'sm');
      expect(classesOf(item)).toEqual(expect.arrayContaining(['gap-2.5', 'px-4', 'py-3']));
      expect(classesOf(item)).not.toContain('p-4');
      expect(classesOf(item)).not.toContain('gap-4');
    });

    it.each([
      ['default', 'bg-transparent'],
      ['outline', 'bg-card'],
      ['muted', 'bg-muted/50'],
    ] as const)('renders the %s variant as a flat fill (%s)', (variant, expectedFill) => {
      render(
        <Item data-testid="item" variant={variant}>
          <ItemContent>
            <ItemTitle>Row</ItemTitle>
          </ItemContent>
        </Item>,
      );
      const item = screen.getByTestId('item');

      expect(item).toHaveAttribute('data-variant', variant);
      expect(classesOf(item)).toContain(expectedFill);
      // tokens.css: "no card, panel, or button uses them as its primary
      // boundary" -- so even `outline` separates itself by background
      // lightness. The base's `border-transparent` exists only so the focus
      // ring has a border to paint; no variant may make it visible.
      expect(classesOf(item)).toContain('border-transparent');
      expect(classesOf(item)).not.toContain('border-border');
    });

    it('paints focus as a real ring on the row, not just an inherited outline', () => {
      render(<CandidateRow />);

      expect(classesOf(screen.getByTestId('item'))).toEqual(
        expect.arrayContaining([
          'focus-visible:border-ring',
          'focus-visible:ring-[3px]',
          'focus-visible:ring-ring/50',
        ]),
      );
    });

    it('times its hover transition from the shared motion token, not a literal', () => {
      render(<CandidateRow />);
      const classes = classesOf(screen.getByTestId('item'));

      // global.css: "Component-level transitions should read their durations
      // from tokens.css's --duration-* variables (already zeroed under
      // prefers-reduced-motion there)" -- a literal `duration-100` would keep
      // animating for a user who asked for less motion.
      expect(classes).toContain('duration-[var(--duration-fast)]');
      expect(classes).not.toContain('duration-100');
    });

    it("lets a caller's own className win a conflict via the cn merge", () => {
      render(
        <Item data-testid="item" variant="muted" className="bg-transparent p-0">
          <ItemContent>
            <ItemTitle>Overridden</ItemTitle>
          </ItemContent>
        </Item>,
      );
      const classes = classesOf(screen.getByTestId('item'));

      // tailwind-merge drops the variant's own `bg-muted/50`/`p-4` rather
      // than emitting both and leaving the winner to source order.
      expect(classes).toContain('bg-transparent');
      expect(classes).not.toContain('bg-muted/50');
      expect(classes).toContain('p-0');
      expect(classes).not.toContain('p-4');
    });
  });

  describe('ItemMedia', () => {
    it('fits an image to its own fixed square and clips the overflow', () => {
      render(<CandidateRow />);
      const media = screen.getByTestId('media');

      expect(media).toHaveAttribute('data-variant', 'image');
      // An arbitrary-aspect fixture photo must not stretch the row: the box
      // is fixed, the image fills it, and `object-cover` crops rather than
      // distorts. The trailing entry is the radius, routed through Sift's own
      // scale per tailwind.css's "one consistent radius mechanism, not two".
      expect(classesOf(media)).toEqual(
        expect.arrayContaining([
          'size-10',
          'overflow-hidden',
          '[&_img]:size-full',
          '[&_img]:object-cover',
          'rounded-[var(--radius-sm)]',
        ]),
      );
    });

    it('gives an icon its own filled chip and normalises unsized glyphs', () => {
      render(
        <Item>
          <ItemMedia data-testid="media" variant="icon">
            <svg aria-hidden="true" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>With an icon</ItemTitle>
          </ItemContent>
        </Item>,
      );
      const media = screen.getByTestId('media');

      expect(classesOf(media)).toEqual(
        expect.arrayContaining(['size-8', 'bg-muted', "[&_svg:not([class*='size-'])]:size-4"]),
      );
      // Flat by design (tokens.css): the fill *is* the chip's boundary, so
      // upstream's hairline `border` is dropped rather than doubled up.
      expect(classesOf(media)).not.toContain('border');
    });

    it('stays a plain flex box with no chrome by default', () => {
      render(
        <Item>
          <ItemMedia data-testid="media">
            <span>N</span>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Plain</ItemTitle>
          </ItemContent>
        </Item>,
      );
      const media = screen.getByTestId('media');

      expect(media).toHaveAttribute('data-variant', 'default');
      expect(classesOf(media)).toEqual(expect.arrayContaining(['bg-transparent', 'shrink-0']));
      expect(classesOf(media)).not.toContain('size-8');
      expect(classesOf(media)).not.toContain('size-10');
    });
  });

  describe('ItemDescription', () => {
    it('is a paragraph that truncates rather than growing the row', () => {
      render(<CandidateRow />);
      const description = screen.getByTestId('description');

      expect(description.tagName).toBe('P');
      // A long rationale must not push every following row down the stack at
      // the 390px pane width.
      expect(classesOf(description)).toEqual(
        expect.arrayContaining(['line-clamp-2', 'text-muted-foreground']),
      );
    });
  });

  describe('ItemGroup list semantics', () => {
    it('exposes a real list whose rows are its items', () => {
      render(
        <ItemGroup data-testid="group" aria-label="Candidates">
          <Item data-testid="first">
            <ItemContent>
              <ItemTitle>2023 Mazda CX-5</ItemTitle>
            </ItemContent>
          </Item>
          <ItemSeparator data-testid="separator" />
          <Item data-testid="second">
            <ItemContent>
              <ItemTitle>2022 Subaru Outback</ItemTitle>
            </ItemContent>
          </Item>
        </ItemGroup>,
      );

      const list = screen.getByRole('list', { name: 'Candidates' });
      expect(list).toBe(screen.getByTestId('group'));
      expect(within(list).getAllByRole('listitem')).toEqual([
        screen.getByTestId('first'),
        screen.getByTestId('second'),
      ]);
      // A decorative separator is `role="none"`, the one thing allowed to sit
      // between two listitems without breaking the list's required children.
      expect(screen.getByTestId('separator')).toHaveAttribute('role', 'none');
    });

    it('leaves a standalone Item roleless, because a listitem with no list is itself a failure', () => {
      render(<CandidateRow />);
      expect(screen.getByTestId('item')).not.toHaveAttribute('role');
      expect(screen.queryByRole('listitem')).toBeNull();
    });

    it('lets a caller override the derived role explicitly', () => {
      render(
        <ItemGroup>
          <Item data-testid="item" role="presentation">
            <ItemContent>
              <ItemTitle>Not a row</ItemTitle>
            </ItemContent>
          </Item>
        </ItemGroup>,
      );
      expect(screen.getByTestId('item')).toHaveAttribute('role', 'presentation');
    });
  });

  describe('overflow discipline at the canonical pane width', () => {
    it('introduces no width wider than a 390px narrow pane in its own rendered markup', () => {
      const { overflowRisks } = renderAtNarrowWidth(
        <ItemGroup aria-label="Candidates">
          <CandidateRow />
          <ItemSeparator />
          <CandidateRow />
        </ItemGroup>,
      );
      expect(overflowRisks).toEqual([]);
    });
  });

  describe('accessibility', () => {
    it('has no axe violations as a standalone row', async () => {
      renderInLandmark(<CandidateRow />);
      const results = await axe(document.body);
      expect(results).toHaveNoViolations();
    });

    it('has no axe violations as a list, in either direction of the role contract', async () => {
      renderInLandmark(
        <ItemGroup aria-label="Candidates">
          <CandidateRow />
          <ItemSeparator />
          <CandidateRow />
        </ItemGroup>,
      );
      const results = await axe(document.body);
      expect(results).toHaveNoViolations();
    });
  });
});
