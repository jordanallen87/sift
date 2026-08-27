import { describe, expect, it } from 'vitest';
import type { Clock } from '@pax/core';
import { PaxDomainError } from '@pax/core';
import { compilePack } from './compiler.js';
import { PackRegistry, PackRegistryConflictError } from './registry.js';
import { validCatalog, validManifest } from './fixtures/manifest.js';

const fixedClock: Clock = { now: () => '2026-08-27T00:00:00.000Z' };

function compiledPack(overrides: Parameters<typeof validManifest>[0] = {}) {
  return compilePack(validManifest(overrides), validCatalog(), fixedClock);
}

describe('PackRegistry', () => {
  it('starts empty', () => {
    const registry = new PackRegistry();
    expect(registry.list()).toEqual([]);
  });

  it('registers and retrieves a pack by id and version', () => {
    const registry = new PackRegistry();
    const pack = compiledPack();
    registry.register(pack);
    expect(registry.get('apartment-hunt', '1.0.0')).toEqual(pack);
  });

  it('retrieves a pack by compiledHash', () => {
    const registry = new PackRegistry();
    const pack = compiledPack();
    registry.register(pack);
    expect(registry.getByHash(pack.compiledHash)).toEqual(pack);
  });

  it('returns undefined for an unregistered id/version', () => {
    const registry = new PackRegistry();
    expect(registry.get('does-not-exist', '1.0.0')).toBeUndefined();
  });

  it('returns undefined for an unregistered hash', () => {
    const registry = new PackRegistry();
    expect(registry.getByHash('a'.repeat(64))).toBeUndefined();
  });

  it('lists every registered pack', () => {
    const registry = new PackRegistry();
    const packA = compiledPack();
    const packB = compilePack(
      validManifest({ identity: { ...validManifest().identity, id: 'other-pack' } }),
      validCatalog(),
      fixedClock,
    );
    registry.register(packA);
    registry.register(packB);
    expect(registry.list()).toHaveLength(2);
    expect(
      registry
        .list()
        .map((pack) => pack.identity.id)
        .sort(),
    ).toEqual(['apartment-hunt', 'other-pack']);
  });

  it('is idempotent when the exact same pack is registered twice (e.g. a repeated boot)', () => {
    const registry = new PackRegistry();
    const pack = compiledPack();
    registry.register(pack);
    expect(() => registry.register(pack)).not.toThrow();
    expect(registry.list()).toHaveLength(1);
  });

  it('is idempotent when re-registering a freshly recompiled but semantically identical pack', () => {
    const registry = new PackRegistry();
    registry.register(compiledPack());
    // A second, independently-compiled `CompiledDecisionPack` instance built
    // from the exact same source manifest -- not object-identical to the
    // first, but semantically identical, so it must produce the same
    // compiledHash and register as a no-op.
    registry.register(compiledPack());
    expect(registry.list()).toHaveLength(1);
  });

  it('rejects registering a different pack (different compiledHash) under an already-used id+version', () => {
    const registry = new PackRegistry();
    const original = compiledPack();
    const changed = compilePack(
      validManifest({
        obligations: [{ ...validManifest().obligations[0]!, priority: 999 }],
      }),
      validCatalog(),
      fixedClock,
    );
    expect(original.identity.id).toBe(changed.identity.id);
    expect(original.identity.version).toBe(changed.identity.version);
    expect(original.compiledHash).not.toBe(changed.compiledHash);

    registry.register(original);
    expect(() => registry.register(changed)).toThrow(PackRegistryConflictError);
    expect(() => registry.register(changed)).toThrow(PaxDomainError);
    expect(registry.get('apartment-hunt', '1.0.0')).toEqual(original);
  });

  it('allows the same id under a different version', () => {
    const registry = new PackRegistry();
    const v1 = compiledPack();
    const v2 = compilePack(
      validManifest({ identity: { ...validManifest().identity, version: '1.1.0' } }),
      validCatalog(),
      fixedClock,
    );
    registry.register(v1);
    registry.register(v2);
    expect(registry.list()).toHaveLength(2);
    expect(registry.get('apartment-hunt', '1.0.0')).toEqual(v1);
    expect(registry.get('apartment-hunt', '1.1.0')).toEqual(v2);
  });
});
