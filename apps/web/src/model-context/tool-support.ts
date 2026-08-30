/**
 * Shared plumbing every registered Sift WebMCP tool callback uses: JSON
 * Schema generation from a tool's real `@sift/contracts` Zod input schema,
 * per-call cancellation, and honest error-to-envelope mapping (docs/specs/
 * webmcp.md "Tool result envelope", "Cancellation and concurrency").
 *
 * Zod-to-JSON-Schema approach: `z.toJSONSchema` (zod v4's own built-in
 * converter, `zod/v4/core/to-json-schema.js`, re-exported from the
 * top-level `zod` package `@sift/web` already depends on -- confirmed by
 * running it directly against a `.strict()` schema from this workspace
 * before writing this file). No new dependency was added for this: the
 * workspace lockfile does carry `zod-to-json-schema@3.25.2`, but that is a
 * transitive dependency of an MCP SDK used elsewhere in the workspace, not
 * something `@sift/web` depends on -- reaching for zod's own native
 * converter is both simpler and avoids taking on that package directly.
 */
import { z } from 'zod';
import type { ToolErrorCode } from '@sift/contracts';
import { SiftClientError } from '../api/sift-client.js';

/** Converts a real `@sift/contracts` Zod input schema to the JSON Schema object a `WebMcpToolDefinition.inputSchema` requires. */
export function toToolInputSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return z.toJSONSchema(schema);
}

export interface ToolEnvelopeUi {
  changed: boolean;
  focusTarget?: string;
}

export interface ToolEnvelope<T> {
  ok: boolean;
  message: string;
  data?: T;
  commandId?: string;
  runId?: string;
  caseId?: string;
  sequence?: number;
  ui: ToolEnvelopeUi;
  error?: { code: ToolErrorCode; retryable: boolean };
}

export function validationFailureEnvelope(
  message = 'Input failed validation against the tool schema.',
): ToolEnvelope<never> {
  return {
    ok: false,
    message,
    ui: { changed: false },
    error: { code: 'VALIDATION', retryable: false },
  };
}

export function notActiveCaseEnvelope(caseId: string, activeCaseId: string): ToolEnvelope<never> {
  return {
    ok: false,
    message: `Case "${caseId}" is not the active case ("${activeCaseId}").`,
    ui: { changed: false },
    error: { code: 'NOT_FOUND', retryable: false },
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/**
 * Best-effort extraction of a `409` conflict's `actualSequence` from a
 * `SiftClientError.details` payload (`unknown` by construction). See this
 * module's `register-sift-tools.ts` sibling doc comment / this task's build
 * log entry for the real, currently-open gap this defends against: today's
 * `sift-client.ts` `SiftClientError.fromErrorResponse` does not parse
 * `HttpConflictResponseSchema` (the documented `409` body shape carrying
 * `error.expectedSequence`/`error.actualSequence` plus a top-level
 * `snapshot`) at all -- it falls through to a generic, code-less,
 * non-retryable error, so `details` will not actually carry
 * `actualSequence` until that parsing gap is fixed upstream. This function
 * is written to do the right thing the moment it is.
 */
function extractActualSequence(details: unknown): number | undefined {
  if (
    typeof details === 'object' &&
    details !== null &&
    'actualSequence' in details &&
    typeof details.actualSequence === 'number'
  ) {
    return (details as { actualSequence: number }).actualSequence;
  }
  return undefined;
}

/** Maps any thrown/rejected error from a `SiftCommands` call (or from an aborted wait on one) to an honest, never-claims-success `ToolEnvelope`. */
export function mapErrorToEnvelope(error: unknown): ToolEnvelope<never> {
  if (isAbortError(error)) {
    return {
      ok: false,
      message: 'The request was cancelled before it completed.',
      ui: { changed: false },
      error: { code: 'UNAVAILABLE', retryable: true },
    };
  }

  if (error instanceof SiftClientError) {
    const code: ToolErrorCode = error.code ?? 'INTERNAL';
    const envelope: ToolEnvelope<never> = {
      ok: false,
      message: error.message,
      ui: { changed: false },
      error: { code, retryable: error.retryable },
    };
    const actualSequence = extractActualSequence(error.details);
    if (actualSequence !== undefined) {
      envelope.sequence = actualSequence;
    }
    return envelope;
  }

  return {
    ok: false,
    message: 'An unexpected error occurred while executing this command.',
    ui: { changed: false },
    error: { code: 'INTERNAL', retryable: false },
  };
}

/**
 * Runs `work` and races it against `signal` aborting. On abort, this
 * function's returned promise rejects immediately with an `AbortError` --
 * regardless of whether `work` later resolves or rejects -- so a late
 * response is never applied (webmcp.md "Cancellation produces `UNAVAILABLE`
 * with `retryable: true` and does not apply a late response").
 *
 * Real network-level cancellation gap (flagged loudly, not silently worked
 * around): this only stops *waiting* on `work`; it cannot abort an
 * in-flight `fetch` the way webmcp.md's "forwards it to fetch" describes,
 * because no `SiftCommands` method (`apps/web/src/api/sift-client.ts`)
 * currently accepts an `AbortSignal` parameter to forward to its own
 * `fetchImpl` call -- `postJson`'s `fetchImpl(url, { method, headers,
 * body })` call has no `signal` field at all. The externally observable
 * contract (stop waiting, return `UNAVAILABLE`/`retryable: true`, ignore
 * any late result) is still met; the underlying HTTP request itself keeps
 * running server-side until it naturally completes. See this task's build
 * log entry for the recommended fix: an additive, optional `options?:
 * { signal?: AbortSignal }` second parameter on every `SiftCommands` method.
 */
export function runAbortable<T>(
  work: () => Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) {
    return work();
  }
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    work().then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        // This forwards whatever `work()` itself rejected with verbatim
        // (typically a real `SiftClientError`) rather than fabricating a new
        // rejection reason -- `mapErrorToEnvelope` needs the original
        // error's own shape (`instanceof SiftClientError`, `.code`,
        // `.details`) to map it honestly, so wrapping it in `new Error(...)`
        // here would destroy the information the caller actually needs.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- see comment above: rethrowing the original rejection reason, not fabricating one.
        reject(error);
      },
    );
  });
}
