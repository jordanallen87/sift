/**
 * List view (`docs/change-sets/2026-08-30-generic-decision-workspace.md` §10) -- the option view
 * that answers *"Tell me about each option."* ADR 0005 (`docs/decisions/
 * 0005-workspace-view-state-and-option-views.md`) Decision 2 states why this is a distinct
 * decision task, not a fourth cosmetic skin over the same table: Compare (§11, `OptionCompareView`)
 * answers "how do these options differ," Board (§12, `OptionBoardView`) answers "where does each
 * option currently stand," and List answers neither -- it is "a compact, information-dense card per
 * option," emphasizing depth *within* one option rather than alignment *across* options. Concretely
 * this means every option gets its own self-contained card (identity, a few high-value attribute
 * values, strengths, concerns, what's still unresolved) rather than one row sharing a table with
 * every other option.
 *
 * **"Avoid dumping every available field. Pack presentation metadata should influence which fields
 * are prominent" (§10) is enforced structurally, not by convention.** Every part of a card --
 * the attribute-values row *and* the strengths/concerns/unresolved lists -- is derived from one
 * bounded `prominentDefinitions` set per option (see `pickProminentDefinitions`), never from the
 * full `attributeDefinitions` list. An attribute that doesn't make the prominent cut for a given
 * option's `kind` cannot appear anywhere on that card, in any section, by construction: there is no
 * code path here that reads `option.attributes` keyed by anything other than a prominent
 * definition's id. Prominence itself follows a strict precedence, mirroring the same "caller lever
 * for priority" pattern `OptionCompareView`'s `pinnedAttributeIds` and `OptionBoardView`'s
 * `pickFacts` already use: (1) an explicit `prominentAttributeIds` prop, when the caller (a WebMCP
 * presentation tool, or a future `WorkspaceViewState.list` field) wants to hand-pick fields; else
 * (2) `presentation.attributeGroups[0]` -- the pack author's own first/primary group, read exactly
 * the way `OptionCompareView.buildGroups` reads every group; else (3) the same generic fallback
 * `QuickPickView.tsx` uses for its highlight row -- comparison-relevant definitions
 * (`comparison !== 'none'`) when a pack declares any, otherwise simply the first few applicable
 * definitions -- so a pack with no `presentation` metadata at all still renders real facts instead
 * of an empty card.
 *
 * **Strengths/concerns/unresolved derivation is the same honest, pack-agnostic signal
 * `QuickPickView.tsx` uses, not a new or looser heuristic.** This component has no access to
 * `Criterion[]` weights or targets -- only `AttributeDefinition[]` -- so, exactly as
 * `QuickPickView.tsx`'s header comment explains, it cannot honestly know whether a value is "good"
 * in some pack-specific sense (CLAUDE.md: "the deterministic core, not an LLM, owns ... evidence
 * validity"). What it *can* know honestly is how well-evidenced a value is, by comparing
 * `AttributeRecord.status` against the definition's declared `evidenceExpectation`
 * (`meetsEvidenceExpectation`, imported from `../lib/evidence-expectation.js` -- Task C6 extracted
 * this out of what used to be two byte-for-byte-identical copies, one here and one in
 * `QuickPickView.tsx`, into the one shared, separately-tested module both views now import, so the
 * single judgment that decides "well supported" versus "needs checking" cannot drift between
 * views). List view's three-way split just carries that one signal one step further than Quick
 * Pick's two-way "why it fits" / "watch out" split, because §10 names three distinct things to
 * show, and collapsing "conflicting/under-evidenced" and "genuinely missing" into one bucket would
 * blur "what do I still need to find out" (unresolved -- no value at all) from "what should I be
 * skeptical of" (concerns -- a value exists but isn't trustworthy yet):
 *   - **Strengths**: a value is present and meets or exceeds its definition's evidence bar --
 *     a fact the card can honestly stand behind.
 *   - **Concerns**: a value is present but conflicted, or present but under-evidenced relative to
 *     what its definition expects.
 *   - **Unresolved**: no value at all (`status === 'unknown'` or no record).
 * An option with nothing that clears the evidence bar renders zero fabricated strengths -- a muted
 * "Nothing strongly supported yet." fallback, matching `QuickPickView.tsx`'s identical empty-state
 * copy, never an invented bullet.
 *
 * The split is derived over every applicable definition, not just the `prominentDefinitions` the
 * fact row renders -- see `buildInsights`'s own header comment for why (an identity-attribute
 * filter, and a fact-row-duplicate suppression, added after the initial version produced the same
 * "value shown confidently, then flagged as needing evidence, in the same glance" contradiction
 * `QuickPickView.tsx`'s header comment names).
 *
 * **Honest unknowns (§10, CLAUDE.md).** The attribute-values row renders "Unknown" for any
 * prominent attribute with no value, muted the same way `OptionCompareView`'s cells and
 * `QuickPickView`'s highlight row do -- never blank, never invented.
 *
 * **Custom (`custom.*`) fields (§26).** Rendered by `definition.label` everywhere, exactly like
 * `OptionCompareView.tsx` and `OptionBoardView.tsx` -- the raw `custom.` id is never rendered as
 * visible text, only inside `data-testid` attributes. The attribute-values row applies the same
 * subtle outlined `Custom` badge (title "Added for your comparison") `OptionCompareView.tsx` uses
 * for its comparison rows, reused verbatim here for consistency across the view family.
 *
 * **Selected-state treatment (§62 "strong selected-state treatment").** A selected card gets the
 * same `--color-status-ready-ink`/`--color-status-ready-bg` tint and inline "Selected" label
 * `OptionCompareView`'s header cell and `OptionBoardView`'s card already use, so the four views
 * read as one family rather than four independently invented selected states.
 *
 * **Purely presentational (this task's own contract, matching every sibling view).** No fetching,
 * no context, no command dispatch -- `options`/`selectedOptionId`/`visibleOptionIds`/
 * `prominentAttributeIds` are caller-supplied projections; `onFocusOption` only reports intent, it
 * never mutates anything itself, the same "report, don't decide" shape `OptionCompareView`'s
 * `onFocusOption` and `OptionBoardView`'s `onFocusOption`/`onMoveOption` already use.
 *
 * **Narrow viewport (390-480px canonical, §7/§49).** Cards stack in a single vertical column with
 * no fixed pixel widths anywhere, so nothing here can force horizontal page overflow -- there is no
 * horizontally-scrolling region to manage in the first place, unlike Compare's table or Board's
 * columns.
 */
import { useMemo } from 'react';
import type { AttributeDefinition, EntityRecord, PresentationDefinition } from '@sift/contracts';
import { formatAttributeValue } from './attribute-value-format.js';
import { Badge } from '@/components/ui/badge';
import { isIdentityAttribute, meetsEvidenceExpectation } from '../lib/evidence-expectation.js';

export interface OptionListViewProps {
  options: EntityRecord[];
  attributeDefinitions: AttributeDefinition[];
  /** `CompiledDecisionPack.presentation`, or `null` if not yet available. Its first attribute group, when present, is preferred as the source of each card's prominent fields (see the header comment's prominence precedence). */
  presentation: PresentationDefinition | null;
  selectedOptionId: string | null;
  /** Narrows which option cards render. `undefined` shows every option -- the backward-compatible default, matching `OptionCompareView`'s identical convention. */
  visibleOptionIds?: string[];
  /** Explicit caller-chosen prominent attribute ids, taking precedence over `presentation`'s first group and the generic fallback. Applied identically to every rendered card (a per-option override is not part of this contract). `undefined` or empty falls through to `presentation`, then the generic fallback. */
  prominentAttributeIds?: string[];
  /** Fired when a user or WebMCP-driven caller focuses a card. This component never decides focus itself, matching `OptionCompareView.onFocusOption`/`OptionBoardView.onFocusOption`. */
  onFocusOption: (optionId: string) => void;
}

const CUSTOM_ATTRIBUTE_ID_PREFIX = 'custom.';
const MAX_PROMINENT_ATTRIBUTES = 6;
// Caps each of the three insight lists once `buildInsights` widened from
// "only the prominent set" to every applicable definition (see that
// function's header comment) -- otherwise a pack with many attributes could
// grow "Concerns"/"Unresolved" without bound, defeating "avoid dumping every
// available field" (§10) just one section down from where `facts` already
// enforces it.
const MAX_INSIGHT_ITEMS_PER_SECTION = 6;

/** Identical check to `OptionCompareView.tsx`'s `isCustomAttributeId` -- `attributes.ts`'s `custom.` id namespace comment warns this id is otherwise "rendered directly in the generic UI" with no humanizing step (ADR 0005 Decision 6). */
function isCustomAttributeId(id: string): boolean {
  return id.startsWith(CUSTOM_ATTRIBUTE_ID_PREFIX);
}

/** Same "show everything by default, silently drop stale ids" contract as `OptionCompareView.tsx`'s `narrowOptions`. */
function narrowOptions(
  options: EntityRecord[],
  visibleOptionIds: string[] | undefined,
): EntityRecord[] {
  if (visibleOptionIds === undefined) return options;
  const byId = new Map(options.map((option) => [option.id, option]));
  return visibleOptionIds
    .map((id) => byId.get(id))
    .filter((option): option is EntityRecord => option !== undefined);
}

/**
 * Resolves the bounded prominent-attribute set for one option's applicable definitions, following
 * the three-step precedence the header comment describes: an explicit prop, then the pack's first
 * presentation group, then the generic comparison-relevant-or-first-few fallback
 * `QuickPickView.tsx` uses. Every section of the rendered card reads only from this list, which is
 * what makes "avoid dumping every available field" (§10) true by construction rather than by
 * convention.
 */
function pickProminentDefinitions(
  applicableDefinitions: AttributeDefinition[],
  presentation: PresentationDefinition | null,
  prominentAttributeIds: string[] | undefined,
): AttributeDefinition[] {
  const byId = new Map(applicableDefinitions.map((definition) => [definition.id, definition]));

  if (prominentAttributeIds !== undefined && prominentAttributeIds.length > 0) {
    const explicit = prominentAttributeIds
      .map((id) => byId.get(id))
      .filter((definition): definition is AttributeDefinition => definition !== undefined);
    if (explicit.length > 0) return explicit.slice(0, MAX_PROMINENT_ATTRIBUTES);
  }

  if (presentation !== null && presentation.attributeGroups.length > 0) {
    const firstGroup = presentation.attributeGroups[0]!;
    const grouped = firstGroup.attributeIds
      .map((id) => byId.get(id))
      .filter((definition): definition is AttributeDefinition => definition !== undefined);
    if (grouped.length > 0) return grouped.slice(0, MAX_PROMINENT_ATTRIBUTES);
  }

  const comparisonRelevant = applicableDefinitions.filter(
    (definition) => definition.comparison !== 'none',
  );
  const fallbackSource = comparisonRelevant.length > 0 ? comparisonRelevant : applicableDefinitions;
  return fallbackSource.slice(0, MAX_PROMINENT_ATTRIBUTES);
}

interface CardFact {
  definitionId: string;
  label: string;
  display: string;
  known: boolean;
  custom: boolean;
}

/** Every prominent definition becomes exactly one fact -- known values format through the shared formatter, missing values render the explicit "Unknown" string (§10, CLAUDE.md), never blank or invented. */
function buildFacts(option: EntityRecord, prominentDefinitions: AttributeDefinition[]): CardFact[] {
  return prominentDefinitions.map((definition) => {
    const value = option.attributes[definition.id]?.value;
    return {
      definitionId: definition.id,
      label: definition.label,
      display: value !== undefined ? formatAttributeValue(value) : 'Unknown',
      known: value !== undefined,
      custom: isCustomAttributeId(definition.id),
    };
  });
}

interface CardInsight {
  definitionId: string;
  text: string;
}

interface CardInsights {
  strengths: CardInsight[];
  concerns: CardInsight[];
  unresolved: CardInsight[];
}

/**
 * The three-way honest split the header comment describes. Widened to run
 * over every applicable definition, not just the prominent set `buildFacts`
 * uses for the fact row: sourcing both from the same set meant every
 * insight necessarily duplicated a fact already shown above it, including
 * the self-contradictory case of a value shown confidently in the fact row
 * and then, one section down, flagged as still needing evidence (the same
 * "Model year: 2022" / "Model year still needs stronger evidence" defect
 * `QuickPickView.tsx`'s header comment describes -- this view showed it too,
 * as "Price: 28500" / "Price still needs stronger evidence" for the exact
 * same value). Two refinements now sit on top of the raw per-attribute
 * signal, mirroring `QuickPickView.tsx`'s `buildInsights` exactly:
 *
 * 1. A plain identity/label descriptor (`isIdentityAttribute` --
 *    `../lib/evidence-expectation.js`) is skipped before any evidence
 *    check, so it never appears in any of the three lists regardless of
 *    status.
 * 2. An under-evidenced value that is already shown, unqualified, in the
 *    fact row (`prominentIds`) is not repeated as a concern -- suppressed
 *    only for that one branch, so a genuinely unknown or conflicted value
 *    (never merely "already shown with no caveat") always still surfaces,
 *    and a value that DOES meet its evidence bar is still repeated in
 *    `strengths` deliberately, as confirmation rather than contradiction.
 */
function buildInsights(
  option: EntityRecord,
  applicableDefinitions: AttributeDefinition[],
  prominentIds: ReadonlySet<string>,
): CardInsights {
  const strengths: CardInsight[] = [];
  const concerns: CardInsight[] = [];
  const unresolved: CardInsight[] = [];

  for (const definition of applicableDefinitions) {
    if (isIdentityAttribute(definition)) continue;

    const record = option.attributes[definition.id];

    if (record === undefined || record.status === 'unknown' || record.value === undefined) {
      unresolved.push({
        definitionId: definition.id,
        text: `${definition.label} is still unknown`,
      });
      continue;
    }
    if (record.status === 'conflicted') {
      concerns.push({
        definitionId: definition.id,
        text: `${definition.label} has conflicting information`,
      });
      continue;
    }
    if (meetsEvidenceExpectation(record.status, definition.evidenceExpectation)) {
      strengths.push({
        definitionId: definition.id,
        text: `${definition.label}: ${formatAttributeValue(record.value)}`,
      });
    } else if (!prominentIds.has(definition.id)) {
      concerns.push({
        definitionId: definition.id,
        text: `${definition.label} still needs stronger evidence`,
      });
    }
  }

  return {
    strengths: strengths.slice(0, MAX_INSIGHT_ITEMS_PER_SECTION),
    concerns: concerns.slice(0, MAX_INSIGHT_ITEMS_PER_SECTION),
    unresolved: unresolved.slice(0, MAX_INSIGHT_ITEMS_PER_SECTION),
  };
}

interface InsightSectionProps {
  optionId: string;
  section: 'strengths' | 'concerns' | 'unresolved';
  heading: string;
  emptyText: string;
  items: CardInsight[];
}

function InsightSection({ optionId, section, heading, emptyText, items }: InsightSectionProps) {
  return (
    <div
      data-testid={`option-list-view-${section}-${optionId}`}
      className="flex flex-col gap-[var(--space-1)]"
    >
      <h3 className="label-caps text-[var(--color-ink-secondary)]">{heading}</h3>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-[var(--space-0-5)]">
          {items.map((item) => (
            <li
              key={item.definitionId}
              data-testid={`option-list-view-${section}-item-${optionId}-${item.definitionId}`}
              className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
            >
              {item.text}
            </li>
          ))}
        </ul>
      ) : (
        <p
          data-testid={`option-list-view-${section}-empty-${optionId}`}
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]"
        >
          {emptyText}
        </p>
      )}
    </div>
  );
}

interface OptionListCardProps {
  option: EntityRecord;
  attributeDefinitions: AttributeDefinition[];
  presentation: PresentationDefinition | null;
  prominentAttributeIds: string[] | undefined;
  isSelected: boolean;
  onFocusOption: (optionId: string) => void;
}

function OptionListCard({
  option,
  attributeDefinitions,
  presentation,
  prominentAttributeIds,
  isSelected,
  onFocusOption,
}: OptionListCardProps) {
  const applicableDefinitions = useMemo(
    () => attributeDefinitions.filter((definition) => definition.appliesTo.includes(option.kind)),
    [attributeDefinitions, option.kind],
  );

  const prominentDefinitions = useMemo(
    () => pickProminentDefinitions(applicableDefinitions, presentation, prominentAttributeIds),
    [applicableDefinitions, presentation, prominentAttributeIds],
  );

  const facts = useMemo(
    () => buildFacts(option, prominentDefinitions),
    [option, prominentDefinitions],
  );
  const insights = useMemo(() => {
    const prominentIds = new Set(prominentDefinitions.map((definition) => definition.id));
    return buildInsights(option, applicableDefinitions, prominentIds);
  }, [option, applicableDefinitions, prominentDefinitions]);

  return (
    <li
      data-testid={`option-list-view-card-${option.id}`}
      data-selected={isSelected ? 'true' : 'false'}
      className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]"
      style={
        isSelected
          ? {
              color: 'var(--color-status-ready-ink)',
              backgroundColor: 'var(--color-status-ready-bg)',
            }
          : undefined
      }
    >
      <button
        type="button"
        data-testid={`option-list-view-focus-${option.id}`}
        onClick={() => onFocusOption(option.id)}
        aria-pressed={isSelected}
        className="w-full min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] font-semibold text-[inherit]"
      >
        {option.label}
        {isSelected ? <span className="label-caps ml-[var(--space-1)]">Selected</span> : null}
      </button>

      {facts.length > 0 ? (
        <ul
          data-testid={`option-list-view-facts-${option.id}`}
          className="flex flex-col gap-[var(--space-0-5)]"
        >
          {facts.map((fact) => (
            <li
              key={fact.definitionId}
              data-testid={`option-list-view-fact-${option.id}-${fact.definitionId}`}
              className="text-[length:var(--font-size-sm)]"
            >
              <span className="inline-flex min-w-0 items-center gap-[var(--space-1)] text-[var(--color-ink-secondary)]">
                {fact.label}
                {fact.custom ? (
                  <Badge
                    variant="outline"
                    data-testid={`option-list-view-fact-custom-badge-${option.id}-${fact.definitionId}`}
                    className="label-caps shrink-0 px-[var(--space-1)] py-0 text-[var(--color-ink-secondary)]"
                    title="Added for your comparison"
                  >
                    Custom
                  </Badge>
                ) : null}
                :
              </span>{' '}
              <span style={fact.known ? undefined : { color: 'var(--color-ink-muted)' }}>
                {fact.display}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <InsightSection
        optionId={option.id}
        section="strengths"
        heading="Strengths"
        emptyText="Nothing strongly supported yet."
        items={insights.strengths}
      />
      <InsightSection
        optionId={option.id}
        section="concerns"
        heading="Concerns"
        emptyText="Nothing flagged."
        items={insights.concerns}
      />
      <InsightSection
        optionId={option.id}
        section="unresolved"
        heading="Still unresolved"
        emptyText="Nothing outstanding."
        items={insights.unresolved}
      />
    </li>
  );
}

export function OptionListView({
  options,
  attributeDefinitions,
  presentation,
  selectedOptionId,
  visibleOptionIds,
  prominentAttributeIds,
  onFocusOption,
}: OptionListViewProps) {
  const displayedOptions = useMemo(
    () => narrowOptions(options, visibleOptionIds),
    [options, visibleOptionIds],
  );

  return (
    <section
      data-testid="option-list-view"
      aria-labelledby="option-list-view-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      <h2 id="option-list-view-heading">Tell me about each option</h2>

      {displayedOptions.length === 0 ? (
        <p
          data-testid="option-list-view-empty"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          Add at least one candidate to see details for each option.
        </p>
      ) : (
        <ul data-testid="option-list-view-cards" className="flex flex-col gap-[var(--space-3)]">
          {displayedOptions.map((option) => (
            <OptionListCard
              key={option.id}
              option={option}
              attributeDefinitions={attributeDefinitions}
              presentation={presentation}
              prominentAttributeIds={prominentAttributeIds}
              isSelected={option.id === selectedOptionId}
              onFocusOption={onFocusOption}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
