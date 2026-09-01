/**
 * Typed attribute protocol shared by pack-defined and case-defined
 * (`custom.*`) entity data. Grounded in docs/specs/pack-authoring.md
 * "Typed core with extensible domain data".
 */
import { z } from 'zod';

/**
 * pack-authoring.md requires that "arbitrary functions, class instances,
 * recursive unbounded JSON, HTML, and executable expressions are rejected."
 * Zod's primitive schemas (`z.string()`, `z.number()`, `z.boolean()`) already
 * reject functions and class instances structurally. This pattern adds a
 * light heuristic guard against HTML/XML-tag-shaped and `javascript:`/
 * inline-event-handler-shaped text so free-text fields cannot smuggle markup
 * or script content. It intentionally still allows an ordinary "<" used as a
 * comparator (e.g. "price < 20000") since it is not followed by a tag-shaped
 * token.
 */
const HTML_OR_EXECUTABLE_PATTERN = /<\/?[a-zA-Z!]|javascript:|on[a-zA-Z]+\s*=\s*["']/;

function safeString(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .refine((value) => !HTML_OR_EXECUTABLE_PATTERN.test(value), {
      message: 'value must not contain HTML tags or executable expressions',
    });
}

export const ATTRIBUTE_VALUE_TYPES = [
  'string',
  'text',
  'number',
  'money',
  'boolean',
  'date',
  'duration',
  'enum',
  'range',
  'string_list',
] as const;
export type AttributeValueType = (typeof ATTRIBUTE_VALUE_TYPES)[number];

export const DURATION_UNITS = ['minute', 'hour', 'day', 'month', 'year'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

export const StringAttributeValueSchema = z
  .object({
    type: z.literal('string'),
    value: safeString(2000),
  })
  .strict();

/**
 * Long-form text, optionally written as Markdown.
 *
 * `format` exists because a model asked to explain a custom comparison
 * field has genuinely structured things to say -- a short lead, a couple of
 * measurements as a list, a caveat -- and a single unbroken paragraph
 * throws that structure away. It is OPTIONAL and absent means plain text,
 * so every value written before this field existed keeps its exact meaning
 * and (via canonicalization dropping `undefined`) its exact hash.
 *
 * **Markdown, never HTML, and this is a security boundary rather than a
 * style preference.** Every string in these contracts goes through
 * `safeString`, which rejects `<tag`, `javascript:`, and `on*=` handlers.
 * That check exists precisely because much of this content is written by a
 * model and rendered in the user's browser. Markdown needs none of what it
 * blocks -- `**bold**`, lists, and `[links](https://...)` all pass through
 * unchanged -- so formatting is gained here without weakening the control.
 * Accepting an HTML variant would mean removing it.
 *
 * The renderer carries the other half of that boundary: no raw HTML
 * passthrough, and link schemes restricted to http/https (`safeString`
 * already blocks `javascript:`, but not, say, a `data:text/html` URL).
 */
export const TEXT_VALUE_FORMATS = ['markdown'] as const;
export type TextValueFormat = (typeof TEXT_VALUE_FORMATS)[number];

export const TextAttributeValueSchema = z
  .object({
    type: z.literal('text'),
    value: safeString(20_000),
    format: z.enum(TEXT_VALUE_FORMATS).optional(),
  })
  .strict();

export const NumberAttributeValueSchema = z
  .object({
    type: z.literal('number'),
    value: z.number().finite(),
    unit: safeString(60).optional(),
  })
  .strict();

export const MoneyAttributeValueSchema = z
  .object({
    type: z.literal('money'),
    amount: z.number().finite(),
    // ISO 4217 currency code. The spec only says `currency: string`; this
    // bound is an inferred tightening consistent with "schema-validated"
    // boundaries elsewhere in architecture.md.
    currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a three-letter ISO 4217 code'),
    cadence: safeString(60).optional(),
  })
  .strict();

export const BooleanAttributeValueSchema = z
  .object({
    type: z.literal('boolean'),
    value: z.boolean(),
  })
  .strict();

export const DateAttributeValueSchema = z
  .object({
    type: z.literal('date'),
    // Inferred: pack-authoring.md types `value: string` without a format.
    // `date` (calendar date, no time-of-day) is distinguished from the
    // timestamp fields elsewhere in the product (createdAt/updatedAt), which
    // use full ISO 8601 datetimes.
    value: z.iso.date(),
  })
  .strict();

export const DurationAttributeValueSchema = z
  .object({
    type: z.literal('duration'),
    amount: z.number().finite().nonnegative(),
    unit: z.enum(DURATION_UNITS),
  })
  .strict();

export const EnumAttributeValueSchema = z
  .object({
    type: z.literal('enum'),
    value: safeString(200),
    allowedValues: z.array(safeString(200)).max(200).optional(),
  })
  .strict();

export const RangeAttributeValueSchema = z
  .object({
    type: z.literal('range'),
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
    unit: safeString(60).optional(),
  })
  .strict()
  .refine(
    (range) =>
      range.minimum === undefined || range.maximum === undefined || range.minimum <= range.maximum,
    { message: 'range minimum must be less than or equal to maximum', path: ['maximum'] },
  );

export const StringListAttributeValueSchema = z
  .object({
    type: z.literal('string_list'),
    values: z.array(safeString(500)).max(50),
  })
  .strict();

export const AttributeValueSchema = z.discriminatedUnion('type', [
  StringAttributeValueSchema,
  TextAttributeValueSchema,
  NumberAttributeValueSchema,
  MoneyAttributeValueSchema,
  BooleanAttributeValueSchema,
  DateAttributeValueSchema,
  DurationAttributeValueSchema,
  EnumAttributeValueSchema,
  RangeAttributeValueSchema,
  StringListAttributeValueSchema,
]);
export type AttributeValue = z.infer<typeof AttributeValueSchema>;

export const ATTRIBUTE_ORIGINS = ['pack', 'user', 'agent_proposed'] as const;
export type AttributeOrigin = (typeof ATTRIBUTE_ORIGINS)[number];

export const ATTRIBUTE_STATUSES = [
  'asserted',
  'supported',
  'verified',
  'conflicted',
  'unknown',
] as const;
export type AttributeStatus = (typeof ATTRIBUTE_STATUSES)[number];

const AttributeRecordShape = z
  .object({
    definitionId: safeString(200),
    label: safeString(200),
    value: AttributeValueSchema.optional(),
    origin: z.enum(ATTRIBUTE_ORIGINS),
    // Bounded per architecture.md "Tool inputs, outputs, model responses, and
    // persisted snapshots are size-bounded".
    sourceIds: z.array(safeString(200)).max(50),
    confidence: z.number().min(0).max(1).optional(),
    status: z.enum(ATTRIBUTE_STATUSES),
    updatedAt: z.iso.datetime(),
  })
  .strict();

/**
 * pack-authoring.md: "`value` is required for `asserted`, `supported`,
 * `verified`, and `conflicted` records and must be absent for `unknown`."
 */
export const AttributeRecordSchema = AttributeRecordShape.superRefine((record, ctx) => {
  if (record.status === 'unknown') {
    if (record.value !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'value must be absent when status is "unknown"',
      });
    }
    return;
  }

  if (record.value === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['value'],
      message: `value is required when status is "${record.status}"`,
    });
  }
});
export type AttributeRecord = z.infer<typeof AttributeRecordSchema>;

export const EVIDENCE_EXPECTATIONS = [
  'assertion',
  'source',
  'corroborated',
  'verification',
] as const;
export type EvidenceExpectation = (typeof EVIDENCE_EXPECTATIONS)[number];

export const ATTRIBUTE_COMPARISONS = [
  'none',
  'lower_better',
  'higher_better',
  'target',
  'constraint',
] as const;
export type AttributeComparison = (typeof ATTRIBUTE_COMPARISONS)[number];

export const AttributeDefinitionSchema = z
  .object({
    id: safeString(200),
    label: safeString(200),
    valueType: z.enum(ATTRIBUTE_VALUE_TYPES),
    required: z.boolean(),
    appliesTo: z.array(safeString(200)).max(50),
    unit: safeString(60).optional(),
    allowedValues: z.array(safeString(200)).max(200).optional(),
    /**
     * An `enum` attribute's values in ASCENDING order along their natural
     * scale — least first — declared explicitly by the pack author.
     *
     * This field supplies the SCALE only. `comparison` supplies the
     * DIRECTION, exactly as it does for a number: `energy.rough_effort_level`
     * is `['low', 'medium', 'high']` with `comparison: 'lower_better'`,
     * while `car.crash_safety_rating` is `['Not Rated', ..., 'Top Safety
     * Pick+']` with `higher_better`. Reading this field as "worst first"
     * instead would double-invert against a `lower_better` comparison and
     * score the most laborious option as the best one.
     *
     * Deliberately separate from `allowedValues`, which is a MEMBERSHIP set
     * whose order carries no meaning. That distinction is load-bearing
     * rather than pedantic: `car.crash_safety_rating` ships
     * `allowedValues: ['Top Safety Pick+', 'Top Safety Pick', 'Recommended',
     * 'Not Rated']` -- best first -- while `car.driving_comfort_rating`
     * ships `['excellent', 'good', 'fair', 'poor']`, also best first, and
     * nothing in this contract ever said which end was which. Any scorer
     * that inferred rank from array index would have ranked an unrated car
     * as the safest one on the lot, silently, inside a 30%-weight criterion.
     *
     * So `scoreCase` (`@sift/core`) refuses to treat an enum as ordinal
     * unless this field is present, and reports the refusal rather than
     * guessing. Optional, so every pack authored before it keeps both its
     * meaning and its `compiledHash` (canonicalization drops `undefined`
     * keys before hashing).
     *
     * Values not listed here are unscorable, NOT worst: a grade nobody
     * anticipated is missing information, and treating it as the bottom of
     * the scale would invent a fact about it.
     */
    orderedValues: z.array(safeString(200)).max(200).optional(),
    evidenceExpectation: z.enum(EVIDENCE_EXPECTATIONS),
    comparison: z.enum(ATTRIBUTE_COMPARISONS),
    sensitive: z.boolean(),
  })
  .strict();
export type AttributeDefinition = z.infer<typeof AttributeDefinitionSchema>;

export const CASE_ATTRIBUTE_ORIGINS = ['user', 'agent_proposed'] as const;
export type CaseAttributeOrigin = (typeof CASE_ATTRIBUTE_ORIGINS)[number];

export const CASE_ATTRIBUTE_CONFIRMATIONS = ['confirmed', 'pending', 'rejected'] as const;
export type CaseAttributeConfirmation = (typeof CASE_ATTRIBUTE_CONFIRMATIONS)[number];

/**
 * The `custom.` id namespace, restricted to safe identifier characters after
 * the prefix (pack-authoring.md examples use snake_case suffixes such as
 * `custom.dog_crate_fit`). The character restriction is an inferred
 * tightening in service of the "no HTML/executable expressions" rule, since
 * this id is rendered directly in the generic UI and used as an event key.
 */
export const CaseAttributeIdSchema = z.templateLiteral([
  'custom.',
  z
    .string()
    .regex(/^[A-Za-z0-9_]+$/)
    .min(1)
    .max(190),
]);

export const CaseAttributeDefinitionSchema = AttributeDefinitionSchema.extend({
  id: CaseAttributeIdSchema,
  origin: z.enum(CASE_ATTRIBUTE_ORIGINS),
  reason: safeString(2000),
  confirmation: z.enum(CASE_ATTRIBUTE_CONFIRMATIONS),
  proposedBy: safeString(200),
  createdAt: z.iso.datetime(),
}).strict();
export type CaseAttributeDefinition = z.infer<typeof CaseAttributeDefinitionSchema>;

export const CRITERION_KINDS = ['hard_constraint', 'preference', 'consideration'] as const;
export type CriterionKind = (typeof CRITERION_KINDS)[number];

export const CRITERION_DIRECTIONS = [
  'higher_better',
  'lower_better',
  'target',
  'qualitative',
] as const;
export type CriterionDirection = (typeof CRITERION_DIRECTIONS)[number];

export const CRITERION_ORIGINS = ['pack', 'user', 'agent_proposed'] as const;
export type CriterionOrigin = (typeof CRITERION_ORIGINS)[number];

export const CRITERION_STATUSES = ['active', 'excluded'] as const;
export type CriterionStatus = (typeof CRITERION_STATUSES)[number];

export const CriterionSchema = z
  .object({
    id: safeString(200),
    label: safeString(200),
    kind: z.enum(CRITERION_KINDS),
    // webmcp.md `sift_update_criteria`: "Weights must be integers from 0
    // through 100 and are normalized for comparison." Applied here too since
    // it is the same field.
    weight: z.number().int().min(0).max(100),
    direction: z.enum(CRITERION_DIRECTIONS),
    target: AttributeValueSchema.optional(),
    appliesToAttribute: safeString(200).optional(),
    /**
     * The attributes a COMPOSITE criterion is measured from, when no single
     * attribute captures it.
     *
     * `pref.safety_reliability` ("composite of crash safety, driver
     * assistance, and reliability ratings") and `pref.household_fit`
     * ("composite of cargo dimensions, rear-seat specifications...") are
     * exactly this shape, and together they are 45% of the car pack's
     * weight. Without this field they can only ever be reported as
     * unmeasured, which would put the pack's single heaviest criterion
     * permanently outside the scoreboard.
     *
     * `scoreCase` averages the parts it can score and states the basis it
     * used ("2 of 3 measures"), so a composite built from partial evidence
     * is a weaker claim on its face rather than an equal one. Each part is
     * normalized by its OWN `AttributeDefinition.comparison`, since the
     * parts of a composite need not all point the same way.
     *
     * Optional and additive; a criterion may declare
     * `appliesToAttribute`, this, or neither (a pure human-judgment
     * concern, which stays honestly unscored).
     */
    composedOfAttributes: z.array(safeString(200)).max(50).optional(),
    question: safeString(2000).optional(),
    origin: z.enum(CRITERION_ORIGINS),
    status: z.enum(CRITERION_STATUSES),
  })
  .strict();
export type Criterion = z.infer<typeof CriterionSchema>;
