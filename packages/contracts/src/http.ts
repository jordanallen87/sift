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
