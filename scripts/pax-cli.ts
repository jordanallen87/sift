#!/usr/bin/env tsx
/**
 * `pnpm pax <command> [...args]` -- the top-level `pax` CLI entry point
 * pnpm's own argument-forwarding convention makes `pnpm pax pack:author`
 * work directly (docs/specs/pack-authoring.md: "The initial authoring entry
 * point is `pnpm pax pack:author`").
 *
 * This file is a thin dispatcher only, matching this repo's existing
 * `scripts/*.ts` convention (`verify.ts`, `check-source.ts`): the real,
 * tested logic lives in `apps/agent/src/authoring/cli.ts`
 * (`runPackAuthorCli`), which this file imports directly. `apps/agent`'s own
 * package.json declares every dependency that module needs
 * (`@pax/contracts`, `@pax/core`, `@pax/packs`, `zod`, ...); Node resolves
 * them relative to that file's own location regardless of which script
 * imported it, so this cross-package import works the same way any other
 * relative TypeScript import in this monorepo does.
 *
 * The only currently supported subcommand is `pack:author`. An unrecognized
 * subcommand exits non-zero with a clear message rather than doing nothing.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runPackAuthorCli } from '../apps/agent/src/authoring/cli.js';

function isMain(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return resolve(invoked) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const exitCode = runPackAuthorCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
