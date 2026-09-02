/**
 * The contextual action dock.
 *
 * One rule above all others: **at most two primary actions.** A dock that
 * offers five things is a dock that has stopped answering "what should I do
 * next" and started asking it back.
 *
 * The second rule matters more: a human-only move must never arrive here as
 * something a model could have triggered. `NextMove` already makes that
 * structural — a human-only move has nowhere to put a `toolName` — and the
 * dock renders that distinction visibly, so a person can tell which button
 * is theirs alone.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { NextMove } from '@sift/contracts';
import { ContextActionDock } from './ContextActionDock.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function move(overrides: Partial<NextMove> = {}): NextMove {
  return {
    kind: 'answer_topic',
    label: 'Answer: budget',
    reason: 'This is the highest-value thing still unknown',
    topicId: 'vehicle.budget',
    requiredView: 'interaction',
    toolName: 'sift_request_interaction',
    humanOnly: false,
    mayInterruptHumanNavigation: false,
    ...overrides,
  };
}

describe('ContextActionDock', () => {
  it('renders the first move as the primary action', () => {
    render(<ContextActionDock moves={[move()]} onAct={vi.fn()} layout="narrow" />);

    expect(screen.getByTestId('dock-action-primary')).toHaveTextContent('Answer: budget');
  });

  it('never renders more than two actions, however many moves are available', () => {
    const moves = [
      move({ label: 'One' }),
      move({ kind: 'quick_pick', label: 'Two', topicId: undefined }),
      move({ kind: 'compare_retained', label: 'Three', topicId: undefined }),
      move({ kind: 'review_question', label: 'Four', topicId: undefined }),
    ];

    render(<ContextActionDock moves={moves} onAct={vi.fn()} layout="narrow" />);

    expect(screen.getAllByTestId(/^dock-action-/)).toHaveLength(2);
  });

  it('renders nothing at all when there is nothing to do', () => {
    const { container } = render(<ContextActionDock moves={[]} onAct={vi.fn()} layout="narrow" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports the move that was taken, not just that a click happened', async () => {
    const user = userEvent.setup();
    const onAct = vi.fn();
    render(<ContextActionDock moves={[move()]} onAct={onAct} layout="narrow" />);

    await user.click(screen.getByTestId('dock-action-primary'));

    expect(onAct).toHaveBeenCalledWith(expect.objectContaining({ kind: 'answer_topic' }));
  });

  it('marks a human-only action as the person`s to take', () => {
    // The dock is where a person decides whether to press something. If a
    // human-only action looks identical to one ChatGPT could have taken,
    // the product's central claim is invisible exactly where it matters.
    render(
      <ContextActionDock
        moves={[
          move({
            kind: 'confirm_shortlist',
            label: 'Confirm your test-drive shortlist',
            humanOnly: true,
            toolName: undefined,
            topicId: undefined,
            requiredView: 'confirmation',
          }),
        ]}
        onAct={vi.fn()}
        layout="narrow"
      />,
    );

    const action = screen.getByTestId('dock-action-primary');
    expect(action).toHaveAttribute('data-human-only', 'true');
    expect(screen.getByTestId('dock-human-only-note')).toHaveTextContent(/only you/i);
  });

  it('does not label an ordinary action as human-only', () => {
    render(<ContextActionDock moves={[move()]} onAct={vi.fn()} layout="narrow" />);

    expect(screen.getByTestId('dock-action-primary')).toHaveAttribute('data-human-only', 'false');
    expect(screen.queryByTestId('dock-human-only-note')).toBeNull();
  });

  it('exposes each action`s reason without making the person hunt for it', () => {
    render(<ContextActionDock moves={[move()]} onAct={vi.fn()} layout="narrow" />);

    expect(screen.getByTestId('dock-action-primary')).toHaveAccessibleDescription(
      /highest-value thing still unknown/,
    );
  });

  it('is a complementary landmark with a name, so it can be skipped or jumped to', () => {
    render(<ContextActionDock moves={[move()]} onAct={vi.fn()} layout="narrow" />);
    expect(screen.getByRole('complementary', { name: /next/i })).toBeInTheDocument();
  });

  it('fits the narrow pane at every required width', () => {
    for (const width of [390, 430, 480]) {
      const { renderResult, overflowRisks } = renderAtNarrowWidth(
        <ContextActionDock
          moves={[
            move(),
            move({ kind: 'quick_pick', label: 'Continue Quick Pick', topicId: undefined }),
          ]}
          onAct={vi.fn()}
          layout="narrow"
        />,
        width,
      );
      expect(overflowRisks, `overflow at ${String(width)}px`).toEqual([]);
      renderResult.unmount();
    }
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <ContextActionDock
        moves={[
          move(),
          move({ kind: 'quick_pick', label: 'Continue Quick Pick', topicId: undefined }),
        ]}
        onAct={vi.fn()}
        layout="narrow"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
