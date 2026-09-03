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

  it('keeps a human-only action even when it is last in the move list', () => {
    // The defect this pins: `confirm_shortlist` is the only human-only move
    // Sift derives and it is sixth in `deriveNextMoves`' order, so a plain
    // `slice(0, 2)` deleted it — and with it the "only you can do this"
    // note — on any case where two earlier moves also applied. A person
    // with a ready recommendation was never offered the one action that is
    // theirs alone. Found by `pnpm test:journey family-novice` (ADR 0014).
    const moves = [
      move({ label: 'One' }),
      move({ kind: 'quick_pick', label: 'Two', topicId: undefined }),
      move({ kind: 'compare_retained', label: 'Three', topicId: undefined }),
      move({
        kind: 'confirm_shortlist',
        label: 'Confirm your test-drive shortlist',
        topicId: undefined,
        toolName: undefined,
        humanOnly: true,
        requiredView: 'confirmation',
      }),
    ];

    render(<ContextActionDock moves={moves} onAct={vi.fn()} layout="narrow" />);

    expect(screen.getAllByTestId(/^dock-action-/)).toHaveLength(2);
    expect(screen.getByText('Confirm your test-drive shortlist')).toBeInTheDocument();
    expect(screen.getByTestId('dock-human-only-note')).toBeInTheDocument();

    // The defect this also pins: the human-only note used to render a
    // second time, near-identically, as that move's own `reason` ("Only
    // you can decide which options go ahead" stacked on "Only you can take
    // this step..."). The authority claim ("only you") now appears exactly
    // once in the whole dock.
    expect(screen.getAllByText(/only you/i)).toHaveLength(1);
  });

  it('keeps the derived order among the actions it does show', () => {
    // Authority decides what survives truncation; it does not reorder what
    // a person reads. The human-only move is still shown after the earlier
    // move it did not displace.
    const moves = [
      move({ label: 'One' }),
      move({ kind: 'quick_pick', label: 'Two', topicId: undefined }),
      move({
        kind: 'confirm_shortlist',
        label: 'Confirm your test-drive shortlist',
        topicId: undefined,
        toolName: undefined,
        humanOnly: true,
        requiredView: 'confirmation',
      }),
    ];

    render(<ContextActionDock moves={moves} onAct={vi.fn()} layout="narrow" />);

    expect(screen.getByTestId('dock-action-primary')).toHaveTextContent('One');
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
    // Visibly marked: a compact badge sits with the button, distinct from
    // the one sentence of prose that explains why.
    expect(screen.getByTestId('dock-human-only-badge')).toBeInTheDocument();
    expect(screen.getByTestId('dock-human-only-note')).toHaveTextContent(/only you/i);
    // Programmatically identifiable: the action's accessible description
    // *is* that one sentence, not a second copy of it.
    expect(action).toHaveAccessibleDescription(/only you/i);
    expect(screen.getAllByText(/only you/i)).toHaveLength(1);
  });

  it('does not label an ordinary action as human-only', () => {
    render(<ContextActionDock moves={[move()]} onAct={vi.fn()} layout="narrow" />);

    expect(screen.getByTestId('dock-action-primary')).toHaveAttribute('data-human-only', 'false');
    expect(screen.queryByTestId('dock-human-only-note')).toBeNull();
    expect(screen.queryByTestId('dock-human-only-badge')).toBeNull();
  });

  it('states the human-authority boundary exactly once, attached to the action it governs', () => {
    // Regression pin for the copy-duplication defect: `move.reason` and the
    // human-only note used to both render for `confirm_shortlist`, stacked
    // directly on top of each other. Now the note replaces that move's own
    // `reason` display rather than joining it, and it renders next to its
    // own button rather than in a block shared by every shown action.
    const moves = [
      move({ label: 'One' }),
      move({
        kind: 'confirm_shortlist',
        label: 'Confirm your test-drive shortlist',
        reason: 'Only you can decide which options go ahead',
        topicId: undefined,
        toolName: undefined,
        humanOnly: true,
        requiredView: 'confirmation',
      }),
    ];

    render(<ContextActionDock moves={moves} onAct={vi.fn()} layout="narrow" />);

    // Exactly one element carries the note testid, and it is scoped inside
    // the same wrapper as the human-only button, not a trailing sibling of
    // the whole dock.
    const note = screen.getByTestId('dock-human-only-note');
    const humanOnlyAction = screen.getByTestId('dock-action-secondary');
    expect(humanOnlyAction).toHaveAttribute('data-human-only', 'true');
    expect(humanOnlyAction.parentElement).toContainElement(note);
    expect(humanOnlyAction).toHaveAccessibleDescription(note.textContent ?? '');

    // The move's own `reason` (the pack-authored duplicate of the claim)
    // does not also render somewhere on screen.
    expect(
      screen.queryByText('Only you can decide which options go ahead'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/only you/i)).toHaveLength(1);
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
