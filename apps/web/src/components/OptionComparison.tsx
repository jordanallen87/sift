/**
 * Region 4, "Evidence and comparison" (docs/specs/product.md "Workspace
 * layout") -- the side-by-side comparison half, driven by pack presentation
 * metadata ("`optionLabel`, `optionLabelPlural`, `attributeGroups`",
 * `packages/contracts/src/packs.ts` `PresentationDefinitionSchema`): a
 * generic, pack-agnostic table (pack-authoring.md's "generic UI
 * renderability" requirement) rather than a car-purchase-specific layout, so
 * the same component renders Home Energy Guardian's option kind (or any
 * future pack) without change.
 *
 * `presentation` is nullable: a caller may not yet have fetched the compiled
 * pack's presentation metadata (e.g. before `GET /api/packs` resolves).
 * Without it, every applicable attribute renders under one flat "All
 * attributes" group rather than blocking the comparison entirely -- a
 * missing grouping hint degrades gracefully, it does not hide data.
 *
 * Purely presentational: it never computes ranking or scores itself (CLAUDE.md
 * "The deterministic core, not an LLM, owns case state") -- it renders each
 * option's already-persisted `EntityRecord.attributes` values as given.
 */
import { useMemo } from 'react';
import type { AttributeDefinition, EntityRecord, PresentationDefinition } from '@pax/contracts';
import { formatAttributeValue } from './attribute-value-format.js';

export interface OptionComparisonProps {
  options: EntityRecord[];
  attributeDefinitions: AttributeDefinition[];
  /** `CompiledDecisionPack.presentation`, or `null` if not yet available. */
  presentation: PresentationDefinition | null;
  selectedOptionId: string | null;
}

interface AttributeGroupView {
  id: string;
  label: string;
  definitions: AttributeDefinition[];
}

const FALLBACK_GROUP_ID = 'all-attributes';
const UNGROUPED_GROUP_ID = 'other-attributes';

function buildGroups(
  applicableDefinitions: AttributeDefinition[],
  presentation: PresentationDefinition | null,
): AttributeGroupView[] {
  if (presentation === null || presentation.attributeGroups.length === 0) {
    return [{ id: FALLBACK_GROUP_ID, label: 'All attributes', definitions: applicableDefinitions }];
  }

  const byId = new Map(applicableDefinitions.map((definition) => [definition.id, definition]));
  const covered = new Set<string>();
  const groups: AttributeGroupView[] = [];

  for (const group of presentation.attributeGroups) {
    const definitions = group.attributeIds
      .map((id) => byId.get(id))
      .filter((definition): definition is AttributeDefinition => definition !== undefined);
    for (const definition of definitions) covered.add(definition.id);
    if (definitions.length > 0) {
      groups.push({ id: group.id, label: group.label, definitions });
    }
  }

  const remaining = applicableDefinitions.filter((definition) => !covered.has(definition.id));
  if (remaining.length > 0) {
    groups.push({ id: UNGROUPED_GROUP_ID, label: 'Other', definitions: remaining });
  }
  return groups;
}

export function OptionComparison({
  options,
  attributeDefinitions,
  presentation,
  selectedOptionId,
}: OptionComparisonProps) {
  const applicableDefinitions = useMemo(() => {
    const relevantKinds = new Set(options.map((option) => option.kind));
    return attributeDefinitions.filter((definition) =>
      definition.appliesTo.some((kind) => relevantKinds.has(kind)),
    );
  }, [options, attributeDefinitions]);

  const groups = useMemo(
    () => buildGroups(applicableDefinitions, presentation),
    [applicableDefinitions, presentation],
  );

  return (
    <section
      data-testid="option-comparison"
      aria-labelledby="option-comparison-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)]"
    >
      <h2 id="option-comparison-heading">Comparison</h2>

      {options.length === 0 ? (
        <p
          data-testid="option-comparison-empty"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          Add at least one candidate to see a side-by-side comparison.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="option-comparison-table" className="w-full border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="p-[var(--space-2)] text-[length:var(--font-size-sm)]">
                  <span className="visually-hidden">Attribute</span>
                </th>
                {options.map((option) => {
                  const isSelected = option.id === selectedOptionId;
                  return (
                    <th
                      key={option.id}
                      scope="col"
                      data-testid={`option-comparison-header-${option.id}`}
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
                      {option.label}
                      {isSelected ? (
                        <span className="label-caps ml-[var(--space-1)]">Selected</span>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.id}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={options.length + 1}
                    data-testid={`option-comparison-group-${group.id}`}
                    className="label-caps p-[var(--space-1)] text-[var(--color-ink-secondary)]"
                  >
                    {group.label}
                  </th>
                </tr>
                {group.definitions.map((definition) => (
                  <tr
                    key={definition.id}
                    data-testid={`option-comparison-row-${definition.id}`}
                    className="border-t border-[var(--color-border-subtle)]"
                  >
                    <th
                      scope="row"
                      className="p-[var(--space-2)] text-[length:var(--font-size-sm)] font-normal text-[var(--color-ink-secondary)]"
                    >
                      {definition.label}
                    </th>
                    {options.map((option) => {
                      const record = option.attributes[definition.id];
                      const display =
                        record?.value !== undefined
                          ? formatAttributeValue(record.value)
                          : 'Unknown';
                      return (
                        <td
                          key={option.id}
                          data-testid={`option-comparison-cell-${definition.id}-${option.id}`}
                          className="p-[var(--space-2)] text-[length:var(--font-size-sm)]"
                          style={
                            record?.value === undefined
                              ? { color: 'var(--color-ink-muted)' }
                              : undefined
                          }
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}
