import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { AttributeDefinition, EntityRecord, PresentationDefinition } from '@sift/contracts';
import { OptionCompareView } from './OptionCompareView.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const DEFINITIONS: AttributeDefinition[] = [
  {
    id: 'price',
    label: 'Price',
    valueType: 'money',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'lower_better',
    sensitive: false,
  },
  {
    id: 'mileage',
    label: 'Mileage',
    valueType: 'number',
    required: false,
    appliesTo: ['car'],
    unit: 'mi',
    evidenceExpectation: 'assertion',
    comparison: 'lower_better',
    sensitive: false,
  },
  {
    id: 'custom.laptop_work_fit',
    label: 'Laptop work fit',
    valueType: 'string',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'none',
    sensitive: false,
  },
];

function buildEntity(overrides: Partial<EntityRecord> = {}): EntityRecord {
  return {
    id: 'candidate-rav4',
    kind: 'car',
    label: 'Toyota RAV4',
    attributes: {
      price: {
        definitionId: 'price',
        label: 'Price',
        value: { type: 'money', amount: 28500, currency: 'USD' },
        origin: 'user',
        sourceIds: [],
        status: 'asserted',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
      mileage: {
        definitionId: 'mileage',
        label: 'Mileage',
        value: { type: 'number', value: 15000, unit: 'mi' },
        origin: 'user',
        sourceIds: [],
        status: 'asserted',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
      'custom.laptop_work_fit': {
        definitionId: 'custom.laptop_work_fit',
        label: 'Laptop work fit',
        value: { type: 'string', value: 'Likely good' },
        origin: 'user',
        sourceIds: [],
        status: 'asserted',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
    },
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

const OPTIONS: EntityRecord[] = [
  buildEntity(),
  buildEntity({
    id: 'candidate-crv',
    label: 'Honda CR-V',
    attributes: {
      price: {
        definitionId: 'price',
        label: 'Price',
        value: { type: 'money', amount: 32400, currency: 'USD' },
        origin: 'user',
        sourceIds: [],
        status: 'asserted',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
      mileage: {
        definitionId: 'mileage',
        label: 'Mileage',
        value: { type: 'number', value: 12000, unit: 'mi' },
        origin: 'user',
        sourceIds: [],
        status: 'asserted',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
      // No custom.laptop_work_fit -- exercises the "Unknown" cell path.
    },
  }),
  buildEntity({
    id: 'candidate-forester',
    label: 'Subaru Forester',
    attributes: {
      // No price -- exercises the "Unknown" cell path for a different row.
      mileage: {
        definitionId: 'mileage',
        label: 'Mileage',
        value: { type: 'number', value: 20500, unit: 'mi' },
        origin: 'user',
        sourceIds: [],
        status: 'asserted',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
      'custom.laptop_work_fit': {
        definitionId: 'custom.laptop_work_fit',
        label: 'Laptop work fit',
        value: { type: 'string', value: 'Poor' },
        origin: 'user',
        sourceIds: [],
        status: 'asserted',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
    },
  }),
];

describe('OptionCompareView', () => {
  it('renders the empty state when no options are visible', () => {
    render(
      <OptionCompareView
        options={[]}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        layout="expanded"
      />,
    );
    expect(screen.getByTestId('option-compare-view-empty')).toBeInTheDocument();
  });

  it('renders a column per option and a row per applicable attribute when no narrowing props are given', () => {
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        layout="expanded"
      />,
    );

    expect(screen.getByTestId('option-compare-view-header-candidate-rav4')).toHaveTextContent(
      'Toyota RAV4',
    );
    expect(screen.getByTestId('option-compare-view-header-candidate-crv')).toHaveTextContent(
      'Honda CR-V',
    );
    expect(screen.getByTestId('option-compare-view-header-candidate-forester')).toHaveTextContent(
      'Subaru Forester',
    );
    expect(screen.getByTestId('option-compare-view-row-price')).toBeInTheDocument();
    expect(screen.getByTestId('option-compare-view-row-mileage')).toBeInTheDocument();
    expect(
      screen.getByTestId('option-compare-view-row-custom.laptop_work_fit'),
    ).toBeInTheDocument();
  });

  it('visibleOptionIds genuinely narrows the columns', () => {
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        visibleOptionIds={['candidate-rav4', 'candidate-crv']}
        layout="expanded"
      />,
    );

    expect(screen.getByTestId('option-compare-view-header-candidate-rav4')).toBeInTheDocument();
    expect(screen.getByTestId('option-compare-view-header-candidate-crv')).toBeInTheDocument();
    expect(
      screen.queryByTestId('option-compare-view-header-candidate-forester'),
    ).not.toBeInTheDocument();
  });

  it('visibleAttributeIds genuinely narrows the rows', () => {
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        visibleAttributeIds={['price']}
        layout="expanded"
      />,
    );

    expect(screen.getByTestId('option-compare-view-row-price')).toBeInTheDocument();
    expect(screen.queryByTestId('option-compare-view-row-mileage')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('option-compare-view-row-custom.laptop_work_fit'),
    ).not.toBeInTheDocument();
  });

  it('pinnedAttributeIds ordering puts pinned rows first', () => {
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        pinnedAttributeIds={['mileage']}
        layout="expanded"
      />,
    );

    const table = screen.getByTestId('option-compare-view-table');
    const rowTestIds = within(table)
      .getAllByRole('row')
      .map((row) => row.getAttribute('data-testid'))
      .filter(
        (testId): testId is string => testId?.startsWith('option-compare-view-row-') ?? false,
      );

    expect(rowTestIds[0]).toBe('option-compare-view-row-mileage');
    expect(rowTestIds).toContain('option-compare-view-row-price');

    const pinnedRow = screen.getByTestId('option-compare-view-row-mileage');
    expect(pinnedRow).toHaveAttribute('data-pinned', 'true');
    const unpinnedRow = screen.getByTestId('option-compare-view-row-price');
    expect(unpinnedRow).toHaveAttribute('data-pinned', 'false');
  });

  it('renders a custom.* attribute using its human label, marks it as custom, and never leaks the raw id into rendered text', () => {
    const { container } = render(
      <OptionCompareView
        options={[OPTIONS[0]!]}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        layout="expanded"
      />,
    );

    const row = screen.getByTestId('option-compare-view-row-custom.laptop_work_fit');
    expect(row).toHaveTextContent('Laptop work fit');
    expect(
      screen.getByTestId('option-compare-view-custom-badge-custom.laptop_work_fit'),
    ).toHaveTextContent('Custom');

    // The raw id must never appear as user-visible text, even though it is used in data-testid
    // attributes (which are not rendered text).
    const visibleText = container.textContent ?? '';
    expect(visibleText).not.toContain('custom.laptop_work_fit');
  });

  it('renders a missing value as an explicit "Unknown", never blank or invented', () => {
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        layout="expanded"
      />,
    );

    // candidate-forester has no price attribute.
    expect(
      screen.getByTestId('option-compare-view-cell-price-candidate-forester'),
    ).toHaveTextContent(/unknown/i);
    // candidate-crv has no custom.laptop_work_fit attribute.
    expect(
      screen.getByTestId('option-compare-view-cell-custom.laptop_work_fit-candidate-crv'),
    ).toHaveTextContent(/unknown/i);
  });

  it('groups rows using pack presentation metadata when provided', () => {
    const presentation: PresentationDefinition = {
      optionLabel: 'car',
      optionLabelPlural: 'cars',
      attributeGroups: [{ id: 'cost', label: 'Cost', attributeIds: ['price'] }],
    };
    render(
      <OptionCompareView
        options={[OPTIONS[0]!]}
        attributeDefinitions={DEFINITIONS}
        presentation={presentation}
        selectedOptionId={null}
        layout="expanded"
      />,
    );
    expect(screen.getByTestId('option-compare-view-group-cost')).toHaveTextContent('Cost');
    expect(screen.getByTestId('option-compare-view-row-mileage')).toBeInTheDocument();
  });

  it('renders a head-to-head shape (exactly two columns) in narrow layout', () => {
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        layout="narrow"
      />,
    );

    const table = screen.getByTestId('option-compare-view-table');
    expect(table).toHaveAttribute('data-layout', 'narrow');
    expect(screen.getByTestId('option-compare-view-header-candidate-rav4')).toBeInTheDocument();
    expect(screen.getByTestId('option-compare-view-header-candidate-crv')).toBeInTheDocument();
    expect(
      screen.queryByTestId('option-compare-view-header-candidate-forester'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('option-compare-view-narrow-note')).toBeInTheDocument();
  });

  it('narrow layout head-to-head keeps the selected option and pairs it with the first other option', () => {
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId="candidate-forester"
        layout="narrow"
      />,
    );

    expect(screen.getByTestId('option-compare-view-header-candidate-forester')).toBeInTheDocument();
    expect(screen.getByTestId('option-compare-view-header-candidate-rav4')).toBeInTheDocument();
    expect(
      screen.queryByTestId('option-compare-view-header-candidate-crv'),
    ).not.toBeInTheDocument();
  });

  it('renders every visible option as a column in expanded layout', () => {
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        layout="expanded"
      />,
    );

    const table = screen.getByTestId('option-compare-view-table');
    expect(table).toHaveAttribute('data-layout', 'expanded');
    expect(screen.getByTestId('option-compare-view-header-candidate-rav4')).toBeInTheDocument();
    expect(screen.getByTestId('option-compare-view-header-candidate-crv')).toBeInTheDocument();
    expect(screen.getByTestId('option-compare-view-header-candidate-forester')).toBeInTheDocument();
    expect(screen.queryByTestId('option-compare-view-narrow-note')).not.toBeInTheDocument();
  });

  it('marks the header of the currently selected option', () => {
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId="candidate-rav4"
        layout="expanded"
      />,
    );
    expect(screen.getByTestId('option-compare-view-header-candidate-rav4')).toHaveTextContent(
      /selected/i,
    );
  });

  it('fires onFocusOption when an option header is clicked', async () => {
    const user = userEvent.setup();
    const onFocusOption = vi.fn();
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        layout="expanded"
        onFocusOption={onFocusOption}
      />,
    );

    await user.click(screen.getByTestId('option-compare-view-focus-candidate-crv'));
    expect(onFocusOption).toHaveBeenCalledExactlyOnceWith('candidate-crv');
  });

  it('is keyboard operable: pressing Enter on a focused option header fires onFocusOption', async () => {
    const user = userEvent.setup();
    const onFocusOption = vi.fn();
    render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        layout="expanded"
        onFocusOption={onFocusOption}
      />,
    );

    const focusButton = screen.getByTestId('option-compare-view-focus-candidate-forester');
    focusButton.focus();
    expect(focusButton).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onFocusOption).toHaveBeenCalledExactlyOnceWith('candidate-forester');
  });

  it('has no axe violations in the empty, narrow, and expanded states', async () => {
    const { container: empty } = render(
      <OptionCompareView
        options={[]}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        layout="expanded"
      />,
    );
    expect(await axe(empty)).toHaveNoViolations();

    const { container: narrow } = render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId="candidate-rav4"
        layout="narrow"
      />,
    );
    expect(await axe(narrow)).toHaveNoViolations();

    const { container: expanded } = render(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        pinnedAttributeIds={['price']}
        layout="expanded"
      />,
    );
    expect(await axe(expanded)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk (the table itself scrolls within its own container)', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <OptionCompareView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        layout="expanded"
      />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
