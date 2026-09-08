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

function definition(id: string, overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
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
  return {
    id,
    kind: 'candidate',
    label: id.toUpperCase(),
    attributes,
    createdAt: AT,
    updatedAt: AT,
  };
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
    expect(partial!).toBeGreaterThan(worse!);
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
      definitions: [definition('a.rating', { valueType: 'enum', orderedValues: ['bad', 'good'] })],
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
        option('safe', {
          'a.emergency': { type: 'boolean', value: false },
          'a.price': money(30_000),
        }),
        option('unsafe', {
          'a.emergency': { type: 'boolean', value: true },
          'a.price': money(20_000),
        }),
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
        option('safe', {
          'a.emergency': { type: 'boolean', value: false },
          'a.price': money(30_000),
        }),
        option('unsafe', {
          'a.emergency': { type: 'boolean', value: true },
          'a.price': money(20_000),
        }),
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
        option('safe', {
          'a.emergency': { type: 'boolean', value: false },
          'a.price': money(30_000),
        }),
        option('unsafe', {
          'a.emergency': { type: 'boolean', value: true },
          'a.price': money(20_000),
        }),
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
      options: [
        option('a', { 'a.price': money(30_000) }),
        option('b', { 'a.price': money(30_000) }),
      ],
      criteria,
      definitions,
    });

    expect(criterionScore(board, 'a', 'c.price').status).toBe('tied');
    expect(board.nonDiscriminatingCriterionIds).toContain('c.price');
  });

  it('still counts a tied criterion as covered, because the data is genuinely there', () => {
    const board = scoreCase({
      options: [
        option('a', { 'a.price': money(30_000) }),
        option('b', { 'a.price': money(30_000) }),
      ],
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
  const criteria = [criterion('c.safety', { composedOfAttributes: ['a.crash', 'a.assist'] })];

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
        option('thick', {
          'a.n': { type: 'number', value: 9 },
          'a.m': { type: 'number', value: 9 },
        }),
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
      options: [
        option('none', { 'a.n': null }),
        option('some', { 'a.n': { type: 'number', value: 1 } }),
      ],
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

  it('does not claim the person set weights they have never been asked about', () => {
    // The first screen a new person saw announced a leader "against what
    // you said matters", "measured across 95% of the weight you have
    // assigned", at 0 of 5 topics covered — while the orientation shell two
    // inches above said the opposite, honestly. Found by
    // `pnpm test:journey family-novice` (ADR 0014).
    const insights = deriveInsights(board(), { weightsAreTheirs: false });
    const leader = insights.find((insight) => insight.kind === 'leader');
    expect(leader?.headline).not.toMatch(/what you said matters/i);
    expect(leader?.detail).not.toMatch(/weight you have assigned/i);
    expect(leader?.detail).toMatch(/none of which you have set yet/i);
  });

  it('still speaks in the person’s own terms once they have told Sift something', () => {
    const insights = deriveInsights(board(), { weightsAreTheirs: true });
    const leader = insights.find((insight) => insight.kind === 'leader');
    expect(leader?.headline).toMatch(/what you said matters/i);
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
      criteria: [criterion('c.risk', { kind: 'hard_constraint', appliesToAttribute: 'a.risk' })],
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
    attributeDefinitions: [
      definition('a.price', { valueType: 'money', comparison: 'lower_better' }),
    ],
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

describe('a disputed fact is not a settled one', () => {
  // Found on the REAL car scenario, not invented for a test: the Subaru
  // Outback leads every measured criterion, and its safety-and-reliability
  // lead rests on a reliability rating whose sources contradict each other.
  // The board reported that lead as settled, which launders a dispute into
  // a ranking.
  function conflicted(id: string, value: number): EntityRecord {
    const built = option(id, { 'a.rating': { type: 'number', value } });
    return {
      ...built,
      attributes: {
        ...built.attributes,
        'a.rating': { ...built.attributes['a.rating']!, status: 'conflicted' },
      },
    };
  }

  const definitions = [
    definition('a.rating'),
    definition('a.price', { comparison: 'lower_better' }),
  ];

  it('still scores the value — refusing to use a value that exists is its own distortion', () => {
    const board = scoreCase({
      options: [conflicted('a', 9), option('b', { 'a.rating': { type: 'number', value: 1 } })],
      criteria: [criterion('c.rating', { appliesToAttribute: 'a.rating' })],
      definitions,
    });

    expect(criterionScore(board, 'a', 'c.rating').score).toBe(1);
  });

  it('marks the line disputed and says so in its own reason', () => {
    const board = scoreCase({
      options: [conflicted('a', 9), option('b', { 'a.rating': { type: 'number', value: 1 } })],
      criteria: [criterion('c.rating', { appliesToAttribute: 'a.rating' })],
      definitions,
    });

    const line = criterionScore(board, 'a', 'c.rating');
    expect(line.status).toBe('disputed');
    expect(line.reason).toContain('contradict');
    expect(board.options.find((entry) => entry.optionId === 'a')?.disputedCriterionIds).toEqual([
      'c.rating',
    ]);
  });

  it('marks a whole composite disputed when any one part is contested', () => {
    // Averaging a contested rating with two settled ones and reporting the
    // result as settled is exactly how the dispute disappears.
    const built = option('a', {
      'a.rating': { type: 'number', value: 9 },
      'a.price': { type: 'number', value: 1 },
    });
    const partiallyContested: EntityRecord = {
      ...built,
      attributes: {
        ...built.attributes,
        'a.rating': { ...built.attributes['a.rating']!, status: 'conflicted' },
      },
    };

    const board = scoreCase({
      options: [
        partiallyContested,
        option('b', {
          'a.rating': { type: 'number', value: 1 },
          'a.price': { type: 'number', value: 9 },
        }),
      ],
      criteria: [criterion('c.composite', { composedOfAttributes: ['a.rating', 'a.price'] })],
      definitions,
    });

    expect(criterionScore(board, 'a', 'c.composite').status).toBe('disputed');
  });

  it('raises an insight only when the disputed criterion is what carries the lead', () => {
    const board = scoreCase({
      options: [
        conflicted('leader', 9),
        option('other', { 'a.rating': { type: 'number', value: 1 } }),
      ],
      criteria: [criterion('c.rating', { appliesToAttribute: 'a.rating' })],
      definitions,
    });

    const insight = deriveInsights(board).find((entry) => entry.kind === 'disputed_evidence');
    expect(insight?.severity).toBe('attention');
    expect(insight?.criterionIds).toEqual(['c.rating']);
  });

  it('stays quiet when the dispute is real but immaterial to the order', () => {
    // The leader wins on price by enough that the contested rating is not
    // what puts it ahead. Warning anyway trains people to ignore the
    // warning.
    const built = option('leader', {
      'a.rating': { type: 'number', value: 9 },
      'a.price': { type: 'number', value: 1 },
    });
    const leaderWithDispute: EntityRecord = {
      ...built,
      attributes: {
        ...built.attributes,
        'a.rating': { ...built.attributes['a.rating']!, status: 'conflicted' },
      },
    };

    const board = scoreCase({
      options: [
        leaderWithDispute,
        option('other', {
          'a.rating': { type: 'number', value: 1 },
          'a.price': { type: 'number', value: 9 },
        }),
      ],
      criteria: [
        criterion('c.rating', { weight: 5, appliesToAttribute: 'a.rating' }),
        criterion('c.price', { weight: 95, appliesToAttribute: 'a.price' }),
      ],
      definitions,
    });

    expect(deriveInsights(board).some((entry) => entry.kind === 'disputed_evidence')).toBe(false);
  });
});

describe('every value type the contracts allow', () => {
  // These are not coverage padding: each is a distinct way an option's
  // value can reach the scorer, and each has a wrong answer that looks
  // plausible (an hour ranked against a day by raw amount, a range scored
  // by its floor, a date compared as a string).
  const criteria = [criterion('c.x', { appliesToAttribute: 'a.x' })];

  it('converts durations to a common scale before ranking them', () => {
    // 90 minutes is longer than 1 hour. Compared by raw `amount`, 1 would
    // beat 90 and the faster option would lose.
    const board = scoreCase({
      options: [
        option('quick', { 'a.x': { type: 'duration', amount: 1, unit: 'hour' } }),
        option('slow', { 'a.x': { type: 'duration', amount: 90, unit: 'minute' } }),
      ],
      criteria,
      definitions: [definition('a.x', { valueType: 'duration', comparison: 'lower_better' })],
    });

    expect(criterionScore(board, 'quick', 'c.x').score).toBe(1);
    expect(criterionScore(board, 'slow', 'c.x').score).toBe(0);
  });

  it('uses a range’s midpoint, and either bound when only one is given', () => {
    const board = scoreCase({
      options: [
        option('wide', { 'a.x': { type: 'range', minimum: 0, maximum: 10 } }),
        option('high', { 'a.x': { type: 'range', minimum: 10 } }),
      ],
      criteria,
      definitions: [definition('a.x', { valueType: 'range' })],
    });

    expect(criterionScore(board, 'high', 'c.x').score).toBe(1);
    expect(criterionScore(board, 'wide', 'c.x').score).toBe(0);
  });

  it('refuses a range that declares neither bound rather than treating it as zero', () => {
    const board = scoreCase({
      options: [
        option('bounded', { 'a.x': { type: 'range', minimum: 5, maximum: 5 } }),
        option('unbounded', { 'a.x': { type: 'range' } }),
      ],
      criteria,
      definitions: [definition('a.x', { valueType: 'range' })],
    });

    expect(criterionScore(board, 'unbounded', 'c.x').score).toBeNull();
  });

  it('orders dates chronologically, not lexically', () => {
    const board = scoreCase({
      options: [
        option('newer', { 'a.x': { type: 'date', value: '2026-01-02' } }),
        option('older', { 'a.x': { type: 'date', value: '2025-12-31' } }),
      ],
      criteria,
      definitions: [definition('a.x', { valueType: 'date' })],
    });

    expect(criterionScore(board, 'newer', 'c.x').score).toBe(1);
    expect(criterionScore(board, 'older', 'c.x').score).toBe(0);
  });

  it('refuses a list of strings, which has no ordering', () => {
    const board = scoreCase({
      options: [
        option('a', { 'a.x': { type: 'string_list', values: ['one', 'two'] } }),
        option('b', { 'a.x': { type: 'string_list', values: ['one'] } }),
      ],
      criteria,
      definitions: [definition('a.x', { valueType: 'string_list' })],
    });

    expect(criterionScore(board, 'a', 'c.x').status).toBe('not_comparable');
  });

  it('refuses numbers recorded in different units, naming both', () => {
    const board = scoreCase({
      options: [
        option('inches', { 'a.x': { type: 'number', value: 40, unit: 'in' } }),
        option('centimetres', { 'a.x': { type: 'number', value: 100, unit: 'cm' } }),
      ],
      criteria,
      definitions: [definition('a.x')],
    });

    expect(criterionScore(board, 'inches', 'c.x').status).toBe('not_comparable');
    expect(board.warnings.join(' ')).toContain('cm');
  });

  it('says "no unit" rather than printing an empty pair of parentheses', () => {
    // An empty unit string is a REAL value -- what a bare number carries --
    // so the message has to name it rather than coerce it away.
    const board = scoreCase({
      options: [
        option('bare', { 'a.x': { type: 'number', value: 40 } }),
        option('united', { 'a.x': { type: 'number', value: 100, unit: 'cm' } }),
      ],
      criteria,
      definitions: [definition('a.x')],
    });

    expect(board.warnings.join(' ')).toContain('no unit');
  });
});

describe('target-shaped criteria', () => {
  it('scores closeness to the target, not magnitude', () => {
    // "About 30 miles of range" -- 60 is not twice as good as 30, it is
    // just as wrong as 0 in the other direction.
    const board = scoreCase({
      options: [
        option('on-target', { 'a.x': { type: 'number', value: 30 } }),
        option('under', { 'a.x': { type: 'number', value: 10 } }),
        option('over', { 'a.x': { type: 'number', value: 50 } }),
      ],
      criteria: [
        criterion('c.x', {
          direction: 'target',
          target: { type: 'number', value: 30 },
          appliesToAttribute: 'a.x',
        }),
      ],
      definitions: [definition('a.x', { comparison: 'target' })],
    });

    expect(criterionScore(board, 'on-target', 'c.x').score).toBe(1);
    expect(criterionScore(board, 'under', 'c.x').score).toBe(0);
    expect(criterionScore(board, 'over', 'c.x').score).toBe(0);
  });

  it('cannot score a target criterion with no target declared', () => {
    const board = scoreCase({
      options: [
        option('a', { 'a.x': { type: 'number', value: 30 } }),
        option('b', { 'a.x': { type: 'number', value: 10 } }),
      ],
      criteria: [criterion('c.x', { direction: 'target', appliesToAttribute: 'a.x' })],
      definitions: [definition('a.x', { comparison: 'target' })],
    });

    expect(criterionScore(board, 'a', 'c.x').score).toBeNull();
  });
});

describe('hard constraints with an explicit threshold', () => {
  // The absolute path (rule 4). Without a target, a boolean carries its own
  // poles; with one, the threshold is the test.
  const definitions = [definition('a.price', { valueType: 'money', comparison: 'lower_better' })];

  function boardWithBudget(limit: number) {
    return scoreCase({
      options: [
        option('under', { 'a.price': money(30_000) }),
        option('over', { 'a.price': money(45_000) }),
      ],
      criteria: [
        criterion('c.budget', {
          kind: 'hard_constraint',
          target: money(limit),
          appliesToAttribute: 'a.price',
        }),
      ],
      definitions,
    });
  }

  it('passes an option within the limit and fails one over it', () => {
    const board = boardWithBudget(35_000);
    expect(criterionScore(board, 'under', 'c.budget').constraintViolated).toBe(false);
    expect(criterionScore(board, 'over', 'c.budget').constraintViolated).toBe(true);
  });

  it('does not fail the most expensive option merely for being the maximum of the set', () => {
    // The whole reason constraints are absolute. Scored relatively, `over`
    // would violate a budget it comfortably meets, purely because someone
    // else is cheaper.
    const board = boardWithBudget(50_000);
    expect(board.options.every((entry) => entry.violatedConstraintIds.length === 0)).toBe(true);
  });

  it('reads a higher_better threshold as a minimum', () => {
    const board = scoreCase({
      options: [
        option('meets', { 'a.range': { type: 'number', value: 300 } }),
        option('short', { 'a.range': { type: 'number', value: 100 } }),
      ],
      criteria: [
        criterion('c.range', {
          kind: 'hard_constraint',
          direction: 'higher_better',
          target: { type: 'number', value: 250 },
          appliesToAttribute: 'a.range',
        }),
      ],
      definitions: [definition('a.range', { comparison: 'higher_better' })],
    });

    expect(criterionScore(board, 'short', 'c.range').reason).toContain('minimum');
    expect(criterionScore(board, 'short', 'c.range').constraintViolated).toBe(true);
    expect(criterionScore(board, 'meets', 'c.range').constraintViolated).toBe(false);
  });

  it('reads a target threshold as an exact match', () => {
    const board = scoreCase({
      options: [
        option('exact', { 'a.seats': { type: 'number', value: 7 } }),
        option('other', { 'a.seats': { type: 'number', value: 5 } }),
      ],
      criteria: [
        criterion('c.seats', {
          kind: 'hard_constraint',
          direction: 'target',
          target: { type: 'number', value: 7 },
          appliesToAttribute: 'a.seats',
        }),
      ],
      definitions: [definition('a.seats', { comparison: 'target' })],
    });

    expect(criterionScore(board, 'exact', 'c.seats').constraintViolated).toBe(false);
    expect(criterionScore(board, 'other', 'c.seats').constraintViolated).toBe(true);
  });

  it('falls back to a relative score when a constraint cannot be decided absolutely', () => {
    // No target and a non-boolean value: there is no threshold to test
    // against, so the line must not claim a violation it cannot establish.
    const board = scoreCase({
      options: [
        option('a', { 'a.price': money(30_000) }),
        option('b', { 'a.price': money(45_000) }),
      ],
      criteria: [criterion('c.budget', { kind: 'hard_constraint', appliesToAttribute: 'a.price' })],
      definitions,
    });

    expect(board.options.every((entry) => entry.violatedConstraintIds.length === 0)).toBe(true);
    expect(criterionScore(board, 'a', 'c.budget').score).toBe(1);
  });

  it('reads a higher_better boolean constraint as "must be true"', () => {
    const board = scoreCase({
      options: [
        option('has', { 'a.awd': { type: 'boolean', value: true } }),
        option('lacks', { 'a.awd': { type: 'boolean', value: false } }),
      ],
      criteria: [
        criterion('c.awd', {
          kind: 'hard_constraint',
          direction: 'higher_better',
          appliesToAttribute: 'a.awd',
        }),
      ],
      definitions: [definition('a.awd', { valueType: 'boolean', comparison: 'higher_better' })],
    });

    expect(criterionScore(board, 'lacks', 'c.awd').constraintViolated).toBe(true);
    expect(criterionScore(board, 'has', 'c.awd').constraintViolated).toBe(false);
  });
});

describe('the remaining insights', () => {
  const definitions = [definition('a.x'), definition('a.y')];

  it('calls a near-tie a toss-up rather than announcing a winner', () => {
    // Reporting "X leads" on a 1% margin is technically true and
    // practically misleading — it invites a decision the numbers do not
    // support.
    const board = scoreCase({
      options: [
        option('a', { 'a.x': { type: 'number', value: 100 }, 'a.y': { type: 'number', value: 0 } }),
        option('b', { 'a.x': { type: 'number', value: 99 }, 'a.y': { type: 'number', value: 1 } }),
      ],
      criteria: [
        criterion('c.x', { weight: 51, appliesToAttribute: 'a.x' }),
        criterion('c.y', { weight: 49, appliesToAttribute: 'a.y' }),
      ],
      definitions,
    });

    const insight = deriveInsights(board).find((entry) => entry.kind === 'close_call');
    expect(insight).toBeDefined();
    expect(insight?.optionIds).toHaveLength(2);
  });

  it('says outright when a weighted criterion is not changing the order', () => {
    // A person reading a 50%-weight row assumes it is doing work. When
    // every option scores the same on it, it is not.
    const board = scoreCase({
      options: [
        option('a', { 'a.x': { type: 'number', value: 5 }, 'a.y': { type: 'number', value: 9 } }),
        option('b', { 'a.x': { type: 'number', value: 5 }, 'a.y': { type: 'number', value: 1 } }),
      ],
      criteria: [
        criterion('c.x', { label: 'Everyone the same', appliesToAttribute: 'a.x' }),
        criterion('c.y', { appliesToAttribute: 'a.y' }),
      ],
      definitions,
    });

    const insight = deriveInsights(board).find((entry) => entry.kind === 'non_discriminating');
    expect(insight?.criterionIds).toEqual(['c.x']);
    expect(insight?.headline).toContain('Everyone the same');
  });

  it('scores a composite from its usable parts when one part cannot be ordered at all', () => {
    const board = scoreCase({
      options: [
        option('a', {
          'a.x': { type: 'number', value: 9 },
          'a.note': { type: 'text', value: 'roomy' },
        }),
        option('b', {
          'a.x': { type: 'number', value: 1 },
          'a.note': { type: 'text', value: 'cramped' },
        }),
      ],
      criteria: [criterion('c.mix', { composedOfAttributes: ['a.x', 'a.note'] })],
      definitions: [definition('a.x'), definition('a.note', { valueType: 'text' })],
    });

    const line = criterionScore(board, 'a', 'c.mix');
    expect(line.score).toBe(1);
    expect(line.reason).toContain('1 of 2');
  });
});

describe('a criterion measured on something other than the options', () => {
  it('reads as a category mismatch rather than as unresearched', () => {
    // The energy pack's safety constraint measures
    // `energy.emergency_risk_present`, declared on the BILLING CYCLE, while
    // the options being ranked are response options. Reporting that as
    // "nobody has established this yet" invites someone to go and establish
    // it; nothing can.
    const board = scoreCase({
      options: [
        option('a', { 'a.x': { type: 'number', value: 1 } }),
        option('b', { 'a.x': { type: 'number', value: 9 } }),
      ],
      criteria: [
        criterion('c.x', { appliesToAttribute: 'a.x' }),
        criterion('c.elsewhere', { appliesToAttribute: 'a.bill' }),
      ],
      definitions: [definition('a.x'), definition('a.bill', { appliesTo: ['billing_cycle'] })],
    });

    const line = criterionScore(board, 'a', 'c.elsewhere');
    expect(line.status).toBe('not_applicable');
    expect(line.reason).toContain('other than the options being compared');
  });

  it('still scores a criterion whose attribute does apply to this kind', () => {
    const board = scoreCase({
      options: [
        option('a', { 'a.x': { type: 'number', value: 1 } }),
        option('b', { 'a.x': { type: 'number', value: 9 } }),
      ],
      criteria: [criterion('c.x', { appliesToAttribute: 'a.x' })],
      definitions: [definition('a.x', { appliesTo: ['candidate', 'other'] })],
    });

    expect(criterionScore(board, 'b', 'c.x').status).toBe('scored');
  });
});

describe('coverage_gap describes only options that were actually scored', () => {
  const definitions = [definition('a.x'), definition('a.y')];
  const criteria = [
    criterion('c.x', { appliesToAttribute: 'a.x' }),
    criterion('c.y', { appliesToAttribute: 'a.y' }),
  ];

  it('does not claim an unscored option "is scored on as little as 0%"', () => {
    // Caught while rendering the board: the insight meant to warn that
    // something was under-measured was itself asserting a measurement that
    // never happened -- rule 1's own failure mode, inside rule 1's warning.
    const board = scoreCase({
      options: [
        option('measured', {
          'a.x': { type: 'number', value: 9 },
          'a.y': { type: 'number', value: 9 },
        }),
        option('untouched', { 'a.x': null, 'a.y': null }),
      ],
      criteria,
      definitions,
    });

    const gap = deriveInsights(board).find((insight) => insight.kind === 'coverage_gap');
    expect(gap?.optionIds ?? []).not.toContain('untouched');
  });

  it('still raises the gap for an option that was scored, but thinly', () => {
    const board = scoreCase({
      options: [
        option('thin', { 'a.x': { type: 'number', value: 9 }, 'a.y': null }),
        option('other', {
          'a.x': { type: 'number', value: 1 },
          'a.y': { type: 'number', value: 1 },
        }),
      ],
      criteria,
      definitions,
    });

    const gap = deriveInsights(board).find((insight) => insight.kind === 'coverage_gap');
    expect(gap?.optionIds).toContain('thin');
  });

  it('emits no coverage gap at all when the only thin option is one nothing was measured on', () => {
    const board = scoreCase({
      options: [
        option('full', {
          'a.x': { type: 'number', value: 9 },
          'a.y': { type: 'number', value: 9 },
        }),
        option('untouched', { 'a.x': null, 'a.y': null }),
      ],
      criteria,
      definitions,
    });

    expect(deriveInsights(board).some((insight) => insight.kind === 'coverage_gap')).toBe(false);
  });
});

describe('a near-tie gets one statement, not two contradictory ones', () => {
  const definitions = [definition('a.x'), definition('a.y')];

  function nearTie() {
    return scoreCase({
      options: [
        option('a', { 'a.x': { type: 'number', value: 100 }, 'a.y': { type: 'number', value: 0 } }),
        option('b', { 'a.x': { type: 'number', value: 0 }, 'a.y': { type: 'number', value: 100 } }),
      ],
      criteria: [
        criterion('c.x', { weight: 51, appliesToAttribute: 'a.x' }),
        criterion('c.y', { weight: 49, appliesToAttribute: 'a.y' }),
      ],
      definitions,
    });
  }

  it('does not announce a winner and a toss-up at the same time', () => {
    // Caught on the rendered energy board: "Switch to a different rate plan
    // scores highest ... leads Monitor for one more billing cycle by 0%"
    // sat directly above "close enough to be a genuine toss-up". Both
    // cannot be the honest summary, and a lead that rounds to zero is not
    // a lead.
    const insights = deriveInsights(nearTie());
    expect(insights.some((insight) => insight.kind === 'close_call')).toBe(true);
    expect(insights.some((insight) => insight.kind === 'leader')).toBe(false);
  });

  it('never states a separation of 0%', () => {
    const closeCall = deriveInsights(nearTie()).find((insight) => insight.kind === 'close_call');
    expect(closeCall?.detail).not.toContain('0%');
  });

  it('still names a leader when the lead is real', () => {
    const board = scoreCase({
      options: [
        option('clear', {
          'a.x': { type: 'number', value: 100 },
          'a.y': { type: 'number', value: 100 },
        }),
        option('behind', {
          'a.x': { type: 'number', value: 0 },
          'a.y': { type: 'number', value: 0 },
        }),
      ],
      criteria: [
        criterion('c.x', { appliesToAttribute: 'a.x' }),
        criterion('c.y', { appliesToAttribute: 'a.y' }),
      ],
      definitions,
    });

    const insights = deriveInsights(board);
    expect(insights.some((insight) => insight.kind === 'leader')).toBe(true);
    expect(insights.some((insight) => insight.kind === 'close_call')).toBe(false);
  });
});

describe('coverage_gap does not recite the whole field back', () => {
  it('says "every option" rather than naming all of them', () => {
    // Naming four full vehicle labels to state something true of the whole
    // case produced the longest block on a 390px pane, and a reader
    // scanning that list for the ones singled out finds there are none.
    const board = scoreCase({
      options: [
        option('a', { 'a.x': { type: 'number', value: 9 }, 'a.y': null }),
        option('b', { 'a.x': { type: 'number', value: 1 }, 'a.y': null }),
        option('c', { 'a.x': { type: 'number', value: 5 }, 'a.y': null }),
      ],
      criteria: [
        criterion('c.x', { appliesToAttribute: 'a.x' }),
        criterion('c.y', { appliesToAttribute: 'a.y' }),
      ],
      definitions: [definition('a.x'), definition('a.y')],
    });

    const gap = deriveInsights(board).find((insight) => insight.kind === 'coverage_gap');
    expect(gap?.detail).toContain('Every option is');
    expect(gap?.detail).not.toContain('A, B, C');
  });

  it('still names them when only some are affected', () => {
    const board = scoreCase({
      options: [
        option('thin', { 'a.x': { type: 'number', value: 9 }, 'a.y': null }),
        option('full', {
          'a.x': { type: 'number', value: 1 },
          'a.y': { type: 'number', value: 1 },
        }),
      ],
      criteria: [
        criterion('c.x', { appliesToAttribute: 'a.x' }),
        criterion('c.y', { appliesToAttribute: 'a.y' }),
      ],
      definitions: [definition('a.x'), definition('a.y')],
    });

    const gap = deriveInsights(board).find((insight) => insight.kind === 'coverage_gap');
    expect(gap?.detail).toContain('THIN');
  });
});
