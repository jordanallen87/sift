/**
 * Shared result envelope and evidence-item shape for every fixture tool in
 * this directory (`listing-reader.ts`, `ownership-calculator.ts`,
 * `safety-reliability-lookup.ts`, `household-fit-matrix.ts`).
 *
 * `ToolEvidenceItem` deliberately carries exactly `sourceId`/`level`/
 * `verdict`/`summary` -- the same four fields as
 * `ExecutionResult.evidenceResults[number]`
 * (docs/specs/strands-runtime.md "Evidence output") -- so a future Strands
 * adapter can build an `ExecutionResult.evidenceResults` entry directly from
 * one of these items without renaming or reshaping anything.
 *
 * `ToolResult<T>` gives every tool one consistent, non-throwing envelope for
 * the three outcomes this task requires of a synchronous fixture tool:
 * a successful lookup (`ok`), an unknown candidate/source id
 * (`not_found` -- a normal input outcome, not an exception), and an aborted
 * call (`cancelled`, honoring the `AbortSignal` contract the future live-tool
 * path will also need). This mirrors the vocabulary of webmcp.md's
 * `PaxToolResult<T>` envelope (`ok`/`data`/`error.code` including
 * `NOT_FOUND` and `UNAVAILABLE` for a cancelled call) at this lower,
 * fixture-tool layer, without importing that browser-facing contract here.
 */
import type { EvidenceLevel, EvidenceVerdict } from '@pax/contracts';

export interface ToolEvidenceItem {
  sourceId: string;
  level: EvidenceLevel;
  verdict: EvidenceVerdict;
  summary: string;
}

export type ToolResultStatus = 'ok' | 'not_found' | 'cancelled';

interface ToolResultBase {
  toolId: string;
}

export interface ToolOkResult<T> extends ToolResultBase {
  status: 'ok';
  data: T;
}

export interface ToolNotFoundResult extends ToolResultBase {
  status: 'not_found';
  /** The candidate/source id (or other lookup key) that did not resolve. */
  query: string;
  message: string;
}

export interface ToolCancelledResult extends ToolResultBase {
  status: 'cancelled';
  message: string;
}

export type ToolResult<T> = ToolOkResult<T> | ToolNotFoundResult | ToolCancelledResult;

/** True when `signal` exists and has already fired. Safe to call with `undefined` (synchronous fixture tools may be called with no signal at all). */
export function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export function okResult<T>(toolId: string, data: T): ToolOkResult<T> {
  return { status: 'ok', toolId, data };
}

export function notFoundResult(toolId: string, query: string, message: string): ToolNotFoundResult {
  return { status: 'not_found', toolId, query, message };
}

export function cancelledResult(
  toolId: string,
  message = `${toolId}: cancelled before completion`,
): ToolCancelledResult {
  return { status: 'cancelled', toolId, message };
}
