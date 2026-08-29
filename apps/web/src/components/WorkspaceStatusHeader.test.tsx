import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { DecisionProposal, Recommendation } from '@pax/contracts';
import { WorkspaceStatusHeader } from './WorkspaceStatusHeader.js';
import { deriveWorkspaceStatus, type WorkspaceStatusInput } from './workspace-status.js';

// Mirrors workspace-status.test.ts's fixture builders: deriveWorkspaceStatus
// only reads `.status` off these, so an `as` cast past the full strict
// schema keeps fixtures short without weakening what's under test here.
function buildRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-1',
    status: 'ready',
    rationale: 'Test rationale.',
    facts: [],
    hypotheses: [],
    limitations: [],
    sourceIds: [],
    optionId: 'candidate-1',
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  } as Recommendation;
}

function buildProposal(overrides: Partial<DecisionProposal> = {}): DecisionProposal {
  return {
    id: 'proposal-1',
    recommendationId: 'rec-1',
    status: 'pending',
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  } as DecisionProposal;
}

function buildInput(overrides: Partial<WorkspaceStatusInput> = {}): WorkspaceStatusInput {
  return {
    isRunActive: false,
    recommendation: null,
    proposal: null,
    flaggedFindingsCount: 0,
    ...overrides,
  };
}

describe('WorkspaceStatusHeader', () => {
  it('renders started done, investigating current, and the rest upcoming for a fresh case, with the open next step', () => {
    const status = deriveWorkspaceStatus(buildInput());
    render(<WorkspaceStatusHeader status={status} />);

    expect(screen.getByTestId('tracker-stage-started')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('tracker-stage-investigating')).toHaveAttribute(
      'data-state',
      'current',
    );
    expect(screen.getByTestId('tracker-stage-pick-ready')).toHaveAttribute(
      'data-state',
      'upcoming',
    );
    expect(screen.getByTestId('tracker-stage-decided')).toHaveAttribute('data-state', 'upcoming');

    expect(screen.getByTestId('workspace-next-step')).toHaveAttribute('data-tone', 'open');
    expect(screen.getByTestId('workspace-next-step-text')).toHaveTextContent(
      "Nothing's been looked into yet.",
    );
    expect(screen.getByTestId('workspace-next-step-action')).toHaveTextContent(
      'Request investigation',
    );
  });

  it('calls onNextStepAction exactly once when the action button is clicked', async () => {
    const user = userEvent.setup();
    const onNextStepAction = vi.fn();
    const status = deriveWorkspaceStatus(buildInput());
    render(<WorkspaceStatusHeader status={status} onNextStepAction={onNextStepAction} />);

    await user.click(screen.getByTestId('workspace-next-step-action'));
    expect(onNextStepAction).toHaveBeenCalledTimes(1);
  });

  it('gives a done stage a visually distinct marker (a checkmark) from current and upcoming stages', () => {
    const status = deriveWorkspaceStatus(
      buildInput({
        recommendation: buildRecommendation({ status: 'ready' }),
        proposal: buildProposal({ status: 'pending' }),
        flaggedFindingsCount: 2,
      }),
    );
    render(<WorkspaceStatusHeader status={status} />);

    const started = screen.getByTestId('tracker-stage-started');
    const decided = screen.getByTestId('tracker-stage-decided');
    expect(started).toHaveAttribute('data-state', 'done');
    expect(decided).toHaveAttribute('data-state', 'current');
    expect(started).toHaveTextContent('✓');
    expect(decided).not.toHaveTextContent('✓');

    expect(screen.getByTestId('workspace-next-step')).toHaveAttribute('data-tone', 'ready');
    expect(screen.getByTestId('workspace-next-step-text')).toHaveTextContent(
      'Pax has a pick ready. Review it and approve, or send Pax back to look further.',
    );
    expect(screen.getByTestId('workspace-next-step-action')).toHaveTextContent('Go to Our pick');
  });

  it('renders the active next step with no action button', () => {
    const status = deriveWorkspaceStatus(buildInput({ isRunActive: true }));
    render(<WorkspaceStatusHeader status={status} />);

    expect(screen.getByTestId('workspace-next-step')).toHaveAttribute('data-tone', 'active');
    expect(screen.getByTestId('workspace-next-step-text')).toHaveTextContent(
      'Pax is investigating in the background. Nothing needed from you right now.',
    );
    expect(screen.queryByTestId('workspace-next-step-action')).not.toBeInTheDocument();
  });

  it('renders the accepted-uncertainty next step for flagged findings, with a review action', () => {
    const status = deriveWorkspaceStatus(buildInput({ flaggedFindingsCount: 3 }));
    render(<WorkspaceStatusHeader status={status} />);

    expect(screen.getByTestId('workspace-next-step')).toHaveAttribute('data-tone', 'accepted');
    expect(screen.getByTestId('workspace-next-step-text')).toHaveTextContent(
      '3 findings may need a closer look before Pax can finish.',
    );
    expect(screen.getByTestId('workspace-next-step-action')).toHaveTextContent('Review findings');
  });

  it('renders the calm next step with no action button once a proposal is settled', () => {
    const status = deriveWorkspaceStatus(
      buildInput({
        recommendation: buildRecommendation({ status: 'ready' }),
        proposal: buildProposal({ status: 'approved' }),
      }),
    );
    render(<WorkspaceStatusHeader status={status} />);

    expect(screen.getByTestId('workspace-next-step')).toHaveAttribute('data-tone', 'calm');
    expect(screen.getByTestId('workspace-next-step-text')).toHaveTextContent(
      "You're all caught up. Pax will let you know if anything changes.",
    );
    expect(screen.queryByTestId('workspace-next-step-action')).not.toBeInTheDocument();
    expect(screen.getByTestId('tracker-stage-decided')).toHaveAttribute('data-state', 'done');
  });

  it('has an accessible landmark wrapping the tracker and banner as one unit', () => {
    const status = deriveWorkspaceStatus(buildInput());
    render(<WorkspaceStatusHeader status={status} />);

    const header = screen.getByTestId('workspace-status-header');
    expect(header.tagName).toBe('SECTION');
    expect(header).toHaveAccessibleName('Case progress and next step');
    expect(header).toContainElement(screen.getByTestId('tracker-stage-started'));
    expect(header).toContainElement(screen.getByTestId('workspace-next-step'));
  });

  it('has no axe violations for the fresh-case state and the pick-ready state', async () => {
    const fresh = deriveWorkspaceStatus(buildInput());
    const { container: freshContainer } = render(
      <WorkspaceStatusHeader status={fresh} onNextStepAction={vi.fn()} />,
    );
    expect(await axe(freshContainer)).toHaveNoViolations();

    const pickReady = deriveWorkspaceStatus(
      buildInput({
        recommendation: buildRecommendation({ status: 'ready' }),
        proposal: buildProposal({ status: 'pending' }),
      }),
    );
    const { container: pickReadyContainer } = render(
      <WorkspaceStatusHeader status={pickReady} onNextStepAction={vi.fn()} />,
    );
    expect(await axe(pickReadyContainer)).toHaveNoViolations();
  });
});
