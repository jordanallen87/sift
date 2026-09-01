/**
 * The per-criterion breakdown is where a ranking stops being an assertion
 * and becomes an argument a person can disagree with. These tests are about
 * whether the six criterion statuses stay distinguishable -- in particular
 * whether `unknown` can ever be mistaken for a zero (the misreading the
 * engine's first honesty rule exists to prevent) and whether `disputed` can
 * ever be mistaken for settled (its sixth).
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import { CRITERION_STATUS_META, OptionRankBreakdown } from './OptionRankBreakdown.js';
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

function row(optionId: string, criterionId: string) {
  return screen.getByTestId(`option-rank-criterion-${optionId}-${criterionId}`);
}

describe('OptionRankBreakdown', () => {
  it('renders nothing for a case with no ranking', () => {
    const { container } = render(<OptionRankBreakdown optionId="candidate-rav4" ranking={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every criterion, heaviest first, with its declared weight', () => {
    render(
      <OptionRankBreakdown
        optionId="candidate-rav4"
        ranking={rankingFor(CAR_BOARD, 'candidate-rav4')}
      />,
    );

    const rendered = screen
      .getAllByTestId(/^option-rank-criterion-candidate-rav4-/)
      .map((element) => element.getAttribute('data-criterion-id'));

    // The car pack's five defaults: 30 / 30 / 20 / 15 / 5.
    expect(rendered).toEqual([
      'pref.safety_reliability',
      'pref.ownership_cost',
      'pref.deal_value',
      'pref.household_fit',
      'pref.driving_comfort',
    ]);
    expect(row('candidate-rav4', 'pref.deal_value')).toHaveTextContent('20% of the weighting');
  });

  it('renders the engine`s own reason sentence verbatim, not a paraphrase', () => {
    render(
      <OptionRankBreakdown
        optionId="candidate-rav4"
        ranking={rankingFor(CAR_BOARD, 'candidate-rav4')}
      />,
    );

    const line = rankingFor(CAR_BOARD, 'candidate-rav4').score.criteria.find(
      (candidate) => candidate.criterionId === 'pref.deal_value',
    );
    expect(line?.reason).toBeTruthy();
    expect(
      screen.getByTestId('option-rank-criterion-reason-candidate-rav4-pref.deal_value'),
    ).toHaveTextContent(line!.reason);
  });

  it('discloses the effective direction the engine actually scored by', () => {
    // `pref.deal_value` declares `higher_better` over an attribute whose own
    // comparison is `lower_better`. The attribute wins, and the row says so
    // in words -- otherwise a 20%-weight criterion looks like it ranks the
    // most expensive car as the best deal.
    render(
      <OptionRankBreakdown
        optionId="candidate-rav4"
        ranking={rankingFor(CAR_BOARD, 'candidate-rav4')}
      />,
    );

    expect(
      screen.getByTestId('option-rank-criterion-reason-candidate-rav4-pref.deal_value'),
    ).toHaveTextContent('lower is better');
  });

  it('never renders a number for an unknown criterion, and says it is not counted against the option', () => {
    // The Forester has no ownership-cost figure. The engine leaves that
    // criterion out of the total; the row must not read as a zero.
    render(
      <OptionRankBreakdown
        optionId="candidate-forester"
        ranking={rankingFor(CAR_BOARD, 'candidate-forester')}
      />,
    );

    const unknownRow = row('candidate-forester', 'pref.ownership_cost');
    expect(unknownRow).toHaveAttribute('data-status', 'unknown');
    expect(unknownRow).toHaveAttribute('data-scored', 'false');

    // No score element at all -- not "0%", not a dash that could be read as
    // one.
    expect(
      screen.queryByTestId('option-rank-criterion-score-candidate-forester-pref.ownership_cost'),
    ).toBeNull();
    // Exactly one percentage on the whole row, and it is the weight. Any
    // second one would be a score for a criterion that was never scored.
    expect(unknownRow.textContent?.match(/\d+%/g)).toEqual(['30%']);

    // The weight is still stated (it is a fact about the criterion) but is
    // explicitly marked as not counted here.
    expect(unknownRow).toHaveTextContent('30% of the weighting, not counted here');
    // And the engine's own sentence, which is the clearest statement of the
    // rule anywhere in the product.
    expect(unknownRow).toHaveTextContent(/left out of the score rather than counted against it/i);
  });

  it('gives an unknown a quieter treatment than anything that reads as a problem', () => {
    render(
      <OptionRankBreakdown
        optionId="candidate-forester"
        ranking={rankingFor(CAR_BOARD, 'candidate-forester')}
      />,
    );

    const scored = row('candidate-forester', 'pref.deal_value');
    const unknown = row('candidate-forester', 'pref.ownership_cost');

    expect(
      within(scored).getByTestId('option-rank-criterion-status-candidate-forester-pref.deal_value'),
    ).toHaveTextContent('Scored');
    expect(
      within(unknown).getByTestId(
        'option-rank-criterion-status-candidate-forester-pref.ownership_cost',
      ),
    ).toHaveTextContent('Not established');
  });

  it('gives every one of the six statuses its own word', () => {
    // Colour is never the signal (design-system.md, "Never colour-only"), so
    // the words have to carry it -- and two statuses sharing a word would
    // silently merge two different situations a person would act on
    // differently. `tied` occurs on neither fixture board, so the map itself
    // is checked rather than only what today's data happens to produce.
    const labels = Object.values(CRITERION_STATUS_META).map((meta) => meta.label);
    expect(labels).toHaveLength(6);
    expect(new Set(labels).size).toBe(6);
  });

  it('renders every status the energy board actually produces, each with its own word', () => {
    // The energy pack is the only one of the two that produces
    // `not_applicable` (a criterion naming no attribute at all, and one
    // measured on an entity that is not an option) and `not_comparable` (a
    // `qualitative` direction) at all.
    render(
      <>
        <OptionRankBreakdown
          optionId="option-thermostat"
          ranking={rankingFor(ENERGY_BOARD, 'option-thermostat')}
        />
        <OptionRankBreakdown
          optionId="billing-cycle-2026-07"
          ranking={rankingFor(ENERGY_BOARD, 'billing-cycle-2026-07')}
        />
      </>,
    );

    expect(row('option-thermostat', 'energy.cost')).toHaveAttribute('data-status', 'disputed');
    expect(row('option-thermostat', 'energy.conservation')).toHaveAttribute(
      'data-status',
      'not_applicable',
    );
    expect(row('option-thermostat', 'custom.no_consequential_action')).toHaveAttribute(
      'data-status',
      'scored',
    );
    expect(row('billing-cycle-2026-07', 'energy.no_emergency_risk')).toHaveAttribute(
      'data-status',
      'not_comparable',
    );

    for (const optionId of ['option-thermostat', 'billing-cycle-2026-07']) {
      const rendered = screen.getAllByTestId(
        new RegExp(`^option-rank-criterion-status-${optionId}-`),
      );
      // As many distinct words on screen as there are distinct statuses on
      // this option's rows -- no two ever collapse into one label.
      expect(new Set(rendered.map((element) => element.textContent)).size).toBe(
        new Set(rankingFor(ENERGY_BOARD, optionId).score.criteria.map((line) => line.status)).size,
      );
    }
  });

  it('shows a disputed criterion`s number and refuses to let it look settled', () => {
    // Honesty rule 6: a contested value still scores, because refusing to
    // use a value that exists is its own distortion. So this is the one
    // status where a real number sits beside something unsettled, and the
    // number must never stand alone.
    render(
      <OptionRankBreakdown
        optionId="candidate-crv"
        ranking={rankingFor(CAR_BOARD, 'candidate-crv')}
      />,
    );

    const disputedRow = row('candidate-crv', 'pref.ownership_cost');
    expect(disputedRow).toHaveAttribute('data-status', 'disputed');
    expect(disputedRow).toHaveAttribute('data-scored', 'true');

    // The number is there and counted...
    expect(
      screen.getByTestId('option-rank-criterion-score-candidate-crv-pref.ownership_cost'),
    ).toHaveTextContent('100%');
    expect(disputedRow).toHaveTextContent('30% of the weighting');
    expect(disputedRow).not.toHaveTextContent('not counted here');

    // ...and it is never presented as agreed.
    expect(
      screen.getByTestId('option-rank-criterion-status-candidate-crv-pref.ownership_cost'),
    ).toHaveTextContent('Disputed');
    expect(disputedRow).toHaveTextContent(/the sources behind this contradict each other/i);
  });

  it('marks a disputed part of a composite even when the rest of it is settled', () => {
    // Two of the three ratings behind `pref.safety_reliability` are agreed.
    // Averaging a contested one in with them and reporting the result as
    // settled is exactly how a dispute gets laundered into a ranking.
    render(
      <OptionRankBreakdown
        optionId="candidate-crv"
        ranking={rankingFor(CAR_BOARD, 'candidate-crv')}
      />,
    );

    expect(row('candidate-crv', 'pref.safety_reliability')).toHaveAttribute(
      'data-status',
      'disputed',
    );
  });

  it('keeps disputed and unknown visually and verbally apart', () => {
    // One is "we measured it and the sources disagree" (a number, counted).
    // The other is "nobody has established this" (no number, not counted).
    // Reading either as the other changes what a person would do next.
    render(
      <>
        <OptionRankBreakdown
          optionId="candidate-crv"
          ranking={rankingFor(CAR_BOARD, 'candidate-crv')}
        />
        <OptionRankBreakdown
          optionId="candidate-forester"
          ranking={rankingFor(CAR_BOARD, 'candidate-forester')}
        />
      </>,
    );

    expect(
      screen.getByTestId('option-rank-criterion-status-candidate-crv-pref.ownership_cost'),
    ).toHaveTextContent('Disputed');
    expect(
      screen.getByTestId('option-rank-criterion-status-candidate-forester-pref.ownership_cost'),
    ).toHaveTextContent('Not established');
  });

  it('labels both flavours of not_applicable with a word that is true of both', () => {
    // The engine uses one status for two situations: a criterion naming no
    // attribute at all (a genuine human-judgment concern) and a criterion
    // measured on something that is not an option. A label like "Your
    // judgment" is right for the first and false for the second, so the label
    // says only what both share and the engine's own sentence separates them.
    render(
      <>
        <OptionRankBreakdown
          optionId="option-monitor"
          ranking={rankingFor(ENERGY_BOARD, 'option-monitor')}
        />
      </>,
    );

    const judgment = row('option-monitor', 'energy.conservation');
    const offBoard = row('option-monitor', 'energy.no_emergency_risk');
    expect(judgment).toHaveAttribute('data-status', 'not_applicable');
    expect(offBoard).toHaveAttribute('data-status', 'not_applicable');

    expect(
      screen.getByTestId('option-rank-criterion-status-option-monitor-energy.conservation'),
    ).toHaveTextContent('No measurement');
    // The criterion's own question, which IS the judgment being asked for.
    expect(judgment).toHaveTextContent(/does this action address the root cause/i);
    // ...and the genuinely different reason for the other one.
    expect(offBoard).toHaveTextContent(
      /measured on something other than the options being compared/i,
    );
  });

  it('says a zero-weight criterion does not move the score, even when it scored', () => {
    // Both shipped packs carry a `hard_constraint` at weight 0. It GATES the
    // ranking (a violator sorts last) without WEIGHTING it, so a row reading
    // "Scored 100%" beside "0% of the weighting" would leave a reader unsure
    // which number to believe.
    render(
      <OptionRankBreakdown
        optionId="option-monitor"
        ranking={rankingFor(ENERGY_BOARD, 'option-monitor')}
      />,
    );

    const gate = row('option-monitor', 'custom.no_consequential_action');
    expect(gate).toHaveAttribute('data-scored', 'true');
    expect(gate).toHaveTextContent('0% of the weighting — it does not move the score');
    expect(gate).toHaveTextContent('Requirement');
  });

  it('marks a hard constraint as a requirement rather than a preference', () => {
    render(
      <OptionRankBreakdown
        optionId="option-audit"
        ranking={rankingFor(ENERGY_BOARD, 'option-audit')}
      />,
    );

    const constraintRow = row('option-audit', 'custom.no_consequential_action');
    expect(constraintRow).toHaveAttribute('data-kind', 'hard_constraint');
    expect(constraintRow).toHaveTextContent('Requirement');
    // Flagged, and still carrying its own explanation rather than a verdict.
    expect(constraintRow).toHaveTextContent(/trips a condition the case treats as disqualifying/i);
  });

  it('shows the option`s own value for a criterion that has one', () => {
    render(
      <OptionRankBreakdown
        optionId="option-thermostat"
        ranking={rankingFor(ENERGY_BOARD, 'option-thermostat')}
      />,
    );

    expect(
      screen.getByTestId('option-rank-criterion-value-option-thermostat-energy.cost'),
    ).toHaveTextContent('$180');
  });

  it('lets a long criterion label wrap rather than clip', () => {
    render(
      <OptionRankBreakdown
        optionId="option-audit"
        ranking={rankingFor(ENERGY_BOARD, 'option-audit')}
      />,
    );

    const label = screen.getByTestId(
      'option-rank-criterion-label-option-audit-energy.no_emergency_risk',
    );
    // 62 characters, in the narrowest column this component ever renders in.
    expect(label).toHaveTextContent(
      'No electrical, gas, fire, or medical-equipment emergency risk',
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
        <OptionRankBreakdown optionId={optionId} ranking={rankingFor(board, optionId)} />,
      );
      expect(overflowRisks).toEqual([]);
      renderResult.unmount();
    }
  });

  it('still explains an unranked option rather than rendering an empty section', () => {
    // Nothing was measured, so there is no rank -- but every criterion still
    // has something true to say about why not.
    render(
      <OptionRankBreakdown
        optionId="candidate-outback"
        ranking={rankingFor(CAR_BOARD, 'candidate-outback')}
      />,
    );

    expect(screen.getByTestId('option-rank-unranked-candidate-outback')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^option-rank-criterion-candidate-outback-/)).toHaveLength(5);
  });

  it('has no accessibility violations in either pack', async () => {
    const car = render(
      <OptionRankBreakdown
        optionId="candidate-rav4"
        ranking={rankingFor(CAR_BOARD, 'candidate-rav4')}
      />,
    );
    expect(await axe(car.container)).toHaveNoViolations();
    car.unmount();

    const energy = render(
      <OptionRankBreakdown
        optionId="option-audit"
        ranking={rankingFor(ENERGY_BOARD, 'option-audit')}
      />,
    );
    expect(await axe(energy.container)).toHaveNoViolations();
  });
});
