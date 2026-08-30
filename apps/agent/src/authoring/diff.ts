/**
 * `pack_diff`: "compare a draft with an installed version"
 * (docs/specs/pack-authoring.md). Read-only: no filesystem write, no
 * registry mutation. Compiles the draft (via `packValidate`, the same real
 * `compilePack` wrapper `pack_validate` itself uses) and compares its
 * top-level id collections against the highest already-registered version
 * of the same pack id in `PackRegistry`, if any.
 */
import { z } from 'zod';
import type { Clock } from '@sift/core';
import type { CompiledDecisionPack } from '@sift/contracts';
import type { CapabilityCatalog, PackRegistry } from '@sift/packs';
import { packValidate } from './validate.js';

export const PackDiffInputSchema = z.object({ draftId: z.string().min(1).max(100) }).strict();
export type PackDiffInput = z.infer<typeof PackDiffInputSchema>;

export class PackDiffValidationFailedError extends Error {
  constructor(
    draftId: string,
    readonly issues: readonly { step: string; message: string }[],
  ) {
    super(
      `pack_diff: draft "${draftId}" does not compile cleanly (${issues.length} issue(s)); fix it with pack_validate before diffing.`,
    );
  }
}

/**
 * Tiny local semver comparator, deliberately not shared with
 * `apps/agent/src/services/command-service.ts`'s own private
 * `compareSemver` (that file is out of this task's editable scope, and a
 * ~10-line numeric major.minor.patch comparator is not worth promoting to a
 * shared module for a second, independent bounded tool).
 */
function compareSemver(a: string, b: string): number {
  const [aMajor = 0, aMinor = 0, aPatch = 0] = a.split('.').map(Number);
  const [bMajor = 0, bMinor = 0, bPatch = 0] = b.split('.').map(Number);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

export interface IdCollectionDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

export interface PackDiffResult {
  readonly draftId: string;
  readonly draftPackId: string;
  readonly draftVersion: string;
  readonly installedVersion: string | undefined;
  readonly compiledHashChanged: boolean;
  readonly attributes: IdCollectionDiff;
  readonly criteria: IdCollectionDiff;
  readonly obligations: IdCollectionDiff;
  readonly skills: IdCollectionDiff;
  readonly specialists: IdCollectionDiff;
  readonly tools: IdCollectionDiff;
}

function diffIds(installed: readonly string[], draft: readonly string[]): IdCollectionDiff {
  const installedSet = new Set(installed);
  const draftSet = new Set(draft);
  return {
    added: draft.filter((id) => !installedSet.has(id)),
    removed: installed.filter((id) => !draftSet.has(id)),
  };
}

export function packDiff(
  draftRoot: string,
  catalog: CapabilityCatalog,
  registry: PackRegistry,
  clock: Clock,
  rawInput: unknown,
): PackDiffResult {
  const input = PackDiffInputSchema.parse(rawInput);
  const validation = packValidate(draftRoot, catalog, clock, { draftId: input.draftId });
  if (!validation.ok || validation.compiled === undefined) {
    throw new PackDiffValidationFailedError(input.draftId, validation.issues);
  }
  const draft = validation.compiled;

  let installed: CompiledDecisionPack | undefined;
  for (const candidate of registry.list()) {
    if (candidate.identity.id !== draft.identity.id) continue;
    if (
      installed === undefined ||
      compareSemver(candidate.identity.version, installed.identity.version) > 0
    ) {
      installed = candidate;
    }
  }

  if (installed === undefined) {
    return {
      draftId: input.draftId,
      draftPackId: draft.identity.id,
      draftVersion: draft.identity.version,
      installedVersion: undefined,
      compiledHashChanged: true,
      attributes: { added: draft.attributes.map((a) => a.id), removed: [] },
      criteria: { added: draft.criteria.defaults.map((c) => c.id), removed: [] },
      obligations: { added: draft.obligations.map((o) => o.id), removed: [] },
      skills: { added: draft.skills.map((s) => s.id), removed: [] },
      specialists: { added: draft.specialists.map((s) => s.id), removed: [] },
      tools: { added: draft.tools.map((t) => t.id), removed: [] },
    };
  }

  return {
    draftId: input.draftId,
    draftPackId: draft.identity.id,
    draftVersion: draft.identity.version,
    installedVersion: installed.identity.version,
    compiledHashChanged: installed.compiledHash !== draft.compiledHash,
    attributes: diffIds(
      installed.attributes.map((a) => a.id),
      draft.attributes.map((a) => a.id),
    ),
    criteria: diffIds(
      installed.criteria.defaults.map((c) => c.id),
      draft.criteria.defaults.map((c) => c.id),
    ),
    obligations: diffIds(
      installed.obligations.map((o) => o.id),
      draft.obligations.map((o) => o.id),
    ),
    skills: diffIds(
      installed.skills.map((s) => s.id),
      draft.skills.map((s) => s.id),
    ),
    specialists: diffIds(
      installed.specialists.map((s) => s.id),
      draft.specialists.map((s) => s.id),
    ),
    tools: diffIds(
      installed.tools.map((t) => t.id),
      draft.tools.map((t) => t.id),
    ),
  };
}
