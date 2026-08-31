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
  // Decision-relevant (not identity: `enum`, not `string`) and deliberately
  // left out of `PRESENTATION`'s only group, so it never lands in
  // `prominentDefinitions`/the fact row -- used to prove a genuinely
  // relevant, under-evidenced, not-already-shown attribute still surfaces
  // as a concern rather than being swept away by the same fix that
  // suppresses `mileage` below.
  {
    id: 'reliability',
    label: 'Reliability',
    valueType: 'enum',
    required: false,
    appliesTo: ['car'],
    allowedValues: ['Above Average', 'Average', 'Below Average'],
    evidenceExpectation: 'source',
    comparison: 'higher_better',
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

// A well-evidenced strength (price), an under-evidenced value that is ALSO
// already shown, unqualified, in the fact row -- mileage, which must NOT
// repeat as a concern (the self-contradiction fix) -- a conflicted concern
// (the custom field), a genuinely under-evidenced concern that is NOT
// already shown anywhere else (reliability), and an excluded-but-real value
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
    reliability: {
      definitionId: 'reliability',
      label: 'Reliability',
      value: { type: 'enum', value: 'Above Average' },
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
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
        onFocusOption={vi.fn()}
      />,
    );

    // price: status "asserted" meets its own "assertion" evidence bar ->
    // strength (deterministic, comma-grouped, symbol-mapped formatting --
    // see attribute-value-format.ts's header comment).
    expect(
      screen.getByTestId('option-list-view-strengths-item-candidate-rav4-price'),
    ).toHaveTextContent('Price: $28,500');

    // mileage: status "asserted" does not meet its declared "source" bar,
    // but it is already shown, unqualified, in the fact row above
    // (`option-list-view-fact-candidate-rav4-mileage`) -- repeating it as a
    // concern would contradict the card in the same glance, so it must not
    // appear as a concern (or anywhere else) at all.
    expect(
      screen.queryByTestId('option-list-view-concerns-item-candidate-rav4-mileage'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('option-list-view-strengths-item-candidate-rav4-mileage'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('option-list-view-unresolved-item-candidate-rav4-mileage'),
    ).not.toBeInTheDocument();

    // reliability: same under-evidenced "asserted" vs. "source" gap as
    // mileage, but it is NOT shown anywhere else on the card (left out of
    // `PRESENTATION`'s only group) -- a real, not-yet-surfaced problem, so
    // it must still appear as a concern.
    expect(
      screen.getByTestId('option-list-view-concerns-item-candidate-rav4-reliability'),
    ).toHaveTextContent(/needs stronger evidence/i);

    // the custom field is "conflicted" -> concern, not a strength.
    expect(
      screen.getByTestId('option-list-view-concerns-item-candidate-rav4-custom.laptop_work_fit'),
    ).toHaveTextContent(/conflicting information/i);
    expect(
      screen.queryByTestId('option-list-view-strengths-item-candidate-rav4-custom.laptop_work_fit'),
    ).not.toBeInTheDocument();

    // warranty: a plain identity/label string field with no comparison
    // direction -- never appears in any insight list, regardless of status.
    expect(
      screen.queryByTestId('option-list-view-concerns-item-candidate-rav4-warranty'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('option-list-view-strengths-item-candidate-rav4-warranty'),
    ).not.toBeInTheDocument();
  });

  it('renders no fabricated strengths for an option with no well-evidenced values, and lists what is genuinely unresolved', () => {
    render(
      <OptionListView
        options={[CRV]}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
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
        layout="narrow"
        onFocusOption={vi.fn()}
      />,
    );
    expect(overflowRisks).toEqual([]);
  });

  // §7 "Expanded mode vs narrow mode": expanded must show "more attributes
  // visible simultaneously" and change information architecture, "not
  // merely CSS widths" -- these two tests prove both of this view's two
  // concrete IA changes, not just that a different className string was
  // produced.
  it('narrow stacks cards in a single column; expanded renders them in the shared option-grid layout', () => {
    const { rerender } = render(
      <OptionListView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        layout="narrow"
        onFocusOption={vi.fn()}
      />,
    );
    const narrowCards = screen.getByTestId('option-list-view-cards');
    expect(narrowCards).toHaveAttribute('data-layout', 'narrow');
    expect(narrowCards.className).not.toContain('option-grid');

    rerender(
      <OptionListView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        presentation={PRESENTATION}
        selectedOptionId={null}
        layout="expanded"
        onFocusOption={vi.fn()}
      />,
    );
    const expandedCards = screen.getByTestId('option-list-view-cards');
    expect(expandedCards).toHaveAttribute('data-layout', 'expanded');
    expect(expandedCards.className).toContain('option-grid');
  });

  it('expanded widens the prominent-field budget to include more of the pack’s own presentation groups; narrow reads only the first group', () => {
    const multiGroupPresentation: PresentationDefinition = {
      optionLabel: 'car',
      optionLabelPlural: 'cars',
      attributeGroups: [
        {
          id: 'headline',
          label: 'Headline',
          attributeIds: ['price', 'mileage', 'custom.laptop_work_fit'],
        },
        { id: 'secondary', label: 'Secondary', attributeIds: ['warranty', 'reliability'] },
      ],
    };

    const { rerender } = render(
      <OptionListView
        options={[RAV4]}
        attributeDefinitions={DEFINITIONS}
        presentation={multiGroupPresentation}
        selectedOptionId={null}
        layout="narrow"
        onFocusOption={vi.fn()}
      />,
    );
    // Narrow reproduces the original contract exactly: only the first group.
    expect(
      screen.queryByTestId('option-list-view-fact-candidate-rav4-warranty'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('option-list-view-fact-candidate-rav4-reliability'),
    ).not.toBeInTheDocument();

    rerender(
      <OptionListView
        options={[RAV4]}
        attributeDefinitions={DEFINITIONS}
        presentation={multiGroupPresentation}
        selectedOptionId={null}
        layout="expanded"
        onFocusOption={vi.fn()}
      />,
    );
    // Expanded has room to also honor the pack's second presentation group --
    // still nothing invented, only more of what the pack itself declared.
    expect(screen.getByTestId('option-list-view-fact-candidate-rav4-warranty')).toBeInTheDocument();
    expect(
      screen.getByTestId('option-list-view-fact-candidate-rav4-reliability'),
    ).toBeInTheDocument();
  });
});
