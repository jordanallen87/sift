import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { Claim, EvidenceLink, Source } from '@pax/contracts';
import { EvidenceCard, type EvidenceItemData } from './EvidenceCard.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildEvidenceLink(overrides: Partial<EvidenceLink> = {}): EvidenceLink {
  return {
    id: 'evidence-1',
    obligationId: 'obligation-1',
    claimId: 'claim-1',
    sourceId: 'source-1',
    level: 'E2',
    verdict: 'pass',
    disposition: 'included',
    summary: 'Out-the-door price confirmed at $28,450.',
    stale: false,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    obligationId: 'obligation-1',
    statement: 'The dealer confirmed an out-the-door price of $28,450.',
    stance: 'supports',
    confidence: 0.9,
    sourceIds: ['source-1'],
    stale: false,
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 'source-1',
    url: 'https://dealer.example.com/quote/123',
    title: 'Dealer written quote',
    publisher: 'Example Motors',
    retrievedAt: '2026-08-27T00:00:00.000Z',
    origin: 'user_submitted',
    verification: 'unverified',
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildItem(overrides: Partial<EvidenceItemData> = {}): EvidenceItemData {
  return {
    evidenceLink: buildEvidenceLink(),
    claim: buildClaim(),
    source: buildSource(),
    ...overrides,
  };
}

describe('EvidenceCard', () => {
  it('renders the claim statement, source citation, and a passing verdict', () => {
    render(<EvidenceCard item={buildItem()} />);

    expect(screen.getByTestId('evidence-card-claim')).toHaveTextContent(
      'The dealer confirmed an out-the-door price of $28,450.',
    );
    const source = screen.getByTestId('evidence-card-source');
    expect(source).toHaveTextContent('Dealer written quote');
    expect(source).toHaveAttribute('href', 'https://dealer.example.com/quote/123');
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('falls back to the evidence summary when no claim is joined', () => {
    render(<EvidenceCard item={buildItem({ claim: undefined })} />);
    expect(screen.getByTestId('evidence-card-claim')).toHaveTextContent(
      'Out-the-door price confirmed at $28,450.',
    );
  });

  it('renders a source citation without a publisher line when publisher is absent', () => {
    render(<EvidenceCard item={buildItem({ source: buildSource({ publisher: undefined }) })} />);

    const source = screen.getByTestId('evidence-card-source');
    expect(source).toHaveTextContent('Dealer written quote');
    expect(source).not.toHaveTextContent('Example Motors');
  });

  it('shows "No source is linked" when no source is joined, never a broken link', () => {
    render(<EvidenceCard item={buildItem({ source: undefined })} />);
    expect(screen.getByTestId('evidence-card-no-source')).toHaveTextContent(/no source is linked/i);
    expect(screen.queryByTestId('evidence-card-source')).not.toBeInTheDocument();
  });

  it.each([
    ['pass', 'Verified'],
    ['fail', 'Did not verify'],
    ['error', 'Could not be checked'],
    ['degraded', 'Partially verified'],
    ['skipped', 'Not checked'],
  ] as const)('renders verdict %s as "%s"', (verdict, label) => {
    render(<EvidenceCard item={buildItem({ evidenceLink: buildEvidenceLink({ verdict }) })} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    ['included', 'Included in the case'],
    ['excluded', 'Excluded from the case'],
    ['questioned', 'Questioned'],
  ] as const)('renders disposition %s as "%s"', (disposition, label) => {
    render(<EvidenceCard item={buildItem({ evidenceLink: buildEvidenceLink({ disposition }) })} />);
    expect(screen.getByTestId('evidence-card-disposition')).toHaveTextContent(label);
  });

  it('renders a distinct, textual "Stale" indicator, not only a color change', () => {
    render(<EvidenceCard item={buildItem({ evidenceLink: buildEvidenceLink({ stale: true }) })} />);

    const stale = screen.getByTestId('evidence-card-stale');
    expect(stale).toHaveTextContent('Stale');
    expect(screen.getByText(/aged past its validity window/i)).toBeInTheDocument();
  });

  it('does not render a stale indicator for fresh evidence', () => {
    render(
      <EvidenceCard item={buildItem({ evidenceLink: buildEvidenceLink({ stale: false }) })} />,
    );
    expect(screen.queryByTestId('evidence-card-stale')).not.toBeInTheDocument();
  });

  it('renders a conflict indicator naming how many other items conflict', () => {
    render(
      <EvidenceCard item={buildItem({ conflictingEvidenceIds: ['evidence-2', 'evidence-3'] })} />,
    );

    const conflict = screen.getByTestId('evidence-card-conflict');
    expect(conflict).toHaveTextContent('Conflicts with 2 other items');
  });

  it('does not render a conflict indicator when there is no conflict', () => {
    render(<EvidenceCard item={buildItem({ conflictingEvidenceIds: [] })} />);
    expect(screen.queryByTestId('evidence-card-conflict')).not.toBeInTheDocument();
  });

  it('renders claim stance and confidence when a claim is present', () => {
    render(
      <EvidenceCard
        item={buildItem({ claim: buildClaim({ stance: 'opposes', confidence: 0.42 }) })}
      />,
    );
    expect(screen.getByText('Opposes')).toBeInTheDocument();
    expect(screen.getByText('Confidence 42%')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<EvidenceCard item={buildItem()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the stale + conflict state', async () => {
    const { container } = render(
      <EvidenceCard
        item={buildItem({
          evidenceLink: buildEvidenceLink({ stale: true, verdict: 'fail' }),
          conflictingEvidenceIds: ['evidence-2'],
        })}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(<EvidenceCard item={buildItem()} />);
    expect(overflowRisks).toEqual([]);
  });

  describe('disposition controls (webmcp.md pax_set_evidence_disposition, visible-control equivalent -- one segmented control, not three buttons)', () => {
    it('renders no disposition control when onSetDisposition is not provided (backward compatible)', () => {
      render(<EvidenceCard item={buildItem()} />);
      expect(screen.queryByTestId('evidence-card-disposition-control')).not.toBeInTheDocument();
    });

    it('renders the segmented control with the current disposition visually distinguished from the alternatives', () => {
      render(
        <EvidenceCard
          item={buildItem({ evidenceLink: buildEvidenceLink({ disposition: 'included' }) })}
          onSetDisposition={vi.fn()}
        />,
      );

      expect(screen.getByTestId('evidence-card-disposition-control')).toBeInTheDocument();
      expect(screen.getByTestId('evidence-card-disposition-option-included')).toHaveAttribute(
        'data-state',
        'on',
      );
      expect(screen.getByTestId('evidence-card-disposition-option-excluded')).toHaveAttribute(
        'data-state',
        'off',
      );
      expect(screen.getByTestId('evidence-card-disposition-option-questioned')).toHaveAttribute(
        'data-state',
        'off',
      );
    });

    it('does not prefill or auto-display a reason -- the reason input is absent until a different disposition is chosen', () => {
      render(<EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} />);
      expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Reviewed by user')).not.toBeInTheDocument();
    });

    it('selecting a different segment reveals an empty, required reason input and does not call onSetDisposition yet', async () => {
      const onSetDisposition = vi.fn();
      const user = userEvent.setup();
      render(<EvidenceCard item={buildItem()} onSetDisposition={onSetDisposition} />);

      await user.click(screen.getByTestId('evidence-card-disposition-option-excluded'));

      const reasonInput = screen.getByTestId('evidence-card-reason-evidence-1');
      expect(reasonInput).toBeInTheDocument();
      expect(reasonInput).toHaveValue('');
      expect(onSetDisposition).not.toHaveBeenCalled();
    });

    it('re-selecting the already-current disposition is a no-op: no reason input, no callback', async () => {
      const onSetDisposition = vi.fn();
      const user = userEvent.setup();
      render(<EvidenceCard item={buildItem()} onSetDisposition={onSetDisposition} />);

      await user.click(screen.getByTestId('evidence-card-disposition-option-included'));

      expect(screen.queryByTestId('evidence-card-reason-evidence-1')).not.toBeInTheDocument();
      expect(onSetDisposition).not.toHaveBeenCalled();
      expect(screen.getByTestId('evidence-card-disposition-option-included')).toHaveAttribute(
        'data-state',
        'on',
      );
    });

    it('disables the confirm action while the reason is empty or whitespace-only', async () => {
      const user = userEvent.setup();
      render(<EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} />);

      await user.click(screen.getByTestId('evidence-card-disposition-option-excluded'));
      const confirm = screen.getByTestId('evidence-card-reason-confirm-evidence-1');
      const reasonInput = screen.getByTestId('evidence-card-reason-evidence-1');

      expect(confirm).toBeDisabled();

      await user.type(reasonInput, '   ');
      expect(confirm).toBeDisabled();

      await user.type(reasonInput, 'Duplicate of another source');
      expect(confirm).not.toBeDisabled();
    });

    it('submitting with a non-empty reason calls onSetDisposition with the new disposition and that reason, then hides the reason panel', async () => {
      const onSetDisposition = vi.fn();
      const user = userEvent.setup();
      render(<EvidenceCard item={buildItem()} onSetDisposition={onSetDisposition} />);

      await user.click(screen.getByTestId('evidence-card-disposition-option-excluded'));
      await user.type(
        screen.getByTestId('evidence-card-reason-evidence-1'),
        'Duplicate of another source',
      );
      await user.click(screen.getByTestId('evidence-card-reason-confirm-evidence-1'));

      expect(onSetDisposition).toHaveBeenCalledExactlyOnceWith(
        'excluded',
        'Duplicate of another source',
      );
      expect(screen.queryByTestId('evidence-card-reason-evidence-1')).not.toBeInTheDocument();
    });

    it('cancelling a pending disposition change hides the reason input without calling onSetDisposition', async () => {
      const onSetDisposition = vi.fn();
      const user = userEvent.setup();
      render(<EvidenceCard item={buildItem()} onSetDisposition={onSetDisposition} />);

      await user.click(screen.getByTestId('evidence-card-disposition-option-questioned'));
      await user.type(screen.getByTestId('evidence-card-reason-evidence-1'), 'Not sure yet');
      await user.click(screen.getByTestId('evidence-card-reason-cancel-evidence-1'));

      expect(screen.queryByTestId('evidence-card-reason-evidence-1')).not.toBeInTheDocument();
      expect(onSetDisposition).not.toHaveBeenCalled();
    });

    it('disables the segmented control while a disposition change is pending', () => {
      render(<EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} dispositionPending />);
      expect(screen.getByTestId('evidence-card-disposition-option-included')).toBeDisabled();
      expect(screen.getByTestId('evidence-card-disposition-option-excluded')).toBeDisabled();
      expect(screen.getByTestId('evidence-card-disposition-option-questioned')).toBeDisabled();
    });

    it('disables the reason input and its confirm/cancel actions while a disposition change is pending', async () => {
      const onSetDisposition = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(
        <EvidenceCard item={buildItem()} onSetDisposition={onSetDisposition} />,
      );

      await user.click(screen.getByTestId('evidence-card-disposition-option-excluded'));
      rerender(
        <EvidenceCard item={buildItem()} onSetDisposition={onSetDisposition} dispositionPending />,
      );

      expect(screen.getByTestId('evidence-card-reason-evidence-1')).toBeDisabled();
      expect(screen.getByTestId('evidence-card-reason-confirm-evidence-1')).toBeDisabled();
      expect(screen.getByTestId('evidence-card-reason-cancel-evidence-1')).toBeDisabled();
    });

    it('has no axe violations with the segmented control rendered', async () => {
      const { container } = render(<EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} />);
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations while the reason panel is open', async () => {
      const user = userEvent.setup();
      const { container } = render(<EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} />);
      await user.click(screen.getByTestId('evidence-card-disposition-option-excluded'));
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('touch targets (docs/specs/testing.md 44px minimum)', () => {
    // The segmented control's three options use the compact `size="sm"`
    // toggle sizing, below tokens.css's `--size-touch-target-min: 44px`.
    // The established fix elsewhere in this codebase (e.g. CaseHeader.tsx's
    // "Reset demo" button, ApprovalCard.tsx) is a
    // `min-h-[var(--size-touch-target-min)]` className override -- asserted
    // here via class presence, since jsdom (this test's environment) does
    // not run a real layout engine and cannot measure an actual rendered
    // pixel height (see ../test/narrow-viewport.tsx's identical caveat).
    it('gives each disposition option the 44px touch-target override', () => {
      render(<EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} />);

      expect(screen.getByTestId('evidence-card-disposition-option-included')).toHaveClass(
        'min-h-[var(--size-touch-target-min)]',
      );
      expect(screen.getByTestId('evidence-card-disposition-option-excluded')).toHaveClass(
        'min-h-[var(--size-touch-target-min)]',
      );
      expect(screen.getByTestId('evidence-card-disposition-option-questioned')).toHaveClass(
        'min-h-[var(--size-touch-target-min)]',
      );
    });

    it('gives the collapsed summary expand control a 44px touch target', () => {
      render(<EvidenceCard item={buildItem()} collapsed />);
      expect(screen.getByTestId('evidence-card-expand-evidence-1')).toHaveClass(
        'min-h-[var(--size-touch-target-min)]',
      );
    });
  });

  describe('collapsed presentation (session-local expand override)', () => {
    it('renders only the compact summary when collapsed, hiding badges, claim, source, and controls', () => {
      render(<EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} collapsed />);

      expect(screen.getByTestId('evidence-card-expand-evidence-1')).toBeInTheDocument();
      expect(screen.queryByTestId('evidence-card-claim')).not.toBeInTheDocument();
      expect(screen.queryByTestId('evidence-card-source')).not.toBeInTheDocument();
      expect(screen.queryByTestId('evidence-card-disposition')).not.toBeInTheDocument();
      expect(screen.queryByTestId('evidence-card-disposition-control')).not.toBeInTheDocument();
      expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    });

    it('names the current disposition in the collapsed summary', () => {
      render(
        <EvidenceCard
          item={buildItem({ evidenceLink: buildEvidenceLink({ disposition: 'excluded' }) })}
          collapsed
        />,
      );
      expect(screen.getByTestId('evidence-card-expand-evidence-1')).toHaveTextContent(
        'Excluded from the case',
      );
    });

    it('renders full content when collapsed is false, the default', () => {
      render(<EvidenceCard item={buildItem()} />);
      expect(screen.queryByTestId('evidence-card-expand-evidence-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('evidence-card-claim')).toBeInTheDocument();
    });

    it('clicking the collapsed summary reveals full card content', async () => {
      const user = userEvent.setup();
      render(<EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} collapsed />);

      await user.click(screen.getByTestId('evidence-card-expand-evidence-1'));

      expect(screen.queryByTestId('evidence-card-expand-evidence-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('evidence-card-claim')).toBeInTheDocument();
      expect(screen.getByTestId('evidence-card-disposition-control')).toBeInTheDocument();
    });

    it('resets the expand override when collapsed toggles off and back on', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<EvidenceCard item={buildItem()} collapsed />);

      await user.click(screen.getByTestId('evidence-card-expand-evidence-1'));
      expect(screen.getByTestId('evidence-card-claim')).toBeInTheDocument();

      rerender(<EvidenceCard item={buildItem()} collapsed={false} />);
      expect(screen.getByTestId('evidence-card-claim')).toBeInTheDocument();

      rerender(<EvidenceCard item={buildItem()} collapsed />);
      expect(screen.queryByTestId('evidence-card-claim')).not.toBeInTheDocument();
      expect(screen.getByTestId('evidence-card-expand-evidence-1')).toBeInTheDocument();
    });

    it('has no axe violations when collapsed and read-only', async () => {
      const { container } = render(<EvidenceCard item={buildItem()} collapsed />);
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations when collapsed with disposition controls available', async () => {
      const { container } = render(
        <EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} collapsed />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations after expanding a collapsed item', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} collapsed />,
      );
      await user.click(screen.getByTestId('evidence-card-expand-evidence-1'));
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
