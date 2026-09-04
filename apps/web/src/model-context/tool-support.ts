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

const VALIDATION_FAILURE_PREFIX = 'Input failed validation against the tool schema';

/**
 * How many individual problems one rejection message names.
 *
 * A rejection exists so the CALLER can fix the call, and a model handed
 * forty issues learns nothing it can act on. The tail of a long issue list
 * is also mostly downstream of its head -- make `values` an array and the
 * fifteen element-level complaints under it disappear -- so the first few
 * issues, in zod's own outermost-first order, are the ones worth spending
 * the message on. Five covers a whole malformed sub-object (a wrong enum,
 * a missing sibling, a bad element type) while the result stays one
 * readable line in a narrow pane. Anything past the cap is COUNTED in the
 * message rather than dropped silently, so a caller is never left thinking
 * a trimmed list was the whole story and fixing five things twice.
 */
const MAX_REPORTED_ISSUES = 5;

/**
 * The shape a path segment must have before this module will print it.
 *
 * Object property names in a Zod issue path come from the schema, but two
 * kinds of segment come from the INPUT: a `z.record` key, and the key
 * named by an `unrecognized_keys` issue on a `.strict()` object. Once such
 * a segment is sitting in `issue.path` it is indistinguishable from a
 * schema-declared field name, so every string segment clears the same
 * check: a plain identifier, optionally dotted the way `custom.*` ids are,
 * no longer than a field name plausibly gets. Most credential shapes fail
 * it (hyphen-prefixed keys like `pk-live-...`, base64 carrying `+/=`, JWT
 * dot-runs with padding). It is a shape guard, not a classifier -- the
 * guarantee that actually matters is the one `validationFailureEnvelope`
 * documents below: a received VALUE never reaches the message at all,
 * whatever it looks like.
 */
const SAFE_PATH_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const MAX_PATH_SEGMENT_LENGTH = 48;
const REDACTED_PATH_SEGMENT = '<redacted key>';

type ZodIssue = z.ZodError['issues'][number];

/**
 * zod v4 has no dedicated "missing property" issue code: an absent
 * required key arrives as `invalid_type` carrying `expected`, with nothing
 * on the finalized issue distinguishing it from a present-but-wrong-typed
 * value except zod's own default message tail. That tail is READ here to
 * choose between `Required` and the full expected/received line; it is
 * never itself emitted, and a schema that overrides the message simply
 * falls through to the expected/received line, which is still true.
 */
const ABSENT_VALUE_TAIL = /\breceived undefined$/;

interface IssueEntry {
  path: string;
  reason: string;
}

function renderKey(segment: PropertyKey): string {
  if (
    typeof segment !== 'string' ||
    segment.length > MAX_PATH_SEGMENT_LENGTH ||
    !SAFE_PATH_SEGMENT.test(segment)
  ) {
    return REDACTED_PATH_SEGMENT;
  }
  return segment;
}

/** Renders a Zod issue path as the dotted/indexed notation a caller can map straight back onto the JSON it sent (`values[2].status`). */
function renderPath(path: readonly PropertyKey[]): string {
  let rendered = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      rendered += `[${segment}]`;
      continue;
    }
    const key = renderKey(segment);
    rendered = rendered === '' ? key : `${rendered}.${key}`;
  }
  // An issue with an empty path is about the payload as a whole (a
  // top-level `.strict()` rejection, a root-level type error); saying so
  // beats an empty gap before the dash.
  return rendered === '' ? '(root)' : rendered;
}

function issueReason(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return ABSENT_VALUE_TAIL.test(issue.message) ? 'Required' : issue.message;
    case 'invalid_union':
      // zod's own message for a failed union is the bare words "Invalid
      // input", which tells a caller nothing at all; the per-branch issues
      // it nests are a tree that would blow the one-line budget, and each
      // branch's complaint is only meaningful against a branch the caller
      // cannot see named. Saying which FIELD failed and that it matched no
      // accepted shape is the actionable part.
      return 'Did not match any of the shapes this field accepts';
    case 'invalid_value':
    case 'invalid_format':
    case 'too_big':
    case 'too_small':
    case 'not_multiple_of':
    case 'invalid_key':
    case 'invalid_element':
    case 'custom':
      // Verified against the installed zod (4.4.3) by parsing real
      // `@sift/contracts` schemas with hostile input: every one of these
      // messages describes the SCHEMA's expectation (the bound, the
      // pattern, the allowed options) or the received TYPE -- never the
      // received value. `custom` is the deliberate pass-through explained
      // on `validationFailureEnvelope`.
      return issue.message;
    default:
      // Reached by `unrecognized_keys` only if `issueEntries` below ever
      // stops expanding it, and otherwise by an issue code a future zod
      // adds. Both degrade to the code itself rather than trusting a
      // message this module has not read: `unrecognized_keys` is precisely
      // the built-in that quotes input text back, so an unreviewed new
      // code is exactly the case not to hand a free pass to.
      return `Failed the "${issue.code}" rule`;
  }
}

function issueEntries(issue: ZodIssue): IssueEntry[] {
  if (issue.code === 'unrecognized_keys') {
    // The rejected key is a LOCATION, not a payload, so it is rendered as
    // the path segment it effectively is (subject to the same shape guard
    // as every other segment) -- a caller told only "an unrecognized key
    // somewhere under `definition`" cannot tell a typo from a field it
    // hallucinated. Each key becomes its own entry so the cap counts real,
    // separately-fixable problems.
    return issue.keys.map((key) => ({
      path: renderPath([...issue.path, key]),
      reason: 'Unrecognized property, which this tool does not accept',
    }));
  }
  return [{ path: renderPath(issue.path), reason: issueReason(issue) }];
}

/** Collapses a rule's own line breaks and trailing punctuation so entries join into one sentence instead of colliding with the separators. */
function normalizeReason(reason: string): string {
  return reason
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,]+$/, '');
}

function describeValidationFailure(error: z.ZodError): string {
  // Defensive: this runs on the failure path of a tool call, where turning
  // a rejection into a thrown TypeError would lose the rejection entirely.
  const issues: readonly ZodIssue[] = Array.isArray(error.issues) ? error.issues : [];
  const entries = issues.flatMap(issueEntries);
  if (entries.length === 0) {
    return `${VALIDATION_FAILURE_PREFIX}.`;
  }

  const shown = entries.slice(0, MAX_REPORTED_ISSUES);
  const parts = shown.map((entry) => `${entry.path} — ${normalizeReason(entry.reason)}`);
  const omitted = entries.length - shown.length;
  if (omitted > 0) {
    parts.push(`${omitted} further issue${omitted === 1 ? '' : 's'} not shown`);
  }
  return `${VALIDATION_FAILURE_PREFIX}: ${parts.join('; ')}.`;
}

/**
 * The rejection a WebMCP caller gets when its input fails the tool's real
 * `@sift/contracts` schema.
 *
 * A tool result is machine-facing. The caller is the only party that can
 * fix a malformed call, and it can only do that if the rejection says
 * WHICH field failed and WHICH rule it broke. Answering every rejection
 * with one fixed sentence pushed that work onto the human -- they had to
 * notice the pane had not changed, work out what the model got wrong, and
 * say so in chat -- which is the shared human/agent control seam this
 * contract exists to close (docs/specs/webmcp.md "Tool result envelope").
 *
 * What is deliberately withheld is the offending VALUE. Zod issues can
 * carry received input, and a tool result is output the same way telemetry
 * is: docs/specs/debugging-and-observability.md's redaction rule ("never
 * ... unredacted user-entered notes") applies here too, and a rejected
 * payload is exactly where a pasted note, price, or address is most likely
 * to be sitting. So each issue renders as a PATH and a RULE built only
 * from schema-derived fields; the one built-in message that quotes input
 * text (`unrecognized_keys`) is re-rendered here rather than passed
 * through; input-derived path segments must clear `SAFE_PATH_SEGMENT`; and
 * an issue code this module has not reviewed degrades to its code instead
 * of trusting a future zod message.
 *
 * `custom` messages are the one intentional pass-through. They are
 * authored in this repo's own schemas, where review decides what they may
 * quote, and they carry the rule text that actually teaches the caller
 * something ("orderedValues must place every allowed grade on the scale").
 * A `custom` message that quotes input is a defect in the schema that
 * wrote it, and belongs fixed there rather than laundered here.
 *
 * Backwards compatible on purpose: called with nothing it still returns
 * the original generic sentence verbatim, so call sites (and the checks
 * that assert on them) migrate one at a time.
 */
export function validationFailureEnvelope(
  errorOrMessage?: z.ZodError | string,
): ToolEnvelope<never> {
  return {
    ok: false,
    message: validationFailureMessage(errorOrMessage),
    ui: { changed: false },
    error: { code: 'VALIDATION', retryable: false },
  };
}

function validationFailureMessage(errorOrMessage: z.ZodError | string | undefined): string {
  if (errorOrMessage === undefined) {
    return `${VALIDATION_FAILURE_PREFIX}.`;
  }
  if (typeof errorOrMessage === 'string') {
    return errorOrMessage;
  }
  return describeValidationFailure(errorOrMessage);
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
