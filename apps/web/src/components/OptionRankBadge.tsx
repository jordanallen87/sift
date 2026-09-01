/**
 * The deterministic ranking, as it appears on a browse card.
 *
 * ## Why this is a component and not four lines of JSX in each card
 *
 * Before this, the option views showed the pack's prominent attributes and
 * said nothing at all about rank. `packages/core/src/scoring.ts` had been
 * computing a fully-explained board that only the recommendation consumed --
 * so the one thing a person opens the workspace to find out ("which of these
 * is ahead, and how sure is that?") was the one thing the workspace did not
 * answer.
 *
 * It is shared because the ranking is exactly the kind of claim that must
 * not read differently in two tabs. `OptionCardSignals` exists for the same
 * reason one level down: two hand-written copies of a summary drift into
 * counting or wording the same option differently, and here the thing that
 * would drift is a number a person may spend forty thousand dollars on.
 *
 * ## The score and its coverage are ONE claim, not two facts
 *
 * This is the hard part of the design, and it is the reason the layout looks
 * the way it does. A score of 82% measured across 45% of the weighting is a
 * fundamentally weaker claim than 82% across 100%, and a card that shows
 * only the first number presents them as the same kind of fact. Three things
 * enforce the pairing:
 *
 *  1. **They are one sentence, split across two type sizes.** The card reads
 *     "45% score / on 50% of what you said matters" top to bottom. Neither
 *     half is a standalone phrase, so neither can be lifted out or scanned
 *     alone; the qualifier is not an asterisk, it is the rest of the
 *     sentence.
 *  2. **The coverage meter gives the qualifier visual weight.** A half-full
 *     bar makes a thinly-measured score LOOK thin at a glance, which a
 *     percentage in body copy never does. It is decoration on top of the
 *     sentence (`aria-hidden`), never the only carrier -- design-system.md's
 *     "never colour-only" applies to bars too.
 *  3. **`compact` density may drop the meter; it may never drop the
 *     sentence.** A 220px board column has no room for the bar. It has room
 *     for the words, and the words are the contract.
 *
 * ## Coverage does not cover a dispute
 *
 * `coverage` answers "how much of the weighting did we manage to measure".
 * It says nothing about whether what we measured is SETTLED, and a value
 * whose sources contradict each other is fully measured and fully counted --
 * so a 100%-coverage bar sits happily above a score built on a fact nobody
 * agrees on. Two different questions cannot honestly share one number, which
 * is why `OptionScore.disputedCriterionIds` is a separate field on the
 * engine and gets a separate affordance here rather than being folded into
 * the meter.
 *
 * It is rendered for EVERY option that has one, not only for the leader.
 * `deriveInsights` emits `disputed_evidence` only when the leader's lead
 * actually depends on the contested value -- a deliberately high bar, so the
 * warning stays worth reading -- but a dispute is a fact about the
 * measurement whether or not it changes the order, and the card is where a
 * person meets the measurement.
 *
 * ## The three refusals
 *
 * Each one is a claim this badge will not make, and each has a test named
 * after the lie it prevents:
 *
 *  - **An unranked option is not last.** `total === null` means nothing was
 *    measured, not that everything measured came out badly. There is no
 *    position, no score, and no coverage percentage -- all three would be
 *    claims about a comparison that never happened -- and the copy denies
 *    the "last" reading in words rather than leaving a blank space to be
 *    misread. On the energy board this is not a corner case: the billing
 *    cycle sorts ABOVE the constraint-violating option, so anything deriving
 *    a position from board order would print "#4" for an entity nothing was
 *    ever measured on.
 *  - **A violated hard constraint is a flag, not an elimination.** The
 *    option keeps its position, keeps its score, and stays selectable; the
 *    flag names the requirement it misses and says outright that nothing was
 *    removed. Rule 4 of the engine's honesty rules is that removing an
 *    option through the back door of a sort is precisely the human authority
 *    this product does not delegate.
 *  - **No ranking at all when there is nothing to rank.** Enforced upstream
 *    by `selectOptionRanking` returning `null`, which this component renders
 *    as nothing. An empty ranking reads as "we compared them and found no
 *    difference"; the truth is "there was nothing to compare".
 *
 * ## Colour discipline
 *
 * The position and the score carry no status colour -- the leader gets the
 * brand tint, which is the app's own accent rather than one of the nine
 * semantic status tokens, and the rest is typographic emphasis. A rank is a
 * plain fact, not a case state, and `OptionListView`'s headline stat already
 * records the same reasoning. The three things that ARE states take real
 * tones from the shared registry:
 *
 *  - `open` for "nothing established here yet" -- the quietest token, the
 *    same one `OptionCardSignals` gives an unresolved attribute;
 *  - `accepted-uncertainty` for a violated constraint, deliberately not
 *    `blocked`, which reads as eliminated and would assert the one thing
 *    rule 4 forbids;
 *  - `blocked` for a disputed measurement, which is exactly the tone
 *    `activity-labels.ts` already gives `evidence.conflicted` ("Research
 *    disagrees") -- and deliberately a different one from the constraint
 *    flag, because "this misses a requirement you set" and "the sources
 *    behind this disagree" are different problems with different remedies.
 *
 * Purely presentational: it renders an `OptionRanking` and nothing else. No
 * scoring, no fetching, no command dispatch, no `CaseEvent`.
 */
import type { CriterionScore } from '@sift/core';
import type { OptionRanking } from './case-scoreboard.js';
import { formatScore } from './case-scoreboard.js';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export interface OptionRankBadgeProps {
  /** Only ever used to build `data-testid`s -- never rendered as visible text. */
  optionId: string;
  /**
   * `selectOptionRanking(...)`'s output. `null` means "this case has no
   * ranking to show", and renders nothing at all: an empty ranking frame
   * would announce a comparison that did not happen.
   */
  ranking: OptionRanking | null;
  /**
   * `full` (the default) is the List card and the option profile: the score
   * at display size with the coverage meter under it. `compact` is a 220px
   * board column: the same words, one size down, no meter. Density never
   * changes WHICH facts appear -- see the header comment.
   */
  density?: 'full' | 'compact';
}

/** The one word that turns a bare percentage into a claim. "45%" alone could be anything on a card full of percentages; "45% score" cannot. */
const SCORE_NOUN = 'score';

const UNRANKED_MARKER = 'Not ranked';

/**
 * Says the wrong reading out loud and denies it.
 *
 * The failure mode here is silent: a card with a blank where every sibling
 * shows "#2 of 3" is read as "it came last and we are being polite about
 * it." Only words fix that, and they have to be the words a reader would
 * otherwise supply themselves.
 */
const UNRANKED_SENTENCE =
  'Not last — nothing that matters here has been measured for this one yet.';

/** Prefix on each flagged requirement. A verb, so the chip reads as a fact about this option rather than as a category heading. */
const CONSTRAINT_MARKER = 'Misses';

/** Rule 4, in the person's own terms, on the surface where the temptation to read a flag as a verdict is strongest. */
const CONSTRAINT_SENTENCE = 'Flagged, not removed — still ranked, and still yours to decide.';

/** The engine's own word for the state, reused verbatim so the card, the profile breakdown, and the insight all name it the same thing. */
const DISPUTED_MARKER = 'Disputed';

/**
 * Rule 6 in one line: the number used it, the evidence does not settle it.
 *
 * Both halves are load-bearing. "The score counts it" stops a reader
 * assuming the figure above already discounts the dispute; "the sources
 * disagree" stops them assuming a counted number is an agreed one.
 */
const DISPUTED_SENTENCE =
  'Counted in the score, but the sources behind it disagree — so the score is not settled.';

/**
 * The second half of the score sentence.
 *
 * Full coverage says "everything" rather than "100%": two adjacent
 * percentages that mean different things are exactly the confusion this
 * whole component is built to avoid, and the one case where the qualifier
 * can be stated without a second number is the case worth spending the words
 * on.
 */
function describeCoverage(coverage: number): string {
  return coverage >= 0.999
    ? 'on everything you said matters'
    : `on ${formatScore(coverage)} of what you said matters`;
}

/**
 * A named list of criteria this option is flagged on, plus the one sentence
 * that says what the flag does and does NOT mean.
 *
 * Shared between the two flag kinds because they have identical structure
 * and must not have identical wording: writing the markup twice is how one
 * of them eventually loses its qualifying sentence, and the qualifying
 * sentence is the entire point of both.
 */
function FlagList({
  optionId,
  kind,
  lines,
  tone,
  marker,
  sentence,
}: {
  optionId: string;
  /** Becomes part of the `data-testid`, so the two lists are separately addressable. */
  kind: 'constraint' | 'disputed';
  lines: readonly CriterionScore[];
  tone: StatusTone;
  marker: string;
  sentence: string;
}) {
  if (lines.length === 0) return null;
  const meta = STATUS_TONE_META[tone];

  return (
    <div
      data-testid={`option-rank-${kind}-flags-${optionId}`}
      className="flex min-w-0 flex-col gap-[var(--space-1)]"
    >
      <ul className="m-0 flex list-none flex-col gap-[var(--space-1)] p-0">
        {lines.map((line) => (
          <li
            key={line.criterionId}
            data-testid={`option-rank-${kind}-${optionId}-${line.criterionId}`}
            className="flex min-w-0 items-start gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-1)] py-[var(--space-0-5)] text-[length:var(--font-size-xs)]"
            style={{ color: meta.ink, backgroundColor: meta.bg }}
          >
            <span aria-hidden="true" className="shrink-0">
              {meta.icon}
            </span>
            <span className="label-caps shrink-0">{marker}</span>
            {/* `break-words`, never `truncate`: the energy pack's criterion
                labels run past sixty characters and a board column is 220px,
                so clipping here would leave a flag that names no
                requirement. This exact defect ("Addresses the root ca…") has
                shipped once already. */}
            <span
              data-testid={`option-rank-${kind}-label-${optionId}-${line.criterionId}`}
              className="min-w-0 break-words"
            >
              {line.criterionLabel}
            </span>
          </li>
        ))}
      </ul>
      <p
        className="min-w-0 text-[length:var(--font-size-xs)] break-words"
        style={{ color: 'var(--color-ink-secondary)' }}
      >
        {sentence}
      </p>
    </div>
  );
}

export function OptionRankBadge({ optionId, ranking, density = 'full' }: OptionRankBadgeProps) {
  if (ranking === null) return null;

  const { score, rank, rankedCount, coverageFlagged } = ranking;
  const isCompact = density === 'compact';
  const violatedLines = score.criteria.filter((line) => line.constraintViolated);
  // Read off `disputedCriterionIds` rather than off `line.status`, so the
  // card and the engine's own field can never disagree about what counts as
  // a dispute.
  const disputedLines = score.criteria.filter((line) =>
    score.disputedCriterionIds.includes(line.criterionId),
  );
  const unrankedTone = STATUS_TONE_META.open;
  const constraintTone = STATUS_TONE_META['accepted-uncertainty'];

  return (
    <div
      data-testid={`option-rank-${optionId}`}
      data-density={density}
      className="flex min-w-0 flex-col gap-[var(--space-1)]"
    >
      {rank === null || score.total === null ? (
        /*
         * No position, no percentage, no meter. Every one of those would be
         * a measurement of a comparison that never took place, and the
         * sentence is here because a blank is read as a low rank.
         */
        <p
          data-testid={`option-rank-unranked-${optionId}`}
          className="flex min-w-0 flex-wrap items-baseline gap-x-[var(--space-1-5)] gap-y-[var(--space-0-5)]"
        >
          <span
            className="label-caps inline-flex shrink-0 items-center gap-[var(--space-0-5)] rounded-[var(--radius-sm)] px-[var(--space-1)] py-[var(--space-0-5)]"
            style={{ color: unrankedTone.ink, backgroundColor: unrankedTone.bg }}
          >
            <span aria-hidden="true">{unrankedTone.icon}</span>
            {UNRANKED_MARKER}
          </span>
          <span
            className="min-w-0 text-[length:var(--font-size-xs)] break-words"
            style={{ color: 'var(--color-ink-secondary)' }}
          >
            {UNRANKED_SENTENCE}
          </span>
        </p>
      ) : (
        <>
          {/* Position and score share a baseline: "#2 of 3" and "45% score"
              are two halves of the same statement, not a label above a
              value. */}
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-[var(--space-2)] gap-y-[var(--space-0-5)]">
            <span
              data-testid={`option-rank-position-${optionId}`}
              className="label-caps shrink-0 rounded-[var(--radius-sm)] px-[var(--space-1)] py-[var(--space-0-5)] tabular-nums"
              // The brand tint for the leader, deliberately NOT a status
              // token: leading is a fact about the arithmetic, not a state
              // the case is in, and the nine semantic tones are reserved for
              // states (design-system.md). Everything below first place is
              // typographic only.
              style={
                rank === 1
                  ? { color: 'var(--color-brand)', backgroundColor: 'var(--color-brand-tint)' }
                  : { color: 'var(--color-ink-secondary)' }
              }
            >
              {/* The visible "#2 of 3" is compact enough for a 220px column;
                  the hidden word is what makes it a sentence for a screen
                  reader rather than a stray ordinal. */}
              <span className="visually-hidden">Ranked </span>
              {`#${rank} of ${rankedCount}`}
            </span>

            <span
              data-testid={`option-rank-score-${optionId}`}
              className="min-w-0 font-[family-name:var(--font-display)] leading-[var(--line-height-tight)] font-bold tabular-nums"
              style={{
                color: 'var(--color-ink)',
                fontSize: isCompact ? 'var(--font-size-md)' : 'var(--font-size-lg)',
              }}
            >
              {formatScore(score.total)}
              <span
                className="label-caps ml-[var(--space-1)] font-[family-name:var(--font-body)]"
                style={{ color: 'var(--color-ink-secondary)' }}
              >
                {SCORE_NOUN}
              </span>
            </span>
          </p>

          {/* Decoration for the sentence below it, never a substitute: the
              percentage is always in the text, and this is `aria-hidden` so
              a screen reader hears the sentence once rather than a bar and
              then the same fact again. A half-empty track is what makes a
              thin measurement look thin at a glance. */}
          {isCompact ? null : (
            <span
              data-testid={`option-rank-meter-${optionId}`}
              aria-hidden="true"
              className="block h-[4px] w-full overflow-hidden rounded-[var(--radius-pill)]"
              style={{ backgroundColor: 'var(--color-border-subtle)' }}
            >
              <span
                className="block h-full rounded-[var(--radius-pill)]"
                style={{
                  width: `${Math.round(score.coverage * 100)}%`,
                  backgroundColor: 'var(--color-brand)',
                }}
              />
            </span>
          )}

          <p
            data-testid={`option-rank-coverage-${optionId}`}
            className="min-w-0 text-[length:var(--font-size-xs)] break-words"
            // The engine's own `coverage_gap` verdict, not a threshold this
            // component owns -- see `OptionRanking.coverageFlagged`. A card
            // calling a measurement thin while the insight panel above it
            // calls the same measurement fine is the drift this avoids.
            style={{
              color: coverageFlagged ? constraintTone.ink : 'var(--color-ink-secondary)',
            }}
          >
            {describeCoverage(score.coverage)}
          </p>
        </>
      )}

      {/* Rendered regardless of density and regardless of rank: a dispute is
          a fact about the measurement, and an unranked option can still hold
          a contested value. It sits directly under the coverage line because
          that is the number it qualifies -- see the header comment's
          "Coverage does not cover a dispute". */}
      <FlagList
        optionId={optionId}
        kind="disputed"
        lines={disputedLines}
        tone="blocked"
        marker={DISPUTED_MARKER}
        sentence={DISPUTED_SENTENCE}
      />

      <FlagList
        optionId={optionId}
        kind="constraint"
        lines={violatedLines}
        tone="accepted-uncertainty"
        marker={CONSTRAINT_MARKER}
        sentence={CONSTRAINT_SENTENCE}
      />
    </div>
  );
}
