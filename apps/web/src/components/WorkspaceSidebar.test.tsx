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
import { WorkspaceSidebar, type WorkspaceSidebarProps } from './WorkspaceSidebar.js';
import type { DecisionProfile, DecisionProfileConcern } from './decision-profile.js';

function buildConcern(overrides: Partial<DecisionProfileConcern> = {}): DecisionProfileConcern {
  return {
    id: 'crit-safety',
    label: 'Safety',
    kind: 'preference',
    weight: 80,
    priorityBand: 'very_important',
    origin: 'pack',
    target: null,
    question: null,
    ...overrides,
  };
}

const EMPTY_PROFILE: DecisionProfile = {
  mustHave: [],
  important: [],
  niceToHave: [],
  context: [],
  personalConcerns: [],
  missing: [],
  suggestedQuestions: [],
};

const FULL_PROFILE: DecisionProfile = {
  mustHave: [
    buildConcern({
      id: 'custom.budget_cap',
      label: 'Budget cap',
      kind: 'hard_constraint',
      weight: 95,
      priorityBand: 'very_important',
    }),
  ],
  important: [
    buildConcern({
      id: 'crit-safety',
      label: 'Safety',
      weight: 80,
      priorityBand: 'very_important',
    }),
    buildConcern({ id: 'crit-price', label: 'Price', weight: 50, priorityBand: 'important' }),
  ],
  niceToHave: [
    buildConcern({
      id: 'crit-color',
      label: 'Color',
      weight: 10,
      priorityBand: 'somewhat_important',
    }),
  ],
  // Deliberately non-empty -- these must NOT appear in the Priorities
  // section (see WorkspaceSidebar.tsx's file header on why `context` and
  // `personalConcerns` are excluded from the weighted priority list).
  context: [
    buildConcern({
      id: 'crit-commute',
      label: 'Commute distance',
      kind: 'consideration',
      weight: 15,
      priorityBand: 'somewhat_important',
    }),
  ],
  personalConcerns: [
    {
      id: 'custom.laptop_work_fit',
      label: 'Laptop work fit',
      reason: 'I work from the car sometimes.',
      origin: 'user',
      confirmation: 'confirmed',
      proposedBy: 'user',
    },
  ],
  missing: [],
  suggestedQuestions: [],
};

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
  // fabricate": this component will not invent a set of options).
  buildAttribute({ id: 'trim', label: 'Trim', valueType: 'enum' }),
  buildAttribute({ id: 'price', label: 'Price', valueType: 'number', unit: 'USD' }),
  buildAttribute({ id: 'msrp', label: 'MSRP', valueType: 'money' }),
  buildAttribute({ id: 'color', label: 'Color', valueType: 'string' }),
  buildAttribute({ id: 'notes', label: 'Notes', valueType: 'text' }),
  // No honest single-field comparison control exists for `date` -- must
  // render nothing for this field either.
  buildAttribute({ id: 'listedOn', label: 'Listed on', valueType: 'date' }),
];

/** Builds one real `EntityRecord` saved option -- `values` maps `ATTRIBUTES[].id` to the `AttributeValue` this option asserts; an omitted key means this option has no data for that attribute (the same "unknown" real-world case `sampleAttributeValue` must skip over). */
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

// A realistic 4-saved-car case (product.md's own "at most 5 saved cars"
// bound) exercising every derived-mode branch `planFilter` has:
//   - `awd`        -- true on 2 of 4, false on 2 of 4 -> narrowable boolean.
//   - `drivetrain` -- "AWD" on every option that has a value -> Defect 2b's
//     own worked example ("every option has the same drivetrain") -> must
//     be SUPPRESSED entirely in derived mode.
//   - `price`      -- four distinct numbers -> numeric plan with a real hint.
//   - `msrp`       -- three distinct amounts, all USD -> numeric plan with
//     a currency-formatted hint.
//   - `color`      -- Red/Red/Blue/Black -> a 3-chip facet, "Red (2)" first.
//   - `notes`      -- only one option has ever recorded a note -> a single
//     distinct value -> SUPPRESSED (cannot narrow a set of one).
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

function baseProps(overrides: Partial<WorkspaceSidebarProps> = {}): WorkspaceSidebarProps {
  return {
    layout: 'expanded',
    decisionProfile: FULL_PROFILE,
    attributeDefinitions: ATTRIBUTES,
    filters: [],
    onFiltersChange: vi.fn(),
    openQuestionsCount: 3,
    onOpenQuestions: vi.fn(),
    ...overrides,
  };
}

/** A thin controlled wrapper so round-trip tests (toggle on, then off; select a value, then clear it) exercise the same `filters` prop flow the real orchestrator provides. */
function ControlledHarness({
  onFiltersChangeSpy,
  initialFilters = [],
  options,
}: {
  onFiltersChangeSpy: (filters: WorkspaceFilter[]) => void;
  initialFilters?: WorkspaceFilter[];
  /** Passed straight through to `WorkspaceSidebar` -- omitted keeps every existing (legacy-mode) call site of this harness byte-for-byte unchanged. */
  options?: EntityRecord[];
}) {
  const [filters, setFilters] = useState<WorkspaceFilter[]>(initialFilters);
  return (
    <WorkspaceSidebar
      {...baseProps({
        filters,
        // `exactOptionalPropertyTypes` distinguishes an explicit `options:
        // undefined` from the key being absent -- only spread it in when a
        // caller actually passed real option data, so every pre-existing
        // (legacy-mode) `ControlledHarness` call site is unaffected.
        ...(options !== undefined ? { options } : {}),
        onFiltersChange: (next) => {
          onFiltersChangeSpy(next);
          setFilters(next);
        },
      })}
    />
  );
}

describe('WorkspaceSidebar', () => {
  describe('layout gate', () => {
    it('renders nothing at layout="narrow" -- this content is carried by other WebMCP-pane surfaces', () => {
      const { container } = render(<WorkspaceSidebar {...baseProps({ layout: 'narrow' })} />);
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByTestId('workspace-sidebar')).not.toBeInTheDocument();
    });

    it('renders the sidebar at layout="expanded"', () => {
      render(<WorkspaceSidebar {...baseProps()} />);
      expect(screen.getByTestId('workspace-sidebar')).toBeInTheDocument();
    });
  });

  describe('Priorities', () => {
    it('shows only mustHave/important/niceToHave concerns, sorted by weight descending, excluding context and personal concerns', () => {
      render(<WorkspaceSidebar {...baseProps()} />);
      const priorities = screen.getByTestId('workspace-sidebar-priorities');
      const rows = within(priorities).getAllByRole('listitem');
      expect(rows).toHaveLength(4);
      // Descending weight order: Budget cap (95), Safety (80), Price (50), Color (10).
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Budget cap'),
        expect.stringContaining('Safety'),
        expect.stringContaining('Price'),
        expect.stringContaining('Color'),
      ]);
      expect(within(priorities).queryByText('Commute distance')).not.toBeInTheDocument();
      expect(within(priorities).queryByText('Laptop work fit')).not.toBeInTheDocument();
    });

    it('shows simplified weight bands, never a raw numeric weight or percentage', () => {
      render(<WorkspaceSidebar {...baseProps()} />);
      const priorities = screen.getByTestId('workspace-sidebar-priorities');
      expect(
        within(priorities).getByTestId('workspace-sidebar-priority-band-custom.budget_cap'),
      ).toHaveTextContent('Very important');
      expect(
        within(priorities).getByTestId('workspace-sidebar-priority-band-crit-price'),
      ).toHaveTextContent('Important');
      expect(
        within(priorities).getByTestId('workspace-sidebar-priority-band-crit-color'),
      ).toHaveTextContent('Somewhat important');
      // No raw weight (95, 80, 50, 10) or a "%" sign appears anywhere in the section.
      expect(within(priorities).queryByText(/95|80|50|10|%/)).not.toBeInTheDocument();
    });

    it('renders an intentional empty state when there is no case yet', () => {
      render(<WorkspaceSidebar {...baseProps({ decisionProfile: null })} />);
      expect(screen.getByTestId('workspace-sidebar-priorities-empty')).toBeInTheDocument();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('renders an intentional empty state when every weighted section is empty', () => {
      render(<WorkspaceSidebar {...baseProps({ decisionProfile: EMPTY_PROFILE })} />);
      expect(screen.getByTestId('workspace-sidebar-priorities-empty')).toBeInTheDocument();
    });
  });

  describe('Filters', () => {
    it('renders exactly one control per filterable attribute, honestly omitting enum-without-allowedValues and date', () => {
      render(<WorkspaceSidebar {...baseProps()} />);
      expect(screen.getByTestId('workspace-sidebar-filter-awd')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-sidebar-filter-drivetrain')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-sidebar-filter-price')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-sidebar-filter-msrp')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-sidebar-filter-color')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-sidebar-filter-notes')).toBeInTheDocument();
      expect(screen.queryByTestId('workspace-sidebar-filter-trim')).not.toBeInTheDocument();
      expect(screen.queryByTestId('workspace-sidebar-filter-listedOn')).not.toBeInTheDocument();
    });

    it('renders an intentional empty state when no attribute is filterable', () => {
      render(<WorkspaceSidebar {...baseProps({ attributeDefinitions: [] })} />);
      expect(screen.getByTestId('workspace-sidebar-filters-empty')).toBeInTheDocument();
    });

    it('a boolean toggle produces a filter payload that satisfies WorkspaceFilterSchema, and clears on uncheck', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      await user.click(screen.getByTestId('workspace-sidebar-filter-awd'));
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'awd', operator: 'equals', value: 'true' },
      ]);
      const [committed] = onFiltersChangeSpy.mock.calls.at(-1) as [WorkspaceFilter[]];
      expect(() => WorkspaceFilterSchema.parse(committed[0])).not.toThrow();

      await user.click(screen.getByTestId('workspace-sidebar-filter-awd'));
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([]);
    });

    it('never writes a criterion-shaped payload -- only fieldId/operator/value, never weight/target', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      await user.click(screen.getByTestId('workspace-sidebar-filter-awd'));
      const [committed] = onFiltersChangeSpy.mock.calls.at(-1) as [WorkspaceFilter[]];
      expect(Object.keys(committed[0] as object).sort()).toEqual(['fieldId', 'operator', 'value']);
    });

    it('an enum select produces an equals filter, and returns to "Any" clears it', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      const select = screen.getByTestId('workspace-sidebar-filter-drivetrain');
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

      await user.type(screen.getByTestId('workspace-sidebar-filter-price'), '25000');
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'price', operator: 'less_than_or_equal', value: '25000' },
      ]);
      const [committed] = onFiltersChangeSpy.mock.calls.at(-1) as [WorkspaceFilter[]];
      expect(() => WorkspaceFilterSchema.parse(committed[0])).not.toThrow();
    });

    it('a text filter produces a contains payload, and clearing the field removes it', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(<ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} />);

      const input = screen.getByTestId('workspace-sidebar-filter-color');
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

      await user.type(screen.getByTestId('workspace-sidebar-filter-color'), 'red');
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

  // Defect 2 fix: once real `options` data is supplied, the panel derives
  // selectable values-with-counts from what saved options actually have,
  // suppresses anything that cannot narrow the set, and grounds numeric
  // inputs with a real observed range -- see `WorkspaceSidebar.tsx`'s file
  // header "Filters" section and `planFilter`'s doc comment.
  describe('Filters (derived mode -- real option data supplied)', () => {
    it('suppresses a filter where every option agrees, honoring Defect 2b\'s own "every option has the same drivetrain" example', () => {
      render(<WorkspaceSidebar {...baseProps({ options: OPTIONS_WITH_DATA })} />);
      // Every `OPTIONS_WITH_DATA` car is AWD -- a drivetrain filter could
      // never narrow the set, so it must not render at all.
      expect(screen.queryByTestId('workspace-sidebar-filter-drivetrain')).not.toBeInTheDocument();
      // `notes` has a real value on only one of the four cars -- a single
      // distinct value also cannot narrow anything.
      expect(screen.queryByTestId('workspace-sidebar-filter-notes')).not.toBeInTheDocument();
    });

    it('replaces the free-text/select control with real selectable value chips carrying live counts, sorted by count then alphabetically', () => {
      render(<WorkspaceSidebar {...baseProps({ options: OPTIONS_WITH_DATA })} />);
      const group = screen.getByTestId('workspace-sidebar-filter-color');
      // Not a blank "Search color" text box any more.
      expect(screen.queryByPlaceholderText('Search color')).not.toBeInTheDocument();
      const chips = within(group).getAllByRole('button');
      expect(chips.map((chip) => chip.textContent)).toEqual([
        expect.stringContaining('Red'),
        expect.stringContaining('Black'),
        expect.stringContaining('Blue'),
      ]);
      expect(within(group).getByRole('button', { name: /Red/ })).toHaveTextContent('Red (2)');
      expect(within(group).getByRole('button', { name: /Black/ })).toHaveTextContent('Black (1)');
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

    it('keeps the boolean toggle only when it can narrow the set, with a real "N of M match" hint', () => {
      render(<WorkspaceSidebar {...baseProps({ options: OPTIONS_WITH_DATA })} />);
      // `awd` is true on 2 of 4 cars -- narrowable, so it survives with a
      // grounded hint (never a fabricated estimate).
      expect(screen.getByTestId('workspace-sidebar-filter-awd')).toBeInTheDocument();
      expect(screen.getByText('2 of 4 match')).toBeInTheDocument();
    });

    it('keeps the numeric "at most" input but grounds it with a real observed range, formatted as currency for money attributes', () => {
      render(<WorkspaceSidebar {...baseProps({ options: OPTIONS_WITH_DATA })} />);
      expect(screen.getByTestId('workspace-sidebar-filter-price')).toBeInTheDocument();
      expect(screen.getByText('Seen: 22,995–31,995 USD')).toBeInTheDocument();
      expect(screen.getByTestId('workspace-sidebar-filter-msrp')).toBeInTheDocument();
      expect(screen.getByText('Seen: $26,000–$29,500')).toBeInTheDocument();
    });

    it('the numeric "at most" filter still works exactly as before once populated with a real range hint', async () => {
      const user = userEvent.setup();
      const onFiltersChangeSpy = vi.fn();
      render(
        <ControlledHarness onFiltersChangeSpy={onFiltersChangeSpy} options={OPTIONS_WITH_DATA} />,
      );

      await user.type(screen.getByTestId('workspace-sidebar-filter-price'), '25000');
      expect(onFiltersChangeSpy).toHaveBeenLastCalledWith([
        { fieldId: 'price', operator: 'less_than_or_equal', value: '25000' },
      ]);
    });

    it('orders surviving filters by how much they can actually narrow the set, most discriminating first', () => {
      render(<WorkspaceSidebar {...baseProps({ options: OPTIONS_WITH_DATA })} />);
      const filterIds = screen
        .getAllByTestId(/^workspace-sidebar-filter-/)
        // Facet option chips also match this prefix -- only the top-level
        // per-attribute controls matter for ordering.
        .filter((element) =>
          /^workspace-sidebar-filter-[a-z]+$/.test(element.dataset['testid'] ?? ''),
        )
        .map((element) => element.dataset['testid']);
      // `color` (3 distinct values) and `price` (4 distinct values) can
      // split the 4-car set more finely than `awd` (always exactly 2
      // buckets once narrowable), so both outrank it; `drivetrain`/`notes`
      // are absent entirely (suppressed, asserted by the test above).
      expect(filterIds.indexOf('workspace-sidebar-filter-price')).toBeLessThan(
        filterIds.indexOf('workspace-sidebar-filter-awd'),
      );
      expect(filterIds.indexOf('workspace-sidebar-filter-color')).toBeLessThan(
        filterIds.indexOf('workspace-sidebar-filter-awd'),
      );
    });

    it('renders an honest empty state, distinct from "no filterable attributes at all", when real data exists but nothing can narrow the set', () => {
      const uniformOptions: EntityRecord[] = [
        buildOption('car-1', { drivetrain: { type: 'enum', value: 'AWD' } }),
        buildOption('car-2', { drivetrain: { type: 'enum', value: 'AWD' } }),
      ];
      render(
        <WorkspaceSidebar
          {...baseProps({ attributeDefinitions: [ATTRIBUTES[1]!], options: uniformOptions })}
        />,
      );
      expect(screen.getByTestId('workspace-sidebar-filters-empty')).toHaveTextContent(
        'Every saved option matches on every filterable detail.',
      );
    });

    it('has no axe violations with real option data driving every derived control', async () => {
      const { container } = render(
        <WorkspaceSidebar {...baseProps({ options: OPTIONS_WITH_DATA })} />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('Still checking', () => {
    it('shows the compact open-questions count', () => {
      render(<WorkspaceSidebar {...baseProps({ openQuestionsCount: 3 })} />);
      expect(screen.getByTestId('workspace-sidebar-still-checking-count')).toHaveTextContent('3');
    });

    it('renders an honest zero state rather than hiding the control', () => {
      render(<WorkspaceSidebar {...baseProps({ openQuestionsCount: 0 })} />);
      expect(screen.getByTestId('workspace-sidebar-still-checking-count')).toHaveTextContent('0');
      expect(screen.getByTestId('workspace-sidebar-still-checking-button')).toBeInTheDocument();
    });

    it('calls onOpenQuestions when clicked -- never opens anything itself', async () => {
      const user = userEvent.setup();
      const onOpenQuestions = vi.fn();
      render(<WorkspaceSidebar {...baseProps({ onOpenQuestions })} />);

      await user.click(screen.getByTestId('workspace-sidebar-still-checking-button'));
      expect(onOpenQuestions).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('has no axe violations with a full profile and every filter type present', async () => {
      const { container } = render(<WorkspaceSidebar {...baseProps()} />);
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations in the fully-empty state', async () => {
      const { container } = render(
        <WorkspaceSidebar
          {...baseProps({
            decisionProfile: EMPTY_PROFILE,
            attributeDefinitions: [],
            openQuestionsCount: 0,
          })}
        />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
