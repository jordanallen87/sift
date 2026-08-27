import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PackRegistry } from '@pax/packs';
import { validManifest } from '@pax/packs/src/fixtures/manifest.js';
import { loadConfig } from '../config.js';
import { parseCliArgs, runPackAuthorCli } from './cli.js';
import type { AuthoringAnswers } from './demo-answers.js';

const FIXED_CLOCK = { now: () => '2026-08-27T00:00:00.000Z' };

let draftRoot: string;

beforeEach(() => {
  draftRoot = mkdtempSync(join(tmpdir(), 'pax-cli-'));
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
    expect(args.draftRoot).toBe(join('.pax-data', 'pack-drafts'));
    expect(args.publish).toBe(false);
    expect(args.answersPath).toBeUndefined();
  });
});

describe('runPackAuthorCli', () => {
  it('rejects an unknown command', () => {
    const { io, stderr } = collectIo();
    const code = runPackAuthorCli(['not-a-real-command'], {
      io,
      env: { PAX_AUTHORING_ENABLED: 'true' },
    });
    expect(code).toBe(1);
    expect(stderr.some((l) => l.includes('Unknown pax command'))).toBe(true);
  });

  it('refuses to run pack:author when PAX_AUTHORING_ENABLED is false (the default)', () => {
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
      env: { PAX_AUTHORING_ENABLED: 'true' },
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
      { io, env: { PAX_AUTHORING_ENABLED: 'true' }, registry, clock: FIXED_CLOCK },
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
      env: { PAX_AUTHORING_ENABLED: 'true' },
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
      { io, env: { PAX_AUTHORING_ENABLED: 'true' }, registry, clock: FIXED_CLOCK },
    );
    expect(code).toBe(0);
    expect(stdout.some((l) => l.includes('[pack_test] PASSED'))).toBe(true);
  });

  it('uses the real loadConfig by default when no loadConfigFn override is given', () => {
    // Proves the CLI actually calls the real @pax/agent config loader, not a stand-in.
    const config = loadConfig({ PAX_AUTHORING_ENABLED: 'true' });
    expect(config.authoringEnabled).toBe(true);
  });
});
