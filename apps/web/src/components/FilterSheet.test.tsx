/**
 * The DOM half of the filter behaviour that used to live in
 * `WorkspaceSidebar.test.tsx`'s two `Filters` describe blocks, moved here
 * with the controls themselves. The pure-logic half (planning, facet
 * building, ordering, `applyWorkspaceFilters`, `describeAppliedFilters`)
 * belongs to `workspace-filters.test.ts`; what this file owns is what a
 * person can actually see and press: which controls render, what each one
 * commits, what it clears, and the three honest empty states.
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  WorkspaceFilterSchema,
  type AttributeDefinition,
  type AttributeValue,
  type EntityRecord,
  type WorkspaceFilter,
} from '@sift/contracts';
import { FilterSheet, type FilterSheetProps } from './FilterSheet.js';

function buildAttribute(overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
  return {
    id: 'awd',
    label: 'AWD',
    valueType: 'boolean',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'none',
    sensitive: false,
    ...overrides,
  };
}

const ATTRIBUTES: AttributeDefinition[] = [
  buildAttribute({ id: 'awd', label: 'AWD', valueType: 'boolean' }),
  buildAttribute({
    id: 'drivetrain',
    label: 'Drivetrain',
    valueType: 'enum',
    allowedValues: ['FWD', 'AWD', 'RWD'],
  }),
  // No `allowedValues` -- must render NO control (CLAUDE.md "Never
  // fabricate": nothing here will invent a set of options).
  buildAttribute({ id: 'trim', label: 'Trim', valueType: 'enum' }),
  buildAttribute({ id: 'price', label: 'Price', valueType: 'number', unit: 'USD' }),
  buildAttribute({ id: 'msrp', label: 'MSRP', valueType: 'money' }),
  buildAttribute({ id: 'color', label: 'Color', valueType: 'string' }),
  buildAttribute({ id: 'notes', label: 'Notes', valueType: 'text' }),
  // No honest single-field comparison control exists for `date`.
  buildAttribute({ id: 'listedOn', label: 'Listed on', valueType: 'date' }),
];

/** Builds one real `EntityRecord` saved option -- an omitted key means this option has no data for that attribute (the real-world "unknown" case). */
function buildOption(id: string, values: Record<string, AttributeValue>): EntityRecord {
  const attributes: EntityRecord['attributes'] = {};
  for (const [definitionId, value] of Object.entries(values)) {
    attributes[definitionId] = {
      definitionId,
      label: definitionId,
      value,
      origin: 'user',
      sourceIds: [],
      status: 'asserted',
      updatedAt: '2026-08-28T00:00:00.000Z',
    };
  }
  return {
    id,
    kind: 'car',
    label: id,
    attributes,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  };
}

// The same realistic 4-saved-car case `WorkspaceSidebar.test.tsx` used, so
// every derived-mode assertion that moved here is measured against
// identical data:
//   - `awd`        -- true on 2 of 4 -> narrowable boolean.
//   - `drivetrain` -- "AWD" on every option -> SUPPRESSED.
//   - `price`      -- four distinct numbers -> numeric plan with a hint.
//   - `msrp`       -- three distinct amounts, all USD -> currency hint.
//   - `color`      -- Red/Red/Blue/Black -> a 3-chip facet, "Red (2)" first.
//   - `notes`      -- one option has a note -> single value -> SUPPRESSED.
const OPTIONS_WITH_DATA: EntityRecord[] = [
  buildOption('car-1', {
    awd: { type: 'boolean', value: true },
    drivetrain: { type: 'enum', value: 'AWD' },
    price: { type: 'number', value: 27995 },
    msrp: { type: 'money', amount: 29500, currency: 'USD' },
    color: { type: 'string', value: 'Red' },
    notes: { type: 'text', value: 'Test drove twice.' },
  }),
  buildOption('car-2', {
    awd: { type: 'boolean', value: true },
    drivetrain: { type: 'enum', value: 'AWD' },
    price: { type: 'number', value: 24500 },
    msrp: { type: 'money', amount: 26000, currency: 'USD' },
    color: { type: 'string', value: 'Red' },
  }),
  buildOption('car-3', {
    awd: { type: 'boolean', value: false },
    drivetrain: { type: 'enum', value: 'AWD' },
    price: { type: 'number', value: 31995 },
    msrp: { type: 'money', amount: 26000, currency: 'USD' },
    color: { type: 'string', value: 'Blue' },
  }),
  buildOption('car-4', {
    awd: { type: 'boolean', value: false },
    drivetrain: { type: 'enum', value: 'AWD' },
    price: { type: 'number', value: 22995 },
    color: { type: 'string', value: 'Black' },
  }),
];

/**
 * Base props for the LEGACY path -- no `options` records supplied, but a
 * real `totalCount`.
 *
 * This is not contradictory test data, it is the exact caller shape
 * `WorkspaceSidebar` shipped with (`options?: EntityRecord[]`, defaulting
 * to `[]`): a case that genuinely has saved options while the records
 * array has not been threaded through. `FilterSheet` deliberately keys its
 * "Nothing to filter yet -- add options first." state on `totalCount`
 * rather than on `options.length` so that caller still gets working
 * generic controls instead of a false claim that the case is empty. Every
 * generic control (`EnumFilterControl`, `TextFilterControl`, the ungrounded
 * number/boolean controls) is reachable only along this path.
 */
function legacyProps(overrides: Partial<FilterSheetProps> = {}): FilterSheetProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    attributeDefinitions: ATTRIBUTES,
    options: [],
    filters: [],
    onFiltersChange: vi.fn(),
    matchingCount: 4,
    totalCount: 4,
    ...overrides,
  };
}

/** Base props for the DERIVED path -- real saved options informing every plan. */
function derivedProps(overrides: Partial<FilterSheetProps> = {}): FilterSheetProps {
  return {
    ...legacyProps(),
    options: OPTIONS_WITH_DATA,
    matchingCount: OPTIONS_WITH_DATA.length,
    totalCount: OPTIONS_WITH_DATA.length,
    ...overrides,
  };
}

/** A thin controlled wrapper so round-trip tests (toggle on, then off; select a value, then clear it) exercise the same `filters` prop flow the real orchestrator provides. */
function ControlledHarness({
  onFiltersChangeSpy,
  initialFilters = [],
  options = [],
}: {
  onFiltersChangeSpy: (filters: WorkspaceFilter[]) => void;
  initialFilters?: WorkspaceFilter[];
  options?: EntityRecord[];
}) {
  const [filters, setFilters] = useState<WorkspaceFilter[]>(initialFilters);
  return (
    <FilterSheet
      {...legacyProps({
        options,
        filters,
        onFiltersChange: (next) => {
          onFiltersChangeSpy(next);
          setFilters(next);
        },
      })}
    />
  );
}

describe('FilterSheet', () => {
  describe('sheet shell', () => {
    it('renders nothing when closed', () => {
      render(<FilterSheet {...legacyProps({ open: false })} />);
      expect(screen.queryByTestId('workspace-filter-sheet')).not.toBeInTheDocument();
      expect(screen.queryByTestId('workspace-filter-awd')).not.toBeInTheDocument();
    });

    it('renders one titled overlay holding every control when open', () => {
      render(<FilterSheet {...legacyProps()} />);
      expect(screen.getByTestId('workspace-filter-sheet')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    });

    it('takes no layout prop and never consults matchMedia -- the sheet primitive owns narrow-vs-wide presentation', () => {
      // A component that branched on viewport width itself would reopen the
      // ADR 0008 gap this move exists to close (the sidebar rendered `null`
      // at `layout: "narrow"`, leaving the WebMCP pane with no filters at
      // all). Guarding it here keeps that from creeping back in.
      const matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      vi.stubGlobal('matchMedia', matchMedia);
      try {
        render(<FilterSheet {...derivedProps()} />);
        expect(matchMedia).not.toHaveBeenCalled();
        expect(screen.getByTestId('workspace-filter-sheet')).toBeInTheDocument();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('which controls render', () => {
    it('renders exactly one control per filterable attribute, honestly omitting enum-without-allowedValues and date', () => {
      render(<FilterSheet {...legacyProps()} />);
      expect(screen.getByTestId('workspace-filter-awd')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-filter-drivetrain')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-filter-price')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-filter-msrp')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-filter-color')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-filter-notes')).toBeInTheDocument();
      expect(screen.queryByTestId('workspace-filter-trim')).not.toBeInTheDocument();
      expect(screen.queryByTestId('workspace-filter-listedOn')).not.toBeInTheDocument();
    });

    it('uses the new workspace-filter-* testids, never the retired sidebar-scoped ones', () => {
      render(<FilterSheet {...legacyProps()} />);
      expect(screen.queryByTestId('workspace-sidebar-filter-awd')).not.toBeInTheDocument();
      expect(screen.queryByTestId('workspace-sidebar-filters')).not.toBeInTheDocument();
    });
  });

  describe('empty states', () => {
    it('says nothing is filterable when the case declares no filterable attribute at all', () => {
      render(<FilterSheet {...legacyProps({ attributeDefinitions: [] })} />);
      expect(screen.getByTestId('workspace-filter-sheet-empty')).toHaveTextContent(
        'No filterable details yet.',
      );
    });

    it('says to add options first when the case has no saved options at all', () => {
      render(<FilterSheet {...legacyProps({ matchingCount: 0, totalCount: 0 })} />);
      expect(screen.getByTestId('workspace-filter-sheet-empty')).toHaveTextContent(
        'Nothing to filter yet — add options first.',
      );
      expect(screen.queryByTestId('workspace-filter-awd')).not.toBeInTheDocument();
    });

    it('says every option agrees when real data exists but nothing can narrow the set -- distinct from the other two', () => {
      const uniformOptions: EntityRecord[] = [
        buildOption('car-1', { drivetrain: { type: 'enum', value: 'AWD' } }),
        buildOption('car-2', { drivetrain: { type: 'enum', value: 'AWD' } }),
      ];
      render(
        <FilterSheet
          {...derivedProps({
            attributeDefinitions: [ATTRIBUTES[1]!],
            options: uniformOptions,
            matchingCount: 2,
            totalCount: 2,
          })}
        />,
      );
      expect(screen.getByTestId('workspace-filter-sheet-empty')).toHaveTextContent(
        'Every saved option matches on every filterable detail.',
      );
    });
  });

  describe('generic controls (no option records supplied)', () => {
    it('a boolean toggle produces a filter payload that satisfies WorkspaceFilterSchema, and clears on uncheck', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      await user.click(screen.getByTestId('workspace-filter-awd'));
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'awd', operator: 'equals', value: 'true' },
      ]);
      const [committed] = onFiltersChangeSpy.mock.calls.at(-1) as [WorkspaceFilter[]];
      expect(() => WorkspaceFilterSchema.parse(committed[0])).not.toThrow();

      await user.click(screen.getByTestId('workspace-filter-awd'));
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([]);
    });

    it('never writes a criterion-shaped payload -- only fieldId/operator/value, never weight/target', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      await user.click(screen.getByTestId('workspace-filter-awd'));
      const [committed] = onFiltersChangeSpy.mock.calls.at(-1) as [WorkspaceFilter[]];
      expect(Object.keys(committed[0] as object).sort()).toEqual(['fieldId', 'operator', 'value']);
    });

    it('an enum select produces an equals filter, and returning to "Any" clears it', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      const select = screen.getByTestId('workspace-filter-drivetrain');
      await user.selectOptions(select, 'AWD');
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'drivetrain', operator: 'equals', value: 'AWD' },
      ]);
      const [committed] = onFiltersChangeSpy.mock.calls.at(-1) as [WorkspaceFilter[]];
      expect(() => WorkspaceFilterSchema.parse(committed[0])).not.toThrow();

      await user.selectOptions(select, '');
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([]);
    });

    it('a number filter produces a less_than_or_equal payload that satisfies WorkspaceFilterSchema', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      await user.type(screen.getByTestId('workspace-filter-price'), '25000');
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'price', operator: 'less_than_or_equal', value: '25000' },
      ]);
      const [committed] = onFiltersChangeSpy.mock.calls.at(-1) as [WorkspaceFilter[]];
      expect(() => WorkspaceFilterSchema.parse(committed[0])).not.toThrow();
    });

    it('removes the number filter entirely when the field is emptied, rather than leaving a blank one behind', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      const input = screen.getByTestId('workspace-filter-price');
      await user.type(input, '25000');
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'price', operator: 'less_than_or_equal', value: '25000' },
      ]);

      await user.clear(input);
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([]);
      expect(input).toHaveValue(null);
    });

    it('never commits an interim keystroke that is not a parseable number', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);
      const input = screen.getByTestId('workspace-filter-price');

      // A lone "-" is the canonical interim keystroke: on the way to
      // "-500" it is momentarily not a number at all. Two independent
      // defences keep it out of `WorkspaceViewState` -- the field's own
      // `type="number"` value sanitisation (which is why `input` reads
      // empty here rather than "-", in jsdom and in a real browser alike),
      // and the handler's `Number.isFinite` guard behind it for any host
      // that does not sanitise. Either way the observable contract is the
      // same and is what this asserts: nothing unevaluable is ever handed
      // to the caller.
      await user.type(input, '-');
      expect((input as HTMLInputElement).value).toBe('');

      await user.type(input, '25');
      const priceValues = onFiltersChangeSpy.mock.calls
        .flatMap(([next]) => next as WorkspaceFilter[])
        .filter((filter) => filter.fieldId === 'price')
        .map((filter) => filter.value);

      expect(priceValues.length).toBeGreaterThan(0);
      expect(priceValues).not.toContain('-');
      for (const value of priceValues) {
        expect(Number.isFinite(Number(value))).toBe(true);
      }
      // Only once the keystrokes add up to a real number does anything get
      // committed -- and then it is exactly what was typed.
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'price', operator: 'less_than_or_equal', value: '-25' },
      ]);
    });

    it('echoes what is typed into a free-text field while it is being typed', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      // The mid-keystroke echo (`pendingTextValues`) is what keeps a
      // controlled field from fighting the person typing into it before the
      // committed `filters` prop has round-tripped back.
      const input = screen.getByTestId('workspace-filter-notes');
      await user.type(input, 'roof rack');
      expect(input).toHaveValue('roof rack');
    });

    it('a text filter produces a contains payload, and clearing the field removes it', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      const input = screen.getByTestId('workspace-filter-color');
      await user.type(input, 'red');
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'color', operator: 'contains', value: 'red' },
      ]);
      const [committed] = onFiltersChangeSpy.mock.calls.at(-1) as [WorkspaceFilter[]];
      expect(() => WorkspaceFilterSchema.parse(committed[0])).not.toThrow();

      await user.clear(input);
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([]);
    });

    it('never calls onFiltersChange with anything other than the complete next array (no deltas)', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      const existing: WorkspaceFilter[] = [{ fieldId: 'awd', operator: 'equals', value: 'true' }];
      render(
        <ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} initialFilters={existing} />,
      );

      await user.type(screen.getByTestId('workspace-filter-color'), 'red');
      const lastCall = onFiltersChangeSpy.mock.calls.at(-1) as [WorkspaceFilter[]];
      // The pre-existing `awd` filter must still be present alongside the new `color` filter.
      expect(lastCall[0]).toEqual(
        expect.arrayContaining([
          { fieldId: 'awd', operator: 'equals', value: 'true' },
          { fieldId: 'color', operator: 'contains', value: 'red' },
        ]),
      );
    });
  });

  describe('derived controls (real option records supplied)', () => {
    it('suppresses a filter where every option agrees, honoring the "every option has the same drivetrain" example', () => {
      render(<FilterSheet {...derivedProps()} />);
      // Every option is AWD -- a drivetrain filter could never narrow the set.
      expect(screen.queryByTestId('workspace-filter-drivetrain')).not.toBeInTheDocument();
      // `notes` has a real value on only one of the four cars.
      expect(screen.queryByTestId('workspace-filter-notes')).not.toBeInTheDocument();
    });

    it('replaces the free-text/select control with real value chips carrying live counts, sorted by count then alphabetically', () => {
      render(<FilterSheet {...derivedProps()} />);
      const group = screen.getByTestId('workspace-filter-color');
      expect(screen.queryByPlaceholderText('Search color')).not.toBeInTheDocument();
      const chips = within(group).getAllByRole('button');
      expect(chips.map((chip) => chip.textContent)).toEqual([
        expect.stringContaining('Red'),
        expect.stringContaining('Black'),
        expect.stringContaining('Blue'),
      ]);
      expect(within(group).getByRole('button', { name: /Red/ })).toHaveTextContent('Red (2)');
      expect(within(group).getByRole('button', { name: /Black/ })).toHaveTextContent('Black (1)');
      expect(within(group).getByTestId('workspace-filter-color-option-0')).toHaveTextContent(
        'Red (2)',
      );
    });

    it('a facet chip commits a real equals filter satisfying WorkspaceFilterSchema, and pressing it again clears it', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(
        <ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} options={OPTIONS_WITH_DATA} />,
      );

      const redChip = screen.getByRole('button', { name: /Red/ });
      await user.click(redChip);
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'color', operator: 'equals', value: 'Red' },
      ]);
      const [committed] = onFiltersChangeSpy.mock.calls.at(-1) as [WorkspaceFilter[]];
      expect(() => WorkspaceFilterSchema.parse(committed[0])).not.toThrow();

      await user.click(redChip);
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([]);
    });

    it('is single-select: choosing a second value for the same field replaces the first rather than stacking', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(
        <ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} options={OPTIONS_WITH_DATA} />,
      );

      await user.click(screen.getByRole('button', { name: /Red/ }));
      await user.click(screen.getByRole('button', { name: /Blue/ }));
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'color', operator: 'equals', value: 'Blue' },
      ]);
      expect(screen.getByRole('button', { name: /Red/ })).toHaveAttribute('data-state', 'off');
      expect(screen.getByRole('button', { name: /Blue/ })).toHaveAttribute('data-state', 'on');
    });

    it('keeps the boolean toggle only when it can narrow the set, with a real "N of M match" hint', () => {
      render(<FilterSheet {...derivedProps()} />);
      expect(screen.getByTestId('workspace-filter-awd')).toBeInTheDocument();
      expect(screen.getByText('2 of 4 match')).toBeInTheDocument();
    });

    it('keeps the numeric "at most" input but grounds it with a real observed range, formatted as currency for money attributes', () => {
      render(<FilterSheet {...derivedProps()} />);
      expect(screen.getByTestId('workspace-filter-price')).toBeInTheDocument();
      // A unit is written once, after the range; a currency symbol goes on
      // both ends (the `msrp` assertion below). The first pass at the shared
      // module unitted both ends and briefly shipped "Seen: 19,800 mi–31,200
      // mi" to the running product, which reads as two measurements rather
      // than one span.
      expect(screen.getByText('Seen: 22,995–31,995 USD')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-filter-msrp')).toBeInTheDocument();
      expect(screen.getByText('Seen: $26,000–$29,500')).toBeInTheDocument();
    });

    it('the numeric "at most" filter still works exactly as before once populated with a real range hint', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(
        <ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} options={OPTIONS_WITH_DATA} />,
      );

      await user.type(screen.getByTestId('workspace-filter-price'), '25000');
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'price', operator: 'less_than_or_equal', value: '25000' },
      ]);
    });

    it('orders surviving filters by the largest group each one can keep, most useful first', () => {
      render(<FilterSheet {...derivedProps()} />);
      const filterIds = screen
        .getAllByTestId(/^workspace-filter-(awd|price|msrp|color)$/)
        .map((element) => element.dataset['testid']);
      // Real scores over `OPTIONS_WITH_DATA`, all four cars:
      //   price  27995/24500/31995/22995 -> 4 distinct, an "at most"
      //          threshold can keep 3 of them          -> 3
      //   awd    true/true/false/false                 -> 2
      //   color  Red/Red/Blue/Black, biggest bucket 2  -> 2
      //   msrp   29500/26000/26000 (one car has none)  -> 1
      // so `price` leads and `msrp` trails. `awd` and `color` genuinely tie
      // at 2 and their relative order is just the stable sort preserving
      // declaration order -- deliberately NOT asserted, because asserting a
      // tiebreak the module does not promise would be asserting an accident.
      expect(filterIds[0]).toBe('workspace-filter-price');
      expect(filterIds[filterIds.length - 1]).toBe('workspace-filter-msrp');
      expect(filterIds.indexOf('workspace-filter-price')).toBeLessThan(
        filterIds.indexOf('workspace-filter-awd'),
      );
      expect(filterIds.indexOf('workspace-filter-color')).toBeLessThan(
        filterIds.indexOf('workspace-filter-msrp'),
      );
    });
  });

  describe('footer', () => {
    it('labels the primary button with the live result count once a filter is applied', () => {
      render(
        <FilterSheet
          {...derivedProps({
            filters: [{ fieldId: 'color', operator: 'equals', value: 'Red' }],
            matchingCount: 2,
            totalCount: 4,
          })}
        />,
      );
      expect(screen.getByTestId('workspace-filter-sheet-done')).toHaveTextContent('Show 2 of 4');
    });

    it('labels the primary button "Show all N" when nothing is filtered, rather than a redundant "N of N"', () => {
      render(<FilterSheet {...derivedProps()} />);
      expect(screen.getByTestId('workspace-filter-sheet-done')).toHaveTextContent('Show all 4');
    });

    it('only closes the sheet -- it is an exit, never a deferred apply', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onFiltersChange = vi.fn();
      render(<FilterSheet {...derivedProps({ onOpenChange, onFiltersChange })} />);

      await user.click(screen.getByTestId('workspace-filter-sheet-done'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      // Filters already applied live on every control change; pressing the
      // exit must not re-emit or re-commit anything.
      expect(onFiltersChange).not.toHaveBeenCalled();
    });

    it('keeps Clear all in place but disabled when there is nothing to clear, so the footer never reflows under the cursor', () => {
      render(<FilterSheet {...derivedProps()} />);
      expect(screen.getByTestId('workspace-filter-sheet-clear-all')).toBeDisabled();
    });

    it('clears every applied filter at once, emitting a genuinely empty array', async () => {
      const user = userEvent.setup();
      const onFiltersChange = vi.fn();
      render(
        <FilterSheet
          {...derivedProps({
            filters: [
              { fieldId: 'color', operator: 'equals', value: 'Red' },
              { fieldId: 'awd', operator: 'equals', value: 'true' },
            ],
            matchingCount: 2,
            totalCount: 4,
            onFiltersChange,
          })}
        />,
      );

      const clearAll = screen.getByTestId('workspace-filter-sheet-clear-all');
      expect(clearAll).toBeEnabled();
      await user.click(clearAll);
      expect(onFiltersChange).toHaveBeenCalledWith([]);
    });

    it('also drops the mid-keystroke echo when everything is cleared, so no value survives that filters nothing', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(
        <ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} options={OPTIONS_WITH_DATA} />,
      );

      const priceInput = screen.getByTestId('workspace-filter-price');
      await user.type(priceInput, '25000');
      expect(priceInput).toHaveValue(25000);

      await user.click(screen.getByTestId('workspace-filter-sheet-clear-all'));
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([]);
      expect(priceInput).toHaveValue(null);
    });

    it('degrades the primary label to a plain exit when the case has no options at all', () => {
      render(<FilterSheet {...legacyProps({ matchingCount: 0, totalCount: 0 })} />);
      expect(screen.getByTestId('workspace-filter-sheet-done')).toHaveTextContent('Done');
    });
  });

  describe('accessibility', () => {
    it('gives every control and footer button a real 44px touch target', () => {
      render(<FilterSheet {...derivedProps()} />);
      const touchClass = 'min-h-[var(--size-touch-target-min)]';
      expect(screen.getByTestId('workspace-filter-awd')).toHaveClass(touchClass);
      expect(screen.getByTestId('workspace-filter-price')).toHaveClass(touchClass);
      expect(screen.getByTestId('workspace-filter-color-option-0')).toHaveClass(touchClass);
      expect(screen.getByTestId('workspace-filter-sheet-done')).toHaveClass(touchClass);
      expect(screen.getByTestId('workspace-filter-sheet-clear-all')).toHaveClass(touchClass);
    });

    it('has no axe violations with every generic control present', async () => {
      const { container } = render(<FilterSheet {...legacyProps()} />);
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations with real option data driving every derived control', async () => {
      const { container } = render(<FilterSheet {...derivedProps()} />);
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations in the empty state', async () => {
      const { container } = render(<FilterSheet {...legacyProps({ attributeDefinitions: [] })} />);
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
