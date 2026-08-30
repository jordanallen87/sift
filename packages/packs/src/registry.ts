/**
 * `PackRegistry`: an in-memory store of compiled Decision Packs, keyed by
 * `id`/`version`. Implements pack-authoring.md "Compiler and registry":
 * "The registry stores only compiled packs. Each case pins `packId`,
 * `packVersion`, and `compiledPackHash`. Changing an installed pack creates
 * a new version; it never mutates an existing case."
 *
 * Judgment call: the task description asks for `register` to be "idempotent
 * / no-op" when the exact same manifest is registered twice under the same
 * `id`+`version` (e.g. a repeated boot re-installing the same built-in
 * packs), but to reject a *different* manifest reusing an already-used
 * `id`+`version`. `compiledHash` is precisely "semantic source and resolved
 * capability versions" (pack-authoring.md step 11) reduced to one
 * comparable value, so "same semantic content" is implemented as "same
 * `compiledHash`" -- two `CompiledDecisionPack`s for the same `id`+`version`
 * with an identical `compiledHash` are treated as the same registration
 * event (no-op); a differing `compiledHash` under the same `id`+`version`
 * is rejected, since that combination can only mean the pack's *content*
 * changed without its *version* changing, which the registry must never
 * silently accept -- an already-registered `id`+`version` is what a pinned
 * case's `packId`/`packVersion`/`compiledPackHash` triple trusts to be
 * immutable.
 */
import type { CompiledDecisionPack } from '@sift/contracts';
import { SiftDomainError } from '@sift/core';

export class PackRegistryConflictError extends SiftDomainError {
  readonly code = 'PACK_REGISTRY_CONFLICT' as const;
}

function registryKey(id: string, version: string): string {
  return `${id}@${version}`;
}

export class PackRegistry {
  private readonly byIdVersion = new Map<string, CompiledDecisionPack>();
  private readonly byHash = new Map<string, CompiledDecisionPack>();

  /**
   * Registers a compiled pack. No-ops (does not throw, does not duplicate
   * the entry) when a pack with the same `id`+`version` and the same
   * `compiledHash` is already registered. Throws `PackRegistryConflictError`
   * when a pack with the same `id`+`version` but a *different*
   * `compiledHash` is already registered -- see the module comment above.
   */
  register(pack: CompiledDecisionPack): void {
    const key = registryKey(pack.identity.id, pack.identity.version);
    const existing = this.byIdVersion.get(key);

    if (existing !== undefined) {
      if (existing.compiledHash === pack.compiledHash) {
        return;
      }
      throw new PackRegistryConflictError(
        `Cannot register Decision Pack "${pack.identity.id}@${pack.identity.version}": ` +
          `it is already registered with a different compiledHash ` +
          `(existing "${existing.compiledHash}", incoming "${pack.compiledHash}"). ` +
          `Publish a new version instead of changing an installed pack's content.`,
        {
          details: {
            packId: pack.identity.id,
            packVersion: pack.identity.version,
            existingCompiledHash: existing.compiledHash,
            incomingCompiledHash: pack.compiledHash,
          },
        },
      );
    }

    this.byIdVersion.set(key, pack);
    this.byHash.set(pack.compiledHash, pack);
  }

  get(id: string, version: string): CompiledDecisionPack | undefined {
    return this.byIdVersion.get(registryKey(id, version));
  }

  getByHash(compiledHash: string): CompiledDecisionPack | undefined {
    return this.byHash.get(compiledHash);
  }

  list(): readonly CompiledDecisionPack[] {
    return Array.from(this.byIdVersion.values());
  }
}
