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

  it('truncates the pack badge with a visible ellipsis instead of silently overflowing at 390px width', () => {
    // Regression test: at a 390px viewport, a long pack id/version/hash
    // combination (e.g. "Decision Pack: home-energy-guardian@1.0.0
    // #8d414e7a") is wider than its flex container. Confirmed live via
    // getBoundingClientRect() -- badge width 414.9px vs. container 326px --
    // the badge silently overflowed past the viewport edge with no visual
    // indication anything was cut off, because Tailwind's `truncate` does
    // nothing on a flex item whose default `min-width: auto` prevents it
    // from shrinking below its content's natural width.
    //
    // jsdom does not run a real layout engine (see
    // ../test/narrow-viewport.tsx's documented caveat, and the identical
    // precedent in EvidenceCard.test.tsx / OptionEditor.test.tsx), so this
    // is a structural/class-presence assertion rather than a pixel
    // measurement: it proves the badge no longer relies on invisible
    // overflow by asserting (a) the badge itself can shrink below its
    // content's natural width instead of forcing it (`min-w-0`, plus a
    // `max-w-full` ceiling so it is bounded by its flex container), and (b)
    // the actual truncating element carries Tailwind's `truncate` utility
    // (`overflow-hidden text-ellipsis whitespace-nowrap`) so an overflow
    // shows a visible "…" rather than being invisibly clipped.
    render(
      <CaseHeader
        {...buildProps({
          pack: {
            id: 'home-energy-guardian',
            version: '1.0.0',
            compiledHash: '8d414e7a'.repeat(8),
            selectedBy: 'router',
            reasons: [],
          },
        })}
      />,
    );

    const badge = screen.getByTestId('case-header-pack-badge');
    expect(badge).toHaveClass('min-w-0');
    expect(badge).toHaveClass('max-w-full');

    const truncatedContent = badge.querySelector('.truncate');
    expect(truncatedContent).not.toBeNull();
    expect(truncatedContent).toHaveClass('min-w-0');
    // The full text is still present in the DOM (this is CSS-driven visual
    // truncation, not a shortened string) -- a reader/assistive technology
    // still gets it via the element's normal text content (selectable,
    // copyable, and read by a screen reader) even though it renders
    // ellipsized. Note this is distinct from the badge's own `title`
    // attribute (`CaseHeader.tsx`), which is set to `pack.compiledHash`
    // alone -- a native tooltip for the hash, not a mechanism for
    // recovering this full "Decision Pack: id@version" string.
    expect(truncatedContent).toHaveTextContent('Decision Pack: home-energy-guardian@1.0.0');
    expect(truncatedContent).toHaveTextContent('8d414e7a');
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
