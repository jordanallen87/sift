/**
 * `pack_catalog`: the first bounded authoring tool (docs/specs/pack-authoring.md
 * "`pack-authoring` Strands skill"): "list installed skills, specialists,
 * tools, UI renderers, and orchestration templates."
 *
 * `buildInstalledCapabilityCatalog` derives the REAL installed catalog from
 * whatever compiled Decision Packs are currently registered in a
 * `PackRegistry` -- the union of every registered pack's real
 * `resolvedCapabilities` (skills/specialists/tools that actually compiled
 * into an installed pack), never a hand-maintained duplicate list. This
 * calls the real, already-built `@pax/packs` compiler/registry; it does not
 * reimplement capability resolution.
 *
 * `ui_renderer`/`orchestration_template` entries are added as static,
 * catalog-complete entries: `packages/packs/src/capability-catalog.ts`'s own
 * module comment explains no `DecisionPackManifest` field ever references
 * either kind by ID (presentation fields are labels/groupings, not renderer
 * IDs; orchestration is an inline bounds declaration, not a named template
 * reference), so there is no live registry to derive them from. They are
 * still grounded in real exported constants -- one `ui_renderer` entry per
 * generic `AttributeValue` variant the right-pane renderer already handles
 * (`ATTRIBUTE_VALUE_TYPES`, `@pax/contracts`), and one
 * `orchestration_template` entry per orchestration strategy the compiler
 * actually validates (`ORCHESTRATION_STRATEGIES`) -- not fabricated names.
 */
import { z } from 'zod';
import { ATTRIBUTE_VALUE_TYPES, ORCHESTRATION_STRATEGIES } from '@pax/contracts';
import {
  CAPABILITY_KINDS,
  createCapabilityCatalog,
  type CapabilityCatalog,
  type CapabilityCatalogEntry,
  type CapabilityKind,
  type PackRegistry,
} from '@pax/packs';

function uiRendererEntries(): CapabilityCatalogEntry[] {
  return ATTRIBUTE_VALUE_TYPES.map((valueType) => ({
    id: `attribute-value.${valueType}`,
    kind: 'ui_renderer',
    version: 'generic-1',
  }));
}

function orchestrationTemplateEntries(): CapabilityCatalogEntry[] {
  return ORCHESTRATION_STRATEGIES.map((strategy) => ({
    id: strategy,
    kind: 'orchestration_template',
    version: 'compiler-1',
  }));
}

/**
 * Unions every registered pack's `resolvedCapabilities` plus the two static
 * kinds above. Deduplicates by `(kind, id)` before ever calling
 * `createCapabilityCatalog` (which throws on a duplicate pair) -- two
 * installed packs legitimately sharing a skill/tool id (e.g. a shared
 * generic calculator) is expected, not an error condition, at the catalog
 * level; the first-registered pack's version wins for that entry.
 */
export function buildInstalledCapabilityCatalog(registry: PackRegistry): CapabilityCatalog {
  const seen = new Set<string>();
  const entries: CapabilityCatalogEntry[] = [];

  function addEntry(entry: CapabilityCatalogEntry): void {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  }

  for (const pack of registry.list()) {
    for (const id of pack.resolvedCapabilities.skillIds) {
      addEntry({ id, kind: 'skill', version: pack.identity.version });
    }
    for (const id of pack.resolvedCapabilities.specialistIds) {
      addEntry({ id, kind: 'specialist', version: pack.identity.version });
    }
    for (const id of pack.resolvedCapabilities.toolIds) {
      addEntry({ id, kind: 'tool', version: pack.identity.version });
    }
  }
  for (const entry of uiRendererEntries()) addEntry(entry);
  for (const entry of orchestrationTemplateEntries()) addEntry(entry);

  return createCapabilityCatalog(entries);
}

export const PackCatalogInputSchema = z
  .object({ kind: z.enum(CAPABILITY_KINDS).optional() })
  .strict();
export type PackCatalogInput = z.infer<typeof PackCatalogInputSchema>;

export interface PackCatalogEntryView {
  readonly id: string;
  readonly kind: CapabilityKind;
  readonly version: string;
}

export interface PackCatalogResult {
  readonly entries: readonly PackCatalogEntryView[];
}

/**
 * `pack_catalog` -- read-only. No filesystem write, no registry mutation.
 * Optionally filters to one `kind` (e.g. list only `skill` entries).
 */
export function packCatalog(catalog: CapabilityCatalog, rawInput: unknown = {}): PackCatalogResult {
  const input = PackCatalogInputSchema.parse(rawInput);
  const entries = catalog.entries
    .filter((entry) => input.kind === undefined || entry.kind === input.kind)
    .map((entry) => ({ id: entry.id, kind: entry.kind, version: entry.version }));
  return { entries };
}
