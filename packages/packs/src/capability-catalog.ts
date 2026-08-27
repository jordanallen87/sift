/**
 * The installed capability catalog and the manifest-vs-catalog reference
 * resolution contract, implementing pack-authoring.md "Compiler and
 * registry" step 5 ("capability allowlist resolution") and the pack
 * bundle's addressable capability kinds named throughout pack-authoring.md
 * ("pack_catalog -- list installed skills, specialists, tools, UI
 * renderers, and orchestration templates").
 *
 * Judgment call (see the dated docs/build-log.md entry for the full
 * reasoning): the real skill/specialist/tool/UI-renderer/orchestration-
 * template *implementations* do not exist yet -- they are separate,
 * later work (the two hero packs' skills/specialists/fixture tools, and
 * `apps/web`'s generic renderer components). This module therefore only
 * defines the LOOKUP contract those implementations will eventually
 * register into: a minimal `{id, kind, version}` catalog entry per
 * capability, keyed by `(kind, id)`. `version` is included even though the
 * task description's suggested shape was just `{id, kind}` because
 * `canonicalize.ts`'s `hashManifest` needs a per-capability version string
 * to fold into `compiledHash` (pack-authoring.md step 11: "The hash covers
 * semantic source and resolved capability versions"); a real implementation
 * registry entry always carries *some* version identifier (a semver, a
 * content hash, a build ID), so requiring it here is not overreach -- it
 * just isn't populated with real values until the concrete
 * skill/specialist/tool registries exist. `ui_renderer` and
 * `orchestration_template` entries are included in `CapabilityKind` for
 * catalog completeness (pack_catalog's own enumeration) but a
 * `DecisionPackManifest` never references either by ID -- presentation
 * fields are labels/groupings, not renderer IDs, and orchestration is an
 * inline bounds declaration, not a named template reference -- so
 * `resolveCapabilityReferences` only ever resolves `skill`/`specialist`/
 * `tool` references, the three kinds a manifest can actually name.
 */
import type { DecisionPackManifest } from '@pax/contracts';

export const CAPABILITY_KINDS = [
  'skill',
  'specialist',
  'tool',
  'ui_renderer',
  'orchestration_template',
] as const;
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

/** The subset of `CapabilityKind` a `DecisionPackManifest` can actually declare a reference to. */
export const MANIFEST_REFERENCEABLE_CAPABILITY_KINDS = ['skill', 'specialist', 'tool'] as const;
export type ManifestReferenceableCapabilityKind =
  (typeof MANIFEST_REFERENCEABLE_CAPABILITY_KINDS)[number];

export interface CapabilityCatalogEntry {
  readonly id: string;
  readonly kind: CapabilityKind;
  /** Implementation version pinned into `compiledHash` -- see the module comment above. */
  readonly version: string;
}

export interface CapabilityCatalog {
  readonly entries: readonly CapabilityCatalogEntry[];
}

/** Stable `"<kind>:<id>"` lookup/hash key, shared with `canonicalize.ts`'s `hashManifest` doc comment. */
export function capabilityKey(kind: CapabilityKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Builds a `CapabilityCatalog` from a flat entry list. Duplicate
 * `(kind, id)` pairs are rejected -- an installed catalog is a registry, not
 * a log, and a duplicate entry would make `findCapability` and
 * `resolveCapabilityReferences` ambiguous about which version is actually
 * installed.
 */
export function createCapabilityCatalog(
  entries: readonly CapabilityCatalogEntry[],
): CapabilityCatalog {
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = capabilityKey(entry.kind, entry.id);
    if (seen.has(key)) {
      throw new Error(`Duplicate capability catalog entry for ${key}.`);
    }
    seen.add(key);
  }
  return { entries };
}

export function findCapability(
  catalog: CapabilityCatalog,
  kind: CapabilityKind,
  id: string,
): CapabilityCatalogEntry | undefined {
  return catalog.entries.find((entry) => entry.kind === kind && entry.id === id);
}

export interface CapabilityReference {
  readonly kind: ManifestReferenceableCapabilityKind;
  readonly id: string;
}

export interface CapabilityReferenceResolution extends CapabilityReference {
  readonly resolved: boolean;
  readonly version: string | undefined;
}

export interface ResolveCapabilityReferencesResult {
  /** Every skill/specialist/tool reference the manifest declares, resolved or not. */
  readonly all: readonly CapabilityReferenceResolution[];
  /** The subset of `all` that resolved against the catalog. */
  readonly resolved: readonly CapabilityReferenceResolution[];
  /** The subset of `all` that did not resolve -- an "unknown capability" per pack-authoring.md step 5. */
  readonly unresolved: readonly CapabilityReferenceResolution[];
}

/**
 * Every distinct skill/specialist/tool ID a manifest declares (`skills[]`,
 * `specialists[]`, `tools[]` -- deliberately not `specialists[].allowedTools`/
 * `allowedSkills` or `obligations[].preferredSkills`/`preferredSpecialists`,
 * which are dangling-*reference* checks against the manifest's own
 * declarations, a `compiler.ts` concern; this function's job is resolving
 * the manifest's own top-level capability declarations against the
 * installed catalog).
 */
function declaredReferences(manifest: DecisionPackManifest): CapabilityReference[] {
  return [
    ...manifest.skills.map((skill) => ({ kind: 'skill' as const, id: skill.id })),
    ...manifest.specialists.map((specialist) => ({
      kind: 'specialist' as const,
      id: specialist.id,
    })),
    ...manifest.tools.map((tool) => ({ kind: 'tool' as const, id: tool.id })),
  ];
}

export function resolveCapabilityReferences(
  manifest: DecisionPackManifest,
  catalog: CapabilityCatalog,
): ResolveCapabilityReferencesResult {
  const all = declaredReferences(manifest).map((reference) => {
    const entry = findCapability(catalog, reference.kind, reference.id);
    return { ...reference, resolved: entry !== undefined, version: entry?.version };
  });

  return {
    all,
    resolved: all.filter((reference) => reference.resolved),
    unresolved: all.filter((reference) => !reference.resolved),
  };
}
