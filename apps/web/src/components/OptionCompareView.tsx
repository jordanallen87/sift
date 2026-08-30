/**
 * The rebuilt Compare / Table view (docs/change-sets/2026-08-30-generic-decision-workspace.md
 * §11) that supersedes `OptionComparison.tsx`'s unconditional "every option is a column, every
 * applicable attribute is a row" rendering. `docs/decisions/0005-workspace-view-state-and-option-
 * views.md` Decision 5 states the defect this component exists to fix directly: `OptionComparison`
 * "has no prop, piece of local state, or hook anywhere in the file that could narrow either axis"
 * -- yet §11 requires that "the model must be able to configure which fields/rows appear" (e.g.
 * "Show me the three finalists and only the things that matter most to me") and §58 stages this as
 * a deliberate WebMCP demo moment: ChatGPT "limits candidates; sets visible rows... page visibly
 * reconfigures without click automation."
 *
 * `visibleOptionIds`/`visibleAttributeIds`/`pinnedAttributeIds` are therefore real, independent
 * props -- not internal component state -- because ADR 0005 Decision 5 requires the narrowing
 * source of truth to live in `WorkspaceViewState` (written by a WebMCP presentation tool through
 * `updateSelection()`) and merely be *read* here. Per §54/§32 ("UI action vs decision mutation"):
 * narrowing what is visible is presentation, never a criteria mutation, so this component only
 * ever reads/renders a caller-supplied projection -- it never computes or persists anything itself
 * (this file has no fetching, no context, no command dispatch, matching `OptionComparison.tsx`'s
 * "purely presentational" contract).
 *
 * Narrow vs. expanded (§7, ADR 0005 Decision 4) are two distinct information architectures, not
 * one table scaled by CSS: "at 390px a two-option head-to-head comparison may be far more usable"
 * than a multi-column table. `layout` is an explicit caller-supplied prop -- this component never
 * calls `matchMedia` itself, per this task's own instruction and ADR 0005 Decision 4's observation
 * that no width-detection mechanism exists yet in `apps/web/src`; that mechanism, and the decision
 * of which literal breakpoint maps to which `layout` value, belongs to the caller that owns
 * `WorkspaceViewState`, not to this presentational leaf.
 *
 * Custom (`custom.*`) fields render as first-class rows (§26): a small "Custom" marker indicates
 * "added for your comparison" without ever leaking the raw id into visible text -- `definition.
 * label` is rendered everywhere, exactly as ADR 0005 Decision 6 requires ("their raw ids never
 * reach consumer UI").
 *
 * Reused from `OptionComparison.tsx` verbatim in spirit (not by import -- that file exports no
 * shared helper): the `attributeGroups`-driven grouping fallback, the "Unknown" (never blank)
 * missing-value rule, and the `overflow-x-auto`-inside-its-own-container scroll discipline so the
 * comparison table -- not the page -- scrolls sideways (§49 "no horizontal page overflow").
 */
import { useMemo } from 'react';
import type { AttributeDefinition, EntityRecord, PresentationDefinition } from '@sift/contracts';
import { formatAttributeValue } from './attribute-value-format.js';
import { Badge } from '@/components/ui/badge';

export interface OptionCompareViewProps {
  options: EntityRecord[];
  attributeDefinitions: AttributeDefinition[];
  /** `CompiledDecisionPack.presentation`, or `null` if not yet available. */
  presentation: PresentationDefinition | null;
  selectedOptionId: string | null;
  /** Narrows which option columns render. `undefined` shows every option -- the backward-compatible default (§11 "configurable visible rows" is additive, not required). */
  visibleOptionIds?: string[];
  /** Narrows which attribute rows render (both pinned and grouped). `undefined` shows every applicable attribute. */
  visibleAttributeIds?: string[];
  /** Rendered first, ahead of the grouped table, and visually distinguished. Order follows this array, not `attributeDefinitions` order, so the caller controls pin priority. */
  pinnedAttributeIds?: string[];
  /** Caller-decided information architecture (ADR 0005 Decision 4) -- this component never calls `matchMedia`. */
  layout: 'narrow' | 'expanded';
  /** Fired when a user or WebMCP-driven caller focuses an option's column header. Shared-focus plumbing (§30) lives in the caller; this component only reports the intent. */
  onFocusOption?: (optionId: string) => void;
}

interface AttributeGroupView {
  id: string;
  label: string;
  definitions: AttributeDefinition[];
}

const FALLBACK_GROUP_ID = 'all-attributes';
const UNGROUPED_GROUP_ID = 'other-attributes';
const CUSTOM_ATTRIBUTE_ID_PREFIX = 'custom.';

/** `attributes.ts`'s `custom.` id namespace comment warns "this id is rendered directly in the generic UI" with no humanizing step -- this is the check that stops that from happening here (ADR 0005 Decision 6). */
function isCustomAttributeId(id: string): boolean {
  return id.startsWith(CUSTOM_ATTRIBUTE_ID_PREFIX);
}

/** Same fallback/grouping shape `OptionComparison.tsx` uses, operating on whatever definition subset the caller (via `visibleAttributeIds`) and pin extraction leave over -- an empty input renders no groups at all rather than one heading with zero rows underneath. */
function buildGroups(
  definitions: AttributeDefinition[],
  presentation: PresentationDefinition | null,
): AttributeGroupView[] {
  if (definitions.length === 0) return [];

  if (presentation === null || presentation.attributeGroups.length === 0) {
    return [{ id: FALLBACK_GROUP_ID, label: 'All attributes', definitions }];
  }

  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const covered = new Set<string>();
  const groups: AttributeGroupView[] = [];

  for (const group of presentation.attributeGroups) {
    const groupDefinitions = group.attributeIds
      .map((id) => byId.get(id))
      .filter((definition): definition is AttributeDefinition => definition !== undefined);
    for (const definition of groupDefinitions) covered.add(definition.id);
    if (groupDefinitions.length > 0) {
      groups.push({ id: group.id, label: group.label, definitions: groupDefinitions });
    }
  }

  const remaining = definitions.filter((definition) => !covered.has(definition.id));
  if (remaining.length > 0) {
    groups.push({ id: UNGROUPED_GROUP_ID, label: 'Other', definitions: remaining });
  }
  return groups;
}

/** `undefined` (the "show everything" default) passes `options` through untouched; otherwise re-projects to exactly the given ids, in the given order, silently dropping any id no longer present rather than crashing on stale WebMCP-supplied ids. */
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
 * Narrow layout's head-to-head selection rule (this task's own prompt asks for the reasoning to
 * be reported, so it is spelled out here too): with 2 or fewer already-visible options there is
 * nothing to choose between, so all of them show. With more than 2, shared focus (§30 -- "if
 * ChatGPT focuses RAV4, the page should visibly focus RAV4") takes priority over plain list order:
 * the currently selected option is always one of the two shown, paired with the first other option
 * in `options` order, so the pairing is deterministic and testable rather than picking "most
 * different" or similar unstated heuristics. With no selection at all, the first two in order show.
 */
function pickHeadToHeadOptions(
  options: EntityRecord[],
  selectedOptionId: string | null,
): EntityRecord[] {
  if (options.length <= 2) return options;

  const selectedIndex =
    selectedOptionId === null ? -1 : options.findIndex((option) => option.id === selectedOptionId);
  if (selectedIndex === -1) return options.slice(0, 2);

  const selected = options[selectedIndex]!;
  const other = options.find((_option, index) => index !== selectedIndex);
  return other === undefined ? [selected] : [selected, other];
}

interface CompareRowProps {
  definition: AttributeDefinition;
  pinned: boolean;
  isStriped: boolean;
  renderedOptions: EntityRecord[];
}

/** No `border-t`: alternating `bg-muted` tint (or the pinned tint) carries the row-legibility job instead, matching `OptionComparison.tsx`'s "no cell/row borders" convention. */
function CompareRow({ definition, pinned, isStriped, renderedOptions }: CompareRowProps) {
  const custom = isCustomAttributeId(definition.id);
  const rowClassName = pinned ? 'bg-[var(--color-brand-tint)]' : isStriped ? 'bg-muted' : undefined;

  return (
    <tr
      data-testid={`option-compare-view-row-${definition.id}`}
      data-pinned={pinned ? 'true' : 'false'}
      className={rowClassName}
    >
      <th
        scope="row"
        className="p-[var(--space-2)] text-[length:var(--font-size-sm)] font-normal text-[var(--color-ink-secondary)]"
      >
        <span className="inline-flex min-w-0 items-center gap-[var(--space-1)]">
          <span className="truncate">{definition.label}</span>
          {custom ? (
            <Badge
              variant="outline"
              data-testid={`option-compare-view-custom-badge-${definition.id}`}
              className="label-caps shrink-0 px-[var(--space-1)] py-0 text-[var(--color-ink-secondary)]"
              title="Added for your comparison"
            >
              Custom
            </Badge>
          ) : null}
        </span>
      </th>
      {renderedOptions.map((option) => {
        const record = option.attributes[definition.id];
        const display =
          record?.value !== undefined ? formatAttributeValue(record.value) : 'Unknown';
        return (
          <td
            key={option.id}
            data-testid={`option-compare-view-cell-${definition.id}-${option.id}`}
            className="p-[var(--space-2)] text-[length:var(--font-size-sm)]"
            style={record?.value === undefined ? { color: 'var(--color-ink-muted)' } : undefined}
          >
            {display}
          </td>
        );
      })}
    </tr>
  );
}

export function OptionCompareView({
  options,
  attributeDefinitions,
  presentation,
  selectedOptionId,
  visibleOptionIds,
  visibleAttributeIds,
  pinnedAttributeIds,
  layout,
  onFocusOption,
}: OptionCompareViewProps) {
  const displayedOptions = useMemo(
    () => narrowOptions(options, visibleOptionIds),
    [options, visibleOptionIds],
  );

  const isHeadToHead = layout === 'narrow';
  const renderedOptions = useMemo(
    () =>
      isHeadToHead ? pickHeadToHeadOptions(displayedOptions, selectedOptionId) : displayedOptions,
    [isHeadToHead, displayedOptions, selectedOptionId],
  );
  const hiddenOptionCount = displayedOptions.length - renderedOptions.length;

  const applicableDefinitions = useMemo(() => {
    const relevantKinds = new Set(options.map((option) => option.kind));
    return attributeDefinitions.filter((definition) =>
      definition.appliesTo.some((kind) => relevantKinds.has(kind)),
    );
  }, [options, attributeDefinitions]);

  const narrowedDefinitions = useMemo(() => {
    if (visibleAttributeIds === undefined) return applicableDefinitions;
    const visibleIdSet = new Set(visibleAttributeIds);
    return applicableDefinitions.filter((definition) => visibleIdSet.has(definition.id));
  }, [applicableDefinitions, visibleAttributeIds]);

  const pinnedDefinitions = useMemo(() => {
    if (pinnedAttributeIds === undefined || pinnedAttributeIds.length === 0) return [];
    const byId = new Map(narrowedDefinitions.map((definition) => [definition.id, definition]));
    return pinnedAttributeIds
      .map((id) => byId.get(id))
      .filter((definition): definition is AttributeDefinition => definition !== undefined);
  }, [narrowedDefinitions, pinnedAttributeIds]);

  const unpinnedDefinitions = useMemo(() => {
    const pinnedIdSet = new Set(pinnedDefinitions.map((definition) => definition.id));
    return narrowedDefinitions.filter((definition) => !pinnedIdSet.has(definition.id));
  }, [narrowedDefinitions, pinnedDefinitions]);

  const groups = useMemo(
    () => buildGroups(unpinnedDefinitions, presentation),
    [unpinnedDefinitions, presentation],
  );

  // A running counter over pinned rows first, then every grouped row in render
  // order, precomputed once rather than mutated during JSX (pinned rows and
  // grouped rows render from two separate `.map()` calls below).
  const stripeIndexByAttributeId = useMemo(() => {
    const map = new Map<string, number>();
    let index = 0;
    for (const definition of pinnedDefinitions) {
      map.set(definition.id, index);
      index += 1;
    }
    for (const group of groups) {
      for (const definition of group.definitions) {
        map.set(definition.id, index);
        index += 1;
      }
    }
    return map;
  }, [pinnedDefinitions, groups]);

  return (
    <section
      data-testid="option-compare-view"
      aria-labelledby="option-compare-view-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      <h2 id="option-compare-view-heading">Compare the options</h2>

      {renderedOptions.length === 0 ? (
        <p
          data-testid="option-compare-view-empty"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          Add at least one candidate to see a side-by-side comparison.
        </p>
      ) : (
        <>
          {isHeadToHead && hiddenOptionCount > 0 ? (
            <p
              data-testid="option-compare-view-narrow-note"
              className="text-[length:var(--font-size-xs)] text-[var(--color-ink-secondary)]"
            >
              Showing a head-to-head of {renderedOptions.length} of {displayedOptions.length}{' '}
              options. Switch to expanded view or narrow the comparison to see the rest.
            </p>
          ) : null}

          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={
              isHeadToHead
                ? 'Head-to-head comparison table -- scroll horizontally if needed'
                : 'Comparison table -- scroll horizontally to see every option'
            }
          >
            <table
              data-testid="option-compare-view-table"
              data-layout={layout}
              className="w-full border-collapse text-left"
            >
              <thead>
                <tr>
                  <th scope="col" className="p-[var(--space-2)] text-[length:var(--font-size-sm)]">
                    <span className="visually-hidden">Attribute</span>
                  </th>
                  {renderedOptions.map((option) => {
                    const isSelected = option.id === selectedOptionId;
                    return (
                      <th
                        key={option.id}
                        scope="col"
                        data-testid={`option-compare-view-header-${option.id}`}
                        className="p-[var(--space-2)] text-[length:var(--font-size-sm)]"
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
                          data-testid={`option-compare-view-focus-${option.id}`}
                          onClick={() => onFocusOption?.(option.id)}
                          aria-pressed={isSelected}
                          className="w-full min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-[inherit] text-[inherit]"
                        >
                          {option.label}
                          {isSelected ? (
                            <span className="label-caps ml-[var(--space-1)]">Selected</span>
                          ) : null}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {pinnedDefinitions.length > 0 ? (
                <tbody data-testid="option-compare-view-pinned">
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={renderedOptions.length + 1}
                      data-testid="option-compare-view-pinned-heading"
                      className="label-caps p-[var(--space-1)] text-[var(--color-brand-strong)]"
                    >
                      Pinned
                    </th>
                  </tr>
                  {pinnedDefinitions.map((definition) => (
                    <CompareRow
                      key={definition.id}
                      definition={definition}
                      pinned
                      isStriped={(stripeIndexByAttributeId.get(definition.id) ?? 0) % 2 === 1}
                      renderedOptions={renderedOptions}
                    />
                  ))}
                </tbody>
              ) : null}

              {groups.map((group) => (
                <tbody key={group.id}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={renderedOptions.length + 1}
                      data-testid={`option-compare-view-group-${group.id}`}
                      className="label-caps p-[var(--space-1)] text-[var(--color-ink-secondary)]"
                    >
                      {group.label}
                    </th>
                  </tr>
                  {group.definitions.map((definition) => (
                    <CompareRow
                      key={definition.id}
                      definition={definition}
                      pinned={false}
                      isStriped={(stripeIndexByAttributeId.get(definition.id) ?? 0) % 2 === 1}
                      renderedOptions={renderedOptions}
                    />
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}
    </section>
  );
}
