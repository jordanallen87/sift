/**
 * Pure domain logic for the typed attribute protocol shared by pack-defined
 * and case-defined (`custom.*`) entity data. Grounded in
 * docs/specs/pack-authoring.md "Typed core with extensible domain data" and
 * docs/specs/packs-and-routing.md "Flexible attributes and criteria".
 *
 * `@sift/contracts` already enforces the `AttributeRecord` asserted/unknown
 * cross-field rule and every `AttributeValue` variant's shape at the schema
 * boundary. This module adds the *domain-logic* behavior built on top of
 * those schemas: normalizing an untyped raw value against a declared
 * `AttributeDefinition`, comparing two values for later scoring use, and a
 * smart constructor for `AttributeRecord` that a caller can use without
 * hand-assembling a raw object and calling `.parse()` themselves.
 *
 * This file performs no filesystem, network, or wall-clock access. Every
 * timestamp a function here produces comes from an injected `Clock` (see
 * `Clock` below) — never `Date.now()`. Every generated ID comes from an
 * injected `IdGenerator` (see `IdGenerator` below) — never
 * `crypto.randomUUID()` or `Math.random()`.
 */
import {
  AttributeRecordSchema,
  AttributeValueSchema,
  type AttributeComparison,
  type AttributeDefinition,
  type AttributeRecord,
  type AttributeStatus,
  type AttributeValue,
  type AttributeValueType,
} from '@sift/contracts';

// --- Shared injected ports ---
//
// architecture.md: "All timestamps in deterministic tests come from an
// injected Clock. IDs come from an injected IdGenerator." Neither interface
// is defined in `packages/contracts/src` (checked: attributes.ts, case.ts,
// commands.ts, events.ts, packs.ts, runtime.ts, scenario.ts, http.ts — none
// declare a `Clock` or `IdGenerator` port), so both are defined here as the
// minimal shape `packages/core` needs and re-exported from `index.ts` for
// the rest of the package.

/** Injected wall-clock port. Returns an ISO 8601 datetime string. */
export interface Clock {
  now(): string;
}

/** Injected unique-ID port. `prefix`, when given, is a hint only (e.g. an
 * implementation may render `next('ext')` as `ext_7f3c...`). */
export interface IdGenerator {
  next(prefix?: string): string;
}

// --- Shared pure-function result type ---
//
// Every domain function in `packages/core` that can fail on untrusted or
// caller-assembled input returns a `DomainResult` instead of throwing, so
// every function here is safe to call directly with unchecked data (e.g. a
// WebMCP tool argument) without a surrounding try/catch.

export type DomainResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export function ok<T>(value: T): DomainResult<T> {
  return { ok: true, value };
}

export function fail<T>(...errors: readonly string[]): DomainResult<T> {
  return { ok: false, errors };
}

function formatZodIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map(
    (issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'value'}: ${issue.message}`,
  );
}

// --- Raw value normalization ---

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Builds a candidate object suitable for `AttributeValueSchema.safeParse`
 * from an untyped raw value plus the declared `valueType`. Accepts either:
 *  - an object payload matching the variant's non-`type` fields (e.g.
 *    `{ value: 42, unit: 'mpg' }` for a `number` attribute), with or without
 *    an explicit `type` field (which must match `valueType` if present); or
 *  - a bare primitive/array for the single-field variants (`string`,
 *    `text`, `number`, `boolean`, `date`, `enum`, `string_list`).
 *
 * The multi-field variants (`money`, `duration`, `range`) require an object
 * payload — a bare primitive is ambiguous for them and is rejected.
 */
function buildCandidate(
  valueType: AttributeValueType,
  raw: unknown,
): Record<string, unknown> | undefined {
  if (isPlainObject(raw)) {
    const existingType = raw['type'];
    if (existingType !== undefined && existingType !== valueType) {
      return undefined;
    }
    return { ...raw, type: valueType };
  }

  switch (valueType) {
    case 'string':
    case 'text':
    case 'date':
    case 'enum':
      return typeof raw === 'string' ? { type: valueType, value: raw } : undefined;
    case 'number':
      return typeof raw === 'number' ? { type: valueType, value: raw } : undefined;
    case 'boolean':
      return typeof raw === 'boolean' ? { type: valueType, value: raw } : undefined;
    case 'string_list':
      return Array.isArray(raw) ? { type: valueType, values: raw } : undefined;
    case 'money':
    case 'duration':
    case 'range':
      return undefined;
  }
}

/**
 * Domain-level constraints an `AttributeDefinition` places on a value beyond
 * what the bare `AttributeValueSchema` variant already enforces: an `enum`
 * or `string_list` value must fall within `definition.allowedValues` when
 * the definition declares one.
 */
function checkDefinitionConstraints(
  definition: Pick<AttributeDefinition, 'allowedValues'>,
  value: AttributeValue,
): string[] {
  if (value.type === 'enum' && definition.allowedValues !== undefined) {
    const allowed = definition.allowedValues;
    return allowed.includes(value.value)
      ? []
      : [`"${value.value}" is not one of the allowed values for this attribute`];
  }

  if (value.type === 'string_list' && definition.allowedValues !== undefined) {
    const allowed = definition.allowedValues;
    const invalid = value.values.filter((entry) => !allowed.includes(entry));
    return invalid.length === 0
      ? []
      : [
          `value${invalid.length === 1 ? '' : 's'} ${invalid.map((entry) => `"${entry}"`).join(', ')} ${
            invalid.length === 1 ? 'is' : 'are'
          } not among the allowed values for this attribute`,
        ];
  }

  return [];
}

/**
 * Applies the definition's declared `unit` as a default on `number`/`range`
 * values that did not specify their own unit. Never overrides a unit the
 * value already carries.
 */
function applyDefinitionDefaults(
  definition: Pick<AttributeDefinition, 'unit'>,
  value: AttributeValue,
): AttributeValue {
  if (definition.unit === undefined) {
    return value;
  }
  if (value.type === 'number' && value.unit === undefined) {
    return { ...value, unit: definition.unit };
  }
  if (value.type === 'range' && value.unit === undefined) {
    return { ...value, unit: definition.unit };
  }
  return value;
}

/**
 * Validates and normalizes an untyped raw value (e.g. a WebMCP tool
 * argument or form field) against an `AttributeDefinition`'s `valueType`,
 * producing a well-typed `AttributeValue` or a list of human-readable
 * errors. Delegates structural/security validation (variant shape, bounded
 * lengths, the HTML/executable-content guard) to `AttributeValueSchema`;
 * adds the definition-specific `allowedValues` and default-`unit` behavior
 * on top.
 */
export function normalizeAttributeValue(
  definition: AttributeDefinition,
  raw: unknown,
): DomainResult<AttributeValue> {
  const candidate = buildCandidate(definition.valueType, raw);
  if (candidate === undefined) {
    return fail(
      `value for a "${definition.valueType}" attribute must be a matching primitive or object payload, got ${describeRaw(raw)}`,
    );
  }

  const parsed = AttributeValueSchema.safeParse(candidate);
  if (!parsed.success) {
    return fail(...formatZodIssues(parsed.error.issues));
  }

  const definitionErrors = checkDefinitionConstraints(definition, parsed.data);
  if (definitionErrors.length > 0) {
    return fail(...definitionErrors);
  }

  return ok(applyDefinitionDefaults(definition, parsed.data));
}

function describeRaw(raw: unknown): string {
  if (raw === null) return 'null';
  if (raw === undefined) return 'undefined';
  if (Array.isArray(raw)) return 'an array';
  return `a ${typeof raw}`;
}

// --- Comparison ---

export type ComparisonOutcome =
  | { readonly comparable: true; readonly order: -1 | 0 | 1 }
  | { readonly comparable: false; readonly reason: string };

function orderFromDifference(difference: number): -1 | 0 | 1 {
  if (difference < 0) return -1;
  if (difference > 0) return 1;
  return 0;
}

/**
 * Extracts a single numeric magnitude from an `AttributeValue` for ordering
 * purposes. `range` uses the midpoint of `minimum`/`maximum` when both are
 * present, falling back to whichever bound is present. Non-numeric variants
 * (`string`, `text`, `boolean`, `date`, `enum`, `string_list`) have no
 * numeric magnitude and return `null`.
 *
 * Inferred, documented limitation: `money`/`duration` magnitudes are the
 * raw `amount`, not cross-currency or cross-unit normalized — comparing a
 * USD amount to a EUR amount, or a duration in days to one in years, is the
 * caller's responsibility to normalize before calling this function.
 */
function numericMagnitude(value: AttributeValue): number | null {
  switch (value.type) {
    case 'number':
      return value.value;
    case 'money':
      return value.amount;
    case 'duration':
      return value.amount;
    case 'range':
      if (value.minimum !== undefined && value.maximum !== undefined) {
        return (value.minimum + value.maximum) / 2;
      }
      if (value.minimum !== undefined) return value.minimum;
      if (value.maximum !== undefined) return value.maximum;
      return null;
    case 'string':
    case 'text':
    case 'boolean':
    case 'date':
    case 'enum':
    case 'string_list':
      return null;
  }
}

/**
 * Compares two `AttributeValue`s according to an `AttributeComparison`
 * mode, for later scoring use. Returns which of `a`/`b` is "better" as
 * `order: -1` (a is better), `order: 1` (b is better), or `order: 0` (tie),
 * or explains why the pair is not comparable under the given mode.
 *
 * Documented judgment calls:
 *  - `'none'` always returns `{ comparable: true, order: 0 }` — the
 *    attribute is declared to have no ordering, i.e. neither value is
 *    "better", which is a defined tie rather than an error.
 *  - `'constraint'` always returns `comparable: false` — it represents a
 *    pass/fail threshold check (is this candidate's value acceptable at
 *    all?), not a pairwise ordering between two candidates' values.
 *  - `'target'` requires a `target` value (the third argument); without one
 *    it is not comparable. The value whose magnitude is numerically closer
 *    to the target is "better".
 */
export function compareAttributeValues(
  a: AttributeValue,
  b: AttributeValue,
  comparison: AttributeComparison,
  target?: AttributeValue,
): ComparisonOutcome {
  if (comparison === 'none') {
    return { comparable: true, order: 0 };
  }

  if (comparison === 'constraint') {
    return {
      comparable: false,
      reason:
        'comparison mode "constraint" represents a pass/fail threshold, not a pairwise ordering',
    };
  }

  if (a.type !== b.type) {
    return {
      comparable: false,
      reason: `cannot compare an AttributeValue of type "${a.type}" with one of type "${b.type}"`,
    };
  }

  const magnitudeA = numericMagnitude(a);
  const magnitudeB = numericMagnitude(b);
  if (magnitudeA === null || magnitudeB === null) {
    return {
      comparable: false,
      reason: `AttributeValue type "${a.type}" has no numeric magnitude to compare`,
    };
  }

  if (comparison === 'lower_better') {
    return { comparable: true, order: orderFromDifference(magnitudeA - magnitudeB) };
  }

  if (comparison === 'higher_better') {
    return { comparable: true, order: orderFromDifference(magnitudeB - magnitudeA) };
  }

  // comparison === 'target'
  if (target === undefined) {
    return { comparable: false, reason: 'comparison mode "target" requires a target value' };
  }
  const magnitudeTarget = numericMagnitude(target);
  if (magnitudeTarget === null) {
    return {
      comparable: false,
      reason: 'target value has no numeric magnitude to compare against',
    };
  }
  const distanceA = Math.abs(magnitudeA - magnitudeTarget);
  const distanceB = Math.abs(magnitudeB - magnitudeTarget);
  return { comparable: true, order: orderFromDifference(distanceA - distanceB) };
}

// --- AttributeRecord cross-field invariant and smart constructor ---

/**
 * Asserts the `AttributeRecord` asserted/unknown cross-field invariant
 * (pack-authoring.md: "`value` is required for `asserted`, `supported`,
 * `verified`, and `conflicted` records and must be absent for `unknown`")
 * at the domain-logic level, for callers that need to check or construct a
 * record without going through `AttributeRecordSchema.parse` directly.
 * Returns `null` when valid, or a human-readable reason when not.
 */
export function attributeValueStatusInvariantError(
  status: AttributeStatus,
  value: AttributeValue | undefined,
): string | null {
  if (status === 'unknown') {
    return value !== undefined ? 'value must be absent when status is "unknown"' : null;
  }
  return value === undefined ? `value is required when status is "${status}"` : null;
}

export interface CreateAttributeRecordInput {
  readonly definitionId: string;
  readonly label: string;
  readonly origin: AttributeRecord['origin'];
  readonly sourceIds?: readonly string[];
  readonly confidence?: number;
  readonly status: AttributeStatus;
  readonly value?: AttributeValue;
}

/**
 * Smart constructor for a valid `AttributeRecord`. Enforces the
 * asserted/unknown cross-field invariant before attempting to build the
 * record (so a caller gets one clear domain-level reason for that specific
 * mistake, rather than a generic schema issue), sets `updatedAt` from the
 * injected `Clock`, and validates the fully-assembled record against
 * `AttributeRecordSchema` as a final defense-in-depth check.
 */
export function createAttributeRecord(
  input: CreateAttributeRecordInput,
  clock: Clock,
): DomainResult<AttributeRecord> {
  const invariantError = attributeValueStatusInvariantError(input.status, input.value);
  if (invariantError !== null) {
    return fail(invariantError);
  }

  const candidate: AttributeRecord = {
    definitionId: input.definitionId,
    label: input.label,
    origin: input.origin,
    sourceIds: input.sourceIds !== undefined ? [...input.sourceIds] : [],
    status: input.status,
    updatedAt: clock.now(),
    ...(input.value !== undefined ? { value: input.value } : {}),
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
  };

  const parsed = AttributeRecordSchema.safeParse(candidate);
  if (!parsed.success) {
    return fail(...formatZodIssues(parsed.error.issues));
  }
  return ok(parsed.data);
}
