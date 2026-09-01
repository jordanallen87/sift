/**
 * The deterministic scoring engine: given a case's options, criteria, and
 * attribute definitions, produce a ranked, fully-explained scoreboard and a
 * set of derived insights — with no model involved at any point.
 *
 * ## Why this exists
 *
 * Before this module, the "recommended" option was whatever the Strands
 * graph put first in `proposedRecommendation.candidateIds`. That is a model
 * asserting a conclusion, and CLAUDE.md is explicit that the deterministic
 * core — not an LLM — owns case state, evidence validity, and readiness.
 * The ranking is part of that: a person deciding how to spend forty
 * thousand dollars is entitled to know *why* something came first, and to
 * change one number and watch the order change.
 *
 * That is also what makes the two-way loop worth demonstrating. The model
 * calls `sift_update_criteria` to reweight, and the ranking moves
 * immediately, computed here, explainable line by line. The model narrates
 * the analysis; it does not perform it.
 *
 * ## The honesty rules this engine is built around
 *
 * Every one of these exists because the obvious implementation gets it
 * wrong in a way nobody notices until it has already misled someone:
 *
 *  1. **An unknown is never a zero.** Missing data lowers COVERAGE, never
 *     SCORE. Scoring an unresearched option as 0 turns "we did not look"
 *     into "it is bad" — the most damaging thing an automated ranking can
 *     assert. `total` is the weighted mean over scored criteria only.
 *  2. **The attribute owns what "better" means.** A criterion's `direction`
 *     is a claim about the criterion; an attribute's `comparison` is a
 *     property of the measurement, and it wins. (The car pack ships exactly
 *     this asymmetry: `pref.deal_value` says `higher_better` — more deal
 *     value is better — about `car.out_the_door_price`, whose comparison is
 *     `lower_better`, because a lower price is a better deal. Read the
 *     criterion literally and a 20%-weight criterion ranks the most
 *     expensive car as the best deal. Every line states the direction it
 *     actually scored by, so the resolution is visible rather than
 *     silent.)
 *  3. **Enums are not ordinal until a pack says so.** See
 *     `AttributeDefinition.orderedValues`.
 *  4. **A hard constraint flags; it never silently eliminates.** A
 *     violating option stays on the board, fully scored and visibly
 *     labelled, ranked below compliant ones. The human decides what to do
 *     about it — that authority is not delegable to a sort.
 *  5. **Refuse rather than invent.** Mixed currencies, mismatched units,
 *     free text, and unlisted enum grades are reported as not comparable.
 *     An engine that ranks 25,000 JPY as cheaper than 30,000 USD has
 *     invented an exchange rate it does not have.
 *  6. **A disputed fact is not a settled one.** A value whose sources
 *     contradict each other still scores — refusing to use a value that
 *     exists is its own distortion — but it is marked `disputed`, and an
 *     insight fires when the leader's lead actually depends on it. Found on
 *     the real car scenario, where the Outback leads every measured
 *     criterion and its lead rests on a contested reliability rating.
 *
 * No filesystem, network, wall-clock, or randomness: the same inputs always
 * produce the identical board, which is what makes it testable and what
 * makes a re-render after a reweight trustworthy.
 */
import {
  type AttributeDefinition,
  type AttributeStatus,
  type AttributeValue,
  type Criterion,
  type CriterionKind,
  type EntityRecord,
} from '@sift/contracts';
import { normalizeCriterionWeights } from './criteria.js';

// --- Public shapes ----------------------------------------------------

export type CriterionScoreStatus =
  /** Genuinely measured and normalized against the candidate set. */
  | 'scored'
  /** Measured, but every option came out the same — it separates nothing. */
  | 'tied'
  /**
   * Scored from a value whose sources CONTRADICT each other
   * (`AttributeStatus: 'conflicted'`).
   *
   * Still scored, because refusing to use a value that exists is its own
   * distortion — but never silently equated with an established one. Found
   * on the real car scenario: the Subaru Outback leads every measured
   * criterion, and its safety-and-reliability lead rests on a reliability
   * rating the sources disagree about. A board that reported that lead
   * without saying so would be laundering a dispute into a ranking.
   */
  | 'disputed'
  /** This option has no usable value. NOT a zero. */
  | 'unknown'
  /** Values exist but cannot be put in order (free text, mixed currency, an unlisted enum grade, a qualitative criterion). */
  | 'not_comparable'
  /** The criterion names no attribute at all — a pure human-judgment concern. */
  | 'not_applicable';

export interface CriterionScore {
  readonly criterionId: string;
  readonly criterionLabel: string;
  readonly kind: CriterionKind;
  /** Normalized share of total active weight, 0..1. Sums to 1 across a board's criteria. */
  readonly weight: number;
  /** 0..1, where 1 is the best value present in this candidate set. Null unless `scored`/`tied`. */
  readonly score: number | null;
  readonly status: CriterionScoreStatus;
  /** Plain-English basis, always present — including when scored. This is what the UI shows and the model reads. */
  readonly reason: string;
  /** This option's own value, when it has one. */
  readonly value?: AttributeValue;
  /** The evidential standing of that value, so a score built on a disputed fact reads as one. */
  readonly valueStatus?: AttributeStatus;
  /** True only for a `hard_constraint` criterion this option fails outright. */
  readonly constraintViolated: boolean;
}

export interface OptionScore {
  readonly optionId: string;
  readonly optionLabel: string;
  /** Weighted mean over SCORED criteria only, 0..1. Null when nothing could be scored. */
  readonly total: number | null;
  /** Share of total active criterion weight that was actually measurable for this option, 0..1. */
  readonly coverage: number;
  readonly violatedConstraintIds: readonly string[];
  /**
   * Criteria this option scored on, but from at least one value whose
   * sources contradict each other. Separate from `coverage` on purpose:
   * coverage answers "how much did we measure", and this answers "how much
   * of what we measured is actually settled" — two different questions a
   * single number cannot honestly answer.
   */
  readonly disputedCriterionIds: readonly string[];
  readonly criteria: readonly CriterionScore[];
}

export interface CaseScoreboard {
  /** Ranked best-first. Constraint violators sort below every compliant option. */
  readonly options: readonly OptionScore[];
  /** Criteria on which every option scored identically — they carry weight but separate nothing. */
  readonly nonDiscriminatingCriterionIds: readonly string[];
  /**
   * Authoring and data problems found while scoring: a criterion whose
   * direction contradicts its attribute, an enum with no declared ordering,
   * mixed currencies. Surfaced rather than resolved in silence, because
   * every one of them means a number on screen is less trustworthy than it
   * looks.
   */
  readonly warnings: readonly string[];
}

export interface ScoreCaseInput {
  readonly options: readonly EntityRecord[];
  readonly criteria: readonly Criterion[];
  readonly definitions: readonly AttributeDefinition[];
}

// --- Magnitude extraction ---------------------------------------------

/**
 * Duration normalization factors, in minutes. `month` and `year` are
 * calendar approximations (30 and 365 days) rather than exact intervals.
 * Documented rather than hidden: they are deterministic and consistent, and
 * every durational attribute in the shipped packs is a rough
 * effort/time-to-insight estimate where a 30-vs-31-day month cannot change
 * an ordering. A pack needing exact calendar arithmetic should model a
 * `date`, not a `duration`.
 */
const DURATION_MINUTES: Record<string, number> = {
  minute: 1,
  hour: 60,
  day: 1440,
  month: 43_200,
  year: 525_600,
};

/**
 * A scale for a human sentence. An EMPTY string is a real value here -- it
 * is what `scaleOf` returns for a number carrying no unit -- so this is
 * deliberately not a `??` fallback, which would print an empty pair of
 * parentheses and leave the reader guessing.
 */
function describeScale(scale: string | null | undefined): string {
  if (scale === null || scale === undefined || scale === '') return 'no unit';
  return scale;
}

type Magnitude =
  { readonly ok: true; readonly value: number } | { readonly ok: false; readonly reason: string };

function magnitudeOf(
  value: AttributeValue,
  definition: AttributeDefinition | undefined,
): Magnitude {
  switch (value.type) {
    case 'number':
      return { ok: true, value: value.value };
    case 'money':
      return { ok: true, value: value.amount };
    case 'duration': {
      const factor = DURATION_MINUTES[value.unit];
      if (factor === undefined) {
        return { ok: false, reason: `duration unit "${value.unit}" has no known scale` };
      }
      return { ok: true, value: value.amount * factor };
    }
    case 'range': {
      // Midpoint when bounded on both sides, otherwise whichever bound
      // exists — matching `compareAttributeValues`'s existing convention so
      // pairwise comparison and cardinal scoring never disagree about what
      // a range "is".
      if (value.minimum !== undefined && value.maximum !== undefined) {
        return { ok: true, value: (value.minimum + value.maximum) / 2 };
      }
      if (value.minimum !== undefined) return { ok: true, value: value.minimum };
      if (value.maximum !== undefined) return { ok: true, value: value.maximum };
      return { ok: false, reason: 'this range declares neither a minimum nor a maximum' };
    }
    case 'boolean':
      return { ok: true, value: value.value ? 1 : 0 };
    case 'date': {
      const parsed = Date.parse(value.value);
      if (Number.isNaN(parsed)) {
        return { ok: false, reason: `"${value.value}" is not a date this engine can order` };
      }
      return { ok: true, value: parsed };
    }
    case 'enum': {
      // Rule 3. `allowedValues` is a membership set whose order carries no
      // declared meaning, so it is deliberately NOT consulted here.
      const ordered = definition?.orderedValues;
      if (ordered === undefined || ordered.length === 0) {
        return {
          ok: false,
          reason:
            'this rating has no declared worst-to-best ordering, so its grades cannot be ranked without guessing',
        };
      }
      const index = ordered.indexOf(value.value);
      if (index === -1) {
        return {
          ok: false,
          reason: `"${value.value}" is not one of the declared grades, so where it sits on the scale is unknown`,
        };
      }
      return { ok: true, value: index };
    }
    case 'string':
    case 'text':
    case 'string_list':
      return {
        ok: false,
        reason: 'this is written description, not a measurement that can be ranked',
      };
  }
}

/**
 * The scale a set of values is expressed in — currency for money, unit for
 * number/range, unit for duration. Two values on different scales must
 * never be ranked against each other by raw magnitude (rule 5); duration is
 * the sole exception because `DURATION_MINUTES` genuinely converts.
 */
function scaleOf(value: AttributeValue): string | null {
  switch (value.type) {
    case 'money':
      return value.currency;
    case 'number':
    case 'range':
      return value.unit ?? '';
    default:
      return null;
  }
}

// --- Direction resolution ---------------------------------------------

type ResolvedDirection =
  | { readonly ok: true; readonly direction: 'higher_better' | 'lower_better' | 'target' }
  | { readonly ok: false; readonly reason: string };

/**
 * Rule 2. The attribute's own `comparison` is authoritative when it states
 * one, because "lower price is better" is a property of price rather than
 * an opinion held by whatever criterion happens to point at it.
 *
 * `'none'` means the attribute declares no ordering of its own — not that
 * ordering is forbidden — so the criterion's `direction` supplies it.
 * `'constraint'` means the attribute is a pass/fail threshold, handled
 * separately below.
 *
 * `direction: 'qualitative'` overrides everything: a criterion declaring
 * itself a judgment call is making a claim about the KIND of thing it is,
 * and no amount of measurability in the underlying attribute converts a
 * judgment into a measurement.
 */
function resolveDirection(
  criterion: Criterion,
  definition: AttributeDefinition | undefined,
): ResolvedDirection {
  if (criterion.direction === 'qualitative') {
    return {
      ok: false,
      reason:
        'this is a judgment call rather than a measurement, so it is not scored automatically',
    };
  }

  const comparison = definition?.comparison;
  if (comparison === 'higher_better' || comparison === 'lower_better' || comparison === 'target') {
    return { ok: true, direction: comparison };
  }

  if (criterion.direction === 'target') return { ok: true, direction: 'target' };
  return { ok: true, direction: criterion.direction };
}

// A criterion whose `direction` differs from its attribute's `comparison`
// is deliberately NOT reported as a defect. `pref.deal_value` is
// `higher_better` (more deal value is better) over
// `car.out_the_door_price`, which is `lower_better` (a lower price is a
// better deal) — a criterion phrased as a benefit over a cost measurement
// is an ordinary modelling pattern, and nothing distinguishes it from a
// genuine polarity mistake except intent this engine cannot see. Warning on
// it would make the warning channel permanent noise on the hero pack.
//
// The effective direction is disclosed where it is actually useful instead:
// every `CriterionScore.reason` states it in words ("lower is better"), so
// a person reading the row can see exactly which way it was scored.

// --- Per-attribute normalization across the candidate set --------------

interface AttributeScale {
  /** optionId -> magnitude, for every option with a usable value. */
  readonly magnitudes: ReadonlyMap<string, number>;
  readonly minimum: number;
  readonly maximum: number;
  /** Set when the attribute cannot be scored at all across this set. */
  readonly blockedReason: string | null;
}

function buildScale(
  options: readonly EntityRecord[],
  attributeId: string,
  definition: AttributeDefinition | undefined,
): AttributeScale {
  const magnitudes = new Map<string, number>();
  const reasons: string[] = [];
  let scale: string | null | undefined;

  for (const option of options) {
    const record = option.attributes[attributeId];
    if (record?.value === undefined) continue;

    const valueScale = scaleOf(record.value);
    if (valueScale !== null) {
      if (scale === undefined) {
        scale = valueScale;
      } else if (scale !== valueScale) {
        const kind = record.value.type === 'money' ? 'currencies' : 'units';
        return {
          magnitudes: new Map(),
          minimum: 0,
          maximum: 0,
          blockedReason: `these values are recorded in different ${kind} (${describeScale(scale)} and ${describeScale(valueScale)}), so they cannot be ranked against each other`,
        };
      }
    }

    const magnitude = magnitudeOf(record.value, definition);
    if (magnitude.ok) {
      magnitudes.set(option.id, magnitude.value);
    } else {
      reasons.push(magnitude.reason);
    }
  }

  if (magnitudes.size === 0) {
    return {
      magnitudes,
      minimum: 0,
      maximum: 0,
      blockedReason: reasons[0] ?? null,
    };
  }

  const values = [...magnitudes.values()];
  return {
    magnitudes,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    blockedReason: null,
  };
}

/**
 * Normalizes one option's magnitude to 0..1 against the candidate set,
 * where 1 is always "best under this direction". Returns `null` when every
 * option sits at the same point, which is a tie rather than a score.
 */
type Normalized =
  | { readonly kind: 'score'; readonly value: number }
  /** Every option sits at the same point — a real measurement that separates nothing. */
  | { readonly kind: 'tied' }
  /** The normalization could not be performed at all. NOT the same as a tie. */
  | { readonly kind: 'unscorable'; readonly reason: string };

function normalize(
  magnitude: number,
  scale: AttributeScale,
  direction: 'higher_better' | 'lower_better' | 'target',
  target: number | null,
): Normalized {
  if (direction === 'target') {
    // Conflating this with a tie was a real defect: a target-shaped
    // criterion with no target declared scored EVERY option 1.0 and
    // labelled it "every option is the same here" — an invented
    // measurement wearing the words of a real one.
    if (target === null) {
      return {
        kind: 'unscorable',
        reason: 'this is measured against a target value, and no target has been set for it',
      };
    }
    const distances = [...scale.magnitudes.values()].map((value) => Math.abs(value - target));
    const worst = Math.max(...distances);
    if (worst === 0) return { kind: 'tied' };
    return { kind: 'score', value: 1 - Math.abs(magnitude - target) / worst };
  }

  const span = scale.maximum - scale.minimum;
  if (span === 0) return { kind: 'tied' };
  const fraction = (magnitude - scale.minimum) / span;
  return { kind: 'score', value: direction === 'higher_better' ? fraction : 1 - fraction };
}

// --- Hard constraints --------------------------------------------------

/**
 * Rule 4. A hard constraint is an ABSOLUTE test, never a relative one —
 * this is the whole reason it is evaluated separately. Scored relatively,
 * the most expensive of three perfectly affordable cars would "violate" a
 * budget constraint simply for being the maximum of the set.
 *
 * Returns `null` when the constraint cannot be evaluated at all, which is
 * deliberately not the same as passing.
 */
function evaluateConstraint(
  value: AttributeValue,
  criterion: Criterion,
  definition: AttributeDefinition | undefined,
  direction: 'higher_better' | 'lower_better' | 'target',
): { readonly satisfied: boolean; readonly reason: string } | null {
  const magnitude = magnitudeOf(value, definition);
  if (!magnitude.ok) return null;

  if (criterion.target !== undefined) {
    const target = magnitudeOf(criterion.target, definition);
    if (!target.ok) return null;
    if (direction === 'lower_better') {
      return magnitude.value <= target.value
        ? { satisfied: true, reason: 'within the limit this case requires' }
        : { satisfied: false, reason: 'over the limit this case requires' };
    }
    if (direction === 'higher_better') {
      return magnitude.value >= target.value
        ? { satisfied: true, reason: 'meets the minimum this case requires' }
        : { satisfied: false, reason: 'below the minimum this case requires' };
    }
    return magnitude.value === target.value
      ? { satisfied: true, reason: 'matches what this case requires' }
      : { satisfied: false, reason: 'does not match what this case requires' };
  }

  // No explicit target. A boolean carries its own poles, so a yes/no
  // constraint is still absolutely decidable: `lower_better` means "true is
  // the bad end" (an emergency risk being present), `higher_better` the
  // reverse.
  if (value.type === 'boolean') {
    const bad = direction === 'lower_better' ? true : false;
    return value.value === bad
      ? {
          satisfied: false,
          reason: 'this option trips a condition the case treats as disqualifying',
        }
      : { satisfied: true, reason: 'clear of the condition the case treats as disqualifying' };
  }

  return null;
}

// --- Scoring -----------------------------------------------------------

interface ScoredPart {
  readonly score: number | null;
  readonly tied: boolean;
  readonly reason: string | null;
}

function scorePart(
  option: EntityRecord,
  attributeId: string,
  scale: AttributeScale,
  direction: 'higher_better' | 'lower_better' | 'target',
  target: number | null,
): ScoredPart {
  if (scale.blockedReason !== null) {
    return { score: null, tied: false, reason: scale.blockedReason };
  }
  const magnitude = scale.magnitudes.get(option.id);
  if (magnitude === undefined) {
    const record = option.attributes[attributeId];
    if (record?.value === undefined) {
      return { score: null, tied: false, reason: null };
    }
    const failed = magnitudeOf(record.value, undefined);
    return { score: null, tied: false, reason: failed.ok ? null : failed.reason };
  }

  const normalized = normalize(magnitude, scale, direction, target);
  if (normalized.kind === 'unscorable') {
    return { score: null, tied: false, reason: normalized.reason };
  }
  if (normalized.kind === 'tied') {
    return { score: 1, tied: true, reason: null };
  }
  return { score: normalized.value, tied: false, reason: null };
}

function describeDirection(direction: 'higher_better' | 'lower_better' | 'target'): string {
  if (direction === 'higher_better') return 'higher is better';
  if (direction === 'lower_better') return 'lower is better';
  return 'closest to the target is better';
}

function rankLabel(score: number): string {
  if (score >= 0.999) return 'best of the options compared';
  if (score <= 0.001) return 'weakest of the options compared';
  return `${Math.round(score * 100)}% of the way from the weakest to the strongest option compared`;
}

/**
 * Scores every option against every active criterion and ranks the result.
 *
 * Pure: the same inputs always produce the identical board, including the
 * ordering, which is what lets a reweight re-render be trusted as the
 * consequence of the reweight rather than of anything else.
 */
export function scoreCase(input: ScoreCaseInput): CaseScoreboard {
  const active = input.criteria.filter((criterion) => criterion.status === 'active');
  const normalizedWeights = new Map(
    normalizeCriterionWeights(active).map((entry) => [entry.criterionId, entry.weight]),
  );
  const definitionsById = new Map(
    input.definitions.map((definition) => [definition.id, definition]),
  );
  const warnings: string[] = [];
  const scaleCache = new Map<string, AttributeScale>();

  function scaleFor(attributeId: string): AttributeScale {
    const cached = scaleCache.get(attributeId);
    if (cached !== undefined) return cached;
    const built = buildScale(input.options, attributeId, definitionsById.get(attributeId));
    scaleCache.set(attributeId, built);
    return built;
  }

  // Warnings are collected once for the board, not once per option, so a
  // three-car case does not report the same authoring defect three times.
  for (const criterion of active) {
    const attributeIds =
      criterion.composedOfAttributes ??
      (criterion.appliesToAttribute !== undefined ? [criterion.appliesToAttribute] : []);
    for (const attributeId of attributeIds) {
      const definition = definitionsById.get(attributeId);
      const scale = scaleFor(attributeId);
      if (scale.blockedReason !== null) {
        warnings.push(
          `"${definition?.label ?? attributeId}" could not be ranked: ${scale.blockedReason}`,
        );
      }
    }
  }

  const scored: OptionScore[] = input.options.map((option) => {
    const lines: CriterionScore[] = [];
    const violated: string[] = [];
    const disputed: string[] = [];

    for (const criterion of active) {
      const weight = normalizedWeights.get(criterion.id) ?? 0;
      const composite = criterion.composedOfAttributes;
      const attributeIds =
        composite ??
        (criterion.appliesToAttribute !== undefined ? [criterion.appliesToAttribute] : []);

      const base = {
        criterionId: criterion.id,
        criterionLabel: criterion.label,
        kind: criterion.kind,
        weight,
      } as const;

      // A criterion whose attribute does not APPLY to this kind of option is
      // a category mismatch, not a research gap. The energy pack's safety
      // constraint measures `energy.emergency_risk_present`, declared on the
      // billing cycle rather than on a response option, and reporting that as
      // "nobody has established this yet" invites someone to go and
      // establish it. Nothing can.
      const inapplicable =
        attributeIds.length > 0 &&
        attributeIds.every((attributeId) => {
          const definition = definitionsById.get(attributeId);
          return definition !== undefined && !definition.appliesTo.includes(option.kind);
        });

      if (attributeIds.length === 0 || inapplicable) {
        lines.push({
          ...base,
          score: null,
          status: 'not_applicable',
          reason: inapplicable
            ? 'this is measured on something other than the options being compared, so it cannot separate them'
            : (criterion.question ??
              'this is a judgment call with no recorded measurement behind it, so the scoreboard cannot speak to it'),
          constraintViolated: false,
        });
        continue;
      }

      // A composite is scored from its parts; a single-attribute criterion
      // is the degenerate one-part case, so both take the same path.
      const primaryDefinition = definitionsById.get(attributeIds[0]!);
      const direction = resolveDirection(
        criterion,
        composite === undefined ? primaryDefinition : undefined,
      );
      if (!direction.ok) {
        const record = option.attributes[attributeIds[0]!];
        lines.push({
          ...base,
          score: null,
          status: 'not_comparable',
          reason: direction.reason,
          ...(record?.value !== undefined
            ? { value: record.value, valueStatus: record.status }
            : {}),
          constraintViolated: false,
        });
        continue;
      }

      const parts: number[] = [];
      let tiedParts = 0;
      let blockedReason: string | null = null;

      for (const attributeId of attributeIds) {
        const definition = definitionsById.get(attributeId);
        // Each part of a composite is normalized by its OWN comparison —
        // the parts of "household fit" need not all point the same way.
        const partDirection =
          composite === undefined ? direction : resolveDirection(criterion, definition);
        if (!partDirection.ok) {
          blockedReason ??= partDirection.reason;
          continue;
        }
        const targetMagnitude =
          criterion.target === undefined ? null : magnitudeOf(criterion.target, definition);
        const part = scorePart(
          option,
          attributeId,
          scaleFor(attributeId),
          partDirection.direction,
          targetMagnitude?.ok === true ? targetMagnitude.value : null,
        );
        if (part.score !== null) {
          parts.push(part.score);
          if (part.tied) tiedParts += 1;
        } else if (part.reason !== null) {
          blockedReason ??= part.reason;
        }
      }

      const record = option.attributes[attributeIds[0]!];
      const valueFields =
        composite === undefined && record?.value !== undefined
          ? { value: record.value, valueStatus: record.status }
          : {};

      // Rule 4: constraints are absolute, evaluated before any relative
      // score is considered.
      if (
        criterion.kind === 'hard_constraint' &&
        composite === undefined &&
        record?.value !== undefined
      ) {
        const verdict = evaluateConstraint(
          record.value,
          criterion,
          primaryDefinition,
          direction.direction,
        );
        if (verdict !== null) {
          if (!verdict.satisfied) violated.push(criterion.id);
          lines.push({
            ...base,
            score: verdict.satisfied ? 1 : 0,
            status: 'scored',
            reason: verdict.reason,
            ...valueFields,
            constraintViolated: !verdict.satisfied,
          });
          continue;
        }
      }

      if (parts.length === 0) {
        const hasValue = attributeIds.some((id) => option.attributes[id]?.value !== undefined);
        lines.push({
          ...base,
          score: null,
          status: blockedReason !== null ? 'not_comparable' : 'unknown',
          reason:
            blockedReason ??
            'nobody has established this for this option yet, so it is left out of the score rather than counted against it',
          ...(hasValue ? valueFields : {}),
          constraintViolated: false,
        });
        continue;
      }

      const mean = parts.reduce((sum, part) => sum + part, 0) / parts.length;
      // Only a criterion whose EVERY measured part tied separates nothing;
      // a composite where one of three parts happens to tie still does.
      const allTied = tiedParts > 0 && tiedParts === parts.length;
      const basis =
        composite !== undefined && parts.length < attributeIds.length
          ? ` (from ${parts.length} of ${attributeIds.length} measures — the rest are not established yet)`
          : composite !== undefined
            ? ` (averaged across ${parts.length} of ${attributeIds.length} measures)`
            : '';

      // A single contradicted part is enough to make the whole line
      // disputed. Averaging a contested rating together with two settled
      // ones and reporting the result as settled is exactly how a dispute
      // gets laundered into a ranking.
      const disputedAttributeIds = attributeIds.filter(
        (attributeId) => option.attributes[attributeId]?.status === 'conflicted',
      );
      if (disputedAttributeIds.length > 0) disputed.push(criterion.id);

      lines.push({
        ...base,
        score: mean,
        status: disputedAttributeIds.length > 0 ? 'disputed' : allTied ? 'tied' : 'scored',
        reason:
          disputedAttributeIds.length > 0
            ? `${rankLabel(mean)}, where ${describeDirection(direction.direction)}${basis} — but the sources behind this contradict each other, so it is not settled`
            : allTied
              ? 'every option is the same here, so this does not separate them'
              : `${rankLabel(mean)}, where ${describeDirection(direction.direction)}${basis}`,
        ...valueFields,
        constraintViolated: false,
      });
    }

    const scoredLines = lines.filter((line) => line.score !== null);
    const coverage = scoredLines.reduce((sum, line) => sum + line.weight, 0);
    const total =
      coverage === 0
        ? null
        : scoredLines.reduce((sum, line) => sum + line.weight * line.score!, 0) / coverage;

    return {
      optionId: option.id,
      optionLabel: option.label,
      total,
      coverage,
      violatedConstraintIds: violated,
      disputedCriterionIds: disputed,
      criteria: lines,
    };
  });

  // A criterion every option scored identically carries weight but decides
  // nothing — worth stating outright, since a person reading a 30%-weight
  // row assumes it is doing work.
  const nonDiscriminating = active
    .filter((criterion) => {
      const lines = scored
        .map((option) => option.criteria.find((line) => line.criterionId === criterion.id))
        .filter((line): line is CriterionScore => line !== undefined && line.score !== null);
      if (lines.length < 2) return false;
      // The filter above already narrowed every line to a non-null score,
      // and `lines.length < 2` returned early, so `first` is present.
      const first = lines[0] === undefined ? null : lines[0].score;
      if (first === null) return false;
      return lines.every((line) => line.score !== null && Math.abs(line.score - first) < 1e-9);
    })
    .map((criterion) => criterion.id);

  return {
    options: [...scored].sort(compareOptionScores),
    nonDiscriminatingCriterionIds: nonDiscriminating,
    warnings,
  };
}

/**
 * Total, deterministic ordering. Constraint violations dominate everything
 * (rule 4: ranked last, never removed), then score, then coverage — a
 * well-evidenced tie beats a thinly-evidenced one — then id, so the result
 * never depends on the order options happened to arrive in.
 */
function compareOptionScores(a: OptionScore, b: OptionScore): number {
  const aViolates = a.violatedConstraintIds.length > 0 ? 1 : 0;
  const bViolates = b.violatedConstraintIds.length > 0 ? 1 : 0;
  if (aViolates !== bViolates) return aViolates - bViolates;

  const aTotal = a.total;
  const bTotal = b.total;
  if (aTotal === null && bTotal !== null) return 1;
  if (bTotal === null && aTotal !== null) return -1;
  if (aTotal !== null && bTotal !== null && Math.abs(aTotal - bTotal) > 1e-9) {
    return bTotal - aTotal;
  }

  if (Math.abs(a.coverage - b.coverage) > 1e-9) return b.coverage - a.coverage;
  return a.optionId < b.optionId ? -1 : a.optionId > b.optionId ? 1 : 0;
}

/**
 * Scores a whole `CaseState` — the form both `apps/agent` and `apps/web`
 * actually call.
 *
 * Deliberately one shared function rather than a projection built
 * separately on each side. The workspace's visible ranking and the ranking
 * the recommendation is validated against MUST be the same computation; two
 * implementations that agree today are two implementations that can drift,
 * and the failure mode is a UI that shows one leader while the
 * recommendation names another.
 *
 * Two case-level rules the raw `scoreCase` cannot know:
 *
 *  - **Rejected case extensions do not score.** A model-proposed attribute
 *    a human turned down must not keep influencing the ranking from the
 *    grave; only `confirmed` extensions join the definition set.
 *  - **Only entities the criteria can actually speak to are ranked.** A
 *    case holds more than its options (an energy case holds the bill
 *    itself), and scoring those would produce nonsense rows sitting at zero
 *    coverage. An entity qualifies when some active criterion measures an
 *    attribute declared to apply to its `kind`.
 */
export function scoreCaseState(caseState: {
  readonly attributeDefinitions: readonly AttributeDefinition[];
  readonly caseExtensions: readonly {
    readonly definition: AttributeDefinition & { readonly confirmation?: string };
  }[];
  readonly entities: readonly EntityRecord[];
  readonly criteria: readonly Criterion[];
}): CaseScoreboard {
  const definitions: AttributeDefinition[] = [
    ...caseState.attributeDefinitions,
    ...caseState.caseExtensions
      .filter((extension) => extension.definition.confirmation !== 'rejected')
      .map((extension) => extension.definition),
  ];

  const active = caseState.criteria.filter((criterion) => criterion.status === 'active');
  const measuredAttributeIds = new Set(
    active.flatMap((criterion) => [
      ...(criterion.composedOfAttributes ?? []),
      ...(criterion.appliesToAttribute !== undefined ? [criterion.appliesToAttribute] : []),
    ]),
  );
  const scorableKinds = new Set(
    definitions
      .filter((definition) => measuredAttributeIds.has(definition.id))
      .flatMap((definition) => definition.appliesTo),
  );

  const options = caseState.entities.filter((entity) => scorableKinds.has(entity.kind));

  return scoreCase({ options, criteria: caseState.criteria, definitions });
}

// --- Insights ----------------------------------------------------------

export const INSIGHT_KINDS = [
  'leader',
  'close_call',
  'decisive_criterion',
  'coverage_gap',
  'disputed_evidence',
  'constraint_violation',
  'non_discriminating',
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export interface Insight {
  /** Stable and derived, so the same board always produces the same ids. */
  readonly id: string;
  readonly kind: InsightKind;
  readonly severity: 'info' | 'attention';
  /** One plain sentence, safe to render as-is. */
  readonly headline: string;
  readonly detail: string;
  readonly optionIds: readonly string[];
  readonly criterionIds: readonly string[];
}

/** Below this, a person is being shown a ranking built on more guesswork than evidence. */
const COVERAGE_ATTENTION_THRESHOLD = 0.75;
/** Within this, calling one option "the winner" overstates the gap. */
const CLOSE_CALL_THRESHOLD = 0.05;

/**
 * Recomputes an option's total as if one criterion had never existed, using
 * only the lines already on the board. This is what makes
 * `decisive_criterion` an experiment rather than a narrative: the claim
 * "price alone is what puts the RAV4 ahead" is verified by removing price
 * and observing the order actually flip.
 */
function totalWithout(option: OptionScore, criterionId: string): number | null {
  const remaining = option.criteria.filter(
    (line) => line.score !== null && line.criterionId !== criterionId,
  );
  const weight = remaining.reduce((sum, line) => sum + line.weight, 0);
  if (weight === 0) return null;
  return remaining.reduce((sum, line) => sum + line.weight * line.score!, 0) / weight;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Derives every observation the scoreboard supports, and nothing it does
 * not. A pure function of the board — no model, no re-scoring, no access to
 * anything the UI cannot also see.
 */
export function deriveInsights(board: CaseScoreboard): Insight[] {
  const insights: Insight[] = [];
  const ranked = board.options.filter((option) => option.total !== null);
  const compliant = ranked.filter((option) => option.violatedConstraintIds.length === 0);

  const leader = compliant[0];
  const runnerUp = compliant[1];

  // Leading a field of one says nothing at all, so it is not said.
  if (leader !== undefined && runnerUp !== undefined) {
    const gap = leader.total! - runnerUp.total!;
    insights.push({
      id: 'insight.leader',
      kind: 'leader',
      severity: 'info',
      headline: `${leader.optionLabel} scores highest against what you said matters.`,
      detail: `${leader.optionLabel} leads ${runnerUp.optionLabel} by ${percent(gap)}, measured across ${percent(leader.coverage)} of the weight you have assigned.`,
      optionIds: [leader.optionId, runnerUp.optionId],
      criterionIds: [],
    });

    if (gap <= CLOSE_CALL_THRESHOLD) {
      insights.push({
        id: 'insight.close_call',
        kind: 'close_call',
        severity: 'info',
        headline: `${leader.optionLabel} and ${runnerUp.optionLabel} are close enough to be a genuine toss-up.`,
        detail: `Only ${percent(gap)} separates them, which is within the range where a preference you have not recorded yet would decide it.`,
        optionIds: [leader.optionId, runnerUp.optionId],
        criterionIds: [],
      });
    }

    // Which single criterion, removed, flips the top two?
    const flipping = leader.criteria
      .filter((line) => line.score !== null)
      .filter((line) => {
        const withoutLeader = totalWithout(leader, line.criterionId);
        const withoutRunnerUp = totalWithout(runnerUp, line.criterionId);
        if (withoutLeader === null || withoutRunnerUp === null) return false;
        return withoutRunnerUp > withoutLeader + 1e-9;
      })
      .map((line) => line.criterionId);

    if (flipping.length > 0) {
      const labels = leader.criteria
        .filter((line) => flipping.includes(line.criterionId))
        .map((line) => line.criterionLabel);
      insights.push({
        id: 'insight.decisive_criterion',
        kind: 'decisive_criterion',
        severity: 'info',
        headline: `${labels.join(' and ')} ${labels.length === 1 ? 'is' : 'are'} what puts ${leader.optionLabel} ahead.`,
        detail: `Take ${labels.length === 1 ? 'it' : 'them'} out of the weighting and ${runnerUp.optionLabel} comes first instead. If ${labels.length === 1 ? 'that factor matters' : 'those factors matter'} less to you than the weights currently say, this ranking changes.`,
        optionIds: [leader.optionId, runnerUp.optionId],
        criterionIds: flipping,
      });
    }
  }

  // A dispute is only worth interrupting someone over when it is
  // LOAD-BEARING. The same leave-one-out experiment `decisive_criterion`
  // uses answers that precisely: if removing the contested criterion would
  // hand the lead to someone else, the lead depends on a fact nobody has
  // settled. If it would not, the dispute is real but immaterial, and
  // saying so anyway would train people to ignore the warning.
  if (leader !== undefined && runnerUp !== undefined) {
    const loadBearing = leader.disputedCriterionIds.filter((criterionId) => {
      const withoutLeader = totalWithout(leader, criterionId);
      const withoutRunnerUp = totalWithout(runnerUp, criterionId);
      // Nothing left to score once it is removed: the lead rests ENTIRELY
      // on the contested criterion, which is the strongest form of
      // load-bearing rather than an inconclusive result. (`decisive_
      // criterion` treats the same case as false, and correctly so — "drop
      // it and the other one wins" would be a false statement when dropping
      // it leaves no ranking at all. Here the claim is about dependence,
      // not about what would win instead.)
      if (withoutLeader === null && withoutRunnerUp === null) return true;
      if (withoutLeader === null || withoutRunnerUp === null) return false;
      return withoutRunnerUp > withoutLeader + 1e-9;
    });

    if (loadBearing.length > 0) {
      const labels = leader.criteria
        .filter((line) => loadBearing.includes(line.criterionId))
        .map((line) => line.criterionLabel);
      insights.push({
        id: 'insight.disputed_evidence',
        kind: 'disputed_evidence',
        severity: 'attention',
        headline: `${leader.optionLabel} leads on ${labels.join(' and ')}, but the sources behind that disagree.`,
        detail: `It is the reason ${leader.optionLabel} is ahead of ${runnerUp.optionLabel} — resolve the disagreement and the order may change. Nothing has been decided on the strength of a contested fact.`,
        optionIds: [leader.optionId],
        criterionIds: loadBearing,
      });
    }
  }

  const violators = board.options.filter((option) => option.violatedConstraintIds.length > 0);
  if (violators.length > 0) {
    const criterionIds = [
      ...new Set(violators.flatMap((option) => option.violatedConstraintIds)),
    ].sort();
    insights.push({
      id: 'insight.constraint_violation',
      kind: 'constraint_violation',
      severity: 'attention',
      headline: `${violators.map((option) => option.optionLabel).join(', ')} ${violators.length === 1 ? 'fails' : 'fail'} a requirement you set as non-negotiable.`,
      detail:
        'Still shown and still scored — nothing has been removed on your behalf. Whether a hard requirement is genuinely hard is yours to decide.',
      optionIds: violators.map((option) => option.optionId),
      criterionIds,
    });
  }

  // Deliberately restricted to options that were actually SCORED. An option
  // with no total was not scored thinly, it was not scored at all, and
  // saying it "is scored on as little as 0% of the weight you assigned"
  // describes a measurement that never happened — the exact shape of claim
  // rule 1 exists to prevent, made by the insight meant to warn about it.
  // That option's real state is already stated where it belongs: it is
  // unranked, and the workspace says so on its own card.
  const thin = board.options.filter(
    (option) => option.total !== null && option.coverage < COVERAGE_ATTENTION_THRESHOLD,
  );
  if (thin.length > 0) {
    const worst = Math.min(...thin.map((option) => option.coverage));
    insights.push({
      id: 'insight.coverage_gap',
      kind: 'coverage_gap',
      severity: 'attention',
      headline: `Some of what you said matters has not been established yet.`,
      detail: `${thin.map((option) => option.optionLabel).join(', ')} ${thin.length === 1 ? 'is' : 'are'} scored on as little as ${percent(worst)} of the weight you assigned. The missing factors are not counted against them — they are simply not counted.`,
      optionIds: thin.map((option) => option.optionId),
      criterionIds: [],
    });
  }

  if (board.nonDiscriminatingCriterionIds.length > 0) {
    const labels =
      board.options[0]?.criteria
        .filter((line) => board.nonDiscriminatingCriterionIds.includes(line.criterionId))
        .map((line) => line.criterionLabel) ?? [];
    insights.push({
      id: 'insight.non_discriminating',
      kind: 'non_discriminating',
      severity: 'info',
      headline: `${labels.join(', ')} ${labels.length === 1 ? 'does' : 'do'} not separate these options.`,
      detail:
        'Every option scores the same here, so the weight assigned to it is not changing the order.',
      optionIds: [],
      criterionIds: [...board.nonDiscriminatingCriterionIds],
    });
  }

  return insights;
}
