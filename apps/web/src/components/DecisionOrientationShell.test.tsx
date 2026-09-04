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
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { CaseState, CompiledDecisionPack } from '@sift/contracts';
import { DecisionOrientationShell } from './DecisionOrientationShell.js';
import type { DecisionOrientation } from './DecisionOrientationShell.js';
import { buildDecisionOrientation } from './decision-orientation.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';
import { buildFixtureCaseState, buildFixtureCompiledPack } from '../test/fixtures.js';

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

  it('shows no coverage row at all when there is nothing to count', () => {
    // "0 of 0 covered" is not a smaller truth than a real ratio, it is
    // noise -- and a progress bar that can never move invites a person to
    // wonder what they did wrong. Also removes any chance of a NaN width.
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

    expect(screen.queryByTestId('orientation-progress')).toBeNull();
    expect(screen.queryByTestId('orientation-coverage')).toBeNull();
    // The answers that always exist still do.
    expect(screen.getByTestId('orientation-next-step')).toBeInTheDocument();
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

  it('is a named region a screen reader can jump to, and not a second banner', () => {
    // `WorkspaceAppBar` already owns the page's single banner landmark.
    // Adding another is both an axe violation and a worse experience: a
    // screen-reader user looking for "the banner" should find one thing.
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    expect(screen.getByRole('region', { name: /decision status/i })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
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

describe('DecisionOrientationShell: what Sift is working on', () => {
  const base = orientation();

  it('says nothing about work in flight when there is no plan', () => {
    // Most of discovery happens before Sift has anything to work on.
    // "Sift is looking into 0 things" reads as a broken product.
    render(<DecisionOrientationShell orientation={base} layout="narrow" />);
    expect(screen.queryByTestId('orientation-work-in-flight')).toBeNull();
  });

  it('says nothing when a plan exists but nothing is outstanding', () => {
    render(
      <DecisionOrientationShell
        orientation={base}
        layout="narrow"
        workInFlight={{
          plannedItems: 0,
          optionsUnderInvestigation: 0,
          unverifiableConcerns: 0,
          planVersion: 2,
        }}
      />,
    );
    expect(screen.queryByTestId('orientation-work-in-flight')).toBeNull();
  });

  it('reports outstanding work in the person`s terms', () => {
    render(
      <DecisionOrientationShell
        orientation={base}
        layout="narrow"
        workInFlight={{
          plannedItems: 6,
          optionsUnderInvestigation: 2,
          unverifiableConcerns: 0,
          planVersion: 2,
        }}
      />,
    );
    const line = screen.getByTestId('orientation-work-in-flight');
    expect(line.textContent).toContain('6 things');
    expect(line.textContent).toContain('2 options');
    // Never the engine's vocabulary.
    expect(line.textContent).not.toMatch(/item|signature|plan v/i);
  });

  it('surfaces a concern nothing can check rather than burying it', () => {
    // The one thing the person asked about that Sift has to admit it
    // cannot answer. Hiding it would be the quiet fabrication this whole
    // product is built to avoid.
    render(
      <DecisionOrientationShell
        orientation={base}
        layout="narrow"
        workInFlight={{
          plannedItems: 6,
          optionsUnderInvestigation: 2,
          unverifiableConcerns: 1,
          planVersion: 2,
        }}
      />,
    );
    const line = screen.getByTestId('orientation-unverifiable');
    expect(line.textContent).toContain('nothing Sift can check');
    expect(line.textContent).toContain('judge it yourself');
  });
});

/**
 * The shell used to spend four stacked lines plus a full-width progress bar
 * on the top of a 390-640px pane, which is most of a phone screen before a
 * single option is visible. It is now one row plus an expander, and only
 * that row is pinned (see the following describe for the second half of
 * that change).
 *
 * The tests that matter here are not the compression ones -- they are the
 * three about what compression is *not allowed* to do: hide a warning, let
 * the visible row contradict what it hid, or clip a sentence mid-thought.
 * "Not hidden" is what they assert, and it stays satisfied by a line that
 * scrolls.
 */
describe('DecisionOrientationShell: one row, detail behind an expander', () => {
  it('carries where you are, how far along, and what is next without opening anything', () => {
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    expect(screen.getByTestId('orientation-phase')).toBeVisible();
    expect(screen.getByTestId('orientation-coverage')).toBeVisible();
    expect(screen.getByTestId('orientation-next-step')).toBeVisible();
  });

  it('keeps the secondary lines in the document but out of sight until asked', () => {
    // Out of sight, not out of the DOM: these testids are read by the e2e
    // and journey suites, and an element that vanishes when collapsed would
    // turn a layout change into a silent contract change.
    render(
      <DecisionOrientationShell
        orientation={orientation()}
        layout="narrow"
        workInFlight={{
          plannedItems: 6,
          optionsUnderInvestigation: 2,
          unverifiableConcerns: 0,
          planVersion: 2,
        }}
      />,
    );

    for (const testId of [
      'orientation-route',
      'orientation-focus',
      'orientation-latest-change',
      'orientation-work-in-flight',
    ]) {
      expect(screen.getByTestId(testId), testId).toBeInTheDocument();
      expect(screen.getByTestId(testId), testId).not.toBeVisible();
    }
  });

  it('never collapses the line that says the answer is provisional', () => {
    // A warning that only appears once someone opens a disclosure is a
    // warning the product has decided not to give.
    render(
      <DecisionOrientationShell orientation={orientation({ provisional: true })} layout="narrow" />,
    );

    expect(screen.getByTestId('orientation-provisional')).toBeVisible();
  });

  it('never collapses a concern nothing can check', () => {
    render(
      <DecisionOrientationShell
        orientation={orientation()}
        layout="narrow"
        workInFlight={{
          plannedItems: 6,
          optionsUnderInvestigation: 2,
          unverifiableConcerns: 1,
          planVersion: 2,
        }}
      />,
    );

    expect(screen.getByTestId('orientation-unverifiable')).toBeVisible();
  });

  it('opens and closes from a real button that reports its own state', async () => {
    const user = userEvent.setup();
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    const toggle = screen.getByTestId('orientation-details-toggle');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', screen.getByTestId('orientation-details').id);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('orientation-route')).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('orientation-route')).not.toBeVisible();
  });

  it('opens from the keyboard alone', async () => {
    const user = userEvent.setup();
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    const toggle = screen.getByTestId('orientation-details-toggle');
    toggle.focus();
    await user.keyboard('{Enter}');

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('remembers nothing: every fresh render starts closed', async () => {
    // Deliberate. A remembered disclosure means two people looking at the
    // same case see different panes, and a screenshot of one of them is no
    // longer evidence of what the product shows.
    const user = userEvent.setup();
    const first = render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);
    await user.click(screen.getByTestId('orientation-details-toggle'));
    expect(screen.getByTestId('orientation-details-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    first.unmount();

    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);
    expect(screen.getByTestId('orientation-details-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('renders no expander when there is nothing behind it', () => {
    // An empty disclosure is a control that lies about having something.
    render(
      <DecisionOrientationShell
        orientation={orientation({
          currentFocus: null,
          latestChange: null,
          routeToOutcome: '',
        })}
        layout="narrow"
      />,
    );

    expect(screen.queryByTestId('orientation-details-toggle')).toBeNull();
    // The row itself is untouched by that.
    expect(screen.getByTestId('orientation-phase')).toBeVisible();
    expect(screen.getByTestId('orientation-next-step')).toBeVisible();
  });

  it('has no accessibility violations with the detail open', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DecisionOrientationShell orientation={orientation()} layout="narrow" />,
    );
    await user.click(screen.getByTestId('orientation-details-toggle'));

    expect(await axe(container)).toHaveNoViolations();
  });
});

/**
 * Pinned and visible are two different properties, and the shell used to
 * treat them as one.
 *
 * The two warning lines above must never be collapsed, truncated, or put
 * behind a control -- that rule is unchanged and the tests for it stand.
 * What they never required is that they occupy the top of the viewport for
 * the entire session. Measured at 390px on an 844px pane, they made the
 * pinned box 133.56px collapsed and 183.94px open; the row alone is 72px.
 *
 * So these tests describe the split: the row is what sticks, and everything
 * else the shell says renders unconditionally in normal flow directly
 * beneath it. Every test here would fail if a future change "saved space"
 * by hiding one of those lines instead of unpinning it.
 */
describe('DecisionOrientationShell: what is pinned, and what merely stays visible', () => {
  const qualified = orientation({ provisional: true });
  const flight = {
    plannedItems: 6,
    optionsUnderInvestigation: 2,
    unverifiableConcerns: 1,
    planVersion: 2,
  };

  function renderQualified(): void {
    render(
      <DecisionOrientationShell orientation={qualified} layout="narrow" workInFlight={flight} />,
    );
  }

  it('pins the row, the expander, and nothing else', () => {
    // `decision-orientation-shell` is the sticky box, and `App.tsx` measures
    // exactly this element to size `case-workspace-scroll`'s
    // `scroll-padding-top`. Anything inside it is chrome a person pays for
    // on every screen of the case.
    renderQualified();

    const pinned = screen.getByTestId('decision-orientation-shell');
    expect(pinned).toContainElement(screen.getByTestId('orientation-phase'));
    expect(pinned).toContainElement(screen.getByTestId('orientation-coverage'));
    expect(pinned).toContainElement(screen.getByTestId('orientation-next-step'));
    expect(pinned).toContainElement(screen.getByTestId('orientation-details-toggle'));

    for (const testId of [
      'orientation-unverifiable',
      'orientation-provisional',
      'orientation-details',
    ]) {
      expect(pinned, testId).not.toContainElement(screen.getByTestId(testId));
    }
  });

  it('still shows both qualifications with nothing opened, and adds no control in front of them', () => {
    // The whole point of the move: unpinning is not burying. Both lines are
    // on screen for a person who has pressed nothing, and the only
    // disclosure control in the shell is still the one on the row.
    renderQualified();

    expect(screen.getByTestId('orientation-unverifiable')).toBeVisible();
    expect(screen.getByTestId('orientation-provisional')).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button')).toBe(screen.getByTestId('orientation-details-toggle'));
  });

  it('says the same words, in the same order, immediately after the row', () => {
    // Reading order is the thing that has to survive: row, then the concern
    // nothing can check, then the qualification on the result, then the
    // detail. A screen reader walking the pane meets them where it did.
    renderQualified();

    const order = [
      'decision-orientation-shell',
      'orientation-unverifiable',
      'orientation-provisional',
      'orientation-details',
    ].map((testId) => screen.getByTestId(testId));

    for (let index = 1; index < order.length; index += 1) {
      const previous = order[index - 1];
      const next = order[index];
      expect(previous, `${String(index)} follows`).toBeDefined();
      expect(next, `${String(index)} follows`).toBeDefined();
      expect(
        (previous?.compareDocumentPosition(next as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
        `element ${String(index)} must follow element ${String(index - 1)} in reading order`,
      ).toBeTruthy();
    }

    expect(screen.getByTestId('orientation-unverifiable').textContent).toContain(
      'nothing Sift can check',
    );
    expect(screen.getByTestId('orientation-provisional').textContent).not.toBe('');
  });

  it('does not grow the pinned box when the disclosure opens', async () => {
    // The reason `scroll-padding-top` is now stable across the disclosure:
    // the detail region the toggle controls lives outside the sticky
    // element, so opening it moves content, not chrome.
    const user = userEvent.setup();
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    const pinned = screen.getByTestId('decision-orientation-shell');
    const details = screen.getByTestId('orientation-details');
    expect(pinned).not.toContainElement(details);

    await user.click(screen.getByTestId('orientation-details-toggle'));

    expect(screen.getByTestId('orientation-details-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('orientation-route')).toBeVisible();
    expect(pinned).not.toContainElement(screen.getByTestId('orientation-details'));
  });

  it('costs no empty box when it has nothing to say', () => {
    // It is a flex item in `case-workspace-scroll`'s 16px-gap column, so an
    // empty-but-rendered block would spend 32px of scroll space on nothing.
    // Hidden, not unmounted: the testids inside are read through
    // `textContent` by the journey suites.
    render(<DecisionOrientationShell orientation={orientation()} layout="narrow" />);

    const body = screen.getByTestId('orientation-body');
    expect(body).toBeInTheDocument();
    expect(body).not.toBeVisible();
    expect(screen.getByTestId('orientation-route')).toBeInTheDocument();
  });

  it('renders that block the moment there is a qualification to carry', () => {
    renderQualified();

    const body = screen.getByTestId('orientation-body');
    expect(body).toBeVisible();
    expect(body).toContainElement(screen.getByTestId('orientation-provisional'));
    expect(body).toContainElement(screen.getByTestId('orientation-unverifiable'));
  });

  it('has no accessibility violations with both qualifications on screen', async () => {
    const { container } = render(
      <DecisionOrientationShell orientation={qualified} layout="narrow" workInFlight={flight} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('fits the narrow pane with the qualifications unpinned', () => {
    for (const width of [390, 430, 480]) {
      const { renderResult, overflowRisks } = renderAtNarrowWidth(
        <DecisionOrientationShell orientation={qualified} layout="narrow" workInFlight={flight} />,
        width,
      );
      expect(overflowRisks, `overflow at ${String(width)}px`).toEqual([]);
      renderResult.unmount();
    }
  });
});

/**
 * The one state where the shell renders the whole pipeline rather than a
 * hand-written `DecisionOrientation`.
 *
 * The defect this describes was invisible to every test in this file and to
 * every test beside `decision-orientation.ts`, because neither half was
 * wrong on its own: the derivation returned true counts, and the shell
 * printed the counts it was given. It was only visible where they met, in a
 * release screenshot -- "Decided · 0 of 5 covered · Next: Review what was
 * decided". So this builds the orientation from real case state.
 */
describe('DecisionOrientationShell: a decided case is settled, not in progress', () => {
  const PACK: CompiledDecisionPack = buildFixtureCompiledPack({
    discovery: {
      topics: [
        {
          id: 'vehicle.budget',
          label: 'Budget',
          question: 'What is your budget?',
          necessity: 'required',
          priority: 90,
          allowedInteractions: ['free_text'],
          optionSeeds: [],
          escapeHatches: {
            allowCustom: true,
            allowNone: false,
            allowUnsure: true,
            allowDefer: false,
          },
          mapsToAttributeIds: [],
          mapsToCriterionIds: [],
          confirmationRequired: true,
        },
      ],
      blindSpots: [],
    },
  });

  /** Discovery genuinely under way, and then closed with it unfinished. */
  function decidedCase(): CaseState {
    return {
      ...buildFixtureCaseState(),
      status: 'decided',
      discovery: {
        mode: 'companion',
        topics: [],
        blindSpotReview: { status: 'pending', offeredPromptIds: [], selectedPromptIds: [] },
        dispositions: [],
        pendingInteraction: null,
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
    };
  }

  it('renders no discovery progress counter beside a closed decision', () => {
    render(
      <DecisionOrientationShell
        orientation={buildDecisionOrientation(decidedCase(), PACK)}
        layout="narrow"
      />,
    );

    expect(screen.getByTestId('orientation-phase')).toHaveTextContent('Decided');
    expect(screen.queryByTestId('orientation-coverage')).toBeNull();
  });

  it('renders no progress bar either, for the same reason', () => {
    // The bar is the counter in graphical form. Leaving it would keep a
    // control that reads as "part of the way through" on a finished case,
    // and would keep it in the accessibility tree as a live `progressbar`.
    render(
      <DecisionOrientationShell
        orientation={buildDecisionOrientation(decidedCase(), PACK)}
        layout="narrow"
      />,
    );

    expect(screen.queryByTestId('orientation-progress')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('still answers where the person is and what is left to do', () => {
    // Suppression may not turn the shell into a dead end: the row keeps two
    // of its three clauses, and both still say something true.
    render(
      <DecisionOrientationShell
        orientation={buildDecisionOrientation(decidedCase(), PACK)}
        layout="narrow"
      />,
    );

    expect(screen.getByTestId('orientation-phase')).toBeVisible();
    expect(screen.getByTestId('orientation-next-step')).toBeVisible();
    expect(screen.getByTestId('orientation-next-step')).not.toBeEmptyDOMElement();
  });
});

describe('DecisionOrientationShell: measurable by its scroll container', () => {
  it('forwards containerRef to its own outer element', () => {
    // Not a decoration. This shell is `sticky top-0` inside
    // `case-workspace-scroll`, so its rendered height is exactly the inset
    // that container's `scroll-padding-top` has to carry -- otherwise
    // `App.tsx`'s `scrollIntoView({block: 'start'})` dock moves land their
    // target underneath it (measured at 430px before the fix: 134px of the
    // recommendation hero hidden, heading included). The height is not
    // derivable from props -- it moves with `layout` and with how many lines
    // the summary row wraps to -- so the caller has to be able to read the
    // real box, which is what this ref is for. It must land on the sticky
    // element rather than on anything wrapping it: the block beneath the row
    // scrolls, and counting it would push every scrolled-to region down by a
    // band that never covers it.
    const ref = { current: null as HTMLElement | null };

    render(
      <DecisionOrientationShell orientation={orientation()} layout="narrow" containerRef={ref} />,
    );

    expect(ref.current).toBe(screen.getByTestId('decision-orientation-shell'));
  });

  it('renders identically with the ref omitted', () => {
    // A pure pass-through: the shell neither reads nor reacts to it, so the
    // rendered markup must not depend on whether one was supplied.
    //
    // `useId`'s output is normalised out because it is deliberately unstable
    // across renders in a single document (`_r_15_` vs `_r_16_` here) --
    // comparing it would test React's id counter, not this component.
    const withoutIds = (markup: string): string => markup.replaceAll(/_r_[0-9a-z]+_/g, '_id_');

    const { container: withRef } = render(
      <DecisionOrientationShell
        orientation={orientation()}
        layout="narrow"
        containerRef={{ current: null }}
      />,
    );
    const withRefMarkup = withoutIds(withRef.innerHTML);

    const { container: without } = render(
      <DecisionOrientationShell orientation={orientation()} layout="narrow" />,
    );

    expect(withoutIds(without.innerHTML)).toBe(withRefMarkup);
  });
});
