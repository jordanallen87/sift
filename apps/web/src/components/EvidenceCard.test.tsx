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

  describe('disposition controls (webmcp.md pax_set_evidence_disposition, visible-control equivalent)', () => {
    it('renders no disposition controls when onSetDisposition is not provided (backward compatible)', () => {
      render(<EvidenceCard item={buildItem()} />);
      expect(screen.queryByTestId('evidence-card-set-included')).not.toBeInTheDocument();
    });

    it('calls onSetDisposition with the chosen disposition and the entered reason', async () => {
      const onSetDisposition = vi.fn();
      const user = userEvent.setup();
      render(<EvidenceCard item={buildItem()} onSetDisposition={onSetDisposition} />);

      await user.clear(screen.getByLabelText(/reason/i));
      await user.type(screen.getByLabelText(/reason/i), 'Duplicate of another source');
      await user.click(screen.getByTestId('evidence-card-set-excluded'));

      expect(onSetDisposition).toHaveBeenCalledWith('excluded', 'Duplicate of another source');
    });

    it('calls onSetDisposition with "included" and falls back to a default reason when left blank', async () => {
      const onSetDisposition = vi.fn();
      const user = userEvent.setup();
      render(<EvidenceCard item={buildItem()} onSetDisposition={onSetDisposition} />);

      await user.clear(screen.getByLabelText(/reason/i));
      await user.click(screen.getByTestId('evidence-card-set-included'));

      expect(onSetDisposition).toHaveBeenCalledWith('included', 'Reviewed by user');
    });

    it('calls onSetDisposition with "questioned"', async () => {
      const onSetDisposition = vi.fn();
      const user = userEvent.setup();
      render(<EvidenceCard item={buildItem()} onSetDisposition={onSetDisposition} />);

      await user.click(screen.getByTestId('evidence-card-set-questioned'));

      expect(onSetDisposition).toHaveBeenCalledWith('questioned', 'Reviewed by user');
    });

    it('disables the controls while a disposition change is pending', () => {
      render(<EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} dispositionPending />);
      expect(screen.getByTestId('evidence-card-set-included')).toBeDisabled();
      expect(screen.getByTestId('evidence-card-set-excluded')).toBeDisabled();
      expect(screen.getByTestId('evidence-card-set-questioned')).toBeDisabled();
    });

    it('has no axe violations with disposition controls rendered', async () => {
      const { container } = render(<EvidenceCard item={buildItem()} onSetDisposition={vi.fn()} />);
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
