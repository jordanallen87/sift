/**
 * Behavioural coverage for the catalog's compact filter surface. Two
 * contracts matter more than anything else here, and each gets its own
 * dedicated assertions rather than being implied by a happy-path click:
 *
 *  1. **Immediate vs. deferred.** Search and chip removal are direct
 *     manipulation and apply on the spot; the four facets inside the sheet
 *     are a draft and apply only from the footer's primary action.
 *  2. **A dismissal is never a commit.** Escape (and by the same code path
 *     the overlay, the ✕, and a swipe on the bottom sheet) throws the draft
 *     away. This is the defect the deferred-apply design exists to prevent
 *     -- a swipe-to-dismiss that silently applied four half-set facets --
 *     so it is asserted from both sides: nothing was emitted, AND reopening
 *     shows the original values rather than the abandoned ones.
 *
 * Nothing in this file asserts that an element merely renders.
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  VehicleFilterSheet,
  activeFilterCount,
  type VehicleFilterSheetProps,
  type VehicleFilters,
} from './VehicleFilterSheet.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const NO_FILTERS: VehicleFilters = {
  query: '',
  make: '',
  bodyStyle: '',
  fuelType: '',
  year: '',
};

function buildProps(overrides: Partial<VehicleFilterSheetProps> = {}): VehicleFilterSheetProps {
  return {
    filters: NO_FILTERS,
    onFiltersChange: vi.fn(),
    makes: ['Honda', 'Subaru', 'Toyota'],
    bodyStyles: ['Sedan', 'SUV'],
    fuelTypes: ['Gasoline', 'Hybrid'],
    years: [2026, 2025, 2024],
    resultCount: 24,
    ...overrides,
  };
}

/**
 * A caller that actually owns the filters, so the deferred-apply tests can
 * assert what the surface LOOKS LIKE after a commit or a dismissal, not
 * only which callback fired. `onFiltersChange` is still spied on, so both
 * halves stay observable.
 */
function ControlledHost({
  initialFilters = NO_FILTERS,
  onFiltersChange,
  ...overrides
}: Partial<VehicleFilterSheetProps> & {
  initialFilters?: VehicleFilters;
  onFiltersChange: (next: VehicleFilters) => void;
}) {
  const [filters, setFilters] = useState<VehicleFilters>(initialFilters);
  return (
    <VehicleFilterSheet
      {...buildProps(overrides)}
      filters={filters}
      onFiltersChange={(next) => {
        setFilters(next);
        onFiltersChange(next);
      }}
    />
  );
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('vehicle-filter-open'));
  return screen.findByTestId('vehicle-filter-sheet');
}

describe('activeFilterCount', () => {
  it('counts only the four facets, never the search query', () => {
    // The number is the badge on the control that opens the sheet, so it is
    // a promise about what is inside the sheet. Search is not.
    expect(activeFilterCount({ ...NO_FILTERS, query: 'outback' })).toBe(0);
  });

  it('counts each set facet once and ignores the ones left at "any"', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, make: 'Toyota' })).toBe(1);
    expect(activeFilterCount({ ...NO_FILTERS, make: 'Toyota', year: '2025' })).toBe(2);
    expect(
      activeFilterCount({
        query: 'ignored',
        make: 'Toyota',
        bodyStyle: 'SUV',
        fuelType: 'Hybrid',
        year: '2025',
      }),
    ).toBe(4);
  });
});

describe('VehicleFilterSheet search row', () => {
  it('applies every keystroke immediately, carrying the untouched facets through', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <VehicleFilterSheet
        {...buildProps({ filters: { ...NO_FILTERS, make: 'Toyota' }, onFiltersChange })}
      />,
    );

    await user.type(screen.getByLabelText('Search'), 'RA');

    // Uncontrolled `filters` prop here, so each keystroke starts from the
    // same base -- what this proves is that a query change emits the
    // COMPLETE next filters object, never a `{ query }` delta that would
    // drop the applied make.
    expect(onFiltersChange).toHaveBeenCalledTimes(2);
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      ...NO_FILTERS,
      make: 'Toyota',
      query: 'A',
    });
  });

  it('names the applied facet count in the accessible name of the control that opens the sheet', () => {
    const { rerender } = render(<VehicleFilterSheet {...buildProps()} />);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.queryByTestId('vehicle-filter-active-count')).not.toBeInTheDocument();

    rerender(
      <VehicleFilterSheet
        {...buildProps({ filters: { ...NO_FILTERS, make: 'Toyota', year: '2025' } })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toBeInTheDocument();
    expect(screen.getByTestId('vehicle-filter-active-count')).toHaveTextContent('2');
  });
});

describe('VehicleFilterSheet applied chips', () => {
  it('shows one chip per set facet, labelled with the value, and none for search', () => {
    render(
      <VehicleFilterSheet
        {...buildProps({
          filters: { query: 'outback', make: 'Subaru', bodyStyle: 'SUV', fuelType: '', year: '' },
        })}
      />,
    );

    const chips = within(screen.getByTestId('vehicle-filter-chips')).getAllByTestId(/-chip$/);
    expect(chips.map((chip) => chip.textContent)).toEqual(['Subaru', 'SUV']);
    expect(screen.queryByTestId('vehicle-catalog-fuel-type-chip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vehicle-catalog-year-chip')).not.toBeInTheDocument();
  });

  it('renders no chip row at all when only the search query is set', () => {
    render(
      <VehicleFilterSheet {...buildProps({ filters: { ...NO_FILTERS, query: 'outback' } })} />,
    );
    expect(screen.queryByTestId('vehicle-filter-chips')).not.toBeInTheDocument();
  });

  it('clears exactly the removed facet immediately, without opening the sheet', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <VehicleFilterSheet
        {...buildProps({
          filters: {
            query: 'outback',
            make: 'Subaru',
            bodyStyle: 'SUV',
            fuelType: 'Gasoline',
            year: '2025',
          },
          onFiltersChange,
        })}
      />,
    );

    // The accessible name has to identify WHICH narrowing this ✕ undoes --
    // four bare "Remove" buttons in a row are unusable by name alone.
    await user.click(screen.getByRole('button', { name: 'Remove filter SUV' }));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith({
      query: 'outback',
      make: 'Subaru',
      bodyStyle: '',
      fuelType: 'Gasoline',
      year: '2025',
    });
  });

  it('clears all four facets but keeps the search query, in one call', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <VehicleFilterSheet
        {...buildProps({
          filters: {
            query: 'outback',
            make: 'Subaru',
            bodyStyle: 'SUV',
            fuelType: 'Gasoline',
            year: '2025',
          },
          onFiltersChange,
        })}
      />,
    );

    await user.click(screen.getByTestId('vehicle-filter-clear-all'));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith({ ...NO_FILTERS, query: 'outback' });
  });
});

describe('VehicleFilterSheet draft semantics', () => {
  it('offers every catalog facet value the caller supplied, plus an explicit "any" escape', async () => {
    const user = userEvent.setup();
    render(<VehicleFilterSheet {...buildProps()} />);
    await openSheet(user);

    // The "Any ..." first option is the only way back to an unset facet
    // from a native select, so its presence is behaviour, not decoration.
    for (const [testId, anyLabel, values] of [
      ['vehicle-catalog-year', 'Any year', ['2026', '2025', '2024']],
      ['vehicle-catalog-make', 'Any make', ['Honda', 'Subaru', 'Toyota']],
      ['vehicle-catalog-body-style', 'Any body style', ['Sedan', 'SUV']],
      ['vehicle-catalog-fuel-type', 'Any fuel type', ['Gasoline', 'Hybrid']],
    ] as const) {
      const options = within(screen.getByTestId(testId)).getAllByRole('option');
      expect(options.map((option) => option.textContent)).toEqual([anyLabel, ...values]);
    }
  });

  it('does not apply a facet while the sheet is open', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(<VehicleFilterSheet {...buildProps({ onFiltersChange })} />);
    await openSheet(user);

    await user.selectOptions(screen.getByLabelText('Make'), 'Toyota');
    await user.selectOptions(screen.getByLabelText('Body style'), 'SUV');

    // The whole point of the draft: four facet changes cost the caller zero
    // catalog requests, and nothing behind the overlay moves under the
    // person setting them.
    expect(onFiltersChange).not.toHaveBeenCalled();
    // The control still shows what was chosen -- a draft that did not echo
    // the choice would be indistinguishable from a broken select.
    expect(screen.getByLabelText('Make')).toHaveValue('Toyota');
    expect(screen.queryByTestId('vehicle-filter-chips')).not.toBeInTheDocument();
  });

  it('commits every drafted facet in a single call and closes the sheet', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <ControlledHost
        initialFilters={{ ...NO_FILTERS, query: 'outback' }}
        onFiltersChange={onFiltersChange}
      />,
    );
    await openSheet(user);

    await user.selectOptions(screen.getByLabelText('Model year'), '2025');
    await user.selectOptions(screen.getByLabelText('Make'), 'Subaru');
    await user.selectOptions(screen.getByLabelText('Body style'), 'SUV');
    await user.selectOptions(screen.getByLabelText('Fuel type'), 'Gasoline');

    await user.click(screen.getByTestId('vehicle-filter-sheet-apply'));

    // One call, not four: the caller runs one catalog request for four
    // decisions.
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith({
      query: 'outback',
      year: '2025',
      make: 'Subaru',
      bodyStyle: 'SUV',
      fuelType: 'Gasoline',
    });
    expect(screen.queryByTestId('vehicle-filter-sheet')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('vehicle-filter-chips'))
        .getAllByTestId(/-chip$/)
        .map((chip) => chip.textContent),
    ).toEqual(['2025', 'Subaru', 'SUV', 'Gasoline']);
  });

  it('discards the draft when the sheet is dismissed with Escape', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <ControlledHost
        initialFilters={{ ...NO_FILTERS, make: 'Toyota' }}
        onFiltersChange={onFiltersChange}
      />,
    );
    await openSheet(user);

    await user.selectOptions(screen.getByLabelText('Make'), 'Subaru');
    await user.selectOptions(screen.getByLabelText('Body style'), 'SUV');
    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('vehicle-filter-sheet')).not.toBeInTheDocument();
    // A dismissal gesture is never a commit. On the bottom sheet that
    // gesture is a swipe, so a leaked draft here would read as the product
    // applying filters nobody pressed.
    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId('vehicle-filter-chips'))
        .getAllByTestId(/-chip$/)
        .map((chip) => chip.textContent),
    ).toEqual(['Toyota']);
  });

  it('reopens on the applied filters, not on the abandoned draft', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <ControlledHost
        initialFilters={{ ...NO_FILTERS, make: 'Toyota' }}
        onFiltersChange={onFiltersChange}
      />,
    );

    await openSheet(user);
    await user.selectOptions(screen.getByLabelText('Make'), 'Subaru');
    await user.keyboard('{Escape}');

    await openSheet(user);
    // Re-seeded from the applied filters on open -- which is what makes the
    // discard structural rather than something each close path has to
    // remember to do.
    expect(screen.getByLabelText('Make')).toHaveValue('Toyota');
    expect(onFiltersChange).not.toHaveBeenCalled();
  });

  it('resets the draft to "any" without applying anything', async () => {
    const user = userEvent.setup();
    const onFiltersChange = vi.fn();
    render(
      <ControlledHost
        initialFilters={{ ...NO_FILTERS, make: 'Toyota', bodyStyle: 'SUV' }}
        onFiltersChange={onFiltersChange}
      />,
    );
    await openSheet(user);

    expect(screen.getByTestId('vehicle-filter-sheet-reset')).toBeEnabled();
    await user.click(screen.getByTestId('vehicle-filter-sheet-reset'));

    expect(screen.getByLabelText('Make')).toHaveValue('');
    expect(screen.getByLabelText('Body style')).toHaveValue('');
    // Reset edits the draft; the applied filters are untouched until the
    // primary action commits, so the chips behind the overlay still stand.
    expect(onFiltersChange).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('vehicle-filter-sheet-apply'));
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith(NO_FILTERS);
  });

  it('disables Reset when the draft has nothing set, rather than removing it', async () => {
    const user = userEvent.setup();
    render(<VehicleFilterSheet {...buildProps()} />);
    await openSheet(user);

    // Present but disabled: a footer that grows a button the instant the
    // first facet is set would slide the primary action sideways under the
    // finger about to press it.
    expect(screen.getByTestId('vehicle-filter-sheet-reset')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Make'), 'Toyota');
    expect(screen.getByTestId('vehicle-filter-sheet-reset')).toBeEnabled();
  });

  it('labels the primary action with the applied result count, correctly singular', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<VehicleFilterSheet {...buildProps({ resultCount: 24 })} />);
    await openSheet(user);
    expect(screen.getByTestId('vehicle-filter-sheet-apply')).toHaveTextContent('Show 24 vehicles');
    unmount();

    render(<VehicleFilterSheet {...buildProps({ resultCount: 1 })} />);
    await openSheet(user);
    expect(screen.getByTestId('vehicle-filter-sheet-apply')).toHaveTextContent('Show 1 vehicle');
  });

  it('marks the count-bearing action busy while the caller is re-running the search', async () => {
    const user = userEvent.setup();
    render(<VehicleFilterSheet {...buildProps({ busy: true })} />);
    await openSheet(user);

    // Busy annotates the stale number; it must not lock the controls, since
    // a search is in flight for most of the time anyone is filtering.
    expect(screen.getByTestId('vehicle-filter-sheet-apply')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('vehicle-filter-sheet-apply')).toBeEnabled();
    expect(screen.getByLabelText('Make')).toBeEnabled();
  });
});

describe('VehicleFilterSheet narrow-pane and accessibility contract', () => {
  it('introduces no fixed width wider than the 390px pane', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <VehicleFilterSheet
        {...buildProps({
          filters: {
            query: 'outback',
            make: 'Subaru',
            bodyStyle: 'SUV',
            fuelType: 'Gasoline',
            year: '2025',
          },
        })}
      />,
    );
    expect(overflowRisks).toEqual([]);
  });

  it('gives every actionable control a 44px touch-target floor', async () => {
    const user = userEvent.setup();
    render(<VehicleFilterSheet {...buildProps({ filters: { ...NO_FILTERS, make: 'Toyota' } })} />);

    const touch = 'var(--size-touch-target-min)';
    expect(screen.getByTestId('vehicle-filter-open').className).toContain(`h-[${touch}]`);
    expect(screen.getByTestId('vehicle-catalog-query').className).toContain(`min-h-[${touch}]`);
    expect(screen.getByTestId('vehicle-catalog-make-chip-remove').className).toContain(
      `h-[${touch}]`,
    );
    expect(screen.getByTestId('vehicle-filter-clear-all').className).toContain(`min-h-[${touch}]`);

    await openSheet(user);
    expect(screen.getByTestId('vehicle-catalog-make').className).toContain(`min-h-[${touch}]`);
    expect(screen.getByTestId('vehicle-filter-sheet-apply').className).toContain(
      `min-h-[${touch}]`,
    );
    expect(screen.getByTestId('vehicle-filter-sheet-reset').className).toContain(
      `min-h-[${touch}]`,
    );
  });

  it('has no axe violations with chips applied and the sheet closed', async () => {
    const { container } = render(
      <VehicleFilterSheet
        {...buildProps({
          filters: {
            query: 'outback',
            make: 'Subaru',
            bodyStyle: 'SUV',
            fuelType: 'Gasoline',
            year: '2025',
          },
        })}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations with the sheet open over applied chips', async () => {
    const user = userEvent.setup();
    render(
      <VehicleFilterSheet
        {...buildProps({ filters: { ...NO_FILTERS, make: 'Subaru', bodyStyle: 'SUV' } })}
      />,
    );
    await openSheet(user);

    // `document.body`, not `container`: the sheet is portalled out of the
    // render container (`ui/sheet.tsx` -> Radix `Dialog.Portal`), so a
    // container-scoped scan would check everything except the thing that
    // just opened. Same choice `ui/sheet.test.tsx` and `ui/dialog.test.tsx`
    // already make.
    const results = await axe(document.body, {
      /*
       * Same scoping decision `ui/dropdown-menu.test.tsx` and
       * `ui/tooltip.test.tsx` document: `region` ("all content in
       * landmarks") is a best-practice/moderate rule whose portaled-layer
       * exemptions are a hard-coded selector list, this component is a leaf
       * that never owns the page's landmarks, and the real release gate
       * (`tests/e2e/helpers/axe.ts`) fails on critical/serious only and does
       * not run it. Every other rule stays on, and the closed-state scan
       * above is unrestricted.
       */
      rules: { region: { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
