/**
 * "Why this rank" -- the per-criterion argument behind one option's place on
 * the board, rendered inside the option profile.
 *
 * ## Why the full breakdown belongs here and nowhere else
 *
 * `OptionRankBadge` puts the conclusion on a card. A conclusion a person
 * cannot audit is an assertion, and this product's whole thesis is that the
 * deterministic core owns the ranking precisely SO THAT it can be audited --
 * ADR 0012's framing is that "a person deciding how to spend forty thousand
 * dollars is entitled to know why something came first, and to change one
 * number and watch the order change." This is the surface where the first
 * half of that sentence is honoured: every active criterion, its weight,
 * whether it could be scored at all, what this option's own value was, and
 * the engine's own plain-English reason.
 *
 * The profile is the right home for the same reason the provenance detail
 * lives there (`OptionProfileSheet`'s header comment): a browse card is an
 * index entry, and this is five to ten rows of argument a person came
 * deliberately to read.
 *
 * ## The reason sentence is rendered verbatim, never paraphrased
 *
 * `CriterionScore.reason` is written by the engine as a finished human
 * sentence ("76% of the way from the weakest to the strongest option
 * compared, where lower is better"), and it is the ONLY place the effective
 * scoring direction is disclosed. That matters concretely: the shipped car
 * pack declares `pref.deal_value` as `higher_better` over
 * `car.out_the_door_price`, whose own comparison is `lower_better`. The
 * attribute wins (honesty rule 2) and no warning is emitted, because a
 * criterion phrased as a benefit over a cost measurement is an ordinary
 * modelling pattern rather than a mistake. The row saying "where lower is
 * better" in the person's own reading is what keeps that from looking like a
 * 20%-weight criterion that ranks the most expensive car as the best deal.
 * Restating it in our own words would break that guarantee the first time
 * the engine's wording changed.
 *
 * ## Six statuses that must never be confused, one that must never look like
 * a zero, and one that must never look settled
 *
 * `CriterionScoreStatus` has six members and each means something a person
 * would act on differently. Three devices keep them apart, none of which is
 * colour alone (design-system.md, "Never colour-only"):
 *
 *  1. **Distinct words.** Every status has its own label, and a test asserts
 *     that no two statuses ever collapse into the same one.
 *  2. **A number only where there is one.** A scored row shows its 0-100
 *     figure. An unscored row shows NOTHING in that slot -- not a zero, and
 *     not an em dash, which is read as a zero often enough to count as one.
 *  3. **The weight says whether it counted.** A scored row reads "30% of the
 *     weighting"; an unscored row reads "30% of the weighting, not counted
 *     here". That sits in exactly the slot a reader checks for "how much did
 *     this matter", and it denies the zero reading in the same breath as
 *     stating the weight.
 *
 * `unknown` is the one this is really for. The engine deliberately does not
 * count a missing value against an option -- it lowers COVERAGE, never
 * SCORE -- and a row that reads as a failure would undo that at the last
 * step, turning "we did not look" into "it is bad". So `unknown` takes the
 * `open` tone (design-system.md's quietest token, "nothing has happened here
 * yet", the same one `OptionCardSignals` gives an unresolved attribute), and
 * the engine's own sentence -- "left out of the score rather than counted
 * against it" -- is rendered in full.
 *
 * `disputed` is the mirror image, and the reason device 2 above is not the
 * whole story. A disputed row DOES carry a number -- honesty rule 6 keeps
 * scoring a contested value, because refusing to use a value that exists is
 * its own distortion -- so it is the one status where a figure appears next
 * to something unsettled. That number therefore cannot be allowed to stand
 * alone: the row carries the `blocked` tone (`activity-labels.ts`'s own tone
 * for `evidence.conflicted`, "Research disagrees"), and the engine's reason
 * ends "but the sources behind this contradict each other, so it is not
 * settled" -- which is exactly why the sentence is rendered verbatim rather
 * than trimmed to its first clause.
 *
 * ## Pack-agnostic by construction
 *
 * Every label, every reason, and every value comes from the case; nothing
 * here names a domain. The energy pack's criterion labels run past sixty
 * characters and its heaviest criterion cannot be scored at all, so both are
 * exercised rather than assumed.
 *
 * Purely presentational, like every sibling leaf: no fetching, no context,
 * no command dispatch. Reading why an option ranks where it does is a way of
 * LOOKING at it, never a change to it.
 */
import type { CriterionKind } from '@sift/contracts';
import type { CriterionScore, CriterionScoreStatus } from '@sift/core';
import { formatAttributeValue } from './attribute-value-format.js';
import { formatScore, type OptionRanking } from './case-scoreboard.js';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';
import { OptionRankBadge } from './OptionRankBadge.js';

export interface OptionRankBreakdownProps {
  /** Only ever used to build `data-testid`s -- never rendered as visible text. */
  optionId: string;
  /** `selectOptionRanking(...)`'s output. `null` renders nothing: a breakdown of a ranking that does not exist would be a page of explanations for a conclusion nobody reached. */
  ranking: OptionRanking | null;
}

interface CriterionStatusMeta {
  /** The word on screen. Never the raw enum member. */
  label: string;
  tone: StatusTone;
}

/**
 * One word per status, chosen so a reader can tell what to DO about the row.
 *
 * The tone choices, each defensible against `docs/design-system.md`'s own
 * definitions:
 *
 *  - `scored` -> `satisfied`: a real measurement contributed to the total.
 *  - `tied` -> `neutral`: measured, and carries no signal -- literally "no
 *    status".
 *  - `disputed` -> `blocked`: the tone `activity-labels.ts` already gives
 *    `evidence.conflicted` ("Research disagrees"). Deliberately NOT
 *    `accepted-uncertainty`, which this file's sibling badge uses for a
 *    missed requirement: a dispute is not an uncertainty someone has decided
 *    to accept, it is a disagreement waiting to be resolved, and the two
 *    have different remedies.
 *  - `unknown` -> `open`: "nothing has happened here yet", the quietest
 *    token, and emphatically not a failure tone. See the header comment.
 *  - `not_comparable` -> `accepted-uncertainty`: the engine refused to
 *    invent an ordering rather than guessing one (honesty rule 5), which is
 *    precisely accepted uncertainty.
 *  - `not_applicable` -> `neutral`: no measurement is even claimed; the
 *    scoreboard has no standing to speak to this row at all.
 *
 * `tied` and `not_applicable` share the `neutral` tone deliberately. Both
 * genuinely mean "this row carries no verdict about this option," which is
 * what `neutral` is defined as; inventing a colour distinction between two
 * things that are both the absence of a status would be a decoration
 * pretending to be information. They are told apart by their words, which is
 * where this design system puts the signal anyway.
 *
 * **`not_applicable` says "No measurement" rather than anything more
 * specific, and that is a correction.** The engine uses that one status for
 * two different situations -- a criterion naming no attribute at all (the
 * energy pack's "Long-term waste reduction", a genuine human-judgment
 * concern worth half its weighting) and a criterion whose attribute is
 * measured on something that is not an option at all (the same pack's safety
 * constraint, declared on the billing cycle). An earlier label here read
 * "Your judgment", which is right for the first and simply false for the
 * second. Nothing on `CriterionScore` distinguishes them except the `reason`
 * sentence, and the engine's two sentences already draw the distinction far
 * better than a two-word label could -- so the label states only what is true
 * of both, and the sentence below it does the rest.
 */
export const CRITERION_STATUS_META: Record<CriterionScoreStatus, CriterionStatusMeta> = {
  scored: { label: 'Scored', tone: 'satisfied' },
  tied: { label: 'No difference', tone: 'neutral' },
  disputed: { label: 'Disputed', tone: 'blocked' },
  unknown: { label: 'Not established', tone: 'open' },
  not_comparable: { label: 'Cannot be ranked', tone: 'accepted-uncertainty' },
  not_applicable: { label: 'No measurement', tone: 'neutral' },
};

/**
 * Only `hard_constraint` is marked.
 *
 * A preference is the unmarked default -- badging every row "Preference"
 * would be a column of identical words carrying no information per line,
 * the exact defect `OptionCardSignals` was extracted to end. A requirement
 * is different in kind from a preference (it can be MISSED rather than
 * merely scored low), so it is the one worth calling out. `consideration`
 * goes unmarked with preferences: it is the lightest-weight kind, and
 * `criteria.ts` records that it never even gates a derived obligation.
 */
const KIND_MARKER: Partial<Record<CriterionKind, string>> = {
  hard_constraint: 'Requirement',
};

/** The heading, in the person's own question rather than the engine's vocabulary. */
const HEADING = 'Why this rank';

/**
 * `weight` arrives normalized to a 0..1 share of the active weighting, so
 * this is the criterion's real influence on THIS board, not the raw 0-100
 * number a pack author typed. The two differ whenever a criterion has been
 * excluded or added.
 */
function describeWeight(weight: number, scored: boolean): string {
  const share = `${formatScore(weight)} of the weighting`;
  // A zero-weight criterion contributes nothing to the total whether or not
  // it scored, so saying only "0% of the weighting" beside a row marked
  // "Scored 100%" invites the reader to wonder which of the two numbers is
  // the lie. Both shipped packs carry exactly this shape: a `hard_constraint`
  // at weight 0, which GATES the ranking (violators sort last) without
  // WEIGHTING it, and the pass/fail reason on the same row is what explains
  // what it does instead.
  if (weight === 0) return `${share} — it does not move the score`;
  // Stated in the same breath as the weight, because "30%" beside a row with
  // no number is otherwise read as "30% of the weighting, scored zero".
  return scored ? share : `${share}, not counted here`;
}

function CriterionRow({ optionId, line }: { optionId: string; line: CriterionScore }) {
  const meta = CRITERION_STATUS_META[line.status];
  const tone = STATUS_TONE_META[meta.tone];
  const scored = line.score !== null;
  const kindMarker = KIND_MARKER[line.kind];
  const testIdSuffix = `${optionId}-${line.criterionId}`;

  return (
    <li
      data-testid={`option-rank-criterion-${testIdSuffix}`}
      data-criterion-id={line.criterionId}
      data-status={line.status}
      data-kind={line.kind}
      // A machine-readable restatement of "this row contributed a number",
      // so a Playwright assertion never has to infer it from the presence of
      // a percentage on screen.
      data-scored={scored ? 'true' : 'false'}
      className="flex min-w-0 flex-col gap-[var(--space-1)] border-t border-border pt-[var(--space-2-5)] first:border-t-0 first:pt-0"
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-[var(--space-2)] gap-y-[var(--space-0-5)]">
        <span className="flex min-w-0 flex-wrap items-baseline gap-[var(--space-1-5)]">
          {/* No `truncate`, deliberately: the energy pack's criterion labels
              run past sixty characters, and clipping the label leaves a row
              whose number and reason describe nothing identifiable. */}
          <span
            data-testid={`option-rank-criterion-label-${testIdSuffix}`}
            className="min-w-0 text-[length:var(--font-size-base)] leading-[var(--line-height-snug)] font-[var(--font-weight-medium)] break-words text-[var(--color-ink)]"
          >
            {line.criterionLabel}
          </span>
          {kindMarker === undefined ? null : (
            <span
              className="label-caps shrink-0 rounded-[var(--radius-sm)] px-[var(--space-1)] py-0"
              style={{ color: 'var(--color-ink-secondary)' }}
            >
              {kindMarker}
            </span>
          )}
        </span>

        {/* Rendered ONLY when there is a number. An unscored row leaves this
            slot genuinely empty rather than filling it with a zero or a dash
            that would be read as one. */}
        {scored ? (
          <span
            data-testid={`option-rank-criterion-score-${testIdSuffix}`}
            className="shrink-0 font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] leading-[var(--line-height-tight)] font-bold tabular-nums text-[var(--color-ink)]"
          >
            {/* No cast: `scored` is a const boolean derived from
                `line.score !== null`, so TypeScript narrows `line.score`
                here on its own. */}
            {formatScore(line.score)}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-[var(--space-2)] gap-y-[var(--space-1)]">
        <span
          data-testid={`option-rank-criterion-status-${testIdSuffix}`}
          className="label-caps inline-flex shrink-0 items-center gap-[var(--space-0-5)] rounded-[var(--radius-sm)] px-[var(--space-1)] py-[var(--space-0-5)]"
          style={{ color: tone.ink, backgroundColor: tone.bg }}
        >
          <span aria-hidden="true">{tone.icon}</span>
          {meta.label}
        </span>
        <span
          data-testid={`option-rank-criterion-weight-${testIdSuffix}`}
          className="min-w-0 text-[length:var(--font-size-xs)] break-words tabular-nums text-[var(--color-ink-secondary)]"
        >
          {describeWeight(line.weight, scored)}
        </span>
      </div>

      {/* The engine's finished sentence, exactly as written. See the header
          comment for why this is never paraphrased. */}
      <p
        data-testid={`option-rank-criterion-reason-${testIdSuffix}`}
        className="min-w-0 text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] break-words text-[var(--color-ink-secondary)]"
      >
        {line.reason}
      </p>

      {line.value === undefined ? null : (
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-[var(--space-1-5)] gap-y-[var(--space-0-5)]">
          <span className="label-caps shrink-0 text-[var(--color-ink-muted)]">Value</span>
          {/*
            The value only. Its evidential standing is NOT restated here:
            `status: 'disputed'` on the row above already carries the one
            standing that changes how the score should be read, and the full
            five-status provenance vocabulary lives in `OptionProfileSheet`'s
            Details section, a scroll below this one in the same sheet.
            Duplicating that map would give two surfaces inside one sheet two
            independent chances to word the same record differently.
          */}
          <span
            data-testid={`option-rank-criterion-value-${testIdSuffix}`}
            className="min-w-0 text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] break-words text-[var(--color-ink)]"
          >
            {formatAttributeValue(line.value)}
          </span>
        </p>
      )}
    </li>
  );
}

export function OptionRankBreakdown({ optionId, ranking }: OptionRankBreakdownProps) {
  if (ranking === null) return null;

  // Heaviest first: the reader's question is "what decided this", and the
  // answer is at the top of a weight-ordered list. `sort` on a copy, and
  // stable, so criteria of equal weight keep the pack author's own order
  // rather than an arbitrary one that could change between renders.
  const lines = [...ranking.score.criteria].sort((a, b) => b.weight - a.weight);

  return (
    <section
      data-testid={`option-rank-breakdown-${optionId}`}
      aria-labelledby={`option-rank-breakdown-heading-${optionId}`}
      className="flex flex-col gap-[var(--space-2-5)]"
    >
      <h3
        id={`option-rank-breakdown-heading-${optionId}`}
        className="font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] leading-[var(--line-height-snug)] font-[var(--font-weight-semibold)] text-[var(--color-ink)]"
      >
        {HEADING}
      </h3>

      {/* The same conclusion the card carries, restated at the top of its own
          evidence -- so the number a person clicked through from is the first
          thing they see, rather than something they have to reassemble from
          the rows. */}
      <OptionRankBadge optionId={optionId} ranking={ranking} />

      <ul className="m-0 flex list-none flex-col gap-[var(--space-2-5)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]">
        {lines.map((line) => (
          <CriterionRow key={line.criterionId} optionId={optionId} line={line} />
        ))}
      </ul>
    </section>
  );
}
