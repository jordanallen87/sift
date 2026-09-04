/**
 * The consumer-surface list of `CaseNote`s attached to a case (docs/change-
 * sets/2026-08-30-generic-decision-workspace.md §28 "Notes" / §63; the
 * `CaseNote` contract, `note.added` event, and `addNote` command all built
 * by a concurrent task -- `packages/contracts/src/case.ts`,
 * `apps/agent/src/routes/commands.ts`).
 *
 * The single rule this component exists to make legible: a note is an
 * observation that has earned no evidence status. It is real, first-class
 * content ("the seat position felt wrong on the test drive," "dealer said
 * the timing belt was done at 90k") but it is not a `Source`, not a `Claim`,
 * not an `EvidenceLink` -- it never satisfies an obligation, never moves
 * readiness, and never invalidates the recommendation (`CaseNoteSchema`'s
 * own doc comment; docs/engineering-principles.md "The deterministic core, not an LLM, owns ...
 * evidence validity"). This component only renders what the canonical
 * `CaseState.notes` array already says; it has no code path that could turn
 * a note into evidence even by accident.
 *
 * Global constraint 4 ("never render what cannot be true"): renders `null`
 * outright when `notes` is empty -- not a collapsed section, not an "Add
 * your first note" placeholder card. This component intentionally stays
 * read-only: the human-facing "add note" affordance is `AddNoteForm.tsx`, a
 * sibling component `App.tsx` mounts in its own closed-by-default
 * `DisclosureSection` right after this one, precisely so the write
 * affordance stays reachable even while this component itself renders
 * nothing (see `AddNoteForm.tsx`'s own header comment for the full
 * reasoning). Both a human through that form and ChatGPT through the
 * `sift_add_note` WebMCP tool (`register-sift-tools.ts`) call the identical
 * `commands.addNote` -- this file only ever displays what either path
 * already wrote.
 *
 * "A note shows who wrote it -- human or agent -- because the difference
 * matters to a reader" (this task's brief): keyed off `CaseNote.origin`
 * (`'user'` | `'agent_proposed'`), reusing `DecisionProfileView.tsx`'s own
 * "Sift" wording for the agent side rather than a product name ("ChatGPT")
 * that would be wrong for a note a Strands specialist authored directly
 * (only WebMCP calls come from ChatGPT; `origin: 'agent_proposed'` covers
 * both).
 *
 * No raw internal id may ever appear in the rendered text (this task's
 * brief: "no custom.* ids, no commandId, no runId"). This component goes
 * further than the brief's literal list: it never renders `CaseNote.id`,
 * `obligationId`, or a raw `sourceIds` entry either -- the only id-shaped
 * data resolved into visible text is `optionIds`, and only via the real
 * option label looked up from the `options` prop; an id that cannot be
 * resolved is silently omitted rather than shown raw (the same
 * never-fabricate discipline `case-context.ts`'s bounded-list projections
 * already apply server-side).
 */
import type { CaseAttributeOrigin, CaseNote, CaseNoteKind, EntityRecord } from '@sift/contracts';
import { Badge } from '@/components/ui/badge';

export interface CaseNotesProps {
  notes: CaseNote[];
  /** Used only to resolve `CaseNote.optionIds` to a real option label -- see this file's header comment for why an unresolved id is omitted rather than shown raw. */
  options?: EntityRecord[];
}

const KIND_LABEL: Record<CaseNoteKind, string> = {
  observation: 'Observation',
  research: 'Research',
  question: 'Question',
  preference: 'Preference',
  reminder: 'Reminder',
};

/** Matches `DecisionProfileView.tsx`'s own `CRITERION_ORIGIN_LABEL` wording exactly, so "who wrote this" reads consistently across both surfaces. */
const AUTHOR_LABEL: Record<CaseAttributeOrigin, string> = {
  user: 'You',
  agent_proposed: 'Sift',
};

export function CaseNotes({ notes, options = [] }: CaseNotesProps) {
  if (notes.length === 0) {
    return null;
  }

  const optionLabelById = new Map(options.map((option) => [option.id, option.label] as const));
  // Append-only, like every other canonical case collection -- reversed so
  // the newest note reads first, matching `case-context.ts`'s own
  // `mostRecentFirst` convention for the identical WebMCP-facing projection.
  const orderedNotes = [...notes].reverse();

  return (
    <section
      data-testid="case-notes"
      aria-labelledby="case-notes-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] bg-card p-[var(--space-4)]"
    >
      <h2
        id="case-notes-heading"
        className="font-[var(--font-weight-semibold)] text-[var(--color-ink)]"
      >
        Notes
      </h2>
      <ul className="flex flex-col gap-[var(--space-2)]" data-testid="case-notes-list">
        {orderedNotes.map((note) => {
          const optionLabels = note.optionIds
            .map((optionId) => optionLabelById.get(optionId))
            .filter((label): label is string => label !== undefined);

          return (
            <li
              key={note.id}
              data-testid={`case-note-${note.id}`}
              className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] bg-secondary p-[var(--space-3)]"
            >
              <div className="flex flex-wrap items-center gap-[var(--space-1-5)]">
                <Badge
                  data-testid={`case-note-kind-${note.id}`}
                  variant="outline"
                  className="label-caps rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)] text-[var(--color-ink-secondary)]"
                >
                  {KIND_LABEL[note.kind]}
                </Badge>
                <span
                  data-testid={`case-note-author-${note.id}`}
                  className="text-[length:var(--font-size-xs)] text-[var(--color-ink-secondary)]"
                >
                  {AUTHOR_LABEL[note.origin]}
                </span>
              </div>
              <p
                data-testid={`case-note-body-${note.id}`}
                className="text-[length:var(--font-size-base)] text-[var(--color-ink)]"
              >
                {note.body}
              </p>
              {optionLabels.length > 0 ? (
                <p
                  data-testid={`case-note-options-${note.id}`}
                  className="text-[length:var(--font-size-xs)] text-[var(--color-ink-secondary)]"
                >
                  {`About ${optionLabels.join(', ')}`}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
