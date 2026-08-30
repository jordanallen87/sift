/**
 * Pure projection of `CaseState` into the consumer-facing **Decision
 * Profile**: "What are we actually looking for?" (docs/change-sets/
 * 2026-08-30-generic-decision-workspace.md §15). Mirrors the house pattern
 * `workspace-status.ts` establishes: a plain function over already-canonical
 * state, no hook, no I/O, fully unit-testable -- and, per §15's explicit
 * constraint, NOT a second source of truth. Every field below reads
 * straight from `CaseState.criteria`, `CaseState.attributeDefinitions`, and
 * `CaseState.caseExtensions`; nothing here is stored, and no new contract
 * field was added to support it.
 *
 * ## Section mapping (§42: "Must have; Important; Nice to have; Context;
 * Personal concerns")
 *
 * `Criterion.kind` (packages/contracts/src/attributes.ts) is the real,
 * already-existing hard-vs-soft distinction -- not guessed:
 *
 *   - `hard_constraint`                              -> **Must have**
 *   - `preference`, banded "very important"/"important" (see below) -> **Important**
 *   - `preference`, banded "somewhat important"       -> **Nice to have**
 *   - `consideration`                                 -> **Context**
 *
 * `consideration` is the closest existing concept to §15's "usage/context
 * facts" (budget target, commute, household size, ...): a factor worth
 * keeping in mind that is not being scored as a weighted preference. There
 * is no separate case-level-context store anywhere in `CaseState` to draw
 * from instead, so this is the honest mapping onto real data rather than an
 * invented one.
 *
 * `CaseState.caseExtensions` (typed `custom.*` concerns a person or an
 * agent introduced that the pack never anticipated -- §22-24) is projected
 * separately into **Personal concerns**, because a case extension is a
 * *comparison field* someone added, not a weighted scoring criterion. It
 * may additionally have a `linkedCriterionId`, which places the same
 * underlying concern in one of the four weighted sections above too -- that
 * is not double counting, it is two different honest facts about the same
 * concern (what it is, and how much it currently weighs in scoring).
 * Rejected extensions (`definition.confirmation === 'rejected'`) are
 * dropped entirely: a rejected concern is no longer part of what this
 * person is looking for, the same way an `excluded` criterion is dropped
 * from every weighted section below.
 *
 * Only `status: 'active'` criteria are projected into the four weighted
 * sections. An `excluded` criterion was deliberately turned off and is not
 * part of "what we're looking for" right now.
 *
 * ## Weight banding (§42: "Weights should not necessarily be exposed as raw
 * numeric percentages... Allow simplified priority manipulation (Very
 * important / Important / Somewhat important) while preserving numeric
 * representation internally")
 *
 * `Criterion.weight` is a real, already-validated integer 0-100
 * (webmcp.md `sift_update_criteria`: "Weights must be integers from 0
 * through 100"). This module divides that range into three roughly equal
 * thirds (100 / 3 ~= 33.3), so no band gets an arbitrary, asymmetric cut:
 *
 *   -   0-33  -> `somewhat_important`
 *   -  34-66  -> `important`
 *   -  67-100 -> `very_important`
 *
 * The exact numeric weight is never discarded -- it is retained on every
 * projected concern (`weight`) precisely so an advanced view can still show
 * it (§42: "Advanced editing may expose exact weights"); the band is only
 * the *default* presentation.
 *
 * Every weighted section is sorted by weight descending (ties keep their
 * original `CaseState.criteria` order, since `Array.prototype.sort` is
 * spec-guaranteed stable) -- a direct, non-fabricated reading of §15's
 * "priority ordering."
 *
 * ## "What we still don't know" (§16 `missing`)
 *
 * This is deliberately NOT a hardcoded list of questions a car buyer
 * "should" answer -- the task brief is explicit that inventing one would be
 * fabricated content. `missing` is derived from exactly three real,
 * already-existing signals, and nothing else:
 *
 *   1. `no_target` -- an active `hard_constraint` criterion with no
 *      `target` set. We have said this is a firm requirement but never
 *      recorded the actual threshold (e.g. "budget matters" with no dollar
 *      figure attached).
 *   2. `no_measurement` -- an active criterion (of any kind) tied to
 *      nothing measurable: no `target`, *and* either no `appliesToAttribute`
 *      at all, or an `appliesToAttribute` that does not match any id in
 *      `CaseState.attributeDefinitions` (a dangling reference). Either way,
 *      there is currently no way to tell whether any option satisfies it.
 *   3. `pending_confirmation` -- a case extension whose
 *      `definition.confirmation === 'pending'` (the task brief's own second
 *      example). It is not yet part of the comparison until a human
 *      confirms it.
 *
 * A criterion never produces more than one missing item: the `no_target`
 * check takes priority over `no_measurement` for a `hard_constraint`, since
 * the two would otherwise describe the same underlying gap twice.
 *
 * `DecisionProfileMissingItem.reasonKind` names which signal fired, so a
 * caller/test can assert on the real signal rather than string-matching
 * prose.
 *
 * ## Deliberately NOT implemented here
 *
 * §16's example payload also shows a `suggestedQuestions` array. This
 * module does not produce one. There is no existing state this task's
 * brief authorizes deriving that from honestly -- generating "useful
 * discovery questions" would mean writing plausible-sounding car-buying
 * questions ourselves, which is exactly the fabrication the brief forbids
 * ("Do NOT invent a hardcoded list of questions... that would be
 * fabricated"). A real `suggestedQuestions` needs a pack-level Decision
 * Guide (§47) that does not exist in `CaseState` yet; when it does, it is a
 * genuinely different, pack-authored input, not something this pure
 * `CaseState` projection can honestly manufacture on its own.
 */
import type { CaseExtension, CaseState, Criterion, CriterionOrigin } from '@sift/contracts';
import { formatAttributeValue } from './attribute-value-format.js';

export const PRIORITY_BANDS = ['very_important', 'important', 'somewhat_important'] as const;
export type PriorityBand = (typeof PRIORITY_BANDS)[number];

/** See the module header, "Weight banding," for the threshold rationale. */
export function bandWeight(weight: number): PriorityBand {
  if (weight >= 67) return 'very_important';
  if (weight >= 34) return 'important';
  return 'somewhat_important';
}

export interface DecisionProfileConcern {
  /** `Criterion.id` -- an internal identifier. Never render this as visible text; use `label`. */
  id: string;
  label: string;
  kind: Criterion['kind'];
  /** Exact 0-100 weight, retained for an advanced/exact view. Not the default presentation (§42). */
  weight: number;
  priorityBand: PriorityBand;
  origin: CriterionOrigin;
  /** Formatted target threshold (e.g. "40000 USD"), or `null` when no target is set. */
  target: string | null;
  /** The criterion's own human-readable question, when the pack/case defined one. */
  question: string | null;
}

export interface DecisionProfilePersonalConcern {
  /** `CaseExtension.id` -- an internal identifier. Never render this as visible text; use `label`. */
  id: string;
  label: string;
  reason: string;
  origin: CaseExtension['definition']['origin'];
  confirmation: CaseExtension['definition']['confirmation'];
  /** Who/what proposed it. Only meaningful to show when `origin === 'agent_proposed'`. */
  proposedBy: string;
}

export const MISSING_REASON_KINDS = [
  'no_target',
  'no_measurement',
  'pending_confirmation',
] as const;
export type MissingReasonKind = (typeof MISSING_REASON_KINDS)[number];

export interface DecisionProfileMissingItem {
  id: string;
  text: string;
  reasonKind: MissingReasonKind;
  /** The `Criterion.id` or `CaseExtension.id` this item was derived from. */
  relatedId: string;
}

export interface DecisionProfile {
  mustHave: DecisionProfileConcern[];
  important: DecisionProfileConcern[];
  niceToHave: DecisionProfileConcern[];
  context: DecisionProfileConcern[];
  personalConcerns: DecisionProfilePersonalConcern[];
  missing: DecisionProfileMissingItem[];
}

function toConcern(criterion: Criterion): DecisionProfileConcern {
  return {
    id: criterion.id,
    label: criterion.label,
    kind: criterion.kind,
    weight: criterion.weight,
    priorityBand: bandWeight(criterion.weight),
    origin: criterion.origin,
    target: criterion.target !== undefined ? formatAttributeValue(criterion.target) : null,
    question: criterion.question ?? null,
  };
}

function byWeightDescending(a: DecisionProfileConcern, b: DecisionProfileConcern): number {
  return b.weight - a.weight;
}

function deriveMissingFromCriteria(
  activeCriteria: Criterion[],
  attributeDefinitionIds: Set<string>,
): DecisionProfileMissingItem[] {
  const missing: DecisionProfileMissingItem[] = [];

  for (const criterion of activeCriteria) {
    if (criterion.kind === 'hard_constraint' && criterion.target === undefined) {
      missing.push({
        id: `criterion:${criterion.id}:no-target`,
        relatedId: criterion.id,
        reasonKind: 'no_target',
        text: `The exact limit for "${criterion.label}" hasn't been set yet.`,
      });
      continue;
    }

    const hasMeasurement =
      criterion.target !== undefined ||
      (criterion.appliesToAttribute !== undefined &&
        attributeDefinitionIds.has(criterion.appliesToAttribute));
    if (!hasMeasurement) {
      missing.push({
        id: `criterion:${criterion.id}:no-measurement`,
        relatedId: criterion.id,
        reasonKind: 'no_measurement',
        text: `There's no way yet to check "${criterion.label}" against your options.`,
      });
    }
  }

  return missing;
}

function deriveMissingFromExtensions(
  caseExtensions: CaseExtension[],
): DecisionProfileMissingItem[] {
  return caseExtensions
    .filter((extension) => extension.definition.confirmation === 'pending')
    .map((extension) => ({
      id: `extension:${extension.id}:pending`,
      relatedId: extension.id,
      reasonKind: 'pending_confirmation' as const,
      text: `"${extension.definition.label}" is still waiting for your confirmation before it's part of the comparison.`,
    }));
}

export function deriveDecisionProfile(caseState: CaseState): DecisionProfile {
  const activeCriteria = caseState.criteria.filter((criterion) => criterion.status === 'active');

  const mustHave = activeCriteria
    .filter((criterion) => criterion.kind === 'hard_constraint')
    .map(toConcern)
    .sort(byWeightDescending);

  const preferenceConcerns = activeCriteria
    .filter((criterion) => criterion.kind === 'preference')
    .map(toConcern);
  const important = preferenceConcerns
    .filter((concern) => concern.priorityBand !== 'somewhat_important')
    .sort(byWeightDescending);
  const niceToHave = preferenceConcerns
    .filter((concern) => concern.priorityBand === 'somewhat_important')
    .sort(byWeightDescending);

  const context = activeCriteria
    .filter((criterion) => criterion.kind === 'consideration')
    .map(toConcern)
    .sort(byWeightDescending);

  const personalConcerns: DecisionProfilePersonalConcern[] = caseState.caseExtensions
    .filter((extension) => extension.definition.confirmation !== 'rejected')
    .map((extension) => ({
      id: extension.id,
      label: extension.definition.label,
      reason: extension.definition.reason,
      origin: extension.definition.origin,
      confirmation: extension.definition.confirmation,
      proposedBy: extension.definition.proposedBy,
    }));

  const attributeDefinitionIds = new Set(
    caseState.attributeDefinitions.map((definition) => definition.id),
  );
  const missing = [
    ...deriveMissingFromCriteria(activeCriteria, attributeDefinitionIds),
    ...deriveMissingFromExtensions(caseState.caseExtensions),
  ];

  return { mustHave, important, niceToHave, context, personalConcerns, missing };
}
