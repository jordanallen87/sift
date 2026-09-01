/**
 * Behavioral tests for deriving a recommendation's numbers from the
 * deterministic scoreboard instead of asserting them.
 *
 * The single most important case here is DIVERGENCE: what the product does
 * when the model's favorite is not the option the case's own criteria put
 * first. Silently overwriting the model's pick and silently accepting it
 * are both ways of hiding a real disagreement from the person who has to
 * live with the decision.
 */
import { describe, expect, it } from 'vitest';
import type { AttributeDefinition, Criterion, EntityRecord } from '@sift/contracts';
import { deriveScoredRecommendationFields, type ScorableCase } from './recommendation-scoring.js';

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

function option(id: string, values: Record<string, number | null>): EntityRecord {
  const attributes: EntityRecord['attributes'] = {};
  for (const [definitionId, value] of Object.entries(values)) {
    attributes[definitionId] =
      value === null
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
            value: { type: 'number', value },
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

function scorableCase(overrides: Partial<ScorableCase> = {}): ScorableCase {
  return {
    attributeDefinitions: [definition('a.score'), definition('a.space')],
    caseExtensions: [],
    criteria: [
      criterion('c.score', { weight: 70, label: 'Value', appliesToAttribute: 'a.score' }),
      criterion('c.space', { weight: 30, label: 'Space', appliesToAttribute: 'a.space' }),
    ],
    entities: [
      option('winner', { 'a.score': 90, 'a.space': 90 }),
      option('runner-up', { 'a.score': 40, 'a.space': 40 }),
    ],
    ...overrides,
  };
}

describe('confidence is measured, not asserted', () => {
  it('replaces the hardcoded 0.75 with a value that moves when the evidence moves', () => {
    const complete = deriveScoredRecommendationFields(scorableCase(), 'winner');
    const partial = deriveScoredRecommendationFields(
      scorableCase({
        entities: [
          option('winner', { 'a.score': 90, 'a.space': null }),
          option('runner-up', { 'a.score': 40, 'a.space': 40 }),
        ],
      }),
      'winner',
    );

    expect(complete.confidence).toBeGreaterThan(partial.confidence);
  });

  it('never reports full confidence in an option nothing was measured on', () => {
    const blank = deriveScoredRecommendationFields(
      scorableCase({
        entities: [
          option('winner', { 'a.score': null, 'a.space': null }),
          option('runner-up', { 'a.score': 40, 'a.space': 40 }),
        ],
      }),
      'winner',
    );

    expect(blank.confidence).toBe(0);
  });

  it('is lower for a dead heat than for a decisive lead, even at identical coverage', () => {
    const decisive = deriveScoredRecommendationFields(scorableCase(), 'winner');
    const heat = deriveScoredRecommendationFields(
      scorableCase({
        entities: [
          option('winner', { 'a.score': 90, 'a.space': 90 }),
          option('runner-up', { 'a.score': 90, 'a.space': 90 }),
        ],
      }),
      'winner',
    );

    expect(heat.confidence).toBeLessThan(decisive.confidence);
    // Both fully measured, so a tie is still real knowledge, not ignorance.
    expect(heat.confidence).toBeGreaterThan(0);
  });

  it('stays within the schema-permitted 0..1 range', () => {
    const result = deriveScoredRecommendationFields(scorableCase(), 'winner');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe('when the model disagrees with the scoreboard', () => {
  const diverging = () => deriveScoredRecommendationFields(scorableCase(), 'runner-up');

  it('does not silently overwrite the model’s pick', () => {
    // The model may be accounting for something no attribute captures. Its
    // proposal survives; what changes is what is said about it.
    expect(diverging().agreesWithScoreboard).toBe(false);
  });

  it('does not silently accept it either — the disagreement is stated in plain words', () => {
    const limitations = diverging().limitations.join(' ');
    expect(limitations).toContain('WINNER');
    expect(limitations).toContain('RUNNER-UP');
  });

  it('caps confidence well below what the same evidence would earn in agreement', () => {
    const agreeing = deriveScoredRecommendationFields(scorableCase(), 'winner');
    expect(diverging().confidence).toBeLessThan(agreeing.confidence);
    expect(diverging().confidence).toBeLessThanOrEqual(0.4);
  });

  it('does not manufacture a disagreement out of a tie', () => {
    // Caught in a real run: with two options scoring identically, `leader`
    // is merely whichever the tiebreak put first, and the divergence branch
    // emitted the flatly false sentence "scoring puts X ahead (100% to
    // 100%)". Choosing among co-leaders is the judgment the model is there
    // to exercise, not a contradiction of the scoreboard.
    const tied = deriveScoredRecommendationFields(
      scorableCase({
        entities: [
          option('first-by-id', { 'a.score': 90, 'a.space': 90 }),
          option('second-by-id', { 'a.score': 90, 'a.space': 90 }),
        ],
      }),
      'second-by-id',
    );

    expect(tied.agreesWithScoreboard).toBe(true);
    expect(tied.limitations.join(' ')).not.toContain('ahead');
  });

  it('still reports something, rather than collapsing to zero confidence', () => {
    // Zero would overstate the disagreement as badly as ignoring it
    // understates it.
    expect(diverging().confidence).toBeGreaterThan(0);
  });
});

describe('facts and limitations come from the board', () => {
  it('states the score and the coverage behind it, so the confidence figure can be checked', () => {
    const facts = deriveScoredRecommendationFields(scorableCase(), 'winner').facts.join(' ');
    expect(facts).toContain('%');
    expect(facts).toContain('WINNER');
  });

  it('names what carried the recommendation and what it was weakest on', () => {
    const facts = deriveScoredRecommendationFields(
      scorableCase({
        entities: [
          option('winner', { 'a.score': 90, 'a.space': 10 }),
          option('runner-up', { 'a.score': 40, 'a.space': 90 }),
        ],
      }),
      'winner',
    ).facts.join(' ');

    expect(facts).toContain('Strongest on Value');
    expect(facts).toContain('Weakest on Space');
  });

  it('reports a materially-weighted criterion nobody established as a limitation', () => {
    const limitations = deriveScoredRecommendationFields(
      scorableCase({
        entities: [
          option('winner', { 'a.score': 90, 'a.space': null }),
          option('runner-up', { 'a.score': 40, 'a.space': null }),
        ],
      }),
      'winner',
    ).limitations.join(' ');

    expect(limitations).toContain('Space');
    expect(limitations).toContain('30%');
  });

  it('stays silent about an immaterial criterion, so limitations remain readable', () => {
    const limitations = deriveScoredRecommendationFields(
      scorableCase({
        criteria: [
          criterion('c.score', { weight: 98, label: 'Value', appliesToAttribute: 'a.score' }),
          criterion('c.space', { weight: 2, label: 'Space', appliesToAttribute: 'a.space' }),
        ],
        entities: [
          option('winner', { 'a.score': 90, 'a.space': null }),
          option('runner-up', { 'a.score': 40, 'a.space': null }),
        ],
      }),
      'winner',
    ).limitations.join(' ');

    expect(limitations).not.toContain('Space');
  });

  it('never exceeds the recommendation schema’s bounds', () => {
    const many = Array.from({ length: 80 }, (_, index) =>
      criterion(`c.${index}`, {
        weight: 1,
        label: `Criterion ${index}`,
        appliesToAttribute: `a.${index}`,
      }),
    );
    const result = deriveScoredRecommendationFields(
      scorableCase({
        attributeDefinitions: many.map((entry) => definition(entry.appliesToAttribute!)),
        criteria: many,
        entities: [option('winner', {}), option('runner-up', {})],
      }),
      'winner',
    );

    expect(result.facts.length).toBeLessThanOrEqual(50);
    expect(result.limitations.length).toBeLessThanOrEqual(50);
    for (const entry of [...result.facts, ...result.limitations]) {
      expect(entry.length).toBeLessThanOrEqual(2000);
    }
  });

  it('says so plainly when the favored option is not on the board at all', () => {
    const result = deriveScoredRecommendationFields(scorableCase(), 'not-a-real-option');
    expect(result.confidence).toBe(0);
    expect(result.limitations.join(' ')).toContain('could not be scored');
  });

  it('handles a null favored option without throwing', () => {
    const result = deriveScoredRecommendationFields(scorableCase(), null);
    expect(result.confidence).toBe(0);
  });
});

describe('when the recommendation rests on shaky ground', () => {
  function withStatus(
    entity: EntityRecord,
    definitionId: string,
    status: 'conflicted',
  ): EntityRecord {
    return {
      ...entity,
      attributes: {
        ...entity.attributes,
        [definitionId]: { ...entity.attributes[definitionId]!, status },
      },
    };
  }

  it('reduces confidence in proportion to how much of the weight is contested', () => {
    // A recommendation built partly on facts the sources disagree about is
    // a weaker claim than one built on settled evidence, and a confidence
    // figure that ignored that would not be a measurement of anything.
    const settled = deriveScoredRecommendationFields(scorableCase(), 'winner');
    const contested = deriveScoredRecommendationFields(
      scorableCase({
        entities: [
          withStatus(option('winner', { 'a.score': 90, 'a.space': 90 }), 'a.score', 'conflicted'),
          option('runner-up', { 'a.score': 40, 'a.space': 40 }),
        ],
      }),
      'winner',
    );

    expect(contested.confidence).toBeLessThan(settled.confidence);
    expect(contested.limitations.join(' ')).toContain('sources disagree with each other');
  });

  it('states a violated non-negotiable requirement rather than only ranking it last', () => {
    const violating = deriveScoredRecommendationFields(
      {
        attributeDefinitions: [
          definition('a.risk', { valueType: 'boolean', comparison: 'lower_better' }),
          definition('a.score'),
        ],
        caseExtensions: [],
        criteria: [
          criterion('c.risk', {
            kind: 'hard_constraint',
            direction: 'lower_better',
            appliesToAttribute: 'a.risk',
          }),
          criterion('c.score', { appliesToAttribute: 'a.score' }),
        ],
        entities: [
          {
            ...option('risky', { 'a.score': 90 }),
            attributes: {
              ...option('risky', { 'a.score': 90 }).attributes,
              'a.risk': {
                definitionId: 'a.risk',
                label: 'a.risk',
                value: { type: 'boolean', value: true },
                origin: 'pack',
                sourceIds: ['src-1'],
                status: 'supported',
                updatedAt: AT,
              },
            },
          },
          {
            ...option('safe', { 'a.score': 10 }),
            attributes: {
              ...option('safe', { 'a.score': 10 }).attributes,
              'a.risk': {
                definitionId: 'a.risk',
                label: 'a.risk',
                value: { type: 'boolean', value: false },
                origin: 'pack',
                sourceIds: ['src-1'],
                status: 'supported',
                updatedAt: AT,
              },
            },
          },
        ],
      },
      'risky',
    );

    expect(violating.limitations.join(' ')).toContain('non-negotiable');
    // Still recommended, still scored -- a flag, never an elimination.
    expect(violating.facts.length).toBeGreaterThan(0);
  });

  it('carries a decisive-criterion finding into the limitations, since it is a caveat about the pick', () => {
    const result = deriveScoredRecommendationFields(
      scorableCase({
        entities: [
          option('winner', { 'a.score': 90, 'a.space': 10 }),
          option('runner-up', { 'a.score': 40, 'a.space': 90 }),
        ],
      }),
      'winner',
    );

    expect(result.limitations.join(' ')).toContain('what puts');
  });
});
