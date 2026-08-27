import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PackRegistry, compilePack } from '@pax/packs';
import { validCatalog, validManifest } from '@pax/packs/src/fixtures/manifest.js';
import { packScaffold } from './scaffold.js';
import { PackDiffValidationFailedError, packDiff } from './diff.js';

const FIXED_CLOCK = { now: () => '2026-08-27T00:00:00.000Z' };

let draftRoot: string;

beforeEach(() => {
  draftRoot = mkdtempSync(join(tmpdir(), 'pax-authoring-diff-'));
});

afterEach(() => {
  rmSync(draftRoot, { recursive: true, force: true });
});

function scaffold(manifest: unknown, draftId = 'apartment-hunt'): void {
  packScaffold(draftRoot, {
    draftId,
    files: [{ relativePath: 'pack.json', content: JSON.stringify(manifest) }],
  });
}

describe('packDiff', () => {
  it('reports every criterion/obligation/attribute as added when nothing is installed yet', () => {
    scaffold(validManifest());
    const result = packDiff(draftRoot, validCatalog(), new PackRegistry(), FIXED_CLOCK, {
      draftId: 'apartment-hunt',
    });
    expect(result.installedVersion).toBeUndefined();
    expect(result.compiledHashChanged).toBe(true);
    expect(result.attributes.added).toContain('apt.rent');
    expect(result.criteria.added).toContain('apt.budget');
  });

  it('reports no differences when the draft is identical to the installed version', () => {
    const registry = new PackRegistry();
    registry.register(compilePack(validManifest(), validCatalog(), FIXED_CLOCK));
    scaffold(validManifest());

    const result = packDiff(draftRoot, validCatalog(), registry, FIXED_CLOCK, {
      draftId: 'apartment-hunt',
    });
    expect(result.installedVersion).toBe('1.0.0');
    expect(result.compiledHashChanged).toBe(false);
    expect(result.attributes).toEqual({ added: [], removed: [] });
    expect(result.criteria).toEqual({ added: [], removed: [] });
  });

  it('reports an added attribute and a changed hash for a draft that adds a new attribute', () => {
    const registry = new PackRegistry();
    registry.register(compilePack(validManifest(), validCatalog(), FIXED_CLOCK));

    const withExtraAttribute = validManifest({
      attributes: [
        ...validManifest().attributes,
        {
          id: 'apt.pet_policy',
          label: 'Pet policy',
          valueType: 'string',
          required: false,
          appliesTo: ['unit'],
          evidenceExpectation: 'assertion',
          comparison: 'none',
          sensitive: false,
        },
      ],
      presentation: {
        optionLabel: 'Apartment',
        optionLabelPlural: 'Apartments',
        attributeGroups: [
          { id: 'basics', label: 'Basics', attributeIds: ['apt.rent', 'apt.pet_policy'] },
        ],
      },
    });
    scaffold(withExtraAttribute);

    const result = packDiff(draftRoot, validCatalog(), registry, FIXED_CLOCK, {
      draftId: 'apartment-hunt',
    });
    expect(result.installedVersion).toBe('1.0.0');
    expect(result.compiledHashChanged).toBe(true);
    expect(result.attributes.added).toEqual(['apt.pet_policy']);
    expect(result.attributes.removed).toEqual([]);
  });

  it('throws PackDiffValidationFailedError when the draft does not compile', () => {
    scaffold({ schemaVersion: '1.0' }, 'broken');
    expect(() =>
      packDiff(draftRoot, validCatalog(), new PackRegistry(), FIXED_CLOCK, { draftId: 'broken' }),
    ).toThrow(PackDiffValidationFailedError);
  });
});
