/**
 * `pack_scaffold`: "create files only under the selected pack draft
 * directory" (docs/specs/pack-authoring.md). Also shared by `validate.ts`'s
 * security scan: `walkDraftFiles` enumerates what actually landed on disk
 * under a draft directory, independent of any in-process record of what
 * `pack_scaffold` itself wrote (a real filesystem read, not a trusted
 * in-memory list -- validation must see what is really there).
 *
 * Two independent, structural bounds are enforced before any write:
 *
 * 1. Path traversal: every `relativePath` is resolved against the draft
 *    directory (`path.resolve` collapses `..` segments first) and the
 *    result must remain strictly inside it. A `../../etc/passwd`-shaped
 *    `relativePath` resolves outside the draft directory and is rejected --
 *    proven directly with such an attempt in `scaffold.test.ts`, not merely
 *    inferred from the bundle-shape allowlist below.
 *
 *    Reachability note: every one of the five bundle-shape patterns below
 *    has a fixed literal prefix depth (0 for `pack.json`/`README.md`, 1 for
 *    `skills/`/`fixtures/`/`scenarios/`) and each `[A-Za-z0-9._-]+` id
 *    segment can climb at most one level (only the exact two-character
 *    token `..` is special to path resolution, and it can occupy at most
 *    one segment per pattern). A path that matches the allowlist can
 *    therefore never resolve above the draft directory itself -- check 1
 *    above is genuine defense-in-depth for this exact allowlist, not the
 *    only thing standing between a malicious `relativePath` and an escape;
 *    it is what actually stops a "disguised" attempt like
 *    `skills/../../outside/SKILL.md` (which fails the allowlist, not the
 *    resolve check, for the same one-level-climb reason) and remains the
 *    real, load-bearing check should this allowlist ever be loosened later.
 * 2. Bundle shape: `relativePath` must also match the pack bundle file
 *    layout pack-authoring.md declares -- `pack.json`, `README.md`,
 *    `skills/<skill-id>/SKILL.md`, `fixtures/<scenario-id>/*.json`,
 *    `scenarios/<scenario-id>.json`. `tests/<pack-id>.conformance.test.ts`
 *    (the fifth bundle entry) is deliberately EXCLUDED from what
 *    `pack_scaffold` may write: it is real executable TypeScript, and
 *    pack-authoring.md's "Developer pack" section reserves new executable
 *    code for "normal repository review and deployment" by a human -- not
 *    something a bounded authoring tool synthesizes. `pack_test`/
 *    `pack_publish` (`test.ts`/`publish.ts`) prove conformance directly by
 *    calling `runPackConformance` in-process instead of generating and
 *    running a real test file. This also means every file `pack_scaffold`
 *    can ever write is declarative content (JSON or Markdown) -- "rejects
 *    executable content" (pack-authoring.md's `pack_publish` rejection list)
 *    is therefore structurally true of `pack_scaffold`'s own output by
 *    construction; `validate.ts`'s security scan is the second, independent
 *    layer that catches HTML/script-shaped *text* smuggled inside an
 *    otherwise-declarative file.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { z } from 'zod';

export const DRAFT_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/** The pack bundle file shapes `pack_scaffold` may write. See module comment for why `tests/*.conformance.test.ts` is excluded. */
export const SCAFFOLDABLE_PATH_PATTERNS: readonly RegExp[] = [
  /^pack\.json$/,
  /^README\.md$/,
  /^skills\/[A-Za-z0-9._-]+\/SKILL\.md$/,
  /^fixtures\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.json$/,
  /^scenarios\/[A-Za-z0-9._-]+\.json$/,
];

export function matchesBundleShape(relativePath: string): boolean {
  return SCAFFOLDABLE_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
}

const PackScaffoldFileSchema = z
  .object({
    relativePath: z.string().min(1).max(300),
    content: z.string().max(200_000),
  })
  .strict();

export const PackScaffoldInputSchema = z
  .object({
    draftId: z.string().min(1).max(100).regex(DRAFT_ID_PATTERN),
    files: z.array(PackScaffoldFileSchema).min(1).max(50),
  })
  .strict();
export type PackScaffoldInput = z.infer<typeof PackScaffoldInputSchema>;

export interface PackScaffoldWrittenFile {
  readonly relativePath: string;
  readonly bytesWritten: number;
}

export interface PackScaffoldResult {
  readonly draftDir: string;
  readonly written: readonly PackScaffoldWrittenFile[];
}

export class PackScaffoldRejectedError extends Error {}

/** The absolute directory for one pack draft, always nested directly under `draftRoot`. */
export function draftDirFor(draftRoot: string, draftId: string): string {
  return resolve(draftRoot, draftId);
}

export function packScaffold(draftRoot: string, rawInput: unknown): PackScaffoldResult {
  const input = PackScaffoldInputSchema.parse(rawInput);
  const draftDir = draftDirFor(draftRoot, input.draftId);
  const draftDirWithSep = draftDir.endsWith(sep) ? draftDir : `${draftDir}${sep}`;

  const written: PackScaffoldWrittenFile[] = [];
  for (const file of input.files) {
    if (!matchesBundleShape(file.relativePath)) {
      throw new PackScaffoldRejectedError(
        `pack_scaffold: "${file.relativePath}" does not match the pack bundle file layout ` +
          `(pack.json, README.md, skills/<id>/SKILL.md, fixtures/<scenario-id>/*.json, ` +
          `scenarios/<scenario-id>.json).`,
      );
    }

    // Primary safety mechanism: resolve, then require strict containment.
    const absolutePath = resolve(draftDir, file.relativePath);
    if (!absolutePath.startsWith(draftDirWithSep)) {
      throw new PackScaffoldRejectedError(
        `pack_scaffold: "${file.relativePath}" resolves outside the draft directory "${draftDir}".`,
      );
    }

    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, file.content, 'utf8');
    written.push({
      relativePath: file.relativePath,
      bytesWritten: Buffer.byteLength(file.content, 'utf8'),
    });
  }

  return { draftDir, written };
}

/**
 * Real filesystem walk of every file under a draft directory, returning
 * bundle-relative paths (POSIX `/`-joined regardless of platform, matching
 * `SCAFFOLDABLE_PATH_PATTERNS`). Used by `validate.ts` to see what actually
 * exists on disk, not merely what `pack_scaffold` claims to have written.
 */
export function walkDraftFiles(draftDir: string): string[] {
  const results: string[] = [];
  function walk(dir: string, prefix: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
      } else {
        results.push(relativePath);
      }
    }
  }
  walk(draftDir, '');
  return results;
}
