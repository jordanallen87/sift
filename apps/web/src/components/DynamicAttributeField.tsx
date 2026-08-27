/**
 * A single form control for one pack-defined or case-defined `AttributeValue`
 * variant (`packages/contracts/src/attributes.ts`), keyed off an
 * `AttributeDefinition`'s `valueType`. Used by `OptionEditor.tsx` to collect
 * each attribute of a manually-entered option, matching pack-authoring.md's
 * "Typed core with extensible domain data": the same ten-variant
 * `AttributeValue` union the WebMCP `pax_upsert_option` tool accepts is what
 * this field produces, so a value entered through the visible form and one
 * supplied by ChatGPT are structurally identical.
 *
 * Purely controlled: `value`/`onChange` are the only state this component
 * owns nothing beyond local text buffering for the two multi-part variants
 * (`range`, `string_list`) that need to compose several raw inputs into one
 * `AttributeValue` before calling `onChange`. Emits `undefined` (not a
 * value with an empty string) when a required raw input is cleared, so a
 * caller can tell "not filled in yet" apart from "filled in with an empty
 * string" -- pack-authoring.md's evidence-status model treats an absent
 * value as `unknown`, never a placeholder empty string.
 */
import type { ChangeEvent } from 'react';
import type { AttributeDefinition, AttributeValue, DurationUnit } from '@pax/contracts';

export interface DynamicAttributeFieldProps {
  definition: AttributeDefinition;
  value: AttributeValue | undefined;
  onChange: (value: AttributeValue | undefined) => void;
  /** Overrides the generated input id (defaults to `dynamic-attribute-field-${definition.id}`); pass when a caller needs a stable, predictable id (e.g. multiple attributes rendered in a list keyed by index). */
  id?: string;
  disabled?: boolean;
}

const DURATION_UNITS: readonly DurationUnit[] = ['minute', 'hour', 'day', 'month', 'year'];

function toNumberOrUndefined(raw: string): number | undefined {
  if (raw.trim().length === 0) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fieldClassName(): string {
  return 'min-h-[var(--size-touch-target-min)] w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-2)] text-[length:var(--font-size-base)] disabled:cursor-not-allowed disabled:opacity-60';
}

export function DynamicAttributeField({
  definition,
  value,
  onChange,
  id,
  disabled = false,
}: DynamicAttributeFieldProps) {
  const fieldId = id ?? `dynamic-attribute-field-${definition.id}`;
  const labelClassName = 'text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]';

  function renderControl() {
    switch (definition.valueType) {
      case 'string': {
        const current = value?.type === 'string' ? value.value : '';
        return (
          <input
            id={fieldId}
            type="text"
            value={current}
            disabled={disabled}
            className={fieldClassName()}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const raw = event.target.value;
              onChange(raw.length === 0 ? undefined : { type: 'string', value: raw });
            }}
          />
        );
      }
      case 'text': {
        const current = value?.type === 'text' ? value.value : '';
        return (
          <textarea
            id={fieldId}
            value={current}
            disabled={disabled}
            rows={3}
            className={fieldClassName()}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              const raw = event.target.value;
              onChange(raw.length === 0 ? undefined : { type: 'text', value: raw });
            }}
          />
        );
      }
      case 'number': {
        const current = value?.type === 'number' ? String(value.value) : '';
        return (
          <input
            id={fieldId}
            type="number"
            value={current}
            disabled={disabled}
            className={fieldClassName()}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const parsed = toNumberOrUndefined(event.target.value);
              if (parsed === undefined) {
                onChange(undefined);
                return;
              }
              onChange(
                definition.unit !== undefined
                  ? { type: 'number', value: parsed, unit: definition.unit }
                  : { type: 'number', value: parsed },
              );
            }}
          />
        );
      }
      case 'money': {
        const amount = value?.type === 'money' ? String(value.amount) : '';
        const currency = value?.type === 'money' ? value.currency : 'USD';
        return (
          <div className="flex gap-[var(--space-2)]">
            <input
              id={fieldId}
              aria-label={`${definition.label} amount`}
              type="number"
              value={amount}
              disabled={disabled}
              className={fieldClassName()}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const parsed = toNumberOrUndefined(event.target.value);
                if (parsed === undefined) {
                  onChange(undefined);
                  return;
                }
                onChange({ type: 'money', amount: parsed, currency: currency || 'USD' });
              }}
            />
            <input
              aria-label={`${definition.label} currency`}
              type="text"
              maxLength={3}
              value={currency}
              disabled={disabled}
              className={`${fieldClassName()} w-20 uppercase`}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                // Reflects exactly what was typed (uppercased), including a
                // transiently empty or fewer-than-3-letter value while the
                // user is still typing -- silently substituting 'USD' back
                // on every keystroke (as an earlier version of this handler
                // did) made the field impossible to clear and retype,
                // since `maxLength={3}` then blocked any further input.
                // `MoneyAttributeValueSchema`'s three-letter-code
                // requirement is enforced downstream at submit time by the
                // real schema, exactly like any other in-progress form
                // field.
                if (value?.type === 'money') {
                  onChange({ ...value, currency: event.target.value.toUpperCase() });
                }
              }}
            />
          </div>
        );
      }
      case 'boolean': {
        const checked = value?.type === 'boolean' ? value.value : false;
        return (
          <input
            id={fieldId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            className="h-[var(--space-4)] w-[var(--space-4)]"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onChange({ type: 'boolean', value: event.target.checked });
            }}
          />
        );
      }
      case 'date': {
        const current = value?.type === 'date' ? value.value : '';
        return (
          <input
            id={fieldId}
            type="date"
            value={current}
            disabled={disabled}
            className={fieldClassName()}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const raw = event.target.value;
              onChange(raw.length === 0 ? undefined : { type: 'date', value: raw });
            }}
          />
        );
      }
      case 'duration': {
        const amount = value?.type === 'duration' ? String(value.amount) : '';
        const unit = value?.type === 'duration' ? value.unit : 'day';
        return (
          <div className="flex gap-[var(--space-2)]">
            <input
              id={fieldId}
              aria-label={`${definition.label} amount`}
              type="number"
              min={0}
              value={amount}
              disabled={disabled}
              className={fieldClassName()}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const parsed = toNumberOrUndefined(event.target.value);
                if (parsed === undefined) {
                  onChange(undefined);
                  return;
                }
                onChange({ type: 'duration', amount: parsed, unit });
              }}
            />
            <select
              aria-label={`${definition.label} unit`}
              value={unit}
              disabled={disabled}
              className={fieldClassName()}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const nextUnit = event.target.value as DurationUnit;
                if (value?.type === 'duration') {
                  onChange({ ...value, unit: nextUnit });
                }
              }}
            >
              {DURATION_UNITS.map((durationUnit) => (
                <option key={durationUnit} value={durationUnit}>
                  {durationUnit}
                </option>
              ))}
            </select>
          </div>
        );
      }
      case 'enum': {
        const current = value?.type === 'enum' ? value.value : '';
        const options = definition.allowedValues ?? [];
        return (
          <select
            id={fieldId}
            value={current}
            disabled={disabled}
            className={fieldClassName()}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              const raw = event.target.value;
              onChange(raw.length === 0 ? undefined : { type: 'enum', value: raw });
            }}
          >
            <option value="">Select…</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      }
      case 'range': {
        const minimum = value?.type === 'range' ? value.minimum : undefined;
        const maximum = value?.type === 'range' ? value.maximum : undefined;
        return (
          <div className="flex gap-[var(--space-2)]">
            <input
              id={fieldId}
              aria-label={`${definition.label} minimum`}
              type="number"
              value={minimum ?? ''}
              disabled={disabled}
              className={fieldClassName()}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const parsedMin = toNumberOrUndefined(event.target.value);
                if (parsedMin === undefined && maximum === undefined) {
                  onChange(undefined);
                  return;
                }
                onChange({
                  type: 'range',
                  ...(parsedMin !== undefined ? { minimum: parsedMin } : {}),
                  ...(maximum !== undefined ? { maximum } : {}),
                  ...(definition.unit !== undefined ? { unit: definition.unit } : {}),
                });
              }}
            />
            <input
              aria-label={`${definition.label} maximum`}
              type="number"
              value={maximum ?? ''}
              disabled={disabled}
              className={fieldClassName()}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const parsedMax = toNumberOrUndefined(event.target.value);
                if (minimum === undefined && parsedMax === undefined) {
                  onChange(undefined);
                  return;
                }
                onChange({
                  type: 'range',
                  ...(minimum !== undefined ? { minimum } : {}),
                  ...(parsedMax !== undefined ? { maximum: parsedMax } : {}),
                  ...(definition.unit !== undefined ? { unit: definition.unit } : {}),
                });
              }}
            />
          </div>
        );
      }
      case 'string_list': {
        const current = value?.type === 'string_list' ? value.values.join('\n') : '';
        return (
          <textarea
            id={fieldId}
            value={current}
            disabled={disabled}
            rows={3}
            placeholder="One item per line"
            className={fieldClassName()}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              const values = event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
              onChange(values.length === 0 ? undefined : { type: 'string_list', values });
            }}
          />
        );
      }
    }
  }

  return (
    <div
      data-testid={`dynamic-attribute-field-${definition.id}`}
      className="flex flex-col gap-[var(--space-1)]"
    >
      <label htmlFor={fieldId} className={labelClassName}>
        {definition.label}
      </label>
      {renderControl()}
    </div>
  );
}
