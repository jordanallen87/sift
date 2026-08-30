import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { AttributeDefinition, EntityRecord, PresentationDefinition } from '@sift/contracts';
import { OptionListView } from './OptionListView.js';
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
    evidenceExpectation: 'source',
    comparison: 'lower_better',
    sensitive: false,
  },
  {
    id: 'warranty',
    label: 'Warranty',
    valueType: 'string',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'verification',
    comparison: 'none',
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

// First presentation group deliberately omits `warranty`, so it exercises the
// "not every attribute" side of the prominence contract.
const PRESENTATION: PresentationDefinition = {
  optionLabel: 'car',
  optionLabelPlural: 'cars',
  attributeGroups: [
    {
      id: 'headline',
      label: 'Headline',
      attributeIds: ['price', 'mileage', 'custom.laptop_work_fit'],
    },
  ],
};

function buildEntity(overrides: Partial<EntityRecord> = {}): EntityRecord {
  return {
    id: 'candidate-rav4',
    kind: 'car',
    label: 'Toyota RAV4',
    attributes: {},
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

// A well-evidenced strength (price), an under-evidenced concern (mileage --
// declares `evidenceExpectation: 'source'` but only reaches `asserted`), a
// conflicted concern (the custom field), and an excluded-but-real value
// (warranty) that must never reach the rendered card because it falls
// outside the first presentation group.
const RAV4 = buildEntity({
  id: 'candidate-rav4',
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
    warranty: {
      definitionId: 'warranty',
      label: 'Warranty',
      value: { type: 'string', value: '5 years' },
      origin: 'user',
      sourceIds: [],
      status: 'verified',
      updatedAt: '2026-08-27T00:00:00.000Z',
    },
    'custom.laptop_work_fit': {
      definitionId: 'custom.laptop_work_fit',
      label: 'Laptop work fit',
      value: { type: 'string', value: 'Mixed reports' },
      origin: 'user',
      sourceIds: [],
      status: 'conflicted',
      updatedAt: '2026-08-27T00:00:00.000Z',
    },
  },
});

// No attribute records at all -- every prominent field is honestly unknown,
// so strengths and concerns must both render empty, never fabricated.
const CRV = buildEntity({
  id: 'candidate-crv',
  label: 'Honda CR-V',
  attributes: {},
});

const FORESTER = buildEntity({
  id: 'candidate-forester',
  label: 'Subaru Forester',
  attributes: {
    price: {
      definitionId: 'price',
      label: 'Price',
      value: { type: 'money', amount: 26900, currency: 'USD' },
      origin: 'user',
      sourceIds: [],
      status: 'asserted',
      updatedAt: '2026-08-27T00:00:00.000Z',
    },
  },
});

const OPTIONS: EntityRecord[] = [RAV4, CRV, FORESTER];

describe('OptionListView', () => {
  it('renders the empty state when no options are visible', () => {
    render(
      <OptionListView
        options={[]}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
        onFocusOption={vi.fn()}
      />,
    );
    expect(screen.getByTestId('option-list-view-empty')).toBeInTheDocument();
  });

  it('renders one card per option', () => {
    render(
      <OptionListView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        onFocusOption={vi.fn()}
      />,
    );

    expect(screen.getByTestId('option-list-view-card-candidate-rav4')).toHaveTextContent(
      'Toyota RAV4',
    );
    expect(screen.getByTestId('option-list-view-card-candidate-crv')).toHaveTextContent(
      'Honda CR-V',
    );
    expect(screen.getByTestId('option-list-view-card-candidate-forester')).toHaveTextContent(
      'Subaru Forester',
    );
  });

  it('visibleOptionIds narrows which cards render', () => {
    render(
      <OptionListView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        visibleOptionIds={['candidate-rav4', 'candidate-crv']}
        onFocusOption={vi.fn()}
      />,
    );

    expect(screen.getByTestId('option-list-view-card-candidate-rav4')).toBeInTheDocument();
    expect(screen.getByTestId('option-list-view-card-candidate-crv')).toBeInTheDocument();
    expect(
      screen.queryByTestId('option-list-view-card-candidate-forester'),
    ).not.toBeInTheDocument();
  });

  it('prominence: only fields from the pack’s first presentation group render, not every applicable attribute', () => {
    render(
      <OptionListView
        options={[RAV4]}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        onFocusOption={vi.fn()}
      />,
    );

    // In the grouped presentation.
    expect(screen.getByTestId('option-list-view-fact-candidate-rav4-price')).toBeInTheDocument();
    expect(screen.getByTestId('option-list-view-fact-candidate-rav4-mileage')).toBeInTheDocument();
    // `warranty` has a real, well-evidenced value but was not placed in the first
    // presentation group, so it must not render anywhere on the card.
    expect(
      screen.queryByTestId('option-list-view-fact-candidate-rav4-warranty'),
    ).not.toBeInTheDocument();
    const card = screen.getByTestId('option-list-view-card-candidate-rav4');
    expect(card).not.toHaveTextContent('Warranty');
  });

  it('an explicit prominentAttributeIds prop takes precedence over presentation grouping', () => {
    render(
      <OptionListView
        options={[RAV4]}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        prominentAttributeIds={['warranty']}
        onFocusOption={vi.fn()}
      />,
    );

    expect(screen.getByTestId('option-list-view-fact-candidate-rav4-warranty')).toBeInTheDocument();
    expect(
      screen.queryByTestId('option-list-view-fact-candidate-rav4-price'),
    ).not.toBeInTheDocument();
  });

  it('renders a missing value as an explicit "Unknown", never blank or invented', () => {
    render(
      <OptionListView
        options={[CRV]}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        onFocusOption={vi.fn()}
      />,
    );

    expect(screen.getByTestId('option-list-view-fact-candidate-crv-price')).toHaveTextContent(
      /unknown/i,
    );
    expect(screen.getByTestId('option-list-view-fact-candidate-crv-mileage')).toHaveTextContent(
      /unknown/i,
    );
  });

  it('renders a custom.* field by its human label, marked custom, with the raw id absent from rendered text', () => {
    const { container } = render(
      <OptionListView
        options={[RAV4]}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        onFocusOption={vi.fn()}
      />,
    );

    const fact = screen.getByTestId('option-list-view-fact-candidate-rav4-custom.laptop_work_fit');
    expect(fact).toHaveTextContent('Laptop work fit');
    expect(
      screen.getByTestId(
        'option-list-view-fact-custom-badge-candidate-rav4-custom.laptop_work_fit',
      ),
    ).toHaveTextContent('Custom');

    const visibleText = container.textContent ?? '';
    expect(visibleText).not.toContain('custom.laptop_work_fit');
  });

  it('derives strengths and concerns honestly from AttributeRecord.status against each definition’s evidenceExpectation', () => {
    render(
      <OptionListView
        options={[RAV4]}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        onFocusOption={vi.fn()}
      />,
    );

    // price: status "asserted" meets its own "assertion" evidence bar -> strength.
    expect(
      screen.getByTestId('option-list-view-strengths-item-candidate-rav4-price'),
    ).toHaveTextContent('Price: 28500 USD');

    // mileage: status "asserted" does not meet its declared "source" bar -> concern.
    expect(
      screen.getByTestId('option-list-view-concerns-item-candidate-rav4-mileage'),
    ).toHaveTextContent(/needs stronger evidence/i);

    // the custom field is "conflicted" -> concern, not a strength.
    expect(
      screen.getByTestId('option-list-view-concerns-item-candidate-rav4-custom.laptop_work_fit'),
    ).toHaveTextContent(/conflicting information/i);
    expect(
      screen.queryByTestId('option-list-view-strengths-item-candidate-rav4-custom.laptop_work_fit'),
    ).not.toBeInTheDocument();
  });

  it('renders no fabricated strengths for an option with no well-evidenced values, and lists what is genuinely unresolved', () => {
    render(
      <OptionListView
        options={[CRV]}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        onFocusOption={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('option-list-view-strengths-empty-candidate-crv'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('option-list-view-concerns-empty-candidate-crv')).toBeInTheDocument();
    expect(
      screen.getByTestId('option-list-view-unresolved-item-candidate-crv-price'),
    ).toHaveTextContent(/still unknown/i);
    expect(
      screen.getByTestId('option-list-view-unresolved-item-candidate-crv-mileage'),
    ).toHaveTextContent(/still unknown/i);
  });

  it('fires onFocusOption when a card is clicked', async () => {
    const user = userEvent.setup();
    const onFocusOption = vi.fn();
    render(
      <OptionListView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        onFocusOption={onFocusOption}
      />,
    );

    await user.click(screen.getByTestId('option-list-view-focus-candidate-crv'));
    expect(onFocusOption).toHaveBeenCalledExactlyOnceWith('candidate-crv');
  });

  it('is keyboard operable: pressing Enter on a focused card button fires onFocusOption', async () => {
    const user = userEvent.setup();
    const onFocusOption = vi.fn();
    render(
      <OptionListView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        onFocusOption={onFocusOption}
      />,
    );

    const focusButton = screen.getByTestId('option-list-view-focus-candidate-forester');
    focusButton.focus();
    expect(focusButton).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onFocusOption).toHaveBeenCalledExactlyOnceWith('candidate-forester');
  });

  it('visually distinguishes the selected option', () => {
    render(
      <OptionListView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId="candidate-rav4"
        onFocusOption={vi.fn()}
      />,
    );

    const selectedCard = screen.getByTestId('option-list-view-card-candidate-rav4');
    expect(selectedCard).toHaveAttribute('data-selected', 'true');
    expect(selectedCard).toHaveTextContent(/selected/i);

    const otherCard = screen.getByTestId('option-list-view-card-candidate-crv');
    expect(otherCard).toHaveAttribute('data-selected', 'false');
  });

  it('has no axe violations in the empty and populated states', async () => {
    const { container: empty } = render(
      <OptionListView
        options={[]}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        onFocusOption={vi.fn()}
      />,
    );
    expect(await axe(empty)).toHaveNoViolations();

    const { container: populated } = render(
      <OptionListView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId="candidate-rav4"
        onFocusOption={vi.fn()}
      />,
    );
    expect(await axe(populated)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <OptionListView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        onFocusOption={vi.fn()}
      />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
