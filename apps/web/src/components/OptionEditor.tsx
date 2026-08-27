/**
 * Region 4, "Evidence and comparison" (docs/specs/product.md "Workspace
 * layout") -- the option-entry half. Lets the user manually add or edit up
 * to five candidate options (product.md "Explicit scope cuts": "users may
 * manually enter up to five car candidates and paste structured listing or
 * offer details"), one `DynamicAttributeField` per pack-declared or
 * case-defined (`custom.*`) attribute applicable to this option kind.
 *
 * Calls `commands.upsertOption` on the exact same `PaxCommands` instance the
 * `pax_upsert_option` WebMCP tool calls (CLAUDE.md "Visible UI controls and
 * WebMCP callbacks use the same command implementation") -- there is no
 * parallel save path.
 */
import { useMemo, useState } from 'react';
import type { AttributeDefinition, AttributeValue, EntityRecord } from '@pax/contracts';
import { usePaxCommands } from '../app/AppProviders.js';
import { DynamicAttributeField } from './DynamicAttributeField.js';

export interface OptionEditorProps {
  caseId: string;
  expectedSequence: number;
  /** The `EntityRecord.kind` this editor manages, e.g. `"car"`. */
  optionKind: string;
  /** Singular pack presentation label, e.g. `"car"` (`CompiledDecisionPack.presentation.optionLabel`). */
  optionLabel: string;
  attributeDefinitions: AttributeDefinition[];
  options: EntityRecord[];
  maxOptions?: number;
}

interface FormState {
  optionId: string | null;
  label: string;
  values: Record<string, AttributeValue | undefined>;
}

function blankForm(): FormState {
  return { optionId: null, label: '', values: {} };
}

function formFromEntity(entity: EntityRecord): FormState {
  const values: Record<string, AttributeValue | undefined> = {};
  for (const [definitionId, record] of Object.entries(entity.attributes)) {
    values[definitionId] = record.value;
  }
  return { optionId: entity.id, label: entity.label, values };
}

export function OptionEditor({
  caseId,
  expectedSequence,
  optionKind,
  optionLabel,
  attributeDefinitions,
  options,
  maxOptions = 5,
}: OptionEditorProps) {
  const commands = usePaxCommands();
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applicableDefinitions = useMemo(
    () => attributeDefinitions.filter((definition) => definition.appliesTo.includes(optionKind)),
    [attributeDefinitions, optionKind],
  );

  const atCapacity = form.optionId === null && options.length >= maxOptions;

  function startNew() {
    setForm(blankForm());
    setError(null);
  }

  function startEdit(entity: EntityRecord) {
    setForm(formFromEntity(entity));
    setError(null);
  }

  function handleSubmit() {
    if (form.label.trim().length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const attributes = Object.entries(form.values)
      .filter((entry): entry is [string, AttributeValue] => entry[1] !== undefined)
      .map(([definitionId, value]) => ({ definitionId, value }));

    commands
      .upsertOption({
        caseId,
        expectedSequence,
        ...(form.optionId !== null ? { optionId: form.optionId } : {}),
        option: { label: form.label.trim(), kind: optionKind, attributes },
      })
      .then(() => {
        setSaving(false);
        setForm(blankForm());
      })
      .catch((caught: unknown) => {
        setSaving(false);
        setError(caught instanceof Error ? caught.message : 'Could not save this option.');
      });
  }

  return (
    <section
      data-testid="option-editor"
      aria-labelledby="option-editor-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)]"
    >
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <h2 id="option-editor-heading" className="capitalize">
          {optionLabel} candidates
        </h2>
        <button
          type="button"
          data-testid="option-editor-new"
          disabled={atCapacity}
          onClick={startNew}
          className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-[var(--space-3)] text-[length:var(--font-size-sm)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Add {optionLabel}
        </button>
      </div>

      {options.length === 0 ? (
        <p
          data-testid="option-editor-empty"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          No candidates entered yet. Add up to {maxOptions} manually below.
        </p>
      ) : (
        <ul data-testid="option-editor-list" className="flex flex-col gap-[var(--space-1)]">
          {options.map((entity) => (
            <li
              key={entity.id}
              data-testid={`option-editor-option-${entity.id}`}
              className="flex items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-[var(--space-2)] py-[var(--space-1)]"
            >
              <span className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]">
                {entity.label}
              </span>
              <button
                type="button"
                data-testid={`option-editor-edit-${entity.id}`}
                onClick={() => {
                  startEdit(entity);
                }}
                className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-[var(--space-2)] text-[length:var(--font-size-xs)]"
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}

      {atCapacity ? (
        <p
          data-testid="option-editor-max-reached"
          role="status"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          You have reached the {maxOptions}-{optionLabel} demo limit. Edit an existing candidate
          instead, or exclude one to make room.
        </p>
      ) : null}

      <form
        data-testid="option-editor-form"
        className="flex flex-col gap-[var(--space-2)]"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <div className="flex flex-col gap-[var(--space-1)]">
          <label
            htmlFor="option-editor-label"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            Option label
          </label>
          <input
            id="option-editor-label"
            type="text"
            value={form.label}
            disabled={saving}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, label: event.target.value }));
            }}
            className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-2)] text-[length:var(--font-size-base)] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        {applicableDefinitions.map((definition) => (
          <DynamicAttributeField
            key={definition.id}
            definition={definition}
            value={form.values[definition.id]}
            disabled={saving}
            onChange={(value) => {
              setForm((prev) => ({ ...prev, values: { ...prev.values, [definition.id]: value } }));
            }}
          />
        ))}

        {error ? (
          <div
            role="alert"
            data-testid="option-editor-error"
            className="rounded-[var(--radius-md)] border border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)] p-[var(--space-3)] text-[var(--color-status-error-ink)]"
          >
            {error}
          </div>
        ) : null}

        <div className="flex gap-[var(--space-2)]">
          <button
            type="submit"
            data-testid="option-editor-save"
            aria-busy={saving}
            disabled={saving || form.label.trim().length === 0}
            className="min-h-[var(--size-touch-target-min)] flex-1 rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-[var(--space-3)] font-[var(--font-weight-semibold)] text-[var(--color-ink-on-brand)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : form.optionId !== null ? 'Save changes' : `Save ${optionLabel}`}
          </button>
          {form.optionId !== null ? (
            <button
              type="button"
              data-testid="option-editor-cancel"
              disabled={saving}
              onClick={startNew}
              className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-[var(--space-3)] text-[length:var(--font-size-sm)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
