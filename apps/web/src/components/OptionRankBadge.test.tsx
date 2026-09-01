/**
 * Every test here is named after a lie the card would tell without it. The
 * ranking is the most quietly persuasive thing this product puts on screen
 * -- a number beside a name reads as settled -- so the tests are about what
 * the badge REFUSES to say, not about its layout.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { OptionRankBadge } from './OptionRankBadge.js';
import { buildWorkspaceScoreboard, selectOptionRanking } from './case-scoreboard.js';
import { buildCarCaseState, buildEnergyCaseState } from '../test/scoreboard-fixtures.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const CAR_BOARD = buildWorkspaceScoreboard(buildCarCaseState());
const ENERGY_BOARD = buildWorkspaceScoreboard(buildEnergyCaseState());

function rankingFor(board: typeof CAR_BOARD, optionId: string) {
  const ranking = selectOptionRanking(board, optionId);
  if (ranking === null) throw new Error(`fixture has no ranking for ${optionId}`);
  return ranking;
}

describe('OptionRankBadge', () => {
  it('renders nothing at all for a null ranking', () => {
    const { container } = render(<OptionRankBadge optionId="candidate-rav4" ranking={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the position out of the RANKED count, not the option count', () => {
    // Four cars are on the board; only three of them carry a total.
    expect(CAR_BOARD.board.options).toHaveLength(4);

    render(
      <OptionRankBadge
        optionId="candidate-rav4"
        ranking={rankingFor(CAR_BOARD, 'candidate-rav4')}
      />,
    );

    expect(screen.getByTestId('option-rank-position-candidate-rav4')).toHaveTextContent('#2 of 3');
  });

  it('never shows a score without the coverage it rests on', () => {
    // The Forester scores 40% on half the weighting; the CR-V scores 75% on
    // all of it. A card showing only the first number of each pair would
    // present two claims of very different strength as the same kind of
    // fact.
    render(
      <>
        <OptionRankBadge
          optionId="candidate-forester"
          ranking={rankingFor(CAR_BOARD, 'candidate-forester')}
        />
        <OptionRankBadge
          optionId="candidate-crv"
          ranking={rankingFor(CAR_BOARD, 'candidate-crv')}
        />
      </>,
    );

    expect(screen.getByTestId('option-rank-score-candidate-forester')).toHaveTextContent('40%');
    expect(screen.getByTestId('option-rank-coverage-candidate-forester')).toHaveTextContent(
      'on 50% of what you said matters',
    );

    expect(screen.getByTestId('option-rank-score-candidate-crv')).toHaveTextContent('75%');
    expect(screen.getByTestId('option-rank-coverage-candidate-crv')).toHaveTextContent(
      'on everything you said matters',
    );
  });

  it('keeps the coverage figure when the meter is dropped at compact density', () => {
    // The bar is decoration that reinforces the sentence. Dropping it for a
    // 220px board column may cost the reinforcement; it may never cost the
    // number.
    render(
      <OptionRankBadge
        optionId="candidate-forester"
        ranking={rankingFor(CAR_BOARD, 'candidate-forester')}
        density="compact"
      />,
    );

    expect(screen.queryByTestId('option-rank-meter-candidate-forester')).toBeNull();
    expect(screen.getByTestId('option-rank-coverage-candidate-forester')).toHaveTextContent(
      'on 50% of what you said matters',
    );
    expect(screen.getByTestId('option-rank-score-candidate-forester')).toHaveTextContent('40%');
  });

  it('renders an unmeasured option as unranked, and says outright that it is not last', () => {
    render(
      <OptionRankBadge
        optionId="candidate-outback"
        ranking={rankingFor(CAR_BOARD, 'candidate-outback')}
      />,
    );

    // No position, no score, no coverage percentage: none of the three is a
    // claim anything supports.
    expect(screen.queryByTestId('option-rank-position-candidate-outback')).toBeNull();
    expect(screen.queryByTestId('option-rank-score-candidate-outback')).toBeNull();
    expect(screen.queryByTestId('option-rank-coverage-candidate-outback')).toBeNull();

    const unranked = screen.getByTestId('option-rank-unranked-candidate-outback');
    expect(unranked).toHaveTextContent('Not ranked');
    expect(unranked).toHaveTextContent(/not last/i);
  });

  it('never prints a position for an unranked option even when it sorts above a ranked one', () => {
    // The energy board puts the billing cycle (no total) ABOVE the audit
    // option (ranked 4th, because it trips a constraint). Anything that
    // derived a position from board order would print "#4" here.
    render(
      <OptionRankBadge
        optionId="billing-cycle-2026-07"
        ranking={rankingFor(ENERGY_BOARD, 'billing-cycle-2026-07')}
      />,
    );

    expect(screen.queryByTestId('option-rank-position-billing-cycle-2026-07')).toBeNull();
    expect(screen.getByTestId('option-rank-unranked-billing-cycle-2026-07')).toBeInTheDocument();
  });

  it('flags a violated hard constraint by name while still showing the rank and score', () => {
    const ranking = rankingFor(ENERGY_BOARD, 'option-audit');
    expect(ranking.score.violatedConstraintIds).toEqual(['custom.no_consequential_action']);

    render(<OptionRankBadge optionId="option-audit" ranking={ranking} />);

    // Rule 4: flagged, not eliminated. It keeps its position and its score.
    expect(screen.getByTestId('option-rank-position-option-audit')).toHaveTextContent('#4 of 4');
    expect(screen.getByTestId('option-rank-score-option-audit')).toBeInTheDocument();

    const flag = screen.getByTestId(
      'option-rank-constraint-option-audit-custom.no_consequential_action',
    );
    expect(flag).toHaveTextContent('Nothing that needs a consequential action from us');
    expect(screen.getByTestId('option-rank-constraint-flags-option-audit')).toHaveTextContent(
      /not removed/i,
    );
  });

  it('says the leader`s score rests on a contested measurement, which coverage cannot say', () => {
    // The CR-V leads on 100% coverage. Coverage answers "how much did we
    // measure", not "is what we measured settled" -- so a full meter sits
    // happily above a score built on a figure the sources disagree about.
    const ranking = rankingFor(CAR_BOARD, 'candidate-crv');
    expect(ranking.score.coverage).toBe(1);
    expect(ranking.score.disputedCriterionIds).toContain('pref.ownership_cost');

    render(<OptionRankBadge optionId="candidate-crv" ranking={ranking} />);

    expect(screen.getByTestId('option-rank-coverage-candidate-crv')).toHaveTextContent(
      'on everything you said matters',
    );
    const disputed = screen.getByTestId('option-rank-disputed-flags-candidate-crv');
    expect(disputed).toHaveTextContent(
      '5-year ownership cost (fuel, maintenance, depreciation, financing)',
    );
    expect(disputed).toHaveTextContent(/sources behind it disagree/i);
    // Still #1, still scored: rule 6 says a disputed value still counts.
    expect(screen.getByTestId('option-rank-position-candidate-crv')).toHaveTextContent('#1 of 3');
  });

  it('flags a dispute on an option no insight will ever mention', () => {
    // `disputed_evidence` fires only when the LEADER's lead depends on the
    // contested value. This option is third on the energy board, so no
    // insight names it -- and its card must still say the measurement is
    // contested, because that is true either way.
    const ranking = rankingFor(ENERGY_BOARD, 'option-thermostat');
    expect(ranking.score.disputedCriterionIds).toEqual(['energy.cost']);
    expect(ENERGY_BOARD.insights.some((insight) => insight.kind === 'disputed_evidence')).toBe(
      false,
    );

    render(<OptionRankBadge optionId="option-thermostat" ranking={ranking} density="compact" />);

    expect(
      screen.getByTestId('option-rank-disputed-option-thermostat-energy.cost'),
    ).toHaveTextContent('Lowest immediate cost');
  });

  it('keeps a disputed measurement visually distinct from a missed requirement', () => {
    // Two different problems with two different remedies -- "resolve the
    // disagreement" and "decide whether the requirement is really hard" --
    // so they must not read as one generic warning.
    render(
      <>
        <OptionRankBadge
          optionId="candidate-crv"
          ranking={rankingFor(CAR_BOARD, 'candidate-crv')}
        />
        <OptionRankBadge
          optionId="option-audit"
          ranking={rankingFor(ENERGY_BOARD, 'option-audit')}
        />
      </>,
    );

    expect(screen.getByTestId('option-rank-disputed-flags-candidate-crv')).toHaveTextContent(
      'Disputed',
    );
    expect(screen.getByTestId('option-rank-constraint-flags-option-audit')).toHaveTextContent(
      'Misses',
    );
    expect(screen.queryByTestId('option-rank-constraint-flags-candidate-crv')).toBeNull();
    expect(screen.queryByTestId('option-rank-disputed-flags-option-audit')).toBeNull();
  });

  it('lets a long constraint label wrap rather than clip', () => {
    // The energy pack's labels run to 60+ characters and a board column is
    // 220px. This exact defect -- "Addresses the root ca…" -- has shipped
    // once already.
    render(
      <OptionRankBadge
        optionId="option-audit"
        ranking={rankingFor(ENERGY_BOARD, 'option-audit')}
        density="compact"
      />,
    );

    const label = screen.getByTestId(
      'option-rank-constraint-label-option-audit-custom.no_consequential_action',
    );
    expect(label.className).toContain('break-words');
    expect(label.className).not.toContain('truncate');
  });

  it('renders both pack shapes with no fixed width wider than the narrow pane', () => {
    for (const [board, optionId] of [
      [CAR_BOARD, 'candidate-rav4'],
      [CAR_BOARD, 'candidate-outback'],
      [ENERGY_BOARD, 'option-audit'],
      [ENERGY_BOARD, 'billing-cycle-2026-07'],
    ] as const) {
      const { renderResult, overflowRisks } = renderAtNarrowWidth(
        <OptionRankBadge optionId={optionId} ranking={rankingFor(board, optionId)} />,
      );
      expect(overflowRisks).toEqual([]);
      renderResult.unmount();
    }
  });

  it('has no accessibility violations in either pack', async () => {
    const car = render(
      <OptionRankBadge
        optionId="candidate-rav4"
        ranking={rankingFor(CAR_BOARD, 'candidate-rav4')}
      />,
    );
    expect(await axe(car.container)).toHaveNoViolations();
    car.unmount();

    const energy = render(
      <OptionRankBadge
        optionId="option-audit"
        ranking={rankingFor(ENERGY_BOARD, 'option-audit')}
      />,
    );
    expect(await axe(energy.container)).toHaveNoViolations();
  });
});
