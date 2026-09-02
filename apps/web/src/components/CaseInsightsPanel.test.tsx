/**
 * The insights panel is the one surface that states a computed CLAIM rather
 * than a measurement, so these tests are mostly about proportion: the two
 * claims the engine actually verified by experiment must outrank the five it
 * merely observed, and an `attention` severity must not read like an `info`.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { Insight } from '@sift/core';
import { CaseInsightsPanel } from './CaseInsightsPanel.js';
import { buildWorkspaceScoreboard } from './case-scoreboard.js';
import { buildCarCaseState, buildEnergyCaseState } from '../test/scoreboard-fixtures.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const CAR_INSIGHTS = buildWorkspaceScoreboard(buildCarCaseState()).insights;
const ENERGY_INSIGHTS = buildWorkspaceScoreboard(buildEnergyCaseState()).insights;

/** The one insight kind neither fixture board produces, so the `info` list rendering is exercised for it too. */
const NON_DISCRIMINATING: Insight = {
  id: 'insight.non_discriminating',
  kind: 'non_discriminating',
  severity: 'info',
  headline: 'Driving comfort does not separate these options.',
  detail:
    'Every option scores the same here, so the weight assigned to it is not changing the order.',
  optionIds: [],
  criterionIds: ['pref.driving_comfort'],
};

describe('CaseInsightsPanel', () => {
  it('renders nothing at all when there is nothing to say', () => {
    const { container } = render(<CaseInsightsPanel insights={[]} layout="narrow" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('gives the decisive criterion the strongest treatment on the panel', () => {
    // "Ownership cost is what puts the CR-V ahead -- take it out and the
    // RAV4 comes first instead" is a verified experimental result, not a
    // narrative, and it is the single most compelling thing this product
    // computes. It leads the panel.
    render(<CaseInsightsPanel insights={CAR_INSIGHTS} layout="narrow" />);

    const decisive = screen.getByTestId('case-insight-decisive_criterion');
    expect(decisive).toHaveAttribute('data-lead', 'true');
    expect(decisive).toHaveTextContent(
      '5-year ownership cost (fuel, maintenance, depreciation, financing) is what puts 2022 Honda CR-V EX-L AWD ahead.',
    );
    expect(decisive).toHaveTextContent(
      'Take it out of the weighting and 2022 Toyota RAV4 XLE Hybrid AWD comes first instead.',
    );

    // It is stated as an experiment with a result, because that is what it
    // is -- the engine recomputed both totals without that criterion and
    // checked whether the order actually flipped.
    expect(decisive).toHaveTextContent(/re-ranking without it/i);
  });

  it('gives a contested lead the same weight as a decisive criterion', () => {
    // The two leave-one-out results are the only claims on this panel that
    // were verified rather than observed, so they share the lead treatment.
    render(<CaseInsightsPanel insights={CAR_INSIGHTS} layout="narrow" />);

    const disputed = screen.getByTestId('case-insight-disputed_evidence');
    expect(disputed).toHaveAttribute('data-lead', 'true');
    expect(disputed).toHaveAttribute('data-severity', 'attention');
    expect(disputed).toHaveTextContent(/the sources behind that disagree/i);
    expect(disputed).toHaveTextContent(/re-ranking without it/i);
  });

  it('puts both verified results above the observations, whatever order they arrived in', () => {
    render(<CaseInsightsPanel insights={CAR_INSIGHTS} layout="narrow" />);

    const order = screen
      .getAllByTestId(/^case-insight-[a-z_]+$/)
      .map((element) => element.getAttribute('data-kind'));

    // `deriveInsights` emits leader first; the panel hoists the two computed
    // claims above it without disturbing the relative order of either group.
    expect(order.slice(0, 2)).toEqual(['decisive_criterion', 'disputed_evidence']);
    expect(order).toContain('leader');
    expect(order).toContain('coverage_gap');
  });

  it('renders attention and info severities distinctly', () => {
    render(
      <CaseInsightsPanel insights={[...ENERGY_INSIGHTS, NON_DISCRIMINATING]} layout="narrow" />,
    );

    expect(screen.getByTestId('case-insight-constraint_violation')).toHaveAttribute(
      'data-severity',
      'attention',
    );
    expect(screen.getByTestId('case-insight-coverage_gap')).toHaveAttribute(
      'data-severity',
      'attention',
    );
    // Retargeted, not weakened. This assertion named `leader` specifically,
    // and the energy fixture's top two are close enough that the engine now
    // suppresses `leader` in favour of `close_call` -- announcing a winner
    // and a toss-up in the same panel was the contradiction that change
    // removed. The subject here is that an `info` insight renders distinctly
    // from an `attention` one, which `close_call` carries just as well.
    expect(screen.getByTestId('case-insight-close_call')).toHaveAttribute('data-severity', 'info');
    expect(screen.getByTestId('case-insight-non_discriminating')).toHaveAttribute(
      'data-severity',
      'info',
    );

    // Never colour-only: an attention item carries a word a reader can act
    // on, not just a tint.
    expect(screen.getByTestId('case-insight-constraint_violation')).toHaveTextContent(
      /needs your attention/i,
    );
  });

  it('renders every headline and detail the engine wrote, unedited', () => {
    render(<CaseInsightsPanel insights={ENERGY_INSIGHTS} layout="narrow" />);

    for (const insight of ENERGY_INSIGHTS) {
      const item = screen.getByTestId(`case-insight-${insight.kind}`);
      expect(within(item).getByTestId(`case-insight-headline-${insight.kind}`)).toHaveTextContent(
        insight.headline,
      );
      expect(within(item).getByTestId(`case-insight-detail-${insight.kind}`)).toHaveTextContent(
        insight.detail,
      );
    }
  });

  it('keeps the constraint insight`s "nothing has been removed" reassurance', () => {
    // Rule 4 lives or dies on this sentence reaching the screen intact.
    render(<CaseInsightsPanel insights={ENERGY_INSIGHTS} layout="narrow" />);

    expect(screen.getByTestId('case-insight-constraint_violation')).toHaveTextContent(
      /nothing has been removed on your behalf/i,
    );
  });

  it('caps its prose at a readable measure for the 1280px shell', () => {
    // This panel is a full-width sibling of the expanded two-column layout,
    // so at a 1440px viewport its paragraphs get the whole 1248px shell --
    // roughly 200 characters per line, about triple a readable measure.
    // `.reading-measure` is `global.css`'s own utility for exactly this,
    // added when the recommendation rationale hit the same problem, and it
    // is inert at the canonical pane width where the column is already
    // narrower than the cap. jsdom cannot measure a line box, so the class
    // is asserted directly.
    render(<CaseInsightsPanel insights={CAR_INSIGHTS} layout="expanded" />);

    for (const kind of ['decisive_criterion', 'leader', 'coverage_gap']) {
      expect(screen.getByTestId(`case-insight-detail-${kind}`).className).toContain(
        'reading-measure',
      );
      expect(screen.getByTestId(`case-insight-headline-${kind}`).className).toContain(
        'reading-measure',
      );
    }
  });

  it('renders both pack shapes at both layouts with no fixed width wider than the narrow pane', () => {
    for (const insights of [CAR_INSIGHTS, ENERGY_INSIGHTS]) {
      for (const layout of ['narrow', 'expanded'] as const) {
        const { renderResult, overflowRisks } = renderAtNarrowWidth(
          <CaseInsightsPanel insights={insights} layout={layout} />,
        );
        expect(overflowRisks).toEqual([]);
        renderResult.unmount();
      }
    }
  });

  it('has no accessibility violations in either pack', async () => {
    const car = render(<CaseInsightsPanel insights={CAR_INSIGHTS} layout="narrow" />);
    expect(await axe(car.container)).toHaveNoViolations();
    car.unmount();

    const energy = render(<CaseInsightsPanel insights={ENERGY_INSIGHTS} layout="expanded" />);
    expect(await axe(energy.container)).toHaveNoViolations();
  });
});
