/**
 * Shared HTTP envelope helpers used by every `routes/*.ts` module: the
 * `Idempotency-Key` header convention (`commandId`, per
 * `services/command-service.ts`'s header comment) and translating a
 * `services/service-result.ts` `ServiceResult` into the real HTTP error
 * envelope from `@pax/contracts/src/http.ts`
 * (`HttpErrorBodySchema`/`HttpConflictResponseSchema`).
 *
 * Status code mapping (docs/specs/architecture.md "Command and event flow":
 * "A stale `eventSequence` produces HTTP `409`"; docs/specs/testing.md "HTTP
 * integration tests": "success, validation, not-found, conflict, policy,
 * cancellation, and internal-error coverage"):
 *
 *  - `validation` -> `400 VALIDATION`
 *  - `not_found`  -> `404 NOT_FOUND`
 *  - `conflict`   -> `409 CONFLICT` (`HttpConflictResponseSchema`: error + latest `snapshot`)
 *  - `policy`     -> `403 POLICY`
 *  - a thrown (unexpected) error -> `500 INTERNAL`, handled by `app.ts`'s
 *    error-handling middleware, not here (`service-result.ts`'s own header
 *    comment: a genuine internal error is left to propagate as a real
 *    thrown `Error`, not returned as a `ServiceFailure`).
 */
import type { Request, Response } from 'express';
import {
  CommandReceiptSchema,
  HttpConflictResponseSchema,
  HttpErrorBodySchema,
  type JsonValue,
} from '@pax/contracts';
import type { ServiceResult } from '../services/service-result.js';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const COMMAND_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;

/**
 * Reads and validates the `Idempotency-Key` request header as the
 * command's `commandId`. Writes a `400 VALIDATION` response and returns
 * `undefined` when the header is missing or malformed -- callers must check
 * for `undefined` and return immediately without proceeding.
 */
export function readCommandId(req: Request, res: Response): string | undefined {
  const header = req.get(IDEMPOTENCY_KEY_HEADER);
  if (header === undefined || header.length === 0) {
    sendError(
      res,
      400,
      'VALIDATION',
      `A non-empty "${IDEMPOTENCY_KEY_HEADER}" request header is required as the command's idempotency key.`,
      false,
    );
    return undefined;
  }
  if (!COMMAND_ID_PATTERN.test(header)) {
    sendError(
      res,
      400,
      'VALIDATION',
      `"${IDEMPOTENCY_KEY_HEADER}" must contain only letters, digits, ".", "_", or "-" (max 200 chars).`,
      false,
    );
    return undefined;
  }
  return header;
}

export function sendError(
  res: Response,
  status: number,
  code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'POLICY' | 'UNAVAILABLE' | 'INTERNAL',
  message: string,
  retryable: boolean,
  details?: JsonValue,
): void {
  res.status(status).json(
    HttpErrorBodySchema.parse({
      error: { code, message, retryable, ...(details !== undefined ? { details } : {}) },
    }),
  );
}

/** Writes the appropriate HTTP response for a `CommandService`/`RunService` `ServiceResult`. `onOk` lets a caller (e.g. `routes/runs.ts`, which returns a `RunReceipt`, a strict superset of `CommandReceipt`) customize the success-response schema; defaults to `CommandReceiptSchema`. */
export function respondWithServiceResult<
  T extends { commandId: string; caseId: string; acceptedSequence: number },
>(
  res: Response,
  result: ServiceResult<T>,
  onOk: (value: T) => unknown = (value) => CommandReceiptSchema.parse(value),
): void {
  switch (result.status) {
    case 'ok':
      res.status(200).json(onOk(result.value));
      return;
    case 'validation':
      sendError(res, 400, 'VALIDATION', result.message, false, [...result.issues]);
      return;
    case 'not_found':
      sendError(res, 404, 'NOT_FOUND', result.message, false);
      return;
    case 'policy':
      sendError(res, 403, 'POLICY', result.message, false);
      return;
    case 'conflict':
      res.status(409).json(
        HttpConflictResponseSchema.parse({
          error: {
            code: 'CONFLICT',
            message: result.message,
            retryable: true,
            expectedSequence: result.expectedSequence,
            actualSequence: result.actualSequence,
          },
          snapshot: result.snapshot,
        }),
      );
      return;
  }
}
