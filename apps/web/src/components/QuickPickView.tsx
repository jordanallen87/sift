/**
 * Quick Pick -- the generic one-option-at-a-time triage view (change set
 * `docs/change-sets/2026-08-30-generic-decision-workspace.md` §9 "Quick Pick
 * / Swipe view"): "A single option should dominate the pane," shown with
 * "identity/label, the most decision-relevant attribute values," a
 * "WHY IT FITS" list of strengths, a "WATCH OUT" list of concerns/unknowns,
 * and three actions -- Pass / Maybe / Shortlist. §49 ("Accessibility")
 * requires that "Swipe is never gesture-only. Every action has accessible
 * controls" -- this component renders real `<button>` elements for all
 * three actions and never requires a gesture to act; a caller may layer
 * swipe gestures on top later without this component changing.
 *
 * Purely presentational, per ADR 0005 (`docs/decisions/
 * 0005-workspace-view-state-and-option-views.md`): it owns no case/command/
 * context access. `options`/`position` are supplied and controlled entirely
 * by the caller (the orchestrator that reads/writes
 * `WorkspaceViewState.quickPick.queue`/`.position` through
 * `updateSelection()` per that ADR's decision 1) -- this component never
 * advances the queue itself, it only reports the option it renders via
 * `onFocusChange` so a caller can keep shared focus (case `activeFocus` /
 * WebMCP `focusedOptionId`) in sync with what the pane actually shows.
 *
 * Reuses the same `EntityRecord`/`AttributeDefinition` consumption pattern
 * and `formatAttributeValue` formatter as `OptionComparison.tsx`, so a
 * pack-native or `custom.*` attribute renders identically in both views:
 * only `AttributeDefinition.label` is ever shown, never `definition.id` or
 * `option.id` -- change set §26/§9's "no raw internal ids in the UI" rule
 * applies here exactly as it does in the comparison table.
 *
 * "Why it fits" / "Watch out" derivation (a judgment call, since the change
 * set's own worked example -- "Strong safety evidence," "Within target
 * budget" -- states conclusions this component has no data to reach: it is
 * never given `Criterion[]` weights/targets, only `AttributeDefinition[]`,
 * so it cannot honestly know whether a given value is "good"). What it *can*
 * know honestly, from `AttributeRecord.status`
 * (`packages/contracts/src/attributes.ts`) and each definition's declared
 * `evidenceExpectation`, is how well-evidenced a value is. That becomes the
 * generic, pack-agnostic signal used here: a value whose evidence meets or
 * exceeds what its definition expects is a "why it fits" strength (a fact
 * the pane can stand behind); a value that is unknown, conflicted, or
 * under-evidenced relative to its definition's expectation is a "watch out"
 * (CLAUDE.md "the deterministic core, not an LLM, owns ... evidence
 * validity" -- this reads that validity off the persisted record, it never
 * invents it). This keeps the derivation generic across every Decision Pack
 * (§56 "Generic does not mean lowest common denominator") rather than
 * hard-coding car-shopping judgments like "excellent cargo space."
 */
import { useEffect, useMemo } from 'react';
import type {
  AttributeDefinition,
  AttributeStatus,
  EntityRecord,
  EvidenceExpectation,
} from '@sift/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatAttributeValue } from './attribute-value-format.js';

export interface QuickPickViewProps {
  /** The full triage queue, in the caller's order. Only `options[position]` is rendered -- one option dominates the pane (change set §9). */
  options: EntityRecord[];
  attributeDefinitions: AttributeDefinition[];
  /** 0-based index into `options` for the option currently on screen. `position >= options.length` (including an empty queue) renders the explicit end-of-queue state. */
  position: number;
  /** Fired with the current option's id when the user passes on it. Does not advance the queue itself -- the caller decides what happens next. */
  onPass: (optionId: string) => void;
  /** Fired with the current option's id when the user is undecided. */
  onMaybe: (optionId: string) => void;
  /** Fired with the current option's id when the user shortlists it. */
  onShortlist: (optionId: string) => void;
  /** Fired with an option's id whenever it becomes the one rendered on screen -- on mount and whenever the caller changes `position`/`options` to bring a different option into view. Never fired while the queue is empty/exhausted. */
  onFocusChange: (optionId: string) => void;
}

// Caps on the two derived lists and the attribute-highlight row, so the
// card stays compact enough to "dominate the pane" at 390px (§9) rather
// than growing without bound for an option with many attributes.
const MAX_HIGHLIGHT_ATTRIBUTES = 4;
const MAX_INSIGHT_ITEMS = 4;

/**
 * Whether `status` satisfies `expectation`'s evidence bar. `conflicted` and
 * `unknown` never satisfy any expectation -- both mean the pane cannot
 * stand behind the value. There is no `AttributeStatus` literally named
 * "corroborated" (`packages/contracts/src/attributes.ts`'s `ATTRIBUTE_STATUSES`
 * has only `asserted | supported | verified | conflicted | unknown`), so an
 * `evidenceExpectation: 'corroborated'` definition is treated the same as
 * `'source'`: satisfied by `supported` or `verified`.
 */
function meetsEvidenceExpectation(
  status: AttributeStatus,
  expectation: EvidenceExpectation,
): boolean {
  if (status === 'unknown' || status === 'conflicted') return false;
  if (expectation === 'verification') return status === 'verified';
  if (expectation === 'source' || expectation === 'corroborated') {
    return status === 'supported' || status === 'verified';
  }
  return true; // 'assertion' -- any resolved, non-conflicted value clears a mere-assertion bar.
}

interface AttributeInsight {
  definitionId: string;
  text: string;
}

function buildInsights(
  option: EntityRecord,
  applicableDefinitions: AttributeDefinition[],
): { whyItFits: AttributeInsight[]; watchOut: AttributeInsight[] } {
  const whyItFits: AttributeInsight[] = [];
  const watchOut: AttributeInsight[] = [];

  for (const definition of applicableDefinitions) {
    const record = option.attributes[definition.id];

    if (record === undefined || record.status === 'unknown') {
      watchOut.push({ definitionId: definition.id, text: `${definition.label} is still unknown` });
      continue;
    }
    if (record.status === 'conflicted') {
      watchOut.push({
        definitionId: definition.id,
        text: `${definition.label} has conflicting information`,
      });
      continue;
    }
    // Schema guarantee (`AttributeRecordSchema`'s `superRefine`): `value` is
    // present whenever `status` isn't `'unknown'`. Guarded defensively
    // rather than asserted, so a malformed record degrades to "unknown"
    // instead of throwing.
    if (record.value === undefined) {
      watchOut.push({ definitionId: definition.id, text: `${definition.label} is still unknown` });
      continue;
    }

    if (meetsEvidenceExpectation(record.status, definition.evidenceExpectation)) {
      whyItFits.push({
        definitionId: definition.id,
        text: `${definition.label}: ${formatAttributeValue(record.value)}`,
      });
    } else {
      watchOut.push({
        definitionId: definition.id,
        text: `${definition.label} still needs stronger evidence`,
      });
    }
  }

  return {
    whyItFits: whyItFits.slice(0, MAX_INSIGHT_ITEMS),
    watchOut: watchOut.slice(0, MAX_INSIGHT_ITEMS),
  };
}

export function QuickPickView({
  options,
  attributeDefinitions,
  position,
  onPass,
  onMaybe,
  onShortlist,
  onFocusChange,
}: QuickPickViewProps) {
  const currentOption = options[position] ?? null;
  const currentOptionId = currentOption?.id ?? null;

  const applicableDefinitions = useMemo(() => {
    if (currentOption === null) return [];
    const kind = currentOption.kind;
    return attributeDefinitions.filter((definition) => definition.appliesTo.includes(kind));
  }, [attributeDefinitions, currentOption]);

  // "the most decision-relevant attribute values" (§9): definitions the
  // pack marked as comparison-relevant (`comparison !== 'none'`) come
  // first; if a pack applies no comparison direction to any applicable
  // attribute (comparison isn't declared at all), fall back to the first
  // few applicable attributes so the card still shows real facts rather
  // than only the option's bare label.
  const highlightDefinitions = useMemo(() => {
    const comparisonRelevant = applicableDefinitions.filter(
      (definition) => definition.comparison !== 'none',
    );
    const source = comparisonRelevant.length > 0 ? comparisonRelevant : applicableDefinitions;
    return source.slice(0, MAX_HIGHLIGHT_ATTRIBUTES);
  }, [applicableDefinitions]);

  const { whyItFits, watchOut } = useMemo(() => {
    if (currentOption === null) return { whyItFits: [], watchOut: [] };
    return buildInsights(currentOption, applicableDefinitions);
  }, [currentOption, applicableDefinitions]);

  // Reports the option actually on screen so a caller can keep shared focus
  // (case `activeFocus`, WebMCP `focusedOptionId`) synchronized -- change
  // set §30 "WebMCP should control focus" / §59's Quick Pick shared-focus
  // demo moment. `onFocusChange` is deliberately omitted from the dependency
  // array: this project has no react-hooks lint rule to satisfy by listing
  // it, and this component must not treat every render (which may supply a
  // fresh callback identity) as a focus change -- only an actual change of
  // which option is on screen should fire it.
  useEffect(() => {
    if (currentOptionId !== null) {
      onFocusChange(currentOptionId);
    }
  }, [currentOptionId]);

  const isEndOfQueue = currentOption === null;

  return (
    <section
      data-testid="quick-pick-view"
      aria-labelledby="quick-pick-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <h2 id="quick-pick-heading" className="text-[length:var(--font-size-md)]">
          Quick Pick
        </h2>
        {!isEndOfQueue ? (
          <Badge variant="secondary" data-testid="quick-pick-position">
            {position + 1} of {options.length}
          </Badge>
        ) : null}
      </div>

      {currentOption === null ? (
        <p
          data-testid="quick-pick-end-of-queue"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          You&apos;ve been through every option in the queue.
        </p>
      ) : (
        <article
          data-testid={`quick-pick-card-${currentOption.id}`}
          className="flex flex-col gap-[var(--space-3)]"
        >
          <h3
            data-testid="quick-pick-option-label"
            className="font-[family-name:var(--font-display)] text-[length:var(--font-size-lg)] font-semibold text-foreground"
          >
            {currentOption.label}
          </h3>

          {highlightDefinitions.length > 0 ? (
            <ul data-testid="quick-pick-highlights" className="flex flex-col gap-[var(--space-1)]">
              {highlightDefinitions.map((definition) => {
                const record = currentOption.attributes[definition.id];
                const display =
                  record?.value !== undefined ? formatAttributeValue(record.value) : 'Unknown';
                return (
                  <li
                    key={definition.id}
                    data-testid={`quick-pick-highlight-${definition.id}`}
                    className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
                  >
                    <span className="text-[var(--color-ink-secondary)]">{definition.label}: </span>
                    <span
                      style={
                        record?.value === undefined
                          ? { color: 'var(--color-ink-muted)' }
                          : undefined
                      }
                    >
                      {display}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div data-testid="quick-pick-why-it-fits" className="flex flex-col gap-[var(--space-1)]">
            <h4 className="label-caps text-[var(--color-ink-secondary)]">Why it fits</h4>
            {whyItFits.length > 0 ? (
              <ul className="flex flex-col gap-[var(--space-1)]">
                {whyItFits.map((insight) => (
                  <li
                    key={insight.definitionId}
                    data-testid={`quick-pick-why-it-fits-${insight.definitionId}`}
                    className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
                  >
                    {insight.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p
                data-testid="quick-pick-why-it-fits-empty"
                className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]"
              >
                Nothing strongly supported yet.
              </p>
            )}
          </div>

          <div data-testid="quick-pick-watch-out" className="flex flex-col gap-[var(--space-1)]">
            <h4 className="label-caps text-[var(--color-ink-secondary)]">Watch out</h4>
            {watchOut.length > 0 ? (
              <ul className="flex flex-col gap-[var(--space-1)]">
                {watchOut.map((insight) => (
                  <li
                    key={insight.definitionId}
                    data-testid={`quick-pick-watch-out-${insight.definitionId}`}
                    className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
                  >
                    {insight.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p
                data-testid="quick-pick-watch-out-empty"
                className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]"
              >
                Nothing flagged.
              </p>
            )}
          </div>

          <div
            data-testid="quick-pick-actions"
            className="flex items-center justify-between gap-[var(--space-2)]"
          >
            <Button
              type="button"
              variant="secondary"
              data-testid="quick-pick-pass"
              aria-label={`Pass on ${currentOption.label}`}
              className="min-h-[var(--size-touch-target-min)]"
              onClick={() => {
                onPass(currentOption.id);
              }}
            >
              Pass
            </Button>
            <Button
              type="button"
              variant="secondary"
              data-testid="quick-pick-maybe"
              aria-label={`Maybe: ${currentOption.label}`}
              className="min-h-[var(--size-touch-target-min)]"
              onClick={() => {
                onMaybe(currentOption.id);
              }}
            >
              Maybe
            </Button>
            <Button
              type="button"
              variant="default"
              data-testid="quick-pick-shortlist"
              aria-label={`Shortlist ${currentOption.label}`}
              className="min-h-[var(--size-touch-target-min)]"
              onClick={() => {
                onShortlist(currentOption.id);
              }}
            >
              Shortlist
            </Button>
          </div>
        </article>
      )}
    </section>
  );
}
