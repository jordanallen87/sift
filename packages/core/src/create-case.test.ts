import { describe, expect, it } from 'vitest';
import type { CompiledDecisionPack } from '@pax/contracts';
import { instantiateCase } from './create-case.js';
import type { Clock, IdGenerator } from './ports.js';

function fixedClock(iso: string): Clock {
  return { now: () => iso };
}

function sequentialIdGenerator(): IdGenerator {
  let n = 0;
  return {
    next: (prefix = 'id') => {
      n += 1;
      return `${prefix}-${n}`;
    },
  };
}

function compiledPack(overrides: Partial<CompiledDecisionPack> = {}): CompiledDecisionPack {
  return {
    schemaVersion: '1.0',
    identity: {
      id: 'car-purchase',
      version: '1.0.0',
      name: 'Choose Our Next Car',
      description: 'Household car-purchase decision support.',
      tags: ['car'],
    },
    activation: {
      intents: ['compare shortlisted cars'],
      keywords: ['car', 'vehicle'],
      artifactKinds: [],
      entitySignals: [],
      exclusions: [],
    },
    entities: [],
    attributes: [
      {
        id: 'car.advertised_price',
        label: 'Advertised price',
        valueType: 'money',
        required: true,
        appliesTo: ['candidate'],
        evidenceExpectation: 'source',
        comparison: 'lower_better',
        sensitive: false,
      },
    ],
    criteria: {
      defaults: [
        {
          id: 'budget',
          label: 'Household budget',
          kind: 'hard_constraint',
          weight: 60,
          direction: 'lower_better',
          origin: 'pack',
          status: 'active',
        },
      ],
      allowUserDefined: true,
      protectedCriterionIds: [],
    },
    obligations: [
      {
        id: 'car.hard_constraints',
        label: 'Hard constraints',
        question: 'Which candidates satisfy the household budget and non-negotiable needs?',
        category: 'deal',
        required: true,
        priority: 10,
        requiredEvidenceLevel: 'E1',
        maxAttempts: 2,
        acceptedUncertaintyAllowed: false,
        dependsOn: [],
        preferredSkills: [],
        preferredSpecialists: [],
        completionRule: {
          minimumEvidenceLevel: 'E1',
          minimumIndependentSources: 1,
          acceptedUncertaintyAllowed: false,
        },
        origin: 'pack',
      },
    ],
    extensionPolicy: {
      allowCaseAttributes: true,
      allowCaseCriteria: true,
      allowCaseObligations: true,
      userConcernTemplateId: 'car.user_concern',
    },
    skills: [],
    specialists: [],
    orchestration: { kind: 'graph', maxSteps: 12, timeoutMs: 300_000 },
    tools: [],
    policies: [],
    presentation: {},
    evaluation: {
      scenarios: [
        { id: 'happy-path', negative: false },
        { id: 'no-evidence', negative: true },
      ],
    },
    compiledHash: 'b'.repeat(64),
    compiledAt: '2026-08-27T00:00:00.000Z',
    resolvedCapabilities: {},
    runtimeValidators: {},
    ...overrides,
  } as unknown as CompiledDecisionPack;
}

describe('instantiateCase', () => {
  it('builds a fresh case pinned to the pack, seeded from its attributes/criteria/obligations', () => {
    const clock = fixedClock('2026-08-27T00:00:00.000Z');
    const idGenerator = sequentialIdGenerator();
    const pack = compiledPack();

    const result = instantiateCase(
      pack,
      { selectedBy: 'user', reasons: ['User selected this Decision Pack'] },
      clock,
      idGenerator,
    );

    expect(result.id).toBe('case-1');
    expect(result.title).toBe('Choose Our Next Car');
    expect(result.status).toBe('draft');
    expect(result.pack).toEqual({
      id: 'car-purchase',
      version: '1.0.0',
      compiledHash: 'b'.repeat(64),
      selectedBy: 'user',
      reasons: ['User selected this Decision Pack'],
    });
    expect(result.attributeDefinitions).toEqual(pack.attributes);
    expect(result.criteria).toEqual(pack.criteria.defaults);
    expect(result.obligations).toHaveLength(1);
    expect(result.obligations[0]?.id).toBe('car.hard_constraints');
    expect(result.obligations[0]?.status).toBe('open');
    expect(result.obligations[0]?.attemptsUsed).toBe(0);
    expect(result.eventSequence).toBe(0);
    expect(result.createdAt).toBe('2026-08-27T00:00:00.000Z');
    expect(result.updatedAt).toBe('2026-08-27T00:00:00.000Z');
  });

  it('records a router-selected pack pin faithfully instead of hardcoding user/[]', () => {
    const result = instantiateCase(
      compiledPack(),
      { selectedBy: 'router', reasons: ['Deterministic and semantic signals agreed'] },
      fixedClock('2026-08-27T00:00:00.000Z'),
      sequentialIdGenerator(),
    );
    expect(result.pack.selectedBy).toBe('router');
    expect(result.pack.reasons).toEqual(['Deterministic and semantic signals agreed']);
  });

  it('a case with zero pack obligations still validates (vacuously has no required obligations)', () => {
    const pack = compiledPack({ obligations: [] });
    const result = instantiateCase(
      pack,
      { selectedBy: 'user', reasons: [] },
      fixedClock('2026-08-27T00:00:00.000Z'),
      sequentialIdGenerator(),
    );
    expect(result.obligations).toEqual([]);
  });
});
