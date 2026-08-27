import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { DecisionPackManifest } from '@pax/contracts';
import { canonicalizeManifest, canonicalizeValue, hashManifest } from './canonicalize.js';

function minimalManifest(overrides: Partial<DecisionPackManifest> = {}): DecisionPackManifest {
  return {
    schemaVersion: '1.0',
    identity: {
      id: 'apartment-hunt',
      version: '1.0.0',
      name: 'Apartment Hunt',
      description: 'Find an apartment.',
      tags: ['housing'],
    },
    activation: {
      intents: ['find an apartment'],
      keywords: ['apartment', 'rent'],
      artifactKinds: ['listing'],
      entitySignals: ['unit'],
      exclusions: [],
    },
    entities: [],
    attributes: [],
    criteria: { defaults: [], allowUserDefined: true, protectedCriterionIds: [] },
    obligations: [
      {
        id: 'apt.hard_constraints',
        label: 'Hard constraints',
        question: 'Which units satisfy the budget?',
        category: 'constraints',
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
      userConcernTemplateId: 'apt.user_concern',
    },
    skills: [],
    specialists: [],
    orchestration: {
      strategy: 'single_agent',
      maxSteps: 10,
      nodeTimeoutMs: 5_000,
      totalTimeoutMs: 30_000,
    },
    tools: [],
    policies: [],
    presentation: {
      optionLabel: 'Apartment',
      optionLabelPlural: 'Apartments',
      attributeGroups: [],
    },
    evaluation: { scenarioIds: ['apt-success'], requiresNegativeCase: true },
    ...overrides,
  };
}

describe('canonicalizeValue', () => {
  it('sorts object keys lexicographically at every nesting level', () => {
    const a = canonicalizeValue({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalizeValue({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('preserves array element order', () => {
    expect(canonicalizeValue([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalizeValue([1, 3, 2])).not.toBe(canonicalizeValue([3, 1, 2]));
  });

  it('renders null and undefined object values as JSON null, but drops undefined keys', () => {
    expect(canonicalizeValue(null)).toBe('null');
    expect(canonicalizeValue(undefined)).toBe('null');
    expect(canonicalizeValue({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it('recursively canonicalizes array elements that are themselves objects', () => {
    expect(canonicalizeValue([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });
});

describe('canonicalizeManifest', () => {
  it('produces identical output for manifests that differ only in object key insertion order', () => {
    const manifest = minimalManifest();
    // Rebuild `identity` with reversed key insertion order -- JSON.stringify
    // (and therefore any accidental use of insertion-order-sensitive
    // serialization) would differ; canonicalizeManifest must not.
    const reorderedIdentity = {
      tags: manifest.identity.tags,
      description: manifest.identity.description,
      name: manifest.identity.name,
      version: manifest.identity.version,
      id: manifest.identity.id,
    };
    const reordered: DecisionPackManifest = {
      ...manifest,
      identity: reorderedIdentity,
    };

    expect(JSON.stringify(reordered.identity)).not.toBe(JSON.stringify(manifest.identity));
    expect(canonicalizeManifest(reordered)).toBe(canonicalizeManifest(manifest));
  });

  it('produces different output when a materially different field changes', () => {
    const manifest = minimalManifest();
    const changed = minimalManifest({
      obligations: [{ ...manifest.obligations[0]!, priority: 999 }],
    });

    expect(canonicalizeManifest(changed)).not.toBe(canonicalizeManifest(manifest));
  });
});

describe('hashManifest', () => {
  it('produces a lowercase-hex SHA-256 digest', () => {
    const hash = hashManifest(canonicalizeManifest(minimalManifest()));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same canonical JSON and capability versions', () => {
    const canonical = canonicalizeManifest(minimalManifest());
    const versions = { 'tool:calculator': '1.0.0' };
    expect(hashManifest(canonical, versions)).toBe(hashManifest(canonical, versions));
  });

  it('is deterministic regardless of resolvedCapabilityVersions key insertion order', () => {
    const canonical = canonicalizeManifest(minimalManifest());
    const a = hashManifest(canonical, { b: '2.0.0', a: '1.0.0' });
    const b = hashManifest(canonical, { a: '1.0.0', b: '2.0.0' });
    expect(a).toBe(b);
  });

  it('changes when resolvedCapabilityVersions changes but the manifest does not', () => {
    const canonical = canonicalizeManifest(minimalManifest());
    const a = hashManifest(canonical, { 'tool:calculator': '1.0.0' });
    const b = hashManifest(canonical, { 'tool:calculator': '2.0.0' });
    expect(a).not.toBe(b);
  });

  it('defaults resolvedCapabilityVersions to empty and stays deterministic', () => {
    const canonical = canonicalizeManifest(minimalManifest());
    expect(hashManifest(canonical)).toBe(hashManifest(canonical, {}));
  });

  it('changes when the canonical manifest JSON changes', () => {
    const a = hashManifest(canonicalizeManifest(minimalManifest()));
    const b = hashManifest(canonicalizeManifest(minimalManifest({ obligations: [] })));
    expect(a).not.toBe(b);
  });
});

describe('property: canonicalization and hashing are key-order and metadata independent', () => {
  it('two manifests differing only in top-level key order hash identically', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (tag) => {
        const base = minimalManifest({ identity: { ...minimalManifest().identity, name: tag } });
        // Build a structurally-identical object with reversed key order at
        // the top level via spreading into a fresh object with keys listed
        // in reverse; JS engines preserve insertion order for string keys,
        // so this is a real (not merely cosmetic) reordering.
        const keys = Object.keys(base) as (keyof DecisionPackManifest)[];
        const reversed = {} as DecisionPackManifest;
        for (const key of [...keys].reverse()) {
          (reversed as Record<string, unknown>)[key] = base[key];
        }
        return canonicalizeManifest(reversed) === canonicalizeManifest(base);
      }),
    );
  });

  it('a manifest with a changed obligation priority always hashes differently', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (priorityA, priorityB) => {
          fc.pre(priorityA !== priorityB);
          const manifestA = minimalManifest({
            obligations: [{ ...minimalManifest().obligations[0]!, priority: priorityA }],
          });
          const manifestB = minimalManifest({
            obligations: [{ ...minimalManifest().obligations[0]!, priority: priorityB }],
          });
          const hashA = hashManifest(canonicalizeManifest(manifestA));
          const hashB = hashManifest(canonicalizeManifest(manifestB));
          return hashA !== hashB;
        },
      ),
    );
  });
});
