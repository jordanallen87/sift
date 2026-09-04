/**
 * HTTP error envelope and 409-conflict response schemas.
 *
 * architecture.md does not spell out an HTTP error body shape directly, but
 * requires "Every route validates input and output through schemas from
 * packages/contracts" and describes optimistic concurrency: "A stale
 * `eventSequence` produces HTTP `409` with the latest snapshot; clients
 * refresh rather than replaying an unexamined mutation." webmcp.md's
 * `SiftToolResult.error.code` vocabulary (`VALIDATION`/`NOT_FOUND`/
 * `CONFLICT`/`POLICY`/`UNAVAILABLE`/`INTERNAL`) is reused verbatim here
 * (imported from commands.ts's `TOOL_ERROR_CODES`) rather than inventing a
 * parallel HTTP-only vocabulary, since both are the same command-service
 * failure taxonomy surfaced through two transports.
 */
import { z } from 'zod';
import { TOOL_ERROR_CODES } from './commands.js';
import { CaseStateSchema } from './case.js';
import { JsonValueSchema } from './events.js';

const HTML_OR_EXECUTABLE_PATTERN = /<\/?[a-zA-Z!]|javascript:|on[a-zA-Z]+\s*=\s*["']/;

function safeString(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .refine((value) => !HTML_OR_EXECUTABLE_PATTERN.test(value), {
      message: 'value must not contain HTML tags or executable expressions',
    });
}

const idString = (maxLength = 200) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .regex(/^[A-Za-z0-9._-]+$/, 'id must contain only letters, digits, ".", "_", or "-"');

export const HttpErrorSchema = z
  .object({
    code: z.enum(TOOL_ERROR_CODES),
    message: safeString(2000),
    retryable: z.boolean(),
    requestId: idString().optional(),
    // Bounded structured detail (e.g. per-field validation errors). Reuses
    // events.ts's depth/size-bounded `JsonValueSchema` rather than
    // `z.unknown()` so an HTTP error body cannot smuggle unbounded/
    // executable content -- unlike RuntimeDebugEvent's `attributes`/
    // `payload`, which the spec itself types as `unknown` (see runtime.ts).
    details: JsonValueSchema.optional(),
  })
  .strict();
export type HttpError = z.infer<typeof HttpErrorSchema>;

export const HttpErrorBodySchema = z
  .object({
    error: HttpErrorSchema,
  })
  .strict();
export type HttpErrorBody = z.infer<typeof HttpErrorBodySchema>;

/**
 * The `409` conflict-specific response shape (architecture.md "Command and
 * event flow"): a `CONFLICT` error plus the latest case snapshot so the
 * client can refresh instead of blindly retrying a stale mutation.
 */
export const HttpConflictErrorSchema = z
  .object({
    code: z.literal('CONFLICT'),
    message: safeString(2000),
    retryable: z.boolean(),
    expectedSequence: z.number().int().min(0),
    actualSequence: z.number().int().min(0),
  })
  .strict();
export type HttpConflictError = z.infer<typeof HttpConflictErrorSchema>;

export const HttpConflictResponseSchema = z
  .object({
    error: HttpConflictErrorSchema,
    snapshot: CaseStateSchema,
  })
  .strict();
export type HttpConflictResponse = z.infer<typeof HttpConflictResponseSchema>;

/**
 * The command-origin marker (docs/decisions/0006-webmcp-two-way-
 * collaboration-contract.md decision 8; docs/specs/debugging-and-
 * observability.md "WebMCP tool calls"). A command sent to `POST
 * /api/cases/:caseId/commands/:commandName` may optionally carry an
 * `X-Sift-Command-Origin` request header -- a sibling to the existing
 * `X-Sift-Command-Id`/`Idempotency-Key` headers (`routes/http-support.ts`)
 * -- tagging it as issued by a registered WebMCP tool rather than a direct
 * UI action. Closed enum, not free text: `routes/http-support.ts`'s
 * `readCommandOrigin` rejects any value outside `COMMAND_ORIGINS` with
 * `400 VALIDATION`, the same failure contract `readCommandId` already uses
 * for a malformed `Idempotency-Key`.
 *
 * `CommandService`/`routes/commands.ts` thread this marker through as a
 * plain field on the command envelope -- never a branch in command logic
 * (docs/engineering-principles.md: "Visible UI controls and WebMCP callbacks use the same
 * command implementation"). It changes only what gets *recorded* about a
 * command (the developer/runtime trail), never what the command *does*: a
 * command with and without this header produces byte-identical case state
 * and an identical `eventSequence` advance.
 *
 * This is self-reported, client-supplied provenance for observability
 * ONLY. It is never consulted for an authorization decision -- exactly the
 * hazard `routes/agentcore.ts`'s header comment documents for its own
 * `actor` field on a neighbouring transport: "nothing upstream ...
 * authenticates who the caller actually is," so a client claiming an
 * origin cannot be trusted to police itself. Human-only verbs
 * (`reviewProposal`, confirming a `reviewCaseExtension`) stay unreachable
 * from WebMCP by tool-catalog exclusion (`webmcp-contract.test.ts`), a
 * structural guarantee this header cannot weaken or strengthen -- sending
 * `X-Sift-Command-Origin: webmcp` grants a caller no capability it did not
 * already have.
 */
export const COMMAND_ORIGINS = ['webmcp'] as const;
export const CommandOriginSchema = z.enum(COMMAND_ORIGINS);
export type CommandOrigin = z.infer<typeof CommandOriginSchema>;
