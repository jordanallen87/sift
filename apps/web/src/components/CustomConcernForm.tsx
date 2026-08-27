/**
 * The visible-control equivalent of the `pax_define_case_attribute` WebMCP
 * tool (docs/specs/webmcp.md "`pax_define_case_attribute`") -- lets the user
 * define a typed `custom.*` case concern the installed pack did not
 * anticipate, directly from the page rather than only through ChatGPT
 * (CLAUDE.md "Visible UI controls and WebMCP callbacks use the same command
 * implementation": both paths call `commands.defineCaseAttribute` on the
 * exact same `PaxCommands` instance).
 *
 * Fields mirror `DefineCaseAttributeInputSchema`'s `definition` shape
 * (`packages/contracts/src/commands.ts`) exactly -- id (rendered as the
 * `custom.` prefix plus an editable slug, matching `CaseAttributeIdSchema`'s
 * `custom.${slug}` template literal), label, valueType, appliesTo, optional
 * unit/allowedValues, evidenceExpectation, comparison, and a required
 * `reason` explaining why the concern matters. This form never sets
 * `origin`/`confirmation`/`proposedBy`/`createdAt` -- those are assigned by
 * the command handler, exactly as webmcp.md documents for a user-originated
 * call ("records origin `user`").
 */
import { useState } from 'react';
import {
  ATTRIBUTE_COMPARISONS,
  ATTRIBUTE_VALUE_TYPES,
  EVIDENCE_EXPECTATIONS,
  type AttributeComparison,
  type AttributeValueType,
  type EvidenceExpectation,
} from '@pax/contracts';
import { usePaxCommands } from '../app/AppProviders.js';

export interface CustomConcernFormProps {
  caseId: string;
  expectedSequence: number;
  /** Entity kinds this concern may apply to, e.g. `['car']`. */
  applicableKinds: string[];
}

const CONCERN_ID_PATTERN = /^[A-Za-z0-9_]+$/;

interface FormState {
  slug: string;
  label: string;
  valueType: AttributeValueType;
  appliesTo: string[];
  unit: string;
  allowedValues: string;
  evidenceExpectation: EvidenceExpectation;
  comparison: AttributeComparison;
  reason: string;
}

function blankForm(applicableKinds: string[]): FormState {
  return {
    slug: '',
    label: '',
    valueType: 'string',
    appliesTo: applicableKinds,
    unit: '',
    allowedValues: '',
    evidenceExpectation: 'assertion',
    comparison: 'none',
    reason: '',
  };
}

const fieldClassName =
  'min-h-[var(--size-touch-target-min)] w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-2)] text-[length:var(--font-size-base)] disabled:cursor-not-allowed disabled:opacity-60';
const labelClassName = 'text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]';

export function CustomConcernForm({
  caseId,
  expectedSequence,
  applicableKinds,
}: CustomConcernFormProps) {
  const commands = usePaxCommands();
  const [form, setForm] = useState<FormState>(() => blankForm(applicableKinds));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit =
    CONCERN_ID_PATTERN.test(form.slug) &&
    form.label.trim().length > 0 &&
    form.reason.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const allowedValues = form.allowedValues
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    commands
      .defineCaseAttribute({
        caseId,
        expectedSequence,
        definition: {
          id: `custom.${form.slug}`,
          label: form.label.trim(),
          valueType: form.valueType,
          appliesTo: form.appliesTo,
          ...(form.unit.trim().length > 0 ? { unit: form.unit.trim() } : {}),
          ...(allowedValues.length > 0 ? { allowedValues } : {}),
          evidenceExpectation: form.evidenceExpectation,
          comparison: form.comparison,
          reason: form.reason.trim(),
        },
      })
      .then(() => {
        setSubmitting(false);
        setSuccess(true);
        setForm(blankForm(applicableKinds));
      })
      .catch((caught: unknown) => {
        setSubmitting(false);
        setError(caught instanceof Error ? caught.message : 'Could not define this concern.');
      });
  }

  return (
    <section
      data-testid="custom-concern-form"
      aria-labelledby="custom-concern-form-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)]"
    >
      <div className="flex flex-col gap-[var(--space-1)]">
        <h2 id="custom-concern-form-heading">Add a concern this pack didn&apos;t anticipate</h2>
        <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]">
          Define a typed case-specific question. Pax will track it alongside the pack&apos;s own
          criteria without changing the installed Decision Pack.
        </p>
      </div>

      <form
        className="flex flex-col gap-[var(--space-2)]"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <div className="flex flex-col gap-[var(--space-1)]">
          <label htmlFor="custom-concern-form-id" className={labelClassName}>
            Concern id
          </label>
          <div className="flex items-center gap-[var(--space-1)]">
            <span className="font-[family-name:var(--font-mono)] text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]">
              custom.
            </span>
            <input
              id="custom-concern-form-id"
              type="text"
              value={form.slug}
              disabled={submitting}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, slug: event.target.value }));
              }}
              className={fieldClassName}
            />
          </div>
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <label htmlFor="custom-concern-form-label" className={labelClassName}>
            Label
          </label>
          <input
            id="custom-concern-form-label"
            type="text"
            value={form.label}
            disabled={submitting}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, label: event.target.value }));
            }}
            className={fieldClassName}
          />
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <label htmlFor="custom-concern-form-value-type" className={labelClassName}>
            Value type
          </label>
          <select
            id="custom-concern-form-value-type"
            value={form.valueType}
            disabled={submitting}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, valueType: event.target.value as AttributeValueType }));
            }}
            className={fieldClassName}
          >
            {ATTRIBUTE_VALUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <label htmlFor="custom-concern-form-unit" className={labelClassName}>
            Unit (optional)
          </label>
          <input
            id="custom-concern-form-unit"
            type="text"
            value={form.unit}
            disabled={submitting}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, unit: event.target.value }));
            }}
            className={fieldClassName}
          />
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <label htmlFor="custom-concern-form-allowed-values" className={labelClassName}>
            Allowed values (optional, comma-separated)
          </label>
          <input
            id="custom-concern-form-allowed-values"
            type="text"
            value={form.allowedValues}
            disabled={submitting}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, allowedValues: event.target.value }));
            }}
            className={fieldClassName}
          />
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <label htmlFor="custom-concern-form-evidence-expectation" className={labelClassName}>
            Evidence expectation
          </label>
          <select
            id="custom-concern-form-evidence-expectation"
            value={form.evidenceExpectation}
            disabled={submitting}
            onChange={(event) => {
              setForm((prev) => ({
                ...prev,
                evidenceExpectation: event.target.value as EvidenceExpectation,
              }));
            }}
            className={fieldClassName}
          >
            {EVIDENCE_EXPECTATIONS.map((expectation) => (
              <option key={expectation} value={expectation}>
                {expectation}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <label htmlFor="custom-concern-form-comparison" className={labelClassName}>
            Comparison
          </label>
          <select
            id="custom-concern-form-comparison"
            value={form.comparison}
            disabled={submitting}
            onChange={(event) => {
              setForm((prev) => ({
                ...prev,
                comparison: event.target.value as AttributeComparison,
              }));
            }}
            className={fieldClassName}
          >
            {ATTRIBUTE_COMPARISONS.map((comparison) => (
              <option key={comparison} value={comparison}>
                {comparison}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <label htmlFor="custom-concern-form-reason" className={labelClassName}>
            Why this matters to you
          </label>
          <textarea
            id="custom-concern-form-reason"
            value={form.reason}
            disabled={submitting}
            rows={3}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, reason: event.target.value }));
            }}
            className={fieldClassName}
          />
        </div>

        {error ? (
          <div
            role="alert"
            data-testid="custom-concern-form-error"
            className="rounded-[var(--radius-md)] border border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)] p-[var(--space-3)] text-[var(--color-status-error-ink)]"
          >
            {error}
          </div>
        ) : null}

        {success ? (
          <div
            role="status"
            data-testid="custom-concern-form-success"
            className="rounded-[var(--radius-md)] border p-[var(--space-3)]"
            style={{
              borderColor: 'var(--color-status-satisfied-border)',
              backgroundColor: 'var(--color-status-satisfied-bg)',
              color: 'var(--color-status-satisfied-ink)',
            }}
          >
            Concern added. Pax will derive an evidence question for it when one is required.
          </div>
        ) : null}

        <button
          type="submit"
          data-testid="custom-concern-form-submit"
          aria-busy={submitting}
          disabled={!canSubmit || submitting}
          className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-[var(--space-3)] font-[var(--font-weight-semibold)] text-[var(--color-ink-on-brand)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Adding…' : 'Add concern'}
        </button>
      </form>
    </section>
  );
}
