/**
 * The persistent orientation shell.
 *
 * This component exists to answer six questions without the person reading a
 * single line of chat history:
 *
 * 1. What decision am I making?
 * 2. What phase am I in?
 * 3. What has been covered or changed?
 * 4. What is currently in focus?
 * 5. What should I do next?
 * 6. How do I reach the outcome?
 *
 * Every test below is one of those six, or one of the ways the shell could
 * answer them dishonestly — claiming coverage it does not have, showing a
 * percentage that disagrees with its own counts, or presenting a provisional
 * result as settled.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { DecisionOrientationShell } from './DecisionOrientationShell.js';
import type { DecisionOrientation } from './DecisionOrientationShell.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function orientation(overrides: Partial<DecisionOrientation> = {}): DecisionOrientation {
  return {
    decisionTitle: 'Choose our next family car',
    packName: 'Vehicle Selection',
    phase: 'discovery',
    phaseLabel: 'Understanding what you need',
    coverage: {
      requiredTotal: 5,
      requiredResolved: 2,
      softTotal: 2,
      softResolved: 0,
      blindSpotReviewComplete: false,
    },
    currentFocus: 'Who and what has to fit',
    latestChange: 'You said two adults and two children in car seats',
    nextStepLabel: 'Answer: budget',
    routeToOutcome: 'Then Sift searches the catalog and you triage what it finds',
    provisional: false,
    ...overrides,
  };
}

describe('DecisionOrientationShell', () => {
  it('names the decision and the pack running it', () => {
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    expect(screen.getByTestId('orientation-decision')).toHaveTextContent(
      'Choose our next family car',
    );
    expect(screen.getByTestId('orientation-pack')).toHaveTextContent('Vehicle Selection');
  });

  it('says what phase this is in words a person recognises', () => {
    // "discovery" is the state machine's word. "Understanding what you need"
    // is what a person is actually doing.
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    expect(screen.getByTestId('orientation-phase')).toHaveTextContent(
      'Understanding what you need',
    );
    expect(screen.getByTestId('orientation-phase')).not.toHaveTextContent(/^discovery$/);
  });

  it('reports coverage as counts, not just a bar', () => {
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    expect(screen.getByTestId('orientation-coverage')).toHaveTextContent('2 of 5');
  });

  it('derives the progress bar from the same counts it prints', () => {
    // A percentage stored beside its own numerator and denominator is a
    // third fact that can disagree with the other two. This one is computed.
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    const bar = screen.getByTestId('orientation-progress');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
    expect(bar).toHaveAttribute('role', 'progressbar');
  });

  it('does not count the blind-spot review as covered until it happens', () => {
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    // Five of five topics answered would still not be "ready" -- and the
    // shell must not imply it is.
    const ready = orientation({
      coverage: {
        requiredTotal: 5,
        requiredResolved: 5,
        softTotal: 2,
        softResolved: 0,
        blindSpotReviewComplete: false,
      },
    });
    render(<DecisionOrientationShell orientation={ready} layout="narrow" />);

    expect(screen.getAllByTestId('orientation-coverage')[1]).not.toHaveTextContent(/complete/i);
  });

  it('shows the current focus and the latest meaningful change', () => {
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    expect(screen.getByTestId('orientation-focus')).toHaveTextContent('Who and what has to fit');
    expect(screen.getByTestId('orientation-latest-change')).toHaveTextContent(
      'two adults and two children in car seats',
    );
  });

  it('always shows a next step', () => {
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);
    expect(screen.getByTestId('orientation-next-step')).toHaveTextContent('Answer: budget');
  });

  it('shows the route to the outcome, so the journey has a visible end', () => {
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);
    expect(screen.getByTestId('orientation-route')).toHaveTextContent(/Sift searches the catalog/);
  });

  it('marks a provisional case as provisional', () => {
    render(
      <DecisionOrientationShell orientation={orientation({ provisional: true })} layout="narrow" />,
    );

    expect(screen.getByTestId('orientation-provisional')).toHaveTextContent(/provisional/i);
  });

  it('says nothing about provisionality when nothing was deferred', () => {
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);
    expect(screen.queryByTestId('orientation-provisional')).toBeNull();
  });

  it('handles a case with no coverage to report without dividing by zero', () => {
    const empty = orientation({
      coverage: {
        requiredTotal: 0,
        requiredResolved: 0,
        softTotal: 0,
        softResolved: 0,
        blindSpotReviewComplete: false,
      },
    });
    render(<DecisionOrientationShell orientation={empty} layout="narrow" />);

    const bar = screen.getByTestId('orientation-progress');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '0');
  });

  it('omits a focus line rather than inventing one', () => {
    render(
      <DecisionOrientationShell
        orientation={orientation({ currentFocus: null, latestChange: null })}
        layout="narrow"
      />,
    );

    expect(screen.queryByTestId('orientation-focus')).toBeNull();
    expect(screen.queryByTestId('orientation-latest-change')).toBeNull();
    // But the questions that always have an answer still have one.
    expect(screen.getByTestId('orientation-next-step')).toBeInTheDocument();
  });

  it('fits the narrow pane at every required width', () => {
    for (const width of [390, 430, 480]) {
      const { renderResult, overflowRisks } = renderAtNarrowWidth(
        <DecisionOrientationShell orientation={orientation()} layout="narrow" />,
        width,
      );
      expect(overflowRisks, `overflow at ${String(width)}px`).toEqual([]);
      renderResult.unmount();
    }
  });

  it('is a banner landmark, so a screen reader can jump to it', () => {
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('has no accessibility violations at either layout', async () => {
    const narrow = render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);
    expect(await axe(narrow.container)).toHaveNoViolations();
    narrow.unmount();

    const expanded = render(
      <DecisionOrientationShell
        orientation={orientation({ provisional: true })}
        layout="expanded"
      />,
    );
    expect(await axe(expanded.container)).toHaveNoViolations();
  });
});
