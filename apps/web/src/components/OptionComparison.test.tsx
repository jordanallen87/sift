import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { AttributeDefinition, EntityRecord, PresentationDefinition } from '@sift/contracts';
import { OptionComparison } from './OptionComparison.js';
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
    },
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('OptionComparison', () => {
  it('renders the empty state when there are no options yet', () => {
    render(
      <OptionComparison
        options={[]}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
      />,
    );
    expect(screen.getByTestId('option-comparison-empty')).toBeInTheDocument();
  });

  it('renders a column per option and a row per applicable attribute', () => {
    const options = [
      buildEntity(),
      buildEntity({
        id: 'candidate-crv',
        label: 'Honda CR-V',
        attributes: {
          mileage: {
            definitionId: 'mileage',
            label: 'Mileage',
            value: { type: 'number', value: 12000, unit: 'mi' },
            origin: 'user',
            sourceIds: [],
            status: 'asserted',
            updatedAt: '2026-08-27T00:00:00.000Z',
          },
        },
      }),
    ];
    render(
      <OptionComparison
        options={options}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
      />,
    );

    expect(screen.getByTestId('option-comparison-header-candidate-rav4')).toHaveTextContent(
      'Toyota RAV4',
    );
    expect(screen.getByTestId('option-comparison-header-candidate-crv')).toHaveTextContent(
      'Honda CR-V',
    );
    expect(screen.getByTestId('option-comparison-cell-price-candidate-rav4')).toHaveTextContent(
      '28500 USD',
    );
    expect(screen.getByTestId('option-comparison-cell-mileage-candidate-crv')).toHaveTextContent(
      '12000 mi',
    );
  });

  it('renders "Unknown" for an option missing a given attribute rather than a blank cell', () => {
    render(
      <OptionComparison
        options={[buildEntity()]}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
      />,
    );
    expect(screen.getByTestId('option-comparison-cell-mileage-candidate-rav4')).toHaveTextContent(
      /unknown/i,
    );
  });

  it('groups rows using pack presentation metadata when provided', () => {
    const presentation: PresentationDefinition = {
      optionLabel: 'car',
      optionLabelPlural: 'cars',
      attributeGroups: [{ id: 'cost', label: 'Cost', attributeIds: ['price'] }],
    };
    render(
      <OptionComparison
        options={[buildEntity()]}
        attributeDefinitions={DEFINITIONS}
        presentation={presentation}
        selectedOptionId={null}
      />,
    );
    expect(screen.getByTestId('option-comparison-group-cost')).toHaveTextContent('Cost');
    // mileage isn't in any declared group -- still rendered under a fallback group.
    expect(screen.getByTestId('option-comparison-row-mileage')).toBeInTheDocument();
  });

  it('skips a declared presentation group whose attributeIds match no applicable attribute', () => {
    const presentation: PresentationDefinition = {
      optionLabel: 'car',
      optionLabelPlural: 'cars',
      attributeGroups: [
        { id: 'cost', label: 'Cost', attributeIds: ['price'] },
        { id: 'ghost', label: 'Ghost Group', attributeIds: ['not-a-real-attribute'] },
      ],
    };
    render(
      <OptionComparison
        options={[buildEntity()]}
        attributeDefinitions={DEFINITIONS}
        presentation={presentation}
        selectedOptionId={null}
      />,
    );
    expect(screen.getByTestId('option-comparison-group-cost')).toBeInTheDocument();
    expect(screen.queryByTestId('option-comparison-group-ghost')).not.toBeInTheDocument();
  });

  it('does not render an "Other" fallback group when every applicable attribute is already covered by a declared group', () => {
    const presentation: PresentationDefinition = {
      optionLabel: 'car',
      optionLabelPlural: 'cars',
      attributeGroups: [{ id: 'cost', label: 'Cost', attributeIds: ['price', 'mileage'] }],
    };
    render(
      <OptionComparison
        options={[buildEntity()]}
        attributeDefinitions={DEFINITIONS}
        presentation={presentation}
        selectedOptionId={null}
      />,
    );
    expect(screen.getByTestId('option-comparison-group-cost')).toBeInTheDocument();
    expect(
      screen.queryByTestId('option-comparison-group-other-attributes'),
    ).not.toBeInTheDocument();
  });

  it('marks the header of the currently selected option', () => {
    render(
      <OptionComparison
        options={[buildEntity()]}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId="candidate-rav4"
      />,
    );
    expect(screen.getByTestId('option-comparison-header-candidate-rav4')).toHaveTextContent(
      /selected/i,
    );
  });

  it('has no axe violations in the empty and populated states', async () => {
    const { container: empty } = render(
      <OptionComparison
        options={[]}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
      />,
    );
    expect(await axe(empty)).toHaveNoViolations();

    const { container: populated } = render(
      <OptionComparison
        options={[buildEntity()]}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
      />,
    );
    expect(await axe(populated)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk (the table itself scrolls within its own container)', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <OptionComparison
        options={[buildEntity()]}
        attributeDefinitions={DEFINITIONS}
        presentation={null}
        selectedOptionId={null}
      />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
