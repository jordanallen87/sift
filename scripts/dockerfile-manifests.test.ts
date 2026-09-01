/**
 * Guards the Dockerfile's hand-maintained list of workspace `package.json`
 * copies against workspace drift.
 *
 * The Dockerfile copies each workspace manifest individually before running
 * `pnpm install --frozen-lockfile`, so that a source-only change reuses the
 * cached dependency layer. That optimization is worth having, but it
 * duplicates the workspace membership that `pnpm-workspace.yaml` already
 * declares — and a duplicated list drifts.
 *
 * It had already drifted twice, in both directions, and neither showed up in
 * any local gate:
 *
 *  - `packages/ui` was still copied after the package was deleted. `COPY` of
 *    a path that does not exist is a hard build failure, so the next Railway
 *    deploy would have died at image build with no local test able to
 *    predict it.
 *  - `packages/catalog` was never added when that package was created, so
 *    the install step ran against a workspace missing one of its own
 *    members while `pnpm-lock.yaml` still carried an importer entry for it.
 *
 * Both are invisible to `pnpm verify`, which never builds the image. This
 * test makes the drift a unit-test failure in the fastest suite in the repo
 * instead of a deploy failure after a container build.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('..', import.meta.url).pathname;

/** Workspace members discovered the same way pnpm discovers them: by directory, not by a list. */
function workspaceManifestPaths(): string[] {
  const roots = ['apps', 'packages'];
  const found: string[] = [];
  for (const root of roots) {
    const dir = join(REPO_ROOT, root);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(root, entry.name, 'package.json');
      if (existsSync(join(REPO_ROOT, manifest))) found.push(manifest);
    }
  }
  return found.sort();
}

function dockerfileCopiedManifests(): string[] {
  const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8');
  const copied: string[] = [];
  for (const line of dockerfile.split('\n')) {
    const match = /^COPY\s+((?:apps|packages)\/[\w.-]+\/package\.json)\s/.exec(line.trim());
    if (match?.[1] !== undefined) copied.push(match[1]);
  }
  return copied.sort();
}

describe('Dockerfile workspace manifest copies', () => {
  it('copies every workspace package manifest, and only manifests that exist', () => {
    // One assertion in both directions on purpose. A missing entry breaks
    // `--frozen-lockfile` against an importer the lockfile still knows
    // about; a stale entry breaks `COPY` outright. Asserting set equality
    // catches both without needing to decide which is worse.
    expect(dockerfileCopiedManifests()).toEqual(workspaceManifestPaths());
  });

  it('copies each manifest exactly once', () => {
    const copied = dockerfileCopiedManifests();
    expect(new Set(copied).size).toBe(copied.length);
  });
});
