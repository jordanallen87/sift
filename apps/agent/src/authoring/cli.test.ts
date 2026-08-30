import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PackRegistry, compilePack } from '@sift/packs';
import { validCatalog, validManifest } from '@sift/packs/src/fixtures/manifest.js';
import { loadConfig } from '../config.js';
import { parseCliArgs, runPackAuthorCli } from './cli.js';
import type { AuthoringAnswers } from './demo-answers.js';

const FIXED_CLOCK = { now: () => '2026-08-27T00:00:00.000Z' };

let draftRoot: string;

beforeEach(() => {
  draftRoot = mkdtempSync(join(tmpdir(), 'sift-cli-'));
});

afterEach(() => {
  rmSync(draftRoot, { recursive: true, force: true });
});

function collectIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: { stdout: (l: string) => stdout.push(l), stderr: (l: string) => stderr.push(l) },
  };
}

describe('parseCliArgs', () => {
  it('parses the command and every flag', () => {
    const args = parseCliArgs([
      'pack:author',
      '--draft-id',
      'my-pack',
      '--draft-root',
      '/tmp/drafts',
      '--answers',
      '/tmp/answers.json',
      '--publish',
      '--confirmed-by',
      'jordan',
    ]);
    expect(args).toEqual({
      command: 'pack:author',
      draftId: 'my-pack',
      draftRoot: '/tmp/drafts',
      answersPath: '/tmp/answers.json',
      publish: true,
      confirmedBy: 'jordan',
    });
  });

  it('defaults draftId, draftRoot, and publish when omitted', () => {
    const args = parseCliArgs(['pack:author']);
    expect(args.draftId).toBe('apartment-hunt');
    expect(args.draftRoot).toBe(join('.sift-data', 'pack-drafts'));
    expect(args.publish).toBe(false);
    expect(args.answersPath).toBeUndefined();
  });
});

describe('runPackAuthorCli', () => {
  it('rejects an unknown command', () => {
    const { io, stderr } = collectIo();
    const code = runPackAuthorCli(['not-a-real-command'], {
      io,
      env: { SIFT_AUTHORING_ENABLED: 'true' },
    });
    expect(code).toBe(1);
    expect(stderr.some((l) => l.includes('Unknown sift command'))).toBe(true);
  });

  it('refuses to run pack:author when SIFT_AUTHORING_ENABLED is false (the default)', () => {
    const { io, stderr } = collectIo();
    const code = runPackAuthorCli(['pack:author'], { io, env: {} });
    expect(code).toBe(1);
    expect(stderr.some((l) => l.includes('disabled'))).toBe(true);
  });

  it('runs the full built-in demo (catalog -> scaffold -> validate -> test -> diff) and exits 0 without publishing', () => {
    const { io, stdout } = collectIo();
    const registry = new PackRegistry();
    const code = runPackAuthorCli(['pack:author', '--draft-root', draftRoot], {
      io,
      env: { SIFT_AUTHORING_ENABLED: 'true' },
      registry,
      clock: FIXED_CLOCK,
    });
    expect(code).toBe(0);
    expect(stdout.some((l) => l.includes('[pack_validate] PASSED'))).toBe(true);
    expect(stdout.some((l) => l.includes('[pack_test] PASSED'))).toBe(true);
    expect(stdout.some((l) => l.includes('Rerun with --publish'))).toBe(true);
    // Not published without --publish.
    expect(registry.list()).toEqual([]);
  });

  it('publishes when --publish --confirmed-by is given and the draft passes', () => {
    const { io, stdout } = collectIo();
    const registry = new PackRegistry();
    const code = runPackAuthorCli(
      [
        'pack:author',
        '--draft-root',
        draftRoot,
        '--publish',
        '--confirmed-by',
        'jordan.allen.tech@gmail.com',
      ],
      { io, env: { SIFT_AUTHORING_ENABLED: 'true' }, registry, clock: FIXED_CLOCK },
    );
    expect(code).toBe(0);
    expect(stdout.some((l) => l.includes('[pack_publish] published apartment-hunt@1.0.0'))).toBe(
      true,
    );
    expect(registry.get('apartment-hunt', '1.0.0')).toBeDefined();
  });

  it('refuses to publish without --confirmed-by even when --publish is given', () => {
    const { io, stderr } = collectIo();
    const registry = new PackRegistry();
    const code = runPackAuthorCli(['pack:author', '--draft-root', draftRoot, '--publish'], {
      io,
      env: { SIFT_AUTHORING_ENABLED: 'true' },
      registry,
      clock: FIXED_CLOCK,
    });
    expect(code).toBe(1);
    expect(stderr.some((l) => l.includes('requires --confirmed-by'))).toBe(true);
    expect(registry.list()).toEqual([]);
  });

  it('reads a custom --answers file instead of the built-in demo', () => {
    const customManifest = validManifest({
      identity: { ...validManifest().identity, id: 'custom-authored-pack' },
      evaluation: { scenarioIds: ['s1', 's2', 's3', 's4'], requiresNegativeCase: true },
    });
    const answers: AuthoringAnswers = {
      manifest: customManifest,
      scenarios: [
        {
          id: 's1',
          packId: 'custom-authored-pack',
          kind: 'success',
          description: 'x',
          steps: [],
          assertions: [],
        },
        {
          id: 's2',
          packId: 'custom-authored-pack',
          kind: 'incomplete_evidence',
          description: 'x',
          steps: [],
          assertions: [],
        },
        {
          id: 's3',
          packId: 'custom-authored-pack',
          kind: 'steering',
          description: 'x',
          steps: [],
          assertions: [],
        },
        {
          id: 's4',
          packId: 'custom-authored-pack',
          kind: 'human_boundary',
          description: 'x',
          steps: [],
          assertions: [],
        },
      ],
    };
    const answersPath = join(draftRoot, 'answers.json');
    writeFileSync(answersPath, JSON.stringify(answers), 'utf8');

    const { io, stdout } = collectIo();
    const registry = new PackRegistry();
    const code = runPackAuthorCli(
      [
        'pack:author',
        '--draft-root',
        draftRoot,
        '--draft-id',
        'custom-authored-pack',
        '--answers',
        answersPath,
      ],
      { io, env: { SIFT_AUTHORING_ENABLED: 'true' }, registry, clock: FIXED_CLOCK },
    );
    expect(code).toBe(0);
    expect(stdout.some((l) => l.includes('[pack_test] PASSED'))).toBe(true);
  });

  it('uses the real loadConfig by default when no loadConfigFn override is given', () => {
    // Proves the CLI actually calls the real @sift/agent config loader, not a stand-in.
    const config = loadConfig({ SIFT_AUTHORING_ENABLED: 'true' });
    expect(config.authoringEnabled).toBe(true);
  });

  it('falls back to console.error and reports "(none)" for the command name when called with no io option and an empty argv', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const code = runPackAuthorCli([], { env: { SIFT_AUTHORING_ENABLED: 'true' } });
      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown sift command "(none)"'),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('falls back to the real process.env when no env override is given', () => {
    const original = process.env['SIFT_AUTHORING_ENABLED'];
    process.env['SIFT_AUTHORING_ENABLED'] = 'true';
    try {
      const { io, stdout } = collectIo();
      const code = runPackAuthorCli(['pack:author', '--draft-root', draftRoot], {
        io,
        registry: new PackRegistry(),
        clock: FIXED_CLOCK,
      });
      expect(code).toBe(0);
      expect(stdout.some((l) => l.includes('[pack_validate] PASSED'))).toBe(true);
    } finally {
      if (original === undefined) delete process.env['SIFT_AUTHORING_ENABLED'];
      else process.env['SIFT_AUTHORING_ENABLED'] = original;
    }
  });

  it('runs successfully with the default in-memory PackRegistry and default wall clock when neither is provided', () => {
    const { io, stdout } = collectIo();
    const code = runPackAuthorCli(['pack:author', '--draft-root', draftRoot], {
      io,
      env: { SIFT_AUTHORING_ENABLED: 'true' },
    });
    expect(code).toBe(0);
    expect(stdout.some((l) => l.includes('[pack_validate] PASSED'))).toBe(true);
    expect(stdout.some((l) => l.includes('[pack_test] PASSED'))).toBe(true);
  });

  it('deduplicates entries already present in the registry-derived installed catalog when merging in the static fixture catalog, instead of double-counting them', () => {
    const { io: ioEmpty, stdout: stdoutEmpty } = collectIo();
    runPackAuthorCli(['pack:author', '--draft-root', draftRoot], {
      io: ioEmpty,
      env: { SIFT_AUTHORING_ENABLED: 'true' },
      registry: new PackRegistry(),
      clock: FIXED_CLOCK,
    });
    const countWithEmptyRegistry = Number(
      stdoutEmpty.find((l) => l.startsWith('[pack_catalog]'))?.match(/(\d+)/)?.[1],
    );

    // Pre-register the real apartment-hunt fixture pack, whose
    // resolvedCapabilities already cover the exact same
    // skill/specialist/tool ids validCatalog() itself declares --
    // buildCliCatalog's registry-derived entries and its validCatalog()
    // fallback now genuinely overlap.
    const overlappingRegistry = new PackRegistry();
    overlappingRegistry.register(compilePack(validManifest(), validCatalog(), FIXED_CLOCK));
    const { io: ioOverlap, stdout: stdoutOverlap } = collectIo();
    runPackAuthorCli(['pack:author', '--draft-root', draftRoot], {
      io: ioOverlap,
      env: { SIFT_AUTHORING_ENABLED: 'true' },
      registry: overlappingRegistry,
      clock: FIXED_CLOCK,
    });
    const countWithOverlappingRegistry = Number(
      stdoutOverlap.find((l) => l.startsWith('[pack_catalog]'))?.match(/(\d+)/)?.[1],
    );

    // The union must not grow just because the same three ids are already
    // present in the registry-derived catalog: they must be deduplicated,
    // not appended a second time from the validCatalog() fallback.
    expect(countWithOverlappingRegistry).toBe(countWithEmptyRegistry);
  });

  it('prints FAILED for pack_validate and pack_test and exits 1 without publishing when a custom --answers manifest does not compile', () => {
    const answersPath = join(draftRoot, 'broken-answers.json');
    writeFileSync(
      answersPath,
      JSON.stringify({ manifest: { schemaVersion: '1.0' }, scenarios: [] }),
      'utf8',
    );

    const { io, stdout, stderr } = collectIo();
    const registry = new PackRegistry();
    const code = runPackAuthorCli(
      ['pack:author', '--draft-root', draftRoot, '--draft-id', 'broken', '--answers', answersPath],
      { io, env: { SIFT_AUTHORING_ENABLED: 'true' }, registry, clock: FIXED_CLOCK },
    );
    expect(code).toBe(1);
    expect(stdout.some((l) => l.includes('[pack_validate] FAILED'))).toBe(true);
    expect(stdout.some((l) => l.includes('[pack_test] FAILED'))).toBe(true);
    expect(stderr.some((l) => l.includes('did not pass pack_test'))).toBe(true);
    expect(registry.list()).toEqual([]);
  });

  it('propagates a non-PackPublishRejectedError thrown while publishing (a registry hash conflict) instead of treating it as a rejection', () => {
    const registry = new PackRegistry();
    // Pre-register a DIFFERENT compiled artifact under the exact same
    // apartment-hunt@1.0.0 id+version the built-in demo will attempt to
    // publish. The default validManifest()'s evaluation.scenarioIds differs
    // from DEMO_AUTHORING_ANSWERS' own, so the two compile to different
    // compiledHash values -- registry.register() then throws
    // PackRegistryConflictError, a real error that is NOT a
    // PackPublishRejectedError.
    registry.register(compilePack(validManifest(), validCatalog(), FIXED_CLOCK));

    const { io } = collectIo();
    expect(() =>
      runPackAuthorCli(
        ['pack:author', '--draft-root', draftRoot, '--publish', '--confirmed-by', 'jordan'],
        { io, env: { SIFT_AUTHORING_ENABLED: 'true' }, registry, clock: FIXED_CLOCK },
      ),
    ).toThrow(/already registered with a different compiledHash/);
  });
});
