import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { AttributeDefinition, EntityRecord } from '@sift/contracts';
import { OptionBoardView } from './OptionBoardView.js';
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
    id: 'option-1',
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
    },
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

// Deliberately named `option-1` / `option-2` / `option-3` -- the task brief's own example of a
// raw internal id that must never leak into rendered text.
const OPTIONS: EntityRecord[] = [
  buildEntity(),
  buildEntity({
    id: 'option-2',
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
    },
  }),
  buildEntity({
    id: 'option-3',
    label: 'Subaru Forester',
    attributes: {
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

function noop() {
  // intentionally empty default for props this suite does not exercise
}

describe('OptionBoardView', () => {
  it('renders the four default columns when none are supplied', () => {
    render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );

    expect(screen.getByTestId('board-column-considering')).toHaveTextContent('Comparing');
    expect(screen.getByTestId('board-column-top_choices')).toHaveTextContent('Favorites');
    expect(screen.getByTestId('board-column-need_to_verify')).toHaveTextContent('Need to check');
    expect(screen.getByTestId('board-column-out')).toHaveTextContent('Ruled out');
  });

  it('honors custom columns', () => {
    render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        columns={[
          { id: 'new_arrivals', label: 'New arrivals' },
          { id: 'finalists', label: 'Finalists' },
        ]}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );

    expect(screen.getByTestId('board-column-new_arrivals')).toHaveTextContent('New arrivals');
    expect(screen.getByTestId('board-column-finalists')).toHaveTextContent('Finalists');
    expect(screen.queryByTestId('board-column-considering')).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-column-out')).not.toBeInTheDocument();
  });

  it('places each option in its assigned column; unassigned options land in the first column', () => {
    render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{ 'option-1': 'top_choices', 'option-2': 'out' }}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );

    expect(
      within(screen.getByTestId('board-column-list-top_choices')).getByTestId(
        'board-card-option-1',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('board-column-list-out')).getByTestId('board-card-option-2'),
    ).toBeInTheDocument();
    // option-3 has no entry in optionColumnIds -- falls back to the first column (Comparing).
    expect(
      within(screen.getByTestId('board-column-list-considering')).getByTestId(
        'board-card-option-3',
      ),
    ).toBeInTheDocument();
  });

  it('moving an option via the keyboard-accessible control fires onMoveOption with correct args', async () => {
    const user = userEvent.setup();
    const onMoveOption = vi.fn();
    render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={onMoveOption}
        onFocusOption={noop}
      />,
    );

    const select = screen.getByTestId('board-move-option-1');
    await user.selectOptions(select, 'top_choices');

    expect(onMoveOption).toHaveBeenCalledExactlyOnceWith('option-1', 'top_choices');
  });

  it('does not move the option itself -- placement is driven entirely by props', async () => {
    const user = userEvent.setup();
    const onMoveOption = vi.fn();
    const { rerender } = render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={onMoveOption}
        onFocusOption={noop}
      />,
    );

    const select = screen.getByTestId('board-move-option-1');
    await user.selectOptions(select, 'top_choices');

    // The callback fired, but nothing about the rendered board moved on its own: option-1 is
    // still in Comparing because the component holds no internal placement state.
    expect(
      within(screen.getByTestId('board-column-list-considering')).getByTestId(
        'board-card-option-1',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('board-column-list-top_choices')).not.toBeInTheDocument();

    // Only re-rendering with new props -- as the caller would after actually persisting the
    // move -- changes what is on screen.
    rerender(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{ 'option-1': 'top_choices' }}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={onMoveOption}
        onFocusOption={noop}
      />,
    );

    expect(
      within(screen.getByTestId('board-column-list-top_choices')).getByTestId(
        'board-card-option-1',
      ),
    ).toBeInTheDocument();
    // option-1 no longer sits in Comparing -- only the still-unassigned option-2/option-3 do.
    expect(
      within(screen.getByTestId('board-column-list-considering')).queryByTestId(
        'board-card-option-1',
      ),
    ).not.toBeInTheDocument();
  });

  it('focusing an option fires onFocusOption', async () => {
    const user = userEvent.setup();
    const onFocusOption = vi.fn();
    render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={onFocusOption}
      />,
    );

    await user.click(screen.getByTestId('board-focus-option-2'));
    expect(onFocusOption).toHaveBeenCalledExactlyOnceWith('option-2');
  });

  it('renders a supplied reason and invents no reason text when none is supplied', () => {
    render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        reasons={{ 'option-1': 'Dealer offer conflicts with advertised price' }}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );

    expect(screen.getByTestId('board-reason-option-1')).toHaveTextContent(
      'Dealer offer conflicts with advertised price',
    );
    expect(screen.queryByTestId('board-reason-option-2')).not.toBeInTheDocument();
  });

  it('shows the option label and a couple of decision-relevant facts on each card', () => {
    render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );

    const card = screen.getByTestId('board-card-option-1');
    expect(card).toHaveTextContent('Toyota RAV4');
    const facts = screen.getByTestId('board-facts-option-1');
    // Deterministic, comma-grouped, symbol-mapped formatting -- see
    // attribute-value-format.ts's header comment.
    expect(facts).toHaveTextContent('Price: $28,500');
    expect(facts).toHaveTextContent('Mileage: 15,000 mi');
  });

  // Regression test for the "cards restate their own title" defect: a
  // `valueType: 'string'`/`comparison: 'none'` attribute like `make` is a
  // plain catalog/identity descriptor -- exactly the shape
  // `isIdentityAttribute` (../lib/evidence-expectation.ts) exists to flag,
  // and the same helper `QuickPickView.tsx`/`OptionListView.tsx` already use
  // -- and must never consume a card's scarce fact budget, even when it
  // sorts earlier in `attributeDefinitions` than a genuinely
  // decision-relevant attribute.
  it("excludes plain identity attributes already spelled out in the option's own label from its facts", () => {
    const identityDefinition: AttributeDefinition = {
      id: 'make',
      label: 'Make',
      valueType: 'string',
      required: true,
      appliesTo: ['car'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    };
    const optionWithIdentity: EntityRecord = {
      id: 'option-5',
      kind: 'car',
      label: 'Toyota RAV4',
      attributes: {
        make: {
          definitionId: 'make',
          label: 'Make',
          value: { type: 'string', value: 'Toyota' },
          origin: 'user',
          sourceIds: [],
          status: 'asserted',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
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
      },
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };

    render(
      <OptionBoardView
        options={[optionWithIdentity]}
        // `identityDefinition` is listed FIRST -- proves the skip actually
        // happens rather than merely never being reached because it lost a
        // race for one of narrow layout's two fact slots.
        attributeDefinitions={[identityDefinition, ...DEFINITIONS]}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );

    const facts = screen.getByTestId('board-facts-option-5');
    expect(facts).not.toHaveTextContent('Make');
    expect(facts).not.toHaveTextContent('Toyota');
    // Both narrow-layout slots go to genuinely decision-relevant facts instead.
    expect(facts).toHaveTextContent('Price: $28,500');
    expect(facts).toHaveTextContent('Mileage: 15,000 mi');
  });

  it('never renders raw internal ids as user-visible text', () => {
    const { container } = render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{ 'option-3': 'need_to_verify' }}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );

    const visibleText = container.textContent ?? '';
    expect(visibleText).not.toContain('option-1');
    expect(visibleText).not.toContain('option-2');
    expect(visibleText).not.toContain('option-3');
    expect(visibleText).not.toContain('custom.laptop_work_fit');
    // These ids differ in casing/spacing from their rendered labels ("Favorites", "Need to
    // check"), so this is a genuine check and not an accidental match against the label itself.
    expect(visibleText).not.toContain('top_choices');
    expect(visibleText).not.toContain('need_to_verify');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{ 'option-1': 'top_choices', 'option-2': 'out' }}
        reasons={{ 'option-2': 'Dealer offer conflicts with advertised price' }}
        selectedOptionId="option-1"
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk (the board scrolls within its own container)', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );
    expect(overflowRisks).toEqual([]);
  });

  // §7 "Expanded mode vs narrow mode": expanded must show "more status
  // columns visible simultaneously... rather than requiring horizontal
  // scrolling" and change information architecture, "not merely CSS
  // widths" -- this proves the concrete structural swap (fixed-width flex
  // row -> a real single-row CSS grid sized to the actual column count),
  // not just a different className string.
  it('narrow renders fixed-width columns in a flex row; expanded renders a single-row grid sized to the real column count', () => {
    const { rerender } = render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );
    const narrowColumns = screen.getByTestId('board-columns');
    expect(narrowColumns).toHaveAttribute('data-layout', 'narrow');
    expect(narrowColumns.className).toContain('flex');
    expect(narrowColumns.className).not.toContain('grid');
    expect(screen.getByTestId('board-column-considering').className).toContain('w-[220px]');

    rerender(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="expanded"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );
    const expandedColumns = screen.getByTestId('board-columns');
    expect(expandedColumns).toHaveAttribute('data-layout', 'expanded');
    expect(expandedColumns.className).toContain('grid');
    // 4 columns -- the DEFAULT_BOARD_COLUMNS count -- each floored at 240px
    // but free to grow (`1fr`) to fill the wider expanded pane, rather than
    // staying pinned at the narrow layout's fixed 220px.
    expect(expandedColumns).toHaveStyle({ gridTemplateColumns: 'repeat(4, minmax(240px, 1fr))' });
    expect(screen.getByTestId('board-column-considering').className).not.toContain('w-[220px]');
  });

  it('narrow caps card facts at two; expanded raises the per-card fact budget', () => {
    const threeFactOption: EntityRecord = {
      id: 'option-4',
      kind: 'car',
      label: 'Mazda CX-5',
      attributes: {
        price: {
          definitionId: 'price',
          label: 'Price',
          value: { type: 'money', amount: 29500, currency: 'USD' },
          origin: 'user',
          sourceIds: [],
          status: 'asserted',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
        mileage: {
          definitionId: 'mileage',
          label: 'Mileage',
          value: { type: 'number', value: 18000, unit: 'mi' },
          origin: 'user',
          sourceIds: [],
          status: 'asserted',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
        'custom.laptop_work_fit': {
          definitionId: 'custom.laptop_work_fit',
          label: 'Laptop work fit',
          value: { type: 'string', value: 'Good' },
          origin: 'user',
          sourceIds: [],
          status: 'asserted',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      },
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };

    const { rerender } = render(
      <OptionBoardView
        options={[threeFactOption]}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="narrow"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );
    const narrowFacts = screen.getByTestId('board-facts-option-4');
    expect(narrowFacts).toHaveTextContent('Price: $29,500');
    expect(narrowFacts).toHaveTextContent('Mileage: 18,000 mi');
    expect(narrowFacts).not.toHaveTextContent('Laptop work fit');

    rerender(
      <OptionBoardView
        options={[threeFactOption]}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="expanded"
        onMoveOption={noop}
        onFocusOption={noop}
      />,
    );
    const expandedFacts = screen.getByTestId('board-facts-option-4');
    expect(expandedFacts).toHaveTextContent('Price: $29,500');
    expect(expandedFacts).toHaveTextContent('Mileage: 18,000 mi');
    expect(expandedFacts).toHaveTextContent('Laptop work fit: Good');
  });

  // Change-set §49: "Board changes must not rely solely on drag-and-drop."
  // This is the mandatory keyboard-operable alternative -- proven working,
  // unchanged, in expanded layout too, not only the narrow layout the other
  // move-control tests above already cover.
  it('the keyboard-accessible move control keeps working identically in expanded layout', async () => {
    const user = userEvent.setup();
    const onMoveOption = vi.fn();
    render(
      <OptionBoardView
        options={OPTIONS}
        attributeDefinitions={DEFINITIONS}
        optionColumnIds={{}}
        selectedOptionId={null}
        layout="expanded"
        onMoveOption={onMoveOption}
        onFocusOption={noop}
      />,
    );

    const select = screen.getByTestId('board-move-option-1');
    await user.selectOptions(select, 'top_choices');

    expect(onMoveOption).toHaveBeenCalledExactlyOnceWith('option-1', 'top_choices');
  });
});
