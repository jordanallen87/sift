import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { DecisionProposal, Recommendation } from '@sift/contracts';
import { RecommendationHero, type RecommendationHeroProps } from './RecommendationHero.js';
import { deriveWorkspaceStatus, type WorkspaceStatusInput } from './workspace-status.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-1',
    status: 'ready',
    favoredOptionId: null,
    rationale: 'Best overall fit.',
    facts: [],
    hypotheses: [],
    confidence: 0.8,
    limitations: [],
    sourceIds: [],
    resolvedObligationIds: [],
    acceptedUncertaintyObligationIds: [],
    generatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildProposal(overrides: Partial<DecisionProposal> = {}): DecisionProposal {
  return {
    id: 'proposal-1',
    recommendationId: 'rec-1',
    status: 'pending',
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildStatusInput(overrides: Partial<WorkspaceStatusInput> = {}): WorkspaceStatusInput {
  return {
    isRunActive: false,
    recommendation: null,
    proposal: null,
    flaggedFindingsCount: 0,
    ...overrides,
  };
}

function buildProps(overrides: Partial<RecommendationHeroProps> = {}): RecommendationHeroProps {
  return {
    status: deriveWorkspaceStatus(buildStatusInput()),
    recommendation: null,
    withheld: null,
    sources: {},
    proposal: null,
    onReview: vi.fn(),
    reviewPending: false,
    reviewError: null,
    onRequestInvestigation: vi.fn(),
    requestPending: false,
    requestDisabled: false,
    requestError: null,
    onReviewFindingsClick: vi.fn(),
    liveRunReceipt: null,
    liveEvents: [],
    onInspectRun: vi.fn(),
    ...overrides,
  };
}

describe('RecommendationHero', () => {
  it('renders the not_started headline and a primary "Ask Sift to look into this" action for a fresh case', () => {
    render(<RecommendationHero {...buildProps()} />);

    expect(screen.getByTestId('recommendation-hero-headline')).toHaveTextContent(
      "Nothing's been looked into yet.",
    );
    expect(screen.getByTestId('request-investigation')).toHaveTextContent(
      'Ask Sift to look into this',
    );
  });

  // ADR 0004 decision item 1: this is the one machine-checkable proof that
  // the recommendation and the approval controls no longer live in two
  // separate regions that can disagree with each other -- both mount (or
  // do not mount) from the exact same real data this component was given.
  it('mounts neither RecommendationCard nor ApprovalCard when there is nothing real to show', () => {
    render(<RecommendationHero {...buildProps()} />);

    expect(screen.queryByTestId('recommendation-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('approval-card')).not.toBeInTheDocument();
  });

  it('shows the withheld draft copy via RecommendationCard, with the ready_blocked "Not ready yet" headline', () => {
    const status = deriveWorkspaceStatus(buildStatusInput({ withheld: true }));
    render(
      <RecommendationHero {...buildProps({ status, withheld: { unresolvedRequiredCount: 2 } })} />,
    );

    expect(screen.getByTestId('recommendation-hero-headline')).toHaveTextContent('Not ready yet');
    expect(screen.getByTestId('recommendation-card-withheld')).toBeInTheDocument();
    expect(screen.queryByTestId('approval-card')).not.toBeInTheDocument();
  });

  it('shows a real recommendation via RecommendationCard once one exists, with the "Current recommendation" headline', () => {
    const recommendation = buildRecommendation();
    const status = deriveWorkspaceStatus(buildStatusInput({ recommendation }));
    render(<RecommendationHero {...buildProps({ status, recommendation })} />);

    expect(screen.getByTestId('recommendation-hero-headline')).toHaveTextContent(
      'Current recommendation',
    );
    expect(screen.getByTestId('recommendation-card')).toBeInTheDocument();
    expect(screen.getByTestId('recommendation-card-rationale')).toHaveTextContent(
      'Best overall fit.',
    );
  });

  // Regression for the stacked-duplicate-heading defect: the hero headline
  // and the nested RecommendationCard used to both render "Current
  // recommendation" as their own <h2>, directly on top of each other. ADR
  // 0004 merged the answer and its next action into ONE region precisely so
  // it "cannot disagree with itself because it is one region, not two" --
  // that guarantee is broken if the region renders the same heading twice.
  it('renders exactly one "Current recommendation" heading, not a duplicated nested one', () => {
    const recommendation = buildRecommendation();
    const status = deriveWorkspaceStatus(
      buildStatusInput({ recommendation, flaggedFindingsCount: 4 }),
    );
    render(<RecommendationHero {...buildProps({ status, recommendation })} />);

    expect(screen.getAllByText('Current recommendation')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Current recommendation' })).toBe(
      screen.getByTestId('recommendation-hero-headline'),
    );
  });

  it('shows a "Review findings" action exactly when flagged findings block progress, and calls the handler', async () => {
    const user = userEvent.setup();
    const onReviewFindingsClick = vi.fn();
    const status = deriveWorkspaceStatus(buildStatusInput({ flaggedFindingsCount: 2 }));
    render(<RecommendationHero {...buildProps({ status, onReviewFindingsClick })} />);

    expect(screen.getByTestId('recommendation-hero-detail')).toHaveTextContent(
      '2 findings may need a closer look before Sift can finish.',
    );
    const button = screen.getByTestId('recommendation-hero-review-findings');
    await user.click(button);
    expect(onReviewFindingsClick).toHaveBeenCalledTimes(1);
  });

  it('does not show a "Review findings" action when nothing is flagged', () => {
    render(<RecommendationHero {...buildProps()} />);
    expect(screen.queryByTestId('recommendation-hero-review-findings')).not.toBeInTheDocument();
  });

  it('mounts ApprovalCard (pending) and calls onReview with the human-authored review once a proposal is pending', async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    const recommendation = buildRecommendation();
    const proposal = buildProposal({ status: 'pending' });
    const status = deriveWorkspaceStatus(buildStatusInput({ recommendation, proposal }));
    render(<RecommendationHero {...buildProps({ status, recommendation, proposal, onReview })} />);

    expect(screen.getByTestId('recommendation-hero-headline')).toHaveTextContent(
      'Sift has a recommendation ready for your decision.',
    );
    // Human-only approval must survive being composed inside this region:
    // ApprovalCard's own literal-`'human'` construction is untouched here.
    await user.click(screen.getByTestId('approval-card-approve'));
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ actor: 'human' }));
  });

  it('shows the settled decision headline and ApprovalCard stamp once a proposal is decided', () => {
    const recommendation = buildRecommendation();
    const proposal = buildProposal({ status: 'approved' });
    const status = deriveWorkspaceStatus(buildStatusInput({ recommendation, proposal }));
    render(<RecommendationHero {...buildProps({ status, recommendation, proposal })} />);

    expect(screen.getByTestId('recommendation-hero-headline')).toHaveTextContent('Decided.');
    expect(screen.getByTestId('approval-card-stamp')).toHaveTextContent('Approved');
  });

  it('renders LiveRunStatus only once a receipt exists, and the Inspect run control only once a runId exists', () => {
    const { rerender } = render(<RecommendationHero {...buildProps()} />);
    expect(screen.queryByTestId('live-run-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('open-runtime-inspector')).not.toBeInTheDocument();

    rerender(<RecommendationHero {...buildProps({ liveRunReceipt: { commandId: 'cmd-1' } })} />);
    expect(screen.getByTestId('live-run-status')).toBeInTheDocument();
    expect(screen.queryByTestId('open-runtime-inspector')).not.toBeInTheDocument();

    rerender(
      <RecommendationHero
        {...buildProps({ liveRunReceipt: { commandId: 'cmd-1', runId: 'run-1' } })}
      />,
    );
    expect(screen.getByTestId('open-runtime-inspector')).toBeInTheDocument();
  });

  it('calls onInspectRun with the real runId when "Inspect run" is clicked', async () => {
    const user = userEvent.setup();
    const onInspectRun = vi.fn();
    render(
      <RecommendationHero
        {...buildProps({
          liveRunReceipt: { commandId: 'cmd-1', runId: 'run-42' },
          onInspectRun,
        })}
      />,
    );

    await user.click(screen.getByTestId('open-runtime-inspector'));
    expect(onInspectRun).toHaveBeenCalledWith('run-42');
  });

  it('disables the "Ask Sift to look into this" action while a request is pending or explicitly disabled', () => {
    const { rerender } = render(<RecommendationHero {...buildProps({ requestPending: true })} />);
    expect(screen.getByTestId('request-investigation')).toBeDisabled();

    rerender(<RecommendationHero {...buildProps({ requestDisabled: true })} />);
    expect(screen.getByTestId('request-investigation')).toBeDisabled();
  });

  it('shows a recoverable request-investigation error', () => {
    render(<RecommendationHero {...buildProps({ requestError: 'Could not reach Sift.' })} />);
    expect(screen.getByTestId('request-investigation-error')).toHaveTextContent(
      'Could not reach Sift.',
    );
  });

  it('has no axe violations across the not_started, ready_blocked, and pending_approval states', async () => {
    const { container: notStarted } = render(<RecommendationHero {...buildProps()} />);
    expect(await axe(notStarted)).toHaveNoViolations();

    const recommendation = buildRecommendation();
    const proposal = buildProposal({ status: 'pending' });
    const status = deriveWorkspaceStatus(buildStatusInput({ recommendation, proposal }));
    const { container: pendingApproval } = render(
      <RecommendationHero {...buildProps({ status, recommendation, proposal })} />,
    );
    expect(await axe(pendingApproval)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const recommendation = buildRecommendation();
    const proposal = buildProposal({ status: 'pending' });
    const status = deriveWorkspaceStatus(buildStatusInput({ recommendation, proposal }));
    const { overflowRisks } = renderAtNarrowWidth(
      <RecommendationHero {...buildProps({ status, recommendation, proposal })} />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
