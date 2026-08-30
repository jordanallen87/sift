/**
 * `pack_publish`: "request explicit human confirmation, then install a
 * validated artifact" (docs/specs/pack-authoring.md). "`pack_publish`
 * rejects failing validation, missing negative scenarios, undeclared
 * capabilities, executable content, and any request whose actor is not
 * human."
 *
 * Structural human-actor enforcement mirrors `packages/core/src/policy.ts`'s
 * `reviewProposal` exactly, on purpose: the same discipline, not a
 * parallel reinvention. `reviewProposal` accepts `decision.actor:
 * z.enum(['human', 'agent'])` at the input boundary (so the rejection path
 * itself is observable/testable, not merely unreachable at the type level)
 * and then performs "a plain `!==` string comparison against the literal
 * `'human'`, performed first, with no case-insensitive, trimmed, or
 * prefix-matching allowance" before any other check runs. `packPublish`
 * below does the identical thing: `actor: z.enum(['human', 'agent'])`, the
 * `actor !== 'human'` check is the very first statement in the function
 * body, and it throws unconditionally -- no combination of `confirmed`,
 * passing validation, or anything else can route around it.
 */
import { z } from 'zod';
import type { Clock } from '@sift/core';
import type { CapabilityCatalog, PackRegistry } from '@sift/packs';
import type { CompiledDecisionPack } from '@sift/contracts';
import { packTest } from './test.js';

export const PackPublishInputSchema = z
  .object({
    draftId: z.string().min(1).max(100),
    // Deliberately `z.enum(['human', 'agent'])`, not `z.literal('human')` --
    // see module comment: the rejection of a non-human actor must be a real,
    // observable runtime check, not merely unreachable at the type layer.
    actor: z.enum(['human', 'agent']),
    confirmed: z.boolean(),
    confirmedBy: z.string().min(1).max(200),
  })
  .strict();
export type PackPublishInput = z.infer<typeof PackPublishInputSchema>;

export class PackPublishRejectedError extends Error {
  constructor(
    message: string,
    readonly reasons: readonly string[],
  ) {
    super(message);
  }
}

export function packPublish(
  draftRoot: string,
  catalog: CapabilityCatalog,
  registry: PackRegistry,
  clock: Clock,
  rawInput: unknown,
): CompiledDecisionPack {
  const input = PackPublishInputSchema.parse(rawInput);

  // Unconditional, first-checked human-actor gate. See module comment.
  if (input.actor !== 'human') {
    throw new PackPublishRejectedError(
      `Only a human actor may publish a Decision Pack; received actor "${input.actor}".`,
      [`actor must be "human"`],
    );
  }
  if (!input.confirmed) {
    throw new PackPublishRejectedError(
      'Publication requires explicit human confirmation (confirmed: true).',
      ['confirmed must be true'],
    );
  }

  const testResult = packTest(draftRoot, catalog, clock, { draftId: input.draftId });
  const reasons: string[] = [...testResult.issues];
  if (!testResult.validation.ok) {
    reasons.push(
      ...testResult.validation.issues.map((issue) => `[${issue.step}] ${issue.message}`),
    );
  }

  if (reasons.length > 0 || testResult.validation.compiled === undefined) {
    throw new PackPublishRejectedError(
      `pack_publish rejected draft "${input.draftId}": ${reasons.length} issue(s) found by pack_test.`,
      reasons,
    );
  }

  const compiled = testResult.validation.compiled;
  registry.register(compiled);
  return compiled;
}
