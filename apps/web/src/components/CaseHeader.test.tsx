import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { CaseHeader, type CaseHeaderProps } from './CaseHeader.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildProps(overrides: Partial<CaseHeaderProps> = {}): CaseHeaderProps {
  return {
    title: 'Choose Our Next Car',
    connectionState: 'live',
    onResetDemo: vi.fn(),
    onOpenDeveloperView: vi.fn(),
    ...overrides,
  };
}

describe('CaseHeader', () => {
  it('renders the case title as the page heading', () => {
    render(<CaseHeader {...buildProps({ title: 'Choose Our Next Car' })} />);
    expect(screen.getByRole('heading', { name: 'Choose Our Next Car' })).toBeInTheDocument();
  });

  // ADR 0004 decision item 1: the Decision Pack badge (id/version/compiled
  // hash) and the pack-selection explanation sentence leave the consumer
  // surface entirely -- "Do NOT put pack hashes, IDs, command IDs, or
  // developer metadata here." `CaseHeaderProps` no longer even accepts a
  // `pack` value, so there is nothing this component could render even if
  // asked to; these assertions prove the removal at the DOM level, per
  // ADR 0004's own instruction that a test asserting a removed developer
  // string be rewritten to assert the id is now absent, not deleted
  // wholesale.
  it('never renders a Decision Pack badge, id, version, or compiled hash', () => {
    render(<CaseHeader {...buildProps()} />);
    expect(screen.queryByTestId('case-header-pack-badge')).not.toBeInTheDocument();
    expect(screen.queryByText(/decision pack/i)).not.toBeInTheDocument();
  });

  it('never renders the pack-selection explanation sentence', () => {
    render(<CaseHeader {...buildProps()} />);
    expect(screen.queryByTestId('case-header-pack-explanation')).not.toBeInTheDocument();
    expect(screen.queryByText(/selected this decision pack/i)).not.toBeInTheDocument();
  });

  // ADR 0004 decision item 1's explicit "keeps" list is title + live
  // connection status + reset, with no third case-status badge -- the old
  // `draft`/`decided` pill never carried the "compact status summary" §6
  // actually asks for, and that richer summary is now the merged
  // answer-first hero's job (`RecommendationHero.tsx`), not this header's.
  it('never renders a separate case-status badge', () => {
    render(<CaseHeader {...buildProps()} />);
    expect(screen.queryByTestId('case-header-run-status')).not.toBeInTheDocument();
  });

  it.each([
    ['live', 'Live'],
    ['reconnecting', 'Reconnecting'],
    ['polling', 'Polling'],
    ['offline', 'Offline'],
  ] as const)('renders connection state %s with label "%s"', (connectionState, expectedLabel) => {
    render(<CaseHeader {...buildProps({ connectionState })} />);
    expect(screen.getByTestId('case-header-connection-status')).toHaveTextContent(expectedLabel);
  });

  it('calls onResetDemo when the reset button is activated', () => {
    const onResetDemo = vi.fn();
    render(<CaseHeader {...buildProps({ onResetDemo })} />);

    const resetButton = screen.getByRole('button', { name: 'Reset demo' });
    resetButton.click();

    expect(onResetDemo).toHaveBeenCalledTimes(1);
  });

  // Task A5: an explicit, discoverable developer-mode entry point -- before
  // this task there was no way to reach the Runtime Inspector without a run
  // already having happened this session.
  it('renders a discoverable developer-view control with an accessible name and correct role', () => {
    render(<CaseHeader {...buildProps()} />);
    const control = screen.getByRole('button', { name: 'Developer view' });
    expect(control).toBeInTheDocument();
    expect(control).toHaveAccessibleName('Developer view');
  });

  it('calls onOpenDeveloperView when the developer-view control is activated', () => {
    const onOpenDeveloperView = vi.fn();
    render(<CaseHeader {...buildProps({ onOpenDeveloperView })} />);

    const control = screen.getByTestId('case-header-developer-view');
    control.click();

    expect(onOpenDeveloperView).toHaveBeenCalledTimes(1);
  });

  it('disables and relabels the reset button while a reset is pending', () => {
    render(<CaseHeader {...buildProps({ resetPending: true })} />);

    const resetButton = screen.getByTestId('case-header-reset-demo');
    expect(resetButton).toBeDisabled();
    expect(resetButton).toHaveAttribute('aria-busy', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = render(<CaseHeader {...buildProps()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(<CaseHeader {...buildProps()} />);
    expect(overflowRisks).toEqual([]);
  });
});
