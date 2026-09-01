/**
 * The product-detail surface for ONE option -- the human counterpart to the
 * `sift_get_option_details` WebMCP tool, which has been handing ChatGPT a
 * complete per-option profile that a person had no way to see.
 *
 * ## Why this exists, in the project owner's own words
 *
 * > "the way you have these grids setup - it's cramming a lot of information
 * > in them when we should keep that focused and keep the extra detail in the
 * > profiles."
 *
 * The browse views are the index; this is the detail page. Everything that
 * made a card a wall of text -- every attribute rather than a prominent few,
 * the full provenance behind each value, the research and sources behind the
 * option, the notes attached to it -- lives here, where a person came
 * deliberately to read it.
 *
 * ## What is genuinely new on screen
 *
 * `AttributeRecord` (`packages/contracts/src/attributes.ts`) carries eight
 * fields. Before this component, the workspace rendered two: `value`, and
 * `status` used invisibly to sort a fact into a bucket. `origin`,
 * `confidence`, `updatedAt`, and `sourceIds` were displayed nowhere at all,
 * so a person could see "$33,291.30" but never "stated by Sift from one
 * directory entry, not independently checked, last touched in August."
 * **That gap is the reason this sheet exists**, which is why the provenance
 * line under each value is the most carefully worded thing in the file:
 *
 *  - Statuses are rendered as sentences a person can act on, never as the
 *    raw enum names (`asserted`, `agent_proposed`) the contract uses.
 *  - `status: null` and `status: 'unknown'` read as two clearly different
 *    facts. They ARE two different facts -- no entry at all, versus an entry
 *    that records that nobody knows -- and CLAUDE.md's "never fabricate"
 *    makes flattening them into one "Unknown" a defect, not a copy nit. See
 *    `NO_RECORD_SENTENCE`/`UNKNOWN_SENTENCE` below.
 *  - `confidence` renders only where a record actually carries one. A
 *    default would be an invented number.
 *  - An under-evidenced value says what the case expects of it, so
 *    "needs a closer look" is explicable rather than a verdict from nowhere.
 *
 * `Recommendation.favoredOptionId` gets its first non-test render here too:
 * until now the recommendation never visually named the option it favored.
 *
 * ## State the exception, not the rule
 *
 * The first version of this file printed that full provenance under EVERY
 * row, and measuring it against the real seeded case showed it had simply
 * moved the cramming one level down: 30 rows for one option, of which 18
 * rendered the byte-identical sentence "Stated, not independently checked.
 * Came with this pack." and 29 rendered the same "Last updated" date -- a
 * 3858px scroll in a 749px viewport, every line individually true and the
 * set carrying almost no information per line. That is the same defect as
 * the old List card's six consecutive "still needs stronger evidence"
 * bullets, which is exactly what this task exists to end.
 *
 * So the provenance is stated once and then only departed from:
 *
 *  1. `findDominantProvenance` groups every row by what it would ACTUALLY
 *     RENDER -- status, origin, `updatedAt`, and the expectation sentence --
 *     and picks the largest group, but only when it covers a real majority
 *     of the rows (see `MIN_DOMINANT_ROWS` and the `> half` test). Grouping
 *     on the rendered output rather than on the enums is what lets rows
 *     whose `evidenceExpectation` is `source` and rows whose expectation is
 *     `corroborated` share one group: the two produce one identical
 *     sentence, so on screen they genuinely are one thing. In that same
 *     seeded option the groups come out 18 / 9 / 2 / 1.
 *  2. That group is stated once, above the rows, as a quiet summary line.
 *     It is literally true of every row it covers BY CONSTRUCTION -- the
 *     rows were grouped by equality of exactly the facts the line asserts,
 *     so it cannot drift into describing rows it does not cover.
 *  3. A covered row shows only its label, value, and a compact text status
 *     marker. No sentence, no timestamp.
 *  4. A row that differs shows precisely the parts that differ, and nothing
 *     it shares with the summary. Those rows are what a person is scanning
 *     for, and they now stand out instead of being buried among identical
 *     siblings.
 *
 * Two invariants hold this together and are separately tested:
 *
 *  - **`status: null` and `status: 'unknown'` can never be summarized
 *    away.** Both are structurally ineligible to form or join a dominant
 *    group (`readProvenance`'s `eligible`), so they always print their own
 *    full, distinct sentence. An absence is the single most important thing
 *    a detail view has to be honest about; it is never "the rule."
 *  - **No plausible-looking summary of a split field.** When no group
 *    reaches a majority, there is no summary line at all and every row is
 *    annotated in full -- a legend true of half the rows would be worse
 *    than no legend.
 *
 * The status marker is text, never colour alone (design-system.md: "Never
 * colour-only"), so a covered row still says what it is.
 *
 * ## Pack-agnostic by construction
 *
 * Nothing here names a domain. Headings come from the pack's own
 * `attributeGroups`; every generic noun comes from
 * `PresentationDefinition.optionLabel` (falling back to a neutral word
 * before a pack resolves); every value goes through the shared
 * `formatAttributeValue`. The same sheet serves a pack about anything.
 *
 * ## Shape and scope
 *
 * `ui/sheet.tsx` already renders as a bottom sheet at the canonical
 * <=480px pane and as a centred dialog past `global.css`'s own `min-[481px]`
 * boundary, so this component takes no `layout` prop and never calls
 * `matchMedia` -- exactly the reasoning `FilterSheet.tsx` records. The only
 * width-conditional rule here is the attribute row's own label/value
 * columns, which use that same established breakpoint.
 *
 * Purely presentational, like every sibling leaf: no context, no fetching,
 * no command calls, no local state. It renders `deriveOptionProfile`'s
 * output and nothing else -- opening a profile is a way of LOOKING at an
 * option, never a change to it (change-set §54 / ADR 0005 decision 1).
 */
import type {
  AttributeOrigin,
  AttributeStatus,
  CaseAttributeOrigin,
  CaseNoteKind,
  Claim,
  EvidenceExpectation,
  PresentationDefinition,
  Source,
  SourceVerification,
} from '@sift/contracts';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';
import { MarkdownText } from './MarkdownText.js';
import type {
  OptionProfile,
  OptionProfileAttribute,
  OptionSignalCounts,
} from './option-profile.js';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface OptionProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `deriveOptionProfile(...)`'s output. `null` when no option is selected, or when the selected id matches no entity -- render nothing rather than an empty shell. */
  profile: OptionProfile | null;
  /** The active pack's `PresentationDefinition`, for `optionLabel` in headings. `null` before a pack resolves. */
  presentation: PresentationDefinition | null;
}

/**
 * The generic noun used before a pack resolves. Deliberately the product's
 * own vocabulary for the thing being decided between, not a domain word --
 * this file must read correctly for a pack about apartments, contractors, or
 * energy plans without a single edit.
 */
const FALLBACK_OPTION_NOUN = 'option';

const NO_VALUE_TEXT = 'No value recorded';

/**
 * The two sentences this whole surface turns on.
 *
 * `option-profile.ts` keeps `status: null` (this option has no
 * `AttributeRecord` for the definition at all) apart from
 * `status: 'unknown'` (a real record whose declared status is that the value
 * is not known), and both are honest, DIFFERENT answers to "what do we know
 * here?". One means nobody has looked; the other means the case looked and
 * wrote down that it does not know. Rendering both as "Unknown" would throw
 * away the distinction the contract went to the trouble of preserving, which
 * is exactly the fabrication CLAUDE.md forbids.
 */
const NO_RECORD_SENTENCE = 'Not recorded — this case has no entry for this detail at all.';
const UNKNOWN_SENTENCE =
  'Entered as unknown — this case has an entry here, and it records that nobody knows the value yet.';

/**
 * `AttributeStatus` in plain language. Each phrase says what a reader can do
 * with the value, not which enum member produced it.
 *
 * `supported` deliberately says "evidence on file" rather than naming a
 * source count: `sourceIds` is not schema-enforced to be non-empty for a
 * supported record, and the citation line below already shows the real
 * sources when there are any. Claiming "backed by a cited source" on a
 * record that cites nothing would be an invented fact.
 */
const STATUS_SENTENCE: Record<AttributeStatus, string> = {
  asserted: 'Stated, not independently checked.',
  supported: 'Supported by evidence on file.',
  verified: 'Independently verified.',
  conflicted: 'Conflicting information — this value is disputed.',
  unknown: UNKNOWN_SENTENCE,
};

/**
 * Who put the record in the case (`AttributeRecord.origin`).
 *
 * "Added by you" matches `DecisionProfileView.tsx`'s own origin wording. The
 * agent side deliberately says "Recorded by Sift" rather than that file's
 * "Suggested by Sift": a `Criterion` a model proposes is a suggestion
 * awaiting the human's OK, whereas an attribute record is simply data Sift
 * wrote into the case -- and this same phrase has to read correctly on an
 * `unknown` record, where "suggested" would describe nothing.
 */
const ORIGIN_SENTENCE: Record<AttributeOrigin, string> = {
  pack: 'Came with this pack.',
  user: 'Added by you.',
  agent_proposed: 'Recorded by Sift.',
};

/**
 * What the pack expects before a value can be leaned on -- a neutral
 * statement of the bar, true whether or not the value has cleared it.
 *
 * It is stated for every row that HAS a value, not only for the ones falling
 * short, because that is what makes the dominant-case suppression below
 * airtight: a covered row hides only text the summary line reproduces
 * verbatim, so a row can never go quiet about a bar that differs from the
 * one stated above it. (The earlier "only when short" rule had the opposite
 * property -- a row whose bar was simply lower would have rendered
 * identically to one the summary described, and silently inherited a claim
 * that was not true of it.) Whether the bar is MET is carried by the status
 * marker and sentence, which is where a verdict belongs.
 *
 * `corroborated` and `source` share a sentence on purpose. The one shared
 * judgment in the app (`meetsEvidenceExpectation`) treats them identically --
 * both are satisfied by `supported` or `verified` -- so promising a reader
 * that `corroborated` demands two agreeing sources would describe a rule
 * this product does not actually enforce. It also means the two genuinely
 * ARE one line on screen, which is why grouping below keys on this rendered
 * sentence rather than on the enum.
 */
const EXPECTATION_SENTENCE: Record<EvidenceExpectation, string> = {
  assertion: 'A stated value is enough for this detail.',
  source: 'This case expects a cited source before relying on it.',
  corroborated: 'This case expects a cited source before relying on it.',
  verification: 'This case expects an independent check before relying on it.',
};

/**
 * The compact, always-present status marker.
 *
 * Text, never colour alone -- design-system.md's "Never colour-only. Every
 * status token is paired with the state's text label". This is what a row
 * covered by the dominant-provenance summary still says about itself, and
 * what makes an exception visible while scanning: fourteen quiet "Stated"
 * markers and one "Disputed" is a shape the eye finds instantly, where
 * fourteen identical sentences and one different one is not.
 */
const STATUS_MARKER: Record<AttributeStatus, string> = {
  asserted: 'Stated',
  supported: 'Supported',
  verified: 'Verified',
  conflicted: 'Disputed',
  unknown: 'Unknown',
};

const NO_RECORD_MARKER = 'No entry';

/**
 * The dominant case restated as clauses, for the one summary line.
 *
 * A second, deliberately parallel voice for the same facts the per-row
 * sentences state as standalone sentences -- "is stated but not
 * independently checked" against `STATUS_SENTENCE`'s "Stated, not
 * independently checked." Splicing the row sentences into a list instead
 * produced a staccato run of full stops that read as a stack of unrelated
 * warnings rather than one plain statement about the whole set.
 *
 * `unknown` is absent from the type, not merely unhandled: a row whose
 * status is `unknown` (or missing entirely) is structurally barred from
 * forming a dominant group, so there is no such summary to word.
 */
const STATUS_SUMMARY_CLAUSE: Record<Exclude<AttributeStatus, 'unknown'>, string> = {
  asserted: 'is stated but not independently checked',
  supported: 'is supported by evidence on file',
  verified: 'is independently verified',
  conflicted: 'is disputed',
};

const ORIGIN_SUMMARY_CLAUSE: Record<AttributeOrigin, string> = {
  pack: 'came with this pack',
  user: 'was added by you',
  agent_proposed: 'was recorded by Sift',
};

/**
 * The same mapping the browse cards' own signal row uses, so one attribute
 * cannot read as a strength on a card and a concern here.
 *
 * `identity` takes `neutral` deliberately -- `activity-labels.ts` defines
 * that tone as "carries no case-domain status at all", which is precisely
 * what an identity attribute is: a descriptive label nobody needs to
 * evidence. Giving it any of the other three would put a warning or a
 * reassurance on a row that `summarizeOptionSignals` does not count, so the
 * screen would show a verdict the summary above it denies.
 */
const SIGNAL_TONE: Record<OptionProfileAttribute['signal'], StatusTone> = {
  strength: 'satisfied',
  concern: 'blocked',
  unresolved: 'open',
  identity: 'neutral',
};

const STANCE_LABEL: Record<Claim['stance'], string> = {
  supports: 'Supports',
  opposes: 'Opposes',
  neutral: 'Neutral',
};

const STANCE_TONE: Record<Claim['stance'], StatusTone> = {
  supports: 'satisfied',
  opposes: 'blocked',
  neutral: 'neutral',
};

/** `unverified` is spelled out as "Not verified yet" rather than the bare enum: a source nobody has challenged is not a source anybody has checked, and the shorter word invites the opposite reading. */
const VERIFICATION_LABEL: Record<SourceVerification, string> = {
  unverified: 'Not verified yet',
  challenged: 'Challenged',
  verified: 'Verified',
  rejected: 'Rejected',
};

const VERIFICATION_TONE: Record<SourceVerification, StatusTone> = {
  unverified: 'open',
  challenged: 'accepted-uncertainty',
  verified: 'satisfied',
  rejected: 'error',
};

/** Wording deliberately identical to `CaseNotes.tsx`'s own maps, so a note reads the same wherever it is shown. Duplicated rather than exported from there for the same reason `FindingsSheet.tsx` keeps its own disposition labels: these are one component's copy, not a shared contract. */
const NOTE_KIND_LABEL: Record<CaseNoteKind, string> = {
  observation: 'Observation',
  research: 'Research',
  question: 'Question',
  preference: 'Preference',
  reminder: 'Reminder',
};

const NOTE_AUTHOR_LABEL: Record<CaseAttributeOrigin, string> = {
  user: 'You',
  agent_proposed: 'Sift',
};

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * An ISO 8601 timestamp as a readable day, composed by hand from the string
 * itself.
 *
 * Deliberately no `Date`, no `Intl`, no `toLocaleString`: the same
 * determinism `attribute-value-format.ts` documents for numbers applies
 * doubly to dates, where the runtime's time zone would otherwise be able to
 * shift a rendered day across a boundary and break a Playwright visual
 * baseline. A string that is not shaped like a timestamp is returned
 * untouched rather than guessed at.
 */
function formatIsoDay(timestamp: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(timestamp);
  if (match === null) return timestamp;
  const year = match[1];
  const month = match[2];
  const day = match[3];
  if (year === undefined || month === undefined || day === undefined) return timestamp;
  const monthName = MONTH_ABBREVIATIONS[Number(month) - 1];
  if (monthName === undefined) return timestamp;
  return `${monthName} ${Number(day)}, ${year}`;
}

/**
 * The three signal counts as sentences.
 *
 * A zero count is OMITTED, never rendered. "0 concerns" reads as a clean
 * bill of health, when in a case where nothing has been checked yet it
 * actually means the opposite -- so the honest rendering of "no concerns
 * counted" is silence here plus whatever the per-attribute lines below
 * genuinely say. When all three are zero there is nothing true to summarize
 * at all, and the caller falls through to this section's own empty state.
 */
function describeSignals(signals: OptionSignalCounts): { tone: StatusTone; text: string }[] {
  const described: { tone: StatusTone; text: string }[] = [];
  if (signals.strengths > 0) {
    described.push({
      tone: 'satisfied',
      text:
        signals.strengths === 1
          ? '1 detail is backed by evidence'
          : `${signals.strengths} details are backed by evidence`,
    });
  }
  if (signals.concerns > 0) {
    described.push({
      tone: 'blocked',
      text:
        signals.concerns === 1
          ? '1 detail needs a closer look'
          : `${signals.concerns} details need a closer look`,
    });
  }
  if (signals.unresolved > 0) {
    described.push({
      tone: 'open',
      text:
        signals.unresolved === 1
          ? '1 detail is still unknown'
          : `${signals.unresolved} details are still unknown`,
    });
  }
  return described;
}

// --- Stating the provenance once instead of on every row -----------------

/**
 * Exactly the four facts a row's provenance line can state, plus whether the
 * row may take part in a dominant group at all.
 *
 * `key` is the identity used for grouping, and it is built from the RENDERED
 * sentences rather than from the underlying enums. That is deliberate: two
 * rows belong in one group precisely when they would put identical words on
 * screen, which is both the thing worth de-duplicating and the property that
 * makes the summary line true of every row it covers.
 */
interface RowProvenance {
  status: AttributeStatus | null;
  origin: AttributeOrigin | null;
  updatedAt: string | null;
  /** The evidence-bar sentence, or `null` for a row with no value to hold to a bar. */
  expectation: string | null;
  /**
   * False for `status: null` and `status: 'unknown'`.
   *
   * An absence is the one thing a detail view must never let a summary line
   * speak for. "No entry at all" and "an entry recording that nobody knows"
   * are the two facts this whole surface exists to keep apart, so neither may
   * form a dominant group nor be quietly folded into one -- they always
   * print their own sentence, in full, in every profile.
   */
  eligible: boolean;
  key: string;
}

/** The dominant group, narrowed so its status is one a summary clause exists for. */
interface DominantProvenance extends Omit<RowProvenance, 'status' | 'eligible'> {
  status: Exclude<AttributeStatus, 'unknown'>;
}

function readProvenance(attribute: OptionProfileAttribute): RowProvenance {
  const expectation =
    attribute.display === null ? null : EXPECTATION_SENTENCE[attribute.evidenceExpectation];
  const status = attribute.status;
  return {
    status,
    origin: attribute.origin,
    updatedAt: attribute.updatedAt,
    expectation,
    eligible: status !== null && status !== 'unknown',
    // Joined on a delimiter that cannot appear inside a status, an
    // origin, an ISO timestamp, or one of the sentences above, so two
    // genuinely different tuples can never collide into one group.
    key: [status ?? '', attribute.origin ?? '', attribute.updatedAt ?? '', expectation ?? ''].join(
      '\u001f',
    ),
  };
}

/**
 * Below this, a summary line is not worth its own line: it would replace two
 * repetitions with one sentence plus a legend a reader has to hold in mind.
 */
const MIN_DOMINANT_ROWS = 3;

/**
 * The one provenance worth stating once, or `null` when there isn't one.
 *
 * The bar is a strict majority of EVERY row in the profile -- not of the
 * eligible rows, and not a mere plurality. Two consequences, both wanted:
 *
 *  - A tie is impossible (two groups cannot each hold more than half), so
 *    there is no arbitrary tiebreak deciding what a person reads.
 *  - The coordinator's "near-even split" hazard cannot arise. A legend true
 *    of half the rows would be worse than no legend, so a profile whose
 *    provenance is genuinely varied gets no summary and every row is
 *    annotated in full -- verbose, and correct.
 */
function findDominantProvenance(rows: RowProvenance[]): DominantProvenance | null {
  const byKey = new Map<string, { provenance: RowProvenance; count: number }>();
  for (const row of rows) {
    if (!row.eligible) continue;
    const existing = byKey.get(row.key);
    if (existing === undefined) {
      byKey.set(row.key, { provenance: row, count: 1 });
    } else {
      existing.count += 1;
    }
  }

  let best: { provenance: RowProvenance; count: number } | null = null;
  for (const group of byKey.values()) {
    if (best === null || group.count > best.count) best = group;
  }

  if (best === null || best.count < MIN_DOMINANT_ROWS) return null;
  if (best.count * 2 <= rows.length) return null;

  const { status } = best.provenance;
  // Deliberately redundant with `eligible` above, and not dead code to be
  // tidied away: it narrows the type so the summary clause lookup is a
  // total function rather than an assertion, and it is the second of two
  // independent guarantees that an absence can never become "the rule."
  // Removing EITHER one alone leaves the behaviour correct; removing both
  // fails `never lets an absence form the dominant case` in the tests.
  if (status === null || status === 'unknown') return null;

  return {
    status,
    origin: best.provenance.origin,
    updatedAt: best.provenance.updatedAt,
    expectation: best.provenance.expectation,
    key: best.provenance.key,
  };
}

/** "a, b, and c" -- an Oxford list, so the summary reads as one sentence rather than a stack of fragments. */
function joinClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? '';
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses.at(-1) ?? ''}`;
}

/**
 * The dominant case in one sentence.
 *
 * Every clause is a fact the group was GROUPED BY, so the line cannot
 * describe a row it does not cover.
 *
 * "Unless noted on the detail itself" is doing real work, not softening:
 * it is what makes each clause independently escapable, so a row that
 * departs on ONE fact (its status, say) can stay silent about the facts it
 * still shares (its origin and date) instead of restating them. That is the
 * whole mechanism by which the repetition disappears, and it is only sound
 * because a row prints any fact that differs -- see `AttributeRow`.
 */
function summarizeDominantProvenance(dominant: DominantProvenance): string {
  const clauses: string[] = [];
  if (dominant.origin !== null) clauses.push(ORIGIN_SUMMARY_CLAUSE[dominant.origin]);
  clauses.push(STATUS_SUMMARY_CLAUSE[dominant.status]);
  if (dominant.updatedAt !== null) {
    clauses.push(`was last updated ${formatIsoDay(dominant.updatedAt)}`);
  }
  return `Unless noted on the detail itself, everything below ${joinClauses(clauses)}.`;
}

interface ChipProps {
  tone: StatusTone;
  children: string;
}

/** The app's one chip recipe (`EvidenceCard.tsx`/`FindingsSheet.tsx`), with the label in its own element so a test can address the word without the decorative glyph attached to it. */
function Chip({ tone, children }: ChipProps) {
  const meta = STATUS_TONE_META[tone];
  return (
    <Badge
      className="label-caps gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
      style={{ color: meta.ink, backgroundColor: meta.bg }}
    >
      <span aria-hidden="true">{meta.icon}</span>
      <span>{children}</span>
    </Badge>
  );
}

interface SectionProps {
  id: string;
  heading: string;
  children: React.ReactNode;
  /** Applied to the `<section>` so the fixed `option-profile-claims`/`-sources`/`-notes` testids address the whole section, headings included. */
  testId?: string;
}

function Section({ id, heading, children, testId }: SectionProps) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-[var(--space-2-5)]"
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      <h3
        id={`${id}-heading`}
        className="font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] leading-[var(--line-height-snug)] font-[var(--font-weight-semibold)] text-[var(--color-ink)]"
      >
        {heading}
      </h3>
      {children}
    </section>
  );
}

function EmptyState({ section, children }: { section: string; children: string }) {
  return (
    <p
      data-testid={`option-profile-empty-${section}`}
      className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
    >
      {children}
    </p>
  );
}

/** One source rendered exactly the way `EvidenceCard.tsx` renders provenance -- title as the link, publisher muted beneath it -- so the two surfaces read as one product rather than two takes on a citation. */
function SourceLink({ source }: { source: Source }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[length:var(--font-size-sm)] break-words text-[var(--color-brand)] underline underline-offset-2"
    >
      {source.title}
    </a>
  );
}

/**
 * The submitter's own words about why a reference matters.
 *
 * `Source.summary` is deliberately NOT `Source.excerpt`: an excerpt is a
 * quotation FROM the source, a summary is the submitter's own account of why
 * it belongs in this case. Conflating them would let a model's paraphrase be
 * read as the source's own words, which is exactly the quiet misattribution
 * the evidence model exists to prevent -- so this renders in the reader's
 * ordinary prose voice, never as a quotation.
 *
 * Rendered as Markdown only when the source declares `summaryFormat:
 * 'markdown'`. Without that field the string is plain text and any Markdown
 * syntax in it is shown verbatim, which is the whole point of the format
 * field being optional: a summary written before the field existed keeps its
 * exact previous meaning on screen.
 */
function SourceSummary({ source }: { source: Source }) {
  const summary = source.summary;
  if (summary === undefined || summary.trim() === '') return null;
  const testId = `option-profile-source-summary-${source.id}`;
  return source.summaryFormat === 'markdown' ? (
    <MarkdownText
      headingLevel={4}
      className="text-[length:var(--font-size-sm)]"
      data-testid={testId}
    >
      {summary}
    </MarkdownText>
  ) : (
    <p
      data-testid={testId}
      className="text-[length:var(--font-size-sm)] break-words text-[var(--color-ink)]"
    >
      {summary}
    </p>
  );
}

/**
 * One attribute row: label, value, and the provenance line that is this
 * sheet's reason for existing.
 *
 * At the canonical narrow pane the label sits above its value (a 390px
 * column cannot afford a fixed label gutter). Past `global.css`'s own
 * `min-[481px]` boundary the row becomes the two-column
 * label/value specification table every mainstream product page uses -- the
 * same established breakpoint `ui/sheet.tsx` switches shape on, never a new
 * one, and never a `matchMedia` call.
 */
function AttributeRow({
  attribute,
  isFirst,
  dominant,
}: {
  attribute: OptionProfileAttribute;
  isFirst: boolean;
  /** The provenance already stated once above these rows, or `null` when there was no dominant case and every row must speak in full. */
  dominant: DominantProvenance | null;
}) {
  const tone = STATUS_TONE_META[SIGNAL_TONE[attribute.signal]];
  const hasValue = attribute.display !== null;
  const provenance = readProvenance(attribute);

  /*
   * Each fact is printed unless it is IDENTICAL to what the summary line
   * above already said. Compared fact by fact rather than tuple by tuple:
   * a row that departs on one thing (a different status, say) then states
   * only that, and stays silent on the origin and date it still shares --
   * which is what the summary's "unless noted on the detail itself" scope
   * means, and what turns 29 repeated timestamps into one.
   *
   * The invariant that makes this honest: a row can only ever go quiet
   * about a value the summary states VERBATIM. Nothing is ever suppressed
   * because it is unimportant, only because it is already on screen.
   *
   * `status: null` and `status: 'unknown'` are unreachable as a dominant
   * status (`readProvenance`'s `eligible`), so those rows always fail this
   * comparison and always print their own distinct sentence in full.
   */
  // `dominant?.x` reads as `undefined` when there is no summary at all, and
  // no row value is ever `undefined`, so "no dominant case" correctly comes
  // out as "this row differs from it" and every row states everything.
  const showStatus = provenance.status !== dominant?.status;
  const showOrigin = provenance.origin !== null && provenance.origin !== dominant?.origin;
  const showExpectation =
    provenance.expectation !== null && provenance.expectation !== dominant?.expectation;
  const showUpdatedAt =
    provenance.updatedAt !== null && provenance.updatedAt !== dominant?.updatedAt;

  const statusMarker =
    attribute.status === null ? NO_RECORD_MARKER : STATUS_MARKER[attribute.status];

  // What is known about this value, then who put it there -- each half
  // dropped when the summary above already carries it. `status: null` is the
  // one case that renders the "no entry at all" sentence, and it has no
  // origin to report.
  const sentenceParts: string[] = [];
  if (showStatus) {
    sentenceParts.push(
      attribute.status === null ? NO_RECORD_SENTENCE : STATUS_SENTENCE[attribute.status],
    );
  }
  if (showOrigin && provenance.origin !== null) {
    sentenceParts.push(ORIGIN_SENTENCE[provenance.origin]);
  }
  const provenanceSentence = sentenceParts.length > 0 ? sentenceParts.join(' ') : null;

  const expectationSentence = showExpectation ? provenance.expectation : null;

  /** Whether this row has anything to say beyond its one-word marker -- see the `basis-full` note in the render. */
  const hasProvenanceDetail =
    provenanceSentence !== null ||
    expectationSentence !== null ||
    attribute.confidence !== null ||
    showUpdatedAt ||
    attribute.sources.length > 0;

  // `confidence` is per-record and genuinely varies row to row, so it is
  // never folded into the summary and always prints where it exists.
  const metaParts: string[] = [];
  if (attribute.confidence !== null) {
    metaParts.push(`Confidence ${Math.round(attribute.confidence * 100)}%`);
  }
  if (showUpdatedAt && attribute.updatedAt !== null) {
    metaParts.push(`Last updated ${formatIsoDay(attribute.updatedAt)}`);
  }

  return (
    <div
      data-testid={`option-profile-attribute-${attribute.definitionId}`}
      className={cn(
        'grid grid-cols-1 gap-x-[var(--space-4)] gap-y-[var(--space-1)] pb-[var(--space-3)] last:pb-0 min-[481px]:grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)]',
        // The same hairline-between-rows treatment `VehicleCatalogFlow.tsx`
        // and `QuickPickView.tsx` already use, via the theme token rather
        // than a raw custom property.
        !isFirst && 'border-t border-border pt-[var(--space-3)]',
      )}
    >
      <dt className="label-caps flex min-w-0 flex-wrap items-center gap-[var(--space-1)] text-[var(--color-ink-secondary)] min-[481px]:pt-[var(--space-0-5)]">
        <span className="min-w-0 break-words">{attribute.label}</span>
        {attribute.custom ? (
          // The same subtle outlined marker `OptionListView.tsx` puts on a
          // custom fact, reused verbatim rather than reinvented.
          <Badge
            variant="outline"
            title="Added for your comparison"
            className="label-caps shrink-0 px-[var(--space-1)] py-0 text-[var(--color-ink-secondary)]"
          >
            Custom
          </Badge>
        ) : null}
      </dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-[var(--space-2)] gap-y-[var(--space-1)]">
        {/*
          A `text` value that declares `format: 'markdown'` gets the formatted
          body; everything else gets `formatAttributeValue`'s plain string,
          exactly as before.

          The split is deliberate and lives in two places on purpose.
          `formatAttributeValue` returns a `string` because cells, chips, and
          the comparison table need one line they can put in a table cell, and
          this sheet is the only surface with the room for a lead, a list, and
          a caveat. A browse card keeps the plain string even for a Markdown
          value -- a card is an index entry, not a place for a formatted body.

          `basis-full` because prose is a block: it takes the row's width
          rather than sitting inline beside the status marker the way a short
          value does.
        */}
        {attribute.markdown !== null ? (
          <MarkdownText headingLevel={5} className="basis-full">
            {attribute.markdown}
          </MarkdownText>
        ) : (
          <span
            className="text-[length:var(--font-size-base)] leading-[var(--line-height-snug)] font-[var(--font-weight-medium)] break-words"
            style={{ color: hasValue ? 'var(--color-ink)' : 'var(--color-ink-muted)' }}
          >
            {attribute.display ?? NO_VALUE_TEXT}
          </span>
        )}

        {/*
          `basis-full` only when there is something under the marker to read.
          A row covered by the summary is then one line -- "Toyota · STATED",
          the shape a specification table has on any shopping site -- instead
          of spending three lines to say one thing, while a row with a real
          exception to report still gets its own full-width block. Kept as
          ONE element either way (never conditionally unmounted) so
          `option-profile-attribute-status-<id>` is present on every row for
          any caller addressing it.
        */}
        <div
          data-testid={`option-profile-attribute-status-${attribute.definitionId}`}
          className={cn(
            'flex min-w-0 flex-col gap-[var(--space-1)]',
            hasProvenanceDetail && 'basis-full',
          )}
        >
          {/*
            The always-present marker. A covered row is reduced to exactly
            this, which is why it has to carry real words: colour alone would
            make "Disputed" and "Stated" the same row to anyone not
            distinguishing the two inks (design-system.md, "Never
            colour-only").
          */}
          <p className="flex items-center gap-[var(--space-1-5)]">
            <span aria-hidden="true" className="shrink-0" style={{ color: tone.ink }}>
              {tone.icon}
            </span>
            <span className="label-caps" style={{ color: tone.ink }}>
              {statusMarker}
            </span>
          </p>

          {provenanceSentence !== null ? (
            <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]">
              {provenanceSentence}
            </p>
          ) : null}

          {expectationSentence !== null ? (
            <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]">
              {expectationSentence}
            </p>
          ) : null}

          {metaParts.length > 0 ? (
            // Mono at the smallest step, per design-system.md's own role for
            // that family: "IDs, hashes, timestamps, source citations".
            <p className="font-[family-name:var(--font-mono)] text-[length:var(--font-size-2xs)] tabular-nums text-[var(--color-ink-muted)]">
              {metaParts.join(' · ')}
            </p>
          ) : null}

          {attribute.sources.length > 0 ? (
            <p className="flex flex-wrap items-baseline gap-x-[var(--space-2)] gap-y-[var(--space-0-5)]">
              <span className="label-caps text-[var(--color-ink-muted)]">Cites</span>
              {attribute.sources.map((source) => (
                <SourceLink key={source.id} source={source} />
              ))}
            </p>
          ) : null}
        </div>
      </dd>
    </div>
  );
}

export function OptionProfileSheet({
  open,
  onOpenChange,
  profile,
  presentation,
}: OptionProfileSheetProps) {
  // No option, or an id that matches no entity: render nothing at all. An
  // empty shell would look like a real option about which nothing is known,
  // which is a different -- and false -- claim.
  if (profile === null) return null;

  const optionNoun = presentation?.optionLabel ?? FALLBACK_OPTION_NOUN;
  // Mid-sentence form of the pack's own noun ("Saved option" -> "saved
  // option"). The pack supplies a common noun phrase for the thing being
  // chosen between, so lowering it is a grammatical adjustment to the
  // author's own word, never a substitution of ours.
  const inlineNoun = optionNoun.toLowerCase();

  const signals = describeSignals(profile.signals);
  const favoredTone = STATUS_TONE_META.ready;

  // Computed across every row in every group, because the summary line sits
  // above all of them.
  const dominant = findDominantProvenance(
    profile.groups.flatMap((group) => group.attributes).map(readProvenance),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="option-profile-sheet">
        {/* Right padding clears the sheet's own absolutely-positioned 44px
            close control, so a long option label wraps beside it instead of
            running underneath it. */}
        <SheetHeader className="pr-[calc(var(--size-touch-target-min)+var(--space-4))]">
          {/* The pack's noun as an overline above the option's own name --
              the category-then-product-name shape every mainstream detail
              page opens with, and the one place the generic noun can be used
              verbatim with no grammatical risk. */}
          <span className="label-caps text-[var(--color-ink-secondary)]">{optionNoun}</span>
          <SheetTitle
            data-testid="option-profile-title"
            className="text-[length:var(--font-size-lg)] leading-[var(--line-height-snug)] break-words"
          >
            {profile.option.label}
          </SheetTitle>
          {profile.favored ? (
            <span
              data-testid="option-profile-favored"
              className="label-caps inline-flex w-fit items-center gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
              style={{ color: favoredTone.ink, backgroundColor: favoredTone.bg }}
            >
              <span aria-hidden="true">{favoredTone.icon}</span>
              <span>Sift&apos;s current pick</span>
            </span>
          ) : null}
          <SheetDescription>
            Every detail, where it came from, and how well it is backed up.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-[var(--space-5)]">
          {/* Not a <section>: an unnamed landmark would add noise for a
              screen-reader user, and this row is a summary of the section
              that follows it rather than a region of its own. */}
          <div
            data-testid="option-profile-signals"
            className="flex flex-wrap gap-[var(--space-1-5)]"
          >
            {signals.length === 0 ? (
              <EmptyState section="signals">
                {`Nothing has been recorded about this ${inlineNoun} yet.`}
              </EmptyState>
            ) : (
              signals.map((signal) => (
                <Chip key={signal.tone} tone={signal.tone}>
                  {signal.text}
                </Chip>
              ))
            )}
          </div>

          <Section id="option-profile-details" heading="Details">
            {profile.groups.length === 0 ? (
              <EmptyState section="attributes">
                {`This case has no detail fields for this ${inlineNoun}.`}
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-[var(--space-3)]">
                {/*
                  The rule, stated once, above every row it covers. Quiet by
                  design -- it is a legend, not a finding, so it takes the
                  muted secondary voice and none of the status colours.
                */}
                {dominant !== null ? (
                  <p
                    data-testid="option-profile-provenance-summary"
                    className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
                  >
                    {summarizeDominantProvenance(dominant)}
                    {dominant.expectation !== null ? ` ${dominant.expectation}` : ''}
                  </p>
                ) : null}
                {profile.groups.map((group) => (
                  <div
                    key={group.id}
                    data-testid={`option-profile-group-${group.id}`}
                    className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]"
                  >
                    <h4 className="label-caps text-[var(--color-ink-secondary)]">{group.label}</h4>
                    <dl className="m-0 flex flex-col">
                      {group.attributes.map((attribute, index) => (
                        <AttributeRow
                          key={attribute.definitionId}
                          attribute={attribute}
                          isFirst={index === 0}
                          dominant={dominant}
                        />
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section id="option-profile-claims" heading="Research" testId="option-profile-claims">
            {profile.relatedClaims.length === 0 ? (
              <EmptyState section="claims">
                {`No research has been recorded about this ${inlineNoun} yet.`}
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-[var(--space-2)]">
                {profile.relatedClaims.map((claim) => (
                  <li
                    key={claim.id}
                    className="flex flex-col gap-[var(--space-1-5)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]"
                  >
                    <p className="text-[length:var(--font-size-base)] text-[var(--color-ink)]">
                      {claim.statement}
                    </p>
                    <div className="flex flex-wrap items-center gap-[var(--space-1-5)]">
                      <Chip tone={STANCE_TONE[claim.stance]}>{STANCE_LABEL[claim.stance]}</Chip>
                      {claim.stale ? <Chip tone="stale">Stale</Chip> : null}
                      <span className="text-[length:var(--font-size-sm)] tabular-nums text-[var(--color-ink-secondary)]">
                        {`Confidence ${Math.round(claim.confidence * 100)}%`}
                      </span>
                    </div>
                    {claim.stale ? (
                      <p
                        className="text-[length:var(--font-size-sm)]"
                        style={{ color: STATUS_TONE_META.stale.ink }}
                      >
                        This has aged past its validity window and may be out of date.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="option-profile-sources" heading="Sources" testId="option-profile-sources">
            {profile.relatedSources.length === 0 ? (
              <EmptyState section="sources">Nothing recorded here cites a source yet.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-[var(--space-2)]">
                {profile.relatedSources.map((source) => (
                  <li
                    key={source.id}
                    className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]"
                  >
                    <SourceLink source={source} />
                    <div className="flex flex-wrap items-center gap-[var(--space-1-5)]">
                      {/* Omitted entirely when the source carries no
                          publisher -- an optional field, and a blank line
                          would imply one was expected and lost. */}
                      {source.publisher !== undefined ? (
                        <span className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]">
                          {source.publisher}
                        </span>
                      ) : null}
                      <Chip tone={VERIFICATION_TONE[source.verification]}>
                        {VERIFICATION_LABEL[source.verification]}
                      </Chip>
                    </div>
                    <SourceSummary source={source} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="option-profile-notes" heading="Notes" testId="option-profile-notes">
            {profile.relatedNotes.length === 0 ? (
              <EmptyState section="notes">{`No notes mention this ${inlineNoun} yet.`}</EmptyState>
            ) : (
              <ul className="flex flex-col gap-[var(--space-2)]">
                {profile.relatedNotes.map((note) => (
                  <li
                    key={note.id}
                    className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]"
                  >
                    <div className="flex flex-wrap items-center gap-[var(--space-1-5)]">
                      <Badge
                        variant="outline"
                        className="label-caps rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)] text-[var(--color-ink-secondary)]"
                      >
                        {NOTE_KIND_LABEL[note.kind]}
                      </Badge>
                      <span className="text-[length:var(--font-size-xs)] text-[var(--color-ink-secondary)]">
                        {NOTE_AUTHOR_LABEL[note.origin]}
                      </span>
                    </div>
                    <p className="text-[length:var(--font-size-base)] text-[var(--color-ink)]">
                      {note.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
