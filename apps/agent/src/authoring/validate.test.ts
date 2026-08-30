import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PackCompilationError } from '@sift/packs';
import { validCatalog, validManifest } from '@sift/packs/src/fixtures/manifest.js';
import { packScaffold } from './scaffold.js';
import { PackDraftNotFoundError, packValidate } from './validate.js';

const FIXED_CLOCK = { now: () => '2026-08-27T00:00:00.000Z' };

let draftRoot: string;

beforeEach(() => {
  draftRoot = mkdtempSync(join(tmpdir(), 'sift-authoring-validate-'));
});

afterEach(() => {
  rmSync(draftRoot, { recursive: true, force: true });
});

function scaffoldManifest(draftId: string, manifest: unknown): void {
  packScaffold(draftRoot, {
    draftId,
    files: [{ relativePath: 'pack.json', content: JSON.stringify(manifest) }],
  });
}

describe('packValidate', () => {
  it('passes for the real, valid apartment-hunt fixture manifest and returns a compiled pack', () => {
    scaffoldManifest('apartment-hunt', validManifest());
    const result = packValidate(draftRoot, validCatalog(), FIXED_CLOCK, {
      draftId: 'apartment-hunt',
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.compiled?.identity.id).toBe('apartment-hunt');
    expect(result.compiled?.compiledHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports a schema issue for a structurally invalid manifest without throwing', () => {
    scaffoldManifest('bad-schema', { schemaVersion: '1.0' });
    const result = packValidate(draftRoot, validCatalog(), FIXED_CLOCK, { draftId: 'bad-schema' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.step === 'schema')).toBe(true);
  });

  it('reports an unknown_capability issue when the manifest references an uninstalled tool', () => {
    scaffoldManifest(
      'unknown-tool',
      validManifest({
        tools: [
          {
            id: 'not-installed-tool',
            description: 'x',
            effect: 'consequential',
            requiresApproval: true,
          },
        ],
        specialists: [
          {
            id: 'deal-analyst',
            description: 'x',
            allowedTools: ['not-installed-tool'],
            allowedSkills: ['listing-normalizer'],
          },
        ],
        policies: [
          {
            id: 'calculator-approval',
            description: 'x',
            requiresHumanApproval: true,
            appliesToToolIds: ['not-installed-tool'],
          },
        ],
      }),
    );
    const result = packValidate(draftRoot, validCatalog(), FIXED_CLOCK, {
      draftId: 'unknown-tool',
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.step === 'unknown_capability')).toBe(true);
  });

  it('throws PackDraftNotFoundError when pack_scaffold has never been run for this draft', () => {
    expect(() =>
      packValidate(draftRoot, validCatalog(), FIXED_CLOCK, { draftId: 'never-scaffolded' }),
    ).toThrow(PackDraftNotFoundError);
  });

  it('throws PackDraftNotFoundError for malformed JSON', () => {
    packScaffold(draftRoot, {
      draftId: 'bad-json',
      files: [{ relativePath: 'pack.json', content: '{not valid json' }],
    });
    expect(() =>
      packValidate(draftRoot, validCatalog(), FIXED_CLOCK, { draftId: 'bad-json' }),
    ).toThrow(PackDraftNotFoundError);
  });

  it('reports a security issue for HTML/script content in README.md (a file the manifest schema never sees)', () => {
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [
        { relativePath: 'pack.json', content: JSON.stringify(validManifest()) },
        { relativePath: 'README.md', content: '<script>alert(1)</script>' },
      ],
    });
    const result = packValidate(draftRoot, validCatalog(), FIXED_CLOCK, {
      draftId: 'apartment-hunt',
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.step === 'security')).toBe(true);
    // The manifest itself still compiles cleanly -- the security issue is
    // reported alongside a real compiled artifact, not instead of one.
    expect(result.compiled).toBeDefined();
  });

  it('reports a security issue for a javascript: URL inside a skill SKILL.md', () => {
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [
        { relativePath: 'pack.json', content: JSON.stringify(validManifest()) },
        {
          relativePath: 'skills/listing-normalizer/SKILL.md',
          content: '---\nname: listing-normalizer\n---\n[click](javascript:doEvil())',
        },
      ],
    });
    const result = packValidate(draftRoot, validCatalog(), FIXED_CLOCK, {
      draftId: 'apartment-hunt',
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.step === 'security')).toBe(true);
  });

  it('flags a file present in the draft directory that does not match the bundle shape as draft_shape (not silently trusted)', () => {
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [{ relativePath: 'pack.json', content: JSON.stringify(validManifest()) }],
    });
    // Simulate something landing in the draft directory through a path
    // other than pack_scaffold (e.g. a human hand-editing the draft).
    mkdirSync(join(draftRoot, 'apartment-hunt', 'scripts'), { recursive: true });
    writeFileSync(join(draftRoot, 'apartment-hunt', 'scripts', 'evil.js'), 'evil()');

    const result = packValidate(draftRoot, validCatalog(), FIXED_CLOCK, {
      draftId: 'apartment-hunt',
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.step === 'draft_shape')).toBe(true);
  });

  it('rethrows a non-PackCompilationError raised while compiling (e.g. a clock whose now() is not a real ISO timestamp) instead of swallowing it as a validation issue', () => {
    scaffoldManifest('apartment-hunt', validManifest());
    // A manifest that fully passes DecisionPackManifestSchema and every
    // compiler check still runs through compilePack's own final
    // `CompiledDecisionPackSchema.parse(compiled)` defense-in-depth
    // self-check (packages/packs/src/compiler.ts), which requires
    // `compiledAt` to satisfy `z.iso.datetime()`. A Clock whose `now()`
    // does not return a real ISO datetime string makes that final `.parse()`
    // throw a raw ZodError -- a real, non-PackCompilationError exception
    // compilePack can genuinely raise.
    const brokenClock = { now: () => 'not-a-real-iso-timestamp' };
    let caught: unknown;
    try {
      packValidate(draftRoot, validCatalog(), brokenClock, { draftId: 'apartment-hunt' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(PackCompilationError);
  });
});
