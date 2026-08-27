import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PackRegistry } from '@pax/packs';
import { validCatalog, validManifest } from '@pax/packs/src/fixtures/manifest.js';
import { packScaffold } from './scaffold.js';
import { PackPublishRejectedError, packPublish } from './publish.js';
import type { AuthoringScenarioFile } from './scenario-coverage.js';

const FIXED_CLOCK = { now: () => '2026-08-27T00:00:00.000Z' };

let draftRoot: string;

beforeEach(() => {
  draftRoot = mkdtempSync(join(tmpdir(), 'pax-authoring-publish-'));
});

afterEach(() => {
  rmSync(draftRoot, { recursive: true, force: true });
});

function scenarioFile(overrides: Partial<AuthoringScenarioFile> = {}): AuthoringScenarioFile {
  return {
    id: 'apt-success',
    packId: 'apartment-hunt',
    kind: 'success',
    description: 'x',
    steps: [],
    assertions: [],
    ...overrides,
  };
}

function scaffoldPublishableDraft(draftId = 'apartment-hunt'): void {
  const scenarios = [
    scenarioFile({ id: 'apt-success', kind: 'success' }),
    scenarioFile({ id: 'apt-incomplete', kind: 'incomplete_evidence' }),
    scenarioFile({ id: 'apt-steering', kind: 'steering' }),
    scenarioFile({ id: 'apt-boundary', kind: 'human_boundary' }),
  ];
  const manifest = validManifest({
    evaluation: { scenarioIds: scenarios.map((s) => s.id), requiresNegativeCase: true },
  });
  packScaffold(draftRoot, {
    draftId,
    files: [
      { relativePath: 'pack.json', content: JSON.stringify(manifest) },
      ...scenarios.map((scenario) => ({
        relativePath: `scenarios/${scenario.id}.json`,
        content: JSON.stringify(scenario),
      })),
    ],
  });
}

describe('packPublish — structural human-actor enforcement', () => {
  it('rejects actor "agent" unconditionally, even when everything else is valid and confirmed', () => {
    scaffoldPublishableDraft();
    const registry = new PackRegistry();
    expect(() =>
      packPublish(draftRoot, validCatalog(), registry, FIXED_CLOCK, {
        draftId: 'apartment-hunt',
        actor: 'agent',
        confirmed: true,
        confirmedBy: 'model-attempting-self-approval',
      }),
    ).toThrow(PackPublishRejectedError);
    expect(registry.list()).toEqual([]);
  });

  it('rejects an actor value outside the enum at the schema layer before the actor check ever runs', () => {
    scaffoldPublishableDraft();
    expect(() =>
      packPublish(draftRoot, validCatalog(), new PackRegistry(), FIXED_CLOCK, {
        draftId: 'apartment-hunt',
        actor: 'system',
        confirmed: true,
        confirmedBy: 'x',
      }),
    ).toThrow();
  });

  it('publishes for actor "human" with confirmed: true and a fully valid, covered draft', () => {
    scaffoldPublishableDraft();
    const registry = new PackRegistry();
    const compiled = packPublish(draftRoot, validCatalog(), registry, FIXED_CLOCK, {
      draftId: 'apartment-hunt',
      actor: 'human',
      confirmed: true,
      confirmedBy: 'pack-author@example.com',
    });
    expect(compiled.identity.id).toBe('apartment-hunt');
    expect(registry.get('apartment-hunt', '1.0.0')).toBeDefined();
  });

  it('rejects a human actor without explicit confirmed: true', () => {
    scaffoldPublishableDraft();
    const registry = new PackRegistry();
    expect(() =>
      packPublish(draftRoot, validCatalog(), registry, FIXED_CLOCK, {
        draftId: 'apartment-hunt',
        actor: 'human',
        confirmed: false,
        confirmedBy: 'pack-author@example.com',
      }),
    ).toThrow(PackPublishRejectedError);
    expect(registry.list()).toEqual([]);
  });

  it('rejects a draft missing required negative scenario coverage even for a confirmed human actor', () => {
    // Only a success scenario -- no incomplete-evidence/steering/human-boundary coverage.
    const manifest = validManifest({
      evaluation: { scenarioIds: ['apt-success'], requiresNegativeCase: true },
    });
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [
        { relativePath: 'pack.json', content: JSON.stringify(manifest) },
        { relativePath: 'scenarios/apt-success.json', content: JSON.stringify(scenarioFile()) },
      ],
    });
    const registry = new PackRegistry();
    expect(() =>
      packPublish(draftRoot, validCatalog(), registry, FIXED_CLOCK, {
        draftId: 'apartment-hunt',
        actor: 'human',
        confirmed: true,
        confirmedBy: 'x',
      }),
    ).toThrow(PackPublishRejectedError);
    expect(registry.list()).toEqual([]);
  });

  it('rejects a draft with an undeclared/unresolved capability even for a confirmed human actor', () => {
    const manifest = validManifest({
      tools: [
        { id: 'not-installed', description: 'x', effect: 'consequential', requiresApproval: true },
      ],
      specialists: [
        {
          id: 'deal-analyst',
          description: 'x',
          allowedTools: ['not-installed'],
          allowedSkills: ['listing-normalizer'],
        },
      ],
      policies: [
        {
          id: 'calculator-approval',
          description: 'x',
          requiresHumanApproval: true,
          appliesToToolIds: ['not-installed'],
        },
      ],
    });
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [{ relativePath: 'pack.json', content: JSON.stringify(manifest) }],
    });
    const registry = new PackRegistry();
    expect(() =>
      packPublish(draftRoot, validCatalog(), registry, FIXED_CLOCK, {
        draftId: 'apartment-hunt',
        actor: 'human',
        confirmed: true,
        confirmedBy: 'x',
      }),
    ).toThrow(PackPublishRejectedError);
    expect(registry.list()).toEqual([]);
  });

  it('rejects executable content (a <script> tag in README.md) even for a confirmed human actor', () => {
    scaffoldPublishableDraft();
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [{ relativePath: 'README.md', content: '<script>alert(1)</script>' }],
    });
    const registry = new PackRegistry();
    expect(() =>
      packPublish(draftRoot, validCatalog(), registry, FIXED_CLOCK, {
        draftId: 'apartment-hunt',
        actor: 'human',
        confirmed: true,
        confirmedBy: 'x',
      }),
    ).toThrow(PackPublishRejectedError);
    expect(registry.list()).toEqual([]);
  });

  it.each([
    { confirmed: true, confirmedBy: 'model-A' },
    { confirmed: false, confirmedBy: 'model-A' },
    { confirmed: true, confirmedBy: 'a fully spoofed human-sounding name' },
  ])(
    'no combination of confirmed/confirmedBy ever lets a non-human actor register a pack ($confirmed, $confirmedBy)',
    ({ confirmed, confirmedBy }) => {
      scaffoldPublishableDraft();
      const registry = new PackRegistry();
      expect(() =>
        packPublish(draftRoot, validCatalog(), registry, FIXED_CLOCK, {
          draftId: 'apartment-hunt',
          actor: 'agent',
          confirmed,
          confirmedBy,
        }),
      ).toThrow(PackPublishRejectedError);
      expect(registry.list()).toEqual([]);
    },
  );
});
