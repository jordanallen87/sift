import { describe, expect, it } from 'vitest';
import { PackRegistry, compilePack } from '@pax/packs';
import { validCatalog, validManifest } from '@pax/packs/src/fixtures/manifest.js';
import { buildInstalledCapabilityCatalog, packCatalog } from './catalog.js';

const FIXED_CLOCK = { now: () => '2026-08-27T00:00:00.000Z' };

function registryWithApartmentHunt(): PackRegistry {
  const registry = new PackRegistry();
  registry.register(compilePack(validManifest(), validCatalog(), FIXED_CLOCK));
  return registry;
}

describe('buildInstalledCapabilityCatalog', () => {
  it('unions every registered pack’s resolved skills/specialists/tools', () => {
    const catalog = buildInstalledCapabilityCatalog(registryWithApartmentHunt());
    const byKind = (kind: string) =>
      catalog.entries.filter((entry) => entry.kind === kind).map((e) => e.id);
    expect(byKind('skill')).toContain('listing-normalizer');
    expect(byKind('specialist')).toContain('deal-analyst');
    expect(byKind('tool')).toContain('calculator');
  });

  it('adds static ui_renderer entries for every AttributeValue variant', () => {
    const catalog = buildInstalledCapabilityCatalog(new PackRegistry());
    const renderers = catalog.entries
      .filter((entry) => entry.kind === 'ui_renderer')
      .map((e) => e.id);
    expect(renderers).toContain('attribute-value.money');
    expect(renderers).toContain('attribute-value.boolean');
    expect(renderers).toContain('attribute-value.string_list');
  });

  it('adds static orchestration_template entries for every orchestration strategy', () => {
    const catalog = buildInstalledCapabilityCatalog(new PackRegistry());
    const templates = catalog.entries
      .filter((entry) => entry.kind === 'orchestration_template')
      .map((e) => e.id);
    expect(templates).toEqual(expect.arrayContaining(['graph', 'swarm', 'single_agent', 'hybrid']));
  });

  it('returns only the static entries for an empty registry (no fabricated skills/specialists/tools)', () => {
    const catalog = buildInstalledCapabilityCatalog(new PackRegistry());
    expect(catalog.entries.some((entry) => entry.kind === 'skill')).toBe(false);
    expect(catalog.entries.some((entry) => entry.kind === 'tool')).toBe(false);
  });

  it('never registers a duplicate (kind, id) pair even across two packs sharing a capability id', () => {
    const registry = registryWithApartmentHunt();
    // A second, distinct pack id reusing the exact same skill/specialist/tool ids.
    registry.register(
      compilePack(
        validManifest({ identity: { ...validManifest().identity, id: 'apartment-hunt-2' } }),
        validCatalog(),
        FIXED_CLOCK,
      ),
    );
    expect(() => buildInstalledCapabilityCatalog(registry)).not.toThrow();
  });
});

describe('packCatalog', () => {
  it('lists every entry when no kind filter is given', () => {
    const catalog = buildInstalledCapabilityCatalog(registryWithApartmentHunt());
    const result = packCatalog(catalog);
    expect(result.entries.length).toBe(catalog.entries.length);
  });

  it('filters to one kind when given', () => {
    const catalog = buildInstalledCapabilityCatalog(registryWithApartmentHunt());
    const result = packCatalog(catalog, { kind: 'skill' });
    expect(result.entries.every((entry) => entry.kind === 'skill')).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('rejects an unrecognized kind at the schema layer', () => {
    const catalog = buildInstalledCapabilityCatalog(new PackRegistry());
    expect(() => packCatalog(catalog, { kind: 'not-a-real-kind' })).toThrow();
  });
});
