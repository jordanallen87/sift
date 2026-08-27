import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { CaseHeader, type CaseHeaderProps } from './CaseHeader.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildProps(overrides: Partial<CaseHeaderProps> = {}): CaseHeaderProps {
  return {
    title: 'Choose Our Next Car',
    pack: {
      id: 'car-purchase',
      version: '1.0.0',
      compiledHash: 'a'.repeat(64),
      selectedBy: 'router',
      reasons: ['Matched keywords: car, vehicle, dealer'],
    },
    status: 'investigating',
    connectionState: 'live',
    onResetDemo: vi.fn(),
    ...overrides,
  };
}

describe('CaseHeader', () => {
  it('renders the case title as the page heading', () => {
    render(<CaseHeader {...buildProps({ title: 'Choose Our Next Car' })} />);
    expect(screen.getByRole('heading', { name: 'Choose Our Next Car' })).toBeInTheDocument();
  });

  it('renders the Decision Pack badge with id, version, and a short hash', () => {
    render(<CaseHeader {...buildProps()} />);
    const badge = screen.getByTestId('case-header-pack-badge');
    expect(badge).toHaveTextContent('Decision Pack');
    expect(badge).toHaveTextContent('car-purchase@1.0.0');
    expect(badge).toHaveTextContent('aaaaaaaa');
  });

  it('explains a router-selected pack differently from a user-selected pack', () => {
    const { rerender } = render(
      <CaseHeader {...buildProps({ pack: buildProps().pack, status: 'draft' })} />,
    );
    expect(screen.getByTestId('case-header-pack-explanation')).toHaveTextContent(/pax selected/i);

    rerender(
      <CaseHeader
        {...buildProps({
          pack: { ...buildProps().pack, selectedBy: 'user', reasons: [] },
        })}
      />,
    );
    expect(screen.getByTestId('case-header-pack-explanation')).toHaveTextContent(/you selected/i);
  });

  it.each([
    ['draft', 'Draft'],
    ['investigating', 'Investigating'],
    ['waiting', 'Waiting for confirmation'],
    ['ready', 'Ready for decision'],
    ['decided', 'Decided'],
    ['failed', 'Recoverable error'],
  ] as const)('maps case status %s to the UI label "%s"', (status, expectedLabel) => {
    render(<CaseHeader {...buildProps({ status })} />);
    expect(screen.getByTestId('case-header-run-status')).toHaveTextContent(expectedLabel);
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
