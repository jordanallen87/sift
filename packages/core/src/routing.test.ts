import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CompiledDecisionPackSchema } from '@pax/contracts';
import type { CompiledDecisionPack, PackActivation, RoutingInput } from '@pax/contracts';
import { resolveSelectedPack, routePack } from './routing.js';
import type { SemanticRoutingCandidate } from './routing.js';
import { RoutingRejectionError } from './errors.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_GHOST = 'd'.repeat(64);

function makeActivation(overrides: Partial<PackActivation> = {}): PackActivation {
  return {
    intents: [],
    keywords: [],
    artifactKinds: [],
    entitySignals: [],
    exclusions: [],
    ...overrides,
  };
}

function makeCompiledPack(overrides: {
  id: string;
  version?: string;
  compiledHash: string;
  activation?: Partial<PackActivation>;
}): CompiledDecisionPack {
  const raw = {
    schemaVersion: '1.0',
    identity: {
      id: overrides.id,
      version: overrides.version ?? '1.0.0',
      name: overrides.id,
      description: `${overrides.id} test pack`,
      tags: [],
    },
    activation: makeActivation(overrides.activation),
    entities: [],
    attributes: [],
    criteria: { defaults: [], allowUserDefined: true, protectedCriterionIds: [] },
    obligations: [],
    extensionPolicy: {
      allowCaseAttributes: true,
      allowCaseCriteria: true,
      allowCaseObligations: true,
      userConcernTemplateId: 'user-concern',
    },
    skills: [],
    specialists: [],
    orchestration: {
      strategy: 'single_agent',
      maxSteps: 1,
      nodeTimeoutMs: 1000,
      totalTimeoutMs: 1000,
    },
    tools: [],
    policies: [],
    presentation: { optionLabel: 'Option', optionLabelPlural: 'Options', attributeGroups: [] },
    evaluation: { scenarioIds: [], requiresNegativeCase: false },
    compiledHash: overrides.compiledHash,
    compiledAt: '2026-01-01T00:00:00.000Z',
    resolvedCapabilities: { skillIds: [], specialistIds: [], toolIds: [] },
    runtimeValidators: { attributeValidatorIds: [], obligationValidatorIds: [] },
  };
  return CompiledDecisionPackSchema.parse(raw);
}

function makeInput(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    userGoal: '',
    route: '',
    artifactKinds: [],
    entitySignals: [],
    ...overrides,
  };
}

describe('routePack: explicit selection (step 1)', () => {
  it('selects the explicitly requested pack immediately, ignoring all scoring', () => {
    const carPack = makeCompiledPack({ id: 'car-purchase', compiledHash: HASH_A });
    const energyPack = makeCompiledPack({ id: 'home-energy-guardian', compiledHash: HASH_B });
    const input = makeInput({ explicitPackId: 'home-energy-guardian', userGoal: 'compare cars' });

    const decision = routePack(input, [carPack, energyPack]);

    expect(decision).toEqual({
      kind: 'selected',
      selected: {
        packId: 'home-energy-guardian',
        version: '1.0.0',
        compiledHash: HASH_B,
        confidence: 1,
        reasons: ['User selected this Decision Pack'],
        matchedSignals: [],
      },
      candidates: [],
    });
  });

  it('resolves an explicit pack id to its highest installed semantic version (numeric, not lexicographic)', () => {
    const v1 = makeCompiledPack({ id: 'car-purchase', version: '1.2.0', compiledHash: HASH_A });
    const v2 = makeCompiledPack({ id: 'car-purchase', version: '1.10.0', compiledHash: HASH_B });

    const decision = routePack(makeInput({ explicitPackId: 'car-purchase' }), [v1, v2]);

    expect(decision.selected?.version).toBe('1.10.0');
    expect(decision.selected?.compiledHash).toBe(HASH_B);
  });

  it('resolves an explicit pack id across a major-version difference', () => {
    const older = makeCompiledPack({ id: 'car-purchase', version: '1.9.9', compiledHash: HASH_A });
    const newer = makeCompiledPack({ id: 'car-purchase', version: '2.0.0', compiledHash: HASH_B });

    const decision = routePack(makeInput({ explicitPackId: 'car-purchase' }), [older, newer]);

    expect(decision.selected?.version).toBe('2.0.0');
  });

  it('is stable when two installed versions compare equal', () => {
    const first = makeCompiledPack({ id: 'car-purchase', version: '1.0.0', compiledHash: HASH_A });
    const second = makeCompiledPack({ id: 'car-purchase', version: '1.0.0', compiledHash: HASH_B });

    const decision = routePack(makeInput({ explicitPackId: 'car-purchase' }), [first, second]);

    expect(decision.selected?.compiledHash).toBe(HASH_A);
  });

  it('falls through to scoring (and ultimately no_match) when explicitPackId is not installed', () => {
    const carPack = makeCompiledPack({ id: 'car-purchase', compiledHash: HASH_A });

    const decision = routePack(
      makeInput({ explicitPackId: 'does-not-exist', userGoal: 'nothing matches anything' }),
      [carPack],
    );

    expect(decision).toEqual({ kind: 'no_match', selected: null, candidates: [] });
  });
});

describe('routePack: pinned case (step 2)', () => {
  it('returns the pinned pack unconditionally, overriding an explicit selection', () => {
    const carPack = makeCompiledPack({ id: 'car-purchase', compiledHash: HASH_A });
    const input = makeInput({
      explicitPackId: 'car-purchase',
      activeCasePack: { id: 'home-energy-guardian', version: '2.0.0', compiledHash: HASH_C },
      userGoal: 'compare cars for my family',
    });

    const decision = routePack(input, [carPack]);

    expect(decision).toEqual({
      kind: 'selected',
      selected: {
        packId: 'home-energy-guardian',
        version: '2.0.0',
        compiledHash: HASH_C,
        confidence: 1,
        reasons: ['Case is pinned to this Decision Pack; routing cannot change it'],
        matchedSignals: [],
      },
      candidates: [],
    });
  });

  it('honors a pin unconditionally even when absent from the passed-in registry snapshot (documented edge case: routing never re-validates an existing pin against the registry)', () => {
    const decision = routePack(
      makeInput({
        activeCasePack: { id: 'ghost-pack', version: '1.0.0', compiledHash: HASH_GHOST },
      }),
      [],
    );

    expect(decision).toEqual({
      kind: 'selected',
      selected: {
        packId: 'ghost-pack',
        version: '1.0.0',
        compiledHash: HASH_GHOST,
        confidence: 1,
        reasons: ['Case is pinned to this Decision Pack; routing cannot change it'],
        matchedSignals: [],
      },
      candidates: [],
    });
  });
});

describe('routePack: deterministic + semantic scoring (steps 3-8)', () => {
  it('returns no_match when there is no signal at all and no semantic candidate', () => {
    const carPack = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: { keywords: ['car', 'vehicle'], intents: ['compare shortlisted cars'] },
    });

    const decision = routePack(
      makeInput({ userGoal: 'help me pick a rate plan for electricity' }),
      [carPack],
    );

    expect(decision).toEqual({ kind: 'no_match', selected: null, candidates: [] });
  });

  it('returns up to two ranked candidates for confirmation, deterministic-only', () => {
    const carPack = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: { keywords: ['car'], intents: ['compare shortlisted cars'] },
    });
    const energyPack = makeCompiledPack({
      id: 'home-energy-guardian',
      compiledHash: HASH_B,
      activation: { keywords: ['car'] },
    });
    const thirdPack = makeCompiledPack({
      id: 'apartment-hunt',
      compiledHash: HASH_C,
      activation: { keywords: [] },
    });

    const decision = routePack(makeInput({ userGoal: 'car car compare shortlisted cars' }), [
      carPack,
      energyPack,
      thirdPack,
    ]);

    expect(decision.kind).toBe('needs_confirmation');
    expect(decision.selected).toBeNull();
    expect(decision.candidates).toHaveLength(2);
    expect(decision.candidates[0]?.packId).toBe('car-purchase');
    expect(decision.candidates[1]?.packId).toBe('home-energy-guardian');
    expect(decision.candidates[0]!.confidence).toBeGreaterThan(decision.candidates[1]!.confidence);
  });

  it('matches artifactKinds and entitySignals by exact set membership, not substring', () => {
    const pack = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: { artifactKinds: ['listing'], entitySignals: ['dog-crate'] },
    });

    const matched = routePack(
      makeInput({ artifactKinds: ['listing'], entitySignals: ['dog-crate'] }),
      [pack],
    );
    const unmatched = routePack(
      makeInput({ artifactKinds: ['listing-photo'], entitySignals: ['cat-carrier'] }),
      [pack],
    );

    expect(matched.kind).toBe('needs_confirmation');
    expect(unmatched.kind).toBe('no_match');
  });

  it('reduces confidence when an exclusion phrase matches the user goal', () => {
    const pack = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: { keywords: ['car'], exclusions: ['schedule a test drive'] },
    });

    const withoutExclusion = routePack(makeInput({ userGoal: 'car' }), [pack]);
    const withExclusion = routePack(makeInput({ userGoal: 'car, please schedule a test drive' }), [
      pack,
    ]);

    expect(withoutExclusion.candidates[0]?.confidence).toBeGreaterThan(
      withExclusion.candidates[0]?.confidence ?? 0,
    );
    expect(withExclusion.candidates[0]?.reasons).toContain(
      'Matched exclusion "schedule a test drive" (confidence reduced)',
    );
  });

  it('never auto-selects on deterministic signal alone (max deterministic-only merged score is 0.6, below the 0.75 floor)', () => {
    const pack = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: {
        intents: ['compare shortlisted cars'],
        keywords: ['car'],
        artifactKinds: ['listing'],
        entitySignals: ['dog-crate'],
      },
    });

    const decision = routePack(
      makeInput({
        userGoal: 'compare shortlisted cars',
        route: 'car',
        artifactKinds: ['listing'],
        entitySignals: ['dog-crate'],
      }),
      [pack],
    );

    expect(decision.kind).toBe('needs_confirmation');
    expect(decision.candidates[0]?.confidence).toBeCloseTo(0.6, 6);
  });

  it('auto-selects once semantic input pushes the top score to exactly the 0.75 floor with no second candidate', () => {
    const pack = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: {
        intents: ['compare shortlisted cars'],
        keywords: ['car'],
        artifactKinds: ['listing'],
        entitySignals: ['dog-crate'],
      },
    });
    const semanticCandidates: SemanticRoutingCandidate[] = [
      { packId: 'car-purchase', version: '1.0.0', compiledHash: HASH_A, confidence: 0.375 },
    ];

    const decision = routePack(
      makeInput({
        userGoal: 'compare shortlisted cars',
        route: 'car',
        artifactKinds: ['listing'],
        entitySignals: ['dog-crate'],
      }),
      [pack],
      semanticCandidates,
    );

    expect(decision.kind).toBe('selected');
    expect(decision.selected?.packId).toBe('car-purchase');
    expect(decision.selected?.confidence).toBeCloseTo(0.75, 6);
  });

  it('auto-selects when the margin over a second candidate is exactly 0.20', () => {
    const packA = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: {
        intents: ['compare shortlisted cars'],
        keywords: ['car'],
        artifactKinds: ['listing'],
        entitySignals: ['dog-crate'],
      },
    });
    const packB = makeCompiledPack({
      id: 'home-energy-guardian',
      compiledHash: HASH_B,
      activation: { keywords: ['car'] },
    });
    const input = makeInput({
      userGoal: 'compare shortlisted cars',
      route: 'car',
      artifactKinds: ['listing'],
      entitySignals: ['dog-crate'],
    });
    const semanticCandidates: SemanticRoutingCandidate[] = [
      { packId: 'car-purchase', version: '1.0.0', compiledHash: HASH_A, confidence: 0.375 },
      { packId: 'home-energy-guardian', version: '1.0.0', compiledHash: HASH_B, confidence: 0.925 },
    ];

    const decision = routePack(input, [packA, packB], semanticCandidates);

    expect(decision.kind).toBe('selected');
    expect(decision.selected?.packId).toBe('car-purchase');
  });

  it('requires needs_confirmation when the margin falls just short of 0.20', () => {
    const packA = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: {
        intents: ['compare shortlisted cars'],
        keywords: ['car'],
        artifactKinds: ['listing'],
        entitySignals: ['dog-crate'],
      },
    });
    const packB = makeCompiledPack({
      id: 'home-energy-guardian',
      compiledHash: HASH_B,
      activation: { keywords: ['car'] },
    });
    const input = makeInput({
      userGoal: 'compare shortlisted cars',
      route: 'car',
      artifactKinds: ['listing'],
      entitySignals: ['dog-crate'],
    });
    const semanticCandidates: SemanticRoutingCandidate[] = [
      { packId: 'car-purchase', version: '1.0.0', compiledHash: HASH_A, confidence: 0.375 },
      { packId: 'home-energy-guardian', version: '1.0.0', compiledHash: HASH_B, confidence: 0.93 },
    ];

    const decision = routePack(input, [packA, packB], semanticCandidates);

    expect(decision.kind).toBe('needs_confirmation');
    expect(decision.candidates.map((c) => c.packId)).toEqual([
      'car-purchase',
      'home-energy-guardian',
    ]);
  });

  it('requires needs_confirmation when the top score falls just short of 0.75, regardless of margin', () => {
    const pack = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: {
        intents: ['compare shortlisted cars'],
        keywords: ['car'],
        artifactKinds: ['listing'],
        entitySignals: ['dog-crate'],
      },
    });
    const semanticCandidates: SemanticRoutingCandidate[] = [
      { packId: 'car-purchase', version: '1.0.0', compiledHash: HASH_A, confidence: 0.37 },
    ];

    const decision = routePack(
      makeInput({
        userGoal: 'compare shortlisted cars',
        route: 'car',
        artifactKinds: ['listing'],
        entitySignals: ['dog-crate'],
      }),
      [pack],
      semanticCandidates,
    );

    expect(decision.kind).toBe('needs_confirmation');
  });

  it('ignores a semantic candidate whose version does not match any registry entry', () => {
    const pack = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: { keywords: ['car'] },
    });

    const decision = routePack(
      makeInput({ userGoal: 'car' }),
      [pack],
      [{ packId: 'car-purchase', version: '9.9.9', compiledHash: HASH_A, confidence: 1 }],
    );

    expect(decision.kind).toBe('needs_confirmation');
    expect(decision.candidates[0]?.confidence).toBeCloseTo(0.18, 6);
  });

  it('ignores a semantic candidate whose compiledHash does not match any registry entry', () => {
    const pack = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: { keywords: ['car'] },
    });

    const decision = routePack(
      makeInput({ userGoal: 'car' }),
      [pack],
      [{ packId: 'car-purchase', version: '1.0.0', compiledHash: HASH_GHOST, confidence: 1 }],
    );

    expect(decision.kind).toBe('needs_confirmation');
    expect(decision.candidates[0]?.confidence).toBeCloseTo(0.18, 6);
  });

  it('ignores a semantic candidate whose packId does not exist in the registry at all', () => {
    const pack = makeCompiledPack({
      id: 'car-purchase',
      compiledHash: HASH_A,
      activation: { keywords: ['car'] },
    });

    const decision = routePack(
      makeInput({ userGoal: 'car' }),
      [pack],
      [{ packId: 'phantom-pack', version: '1.0.0', compiledHash: HASH_GHOST, confidence: 1 }],
    );

    expect(decision.kind).toBe('needs_confirmation');
    expect(decision.candidates[0]?.confidence).toBeCloseTo(0.18, 6);
  });

  it('takes the maximum confidence when multiple semantic candidates target the same registered pack', () => {
    const pack = makeCompiledPack({ id: 'car-purchase', compiledHash: HASH_A, activation: {} });

    const decision = routePack(
      makeInput({ userGoal: 'nothing' }),
      [pack],
      [
        { packId: 'car-purchase', version: '1.0.0', compiledHash: HASH_A, confidence: 0.2 },
        { packId: 'car-purchase', version: '1.0.0', compiledHash: HASH_A, confidence: 0.6 },
      ],
    );

    // merged = 0.6 * 0 (no deterministic signal) + 0.4 * 0.6 = 0.24
    expect(decision.candidates[0]?.confidence).toBeCloseTo(0.24, 6);
  });

  it('clamps an out-of-range semantic confidence into [0, 1]', () => {
    const pack = makeCompiledPack({ id: 'car-purchase', compiledHash: HASH_A, activation: {} });

    const decision = routePack(
      makeInput({ userGoal: 'nothing' }),
      [pack],
      [{ packId: 'car-purchase', version: '1.0.0', compiledHash: HASH_A, confidence: 5 }],
    );

    expect(decision.candidates[0]?.confidence).toBeCloseTo(0.4, 6);
  });
});

describe('resolveSelectedPack', () => {
  it('returns the selected candidate when kind is selected', () => {
    const carPack = makeCompiledPack({ id: 'car-purchase', compiledHash: HASH_A });
    const decision = routePack(makeInput({ explicitPackId: 'car-purchase' }), [carPack]);

    expect(resolveSelectedPack(decision).packId).toBe('car-purchase');
  });

  it('throws RoutingRejectionError when kind is needs_confirmation', () => {
    expect(() =>
      resolveSelectedPack({
        kind: 'needs_confirmation',
        selected: null,
        candidates: [],
      }),
    ).toThrow(RoutingRejectionError);
  });

  it('throws RoutingRejectionError when kind is no_match', () => {
    expect(() => resolveSelectedPack({ kind: 'no_match', selected: null, candidates: [] })).toThrow(
      RoutingRejectionError,
    );
  });
});

// --- Property tests (docs/specs/testing.md "Property tests") ---

const POOL: CompiledDecisionPack[] = [
  makeCompiledPack({
    id: 'car-purchase',
    compiledHash: HASH_A,
    activation: {
      keywords: ['car', 'vehicle'],
      intents: ['compare shortlisted cars'],
      artifactKinds: ['listing'],
      entitySignals: ['dog-crate'],
    },
  }),
  makeCompiledPack({
    id: 'home-energy-guardian',
    compiledHash: HASH_B,
    activation: {
      keywords: ['energy', 'bill'],
      intents: ['unusual bill'],
      artifactKinds: ['bill'],
      entitySignals: ['meter'],
    },
  }),
  makeCompiledPack({
    id: 'apartment-hunt',
    compiledHash: HASH_C,
    activation: { keywords: ['apartment', 'rent'] },
  }),
];

const PACK_IDS = [
  'car-purchase',
  'home-energy-guardian',
  'apartment-hunt',
  'phantom-pack',
] as const;
const HASHES = [HASH_A, HASH_B, HASH_C, HASH_GHOST] as const;

function registryFixtureArbitrary() {
  return fc.subarray(POOL, { minLength: 0, maxLength: POOL.length });
}

function semanticCandidatesArbitrary(): fc.Arbitrary<SemanticRoutingCandidate[]> {
  return fc.array(
    fc.record({
      packId: fc.constantFrom(...PACK_IDS),
      version: fc.constantFrom('1.0.0', '9.9.9'),
      compiledHash: fc.constantFrom(...HASHES),
      confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    }),
    { maxLength: 4 },
  );
}

interface PropertyFixture {
  registry: CompiledDecisionPack[];
  pinIndex: number | undefined;
  explicitPackId: (typeof PACK_IDS)[number] | undefined;
  userGoal: string;
  route: string;
  artifactKinds: string[];
  entitySignals: string[];
  semanticCandidates: SemanticRoutingCandidate[];
}

const propertyFixtureArbitrary: fc.Arbitrary<PropertyFixture> = registryFixtureArbitrary().chain(
  (registry) =>
    fc.record({
      registry: fc.constant(registry),
      pinIndex:
        registry.length > 0
          ? fc.option(fc.integer({ min: 0, max: registry.length - 1 }), { nil: undefined })
          : fc.constant(undefined),
      explicitPackId: fc.option(fc.constantFrom(...PACK_IDS), { nil: undefined }),
      userGoal: fc.string({ maxLength: 200 }),
      route: fc.string({ maxLength: 100 }),
      artifactKinds: fc.array(fc.constantFrom('listing', 'bill', 'other'), { maxLength: 5 }),
      entitySignals: fc.array(fc.constantFrom('dog-crate', 'meter', 'other'), { maxLength: 5 }),
      semanticCandidates: semanticCandidatesArbitrary(),
    }),
);

function buildInput(fixture: PropertyFixture): {
  input: RoutingInput;
  pin: CompiledDecisionPack | undefined;
} {
  const pin = fixture.pinIndex === undefined ? undefined : fixture.registry[fixture.pinIndex];
  const input: RoutingInput = {
    ...(fixture.explicitPackId !== undefined ? { explicitPackId: fixture.explicitPackId } : {}),
    ...(pin !== undefined
      ? {
          activeCasePack: {
            id: pin.identity.id,
            version: pin.identity.version,
            compiledHash: pin.compiledHash,
          },
        }
      : {}),
    userGoal: fixture.userGoal,
    route: fixture.route,
    artifactKinds: fixture.artifactKinds,
    entitySignals: fixture.entitySignals,
  };
  return { input, pin };
}

describe('routePack: properties', () => {
  it('property: router output never references a pack absent from the registry passed to it', () => {
    fc.assert(
      fc.property(propertyFixtureArbitrary, (fixture) => {
        const { input } = buildInput(fixture);
        const decision = routePack(input, fixture.registry, fixture.semanticCandidates);

        const isRegistered = (candidate: {
          packId: string;
          version: string;
          compiledHash: string;
        }) =>
          fixture.registry.some(
            (pack) =>
              pack.identity.id === candidate.packId &&
              pack.identity.version === candidate.version &&
              pack.compiledHash === candidate.compiledHash,
          );

        if (decision.selected !== null) {
          expect(isRegistered(decision.selected)).toBe(true);
        }
        for (const candidate of decision.candidates) {
          expect(isRegistered(candidate)).toBe(true);
        }
      }),
    );
  });

  it('property: explicit user selection always wins for a pack present in the registry', () => {
    fc.assert(
      fc.property(propertyFixtureArbitrary, (fixture) => {
        // Isolate step 1 from step 2: only meaningful when nothing is pinned.
        fc.pre(fixture.pinIndex === undefined);
        fc.pre(fixture.explicitPackId !== undefined);
        fc.pre(fixture.registry.some((pack) => pack.identity.id === fixture.explicitPackId));

        const { input } = buildInput(fixture);
        const decision = routePack(input, fixture.registry, fixture.semanticCandidates);

        expect(decision.kind).toBe('selected');
        expect(decision.selected?.packId).toBe(fixture.explicitPackId);
      }),
    );
  });

  it('property: a pinned case never changes pack through routing, regardless of any other signal', () => {
    fc.assert(
      fc.property(propertyFixtureArbitrary, (fixture) => {
        fc.pre(fixture.pinIndex !== undefined);

        const { input, pin } = buildInput(fixture);
        const decision = routePack(input, fixture.registry, fixture.semanticCandidates);

        expect(decision.kind).toBe('selected');
        expect(decision.selected?.packId).toBe(pin?.identity.id);
        expect(decision.selected?.version).toBe(pin?.identity.version);
        expect(decision.selected?.compiledHash).toBe(pin?.compiledHash);
      }),
    );
  });
});
