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

    expect(screen.getByTestId('quick-pick-highlight-price')).toHaveTextContent('32400 USD');
    expect(screen.getByTestId('quick-pick-highlight-mpg')).toHaveTextContent('32 MPG');
    expect(screen.getByTestId('quick-pick-highlight-cargo')).toHaveTextContent('39.3 cu ft');
  });

  it('lists well-evidenced values under "Why it fits"', () => {
    renderQuickPick({ position: 1 });

    const whyItFits = screen.getByTestId('quick-pick-why-it-fits');
    expect(whyItFits).toHaveTextContent('Price: 32400 USD');
    expect(whyItFits).toHaveTextContent('MPG: 32 MPG');
    // 'cargo' is under-evidenced for its own definition's expectation, so it
    // must not be claimed as a strength.
    expect(whyItFits).not.toHaveTextContent('Cargo:');
  });

  it('lists under-evidenced, unknown, and conflicted values under "Watch out"', () => {
    renderQuickPick({ position: 1 });

    const watchOut = screen.getByTestId('quick-pick-watch-out');
    expect(watchOut).toHaveTextContent(/cargo still needs stronger evidence/i);
    expect(watchOut).toHaveTextContent(/ride comfort is still unknown/i);
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
    expect(screen.getByTestId('quick-pick-watch-out')).toHaveTextContent(/price is still unknown/i);
    // Nothing to honestly claim as a strength -- the empty state renders
    // rather than a fabricated entry.
    expect(screen.getByTestId('quick-pick-why-it-fits-empty')).toBeInTheDocument();
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
        onFocusChange={vi.fn()}
      />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
