/**
 * Proves the public/production boot path has authoring disabled
 * (docs/specs/pack-authoring.md: "disabled in the unauthenticated public
 * hackathon deployment"; testing.md's conformance-test list: "the public
 * deployment has authoring disabled").
 *
 * Two independent, structural facts are proven, without editing
 * `server.ts` (out of this task's scope -- owned by concurrent work, may
 * only be read):
 *
 * 1. `server.ts` calls `loadConfig()` with no arguments (confirmed by
 *    reading its real source below) -- i.e. the exact production
 *    configuration path is `loadConfig(process.env)` with nothing
 *    authoring-specific set. `config.test.ts` already proves that call
 *    yields `authoringEnabled: false` by default; this file restates that
 *    fact scoped explicitly to "this is the real boot path", not merely "a
 *    default value somewhere".
 * 2. `server.ts`'s real source text contains no reference at all to the
 *    authoring module, an authoring HTTP route, or the CLI's `pack:author`
 *    command -- there is no publicly reachable authoring endpoint for
 *    `PAX_AUTHORING_ENABLED` to even need to gate. Authoring is reachable
 *    only through `pnpm pax pack:author` (`scripts/pax-cli.ts`), a local
 *    developer command, never through the deployed HTTP service.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { PackRegistry } from '@pax/packs';
import { AuthoringDisabledError, buildPackAuthoringAgent } from './strands-agent.js';
import { buildInstalledCapabilityCatalog } from './catalog.js';

const SERVER_TS_PATH = fileURLToPath(new URL('../server.ts', import.meta.url));

describe('public deployment has authoring disabled', () => {
  it('server.ts calls loadConfig() with no arguments (the real production config path)', () => {
    const serverSource = readFileSync(SERVER_TS_PATH, 'utf8');
    expect(serverSource).toMatch(/loadConfig\(\s*\)/);
  });

  it('that exact call (loadConfig with no PAX_AUTHORING_ENABLED set) yields authoringEnabled: false', () => {
    expect(loadConfig({}).authoringEnabled).toBe(false);
  });

  it('server.ts wires no authoring route, CLI command, or bounded-tool reference at all', () => {
    const serverSource = readFileSync(SERVER_TS_PATH, 'utf8');
    expect(serverSource).not.toMatch(/authoring/i);
    expect(serverSource).not.toMatch(/pack[_:]author/i);
    expect(serverSource).not.toMatch(/pack_publish|pack_scaffold|pack_validate/);
  });

  it('the authoring agent structurally refuses to construct under the production default', () => {
    const config = loadConfig({});
    const registry = new PackRegistry();
    expect(() =>
      buildPackAuthoringAgent({
        model: 'unused',
        authoringEnabled: config.authoringEnabled,
        ctx: {
          draftRoot: '/tmp/unused',
          catalog: buildInstalledCapabilityCatalog(registry),
          registry,
          clock: { now: () => new Date().toISOString() },
        },
      }),
    ).toThrow(AuthoringDisabledError);
  });
});
