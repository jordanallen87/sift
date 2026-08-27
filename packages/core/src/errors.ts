/**
 * Shared domain error taxonomy for `packages/core`.
 *
 * This is intentionally a small, generic leaf module: it knows nothing about
 * attributes, extensions, criteria, obligations, evidence, readiness, or
 * routing/policy specifics. Every other `packages/core` module -- including
 * the sibling modules other agents build in parallel, and the later
 * `reducer.ts` integration layer -- may import from here without creating a
 * cycle, since this file imports nothing from `packages/core` itself.
 *
 * Every subtype carries:
 * - a stable, machine-readable `code` (a caller such as the HTTP layer or
 *   the WebMCP adapter maps this to a `ToolErrorCode`
 *   (`@pax/contracts` `commands.ts`) or an HTTP status without ever string
 *   matching `message`, which is free to change for readability);
 * - a human-readable `message` (standard `Error.message`);
 * - optional bounded, JSON-safe `details` for logs/telemetry. Per
 *   docs/specs/architecture.md "Security and authority", callers must never
 *   place credentials, authorization headers, cookies, secret canaries, raw
 *   private reasoning, or unredacted user-entered notes into `details`.
 */
import type { JsonValue } from '@pax/contracts';

export interface PaxDomainErrorOptions {
  /** Bounded JSON-safe context for logs/telemetry. See the redaction rules above. */
  details?: Readonly<Record<string, JsonValue>>;
  /** The underlying error this one wraps, if any (forwarded to `Error`'s `cause`). */
  cause?: unknown;
}

/**
 * Base class for every domain error `packages/core` throws. Abstract so it
 * can never be thrown directly -- every throw site must pick a specific,
 * meaningful subtype.
 */
export abstract class PaxDomainError extends Error {
  abstract readonly code: string;
  readonly details: Readonly<Record<string, JsonValue>> | undefined;

  constructor(message: string, options?: PaxDomainErrorOptions) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.details = options?.details;
    // Restores `instanceof` checks against this subclass when the runtime
    // target down-compiles `class` extends of built-ins (e.g. older
    // TypeScript `target` settings for `Error`).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * The model, a WebMCP callback, or any actor other than a literal `'human'`
 * string attempted a consequential, human-only action -- most critically,
 * approving a `DecisionProposal` (docs/specs/architecture.md "Security and
 * authority": "`reviewProposal` rejects requests whose `actor` is not
 * `human`"). Also covers a runtime model attempting a change
 * `isModelPermittedChange` (see `policy.ts`) marks as out of bounds.
 */
export class PolicyViolationError extends PaxDomainError {
  readonly code = 'POLICY_VIOLATION' as const;
}

/**
 * A routing candidate, or the router's resolved selection, referenced a
 * pack ID, version, or compiled hash absent from the compiled registry
 * (docs/specs/packs-and-routing.md routing algorithm step 8: "Reject any
 * candidate ID, version, or hash absent from the compiled registry.").
 */
export class RoutingRejectionError extends PaxDomainError {
  readonly code = 'ROUTING_REJECTED' as const;
}

/**
 * A generic structural/business-rule validation failure that does not fit
 * the two more specific taxonomies above -- for example, a command
 * referencing a proposal ID that does not match the case's pending
 * proposal, or a `request_revision` decision missing its required
 * `instructions`.
 */
export class ValidationFailedError extends PaxDomainError {
  readonly code = 'VALIDATION_FAILED' as const;
}

/** Narrows `value` to `PaxDomainError`, for callers that need to branch on the shared taxonomy without knowing every subtype. */
export function isPaxDomainError(value: unknown): value is PaxDomainError {
  return value instanceof PaxDomainError;
}
