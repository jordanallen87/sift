import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { EvidenceLink } from '@pax/contracts';
import { EvidenceList } from './EvidenceList.js';
import type { EvidenceItemData } from './EvidenceCard.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildEvidenceLink(overrides: Partial<EvidenceLink> = {}): EvidenceLink {
  return {
    id: 'evidence-1',
    obligationId: 'obligation-1',
    level: 'E1',
    verdict: 'pass',
    disposition: 'included',
    summary: 'Confirmed via dealer invoice.',
    stale: false,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildItem(overrides: Partial<EvidenceItemData> = {}): EvidenceItemData {
  return { evidenceLink: buildEvidenceLink(), ...overrides };
}

describe('EvidenceList', () => {
  it('renders the initial/empty state when no case is open (items is null)', () => {
    render(<EvidenceList items={null} />);
    expect(screen.getByTestId('evidence-list-empty')).toHaveTextContent(/no case is open yet/i);
  });

  it('renders a loading state before evidence has arrived', () => {
    render(<EvidenceList items={null} loading />);
    expect(screen.getByTestId('evidence-list-loading')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a distinct "no evidence yet" message for an open case with zero evidence', () => {
    render(<EvidenceList items={[]} />);
    expect(screen.getByTestId('evidence-list-no-items')).toHaveTextContent(
      /no evidence has been gathered yet/i,
    );
  });

  it('renders one EvidenceCard per item, showing a partial mix of dispositions/verdicts', () => {
    render(
      <EvidenceList
        items={[
          buildItem({ evidenceLink: buildEvidenceLink({ id: 'evidence-1', verdict: 'pass' }) }),
          buildItem({
            evidenceLink: buildEvidenceLink({
              id: 'evidence-2',
              verdict: 'skipped',
              disposition: 'questioned',
            }),
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('evidence-list-items')).toBeInTheDocument();
    expect(screen.getByTestId('evidence-card-evidence-1')).toBeInTheDocument();
    expect(screen.getByTestId('evidence-card-evidence-2')).toBeInTheDocument();
  });

  it('renders a recoverable error while preserving the last valid items underneath', () => {
    render(
      <EvidenceList
        items={[buildItem({ evidenceLink: buildEvidenceLink({ id: 'evidence-1' }) })]}
        error="Could not refresh evidence. Showing the last known state."
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/could not refresh evidence/i);
    expect(screen.getByTestId('evidence-card-evidence-1')).toBeInTheDocument();
  });

  it('has no axe violations across empty, loading, populated, and error states', async () => {
    const { container: empty } = render(<EvidenceList items={null} />);
    expect(await axe(empty)).toHaveNoViolations();

    const { container: loading } = render(<EvidenceList items={null} loading />);
    expect(await axe(loading)).toHaveNoViolations();

    const { container: populated } = render(<EvidenceList items={[buildItem()]} />);
    expect(await axe(populated)).toHaveNoViolations();

    const { container: errored } = render(
      <EvidenceList items={[buildItem()]} error="Could not refresh evidence." />,
    );
    expect(await axe(errored)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(<EvidenceList items={[buildItem()]} />);
    expect(overflowRisks).toEqual([]);
  });
});
