/**
 * The visible-control equivalent of the `sift_define_case_attribute` WebMCP
 * tool (docs/specs/webmcp.md "`sift_define_case_attribute`") -- lets the user
 * define a typed `custom.*` case concern the installed pack did not
 * anticipate, directly from the page rather than only through ChatGPT
 * (CLAUDE.md "Visible UI controls and WebMCP callbacks use the same command
 * implementation": both paths call `commands.defineCaseAttribute` on the
 * exact same `SiftCommands` instance).
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
 *
 * The value-type/evidence-expectation/comparison controls stay native
 * `<select>` elements rather than the shadcn `Select*` primitives: Radix's
 * `Select` renders a button-triggered floating listbox with no underlying
 * `<select>` element, which `@testing-library/user-event`'s
 * `selectOptions()` (used throughout `CustomConcernForm.test.tsx`) cannot
 * drive. They are hand-styled to the same flat `bg-muted`/`rounded-sm`
 * recipe `ui/input.tsx` uses so they read as the same family of control.
 */
import { useState } from 'react';
import {
  ATTRIBUTE_COMPARISONS,
  ATTRIBUTE_VALUE_TYPES,
  EVIDENCE_EXPECTATIONS,
  type AttributeComparison,
  type AttributeValueType,
  type EvidenceExpectation,
} from '@sift/contracts';
import { useSiftCommands } from '../app/AppProviders.js';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface CustomConcernFormProps {
  caseId: string;
  /**
   * Resolves the `expectedSequence` this write must carry, at SUBMIT time.
   *
   * A plain `expectedSequence: number` prop was a render-time value used for
   * a submit-time decision, and the gap between the two is real: the pane's
   * canonical snapshot refreshes on a coalescing throttle, so between the
   * events of a live run it is legitimately behind the server and this form
   * would send a sequence the case had already moved past -- a visible,
   * unexplainable failure for the person, on a write nothing had actually
   * invalidated. `App.tsx`'s `resolveExpectedSequence` answers with the
   * sequence the server confirms, reading it only when the client knows it
   * is behind.
   */
  resolveExpectedSequence: () => Promise<number>;
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

// Same flat recipe as ui/input.tsx's own bg-muted/rounded-sm treatment,
// applied to a native <select> -- see the file header for why this cannot
// be the shadcn Select* primitives.
const selectClassName =
  'min-h-[var(--size-touch-target-min)] h-9 w-full min-w-0 rounded-[var(--radius-sm)] border-0 bg-muted px-3 py-1 text-[length:var(--font-size-base)] outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60';
const labelClassName = 'text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]';

export function CustomConcernForm({
  caseId,
  resolveExpectedSequence,
  applicableKinds,
}: CustomConcernFormProps) {
  const commands = useSiftCommands();
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

    resolveExpectedSequence()
      .then((expectedSequence) =>
        commands.defineCaseAttribute({
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
        }),
      )
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
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] bg-card p-[var(--space-4)]"
    >
      <div className="flex flex-col gap-[var(--space-1)]">
        <h2 id="custom-concern-form-heading">Add a concern this pack didn&apos;t anticipate</h2>
        <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]">
          Define a typed case-specific question. Sift will track it alongside the pack&apos;s own
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
          <Label htmlFor="custom-concern-form-id" className={labelClassName}>
            Concern id
          </Label>
          <div className="flex items-center gap-[var(--space-1)]">
            <span className="font-[family-name:var(--font-mono)] text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]">
              custom.
            </span>
            <Input
              id="custom-concern-form-id"
              type="text"
              value={form.slug}
              disabled={submitting}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, slug: event.target.value }));
              }}
              className="min-h-[var(--size-touch-target-min)] border-0"
            />
          </div>
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <Label htmlFor="custom-concern-form-label" className={labelClassName}>
            Label
          </Label>
          <Input
            id="custom-concern-form-label"
            type="text"
            value={form.label}
            disabled={submitting}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, label: event.target.value }));
            }}
            className="min-h-[var(--size-touch-target-min)] border-0"
          />
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <Label htmlFor="custom-concern-form-value-type" className={labelClassName}>
            Value type
          </Label>
          <select
            id="custom-concern-form-value-type"
            value={form.valueType}
            disabled={submitting}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, valueType: event.target.value as AttributeValueType }));
            }}
            className={selectClassName}
          >
            {ATTRIBUTE_VALUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <Label htmlFor="custom-concern-form-unit" className={labelClassName}>
            Unit (optional)
          </Label>
          <Input
            id="custom-concern-form-unit"
            type="text"
            value={form.unit}
            disabled={submitting}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, unit: event.target.value }));
            }}
            className="min-h-[var(--size-touch-target-min)] border-0"
          />
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <Label htmlFor="custom-concern-form-allowed-values" className={labelClassName}>
            Allowed values (optional, comma-separated)
          </Label>
          <Input
            id="custom-concern-form-allowed-values"
            type="text"
            value={form.allowedValues}
            disabled={submitting}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, allowedValues: event.target.value }));
            }}
            className="min-h-[var(--size-touch-target-min)] border-0"
          />
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <Label htmlFor="custom-concern-form-evidence-expectation" className={labelClassName}>
            Evidence expectation
          </Label>
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
            className={selectClassName}
          >
            {EVIDENCE_EXPECTATIONS.map((expectation) => (
              <option key={expectation} value={expectation}>
                {expectation}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <Label htmlFor="custom-concern-form-comparison" className={labelClassName}>
            Comparison
          </Label>
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
            className={selectClassName}
          >
            {ATTRIBUTE_COMPARISONS.map((comparison) => (
              <option key={comparison} value={comparison}>
                {comparison}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <Label htmlFor="custom-concern-form-reason" className={labelClassName}>
            Why this matters to you
          </Label>
          <Textarea
            id="custom-concern-form-reason"
            value={form.reason}
            disabled={submitting}
            rows={3}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, reason: event.target.value }));
            }}
            className="min-h-[var(--size-touch-target-min)] border-0"
          />
        </div>

        {error ? (
          <Alert variant="destructive" data-testid="custom-concern-form-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <div
            role="status"
            data-testid="custom-concern-form-success"
            className="status-change-enter rounded-[var(--radius-md)] p-[var(--space-3)]"
            style={{
              backgroundColor: 'var(--color-status-satisfied-bg)',
              color: 'var(--color-status-satisfied-ink)',
            }}
          >
            Concern added. Sift will derive an evidence question for it when one is required.
          </div>
        ) : null}

        <Button
          type="submit"
          data-testid="custom-concern-form-submit"
          aria-busy={submitting}
          disabled={!canSubmit || submitting}
          className="min-h-[var(--size-touch-target-min)]"
        >
          {submitting ? 'Adding…' : 'Add concern'}
        </Button>
      </form>
    </section>
  );
}
