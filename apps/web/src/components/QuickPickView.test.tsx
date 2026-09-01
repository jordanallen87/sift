import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { AttributeDefinition, EntityRecord } from '@sift/contracts';
import { QuickPickView } from './QuickPickView.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const DEFINITIONS: AttributeDefinition[] = [
  {
    id: 'price',
    label: 'Price',
    valueType: 'money',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'source',
    comparison: 'lower_better',
    sensitive: false,
  },
  {
    id: 'mpg',
    label: 'MPG',
    valueType: 'number',
    required: false,
    appliesTo: ['car'],
    unit: 'MPG',
    evidenceExpectation: 'assertion',
    comparison: 'higher_better',
    sensitive: false,
  },
  {
    id: 'cargo',
    label: 'Cargo',
    valueType: 'number',
    required: false,
    appliesTo: ['car'],
    unit: 'cu ft',
    evidenceExpectation: 'source',
    comparison: 'higher_better',
    sensitive: false,
  },
  {
    id: 'ride-comfort',
    label: 'Ride comfort',
    valueType: 'enum',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'verification',
    comparison: 'none',
    sensitive: false,
  },
];

function buildEntity(overrides: Partial<EntityRecord> = {}): EntityRecord {
  return {
    id: 'candidate-crv',
    kind: 'car',
    label: '2025 Honda CR-V EX-L',
    attributes: {
      price: {
        definitionId: 'price',
        label: 'Price',
        value: { type: 'money', amount: 32_400, currency: 'USD' },
        origin: 'user',
        sourceIds: ['source-1'],
        status: 'verified',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
      mpg: {
        definitionId: 'mpg',
        label: 'MPG',
        value: { type: 'number', value: 32, unit: 'MPG' },
        origin: 'pack',
        sourceIds: [],
        status: 'asserted',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
      cargo: {
        definitionId: 'cargo',
        label: 'Cargo',
        value: { type: 'number', value: 39.3, unit: 'cu ft' },
        origin: 'pack',
        sourceIds: [],
        // 'cargo' expects 'source'-level evidence; 'asserted' falls short of
        // that bar on purpose, to exercise the "still needs stronger
        // evidence" watch-out branch.
        status: 'asserted',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
      // 'ride-comfort' has no record at all -- an unresolved human-only
      // concern (change set §9's own "Personal ride comfort still unknown").
    },
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildQueue(): EntityRecord[] {
  return [
    buildEntity({ id: 'candidate-rav4', label: '2025 Toyota RAV4 XLE' }),
    buildEntity(),
    buildEntity({ id: 'candidate-forester', label: '2025 Subaru Forester' }),
  ];
}

// `layout` defaults to `'narrow'` here -- the majority of these tests exist
// to pin the original, pre-this-task rendering contract, which is exactly
// narrow's contract (see QuickPickView.tsx's file-header "EXPANDED LAYOUT"
// note: narrow is unchanged, byte-for-byte, by this task). Tests that care
// about expanded behaviour pass `layout: 'expanded'` explicitly via
// `overrides`, matching the explicit-per-render convention
// `OptionListView.test.tsx`/`OptionCompareView.test.tsx` already use for the
// sibling views (no test file anywhere in this component family relies on
// an implicit default for `layout`).
function renderQuickPick(overrides: Partial<React.ComponentProps<typeof QuickPickView>> = {}) {
  const onPass = vi.fn();
  const onMaybe = vi.fn();
  const onShortlist = vi.fn();
  const onFocusChange = vi.fn();
  const utils = render(
    <QuickPickView
      options={buildQueue()}
      attributeDefinitions={DEFINITIONS}
      position={1}
      onPass={onPass}
      onMaybe={onMaybe}
      onShortlist={onShortlist}
      layout="narrow"
      onFocusChange={onFocusChange}
      {...overrides}
    />,
  );
  return { ...utils, onPass, onMaybe, onShortlist, onFocusChange };
}

describe('QuickPickView', () => {
  it('renders exactly one option at a time -- the one at the given queue position', () => {
    renderQuickPick({ position: 1 });

    expect(screen.getByTestId('quick-pick-card-candidate-crv')).toBeInTheDocument();
    expect(screen.getByTestId('quick-pick-option-label')).toHaveTextContent('2025 Honda CR-V EX-L');
    expect(screen.queryByTestId('quick-pick-card-candidate-rav4')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-pick-card-candidate-forester')).not.toBeInTheDocument();
  });

  it('renders the queue position as "N of total"', () => {
    renderQuickPick({ position: 1 });
    expect(screen.getByTestId('quick-pick-position')).toHaveTextContent('2 of 3');
  });

  it('shows the most decision-relevant attribute values on the dominant card', () => {
    renderQuickPick({ position: 1 });

    // Deterministic, comma-grouped, symbol-mapped formatting -- see
    // attribute-value-format.ts's header comment.
    expect(screen.getByTestId('quick-pick-highlight-price')).toHaveTextContent('$32,400');
    expect(screen.getByTestId('quick-pick-highlight-mpg')).toHaveTextContent('32 MPG');
    expect(screen.getByTestId('quick-pick-highlight-cargo')).toHaveTextContent('39.3 cu ft');
  });

  it('renders the single most decision-relevant attribute as a dominant stat, outside the compact spec grid the remaining highlighted attributes render in', () => {
    renderQuickPick({ position: 1 });

    // 'price' is first among the comparison-relevant definitions (see
    // DEFINITIONS above), so it becomes the dominant stat rendered directly
    // under the option's name rather than one more row in the grid --
    // requirement 1's fix for "price buried mid-list in the same grey as
    // the body style."
    const highlights = screen.getByTestId('quick-pick-highlights');
    const grid = screen.getByTestId('quick-pick-highlight-grid');
    const dominantPrice = screen.getByTestId('quick-pick-highlight-price');

    expect(highlights).toContainElement(dominantPrice);
    expect(grid).not.toContainElement(dominantPrice);
    // 'mpg' and 'cargo' are the remaining highlighted attributes -- both
    // belong to the compact grid, not the dominant slot.
    expect(grid).toContainElement(screen.getByTestId('quick-pick-highlight-mpg'));
    expect(grid).toContainElement(screen.getByTestId('quick-pick-highlight-cargo'));
  });

  it('promotes a money-typed highlighted attribute to the dominant slot even when the pack declares it after other comparison-relevant attributes', () => {
    // Mirrors the real defect found against the live car pack: it declares
    // 'model_year' (a bare number) before 'advertised_price' (money), which
    // put "Model year: 2022" in the hero slot and left price back in the
    // grid -- the exact "price buried" problem this task exists to fix,
    // just relocated by a naive "first comparison-relevant definition"
    // rule. `valueType: 'money'` is a generic, pack-agnostic promotion
    // signal (no id/label hardcoding), so it must win the dominant slot
    // regardless of where the pack declared it.
    const definitions: AttributeDefinition[] = [
      {
        id: 'model_year',
        label: 'Model year',
        valueType: 'number',
        required: false,
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'higher_better',
        sensitive: false,
      },
      {
        id: 'advertised_price',
        label: 'Advertised price',
        valueType: 'money',
        required: false,
        appliesTo: ['car'],
        evidenceExpectation: 'source',
        comparison: 'lower_better',
        sensitive: false,
      },
    ];
    const option: EntityRecord = {
      id: 'candidate-money-order',
      kind: 'car',
      label: 'Money Order Candidate',
      attributes: {
        model_year: {
          definitionId: 'model_year',
          label: 'Model year',
          value: { type: 'number', value: 2022 },
          origin: 'pack',
          sourceIds: [],
          status: 'verified',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
        advertised_price: {
          definitionId: 'advertised_price',
          label: 'Advertised price',
          value: { type: 'money', amount: 27_995, currency: 'USD' },
          origin: 'user',
          sourceIds: ['source-1'],
          status: 'verified',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      },
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };

    renderQuickPick({ options: [option], attributeDefinitions: definitions, position: 0 });

    const highlights = screen.getByTestId('quick-pick-highlights');
    const grid = screen.getByTestId('quick-pick-highlight-grid');
    const dominantPrice = screen.getByTestId('quick-pick-highlight-advertised_price');

    expect(highlights).toContainElement(dominantPrice);
    expect(grid).not.toContainElement(dominantPrice);
    expect(dominantPrice).toHaveTextContent('$27,995');
    expect(grid).toContainElement(screen.getByTestId('quick-pick-highlight-model_year'));
  });

  it('caps a long attribute value visually and discloses the full text via the native title attribute, rather than fabricating a shortened value or letting it wrap unbounded', () => {
    // The real offender this guards against (see QuickPickView.tsx's file
    // header) is a joined `string_list` like the car pack's "Standard
    // features" -- reproduced generically here rather than importing the
    // real pack, so this stays a pure component test.
    const longFeatureList = [
      'Adaptive cruise control',
      'Lane keep assist',
      'Heated front seats',
      'Wireless Apple CarPlay',
      'Blind spot monitoring',
      'Panoramic sunroof',
    ].join(', ');
    const definitions: AttributeDefinition[] = [
      {
        id: 'custom.notes',
        label: 'Notes',
        valueType: 'string_list',
        required: false,
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'none',
        sensitive: false,
      },
    ];
    const option: EntityRecord = {
      id: 'candidate-loaded',
      kind: 'car',
      label: 'Loaded Trim',
      attributes: {
        'custom.notes': {
          definitionId: 'custom.notes',
          label: 'Notes',
          value: { type: 'string_list', values: longFeatureList.split(', ') },
          origin: 'user',
          sourceIds: [],
          status: 'verified',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      },
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };

    renderQuickPick({ options: [option], attributeDefinitions: definitions, position: 0 });

    // `custom.notes` has no comparison direction, so it falls back into the
    // Strengths list (well-evidenced) rather than the highlight row -- its
    // full, untruncated value is never dropped, just capped visually.
    const strengthItem = screen.getByTestId('quick-pick-strengths-custom.notes');
    const valueNode = strengthItem.querySelector('[title]');
    expect(valueNode).not.toBeNull();
    expect(valueNode).toHaveAttribute('title', longFeatureList);
    expect(valueNode).toHaveClass('line-clamp-2');
    // Nothing was shortened or invented -- the full text is still present,
    // only visually capped by CSS.
    expect(strengthItem).toHaveTextContent(longFeatureList);
  });

  it('gives Strengths, Concerns, and Still unresolved three distinct status tones -- never the same colour', () => {
    // A single option with one attribute in each of the three states, so
    // all three sections render populated (and therefore tinted) at once.
    const definitions: AttributeDefinition[] = [
      {
        id: 'good',
        label: 'Good',
        valueType: 'number',
        required: false,
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'higher_better',
        sensitive: false,
      },
      {
        id: 'doubted',
        label: 'Doubted',
        valueType: 'number',
        required: false,
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'higher_better',
        sensitive: false,
      },
      {
        id: 'missing',
        label: 'Missing',
        valueType: 'number',
        required: false,
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'higher_better',
        sensitive: false,
      },
    ];
    const option: EntityRecord = {
      id: 'candidate-tri-state',
      kind: 'car',
      label: 'Tri-State Candidate',
      attributes: {
        good: {
          definitionId: 'good',
          label: 'Good',
          value: { type: 'number', value: 1 },
          origin: 'user',
          sourceIds: [],
          status: 'verified',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
        doubted: {
          definitionId: 'doubted',
          label: 'Doubted',
          value: { type: 'number', value: 2 },
          origin: 'user',
          sourceIds: [],
          status: 'conflicted',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
        // 'missing' has no record at all.
      },
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };

    renderQuickPick({ options: [option], attributeDefinitions: definitions, position: 0 });

    const strengths = screen.getByTestId('quick-pick-strengths');
    const concerns = screen.getByTestId('quick-pick-concerns');
    const stillUnresolved = screen.getByTestId('quick-pick-still-unresolved');

    // Existing semantic tokens only (docs/design-system.md), one per
    // section, and no two sections share a background tint.
    expect(strengths).toHaveStyle({ backgroundColor: 'var(--color-status-satisfied-bg)' });
    expect(concerns).toHaveStyle({ backgroundColor: 'var(--color-status-blocked-bg)' });
    expect(stillUnresolved).toHaveStyle({ backgroundColor: 'var(--color-status-open-bg)' });
    const tints = new Set([
      strengths.style.backgroundColor,
      concerns.style.backgroundColor,
      stillUnresolved.style.backgroundColor,
    ]);
    expect(tints.size).toBe(3);
  });

  it('renders the full Strengths / Concerns / Still-unresolved empty-state trio with distinct, honest copy when an option has nothing to report in any of the three', () => {
    const definitions: AttributeDefinition[] = [
      {
        id: 'car.trim',
        label: 'Trim',
        valueType: 'string',
        required: false,
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        // 'none' comparison + 'string' valueType -> a plain identity
        // attribute (isIdentityAttribute), so it never reaches any of the
        // three insight lists regardless of status -- the only way to
        // exercise every empty state at once in a single render.
        comparison: 'none',
        sensitive: false,
      },
    ];
    const option: EntityRecord = {
      id: 'candidate-blank',
      kind: 'car',
      label: 'Blank Candidate',
      attributes: {},
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };

    renderQuickPick({ options: [option], attributeDefinitions: definitions, position: 0 });

    expect(screen.getByTestId('quick-pick-strengths-empty')).toHaveTextContent(
      'Nothing strongly supported yet.',
    );
    expect(screen.getByTestId('quick-pick-concerns-empty')).toHaveTextContent('Nothing flagged.');
    expect(screen.getByTestId('quick-pick-still-unresolved-empty')).toHaveTextContent(
      'Nothing outstanding.',
    );
  });

  it('lists well-evidenced values under "Strengths"', () => {
    renderQuickPick({ position: 1 });

    const strengths = screen.getByTestId('quick-pick-strengths');
    // Deterministic, comma-grouped, symbol-mapped formatting -- see
    // attribute-value-format.ts's header comment. Label and value are
    // separate DOM nodes now (see QuickPickView.tsx's file-header "REDESIGN"
    // note), but the combined text content still reads "Label: value".
    expect(strengths).toHaveTextContent('Price: $32,400');
    expect(strengths).toHaveTextContent('MPG: 32 MPG');
    // 'cargo' is under-evidenced for its own definition's expectation, so it
    // must not be claimed as a strength.
    expect(strengths).not.toHaveTextContent('Cargo:');
  });

  it('lists genuinely unknown values under "Still unresolved"', () => {
    renderQuickPick({ position: 1 });

    const stillUnresolved = screen.getByTestId('quick-pick-still-unresolved');
    expect(stillUnresolved).toHaveTextContent(/ride comfort is still unknown/i);
  });

  it('does not repeat an under-evidenced value as a concern when it is already shown, unqualified, in the highlight row above -- the self-contradiction "Model year: 2022" / "Model year still needs stronger evidence" defect', () => {
    renderQuickPick({ position: 1 });

    // 'cargo' is under-evidenced for its own definition's expectation (see
    // the "Strengths" test above), AND it is one of the highlighted
    // attribute values shown confidently as "Cargo: 39.3 cu ft" on the same
    // card (the "shows the most decision-relevant attribute values" test).
    // Repeating "Cargo still needs stronger evidence" right below that would
    // contradict what the card just asserted without qualification -- it
    // must not appear in either judgment list.
    expect(screen.getByTestId('quick-pick-highlight-cargo')).toHaveTextContent('39.3 cu ft');
    expect(screen.getByTestId('quick-pick-concerns')).not.toHaveTextContent(/cargo/i);
    expect(screen.getByTestId('quick-pick-still-unresolved')).not.toHaveTextContent(/cargo/i);
  });

  it('never flags a plain identity/label attribute (a string field with no comparison direction) in "Strengths", "Concerns", or "Still unresolved", even when it fails its own declared evidence bar', () => {
    const definitions: AttributeDefinition[] = [
      {
        id: 'car.trim',
        label: 'Trim',
        valueType: 'string',
        required: false,
        appliesTo: ['car'],
        evidenceExpectation: 'source',
        comparison: 'none',
        sensitive: false,
      },
      {
        id: 'car.mileage',
        label: 'Mileage',
        valueType: 'number',
        required: true,
        appliesTo: ['car'],
        unit: 'mi',
        evidenceExpectation: 'source',
        comparison: 'lower_better',
        sensitive: false,
      },
    ];
    const option: EntityRecord = {
      id: 'candidate-rav4',
      kind: 'car',
      label: '2022 Toyota RAV4 XLE',
      attributes: {
        'car.trim': {
          definitionId: 'car.trim',
          label: 'Trim',
          value: { type: 'string', value: 'XLE Hybrid AWD' },
          origin: 'agent_proposed',
          sourceIds: ['source-listing'],
          // 'asserted' does not meet this definition's 'source' bar -- under
          // the old, undifferentiated derivation this produced the exact
          // observed defect: "Trim still needs stronger evidence" noise for
          // a listing's own identity field.
          status: 'asserted',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
        'car.mileage': {
          definitionId: 'car.mileage',
          label: 'Mileage',
          value: { type: 'number', value: 28_400, unit: 'mi' },
          origin: 'agent_proposed',
          sourceIds: ['source-listing'],
          status: 'asserted',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      },
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };

    renderQuickPick({ options: [option], attributeDefinitions: definitions, position: 0 });

    const card = screen.getByTestId('quick-pick-card-candidate-rav4');
    expect(card).not.toHaveTextContent(/trim/i);
  });

  it('still lists a genuinely decision-relevant attribute under "Concerns" when it fails its evidence bar and is not already shown in the highlight row', () => {
    // Five comparison-relevant (decision-relevant) definitions -- one more
    // than MAX_HIGHLIGHT_ATTRIBUTES/MAX_INSIGHT_ITEMS's shared cap of 4 --
    // so the fifth, 'reliability', cannot fit in the highlight row and must
    // be judged purely on its own "Watch out" merit.
    const definitions: AttributeDefinition[] = (
      ['price', 'mpg', 'cargo', 'safety', 'reliability'] as const
    ).map((id) => ({
      id,
      label: id[0]!.toUpperCase() + id.slice(1),
      valueType: 'number',
      required: false,
      appliesTo: ['car'],
      evidenceExpectation: 'source',
      comparison: 'higher_better',
      sensitive: false,
    }));
    const record = (definitionId: string, label: string, status: 'asserted' | 'conflicted') => ({
      definitionId,
      label,
      value: { type: 'number' as const, value: 7 },
      origin: 'agent_proposed' as const,
      sourceIds: [],
      status,
      updatedAt: '2026-08-27T00:00:00.000Z',
    });
    const option: EntityRecord = {
      id: 'candidate-x',
      kind: 'car',
      label: 'Candidate X',
      attributes: {
        price: record('price', 'Price', 'asserted'),
        mpg: record('mpg', 'Mpg', 'asserted'),
        cargo: record('cargo', 'Cargo', 'asserted'),
        safety: record('safety', 'Safety', 'asserted'),
        // Never highlighted (5th comparison-relevant definition, beyond the
        // top-4 cap) and conflicted -- a real problem that must still show.
        reliability: record('reliability', 'Reliability', 'conflicted'),
      },
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };

    renderQuickPick({ options: [option], attributeDefinitions: definitions, position: 0 });

    // Confirms the setup: only 4 of the 5 decision-relevant definitions fit
    // the highlight row, so 'reliability' is judged solely on its own merit,
    // not suppressed as an already-shown duplicate.
    expect(screen.queryByTestId('quick-pick-highlight-reliability')).not.toBeInTheDocument();
    expect(screen.getByTestId('quick-pick-concerns')).toHaveTextContent(
      /reliability has conflicting information/i,
    );
  });

  it('renders an option with a missing attribute honestly as unknown, never blank or fabricated', () => {
    const missingCargo = buildEntity({
      id: 'candidate-sparse',
      label: 'Sparse Option',
      attributes: {
        price: {
          definitionId: 'price',
          label: 'Price',
          origin: 'user',
          sourceIds: [],
          status: 'unknown',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      },
    });

    renderQuickPick({ options: [missingCargo], position: 0 });

    expect(screen.getByTestId('quick-pick-highlight-price')).toHaveTextContent(/unknown/i);
    expect(screen.getByTestId('quick-pick-still-unresolved')).toHaveTextContent(
      /price is still unknown/i,
    );
    // Nothing to honestly claim as a strength -- the empty state renders
    // rather than a fabricated entry.
    expect(screen.getByTestId('quick-pick-strengths-empty')).toBeInTheDocument();
  });

  it('never renders a raw attribute or option id as visible text', () => {
    renderQuickPick({ position: 1 });
    expect(screen.queryByText('candidate-crv')).not.toBeInTheDocument();
    expect(screen.queryByText('ride-comfort')).not.toBeInTheDocument();
    expect(screen.queryByText(/^price$/)).not.toBeInTheDocument();
  });

  it('fires onPass with the current option id when Pass is clicked', async () => {
    const user = userEvent.setup();
    const { onPass, onMaybe, onShortlist } = renderQuickPick({ position: 1 });

    await user.click(screen.getByTestId('quick-pick-pass'));

    expect(onPass).toHaveBeenCalledTimes(1);
    expect(onPass).toHaveBeenCalledWith('candidate-crv');
    expect(onMaybe).not.toHaveBeenCalled();
    expect(onShortlist).not.toHaveBeenCalled();
  });

  it('fires onMaybe with the current option id when Maybe is clicked', async () => {
    const user = userEvent.setup();
    const { onMaybe } = renderQuickPick({ position: 1 });

    await user.click(screen.getByTestId('quick-pick-maybe'));

    expect(onMaybe).toHaveBeenCalledTimes(1);
    expect(onMaybe).toHaveBeenCalledWith('candidate-crv');
  });

  it('fires onShortlist with the current option id when Shortlist is clicked', async () => {
    const user = userEvent.setup();
    const { onShortlist } = renderQuickPick({ position: 1 });

    await user.click(screen.getByTestId('quick-pick-shortlist'));

    expect(onShortlist).toHaveBeenCalledTimes(1);
    expect(onShortlist).toHaveBeenCalledWith('candidate-crv');
  });

  it('reports the focused option on mount and does not fire again for a stable position', () => {
    const { onFocusChange } = renderQuickPick({ position: 1 });
    expect(onFocusChange).toHaveBeenCalledTimes(1);
    expect(onFocusChange).toHaveBeenCalledWith('candidate-crv');
  });

  it('reports a new focused option when the caller advances the queue position', () => {
    const onFocusChange = vi.fn();
    const { rerender } = render(
      <QuickPickView
        options={buildQueue()}
        attributeDefinitions={DEFINITIONS}
        position={0}
        onPass={vi.fn()}
        onMaybe={vi.fn()}
        onShortlist={vi.fn()}
        layout="narrow"
        onFocusChange={onFocusChange}
      />,
    );
    expect(onFocusChange).toHaveBeenLastCalledWith('candidate-rav4');

    rerender(
      <QuickPickView
        options={buildQueue()}
        attributeDefinitions={DEFINITIONS}
        position={1}
        onPass={vi.fn()}
        onMaybe={vi.fn()}
        onShortlist={vi.fn()}
        layout="narrow"
        onFocusChange={onFocusChange}
      />,
    );
    expect(onFocusChange).toHaveBeenLastCalledWith('candidate-crv');
  });

  it('supports reaching and activating all three actions by keyboard alone', async () => {
    const user = userEvent.setup();
    const { onPass, onMaybe, onShortlist } = renderQuickPick({ position: 1 });

    await user.tab();
    expect(screen.getByTestId('quick-pick-pass')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onPass).toHaveBeenCalledWith('candidate-crv');

    await user.tab();
    expect(screen.getByTestId('quick-pick-maybe')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onMaybe).toHaveBeenCalledWith('candidate-crv');

    await user.tab();
    expect(screen.getByTestId('quick-pick-shortlist')).toHaveFocus();
    await user.keyboard(' ');
    expect(onShortlist).toHaveBeenCalledWith('candidate-crv');
  });

  it('renders an explicit end-of-queue state once the position runs past the last option, without crashing', () => {
    const { onFocusChange } = renderQuickPick({ position: 3 });

    expect(screen.getByTestId('quick-pick-end-of-queue')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-pick-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-pick-position')).not.toBeInTheDocument();
    expect(onFocusChange).not.toHaveBeenCalled();
  });

  it('renders the end-of-queue state for an empty queue, without crashing', () => {
    renderQuickPick({ options: [], position: 0 });
    expect(screen.getByTestId('quick-pick-end-of-queue')).toBeInTheDocument();
  });

  it('has no axe violations in the populated and end-of-queue states', async () => {
    const { container: populated } = render(
      <QuickPickView
        options={buildQueue()}
        attributeDefinitions={DEFINITIONS}
        position={1}
        onPass={vi.fn()}
        onMaybe={vi.fn()}
        onShortlist={vi.fn()}
        layout="narrow"
        onFocusChange={vi.fn()}
      />,
    );
    expect(await axe(populated)).toHaveNoViolations();

    const { container: endOfQueue } = render(
      <QuickPickView
        options={buildQueue()}
        attributeDefinitions={DEFINITIONS}
        position={3}
        onPass={vi.fn()}
        onMaybe={vi.fn()}
        onShortlist={vi.fn()}
        layout="narrow"
        onFocusChange={vi.fn()}
      />,
    );
    expect(await axe(endOfQueue)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <QuickPickView
        options={buildQueue()}
        attributeDefinitions={DEFINITIONS}
        position={1}
        onPass={vi.fn()}
        onMaybe={vi.fn()}
        onShortlist={vi.fn()}
        layout="narrow"
        onFocusChange={vi.fn()}
      />,
    );
    expect(overflowRisks).toEqual([]);
  });

  // EXPANDED LAYOUT (this task) -- see QuickPickView.tsx's file-header
  // "EXPANDED LAYOUT" note for the three concrete changes under test below:
  // (1) two-column body, (2) queue context, (3) larger identity/price type
  // scale and raised highlight/insight caps. Every test above this point
  // exercises `layout="narrow"` and is unmodified in what it asserts --
  // these are additive coverage for the new `layout="expanded"` branch, not
  // a replacement for the narrow suite.
  describe('expanded layout', () => {
    it('renders the two-column expanded body -- identity/highlights on one side, the three judgment blocks on the other -- keeping the dominant stat separate from the compact grid exactly like narrow does', () => {
      renderQuickPick({ position: 1, layout: 'expanded' });

      const body = screen.getByTestId('quick-pick-expanded-body');
      const highlights = screen.getByTestId('quick-pick-highlights');
      const grid = screen.getByTestId('quick-pick-highlight-grid');
      const dominantPrice = screen.getByTestId('quick-pick-highlight-price');
      const strengths = screen.getByTestId('quick-pick-strengths');
      const concerns = screen.getByTestId('quick-pick-concerns');
      const stillUnresolved = screen.getByTestId('quick-pick-still-unresolved');

      // Everything still lives inside the same two-column body.
      expect(body).toContainElement(highlights);
      expect(body).toContainElement(strengths);
      expect(body).toContainElement(concerns);
      expect(body).toContainElement(stillUnresolved);
      // The dominant-stat/grid split is preserved at expanded, exactly as
      // narrow's own tests require it (§ "renders the single most
      // decision-relevant attribute as a dominant stat...").
      expect(highlights).toContainElement(dominantPrice);
      expect(grid).not.toContainElement(dominantPrice);
      // Identity, price, and specs land in one column; the judgment blocks
      // are not inside that same column's fact grid.
      expect(highlights).not.toContainElement(strengths);
    });

    it('shows the same Strengths/Concerns/Still-unresolved content and card actions at expanded as at narrow -- only the arrangement changes', () => {
      renderQuickPick({ position: 1, layout: 'expanded' });

      const strengths = screen.getByTestId('quick-pick-strengths');
      expect(strengths).toHaveTextContent('Price: $32,400');
      expect(strengths).toHaveTextContent('MPG: 32 MPG');
      expect(screen.getByTestId('quick-pick-still-unresolved')).toHaveTextContent(
        /ride comfort is still unknown/i,
      );
      expect(screen.getByTestId('quick-pick-actions')).toBeInTheDocument();
      expect(screen.getByTestId('quick-pick-pass')).toBeInTheDocument();
      expect(screen.getByTestId('quick-pick-maybe')).toBeInTheDocument();
      expect(screen.getByTestId('quick-pick-shortlist')).toBeInTheDocument();
    });

    it('names the next option in the queue and how many remain after it -- context the narrow pane never renders', () => {
      renderQuickPick({ position: 0, layout: 'expanded' });

      const queueContext = screen.getByTestId('quick-pick-queue-context');
      // `buildQueue()` is [rav4, crv, forester]; at position 0 (rav4), the
      // next option is the CR-V, and two options total (CR-V, Forester)
      // remain after the current one.
      expect(queueContext).toHaveTextContent('Up next: 2025 Honda CR-V EX-L');
      expect(queueContext).toHaveTextContent('2 options left to review');
    });

    it('does not render queue context in narrow layout, at any queue position', () => {
      renderQuickPick({ position: 0, layout: 'narrow' });
      expect(screen.queryByTestId('quick-pick-queue-context')).not.toBeInTheDocument();
    });

    it('names the last option in the queue honestly when there is nothing left after it, rather than a fabricated "up next"', () => {
      renderQuickPick({ position: 2, layout: 'expanded' });

      const queueContext = screen.getByTestId('quick-pick-queue-context');
      expect(queueContext).toHaveTextContent('This is the last option in the queue.');
      expect(queueContext).not.toHaveTextContent('Up next');
    });

    it('pluralizes the remaining-option count correctly for exactly one remaining option', () => {
      renderQuickPick({
        options: buildQueue().slice(0, 2),
        position: 0,
        layout: 'expanded',
      });
      // Two-option queue at position 0: exactly one option (index 1)
      // remains after the current one.
      expect(screen.getByTestId('quick-pick-queue-context')).toHaveTextContent(
        '1 option left to review',
      );
    });

    it('gives the option identity and the dominant stat a larger, hero type scale at expanded than at narrow', () => {
      renderQuickPick({ position: 1, layout: 'expanded' });

      expect(screen.getByTestId('quick-pick-option-label')).toHaveClass(
        'text-[length:var(--font-size-xl)]',
      );
      // `quick-pick-highlight-price`'s testid is on the fact's outer
      // label+value wrapper (see `buildHighlightFacts`'s two-node shape in
      // the file header) -- the type-scale class lives on its value `span`,
      // the second of the wrapper's two direct child `span`s.
      const dominantValueNode = screen
        .getByTestId('quick-pick-highlight-price')
        .querySelector('span:last-child');
      expect(dominantValueNode).toHaveClass('text-[length:var(--font-size-2xl)]');
    });

    it('shows more highlighted attributes and more items per judgment list at expanded than narrow allows, for an option with enough decision-relevant attributes to hit both caps', () => {
      // Six comparison-relevant definitions -- narrow's cap is 4, expanded's
      // is 6 -- so all six should reach the highlight row only at expanded.
      const definitions: AttributeDefinition[] = (
        ['price', 'mpg', 'cargo', 'safety', 'reliability', 'warranty'] as const
      ).map((id) => ({
        id,
        label: id[0]!.toUpperCase() + id.slice(1),
        valueType: 'number',
        required: false,
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'higher_better',
        sensitive: false,
      }));
      const record = (definitionId: string, label: string) => ({
        definitionId,
        label,
        value: { type: 'number' as const, value: 7 },
        origin: 'agent_proposed' as const,
        sourceIds: [],
        status: 'verified' as const,
        updatedAt: '2026-08-27T00:00:00.000Z',
      });
      const option: EntityRecord = {
        id: 'candidate-six',
        kind: 'car',
        label: 'Six-Attribute Candidate',
        attributes: {
          price: record('price', 'Price'),
          mpg: record('mpg', 'Mpg'),
          cargo: record('cargo', 'Cargo'),
          safety: record('safety', 'Safety'),
          reliability: record('reliability', 'Reliability'),
          warranty: record('warranty', 'Warranty'),
        },
        createdAt: '2026-08-27T00:00:00.000Z',
        updatedAt: '2026-08-27T00:00:00.000Z',
      };

      const { unmount } = renderQuickPick({
        options: [option],
        attributeDefinitions: definitions,
        position: 0,
        layout: 'narrow',
      });
      expect(screen.queryByTestId('quick-pick-highlight-warranty')).not.toBeInTheDocument();
      unmount();

      renderQuickPick({
        options: [option],
        attributeDefinitions: definitions,
        position: 0,
        layout: 'expanded',
      });
      expect(screen.getByTestId('quick-pick-highlight-warranty')).toBeInTheDocument();
    });

    it('has no axe violations in the populated and end-of-queue states at expanded layout', async () => {
      const { container: populated } = render(
        <QuickPickView
          options={buildQueue()}
          attributeDefinitions={DEFINITIONS}
          position={1}
          onPass={vi.fn()}
          onMaybe={vi.fn()}
          onShortlist={vi.fn()}
          layout="expanded"
          onFocusChange={vi.fn()}
        />,
      );
      expect(await axe(populated)).toHaveNoViolations();

      const { container: endOfQueue } = render(
        <QuickPickView
          options={buildQueue()}
          attributeDefinitions={DEFINITIONS}
          position={3}
          onPass={vi.fn()}
          onMaybe={vi.fn()}
          onShortlist={vi.fn()}
          layout="expanded"
          onFocusChange={vi.fn()}
        />,
      );
      expect(await axe(endOfQueue)).toHaveNoViolations();
    });

    it('still supports reaching and activating all three actions by keyboard alone at expanded layout', async () => {
      const user = userEvent.setup();
      const { onPass, onMaybe, onShortlist } = renderQuickPick({
        position: 1,
        layout: 'expanded',
      });

      await user.tab();
      expect(screen.getByTestId('quick-pick-pass')).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(onPass).toHaveBeenCalledWith('candidate-crv');

      await user.tab();
      expect(screen.getByTestId('quick-pick-maybe')).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(onMaybe).toHaveBeenCalledWith('candidate-crv');

      await user.tab();
      expect(screen.getByTestId('quick-pick-shortlist')).toHaveFocus();
      await user.keyboard(' ');
      expect(onShortlist).toHaveBeenCalledWith('candidate-crv');
    });
  });
});
