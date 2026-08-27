/**
 * Shared outcome envelope for `command-service.ts` and `run-service.ts`,
 * used so `routes/commands.ts`/`routes/runs.ts`/`routes/cases.ts` translate
 * exactly one small set of `status` discriminants into HTTP responses
 * (docs/specs/testing.md "HTTP integration tests": "success, validation,
 * not-found, conflict, policy, cancellation, and internal-error coverage
 * where applicable").
 *
 * `internal-error` is deliberately *not* a member of `ServiceFailure` --
 * every named failure here is a well-understood, expected outcome a service
 * method returns; a genuine internal error (a bug, an unexpected thrown
 * exception from a dependency) is left to propagate as a real thrown
 * `Error` for Express's error-handling middleware to turn into a `500`, per
 * the same convention `@pax/core`'s own `PaxDomainError` taxonomy uses
 * (thrown, not returned).
 */
import type { CaseState } from '@pax/contracts';

export interface OkOutcome<T> {
  readonly status: 'ok';
  readonly value: T;
}

export interface ValidationOutcome {
  readonly status: 'validation';
  readonly message: string;
  readonly issues: readonly string[];
}

export interface NotFoundOutcome {
  readonly status: 'not_found';
  readonly message: string;
}

export interface ConflictOutcome {
  readonly status: 'conflict';
  readonly message: string;
  readonly expectedSequence: number;
  readonly actualSequence: number;
  readonly snapshot: CaseState;
}

export interface PolicyOutcome {
  readonly status: 'policy';
  readonly message: string;
}

export type ServiceFailure = ValidationOutcome | NotFoundOutcome | ConflictOutcome | PolicyOutcome;

export type ServiceResult<T> = OkOutcome<T> | ServiceFailure;

export function ok<T>(value: T): OkOutcome<T> {
  return { status: 'ok', value };
}

export function validationFailure(
  message: string,
  issues: readonly string[] = [],
): ValidationOutcome {
  return { status: 'validation', message, issues };
}

export function notFound(message: string): NotFoundOutcome {
  return { status: 'not_found', message };
}

export function conflict(
  message: string,
  expectedSequence: number,
  actualSequence: number,
  snapshot: CaseState,
): ConflictOutcome {
  return { status: 'conflict', message, expectedSequence, actualSequence, snapshot };
}

export function policyFailure(message: string): PolicyOutcome {
  return { status: 'policy', message };
}

/** Formats Zod issues the same way `@pax/core`'s domain modules do (`path.join('.')`: message`), for a uniform `ValidationOutcome.issues` shape. */
export function formatZodIssues(
  issues: readonly { path: PropertyKey[]; message: string }[],
): string[] {
  return issues.map(
    (issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(input)'}: ${issue.message}`,
  );
}
