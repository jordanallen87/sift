/**
 * Changing what the decision weighs.
 *
 * ## Why this exists
 *
 * Both shipped packs are built around one adaptive moment: "changing the
 * criterion from lowest immediate cost to long-term waste reduction changes
 * option ranking." The engine implements it, the scoring proves it, and
 * `sift_update_criteria` exposes it to an assistant -- but until now nothing
 * on the page could do it. Both demo scripts said so in writing and routed
 * around it through DevTools or by asking ChatGPT, which meant the single
 * most important control in the product was the one a person could not
 * reach.
 *
 * ## Why a form and not a live slider
 *
 * Every weight change invalidates the recommendation and reopens the
 * synthesis obligation, so a control that wrote on each keystroke would fire
 * a burst of commands and leave the case churning through invalidations
 * nobody asked for. Weights are edited locally and committed once, which is
 * also what makes the diff meaningful: only criteria the person actually
 * moved are sent.
 *
 * ## Protected criteria
 *
 * A pack can mark a criterion protected -- Home Energy Guardian's emergency
 * gate is one -- and the command layer rejects reweighting it. Rendering it
 * as a disabled input would invite the person to try and then explain the
 * refusal after the fact, so it is shown as what it is: a stated constraint,
 * not a control. `docs/specs/product.md`'s "Empty regions" rule is the same
 * idea applied to whole regions.
 *
 * ## The total
 *
 * Weights are relative, so a number means nothing without the pool it is
 * measured against. The running total is shown for the same reason the
 * recommendation reports coverage: a person changing one number needs to see
 * what it is now a share of. It is deliberately not normalized or corrected
 * automatically -- the core scores against whatever weights the case
 * actually holds, and silently rescaling them here would make the displayed
 * number differ from the one doing the work.
 */
import { useState } from 'react';
import type { Criterion } from '@sift/contracts';
import { useSiftCommands } from '../app/AppProviders.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

export interface CriteriaEditorProps {
  caseId: string;
  /** The case's current criteria, in the case's own order. */
  criteria: readonly Criterion[];
  /** Criterion ids the pinned pack forbids reweighting. */
  protectedCriterionIds: readonly string[];
  /**
   * Resolves `expectedSequence` at SUBMIT time, not render time -- the same
   * contract `CustomConcernForm` documents. A weight edited during a live
   * run would otherwise carry a sequence the case had already moved past.
   */
  resolveExpectedSequence: () => Promise<number>;
  /** Called after a successful write, so a host sheet can close itself. */
  onDone?: () => void;
}

/** Only `active` preference criteria carry weight in the score. */
function isReweightable(criterion: Criterion, protectedIds: readonly string[]): boolean {
  return (
    criterion.kind === 'preference' &&
    criterion.status === 'active' &&
    !protectedIds.includes(criterion.id)
  );
}

export function CriteriaEditor({
  caseId,
  criteria,
  protectedCriterionIds,
  resolveExpectedSequence,
  onDone,
}: CriteriaEditorProps): React.JSX.Element {
  const commands = useSiftCommands();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = criteria.filter((criterion) => isReweightable(criterion, protectedCriterionIds));
  const locked = criteria.filter(
    (criterion) =>
      criterion.status === 'active' && !isReweightable(criterion, protectedCriterionIds),
  );

  const weightOf = (criterion: Criterion): number => {
    const entry = draft[criterion.id];
    if (entry === undefined || entry.trim() === '') return criterion.weight;
    const parsed = Number.parseInt(entry, 10);
    return Number.isNaN(parsed) ? criterion.weight : parsed;
  };

  // Only what actually moved. A person who opens this, looks, and saves has
  // changed nothing, and should not generate a command that invalidates
  // their recommendation for no reason. Computed inline rather than
  // memoised: it is a filter over a handful of criteria, and a memo here
  // would cost more in dependency correctness than it saves in work.
  const changed = editable
    .map((criterion) => ({ criterion, weight: weightOf(criterion) }))
    .filter(({ criterion, weight }) => weight !== criterion.weight);

  const total = editable.reduce((sum, criterion) => sum + weightOf(criterion), 0);
  const outOfRange = changed.some(
    ({ weight }) => !Number.isInteger(weight) || weight < 0 || weight > 100,
  );
  const canSubmit = changed.length > 0 && !outOfRange && !submitting;

  function handleSubmit(): void {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    resolveExpectedSequence()
      .then((expectedSequence) =>
        commands.updateCriteria({
          caseId,
          expectedSequence,
          operations: changed.map(({ criterion, weight }) => ({
            op: 'reweight' as const,
            criterionId: criterion.id,
            weight,
          })),
        }),
      )
      .then(() => {
        setSubmitting(false);
        setDraft({});
        onDone?.();
      })
      .catch((cause: unknown) => {
        setSubmitting(false);
        setError(cause instanceof Error ? cause.message : 'The reweight could not be saved.');
      });
  }

  return (
    <div data-testid="criteria-editor" className="flex flex-col gap-[var(--space-4)]">
      <p className="text-sm text-muted-foreground">
        These weights decide how options are ranked. Changing one re-scores the comparison and asks
        the specialists to reconsider their recommendation.
      </p>

      <ul className="flex flex-col gap-[var(--space-3)]">
        {editable.map((criterion) => (
          <li key={criterion.id} className="flex items-center gap-[var(--space-3)]">
            <Label
              htmlFor={`criteria-weight-${criterion.id}`}
              className="min-w-0 flex-1 truncate font-normal"
            >
              {criterion.label}
            </Label>
            <Input
              id={`criteria-weight-${criterion.id}`}
              data-testid={`criteria-editor-weight-${criterion.id}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              className="w-20 shrink-0 text-right"
              value={draft[criterion.id] ?? String(criterion.weight)}
              onChange={(event) => {
                const { value } = event.target;
                setDraft((current) => ({ ...current, [criterion.id]: value }));
              }}
            />
          </li>
        ))}
      </ul>

      <p data-testid="criteria-editor-total" className="text-sm text-muted-foreground">
        Weights total <span className="font-medium text-foreground">{total}</span>.
      </p>

      {locked.length > 0 ? (
        <ul className="flex flex-col gap-[var(--space-2)]">
          {locked.map((criterion) => (
            <li
              key={criterion.id}
              data-testid={`criteria-editor-protected-${criterion.id}`}
              className="text-sm text-muted-foreground"
            >
              <span className="font-medium text-foreground">{criterion.label}</span> is set by the
              pack and cannot be reweighted.
            </li>
          ))}
        </ul>
      ) : null}

      {outOfRange ? (
        <Alert variant="destructive">
          <AlertDescription>A weight has to be a whole number between 0 and 100.</AlertDescription>
        </Alert>
      ) : null}

      {error !== null ? (
        <Alert variant="destructive" data-testid="criteria-editor-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        data-testid="criteria-editor-save"
        disabled={!canSubmit}
        onClick={handleSubmit}
        className="self-start"
      >
        {submitting ? 'Saving…' : 'Save weights'}
      </Button>
    </div>
  );
}
