import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PackScaffoldRejectedError,
  draftDirFor,
  matchesBundleShape,
  packScaffold,
  walkDraftFiles,
} from './scaffold.js';

let draftRoot: string;

beforeEach(() => {
  draftRoot = mkdtempSync(join(tmpdir(), 'pax-authoring-scaffold-'));
});

afterEach(() => {
  rmSync(draftRoot, { recursive: true, force: true });
});

describe('matchesBundleShape', () => {
  it('accepts every declared bundle file shape', () => {
    expect(matchesBundleShape('pack.json')).toBe(true);
    expect(matchesBundleShape('README.md')).toBe(true);
    expect(matchesBundleShape('skills/listing-normalizer/SKILL.md')).toBe(true);
    expect(matchesBundleShape('fixtures/apt-success/listing.json')).toBe(true);
    expect(matchesBundleShape('scenarios/apt-success.json')).toBe(true);
  });

  it('rejects a real TypeScript test file (reserved for human/developer review, not authoring tools)', () => {
    expect(matchesBundleShape('tests/apartment-hunt.conformance.test.ts')).toBe(false);
  });

  it('rejects an arbitrary executable-looking file', () => {
    expect(matchesBundleShape('scripts/evil.js')).toBe(false);
    expect(matchesBundleShape('run.sh')).toBe(false);
  });
});

describe('packScaffold', () => {
  it('writes a declarative file under the draft directory', () => {
    const result = packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [{ relativePath: 'pack.json', content: '{"schemaVersion":"1.0"}' }],
    });

    expect(result.draftDir).toBe(draftDirFor(draftRoot, 'apartment-hunt'));
    expect(result.written).toHaveLength(1);
    const written = readFileSync(join(result.draftDir, 'pack.json'), 'utf8');
    expect(written).toBe('{"schemaVersion":"1.0"}');
  });

  it('creates nested directories as needed (skills/<id>/SKILL.md)', () => {
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [
        {
          relativePath: 'skills/pet-sensory-fit/SKILL.md',
          content: '---\nname: pet-sensory-fit\n---\nBody.',
        },
      ],
    });
    const content = readFileSync(
      join(draftDirFor(draftRoot, 'apartment-hunt'), 'skills', 'pet-sensory-fit', 'SKILL.md'),
      'utf8',
    );
    expect(content).toContain('pet-sensory-fit');
  });

  it('rejects a path-traversal attempt and writes nothing', () => {
    expect(() =>
      packScaffold(draftRoot, {
        draftId: 'apartment-hunt',
        files: [{ relativePath: '../../../../../../etc/passwd', content: 'pwned' }],
      }),
    ).toThrow(PackScaffoldRejectedError);
    // Nothing escaped the draft root -- prove the parent of draftRoot gained no new file.
    expect(walkDraftFiles(draftRoot)).toEqual([]);
  });

  it('rejects a traversal attempt disguised inside an otherwise-allowed shape', () => {
    expect(() =>
      packScaffold(draftRoot, {
        draftId: 'apartment-hunt',
        files: [{ relativePath: 'skills/../../outside/SKILL.md', content: 'pwned' }],
      }),
    ).toThrow(PackScaffoldRejectedError);
  });

  it('rejects a file that does not match the pack bundle layout, even inside the draft directory', () => {
    expect(() =>
      packScaffold(draftRoot, {
        draftId: 'apartment-hunt',
        files: [{ relativePath: 'tests/apartment-hunt.conformance.test.ts', content: 'evil()' }],
      }),
    ).toThrow(PackScaffoldRejectedError);
  });

  it('rejects an empty draftId or empty files array at the schema layer', () => {
    expect(() => packScaffold(draftRoot, { draftId: '', files: [] })).toThrow();
    expect(() => packScaffold(draftRoot, { draftId: 'x', files: [] })).toThrow();
  });

  it('rejects a draftId containing path-traversal-shaped characters at the schema layer', () => {
    expect(() =>
      packScaffold(draftRoot, {
        draftId: '../outside',
        files: [{ relativePath: 'pack.json', content: '{}' }],
      }),
    ).toThrow();
  });
});

describe('walkDraftFiles', () => {
  it('returns POSIX-relative paths for every file under a draft directory, including nested ones', () => {
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [
        { relativePath: 'pack.json', content: '{}' },
        { relativePath: 'skills/pet-sensory-fit/SKILL.md', content: 'x' },
      ],
    });
    const files = walkDraftFiles(draftDirFor(draftRoot, 'apartment-hunt')).sort();
    expect(files).toEqual(['pack.json', 'skills/pet-sensory-fit/SKILL.md']);
  });

  it('returns an empty array for a draft directory that does not exist yet', () => {
    expect(walkDraftFiles(draftDirFor(draftRoot, 'never-scaffolded'))).toEqual([]);
  });
});
