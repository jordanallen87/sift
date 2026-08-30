/**
 * Real Strands `InterventionHandler` implementations for the six ordered
 * handlers docs/specs/strands-runtime.md "Interventions and steering"
 * requires:
 *
 * 1. `ScopeAuthorization` -- denies an undeclared tool.
 * 2. `ConsequenceGuard` -- confirms a consequential tool call, denies a
 *    forbidden one.
 * 3. `BudgetGuard` -- confirms or denies work exceeding configured limits.
 * 4. `RetrySteering` -- guides after repeated failures or duplicate
 *    searches, backed by a deterministic `ToolLedger`.
 * 5. `EvidenceQualitySteering` -- guides outputs missing source references
 *    or presenting unsupported certainty.
 * 6. `OutputSanitizer` -- transforms displayable text to strip unsupported
 *    control content while preserving structured data.
 *
 * Every handler extends the real `InterventionHandler` base class from the
 * installed `@strands-agents/sdk` and returns real `InterventionActions.*`
 * action objects (`proceed()`/`deny()`/`guide()`/`confirm()`/`transform()`).
 * `strands-adapter.ts` registers instances of these classes directly on
 * `AgentConfig.interventions` -- the SDK's own `InterventionRegistry`
 * dispatches them (in registration order, short-circuiting on `Deny`); this
 * module implements the handlers, not the dispatch loop.
 *
 * Verified directly against the installed package (not taken on the task
 * prompt's word -- see the dated docs/build-log.md entry for this task):
 * `Proceed`/`Deny`/`Guide`/`Confirm`/`Transform`/`InterventionAction` are
 * declared in `interventions/actions.ts` but are **not** re-exported from
 * either `@strands-agents/sdk`'s root barrel or any public subpath export
 * (only `InterventionHandler` and the `InterventionActions` factory object
 * are). Every override below therefore omits an explicit return-type
 * annotation and lets TypeScript infer it from the `InterventionActions.*`
 * call each branch returns, which the compiler still checks for Liskov
 * compatibility against `InterventionHandler`'s abstract method signatures
 * -- no unexported type name is required to get that checking.
 *
 * `InterventionEvent` (the `type`/`handler`/`runId`/`obligationId`/`stage`/
 * `subject`/`reason`/`timestamp` shape) is defined here, verbatim from
 * strands-runtime.md's "Interventions and steering" section: it is Sift's
 * own normalized intervention record, not a `@sift/contracts` schema (that
 * package is complete and read-only for this task) and not a Strands SDK
 * type. `event-normalizer.ts` imports it from here to build the
 * corresponding `RuntimeDebugEvent`.
 */
import {
  InterventionActions,
  InterventionHandler,
  TextBlock,
  type AfterModelCallEvent,
  type AfterToolCallEvent,
  type BeforeToolCallEvent,
  type JSONValue,
  type Message,
} from '@strands-agents/sdk';
import type { Clock } from '@sift/core';

// --- InterventionEvent (strands-runtime.md "Interventions and steering", verbatim) ---

export type InterventionEventType =
  | 'intervention.proceed'
  | 'intervention.guide'
  | 'intervention.confirm'
  | 'intervention.deny'
  | 'intervention.transform';

export type InterventionStage = 'before_tool' | 'after_model';

// `Proceed`/`Deny`/`Guide`/`Confirm`/`Transform` (`interventions/actions.ts`)
// are not re-exported from any public `@strands-agents/sdk` entry point --
// confirmed directly against the installed package's `.d.ts` files (see
// this module's header comment). With `declaration: true` in
// `tsconfig.base.json`, TypeScript refuses to infer an override method's
// return type from an unnamed type (TS2883: "cannot be named without a
// reference to ..."), so every override below is annotated with one of
// these local aliases -- derived via `ReturnType<typeof
// InterventionActions.xxx>` rather than needing the SDK's own unexported
// type names -- instead of relying on inference.
type ProceedAction = ReturnType<typeof InterventionActions.proceed>;
type DenyAction = ReturnType<typeof InterventionActions.deny>;
type GuideAction = ReturnType<typeof InterventionActions.guide>;
type ConfirmAction = ReturnType<typeof InterventionActions.confirm>;
type TransformAction = ReturnType<typeof InterventionActions.transform>;

export interface InterventionEvent {
  type: InterventionEventType;
  handler: string;
  runId: string;
  obligationId: string;
  stage: InterventionStage;
  subject: string;
  reason: string;
  timestamp: string;
}

/** Shared construction dependencies every handler in this module needs. */
export interface InterventionDeps {
  runId: string;
  obligationId: string;
  clock: Clock;
  emit: (event: InterventionEvent) => void;
}

abstract class BaseInterventionHandler extends InterventionHandler {
  protected constructor(protected readonly baseDeps: InterventionDeps) {
    super();
  }

  protected record(
    stage: InterventionStage,
    type: InterventionEventType,
    subject: string,
    reason: string,
  ): void {
    this.baseDeps.emit({
      type,
      handler: this.name,
      runId: this.baseDeps.runId,
      obligationId: this.baseDeps.obligationId,
      stage,
      subject,
      reason,
      timestamp: this.baseDeps.clock.now(),
    });
  }
}

// --- 1. ScopeAuthorization ---

export interface ScopeAuthorizationDeps extends InterventionDeps {
  /** The compiled pack's `allowedTools` intersection for this run/obligation (strands-runtime.md "Skills": the cross-cutting `allowedTools` set). */
  allowedTools: readonly string[];
}

/** Denies any `beforeToolCall` whose tool name is not in the run's declared allowlist. */
export class ScopeAuthorization extends BaseInterventionHandler {
  override readonly name = 'ScopeAuthorization';

  constructor(private readonly deps: ScopeAuthorizationDeps) {
    super(deps);
  }

  override beforeToolCall(event: BeforeToolCallEvent): ProceedAction | DenyAction {
    const toolName = event.toolUse.name;
    if (this.deps.allowedTools.includes(toolName)) {
      this.record(
        'before_tool',
        'intervention.proceed',
        toolName,
        'tool is within the declared allowlist',
      );
      return InterventionActions.proceed();
    }
    const reason = `tool "${toolName}" is not in the declared allowlist for this run`;
    this.record('before_tool', 'intervention.deny', toolName, reason);
    return InterventionActions.deny(reason);
  }
}

// --- 2. ConsequenceGuard ---

export interface ConsequenceGuardDeps extends InterventionDeps {
  /** Tool IDs that create a consequential artifact and require human confirmation before the call proceeds (e.g. `propose_recommendation`). */
  consequentialToolIds: readonly string[];
  /** Tool IDs whose effect this pack forbids outright (denied unconditionally). Distinct from `consequentialToolIds`: forbidden tools are never declared as usable at all in a well-formed pack, but the guard still defends the boundary if one is somehow requested. */
  forbiddenToolIds?: readonly string[];
  /** Supplies a preemptive confirmation response (deterministic fixture mode / tests). Omit for real interactive human-in-the-loop, where `Confirm` pauses the agent for external resume. */
  resolveConfirmation?: (toolName: string, input: JSONValue) => JSONValue | undefined;
}

/** Confirms a consequential tool call (`beforeToolCall`) and denies a forbidden one. `Confirm` is only valid on `beforeToolCall` (strands-runtime.md), which is exactly the stage this handler gates. */
export class ConsequenceGuard extends BaseInterventionHandler {
  override readonly name = 'ConsequenceGuard';

  constructor(private readonly deps: ConsequenceGuardDeps) {
    super(deps);
  }

  override beforeToolCall(event: BeforeToolCallEvent): ProceedAction | DenyAction | ConfirmAction {
    const toolName = event.toolUse.name;
    if (this.deps.forbiddenToolIds?.includes(toolName) === true) {
      const reason = `tool "${toolName}" performs an effect this pack forbids`;
      this.record('before_tool', 'intervention.deny', toolName, reason);
      return InterventionActions.deny(reason);
    }
    if (this.deps.consequentialToolIds.includes(toolName)) {
      const reason = `tool "${toolName}" creates a consequential artifact and requires human confirmation`;
      this.record('before_tool', 'intervention.confirm', toolName, reason);
      const preemptive = this.deps.resolveConfirmation?.(toolName, event.toolUse.input);
      return preemptive === undefined
        ? InterventionActions.confirm(reason)
        : InterventionActions.confirm(reason, { response: preemptive });
    }
    this.record(
      'before_tool',
      'intervention.proceed',
      toolName,
      'tool has no consequential or forbidden effect',
    );
    return InterventionActions.proceed();
  }
}

// --- 3. BudgetGuard ---

export interface BudgetGuardDeps extends InterventionDeps {
  /** Hard per-run tool-call ceiling (`ExecutionLimits.maxToolCallsPerRun`). */
  maxToolCallsPerRun: number;
  /** Tool names excluded from the run's tool-call budget (SDK/plugin-internal tools such as `strands_structured_output` or `skills`, which are not domain investigation work). */
  excludedToolNames?: readonly string[];
}

/**
 * Confirms the last budgeted tool call the run's `maxToolCallsPerRun` limit
 * permits, and denies any call beyond it. Graduated on purpose: a human
 * gets one chance to explicitly extend a run right at the boundary
 * (`Confirm`), while a call that has already exceeded the budget is a hard
 * stop (`Deny`) -- strands-runtime.md: "confirms or denies work exceeding
 * configured limits."
 */
export class BudgetGuard extends BaseInterventionHandler {
  override readonly name = 'BudgetGuard';
  private budgetedCallCount = 0;

  constructor(private readonly deps: BudgetGuardDeps) {
    super(deps);
  }

  override beforeToolCall(event: BeforeToolCallEvent): ProceedAction | DenyAction | ConfirmAction {
    const toolName = event.toolUse.name;
    if (this.deps.excludedToolNames?.includes(toolName) === true) {
      this.record(
        'before_tool',
        'intervention.proceed',
        toolName,
        'tool is excluded from the run tool-call budget',
      );
      return InterventionActions.proceed();
    }

    const wouldBeCallNumber = this.budgetedCallCount + 1;
    if (wouldBeCallNumber > this.deps.maxToolCallsPerRun) {
      const reason = `the run's tool-call budget (${this.deps.maxToolCallsPerRun}) is already exhausted`;
      this.record('before_tool', 'intervention.deny', toolName, reason);
      return InterventionActions.deny(reason);
    }

    this.budgetedCallCount = wouldBeCallNumber;
    if (wouldBeCallNumber === this.deps.maxToolCallsPerRun) {
      const reason = `this is the last tool call the run's budget (${this.deps.maxToolCallsPerRun}) permits`;
      this.record('before_tool', 'intervention.confirm', toolName, reason);
      return InterventionActions.confirm(reason);
    }

    this.record('before_tool', 'intervention.proceed', toolName, 'within the run tool-call budget');
    return InterventionActions.proceed();
  }
}

// --- 4. RetrySteering + Tool Ledger ---

export interface ToolLedgerEntry {
  toolName: string;
  normalizedArgs: string;
  resultStatus: 'success' | 'failure';
  sourceIds: readonly string[];
  evidenceDelta: number;
  timestamp: string;
}

/** Stable normalized-argument key: deep key-sorted JSON. Two calls with the same tool and semantically identical arguments (in any key order) normalize to the same string. */
export function normalizeToolArgs(input: JSONValue): string {
  return JSON.stringify(sortKeysDeep(input));
}

function sortKeysDeep(value: JSONValue): JSONValue {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, JSONValue> = {};
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [key, entryValue] of entries) {
      sorted[key] = sortKeysDeep(entryValue);
    }
    return sorted;
  }
  return value;
}

/**
 * Deterministic per-run record of tool name, normalized arguments, result
 * status, source IDs, and evidence delta (strands-runtime.md "Retry
 * steering rules": "Deterministic context providers track tool name,
 * normalized arguments, result status, source IDs, and evidence delta").
 * `RetrySteering` reads it in `beforeToolCall` and writes to it in
 * `afterToolCall`.
 */
export class ToolLedger {
  private readonly entries: ToolLedgerEntry[] = [];

  record(entry: ToolLedgerEntry): void {
    this.entries.push(entry);
  }

  get all(): readonly ToolLedgerEntry[] {
    return this.entries;
  }

  /** Count of prior calls to this exact normalized (tool, args) pair that failed. */
  failureCount(toolName: string, normalizedArgs: string): number {
    return this.entries.filter(
      (entry) =>
        entry.toolName === toolName &&
        entry.normalizedArgs === normalizedArgs &&
        entry.resultStatus === 'failure',
    ).length;
  }

  /** True when the last `n` recorded calls (of any tool) all produced no new source or claim. False while fewer than `n` calls have happened yet. */
  lastCallsHaveNoNewEvidence(n: number): boolean {
    if (this.entries.length < n) return false;
    return this.entries.slice(-n).every((entry) => entry.evidenceDelta <= 0);
  }

  /** True when a prior call to this tool used the same query family. */
  matchesPriorQueryFamily(toolName: string, queryFamily: string): boolean {
    return this.entries.some(
      (entry) => entry.toolName === toolName && entry.normalizedArgs === queryFamily,
    );
  }
}

export interface RetrySteeringDeps extends InterventionDeps {
  ledger: ToolLedger;
  /** Attempts already used for the active obligation (`ExecutionRequest.priorAttempts.length`). */
  attemptsUsedForObligation: number;
  /** `ExecutionLimits.maxAttemptsPerObligation` for the active obligation. */
  maxAttemptsPerObligation: number;
  /** A short description of an allowed alternative technique from the active skill, appended to steering feedback when available (strands-runtime.md: "The guidance identifies an allowed alternative technique from the active skill."). */
  alternativeTechniqueHint?: string;
  /** Derives a call's "query family" for the duplicate-search rule. Defaults to the normalized arguments themselves. */
  queryFamilyOf?: (toolName: string, input: JSONValue) => string;
  /** Derives the evidence delta an `AfterToolCallEvent` produced, for ledger recording. Defaults to `+1` on success / `0` on failure. */
  evidenceDeltaOf?: (event: AfterToolCallEvent) => number;
  /** Derives the source IDs an `AfterToolCallEvent` produced, for ledger recording. Defaults to `[]`. */
  sourceIdsOf?: (event: AfterToolCallEvent) => readonly string[];
}

/**
 * Guides (never denies -- strands-runtime.md leaves "no technique remains"
 * to the core engine's accepted-uncertainty/blocked fallback, not to this
 * handler) whenever one of the four no-progress conditions from
 * strands-runtime.md "Retry steering rules" is true, evaluated against the
 * deterministic `ToolLedger`.
 */
export class RetrySteering extends BaseInterventionHandler {
  override readonly name = 'RetrySteering';

  constructor(private readonly deps: RetrySteeringDeps) {
    super(deps);
  }

  override beforeToolCall(event: BeforeToolCallEvent): ProceedAction | GuideAction {
    const toolName = event.toolUse.name;
    const normalizedArgs = normalizeToolArgs(event.toolUse.input);
    const queryFamily = this.deps.queryFamilyOf?.(toolName, event.toolUse.input) ?? normalizedArgs;

    if (this.deps.attemptsUsedForObligation >= this.deps.maxAttemptsPerObligation) {
      return this.guide(
        toolName,
        `the obligation's attempt budget (${this.deps.maxAttemptsPerObligation}) is already exhausted`,
      );
    }
    if (this.deps.ledger.failureCount(toolName, normalizedArgs) >= 2) {
      return this.guide(toolName, `the same call to "${toolName}" has already failed twice`);
    }
    if (this.deps.ledger.lastCallsHaveNoNewEvidence(3)) {
      return this.guide(toolName, 'the last three calls produced no new source or claim');
    }
    if (this.deps.ledger.matchesPriorQueryFamily(toolName, queryFamily)) {
      return this.guide(
        toolName,
        'this search repeats a prior query family without explaining a new angle',
      );
    }

    this.record(
      'before_tool',
      'intervention.proceed',
      toolName,
      'no repeated-failure or no-progress condition applies',
    );
    return InterventionActions.proceed();
  }

  override afterToolCall(event: AfterToolCallEvent): ProceedAction {
    const resultStatus: ToolLedgerEntry['resultStatus'] =
      event.result.status === 'success' ? 'success' : 'failure';
    const evidenceDelta =
      this.deps.evidenceDeltaOf?.(event) ?? (resultStatus === 'success' ? 1 : 0);
    this.deps.ledger.record({
      toolName: event.toolUse.name,
      normalizedArgs: normalizeToolArgs(event.toolUse.input),
      resultStatus,
      sourceIds: this.deps.sourceIdsOf?.(event) ?? [],
      evidenceDelta,
      timestamp: this.deps.clock.now(),
    });
    return InterventionActions.proceed();
  }

  private guide(subject: string, reasonDetail: string): GuideAction {
    const hint =
      this.deps.alternativeTechniqueHint !== undefined
        ? ` Try: ${this.deps.alternativeTechniqueHint}`
        : '';
    this.record('before_tool', 'intervention.guide', subject, reasonDetail);
    return InterventionActions.guide(`Steering: ${reasonDetail}.${hint}`, { reason: reasonDetail });
  }
}

// --- 5. EvidenceQualitySteering ---

const SOURCE_ID_PATTERN = /\bsource-[a-z0-9-]+\b/i;
const UNSUPPORTED_CERTAINTY_PATTERN =
  /\b(definitely|guaranteed|100%\s*sure|absolutely certain|without any doubt|no doubt whatsoever)\b/i;

function extractMessageText(message: Message): string {
  return message.content
    .filter((block): block is TextBlock => block.type === 'textBlock')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Guides a final textual response (`afterModelCall`, `stopReason ===
 * 'endTurn'`) that either cites no source ID or asserts unsupported
 * certainty. Skips mid-investigation turns (`stopReason === 'toolUse'`,
 * or no `stopData` at all, e.g. an error) -- those are not yet the "output"
 * strands-runtime.md's rule evaluates.
 */
export class EvidenceQualitySteering extends BaseInterventionHandler {
  override readonly name = 'EvidenceQualitySteering';

  constructor(deps: InterventionDeps) {
    super(deps);
  }

  override afterModelCall(event: AfterModelCallEvent): ProceedAction | GuideAction {
    if (event.stopData?.stopReason !== 'endTurn') {
      return InterventionActions.proceed();
    }
    const text = extractMessageText(event.stopData.message);
    if (text.trim().length === 0) {
      return InterventionActions.proceed();
    }
    if (!SOURCE_ID_PATTERN.test(text)) {
      const reason = 'the response makes claims without citing a source id';
      this.record('after_model', 'intervention.guide', 'model.response', reason);
      return InterventionActions.guide(
        'Cite at least one source id (e.g. "source-...") for every factual claim.',
        { reason },
      );
    }
    if (UNSUPPORTED_CERTAINTY_PATTERN.test(text)) {
      const reason = 'the response asserts unsupported certainty';
      this.record('after_model', 'intervention.guide', 'model.response', reason);
      return InterventionActions.guide(
        'State confidence explicitly instead of asserting absolute certainty.',
        { reason },
      );
    }
    this.record(
      'after_model',
      'intervention.proceed',
      'model.response',
      'response cites sources and avoids unsupported certainty',
    );
    return InterventionActions.proceed();
  }
}

// --- 6. OutputSanitizer ---

// HTML/script tags, javascript: URLs, inline event-handler attributes, and
// ANSI/terminal control escapes -- "unsupported control content" a
// displayable assistant message must never carry, while leaving ordinary
// prose, numbers, and punctuation untouched.
// \x1b (ESC) is the literal ANSI/terminal escape byte this pattern exists to
// strip, not an accidental control character.
/* eslint-disable no-control-regex */
const CONTROL_CONTENT_PATTERN =
  /<\/?[a-zA-Z!][^>]*>|javascript:|on[a-zA-Z]+\s*=\s*["'][^"']*["']|\x1b\[[0-9;]*[A-Za-z]/g;
/* eslint-enable no-control-regex */

function sanitizeDisplayText(text: string): string {
  return text.replace(CONTROL_CONTENT_PATTERN, '');
}

/**
 * Transforms a final response's displayable text in place to strip
 * unsupported control content, leaving non-text content blocks (tool use,
 * structured output) untouched. Registered last so it sees the same text
 * `EvidenceQualitySteering` already evaluated for source/certainty quality.
 */
export class OutputSanitizer extends BaseInterventionHandler {
  override readonly name = 'OutputSanitizer';

  constructor(deps: InterventionDeps) {
    super(deps);
  }

  override afterModelCall(event: AfterModelCallEvent): ProceedAction | TransformAction {
    const message = event.stopData?.message;
    if (message === undefined) {
      return InterventionActions.proceed();
    }

    let needsSanitizing = false;
    for (const block of message.content) {
      if (block.type === 'textBlock' && sanitizeDisplayText(block.text) !== block.text) {
        needsSanitizing = true;
        break;
      }
    }

    if (!needsSanitizing) {
      this.record(
        'after_model',
        'intervention.proceed',
        'model.response',
        'no unsupported control content found',
      );
      return InterventionActions.proceed();
    }

    const reason = 'stripped unsupported control content (HTML/script/ANSI) from displayable text';
    this.record('after_model', 'intervention.transform', 'model.response', reason);
    return InterventionActions.transform(
      () => {
        for (let i = 0; i < message.content.length; i++) {
          const block = message.content[i];
          if (block?.type === 'textBlock') {
            const sanitized = sanitizeDisplayText(block.text);
            if (sanitized !== block.text) {
              message.content[i] = new TextBlock(sanitized);
            }
          }
        }
      },
      { reason },
    );
  }
}
