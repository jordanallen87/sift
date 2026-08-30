/**
 * The Board / Kanban view (docs/change-sets/2026-08-30-generic-decision-workspace.md §12) that
 * answers "Where does each option currently stand?" -- a decision-narrowing question distinct from
 * `OptionCompareView`'s "how do these options differ?" (§11) and List's "tell me about each
 * option" (§10). ADR 0005 Decision 2 states the same distinction directly: the four option views
 * are "not four cosmetic renderings of one data set" but four different decision tasks.
 *
 * Placement is entirely caller-supplied (`optionColumnIds`, a flat optionId -> columnId map)
 * rather than computed or persisted here -- this component is purely presentational (no fetching,
 * no context, no command dispatch), matching `OptionCompareView.tsx`'s contract exactly.
 * `WorkspaceViewState.board.columns[].optionIds` (packages/contracts/src/case.ts) is the eventual
 * canonical source of that placement once wired; whoever owns that wiring flattens it into this
 * simpler `optionId -> columnId` shape the same way `OptionCompareView` is handed a flat
 * `visibleOptionIds` rather than reconstructing its own narrowing.
 *
 * **Human authority (§12).** "Moving an option must preserve human authority... Do not silently
 * eliminate a candidate based solely on a model judgment." This is enforced by construction, not
 * by convention: there is no local state anywhere in this file that repositions a card. The move
 * control is fully controlled by `optionColumnIds` via props -- changing it fires
 * `onMoveOption(optionId, toColumnId)` and otherwise changes nothing on screen until the caller
 * re-renders with an updated `optionColumnIds`. That is the same "report intent, never decide"
 * shape `OptionCompareView`'s `onFocusOption` already uses.
 *
 * **"Out" is a working arrangement, not a verdict.** The default `out` column keeps the plain
 * label "Out" (the change set's own wording at §12), but carries a `hint` --
 * "Set aside for now. This is your call, not a verdict -- move it back anytime." -- rendered under
 * the column heading, because §12 requires that "an option in Out is NOT presented as objectively
 * eliminated." A caller-supplied `columns` override may supply its own `hint` (or omit one); this
 * component never invents wording for a column it did not define itself.
 *
 * **Keyboard-accessible move control is mandatory, drag is optional (§49).** "Board changes must
 * not rely solely on drag-and-drop." This implementation does not attempt drag at all -- only a
 * native `<select>` "move to..." control per card, which is fully keyboard-operable (Tab, arrow
 * keys, type-ahead, Enter) with no bespoke keyboard handling required. A plain `<select>` was
 * chosen over the Radix-backed `Select` in `components/ui/select.tsx` deliberately: the Radix
 * control renders its options list in a portal, which is unnecessary ceremony for a short,
 * same-column list of choices, and it gives component tests a real, unflaky target
 * (`userEvent.selectOptions`) instead of simulating pointer capture inside a portal.
 * `OptionCompareView.tsx`'s focus control is likewise a plain `<button>`, not a shadcn component,
 * for the same reason -- this stays consistent with that precedent.
 *
 * **Narrow-viewport layout decision (390-480px is canonical, §7/§49).** Columns scroll inside the
 * board's own horizontally-scrolling container -- the same `overflow-x-auto`-inside-its-own-
 * `role="region"` pattern `OptionCompareView.tsx`'s table wrapper and `FindingsSheet.tsx`'s Kanban
 * tab already use -- rather than stacking columns vertically. Reasoning:
 *   1. Consistency: this repository already has two established sibling components solving
 *      exactly this problem ("no horizontal PAGE overflow" while the content itself still scrolls)
 *      the same way; a third, divergent pattern (vertical stacking) would add a needless second
 *      convention for an already-solved problem.
 *   2. A Kanban board's core value is seeing several columns' relative population at a glance --
 *      "where does each option currently stand?" (§12). Vertical stacking would hide every column
 *      but the first behind a scroll; horizontal paging at least keeps column headers visible as
 *      a scroll affordance and lets a quick swipe reveal "Top choices" next to "Out".
 *   3. Each column has a fixed, modest width (well under the 390px narrow floor), so this
 *      component introduces no hard-coded width wider than the canonical narrow pane. The actual
 *      *scrolling* is real-browser layout behavior exercised by the Playwright cross-viewport
 *      suite, not something jsdom can measure -- see `narrow-viewport.tsx`'s own header comment.
 *
 * Custom (`custom.*`) attribute ids never reach visible text (the same §26 principle
 * `OptionCompareView` applies, even though board cards do not carry its "Custom" badge -- only
 * `definition.label` ever renders here); nor do raw entity or column ids -- `option.label` and
 * `column.label` render everywhere a person can read, id strings appear only inside
 * `data-testid`/`id`/`value` attributes, never as text content.
 */
import { useMemo } from 'react';
import type { AttributeDefinition, EntityRecord } from '@sift/contracts';
import { formatAttributeValue } from './attribute-value-format.js';

export interface OptionBoardColumn {
  id: string;
  label: string;
  /** Optional short clarifying caption rendered under the column heading -- used by the default "Out" column so it reads as the user's working arrangement rather than a verdict (§12). Never invented by this component; only rendered when the caller (pack, model, or the built-in default) supplies one. */
  hint?: string;
}

export interface OptionBoardViewProps {
  options: EntityRecord[];
  attributeDefinitions: AttributeDefinition[];
  /** Maps optionId -> the id of the column it currently sits in. An option with no entry, or whose entry names a column id not present in the effective `columns`, falls back to the first column -- every option renders in exactly one column, never silently dropped (§12). */
  optionColumnIds: Record<string, string>;
  /** Falls back to `DEFAULT_BOARD_COLUMNS` (Considering / Top choices / Need to verify / Out) when omitted or empty, per §12 "should be configurable where appropriate" -- a pack or the model may supply its own set. */
  columns?: OptionBoardColumn[];
  /** Maps optionId -> a short caller-supplied reason surfaced on its card (§12's "Dealer offer conflicts with advertised price"). Never invented here -- an option with no entry (or an empty string) renders no reason text at all. */
  reasons?: Record<string, string>;
  selectedOptionId: string | null;
  /** Reports an intended move. This component never applies the move itself -- see the header comment's "human authority" note; the caller decides whether/how to persist it. */
  onMoveOption: (optionId: string, toColumnId: string) => void;
  onFocusOption: (optionId: string) => void;
}

const MAX_FACTS_PER_CARD = 2;
const COLUMN_WIDTH_CLASS = 'w-[220px]';

export const DEFAULT_BOARD_COLUMNS: OptionBoardColumn[] = [
  { id: 'considering', label: 'Considering' },
  { id: 'top_choices', label: 'Top choices' },
  { id: 'need_to_verify', label: 'Need to verify' },
  {
    id: 'out',
    label: 'Out',
    hint: 'Set aside for now. This is your call, not a verdict -- move it back anytime.',
  },
];

interface OptionFact {
  id: string;
  label: string;
  display: string;
}

/**
 * "A couple of decision-relevant facts" (§12) -- the first `MAX_FACTS_PER_CARD` attribute
 * definitions, in caller-supplied `attributeDefinitions` order, that both apply to this option's
 * `kind` and have a defined value on it. Order is the caller's lever for prominence (the same
 * convention `OptionCompareView`'s `pinnedAttributeIds` uses to control row priority): put the
 * attributes that matter most for a quick glance first. Definitions with no value on this option
 * are skipped rather than shown as "Unknown" -- a compact card favors facts that are actually
 * known over an inventory of what is missing (List view, per §10, is the place for that).
 */
function pickFacts(
  option: EntityRecord,
  attributeDefinitions: AttributeDefinition[],
): OptionFact[] {
  const facts: OptionFact[] = [];
  for (const definition of attributeDefinitions) {
    if (!definition.appliesTo.includes(option.kind)) continue;
    const record = option.attributes[definition.id];
    if (record?.value === undefined) continue;
    facts.push({
      id: definition.id,
      label: definition.label,
      display: formatAttributeValue(record.value),
    });
    if (facts.length >= MAX_FACTS_PER_CARD) break;
  }
  return facts;
}

/** Resolves which of `columns` (always non-empty -- callers pass the already-defaulted list) an option currently belongs to, falling back to the first column for a missing or stale (unknown-column-id) assignment. */
function resolveColumnId(
  optionId: string,
  optionColumnIds: Record<string, string>,
  columns: OptionBoardColumn[],
): string {
  const assigned = optionColumnIds[optionId];
  if (assigned !== undefined && columns.some((column) => column.id === assigned)) {
    return assigned;
  }
  return columns[0]!.id;
}

function groupOptionsByColumn(
  options: EntityRecord[],
  optionColumnIds: Record<string, string>,
  columns: OptionBoardColumn[],
): Map<string, EntityRecord[]> {
  const groups = new Map<string, EntityRecord[]>(columns.map((column) => [column.id, []]));
  for (const option of options) {
    const columnId = resolveColumnId(option.id, optionColumnIds, columns);
    groups.get(columnId)?.push(option);
  }
  return groups;
}

export function OptionBoardView({
  options,
  attributeDefinitions,
  optionColumnIds,
  columns,
  reasons,
  selectedOptionId,
  onMoveOption,
  onFocusOption,
}: OptionBoardViewProps) {
  const effectiveColumns =
    columns !== undefined && columns.length > 0 ? columns : DEFAULT_BOARD_COLUMNS;

  const groupedOptions = useMemo(
    () => groupOptionsByColumn(options, optionColumnIds, effectiveColumns),
    [options, optionColumnIds, effectiveColumns],
  );

  return (
    <section
      data-testid="option-board-view"
      aria-labelledby="option-board-view-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      <h2 id="option-board-view-heading">Where your options stand</h2>

      <div
        data-testid="option-board-view-scroll-region"
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Board columns -- scroll horizontally to see every column"
      >
        <div className="flex gap-[var(--space-3)]">
          {effectiveColumns.map((column) => {
            const columnOptions = groupedOptions.get(column.id) ?? [];
            return (
              <div
                key={column.id}
                data-testid={`option-board-view-column-${column.id}`}
                className={`flex ${COLUMN_WIDTH_CLASS} shrink-0 flex-col gap-[var(--space-2)]`}
              >
                <div className="flex flex-col gap-[var(--space-0-5)]">
                  <h3 className="label-caps text-[var(--color-ink-secondary)]">
                    {`${column.label} (${columnOptions.length})`}
                  </h3>
                  {column.hint !== undefined ? (
                    <p
                      data-testid={`option-board-view-column-hint-${column.id}`}
                      className="text-[length:var(--font-size-xs)] text-[var(--color-ink-secondary)]"
                    >
                      {column.hint}
                    </p>
                  ) : null}
                </div>

                {columnOptions.length === 0 ? (
                  <p
                    data-testid={`option-board-view-column-empty-${column.id}`}
                    className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
                  >
                    Nothing here yet.
                  </p>
                ) : (
                  <ul
                    data-testid={`option-board-view-column-list-${column.id}`}
                    className="flex flex-col gap-[var(--space-2)]"
                  >
                    {columnOptions.map((option) => {
                      const isSelected = option.id === selectedOptionId;
                      const facts = pickFacts(option, attributeDefinitions);
                      const reason = reasons?.[option.id];
                      const moveSelectId = `option-board-view-move-select-${option.id}`;

                      return (
                        <li
                          key={option.id}
                          data-testid={`option-board-view-card-${option.id}`}
                          data-selected={isSelected ? 'true' : 'false'}
                          className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] bg-muted p-[var(--space-2)] text-[length:var(--font-size-sm)]"
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
                            data-testid={`option-board-view-focus-${option.id}`}
                            onClick={() => onFocusOption(option.id)}
                            aria-pressed={isSelected}
                            className="w-full min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-[inherit] text-[inherit]"
                          >
                            {option.label}
                            {isSelected ? (
                              <span className="label-caps ml-[var(--space-1)]">Selected</span>
                            ) : null}
                          </button>

                          {facts.length > 0 ? (
                            <ul
                              data-testid={`option-board-view-facts-${option.id}`}
                              className="flex flex-col gap-[var(--space-0-5)] text-[var(--color-ink-secondary)]"
                            >
                              {facts.map((fact) => (
                                <li key={fact.id}>
                                  {fact.label}: {fact.display}
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          {reason !== undefined && reason.length > 0 ? (
                            <p
                              data-testid={`option-board-view-reason-${option.id}`}
                              className="text-[var(--color-ink-secondary)]"
                            >
                              {reason}
                            </p>
                          ) : null}

                          <div className="flex flex-col gap-[var(--space-0-5)]">
                            <label htmlFor={moveSelectId} className="visually-hidden">
                              {`Move ${option.label} to a different column`}
                            </label>
                            <select
                              id={moveSelectId}
                              data-testid={`option-board-view-move-${option.id}`}
                              value={resolveColumnId(option.id, optionColumnIds, effectiveColumns)}
                              onChange={(event) => onMoveOption(option.id, event.target.value)}
                              className="rounded-[var(--radius-sm)] bg-card px-[var(--space-1)] py-[var(--space-0-5)] text-[length:var(--font-size-xs)]"
                            >
                              {effectiveColumns.map((targetColumn) => (
                                <option key={targetColumn.id} value={targetColumn.id}>
                                  {targetColumn.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
