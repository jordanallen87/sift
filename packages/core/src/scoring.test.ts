/**
 * Behavioral tests for the deterministic scoring engine.
 *
 * These tests are written first and deliberately encode the HONESTY rules
 * rather than the arithmetic. The arithmetic is easy and uninteresting; the
 * ways a scoring engine can quietly lie to someone making a real purchase
 * are neither. Each `describe` below names one such lie and pins the
 * behavior that prevents it.
 */
import { describe, expect, it } from 'vitest';
import type { AttributeDefinition, Criterion, EntityRecord } from '@sift/contracts';
import { deriveInsights, scoreCase, scoreCaseState, type CaseScoreboard } from './scoring.js';

// --- Fixture builders -------------------------------------------------
//
// Deliberately hand-built rather than imported from `@sift/packs`: a
// scoring test that fails should point at scoring, not at a pack edit.

const AT = '2026-09-01T00:00:00.000Z';

function definition(
  id: string,
  overrides: Partial<AttributeDefinition> = {},
): AttributeDefinition {
  return {
    id,
    label: id,
    valueType: 'number',
    required: false,
    appliesTo: ['candidate'],
    evidenceExpectation: 'source',
    comparison: 'higher_better',
    sensitive: false,
    ...overrides,
  };
}

function criterion(id: string, overrides: Partial<Criterion> = {}): Criterion {
  return {
    id,
    label: id,
    kind: 'preference',
    weight: 50,
    direction: 'higher_better',
    origin: 'pack',
    status: 'active',
    ...overrides,
  };
}

/**
 * `values` maps attribute id -> a raw `AttributeValue`, or `null` for an
 * explicit unknown (status `unknown`, no value), which is the state the
 * engine must never treat as a zero.
 */
function option(
  id: string,
  values: Record<string, EntityRecord['attributes'][string]['value'] | null>,
): EntityRecord {
  const attributes: EntityRecord['attributes'] = {};
  for (const [definitionId, value] of Object.entries(values)) {
    attributes[definitionId] =
      value === null || value === undefined
        ? {
            definitionId,
            label: definitionId,
            origin: 'pack',
            sourceIds: [],
            status: 'unknown',
            updatedAt: AT,
          }
        : {
            definitionId,
            label: definitionId,
            value,
            origin: 'pack',
            sourceIds: ['src-1'],
            status: 'supported',
            updatedAt: AT,
          };
  }
  return { id, kind: 'candidate', label: id.toUpperCase(), attributes, createdAt: AT, updatedAt: AT };
}

function money(amount: number, currency = 'USD') {
  return { type: 'money', amount, currency } as const;
}

function scoreOf(board: CaseScoreboard, optionId: string): number | null {
  const found = board.options.find((entry) => entry.optionId === optionId);
  if (found === undefined) throw new Error(`no scored option "${optionId}"`);
  return found.total;
}

function criterionScore(board: CaseScoreboard, optionId: string, criterionId: string) {
  const found = board.options.find((entry) => entry.optionId === optionId);
  if (found === undefined) throw new Error(`no scored option "${optionId}"`);
  const line = found.criteria.find((entry) => entry.criterionId === criterionId);
  if (line === undefined) throw new Error(`no criterion line "${criterionId}"`);
  return line;
}

// ---------------------------------------------------------------------

describe('an unknown is never a zero', () => {
  // THE defining rule of this engine. An option nobody has finished
  // researching must not be ranked last *because* nobody finished
  // researching it -- that turns "we did not look" into "it is bad", which
  // is the single most damaging thing an automated ranking can assert
  // about a real purchase. Missing data reduces CONFIDENCE (coverage),
  // never SCORE.
  const definitions = [
    definition('a.price', { valueType: 'money', comparison: 'lower_better' }),
    definition('a.mpg', { comparison: 'higher_better' }),
  ];
  const criteria = [
    criterion('c.price', { weight: 50, appliesToAttribute: 'a.price' }),
    criterion('c.mpg', { weight: 50, appliesToAttribute: 'a.mpg' }),
  ];

  it('does not lower an option’s total merely because a criterion is unresearched', () => {
    const board = scoreCase({
      options: [
        // Identical on price. `known` also has the best mpg; `partial` has
        // simply not been looked at for mpg yet.
        option('known', { 'a.price': money(30_000), 'a.mpg': { type: 'number', value: 40 } }),
        option('partial', { 'a.price': money(30_000), 'a.mpg': null }),
        option('worse', { 'a.price': money(30_000), 'a.mpg': { type: 'number', value: 20 } }),
      ],
      criteria,
      definitions,
    });

    // `partial` scored 1.0 on the only criterion it could be scored on, so
    // it must not sit below `worse`, which genuinely scored 0 on mpg.
    const partial = scoreOf(board, 'partial');
    const worse = scoreOf(board, 'worse');
    expect(partial).not.toBeNull();
    expect(worse).not.toBeNull();
    expect(partial as number).toBeGreaterThan(worse as number);
  });

  it('reports the gap as coverage instead, so the shortfall is visible rather than silent', () => {
    const board = scoreCase({
      options: [
        option('known', { 'a.price': money(30_000), 'a.mpg': { type: 'number', value: 40 } }),
        option('partial', { 'a.price': money(30_000), 'a.mpg': null }),
      ],
      criteria,
      definitions,
    });

    const known = board.options.find((entry) => entry.optionId === 'known');
    const partial = board.options.find((entry) => entry.optionId === 'partial');
    expect(known?.coverage).toBe(1);
    expect(partial?.coverage).toBe(0.5);
  });

  it('marks the unscored criterion as unknown with a stated reason, not as a score of zero', () => {
    const board = scoreCase({
      options: [
        option('known', { 'a.price': money(30_000), 'a.mpg': { type: 'number', value: 40 } }),
        option('partial', { 'a.price': money(30_000), 'a.mpg': null }),
      ],
      criteria,
      definitions,
    });

    const line = criterionScore(board, 'partial', 'c.mpg');
    expect(line.status).toBe('unknown');
    expect(line.score).toBeNull();
    expect(line.reason).not.toHaveLength(0);
  });

  it('returns a null total, not zero, for an option nothing could be scored on', () => {
    const board = scoreCase({
      options: [
        option('known', { 'a.price': money(30_000), 'a.mpg': { type: 'number', value: 40 } }),
        option('blank', { 'a.price': null, 'a.mpg': null }),
      ],
      criteria,
      definitions,
    });

    expect(scoreOf(board, 'blank')).toBeNull();
    expect(board.options.find((entry) => entry.optionId === 'blank')?.coverage).toBe(0);
  });
});

describe('direction comes from the attribute, which owns what "better" means', () => {
  // The car pack ships `pref.deal_value` with `direction: 'higher_better'`
  // pointed at `car.out_the_door_price`, whose own `comparison` is
  // `lower_better`. Nothing read `direction` before this engine existed, so
  // the contradiction was inert. Read the criterion's direction literally
  // and a 20%-weight criterion ranks the MOST EXPENSIVE car as the best
  // deal. The attribute is the authority: lower price is lower price
  // regardless of what any criterion pointed at it believes.
  const definitions = [definition('a.price', { valueType: 'money', comparison: 'lower_better' })];

  it('scores a lower_better attribute correctly even when the criterion claims higher_better', () => {
    const board = scoreCase({
      options: [
        option('cheap', { 'a.price': money(25_000) }),
        option('pricey', { 'a.price': money(45_000) }),
      ],
      criteria: [
        criterion('c.deal', { direction: 'higher_better', appliesToAttribute: 'a.price' }),
      ],
      definitions,
    });

    expect(criterionScore(board, 'cheap', 'c.deal').score).toBe(1);
    expect(criterionScore(board, 'pricey', 'c.deal').score).toBe(0);
  });

  it('states the direction it actually scored by, so the resolution is visible on the row itself', () => {
    // Not reported as an authoring defect: a criterion phrased as a benefit
    // ("deal value", more is better) over a cost measurement ("price", less
    // is better) is an ordinary modelling pattern, and the car pack ships
    // exactly it. Flagging it would make the warning channel permanent
    // noise on the hero pack. Disclosing the effective direction in the
    // row's own explanation keeps it honest without crying wolf.
    const board = scoreCase({
      options: [
        option('cheap', { 'a.price': money(25_000) }),
        option('pricey', { 'a.price': money(45_000) }),
      ],
      criteria: [
        criterion('c.deal', { direction: 'higher_better', appliesToAttribute: 'a.price' }),
      ],
      definitions,
    });

    expect(criterionScore(board, 'cheap', 'c.deal').reason).toContain('lower is better');
    expect(board.warnings).toEqual([]);
  });

  it('falls back to the criterion direction when the attribute declares no ordering', () => {
    const board = scoreCase({
      options: [
        option('low', { 'a.n': { type: 'number', value: 1 } }),
        option('high', { 'a.n': { type: 'number', value: 9 } }),
      ],
      criteria: [criterion('c.n', { direction: 'lower_better', appliesToAttribute: 'a.n' })],
      definitions: [definition('a.n', { comparison: 'none' })],
    });

    expect(criterionScore(board, 'low', 'c.n').score).toBe(1);
    expect(criterionScore(board, 'high', 'c.n').score).toBe(0);
  });
});

describe('an enum is only ordinal when a pack says so', () => {
  // `car.crash_safety_rating` declares
  // `allowedValues: ['Top Safety Pick+', 'Top Safety Pick', 'Recommended', 'Not Rated']`
  // -- BEST FIRST. Every naive ordinal scorer maps array index ascending to
  // quality ascending and would therefore rank an unrated car as the
  // safest one on the lot. Nothing in the contract declares which end of
  // `allowedValues` is "good", because `allowedValues` is a membership set.
  // So the engine refuses to guess, and packs opt in with an explicit
  // worst-to-best `orderedValues`.
  const options = [
    option('best', { 'a.rating': { type: 'enum', value: 'Top Safety Pick+' } }),
    option('worst', { 'a.rating': { type: 'enum', value: 'Not Rated' } }),
  ];
  const criteria = [criterion('c.safety', { appliesToAttribute: 'a.rating' })];

  it('refuses to score an enum that declares only allowedValues', () => {
    const board = scoreCase({
      options,
      criteria,
      definitions: [
        definition('a.rating', {
          valueType: 'enum',
          allowedValues: ['Top Safety Pick+', 'Top Safety Pick', 'Recommended', 'Not Rated'],
        }),
      ],
    });

    expect(criterionScore(board, 'best', 'c.safety').status).toBe('not_comparable');
    expect(criterionScore(board, 'best', 'c.safety').score).toBeNull();
  });

  it('scores an enum that declares an explicit worst-to-best orderedValues', () => {
    const board = scoreCase({
      options,
      criteria,
      definitions: [
        definition('a.rating', {
          valueType: 'enum',
          allowedValues: ['Top Safety Pick+', 'Top Safety Pick', 'Recommended', 'Not Rated'],
          orderedValues: ['Not Rated', 'Recommended', 'Top Safety Pick', 'Top Safety Pick+'],
        }),
      ],
    });

    expect(criterionScore(board, 'best', 'c.safety').score).toBe(1);
    expect(criterionScore(board, 'worst', 'c.safety').score).toBe(0);
  });

  it('composes orderedValues with a lower_better comparison without double-inverting', () => {
    // `orderedValues` supplies the SCALE; `comparison` supplies the
    // DIRECTION. Reading `orderedValues` as "worst first" instead — which is
    // the natural mis-reading, and one this repo made once already while
    // authoring `energy.rough_effort_level` — inverts twice against a
    // `lower_better` attribute and scores the most laborious option best.
    const board = scoreCase({
      options: [
        option('easy', { 'a.effort': { type: 'enum', value: 'low' } }),
        option('hard', { 'a.effort': { type: 'enum', value: 'high' } }),
      ],
      criteria: [criterion('c.effort', { appliesToAttribute: 'a.effort' })],
      definitions: [
        definition('a.effort', {
          valueType: 'enum',
          comparison: 'lower_better',
          orderedValues: ['low', 'medium', 'high'],
        }),
      ],
    });

    expect(criterionScore(board, 'easy', 'c.effort').score).toBe(1);
    expect(criterionScore(board, 'hard', 'c.effort').score).toBe(0);
  });

  it('treats a value absent from orderedValues as unscorable rather than worst', () => {
    const board = scoreCase({
      options: [
        option('listed', { 'a.rating': { type: 'enum', value: 'good' } }),
        option('unlisted', { 'a.rating': { type: 'enum', value: 'brand new grade' } }),
      ],
      criteria,
      definitions: [
        definition('a.rating', { valueType: 'enum', orderedValues: ['bad', 'good'] }),
      ],
    });

    const line = criterionScore(board, 'unlisted', 'c.safety');
    expect(line.score).toBeNull();
    expect(line.status).toBe('not_comparable');
  });
});

describe('a hard constraint flags, it never silently eliminates', () => {
  // product.md and CLAUDE.md: the deterministic core owns state, but the
  // HUMAN owns the decision. A constraint violation that quietly drove the
  // total to zero would remove an option from consideration through the
  // back door of a ranking, with no visible statement that it happened.
  const definitions = [
    definition('a.emergency', { valueType: 'boolean', comparison: 'lower_better' }),
    definition('a.price', { valueType: 'money', comparison: 'lower_better' }),
  ];
  const criteria = [
    criterion('c.no_emergency', {
      kind: 'hard_constraint',
      weight: 100,
      appliesToAttribute: 'a.emergency',
      direction: 'lower_better',
    }),
    criterion('c.price', { weight: 50, appliesToAttribute: 'a.price' }),
  ];

  it('names the violated constraint on the option', () => {
    const board = scoreCase({
      options: [
        option('safe', { 'a.emergency': { type: 'boolean', value: false }, 'a.price': money(30_000) }),
        option('unsafe', { 'a.emergency': { type: 'boolean', value: true }, 'a.price': money(20_000) }),
      ],
      criteria,
      definitions,
    });

    const unsafe = board.options.find((entry) => entry.optionId === 'unsafe');
    expect(unsafe?.violatedConstraintIds).toContain('c.no_emergency');
    const safe = board.options.find((entry) => entry.optionId === 'safe');
    expect(safe?.violatedConstraintIds).toHaveLength(0);
  });

  it('leaves the violating option present and scored rather than dropping it', () => {
    const board = scoreCase({
      options: [
        option('safe', { 'a.emergency': { type: 'boolean', value: false }, 'a.price': money(30_000) }),
        option('unsafe', { 'a.emergency': { type: 'boolean', value: true }, 'a.price': money(20_000) }),
      ],
      criteria,
      definitions,
    });

    expect(board.options.map((entry) => entry.optionId).sort()).toEqual(['safe', 'unsafe']);
    expect(scoreOf(board, 'unsafe')).not.toBeNull();
  });

  it('ranks a constraint-violating option below every compliant one regardless of its score', () => {
    // Not an elimination -- an ordering. `unsafe` is cheaper and would
    // otherwise outrank `safe`; a violated hard constraint is a stronger
    // statement than any preference, so it sorts last while staying fully
    // visible and fully explained.
    const board = scoreCase({
      options: [
        option('safe', { 'a.emergency': { type: 'boolean', value: false }, 'a.price': money(30_000) }),
        option('unsafe', { 'a.emergency': { type: 'boolean', value: true }, 'a.price': money(20_000) }),
      ],
      criteria,
      definitions,
    });

    expect(board.options[0]?.optionId).toBe('safe');
  });
});

describe('scores are relative to the candidate set, and say so when they separate nothing', () => {
  const definitions = [definition('a.price', { valueType: 'money', comparison: 'lower_better' })];
  const criteria = [criterion('c.price', { appliesToAttribute: 'a.price' })];

  it('marks a criterion every option ties on as tied rather than pretending it discriminates', () => {
    const board = scoreCase({
      options: [option('a', { 'a.price': money(30_000) }), option('b', { 'a.price': money(30_000) })],
      criteria,
      definitions,
    });

    expect(criterionScore(board, 'a', 'c.price').status).toBe('tied');
    expect(board.nonDiscriminatingCriterionIds).toContain('c.price');
  });

  it('still counts a tied criterion as covered, because the data is genuinely there', () => {
    const board = scoreCase({
      options: [option('a', { 'a.price': money(30_000) }), option('b', { 'a.price': money(30_000) })],
      criteria,
      definitions,
    });

    expect(board.options[0]?.coverage).toBe(1);
  });
});

describe('refusing to compare things that are not comparable', () => {
  it('refuses to rank money in mixed currencies by raw amount', () => {
    // 25,000 JPY is not cheaper than 30,000 USD, and an engine that says so
    // has invented an exchange rate it does not have.
    const board = scoreCase({
      options: [
        option('usd', { 'a.price': money(30_000, 'USD') }),
        option('jpy', { 'a.price': money(25_000, 'JPY') }),
      ],
      criteria: [criterion('c.price', { appliesToAttribute: 'a.price' })],
      definitions: [definition('a.price', { valueType: 'money', comparison: 'lower_better' })],
    });

    expect(criterionScore(board, 'usd', 'c.price').status).toBe('not_comparable');
    expect(board.warnings.some((warning) => warning.toLowerCase().includes('currenc'))).toBe(true);
  });

  it('refuses to cardinally score free text', () => {
    const board = scoreCase({
      options: [
        option('a', { 'a.notes': { type: 'text', value: 'roomy' } }),
        option('b', { 'a.notes': { type: 'text', value: 'cramped' } }),
      ],
      criteria: [criterion('c.notes', { appliesToAttribute: 'a.notes' })],
      definitions: [definition('a.notes', { valueType: 'text', comparison: 'none' })],
    });

    expect(criterionScore(board, 'a', 'c.notes').status).toBe('not_comparable');
  });

  it('treats a qualitative criterion as human judgment, not a measurement', () => {
    const board = scoreCase({
      options: [
        option('a', { 'a.n': { type: 'number', value: 1 } }),
        option('b', { 'a.n': { type: 'number', value: 9 } }),
      ],
      criteria: [criterion('c.feel', { direction: 'qualitative', appliesToAttribute: 'a.n' })],
      definitions: [definition('a.n', { comparison: 'none' })],
    });

    const line = criterionScore(board, 'a', 'c.feel');
    expect(line.status).toBe('not_comparable');
    expect(line.reason.toLowerCase()).toContain('judgment');
  });

  it('reports a criterion pointed at no attribute as not applicable, and still counts its weight against coverage', () => {
    // `pref.safety_reliability` (30% of the car pack) and
    // `pref.household_fit` (15%) are exactly this shape. Excluding their
    // weight from the coverage denominator would report 100% coverage on a
    // case where 45% of what the person said matters was never measured.
    const board = scoreCase({
      options: [
        option('a', { 'a.n': { type: 'number', value: 1 } }),
        option('b', { 'a.n': { type: 'number', value: 9 } }),
      ],
      criteria: [
        criterion('c.n', { weight: 50, appliesToAttribute: 'a.n' }),
        criterion('c.vibe', { weight: 50, question: 'Does it feel right on a test drive?' }),
      ],
      definitions: [definition('a.n')],
    });

    expect(criterionScore(board, 'a', 'c.vibe').status).toBe('not_applicable');
    expect(board.options[0]?.coverage).toBe(0.5);
  });
});

describe('composite criteria', () => {
  // A criterion may name several attributes it is composed of
  // (`pref.safety_reliability` = crash safety + driver assistance +
  // reliability). Without this the car pack's single heaviest criterion is
  // permanently unscorable.
  const definitions = [
    definition('a.crash', { valueType: 'enum', orderedValues: ['bad', 'ok', 'great'] }),
    definition('a.assist', { valueType: 'enum', orderedValues: ['bad', 'ok', 'great'] }),
  ];
  const criteria = [
    criterion('c.safety', { composedOfAttributes: ['a.crash', 'a.assist'] }),
  ];

  it('averages its parts', () => {
    const board = scoreCase({
      options: [
        option('mixed', {
          'a.crash': { type: 'enum', value: 'great' },
          'a.assist': { type: 'enum', value: 'bad' },
        }),
        option('good', {
          'a.crash': { type: 'enum', value: 'great' },
          'a.assist': { type: 'enum', value: 'great' },
        }),
        option('bad', {
          'a.crash': { type: 'enum', value: 'bad' },
          'a.assist': { type: 'enum', value: 'bad' },
        }),
      ],
      criteria,
      definitions,
    });

    expect(criterionScore(board, 'good', 'c.safety').score).toBe(1);
    expect(criterionScore(board, 'bad', 'c.safety').score).toBe(0);
    expect(criterionScore(board, 'mixed', 'c.safety').score).toBeCloseTo(0.5, 10);
  });

  it('scores from the parts it has rather than failing whole when one part is unknown', () => {
    const board = scoreCase({
      options: [
        option('partial', { 'a.crash': { type: 'enum', value: 'great' }, 'a.assist': null }),
        option('full', {
          'a.crash': { type: 'enum', value: 'bad' },
          'a.assist': { type: 'enum', value: 'bad' },
        }),
      ],
      criteria,
      definitions,
    });

    const line = criterionScore(board, 'partial', 'c.safety');
    expect(line.score).toBe(1);
    expect(line.status).toBe('scored');
    // The partial basis must still be stated -- one of two measurements is
    // a weaker claim than two of two, and the reader is entitled to know.
    expect(line.reason).toContain('1 of 2');
  });
});

describe('ranking is total, deterministic, and stable', () => {
  const definitions = [definition('a.n')];
  const criteria = [criterion('c.n', { appliesToAttribute: 'a.n' })];

  it('produces the identical ordering for the identical input, regardless of input order', () => {
    const a = option('a', { 'a.n': { type: 'number', value: 5 } });
    const b = option('b', { 'a.n': { type: 'number', value: 5 } });
    const c = option('c', { 'a.n': { type: 'number', value: 9 } });

    const forward = scoreCase({ options: [a, b, c], criteria, definitions });
    const reversed = scoreCase({ options: [c, b, a], criteria, definitions });

    expect(forward.options.map((entry) => entry.optionId)).toEqual(
      reversed.options.map((entry) => entry.optionId),
    );
  });

  it('breaks a score tie by coverage before falling back to id', () => {
    const board = scoreCase({
      options: [
        option('thin', { 'a.n': { type: 'number', value: 9 }, 'a.m': null }),
        option('thick', { 'a.n': { type: 'number', value: 9 }, 'a.m': { type: 'number', value: 9 } }),
      ],
      criteria: [
        criterion('c.n', { appliesToAttribute: 'a.n' }),
        criterion('c.m', { appliesToAttribute: 'a.m' }),
      ],
      definitions: [definition('a.n'), definition('a.m')],
    });

    expect(board.options[0]?.optionId).toBe('thick');
  });

  it('sorts an entirely unscorable option last without crashing', () => {
    const board = scoreCase({
      options: [option('none', { 'a.n': null }), option('some', { 'a.n': { type: 'number', value: 1 } })],
      criteria,
      definitions,
    });

    expect(board.options[board.options.length - 1]?.optionId).toBe('none');
  });

  it('returns an empty board rather than throwing when there are no options', () => {
    const board = scoreCase({ options: [], criteria, definitions });
    expect(board.options).toEqual([]);
  });

  it('ignores excluded criteria entirely', () => {
    const board = scoreCase({
      options: [
        option('a', { 'a.n': { type: 'number', value: 1 } }),
        option('b', { 'a.n': { type: 'number', value: 9 } }),
      ],
      criteria: [criterion('c.n', { appliesToAttribute: 'a.n', status: 'excluded' })],
      definitions,
    });

    expect(board.options[0]?.criteria).toHaveLength(0);
    expect(board.options[0]?.total).toBeNull();
  });
});

describe('weights actually move the ranking (the what-if the workspace depends on)', () => {
  const definitions = [
    definition('a.price', { valueType: 'money', comparison: 'lower_better' }),
    definition('a.space', { comparison: 'higher_better' }),
  ];
  const options = [
    option('cheap_small', { 'a.price': money(20_000), 'a.space': { type: 'number', value: 10 } }),
    option('costly_big', { 'a.price': money(40_000), 'a.space': { type: 'number', value: 90 } }),
  ];

  it('reorders when the person changes what matters, with no model involved', () => {
    const priceFirst = scoreCase({
      options,
      definitions,
      criteria: [
        criterion('c.price', { weight: 90, appliesToAttribute: 'a.price' }),
        criterion('c.space', { weight: 10, appliesToAttribute: 'a.space' }),
      ],
    });
    const spaceFirst = scoreCase({
      options,
      definitions,
      criteria: [
        criterion('c.price', { weight: 10, appliesToAttribute: 'a.price' }),
        criterion('c.space', { weight: 90, appliesToAttribute: 'a.space' }),
      ],
    });

    expect(priceFirst.options[0]?.optionId).toBe('cheap_small');
    expect(spaceFirst.options[0]?.optionId).toBe('costly_big');
  });
});

// --- Insights ---------------------------------------------------------

describe('insights are derived, never asserted', () => {
  const definitions = [
    definition('a.price', { valueType: 'money', comparison: 'lower_better' }),
    definition('a.space', { comparison: 'higher_better' }),
  ];

  // Deliberately shaped so the leader wins on price while LOSING on space:
  // that is the only shape in which a single criterion can be decisive, and
  // a fixture where the leader wins on everything would let a broken
  // `decisive_criterion` implementation pass by never being exercised.
  function board(): CaseScoreboard {
    return scoreCase({
      options: [
        option('rav4', { 'a.price': money(30_000), 'a.space': { type: 'number', value: 60 } }),
        option('crv', { 'a.price': money(34_000), 'a.space': { type: 'number', value: 90 } }),
        option('forester', { 'a.price': money(41_000), 'a.space': { type: 'number', value: 40 } }),
      ],
      definitions,
      criteria: [
        criterion('c.price', { weight: 70, appliesToAttribute: 'a.price' }),
        criterion('c.space', { weight: 30, appliesToAttribute: 'a.space' }),
      ],
    });
  }

  it('names the leader and the option it leads', () => {
    const insights = deriveInsights(board());
    const leader = insights.find((insight) => insight.kind === 'leader');
    expect(leader?.optionIds[0]).toBe('rav4');
  });

  it('identifies the criterion that, alone, decides the top two', () => {
    // The demo beat this exists for: "price alone is what puts the RAV4
    // ahead -- drop it and the CR-V wins." Computed by re-scoring without
    // each criterion and checking whether the top two swap. Not a
    // narrative, an experiment.
    const insights = deriveInsights(board());
    const decisive = insights.find((insight) => insight.kind === 'decisive_criterion');
    expect(decisive).toBeDefined();
    expect(decisive?.criterionIds).toEqual(['c.price']);
  });

  it('does not claim a decisive criterion when no single criterion flips the order', () => {
    const unanimous = scoreCase({
      options: [
        option('best', { 'a.price': money(20_000), 'a.space': { type: 'number', value: 90 } }),
        option('worst', { 'a.price': money(50_000), 'a.space': { type: 'number', value: 10 } }),
      ],
      definitions,
      criteria: [
        criterion('c.price', { weight: 50, appliesToAttribute: 'a.price' }),
        criterion('c.space', { weight: 50, appliesToAttribute: 'a.space' }),
      ],
    });

    const insights = deriveInsights(unanimous);
    expect(insights.some((insight) => insight.kind === 'decisive_criterion')).toBe(false);
  });

  it('raises a coverage gap when a meaningful share of what matters is unmeasured', () => {
    const thin = scoreCase({
      options: [
        option('a', { 'a.price': money(30_000), 'a.space': null }),
        option('b', { 'a.price': money(31_000), 'a.space': null }),
      ],
      definitions,
      criteria: [
        criterion('c.price', { weight: 50, appliesToAttribute: 'a.price' }),
        criterion('c.space', { weight: 50, appliesToAttribute: 'a.space' }),
      ],
    });

    const gap = deriveInsights(thin).find((insight) => insight.kind === 'coverage_gap');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('attention');
  });

  it('raises a constraint violation as attention, naming the option and the constraint', () => {
    const violating = scoreCase({
      options: [
        option('ok', { 'a.risk': { type: 'boolean', value: false } }),
        option('risky', { 'a.risk': { type: 'boolean', value: true } }),
      ],
      definitions: [definition('a.risk', { valueType: 'boolean', comparison: 'lower_better' })],
      criteria: [
        criterion('c.risk', { kind: 'hard_constraint', appliesToAttribute: 'a.risk' }),
      ],
    });

    const insight = deriveInsights(violating).find(
      (entry) => entry.kind === 'constraint_violation',
    );
    expect(insight?.severity).toBe('attention');
    expect(insight?.optionIds).toContain('risky');
    expect(insight?.criterionIds).toContain('c.risk');
  });

  it('is deterministic and stably ordered', () => {
    const first = deriveInsights(board());
    const second = deriveInsights(board());
    expect(first).toEqual(second);
  });

  it('never claims a leader when nothing could be scored', () => {
    const blank = scoreCase({
      options: [option('a', { 'a.price': null }), option('b', { 'a.price': null })],
      definitions,
      criteria: [criterion('c.price', { appliesToAttribute: 'a.price' })],
    });

    const insights = deriveInsights(blank);
    expect(insights.some((insight) => insight.kind === 'leader')).toBe(false);
  });

  it('produces no leader insight for a single option, because leading a field of one says nothing', () => {
    const lonely = scoreCase({
      options: [option('only', { 'a.price': money(30_000) })],
      definitions,
      criteria: [criterion('c.price', { appliesToAttribute: 'a.price' })],
    });

    expect(deriveInsights(lonely).some((insight) => insight.kind === 'leader')).toBe(false);
  });
});

describe('scoreCaseState (the form both the agent and the workspace call)', () => {
  const base = {
    attributeDefinitions: [definition('a.price', { valueType: 'money', comparison: 'lower_better' })],
    criteria: [criterion('c.price', { appliesToAttribute: 'a.price' })],
  };

  it('ranks only the entities the active criteria can actually speak to', () => {
    // An energy case holds the BILL as well as the response options.
    // Scoring the bill would put a nonsense zero-coverage row on the board
    // and, worse, would let it appear in a "what is still unknown" insight
    // about options nobody was ever asked to choose between.
    const board = scoreCaseState({
      ...base,
      caseExtensions: [],
      entities: [
        option('opt-a', { 'a.price': money(30_000) }),
        { ...option('the-bill', {}), kind: 'bill' },
      ],
    });

    expect(board.options.map((entry) => entry.optionId)).toEqual(['opt-a']);
  });

  it('scores a confirmed case extension, so a model-defined column genuinely counts', () => {
    const board = scoreCaseState({
      attributeDefinitions: [],
      criteria: [criterion('c.custom', { appliesToAttribute: 'custom.crate_fit' })],
      caseExtensions: [
        {
          definition: {
            ...definition('custom.crate_fit', { comparison: 'higher_better' }),
            confirmation: 'confirmed',
          },
        },
      ],
      entities: [
        option('a', { 'custom.crate_fit': { type: 'number', value: 9 } }),
        option('b', { 'custom.crate_fit': { type: 'number', value: 1 } }),
      ],
    });

    expect(board.options[0]?.optionId).toBe('a');
    expect(criterionScore(board, 'a', 'c.custom').score).toBe(1);
  });

  it('does not let a rejected extension keep influencing the ranking from the grave', () => {
    const board = scoreCaseState({
      attributeDefinitions: [],
      criteria: [criterion('c.custom', { appliesToAttribute: 'custom.crate_fit' })],
      caseExtensions: [
        {
          definition: {
            ...definition('custom.crate_fit', { comparison: 'higher_better' }),
            confirmation: 'rejected',
          },
        },
      ],
      entities: [
        option('a', { 'custom.crate_fit': { type: 'number', value: 9 } }),
        option('b', { 'custom.crate_fit': { type: 'number', value: 1 } }),
      ],
    });

    // No definition survives, so no entity kind is scorable and the board is
    // empty -- the rejected column is gone rather than quietly still ranking.
    expect(board.options).toEqual([]);
  });
});
