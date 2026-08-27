import { describe, expect, it } from 'vitest';
import {
  capabilityKey,
  createCapabilityCatalog,
  findCapability,
  resolveCapabilityReferences,
} from './capability-catalog.js';
import { validCatalog, validManifest } from './fixtures/manifest.js';

describe('capabilityKey', () => {
  it('joins kind and id with a colon', () => {
    expect(capabilityKey('skill', 'listing-normalizer')).toBe('skill:listing-normalizer');
  });
});

describe('createCapabilityCatalog', () => {
  it('builds a catalog from entries', () => {
    const catalog = createCapabilityCatalog([{ id: 'a', kind: 'skill', version: '1.0.0' }]);
    expect(catalog.entries).toHaveLength(1);
  });

  it('rejects duplicate (kind, id) entries', () => {
    expect(() =>
      createCapabilityCatalog([
        { id: 'a', kind: 'skill', version: '1.0.0' },
        { id: 'a', kind: 'skill', version: '2.0.0' },
      ]),
    ).toThrow(/duplicate/i);
  });

  it('allows the same id under different kinds', () => {
    const catalog = createCapabilityCatalog([
      { id: 'a', kind: 'skill', version: '1.0.0' },
      { id: 'a', kind: 'tool', version: '1.0.0' },
    ]);
    expect(catalog.entries).toHaveLength(2);
  });
});

describe('findCapability', () => {
  it('finds an entry by kind and id', () => {
    const catalog = validCatalog();
    expect(findCapability(catalog, 'skill', 'listing-normalizer')).toEqual({
      id: 'listing-normalizer',
      kind: 'skill',
      version: '1.0.0',
    });
  });

  it('returns undefined for an id present under a different kind', () => {
    const catalog = validCatalog();
    expect(findCapability(catalog, 'tool', 'listing-normalizer')).toBeUndefined();
  });

  it('returns undefined for an id not present at all', () => {
    const catalog = validCatalog();
    expect(findCapability(catalog, 'skill', 'does-not-exist')).toBeUndefined();
  });
});

describe('resolveCapabilityReferences', () => {
  it('resolves every skill/specialist/tool reference against a catalog that has them all', () => {
    const result = resolveCapabilityReferences(validManifest(), validCatalog());
    expect(result.unresolved).toEqual([]);
    expect(result.resolved).toHaveLength(3);
    expect(result.all).toHaveLength(3);
    expect(result.resolved.every((reference) => reference.version === '1.0.0')).toBe(true);
  });

  it('reports an unknown skill as unresolved', () => {
    const manifest = validManifest({
      skills: [{ id: 'not-installed', description: 'A skill the catalog does not have.' }],
    });
    const result = resolveCapabilityReferences(manifest, validCatalog());
    expect(result.unresolved).toContainEqual(
      expect.objectContaining({ kind: 'skill', id: 'not-installed', resolved: false }),
    );
  });

  it('reports an unknown specialist as unresolved', () => {
    const manifest = validManifest({
      specialists: [
        {
          id: 'not-installed',
          description: 'A specialist the catalog does not have.',
          allowedTools: ['calculator'],
        },
      ],
    });
    const result = resolveCapabilityReferences(manifest, validCatalog());
    expect(result.unresolved).toContainEqual(
      expect.objectContaining({ kind: 'specialist', id: 'not-installed', resolved: false }),
    );
  });

  it('reports an unknown tool as unresolved', () => {
    const manifest = validManifest({
      tools: [
        {
          id: 'not-installed',
          description: 'A tool the catalog does not have.',
          effect: 'read_only',
          requiresApproval: false,
        },
      ],
    });
    const result = resolveCapabilityReferences(manifest, validCatalog());
    expect(result.unresolved).toContainEqual(
      expect.objectContaining({ kind: 'tool', id: 'not-installed', resolved: false }),
    );
  });

  it('returns an empty result for a manifest declaring no skills, specialists, or tools', () => {
    const manifest = validManifest({ skills: [], specialists: [], tools: [] });
    const result = resolveCapabilityReferences(manifest, validCatalog());
    expect(result.all).toEqual([]);
    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });
});
