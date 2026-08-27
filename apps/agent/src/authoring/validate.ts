/**
 * `pack_validate`: "run schema, reference, security, and graph/bounds
 * validation" (docs/specs/pack-authoring.md). A thin, bounded wrapper around
 * the real, already-built `compilePack` (`@pax/packs`) -- schema, dangling
 * reference, capability-allowlist, and orchestration-bounds checks all come
 * directly from `compilePack`'s own 11-step pipeline (pack-authoring.md
 * "Compiler and registry"). The one check this wrapper adds on top is the
 * "security" leg: `compilePack` only ever sees `pack.json`'s parsed JSON, so
 * its `safeString` Zod refinements (`@pax/contracts`) already reject
 * HTML/script-shaped text inside manifest fields -- but `README.md` and
 * every `skills/<id>/SKILL.md` are raw Markdown files that never pass
 * through the manifest schema at all. `scanDraftForExecutableContent`
 * applies the identical HTML/executable-content pattern the rest of this
 * codebase's Zod schemas already use (`case.ts`/`extensions.ts`/
 * `scenario.ts`'s own `HTML_OR_EXECUTABLE_PATTERN`) to every file physically
 * present under the draft directory, closing that gap.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Clock } from '@pax/core';
import {
  DecisionPackManifestSchema,
  type CompiledDecisionPack,
  type DecisionPackManifest,
} from '@pax/contracts';
import {
  PackCompilationError,
  compilePack,
  type CapabilityCatalog,
  type PackCompilationIssue,
} from '@pax/packs';
import { draftDirFor, matchesBundleShape, walkDraftFiles } from './scaffold.js';

// Same pattern already used verbatim by `@pax/contracts`'s `case.ts`,
// `extensions.ts`, and `scenario.ts` `safeString` refinements.
const HTML_OR_EXECUTABLE_PATTERN = /<\/?[a-zA-Z!]|javascript:|on[a-zA-Z]+\s*=\s*["']/;

export const PackValidateInputSchema = z.object({ draftId: z.string().min(1).max(100) }).strict();
export type PackValidateInput = z.infer<typeof PackValidateInputSchema>;

/** `compilePack`'s own issue steps, plus `'security'` and `'draft_shape'` for the two checks this wrapper adds on top. `compilePack`'s closed `PackCompilationIssue['step']` union is extended here, not modified -- `packages/packs/src/compiler.ts` is untouched. */
export interface AuthoringValidationIssue {
  readonly step: PackCompilationIssue['step'] | 'security' | 'draft_shape';
  readonly message: string;
  readonly path?: string;
}

export interface PackValidateResult {
  readonly ok: boolean;
  readonly issues: readonly AuthoringValidationIssue[];
  readonly compiled?: CompiledDecisionPack;
}

export class PackDraftNotFoundError extends Error {}

/** Reads and JSON-parses `<draftDir>/pack.json`. Throws distinctly from a schema-validation failure so a missing/malformed draft is diagnosable on its own. */
export function readDraftManifestJson(draftRoot: string, draftId: string): unknown {
  const manifestPath = join(draftDirFor(draftRoot, draftId), 'pack.json');
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch {
    throw new PackDraftNotFoundError(
      `pack.json not found for draft "${draftId}" (expected at "${manifestPath}"). Run pack_scaffold first.`,
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new PackDraftNotFoundError(
      `pack.json for draft "${draftId}" is not valid JSON: ${(error as Error).message}`,
    );
  }
}

/**
 * Scans every file physically present under the draft directory for
 * HTML/script-shaped content. Also flags a file present on disk that does
 * not match the bundle-shape allowlist `pack_scaffold` itself enforces --
 * evidence that something landed in the draft directory through a path
 * other than `pack_scaffold` (e.g. a human hand-editing the draft), which
 * `pack_validate` treats as a `draft_shape` issue rather than silently
 * trusting it.
 */
export function scanDraftForExecutableContent(
  draftRoot: string,
  draftId: string,
): AuthoringValidationIssue[] {
  const draftDir = draftDirFor(draftRoot, draftId);
  const issues: AuthoringValidationIssue[] = [];

  for (const relativePath of walkDraftFiles(draftDir)) {
    if (!matchesBundleShape(relativePath)) {
      issues.push({
        step: 'draft_shape',
        message: `"${relativePath}" is present in the draft but does not match the pack bundle file layout.`,
        path: relativePath,
      });
      continue;
    }
    const content = readFileSync(join(draftDir, relativePath), 'utf8');
    if (HTML_OR_EXECUTABLE_PATTERN.test(content)) {
      issues.push({
        step: 'security',
        message: `"${relativePath}" contains HTML tags or an executable expression, which is not permitted in a pack bundle file.`,
        path: relativePath,
      });
    }
  }

  return issues;
}

export function packValidate(
  draftRoot: string,
  catalog: CapabilityCatalog,
  clock: Clock,
  rawInput: unknown,
): PackValidateResult {
  const input = PackValidateInputSchema.parse(rawInput);
  const securityIssues = scanDraftForExecutableContent(draftRoot, input.draftId);

  const manifestJson = readDraftManifestJson(draftRoot, input.draftId);
  const schemaParsed = DecisionPackManifestSchema.safeParse(manifestJson);
  if (!schemaParsed.success) {
    const schemaIssues: AuthoringValidationIssue[] = schemaParsed.error.issues.map((issue) => ({
      step: 'schema',
      message: issue.message,
      path: issue.path.map(String).join('.'),
    }));
    return { ok: false, issues: [...schemaIssues, ...securityIssues] };
  }
  const manifest: DecisionPackManifest = schemaParsed.data;

  try {
    const compiled = compilePack(manifest, catalog, clock);
    if (securityIssues.length > 0) {
      return { ok: false, issues: securityIssues, compiled };
    }
    return { ok: true, issues: [], compiled };
  } catch (error) {
    if (error instanceof PackCompilationError) {
      return { ok: false, issues: [...error.issues, ...securityIssues] };
    }
    throw error;
  }
}
