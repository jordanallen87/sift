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
 * ## `suggestedQuestions` (§16), sourced honestly (task D4)
 *
 * §16's example payload also shows a `suggestedQuestions` array. This was
 * deliberately left unimplemented until now: generating "useful discovery
 * questions" from nothing would mean writing plausible-sounding domain
 * questions ourselves, exactly the fabrication this product exists to
 * prevent. It was blocked on a pack-level Decision Guide (§47) existing as
 * a real, pack-authored input `deriveDecisionProfile` could honestly draw
 * from -- `packages/contracts/src/packs.ts`'s `DecisionGuideSchema` now
 * provides that (task E7), so `deriveDecisionProfile` takes it as an
 * optional second parameter (the pack a case is pinned to is not itself
 * part of `CaseState` -- only `CaseState.pack`'s id/version/hash pin is;
 * resolving that pin to a compiled pack's guide is a caller concern, not
 * this pure projection's).
 *
 * Every `DecisionProfileSuggestedQuestion` traces to exactly one of three
 * real signals, and reuses that signal's OWN already-declared question
 * text verbatim -- this module never composes new question wording from a
 * label, a fact, or anything else:
 *
 *   1. `pack_guide` -- an entry in `guide.suggestedQuestions`, verbatim. The
 *      pack author wrote this as a question; that authorship is exactly
 *      what makes it non-fabricated here (§47: "declarative data a pack
 *      manifest declares").
 *   2. `unmet_obligation` -- `ObligationState.question` (already a real,
 *      pack-authored question -- see `ObligationTemplateSchema`) for any
 *      obligation not yet `satisfied` or `accepted_uncertainty` (i.e. still
 *      genuinely open work, matching webmcp.md's `unresolvedQuestions`
 *      convention: "obligations not yet satisfied/accepted_uncertainty,
 *      ... highest pack-declared priority first"). This is also the
 *      mechanism that honestly surfaces "an extension awaiting
 *      confirmation" when one applies: a case-extension's derived
 *      obligation (`ObligationState.origin === 'case_extension'`) is an
 *      ordinary member of `caseState.obligations` and flows through this
 *      exact same path -- no separate, weaker-grounded extension-specific
 *      branch is needed or added.
 *   3. `missing_criterion` -- for a criterion already flagged in `missing`
 *      above (`no_target`/`no_measurement`) that ALSO carries its own
 *      `Criterion.question` (the same real field `toConcern` already
 *      surfaces). A missing criterion with no declared `question` of its
 *      own contributes nothing here -- the gap is still visible via
 *      `missing`, and an empty contribution here is the honest answer
 *      rather than an invented one.
 *
 * A pending case extension with no matching real obligation question and
 * no matching guide entry therefore contributes nothing to
 * `suggestedQuestions` (while still appearing in `missing`) -- this is not
 * an omission, it is the deliberate boundary: every brief-named source
 * (guide-declared question, unmet obligation, criterion with no target, hard
 * constraint with no target, extension awaiting confirmation) is honored,
 * but only through text that already, genuinely exists.
 *
 * Sources are concatenated in this fixed, deliberate order -- pack-level
 * guidance first (authored for the whole class of decision), then this
 * case's own open obligations (ordered by descending pack-declared
 * `priority`, ties keeping `CaseState.obligations`'s original order, since
 * `Array.prototype.sort` is stable), then criterion-declared questions (in
 * `missing`'s own derivation order) -- and de-duplicated by exact text,
 * keeping the first (highest-priority-source) occurrence, so the same real
 * question surfaced by two signals at once is never shown twice.
 */
import type {
  CaseExtension,
  CaseState,
  Criterion,
  CriterionOrigin,
  DecisionGuide,
  ObligationState,
} from '@sift/contracts';
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

/** See the module header, "`suggestedQuestions` (§16), sourced honestly," for what each source means and why no other source exists. */
export const SUGGESTED_QUESTION_SOURCES = [
  'pack_guide',
  'unmet_obligation',
  'missing_criterion',
] as const;
export type SuggestedQuestionSource = (typeof SUGGESTED_QUESTION_SOURCES)[number];

export interface DecisionProfileSuggestedQuestion {
  id: string;
  /** Verbatim text from the real signal named by `source` -- never composed or paraphrased by this module. */
  text: string;
  source: SuggestedQuestionSource;
  /** The `ObligationState.id` or `Criterion.id` this question traces back to. Absent for `pack_guide`, which is pack-level guidance, not tied to any one case entity. */
  relatedId?: string;
}

export interface DecisionProfile {
  mustHave: DecisionProfileConcern[];
  important: DecisionProfileConcern[];
  niceToHave: DecisionProfileConcern[];
  context: DecisionProfileConcern[];
  personalConcerns: DecisionProfilePersonalConcern[];
  missing: DecisionProfileMissingItem[];
  suggestedQuestions: DecisionProfileSuggestedQuestion[];
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

/** An obligation still represents genuinely open work -- neither resolved nor an accepted, settled uncertainty. */
const UNMET_OBLIGATION_STATUSES: ReadonlySet<ObligationState['status']> = new Set([
  'open',
  'active',
  'blocked',
]);

/** Source 1 (see module header): pack-authored questions, verbatim, in the guide's own declared order. */
function suggestedQuestionsFromGuide(
  guide: DecisionGuide | undefined,
): DecisionProfileSuggestedQuestion[] {
  if (guide === undefined) return [];
  return guide.suggestedQuestions.map((text, index) => ({
    id: `guide:${index}`,
    text,
    source: 'pack_guide' as const,
  }));
}

/** Source 2 (see module header): every still-unmet obligation's own question, highest pack-declared priority first. */
function suggestedQuestionsFromObligations(
  obligations: readonly ObligationState[],
): DecisionProfileSuggestedQuestion[] {
  return obligations
    .filter((obligation) => UNMET_OBLIGATION_STATUSES.has(obligation.status))
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .map((obligation) => ({
      id: `obligation:${obligation.id}`,
      text: obligation.question,
      source: 'unmet_obligation' as const,
      relatedId: obligation.id,
    }));
}

/**
 * Source 3 (see module header): a `missing` criterion (`no_target`/
 * `no_measurement`) that also declares its own `Criterion.question`. A
 * missing criterion with no declared question contributes nothing -- never
 * synthesized from its label.
 */
function suggestedQuestionsFromMissingCriteria(
  missing: readonly DecisionProfileMissingItem[],
  criteriaById: ReadonlyMap<string, Criterion>,
): DecisionProfileSuggestedQuestion[] {
  const questions: DecisionProfileSuggestedQuestion[] = [];
  for (const item of missing) {
    if (item.reasonKind !== 'no_target' && item.reasonKind !== 'no_measurement') continue;
    const criterion = criteriaById.get(item.relatedId);
    if (criterion?.question === undefined) continue;
    questions.push({
      id: `criterion:${criterion.id}`,
      text: criterion.question,
      source: 'missing_criterion',
      relatedId: criterion.id,
    });
  }
  return questions;
}

/** Concatenates every source in priority order, dropping an exact-text repeat and keeping the first (highest-priority-source) occurrence. */
function deriveSuggestedQuestions(
  caseState: CaseState,
  activeCriteria: Criterion[],
  missing: DecisionProfileMissingItem[],
  guide: DecisionGuide | undefined,
): DecisionProfileSuggestedQuestion[] {
  const criteriaById = new Map(activeCriteria.map((criterion) => [criterion.id, criterion]));
  const candidates = [
    ...suggestedQuestionsFromGuide(guide),
    ...suggestedQuestionsFromObligations(caseState.obligations),
    ...suggestedQuestionsFromMissingCriteria(missing, criteriaById),
  ];

  const seenText = new Set<string>();
  const deduplicated: DecisionProfileSuggestedQuestion[] = [];
  for (const candidate of candidates) {
    if (seenText.has(candidate.text)) continue;
    seenText.add(candidate.text);
    deduplicated.push(candidate);
  }
  return deduplicated;
}

/**
 * `guide` is the compiled pack's `DecisionGuide` (`packages/contracts/src/
 * packs.ts`, §46/§47), when the pack a case is pinned to (`CaseState.pack`)
 * declares one -- omit it (or pass `undefined`) for a guideless pack, or
 * when the caller has not yet resolved `CaseState.pack.id`/`version` to its
 * compiled manifest. Optional and separate from `CaseState` on purpose: the
 * pack itself is not part of case state (only the id/version/hash pin is,
 * per `CasePackPinSchema`), and this stays a pure function of its two
 * explicit inputs rather than reaching out to a pack registry itself.
 */
export function deriveDecisionProfile(
  caseState: CaseState,
  guide?: DecisionGuide,
): DecisionProfile {
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

  const suggestedQuestions = deriveSuggestedQuestions(caseState, activeCriteria, missing, guide);

  return {
    mustHave,
    important,
    niceToHave,
    context,
    personalConcerns,
    missing,
    suggestedQuestions,
  };
}
