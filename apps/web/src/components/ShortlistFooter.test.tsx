/**
 * Behavioural coverage for `ShortlistFooter.tsx`.
 *
 * The assertions here are chosen around the two things this component can
 * get catastrophically wrong and still look right in a screenshot:
 *
 *  1. **Faux nesting.** The whole collapsed row is pressable, but the CTA
 *     inside it must not be a `<button>` within a `<button>`. jsdom will
 *     happily render invalid markup and the page will look fine, so this is
 *     asserted structurally (the trigger has no `button` descendant, and is
 *     not an ancestor of the CTA) *and* behaviourally (pressing the CTA
 *     fires its handler and does not toggle the panel). The behavioural half
 *     is what proves no `stopPropagation` is needed: the CTA was never on
 *     the trigger's event path to begin with.
 *  2. **The page inset.** A fixed bar that does not publish its height
 *     covers the bottom of the document. The contract is a custom property
 *     on the document element, present while the bar is mounted and gone
 *     when it is not, so both directions are asserted.
 *
 * The derived stat line gets real coverage too, because its rule is a
 * product claim rather than a formatting detail: a range is only ever shown
 * when every shortlisted vehicle reports the field, so the bar can never
 * summarise three vehicles using two of them.
 */
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { buildVehicleCatalogRecord } from '@sift/catalog/test-support';
import type { VehicleCatalogRecord } from '@sift/catalog/browser';
import {
  ShortlistFooter,
  SHORTLIST_BAR_INSET_VAR,
  type ShortlistFooterProps,
} from './ShortlistFooter.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function vehicle(id: string, overrides: Partial<VehicleCatalogRecord> = {}): VehicleCatalogRecord {
  return buildVehicleCatalogRecord({ id, model: id.toUpperCase(), ...overrides });
}

const THREE_VEHICLES = [
  vehicle('camry', { make: 'Toyota', model: 'Camry', year: 2025, combinedMpg: 32 }),
  vehicle('cx5', { make: 'Mazda', model: 'CX-5', year: 2025, combinedMpg: 28 }),
  vehicle('crv', { make: 'Honda', model: 'CR-V', year: 2024, combinedMpg: 34 }),
];

function props(overrides: Partial<ShortlistFooterProps> = {}): ShortlistFooterProps {
  return {
    shortlist: THREE_VEHICLES,
    maxSize: 5,
    minSize: 2,
    onRemove: vi.fn(),
    onStartComparison: vi.fn(),
    ...overrides,
  };
}

/**
 * axe's `region` rule ("all page content should be contained by landmarks")
 * is a property of the page, not of this component: rendering a bare
 * `<section>` into `document.body` fails it and says nothing about the bar.
 * Wrapping in `<main>` keeps the entire ruleset enabled while still
 * exercising the real markup — the same wrapper `collapsible.test.tsx` uses.
 */
function renderInLandmark(ui: ReactElement) {
  return render(<main>{ui}</main>);
}

/** The row is the trigger; the trigger is named by its visually-hidden label plus the visible stats. */
function trigger(): HTMLElement {
  return screen.getByTestId('shortlist-bar-trigger');
}

function cta(): HTMLElement {
  return screen.getByTestId('vehicle-catalog-start-comparison');
}

async function expand(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(trigger());
}

describe('ShortlistFooter', () => {
  describe('presence', () => {
    it('renders nothing at all when the shortlist is empty', () => {
      renderInLandmark(<ShortlistFooter {...props({ shortlist: [] })} />);

      expect(screen.queryByTestId('vehicle-catalog-shortlist')).toBeNull();
      expect(screen.queryByTestId('vehicle-catalog-start-comparison')).toBeNull();
    });

    it('reserves no page inset while empty, and reclaims it when the bar unmounts', () => {
      const { rerender, unmount } = renderInLandmark(
        <ShortlistFooter {...props({ shortlist: [] })} />,
      );
      expect(document.documentElement.style.getPropertyValue(SHORTLIST_BAR_INSET_VAR)).toBe('');

      rerender(
        <main>
          <ShortlistFooter {...props()} />
        </main>,
      );
      const reserved = document.documentElement.style.getPropertyValue(SHORTLIST_BAR_INSET_VAR);
      // Both terms matter: the row's own height, and the safe area the bar
      // pads itself by. A reservation missing either one lets the bar cover
      // the last line of the document on a notched phone.
      expect(reserved).toContain('64px');
      expect(reserved).toContain('env(safe-area-inset-bottom');

      unmount();
      expect(document.documentElement.style.getPropertyValue(SHORTLIST_BAR_INSET_VAR)).toBe('');
    });
  });

  describe('collapsed by default', () => {
    it('shows the count and the derived stat, and no shortlist list', () => {
      renderInLandmark(<ShortlistFooter {...props()} />);

      expect(screen.getByTestId('shortlist-count')).toHaveTextContent('3 of 5 shortlisted');
      expect(screen.getByTestId('shortlist-stat')).toHaveTextContent('28–34 MPG combined');
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
      // Radix drops a closed region's children rather than merely hiding
      // them, so nothing in the list is focusable or readable while closed.
      expect(screen.queryByTestId('vehicle-catalog-shortlist-list')).toBeNull();
      expect(screen.queryByTestId('shortlist-remove-camry')).toBeNull();
    });

    it('shows at most three thumbnails and folds the rest into a +N chip', () => {
      const five = [
        ...THREE_VEHICLES,
        vehicle('civic', { make: 'Honda', model: 'Civic', combinedMpg: 36 }),
        vehicle('forester', { make: 'Subaru', model: 'Forester', combinedMpg: 29 }),
      ];
      renderInLandmark(<ShortlistFooter {...props({ shortlist: five })} />);

      expect(within(trigger()).getAllByTestId('vehicle-silhouette')).toHaveLength(3);
      expect(trigger()).toHaveTextContent('+2');
    });
  });

  describe('expanding', () => {
    it('reveals every shortlisted vehicle when the row is pressed', async () => {
      const user = userEvent.setup();
      renderInLandmark(<ShortlistFooter {...props()} />);

      await expand(user);

      expect(trigger()).toHaveAttribute('aria-expanded', 'true');
      const list = screen.getByTestId('vehicle-catalog-shortlist-list');
      expect(within(list).getAllByRole('listitem')).toHaveLength(3);
      expect(screen.getByTestId('shortlist-item-camry')).toHaveTextContent('2025 Toyota Camry');
      expect(screen.getByTestId('shortlist-item-cx5')).toHaveTextContent('2025 Mazda CX-5');
    });

    it('is operable from the keyboard alone, and reports state on the trigger Radix owns', async () => {
      const user = userEvent.setup();
      renderInLandmark(<ShortlistFooter {...props()} />);

      await user.tab();
      expect(trigger()).toHaveFocus();
      await user.keyboard('{Enter}');

      expect(trigger()).toHaveAttribute('aria-expanded', 'true');
      // Radix, not this component, wires the relationship — assert it points
      // at the real region rather than dangling.
      const controls = trigger().getAttribute('aria-controls');
      expect(controls).not.toBeNull();
      expect(document.getElementById(controls ?? '')).toBe(
        screen.getByTestId('vehicle-catalog-shortlist-panel'),
      );

      await user.keyboard('{Enter}');
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    });

    it('caps the panel in svh, not vh, so it fits the viewport actually visible on mobile Safari', async () => {
      const user = userEvent.setup();
      renderInLandmark(<ShortlistFooter {...props()} />);
      await expand(user);

      // jsdom runs no layout engine, so this is the structural half of the
      // check: `vh` is the LARGE viewport (URL bar collapsed), which is
      // taller than the screen while the URL bar is showing.
      const scroller = screen.getByTestId('vehicle-catalog-shortlist-list').parentElement;
      expect(scroller?.className).toContain('max-h-[70svh]');
      expect(scroller?.className).not.toContain('70vh');
    });
  });

  describe('the CTA is a sibling of the trigger, not a child of it', () => {
    it('puts no interactive element inside the trigger', () => {
      renderInLandmark(<ShortlistFooter {...props()} />);

      // The failure this catches is `nested-interactive`: a `<button>` inside
      // a `<button>` is invalid HTML that browsers silently reparent.
      expect(trigger().querySelectorAll('button')).toHaveLength(0);
      expect(trigger().querySelectorAll('a,input,select,textarea')).toHaveLength(0);
      expect(trigger().contains(cta())).toBe(false);
    });

    it('covers the row with a stretched pseudo element rather than by wrapping it', () => {
      renderInLandmark(<ShortlistFooter {...props()} />);

      // The three classes that make the faux-nesting work, asserted as a set
      // because removing any one of them silently breaks it: the row is the
      // positioning context, the trigger is not, and the CTA paints above.
      expect(screen.getByTestId('shortlist-bar-row').className).toContain('relative');
      expect(trigger().className).toContain('static');
      expect(trigger().className).toContain('before:absolute');
      expect(trigger().className).toContain('before:inset-0');
      expect(cta().className).toContain('relative');
      expect(cta().className).toContain('z-10');
    });

    it('runs the CTA without toggling the panel — no stopPropagation required', async () => {
      const user = userEvent.setup();
      const onStartComparison = vi.fn();
      renderInLandmark(<ShortlistFooter {...props({ onStartComparison })} />);

      await user.click(cta());

      expect(onStartComparison).toHaveBeenCalledTimes(1);
      // The panel is untouched in both directions: the click never reached
      // the trigger, because the CTA was never inside it.
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByTestId('vehicle-catalog-shortlist-list')).toBeNull();
    });

    it('leaves the CTA working once the panel is open', async () => {
      const user = userEvent.setup();
      const onStartComparison = vi.fn();
      renderInLandmark(<ShortlistFooter {...props({ onStartComparison })} />);

      await expand(user);
      await user.click(cta());

      expect(onStartComparison).toHaveBeenCalledTimes(1);
      expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('removing', () => {
    it('calls onRemove with the vehicle id of the row pressed', async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      renderInLandmark(<ShortlistFooter {...props({ onRemove })} />);

      await expand(user);
      await user.click(screen.getByTestId('shortlist-remove-cx5'));

      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove).toHaveBeenCalledWith('cx5');
    });

    it('names each Remove control by the vehicle it removes', async () => {
      const user = userEvent.setup();
      renderInLandmark(<ShortlistFooter {...props()} />);
      await expand(user);

      // Three controls all announcing "Remove" is three identical answers to
      // "remove what?" in a screen reader's control list.
      expect(
        screen.getByRole('button', { name: 'Remove 2025 Mazda CX-5 from your shortlist' }),
      ).toBe(screen.getByTestId('shortlist-remove-cx5'));
    });
  });

  describe('when the CTA may not be pressed', () => {
    it('disables it below the minimum and says how many more are needed', () => {
      renderInLandmark(
        <ShortlistFooter {...props({ shortlist: [THREE_VEHICLES[0]!], minSize: 2 })} />,
      );

      expect(cta()).toBeDisabled();
      expect(screen.getByTestId('shortlist-stat')).toHaveTextContent('Add 1 more to compare');
      // The reason is attached to the control it explains, not left floating.
      expect(cta().getAttribute('aria-describedby')).toBe(
        screen.getByTestId('shortlist-stat').getAttribute('id'),
      );
    });

    it('enables it once the minimum is met', () => {
      renderInLandmark(<ShortlistFooter {...props({ shortlist: THREE_VEHICLES.slice(0, 2) })} />);

      expect(cta()).toBeEnabled();
      expect(screen.getByTestId('shortlist-stat')).toHaveTextContent('28–32 MPG combined');
    });

    it('disables it above the maximum rather than starting an unsupported comparison', () => {
      renderInLandmark(<ShortlistFooter {...props({ maxSize: 2 })} />);

      expect(cta()).toBeDisabled();
    });

    it('disables the CTA and every Remove while the case is being created, and marks the CTA busy', async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      renderInLandmark(<ShortlistFooter {...props({ creating: true, onRemove })} />);

      expect(cta()).toBeDisabled();
      expect(cta()).toHaveAttribute('aria-busy', 'true');
      expect(cta()).toHaveTextContent('Starting…');

      // The panel still opens while creating — a person is entitled to see
      // what is being created — but nothing in it can mutate the shortlist.
      await expand(user);
      const remove = screen.getByTestId('shortlist-remove-camry');
      expect(remove).toBeDisabled();
      await user.click(remove);
      expect(onRemove).not.toHaveBeenCalled();
    });
  });

  describe('the error the flow hands it', () => {
    it('renders it inside the panel, above the list', () => {
      // No click needed: an error present at mount opens the panel itself,
      // which is the behaviour the next test pins down.
      renderInLandmark(
        <ShortlistFooter {...props({ error: <p>Could not reach the case service.</p> })} />,
      );

      const panelError = screen.getByTestId('shortlist-error');
      expect(panelError).toHaveTextContent('Could not reach the case service.');
      expect(
        panelError.compareDocumentPosition(screen.getByTestId('vehicle-catalog-shortlist-list')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('opens the panel by itself when one arrives, because an error nobody can see is not an error report', () => {
      const { rerender } = renderInLandmark(<ShortlistFooter {...props()} />);
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');

      rerender(
        <main>
          <ShortlistFooter {...props({ error: <p>Could not reach the case service.</p> })} />
        </main>,
      );

      expect(trigger()).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('shortlist-error')).toBeInTheDocument();
    });

    it('does not fight a person who closes it again while the error is still showing', async () => {
      const user = userEvent.setup();
      const withError = props({ error: <p>Could not reach the case service.</p> });
      const { rerender } = renderInLandmark(<ShortlistFooter {...withError} />);

      await user.click(trigger());
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');

      // The flow rebuilds its `<ErrorState>` element on every render. If the
      // auto-open effect depended on the node rather than on "is there an
      // error", this re-render would re-open the panel under the person.
      rerender(
        <main>
          <ShortlistFooter {...props({ error: <p>Could not reach the case service.</p> })} />
        </main>,
      );
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('the derived stat line never summarises a shortlist it cannot see all of', () => {
    it('collapses a range to one figure when every vehicle agrees', () => {
      const same = [vehicle('a', { combinedMpg: 31 }), vehicle('b', { combinedMpg: 31 })];
      renderInLandmark(<ShortlistFooter {...props({ shortlist: same })} />);

      expect(screen.getByTestId('shortlist-stat')).toHaveTextContent('31 MPG combined');
    });

    it('falls back to annual fuel cost when MPG is not known for all of them', () => {
      const partial = [
        vehicle('a', { combinedMpg: 31, annualFuelCostUsd: 1650 }),
        vehicle('b', { combinedMpg: null, annualFuelCostUsd: 2100 }),
      ];
      renderInLandmark(<ShortlistFooter {...props({ shortlist: partial })} />);

      const stat = screen.getByTestId('shortlist-stat');
      expect(stat).toHaveTextContent('$1,650–$2,100 est. fuel/yr');
      // The partially-known MPG is not shown as a range over the two it does
      // know: that would be a claim about the whole shortlist the catalog
      // never made.
      expect(stat).not.toHaveTextContent('MPG');
    });

    it('shows the count alone when nothing is known about all of them', () => {
      const unknown = [vehicle('a'), vehicle('b')];
      renderInLandmark(<ShortlistFooter {...props({ shortlist: unknown })} />);

      expect(screen.getByTestId('shortlist-count')).toHaveTextContent('2 of 5 shortlisted');
      expect(screen.queryByTestId('shortlist-stat')).toBeNull();
      // With no line to point at, the CTA must not dangle an aria-describedby.
      expect(cta()).not.toHaveAttribute('aria-describedby');
    });
  });

  describe('accessibility and the narrow pane', () => {
    it('has no axe violations collapsed', async () => {
      const { container } = renderInLandmark(<ShortlistFooter {...props()} />);

      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations expanded', async () => {
      const user = userEvent.setup();
      const { container } = renderInLandmark(<ShortlistFooter {...props()} />);
      await expand(user);

      // Guard against the check quietly running on a collapsed bar, which
      // would make this a duplicate of the test above.
      expect(trigger()).toHaveAttribute('aria-expanded', 'true');
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations in the error state', async () => {
      const { container } = renderInLandmark(
        <ShortlistFooter {...props({ error: <p>Could not reach the case service.</p> })} />,
      );

      expect(screen.getByTestId('shortlist-error')).toBeInTheDocument();
      expect(await axe(container)).toHaveNoViolations();
    });

    it('introduces no fixed width wider than a 390px pane', () => {
      const { overflowRisks } = renderAtNarrowWidth(
        <main>
          <ShortlistFooter {...props({ maxSize: 5, shortlist: THREE_VEHICLES })} />
        </main>,
      );

      expect(overflowRisks).toEqual([]);
    });
  });
});
