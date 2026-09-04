/**
 * The human-facing "add note" affordance -- `CaseNote` (`packages/contracts/
 * src/case.ts`), the `note.added` event, the `addNote` command handler
 * (`apps/agent/src/services/command-service.ts`), SQLite persistence, the
 * read-only `CaseNotes` display, and the `sift_add_note` WebMCP tool
 * (`register-sift-tools.ts`) were all already built before this component
 * existed -- ChatGPT could add a note, but a person at the keyboard had no
 * way to. This form closes that gap by calling the exact same
 * `commands.addNote` a WebMCP call reaches (docs/engineering-principles.md "Visible UI controls
 * and WebMCP callbacks use the same command implementation").
 *
 * A separate component, not folded into `CaseNotes.tsx`: `CaseNotes` renders
 * `null` outright when `notes` is empty (global constraint 4) and its own
 * header comment is explicit that it "intentionally stays read-only." Its
 * empty-render contract is exactly what makes it correct to call
 * unconditionally from `App.tsx` with no wrapping/gating -- adding a form
 * inside it would force a choice between showing that form floating inside
 * an otherwise-`null` region (nothing to visually anchor it to) or teaching
 * `CaseNotes` a second "am I empty" branch it does not otherwise need. A
 * sibling form -- mirroring `CustomConcernForm`'s existing relationship to
 * the read-only regions it complements -- keeps both components single-
 * purpose and keeps the write affordance reachable regardless of whether any
 * note exists yet. `App.tsx` mounts this inside its own closed-by-default
 * `DisclosureSection`, so an empty case does not grow a permanent visible
 * empty region (task constraint) -- the row itself is the one small
 * permanent element, matching every other investigative region ("Manage
 * options," "Still checking," "Add something Sift should check").
 *
 * Only `body` is collected. `AddNoteDraftSchema` (`packages/contracts/src/
 * commands.ts`) also accepts optional `kind`/`optionIds`/`obligationId`/
 * `sourceIds`, and the command handler already defaults an omitted `kind` to
 * `'observation'` server-side -- so leaving `kind` off this form's payload
 * is not a gap, it is relying on the same default the handler already
 * guarantees. `optionIds` (linking a note to specific options) is left out
 * of this first version deliberately: modeling it well needs a real
 * multi-select over `CaseState.entities` plus its own empty/loading states,
 * which is real added complexity for a capability the task brief explicitly
 * says is optional ("a plain body is enough if linking adds real
 * complexity"). A later task can add that selector without touching this
 * command shape at all -- `note.optionIds` is already optional on the wire.
 *
 * `origin` is never sent. `AddNoteInputSchema.origin` is optional and the
 * command handler defaults a missing value to `'user'`
 * (`command-service.ts`'s `input.origin ?? 'user'`) -- exactly correct for a
 * human typing into this form. `origin: 'webmcp'` is reserved for
 * model-issued calls (`register-sift-tools.ts`); this form has no code path
 * that could set it.
 *
 * Copy constraint (task brief): a note is not evidence, so nothing here may
 * say or imply that adding one verifies anything, satisfies a question, or
 * advances readiness -- `CaseNoteSchema`'s own doc comment: adding a note
 * "never satisfies an obligation, never changes readiness ... and never
 * appears as a `Source`/`EvidenceLink`." The intro line says this outright
 * rather than leaving it to be inferred, and the success confirmation below
 * deliberately reuses `STATUS_TONE_META.neutral` (`activity-labels.ts`) --
 * the same "no status color, nothing case-domain happened" tone `neutral`
 * activity events already use -- rather than the checkmark-bearing
 * `satisfied` tone `CustomConcernForm`'s own success banner uses, since
 * `satisfied` reads as "this passed verification," which a note never does.
 */
import { useState } from 'react';
import { useSiftCommands } from '../app/AppProviders.js';
import { STATUS_TONE_META } from './activity-labels.js';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface AddNoteFormProps {
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
}

const neutralTone = STATUS_TONE_META.neutral;

export function AddNoteForm({ caseId, resolveExpectedSequence }: AddNoteFormProps) {
  const commands = useSiftCommands();
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit = body.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    // Deliberately no `origin` key here -- see this file's header comment.
    resolveExpectedSequence()
      .then((expectedSequence) =>
        commands.addNote({
          caseId,
          expectedSequence,
          note: { body: body.trim() },
        }),
      )
      .then(() => {
        setSubmitting(false);
        setSuccess(true);
        setBody('');
      })
      .catch((caught: unknown) => {
        setSubmitting(false);
        setError(caught instanceof Error ? caught.message : 'Could not add this note.');
      });
  }

  return (
    <section
      data-testid="add-note-form"
      aria-labelledby="add-note-form-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] bg-card p-[var(--space-4)]"
    >
      <div className="flex flex-col gap-[var(--space-1)]">
        <h2 id="add-note-form-heading">Add a note</h2>
        <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]">
          A note is your own observation. It won&apos;t change anything else in this case -- use it
          for what&apos;s worth remembering, not what you need Sift to confirm.
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
          <Label
            htmlFor="add-note-form-body"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            Note
          </Label>
          <Textarea
            id="add-note-form-body"
            value={body}
            disabled={submitting}
            rows={3}
            onChange={(event) => {
              setBody(event.target.value);
            }}
            className="min-h-[var(--size-touch-target-min)] border-0"
          />
        </div>

        {error ? (
          <Alert variant="destructive" data-testid="add-note-form-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <div
            role="status"
            data-testid="add-note-form-success"
            className="status-change-enter rounded-[var(--radius-md)] p-[var(--space-3)]"
            style={{ backgroundColor: neutralTone.bg, color: neutralTone.ink }}
          >
            Note added.
          </div>
        ) : null}

        <Button
          type="submit"
          data-testid="add-note-form-submit"
          aria-busy={submitting}
          disabled={!canSubmit || submitting}
          className="min-h-[var(--size-touch-target-min)]"
        >
          {submitting ? 'Adding…' : 'Add note'}
        </Button>
      </form>
    </section>
  );
}
