import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { Claim, EvidenceDisposition, EvidenceLink, Source } from '@pax/contracts';
import { FindingsSheet } from './FindingsSheet.js';
import type { EvidenceItemData } from './EvidenceCard.js';

// FindingsSheet's own responsibility is the sheet chrome, the summary
// chips, the three tab views, and tracking which items the human has
// reviewed this session -- not EvidenceCard's internal rendering (that is
// EvidenceCard.test.tsx's job). Mocking it here means these tests stay
// deterministic regardless of EvidenceCard's own in-flight UI changes, and
// lets this file assert directly on the exact props FindingsSheet passes
// down (`collapsed`, `dispositionPending`, `onSetDisposition`).
vi.mock('./EvidenceCard.js', () => ({
  EvidenceCard: ({
    item,
    collapsed,
    dispositionPending,
    onSetDisposition,
  }: {
    item: EvidenceItemData;
    collapsed?: boolean;
    dispositionPending?: boolean;
    onSetDisposition?: (disposition: EvidenceDisposition, reason: string) => void;
  }) => (
    <div
      data-testid={`mock-evidence-card-${item.evidenceLink.id}`}
      data-collapsed={collapsed ? 'true' : 'false'}
      data-pending={dispositionPending ? 'true' : 'false'}
    >
      {onSetDisposition ? (
        <button
          type="button"
          data-testid={`mock-set-excluded-${item.evidenceLink.id}`}
          onClick={() => onSetDisposition('excluded', 'Reviewed by user')}
        >
          Exclude
        </button>
      ) : null}
    </div>
  ),
}));

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

function buildMixedItems(): EvidenceItemData[] {
  return [
    buildItem({
      evidenceLink: buildEvidenceLink({
        id: 'evidence-1',
        disposition: 'included',
        verdict: 'pass',
      }),
      claim: buildClaim({ id: 'claim-1', statement: 'Confirmed dealer price of $28,450.' }),
    }),
    buildItem({
      evidenceLink: buildEvidenceLink({
        id: 'evidence-2',
        disposition: 'included',
        verdict: 'degraded',
      }),
      claim: buildClaim({ id: 'claim-2', statement: 'Warranty terms partially confirmed.' }),
    }),
    buildItem({
      evidenceLink: buildEvidenceLink({
        id: 'evidence-3',
        disposition: 'excluded',
        verdict: 'fail',
        summary: 'Rebate could not be confirmed.',
      }),
      claim: undefined,
    }),
    buildItem({
      evidenceLink: buildEvidenceLink({
        id: 'evidence-4',
        disposition: 'questioned',
        verdict: 'skipped',
      }),
      claim: buildClaim({ id: 'claim-4', statement: 'Trade-in value is disputed.' }),
    }),
  ];
}

describe('FindingsSheet', () => {
  it('does not render its content when closed', () => {
    render(<FindingsSheet open={false} onOpenChange={vi.fn()} items={buildMixedItems()} />);
    expect(screen.queryByTestId('findings-sheet')).not.toBeInTheDocument();
    expect(screen.queryByText('What Pax found')).not.toBeInTheDocument();
  });

  it('renders its content, titled "What Pax found", when open', () => {
    render(<FindingsSheet open onOpenChange={vi.fn()} items={buildMixedItems()} />);
    expect(screen.getByTestId('findings-sheet')).toBeInTheDocument();
    expect(screen.getByText('What Pax found')).toBeInTheDocument();
  });

  it('renders the empty state instead of chips/tabs when there is no evidence yet', () => {
    render(<FindingsSheet open onOpenChange={vi.fn()} items={[]} />);
    expect(screen.getByTestId('findings-sheet-empty')).toHaveTextContent(
      /no evidence has been gathered yet/i,
    );
    expect(screen.queryByTestId('findings-sheet-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('findings-sheet-tabs')).not.toBeInTheDocument();
  });

  it('shows real live counts by disposition in the summary chip strip', () => {
    render(<FindingsSheet open onOpenChange={vi.fn()} items={buildMixedItems()} />);
    const summary = screen.getByTestId('findings-sheet-summary');
    expect(within(summary).getByText('2 included')).toBeInTheDocument();
    expect(within(summary).getByText('1 excluded')).toBeInTheDocument();
    expect(within(summary).getByText('1 questioned')).toBeInTheDocument();
  });

  it('defaults to the List tab, rendering one card per item', () => {
    render(<FindingsSheet open onOpenChange={vi.fn()} items={buildMixedItems()} />);
    const listView = screen.getByTestId('findings-sheet-view-list');
    expect(listView).toBeVisible();
    expect(within(listView).getByTestId('mock-evidence-card-evidence-1')).toBeInTheDocument();
    expect(within(listView).getByTestId('mock-evidence-card-evidence-4')).toBeInTheDocument();
    // Radix Tabs keeps every panel mounted (hidden via the `hidden`
    // attribute) rather than unmounting inactive ones -- unlike Sheet's
    // Dialog primitive, which truly unmounts when closed.
    expect(screen.getByTestId('findings-sheet-view-table')).not.toBeVisible();
    expect(screen.getByTestId('findings-sheet-view-kanban')).not.toBeVisible();
  });

  it('switches to the Table tab and shows a dense, read-only row per item', async () => {
    const user = userEvent.setup();
    render(<FindingsSheet open onOpenChange={vi.fn()} items={buildMixedItems()} />);

    await user.click(screen.getByTestId('findings-sheet-tab-table'));

    expect(screen.getByTestId('findings-sheet-view-list')).not.toBeVisible();
    const tableView = screen.getByTestId('findings-sheet-view-table');
    expect(tableView).toBeVisible();
    const row = within(tableView).getByTestId('findings-sheet-table-row-evidence-1');
    expect(row).toHaveTextContent('Confirmed dealer price of $28,450.');
    expect(row).toHaveTextContent('Included');

    const excludedRow = within(tableView).getByTestId('findings-sheet-table-row-evidence-3');
    expect(excludedRow).toHaveTextContent('Rebate could not be confirmed.');
    expect(excludedRow).toHaveTextContent('Excluded');
  });

  it('switches to the Kanban tab and groups items into Included/Excluded/Questioned columns', async () => {
    const user = userEvent.setup();
    render(<FindingsSheet open onOpenChange={vi.fn()} items={buildMixedItems()} />);

    await user.click(screen.getByTestId('findings-sheet-tab-kanban'));

    expect(screen.getByTestId('findings-sheet-view-list')).not.toBeVisible();
    const kanbanView = screen.getByTestId('findings-sheet-view-kanban');
    expect(kanbanView).toBeVisible();
    const includedColumn = within(kanbanView).getByTestId('findings-sheet-kanban-column-included');
    expect(
      within(includedColumn).getByTestId('findings-sheet-kanban-card-evidence-1'),
    ).toHaveTextContent('Confirmed dealer price of $28,450.');
    expect(
      within(includedColumn).getByTestId('findings-sheet-kanban-card-evidence-2'),
    ).toBeInTheDocument();

    const excludedColumn = within(kanbanView).getByTestId('findings-sheet-kanban-column-excluded');
    expect(
      within(excludedColumn).getByTestId('findings-sheet-kanban-card-evidence-3'),
    ).toHaveTextContent('Rebate could not be confirmed.');

    const questionedColumn = within(kanbanView).getByTestId(
      'findings-sheet-kanban-column-questioned',
    );
    expect(
      within(questionedColumn).getByTestId('findings-sheet-kanban-card-evidence-4'),
    ).toBeInTheDocument();
  });

  it('marks an item collapsed only after the human acts on its disposition, and only that item', async () => {
    const onSetDisposition = vi.fn();
    const user = userEvent.setup();
    render(
      <FindingsSheet
        open
        onOpenChange={vi.fn()}
        items={buildMixedItems()}
        onSetDisposition={onSetDisposition}
      />,
    );

    expect(screen.getByTestId('mock-evidence-card-evidence-1')).toHaveAttribute(
      'data-collapsed',
      'false',
    );
    expect(screen.getByTestId('mock-evidence-card-evidence-2')).toHaveAttribute(
      'data-collapsed',
      'false',
    );

    await user.click(screen.getByTestId('mock-set-excluded-evidence-1'));

    expect(onSetDisposition).toHaveBeenCalledWith('evidence-1', 'excluded', 'Reviewed by user');
    expect(screen.getByTestId('mock-evidence-card-evidence-1')).toHaveAttribute(
      'data-collapsed',
      'true',
    );
    expect(screen.getByTestId('mock-evidence-card-evidence-2')).toHaveAttribute(
      'data-collapsed',
      'false',
    );
  });

  it('marks only the pending item as busy via dispositionPendingId', () => {
    render(
      <FindingsSheet
        open
        onOpenChange={vi.fn()}
        items={buildMixedItems()}
        onSetDisposition={vi.fn()}
        dispositionPendingId="evidence-2"
      />,
    );

    expect(screen.getByTestId('mock-evidence-card-evidence-1')).toHaveAttribute(
      'data-pending',
      'false',
    );
    expect(screen.getByTestId('mock-evidence-card-evidence-2')).toHaveAttribute(
      'data-pending',
      'true',
    );
  });

  it('renders every list item read-only when onSetDisposition is not provided', () => {
    render(<FindingsSheet open onOpenChange={vi.fn()} items={buildMixedItems()} />);
    expect(screen.queryByTestId('mock-set-excluded-evidence-1')).not.toBeInTheDocument();
  });

  it('gives the tab list a real 44px touch target', () => {
    render(<FindingsSheet open onOpenChange={vi.fn()} items={buildMixedItems()} />);
    expect(screen.getByTestId('findings-sheet-tabs')).toHaveClass(
      'min-h-[var(--size-touch-target-min)]',
    );
  });

  it('has no axe violations in the empty state', async () => {
    const { container } = render(<FindingsSheet open onOpenChange={vi.fn()} items={[]} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations with the sheet open across every tab', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FindingsSheet
        open
        onOpenChange={vi.fn()}
        items={buildMixedItems()}
        onSetDisposition={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByTestId('findings-sheet-tab-table'));
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByTestId('findings-sheet-tab-kanban'));
    expect(await axe(container)).toHaveNoViolations();
  });
});
