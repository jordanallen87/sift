/**
 * Everything about ONE option, assembled once for the human surfaces --
 * the counterpart to `sift_get_option_details`, which has been giving
 * ChatGPT a complete per-option profile that a person could not see.
 *
 * ## Why this module exists
 *
 * `buildOptionDetails` (`apps/web/src/model-context/case-context.ts`)
 * already joins an option to its claims and sources and exposes them as a
 * WebMCP tool. Nothing rendered any of it. Meanwhile the browse views each
 * re-implemented their own attribute selection locally and, between them,
 * showed only two of `AttributeRecord`'s eight fields (`value`, and
 * `status` used invisibly to sort a fact into a bucket). A person never saw
 * whether a number was verified or merely asserted, who claimed it, what it
 * cited, or when it was last checked.
 *
 * The project owner's framing: "the way you have these grids setup - it's
 * cramming a lot of information in them when we should keep that focused
 * and keep the extra detail in the profiles."
 *
 * So this module owns both halves of that split:
 *
 *  - `deriveOptionProfile` -- the FULL picture, for the detail sheet.
 *  - `pickCardAttributeIds` / `summarizeOptionSignals` -- the deliberately
 *    small set a browse card keeps, plus the one-line signal that tells a
 *    person there is more worth opening.
 *
 * Keeping both here is the point: the card is defined as "the prominent
 * slice of the profile," so the two cannot drift into disagreeing about
 * what matters.
 *
 * ## Pack-agnostic by construction
 *
 * Nothing here names a car, a price, or any `car.*` id. Ordering comes from
 * `PresentationDefinition.prominentAttributeIds`, grouping from
 * `PresentationDefinition.attributeGroups`, importance from `Criterion`
 * weights, and eligibility from `AttributeDefinition.valueType` /
 * `comparison`. A pack that declares none of the optional fields still
 * renders, with a less-informed order.
 *
 * ## Presentation only
 *
 * Pure functions over data the caller already has. Nothing here appends a
 * `CaseEvent`, advances `eventSequence`, or touches a `Criterion` -- a
 * profile is a way of LOOKING at an option, never a change to it.
 */
import type {
  AttributeDefinition,
  AttributeRecord,
  CaseNote,
  CaseState,
  Claim,
  Criterion,
  EntityRecord,
  PresentationDefinition,
  Source,
} from '@sift/contracts';
import { isIdentityAttribute, meetsEvidenceExpectation } from '../lib/evidence-expectation.js';
import { formatAttributeValue } from './attribute-value-format.js';

// --- Choosing the few facts a browse card keeps -------------------------

/**
 * Ranks an attribute by the heaviest criterion that declares it via
 * `Criterion.appliesToAttribute`, or 0 when no criterion references it.
 *
 * This is the fallback for a pack that declares no
 * `prominentAttributeIds`: what the USER said matters is the next best
 * signal after what the pack author said matters, and it is genuinely
 * generic -- `appliesToAttribute` is a first-class contract field, not a
 * heuristic over ids.
 */
function criterionWeightFor(attributeId: string, criteria: Criterion[]): number {
  let heaviest = 0;
  for (const criterion of criteria) {
    if (criterion.appliesToAttribute === attributeId && criterion.weight > heaviest) {
      heaviest = criterion.weight;
    }
  }
  return heaviest;
}

/**
 * The attribute ids a browse card should lead with, in order, capped at
 * `limit`.
 *
 * Precedence, most-authoritative first:
 *
 *  1. `presentation.prominentAttributeIds` -- the pack author's own answer,
 *     filtered to definitions that actually exist and apply to this option
 *     kind (a stale id from an older pack version is skipped, never
 *     rendered as a blank row).
 *  2. Criterion weight -- what the person said matters, descending.
 *  3. Money first, then declaration order -- the last resort, and the only
 *     step here that encodes a domain assumption. It is confined to this
 *     one branch precisely so a pack that declares either of the fields
 *     above never depends on it.
 *
 * Identity attributes are excluded throughout (`isIdentityAttribute`): a
 * card already shows the option's label, so "Make: Toyota" under the
 * heading "2022 Toyota RAV4 XLE Hybrid AWD" spends a line to say nothing.
 * This is exactly the defect the pack field was added to fix -- a 390px
 * card previously showed six identity fields and no price.
 */
export function pickCardAttributeIds(
  definitions: AttributeDefinition[],
  presentation: PresentationDefinition | null,
  criteria: Criterion[],
  optionKind: string,
  limit: number,
): string[] {
  const eligible = definitions.filter(
    (definition) => definition.appliesTo.includes(optionKind) && !isIdentityAttribute(definition),
  );
  const byId = new Map(eligible.map((definition) => [definition.id, definition]));

  const declared = presentation?.prominentAttributeIds ?? [];
  if (declared.length > 0) {
    const kept = declared.filter((id) => byId.has(id));
    if (kept.length > 0) return kept.slice(0, limit);
    // Every declared id is stale or inapplicable for this option kind --
    // fall through rather than render an empty card.
  }

  const weighted = eligible
    .map((definition) => ({ definition, weight: criterionWeightFor(definition.id, criteria) }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  if (weighted.length > 0) {
    return weighted.slice(0, limit).map((entry) => entry.definition.id);
  }

  const moneyFirst = [...eligible].sort((a, b) => {
    const aMoney = a.valueType === 'money' ? 0 : 1;
    const bMoney = b.valueType === 'money' ? 0 : 1;
    return aMoney - bMoney;
  });
  return moneyFirst.slice(0, limit).map((definition) => definition.id);
}

// --- The one-line signal a card shows instead of three full sections ----

/**
 * How many of this option's attributes read as a strength, a concern, or
 * still unknown.
 *
 * Deliberately the SAME rule the views' own insight sections already use
 * (`isIdentityAttribute`, then `status`/`evidenceExpectation` via
 * `meetsEvidenceExpectation`), so a card's "3 concerns" and the profile's
 * concern list can never disagree about what a concern is.
 *
 * A card renders these as counts rather than as three stacked lists. The
 * lists themselves were the bulk of the cramming: a four-option grid
 * carried twelve sections and roughly a hundred lines, and every concern
 * line in the seeded case ended with the identical phrase "still needs
 * stronger evidence," so the wall of text carried almost no information per
 * line. A count says the same thing and leaves the detail to the profile.
 */
export interface OptionSignalCounts {
  strengths: number;
  concerns: number;
  unresolved: number;
}

export function summarizeOptionSignals(
  option: EntityRecord,
  definitions: AttributeDefinition[],
): OptionSignalCounts {
  const counts: OptionSignalCounts = { strengths: 0, concerns: 0, unresolved: 0 };
  for (const definition of definitions) {
    if (!definition.appliesTo.includes(option.kind)) continue;
    if (isIdentityAttribute(definition)) continue;
    const record = option.attributes[definition.id];
    if (record === undefined || record.status === 'unknown' || record.value === undefined) {
      counts.unresolved += 1;
      continue;
    }
    if (record.status === 'conflicted') {
      counts.concerns += 1;
      continue;
    }
    if (meetsEvidenceExpectation(record.status, definition.evidenceExpectation)) {
      counts.strengths += 1;
    } else {
      counts.concerns += 1;
    }
  }
  return counts;
}

// --- The full profile ---------------------------------------------------

/**
 * One attribute as the profile shows it: the value a card would show, PLUS
 * every provenance field no view has ever rendered.
 *
 * `status`, `origin`, `confidence`, `updatedAt`, and `sourceIds` are all
 * first-class `AttributeRecord` fields (`packages/contracts/src/
 * attributes.ts`) that no surface has displayed. They are the difference
 * between "$33,291.30" and "$33,291.30, asserted by the agent from one
 * dealer listing, not independently corroborated" -- which is the entire
 * question a person opens a profile to answer.
 */
export interface OptionProfileAttribute {
  definitionId: string;
  label: string;
  /** The formatted value, or `null` when this option has no usable value for the attribute. */
  display: string | null;
  /**
   * The raw Markdown source when this attribute's value is a `text` value
   * carrying `format: 'markdown'`, and `null` otherwise.
   *
   * Deliberately a SECOND field rather than a change to `display`.
   * `formatAttributeValue` returns a plain `string` and is what cells, chips,
   * comparison tables, and browse cards render; those surfaces want one
   * unformatted line and would be broken by a block of prose, so `display`
   * keeps its exact previous meaning everywhere. A surface that has room for
   * a formatted body -- today, the option profile sheet's attribute rows --
   * renders this through `MarkdownText` instead, and every other surface
   * simply ignores it. `display` remains populated in both cases, so a
   * caller that does not know about Markdown still shows the right text.
   *
   * Blank or whitespace-only Markdown is normalised to `null`, because
   * `MarkdownText` renders nothing for it and a row would otherwise lose the
   * value entirely rather than falling back to `display`.
   */
  markdown: string | null;
  /** `AttributeRecord.status`, or `null` when no record exists at all -- the two are different, and both are honest. */
  status: AttributeRecord['status'] | null;
  origin: AttributeRecord['origin'] | null;
  confidence: number | null;
  updatedAt: string | null;
  /** The real `Source` records this attribute cites, resolved from `AttributeRecord.sourceIds`. Unresolvable ids are dropped, never rendered as a bare id. */
  sources: Source[];
  /** True for a `custom.*` id -- an attribute added for this case rather than declared by the pack. */
  custom: boolean;
  /** What the pack expects before this value can be trusted, shown so "needs stronger evidence" is explicable rather than a verdict from nowhere. */
  evidenceExpectation: AttributeDefinition['evidenceExpectation'];
  /**
   * Which bucket `summarizeOptionSignals` counted this into, so the profile
   * can group identically.
   *
   * `'identity'` is the fourth value and means "deliberately not counted":
   * an identity attribute is a descriptive label, not a claim anyone needs
   * to evidence. Without it the two functions here disagreed -- a profile
   * row for an under-evidenced identity field rendered with a concern
   * treatment while `summarizeOptionSignals` (which skips identity
   * attributes) left it out of the "N need a closer look" count, so the
   * screen showed a warning the summary denied.
   *
   * Not a cosmetic tidy-up: `evidence-expectation.ts`'s own header records
   * that flagging identity fields as risks was already shipped once as a
   * defect ("Make still needs stronger evidence" for a listing whose make is
   * shown unqualified on the same card). This keeps the two views of that
   * judgment structurally in sync rather than by convention.
   */
  signal: 'strength' | 'concern' | 'unresolved' | 'identity';
}

export interface OptionProfileGroup {
  id: string;
  label: string;
  attributes: OptionProfileAttribute[];
}

export interface OptionProfile {
  option: EntityRecord;
  /** Sectioned exactly by `presentation.attributeGroups`, with anything ungrouped collected last. */
  groups: OptionProfileGroup[];
  signals: OptionSignalCounts;
  /** Claims recorded specifically about THIS option (`Claim.entityId`). */
  relatedClaims: Claim[];
  /** Sources reachable from those claims plus every attribute's own `sourceIds`. */
  relatedSources: Source[];
  /** Notes whose `optionIds` include this option. */
  relatedNotes: CaseNote[];
  /**
   * Whether the current recommendation favors this option.
   *
   * `Recommendation.favoredOptionId` is a real contract field that, before
   * this module, had ZERO non-test references anywhere in the app -- the
   * recommendation never visually named the option it favored. The profile
   * is the natural place to say so.
   */
  favored: boolean;
}

const UNGROUPED_GROUP_ID = 'other';
const UNGROUPED_GROUP_LABEL = 'Other details';
const FALLBACK_GROUP_ID = 'all';
const FALLBACK_GROUP_LABEL = 'All details';

function buildProfileAttribute(
  definition: AttributeDefinition,
  option: EntityRecord,
  sourcesById: Map<string, Source>,
): OptionProfileAttribute {
  const record = option.attributes[definition.id];
  const hasValue =
    record !== undefined && record.status !== 'unknown' && record.value !== undefined;
  const value = hasValue && record.value !== undefined ? record.value : null;
  const markdown =
    value !== null && value.type === 'text' && value.format === 'markdown' ? value.value : null;

  // Identity first, and unconditionally: it must win over every
  // evidence-derived bucket below, exactly as `summarizeOptionSignals`
  // skips identity attributes before looking at any status.
  const signal: OptionProfileAttribute['signal'] = isIdentityAttribute(definition)
    ? 'identity'
    : !hasValue
      ? 'unresolved'
      : record.status === 'conflicted'
        ? 'concern'
        : meetsEvidenceExpectation(record.status, definition.evidenceExpectation)
          ? 'strength'
          : 'concern';

  return {
    definitionId: definition.id,
    label: definition.label,
    display: value !== null ? formatAttributeValue(value) : null,
    markdown: markdown !== null && markdown.trim() !== '' ? markdown : null,
    status: record?.status ?? null,
    origin: record?.origin ?? null,
    confidence: record?.confidence ?? null,
    updatedAt: record?.updatedAt ?? null,
    // Resolved to real `Source` records; an id with no matching source is
    // dropped rather than rendered as a bare opaque string.
    sources: (record?.sourceIds ?? [])
      .map((id) => sourcesById.get(id))
      .filter((source): source is Source => source !== undefined),
    custom: definition.id.startsWith('custom.'),
    evidenceExpectation: definition.evidenceExpectation,
    signal,
  };
}

/**
 * Assembles the complete profile for one option.
 *
 * Returns `null` when the option id matches no entity on the case -- a
 * caller asking about an option that was removed gets an honest absence, not
 * an empty shell that looks like a real car with nothing known about it.
 */
export function deriveOptionProfile(
  caseState: Pick<
    CaseState,
    'entities' | 'attributeDefinitions' | 'claims' | 'sources' | 'notes' | 'recommendation'
  >,
  optionId: string,
  presentation: PresentationDefinition | null,
): OptionProfile | null {
  const option = caseState.entities.find((entity) => entity.id === optionId);
  if (option === undefined) return null;

  const sourcesById = new Map(caseState.sources.map((source) => [source.id, source]));
  const applicable = caseState.attributeDefinitions.filter((definition) =>
    definition.appliesTo.includes(option.kind),
  );
  const attributeById = new Map(
    applicable.map((definition) => [
      definition.id,
      buildProfileAttribute(definition, option, sourcesById),
    ]),
  );

  // Group exactly as the pack author sectioned them. Unlike a browse card,
  // a profile deliberately KEEPS identity attributes: "what is this thing"
  // is the first question a detail view should answer, and it is only
  // redundant next to a title on a card.
  const groups: OptionProfileGroup[] = [];
  const grouped = new Set<string>();
  for (const group of presentation?.attributeGroups ?? []) {
    const attributes = group.attributeIds
      .map((id) => attributeById.get(id))
      .filter((attribute): attribute is OptionProfileAttribute => attribute !== undefined);
    for (const attribute of attributes) grouped.add(attribute.definitionId);
    if (attributes.length > 0) {
      groups.push({ id: group.id, label: group.label, attributes });
    }
  }

  // Anything the pack did not place -- including every `custom.*` concern
  // added for this case, which by definition no pack-authored group lists.
  const ungrouped = applicable
    .filter((definition) => !grouped.has(definition.id))
    .map((definition) => attributeById.get(definition.id))
    .filter((attribute): attribute is OptionProfileAttribute => attribute !== undefined);
  if (ungrouped.length > 0) {
    groups.push(
      groups.length === 0
        ? { id: FALLBACK_GROUP_ID, label: FALLBACK_GROUP_LABEL, attributes: ungrouped }
        : { id: UNGROUPED_GROUP_ID, label: UNGROUPED_GROUP_LABEL, attributes: ungrouped },
    );
  }

  // The same join `buildOptionDetails` performs for the model
  // (`case-context.ts`): claims recorded about this option, plus every
  // source reachable from those claims OR cited directly by one of this
  // option's own attributes.
  const relatedClaims = caseState.claims.filter((claim) => claim.entityId === optionId);
  const sourceIds = new Set<string>();
  for (const claim of relatedClaims) for (const id of claim.sourceIds) sourceIds.add(id);
  for (const record of Object.values(option.attributes)) {
    for (const id of record.sourceIds) sourceIds.add(id);
  }
  const relatedSources = [...sourceIds]
    .map((id) => sourcesById.get(id))
    .filter((source): source is Source => source !== undefined);

  return {
    option,
    groups,
    signals: summarizeOptionSignals(option, caseState.attributeDefinitions),
    relatedClaims,
    relatedSources,
    // `CaseState.notes` is optional in the contract, so a case that has
    // never had a note has no array at all -- distinct from an empty one,
    // and both mean "no notes about this option".
    relatedNotes: (caseState.notes ?? []).filter((note) => note.optionIds.includes(optionId)),
    favored: caseState.recommendation?.favoredOptionId === optionId,
  };
}
