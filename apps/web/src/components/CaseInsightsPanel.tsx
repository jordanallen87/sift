/**
 * What the deterministic scoreboard OBSERVED about this case, near the top
 * of the workspace where a person will actually read it.
 *
 * ## Why this region exists at all
 *
 * `deriveInsights` is a pure function of the board -- no model, no
 * re-scoring, no access to anything the UI cannot also see -- and until now
 * nothing rendered it. Every one of its findings was computable and none was
 * visible, so the workspace showed a ranking with no explanation of what was
 * interesting about it.
 *
 * ## Two of these are experiments; five are observations
 *
 * `decisive_criterion` and `disputed_evidence` are not summaries of the
 * board. Each is the result of a leave-one-out re-computation the engine
 * actually ran: remove one criterion from the weighting, recompute both
 * totals from the lines already on the board, and see whether the order
 * moves. "Ownership cost is what puts the CR-V ahead -- take it out and the
 * RAV4 comes first instead" is a verified result, and when no single
 * criterion flips the order, no such insight is emitted at all. That
 * negative result is what makes the positive one worth reading, and it is
 * why these two lead the panel while `leader`, `close_call`,
 * `coverage_gap`, `constraint_violation`, and `non_discriminating` sit
 * beneath them as a plain list.
 *
 * The lead cards say how the claim was established, in one line, because
 * "we re-ranked without it and the order changed" is a fundamentally
 * different kind of statement from "this option scores highest" and a reader
 * has no other way to tell them apart.
 *
 * The hoist is a stable partition, so the two groups each keep the engine's
 * own emission order and the panel is as deterministic as the board it
 * renders.
 *
 * ## Rendered whenever there is anything to say, including without a ranking
 *
 * `selectOptionRanking` deliberately renders NOTHING when a case is not
 * rankable, because an empty ranking reads as "we compared them and found no
 * difference." That reasoning does not extend here. A single-option case can
 * still honestly produce `coverage_gap` ("some of what you said matters has
 * not been established yet") and `constraint_violation` ("this fails a
 * requirement you set"); neither claims a comparison happened. So the gate
 * is simply "did the engine find anything", and an empty list renders no
 * element at all rather than a card announcing its own emptiness
 * (product.md's "Empty regions" rule, the same contract
 * `WorkspaceAlertBanner` states for itself).
 *
 * ## Colour discipline
 *
 * Severity drives the ordinary rows, using exactly the mapping
 * `WorkspaceAlertBanner` already established for the same two words:
 * `attention` -> `accepted-uncertainty`, `info` -> `open`. The two lead
 * cards are the exceptions, and each for a stated reason:
 *
 *  - `decisive_criterion` takes the brand tint. It is `severity: 'info'`, so
 *    a status token would either understate it (`open` is the quietest tone
 *    in the system, on the most compelling thing the product computes) or
 *    misname it (it is not a state the case is IN). Brand is the app's own
 *    accent and carries no semantic claim, which is exactly right for "this
 *    is our finding."
 *  - `disputed_evidence` takes `blocked`, the same tone
 *    `activity-labels.ts` gives `evidence.conflicted` ("Research
 *    disagrees") and the same one `OptionRankBadge` puts on a disputed
 *    measurement. One fact, one colour, wherever it appears.
 *
 * Never colour-only (design-system.md): every row carries the engine's own
 * headline and detail as real sentences, and the tone glyph is `aria-hidden`
 * decoration on top of that. An `attention` row additionally carries the
 * words "Needs your attention", because otherwise the entire difference
 * between the two severities is a background tint.
 *
 * ## Measure
 *
 * Every sentence here carries `global.css`'s `.reading-measure`. This panel
 * is a full-width sibling of the expanded two-column layout, so at a 1440px
 * viewport its paragraphs would otherwise get the whole 1248px shell --
 * roughly 200 characters per line, about triple a readable measure, and the
 * exact problem that utility was added for when the recommendation rationale
 * hit it. It is a `max-width` only, so it is inert at the canonical pane
 * width where the column is already narrower than the cap.
 *
 * Purely presentational: it renders `Insight[]` and nothing else. No
 * scoring, no fetching, no command dispatch, no `CaseEvent`.
 */
import type { Insight, InsightKind } from '@sift/core';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export interface CaseInsightsPanelProps {
  /** `deriveInsights(board)`'s output, straight through. An empty list renders nothing at all. */
  insights: readonly Insight[];
  /** Caller-decided information architecture, never detected here -- the same contract every sibling region uses. */
  layout: 'narrow' | 'expanded';
}

const HEADING = 'What the comparison shows';

/**
 * The two kinds whose claim was VERIFIED by re-running the ranking, rather
 * than read off it. Order here is the order they lead in.
 */
const LEAD_KINDS: readonly InsightKind[] = ['decisive_criterion', 'disputed_evidence'];

/** The eyebrow above a lead card: what question this result answers, in the reader's terms. */
const LEAD_EYEBROW: Partial<Record<InsightKind, string>> = {
  decisive_criterion: 'What is actually deciding this',
  disputed_evidence: 'The lead rests on a contested fact',
};

/**
 * How the claim was established, stated plainly.
 *
 * This is the line that separates a computed result from a narrative, and
 * both sentences describe what `totalWithout` literally does. The two
 * differ because the experiments answer different questions: one asks
 * whether the order changes, the other asks whether the lead survives.
 */
const LEAD_METHOD: Partial<Record<InsightKind, string>> = {
  decisive_criterion: 'Checked by re-ranking without it — the order actually changes.',
  disputed_evidence: 'Checked by re-ranking without it — the lead does not survive.',
};

/** Same two words, same two tones `WorkspaceAlertBanner` already maps them to. See the header comment. */
const SEVERITY_TONE: Record<Insight['severity'], StatusTone> = {
  attention: 'accepted-uncertainty',
  info: 'open',
};

/**
 * Only `attention` is marked, and it must be.
 *
 * design-system.md: "Never colour-only. Every status token is paired with
 * the state's text label." Without this, the whole difference between an
 * attention row and an info row on this panel is a background tint and an
 * `aria-hidden` glyph -- invisible in greyscale, to several kinds of colour
 * blindness, and to a screen reader. `info` stays unmarked because it is the
 * unmarked default: labelling every ordinary observation "Info" would be a
 * column of identical words carrying no information per line, which is the
 * defect `OptionCardSignals` was extracted to end.
 */
const ATTENTION_MARKER = 'Needs your attention';

/** The tone a lead card takes, overriding severity. See the header comment for why each. */
const LEAD_TONE: Partial<Record<InsightKind, StatusTone | 'brand'>> = {
  decisive_criterion: 'brand',
  disputed_evidence: 'blocked',
};

function LeadInsight({ insight }: { insight: Insight }) {
  const lead = LEAD_TONE[insight.kind];
  const palette =
    lead === 'brand' || lead === undefined
      ? { ink: 'var(--color-brand)', bg: 'var(--color-brand-tint)', icon: '◆' }
      : STATUS_TONE_META[lead];

  return (
    <article
      data-testid={`case-insight-${insight.kind}`}
      data-kind={insight.kind}
      data-severity={insight.severity}
      data-lead="true"
      className="flex min-w-0 flex-col gap-[var(--space-1-5)] rounded-[var(--radius-md)] p-[var(--space-3)]"
      style={{ backgroundColor: palette.bg }}
    >
      <p
        className="label-caps flex min-w-0 items-center gap-[var(--space-1)] break-words"
        style={{ color: palette.ink }}
      >
        <span aria-hidden="true" className="shrink-0">
          {palette.icon}
        </span>
        {LEAD_EYEBROW[insight.kind] ?? HEADING}
      </p>

      {/* Display type, one step above the ordinary rows: this is the thing
          the panel exists to put in front of someone. */}
      <p
        data-testid={`case-insight-headline-${insight.kind}`}
        className="reading-measure min-w-0 font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] leading-[var(--line-height-snug)] font-[var(--font-weight-semibold)] break-words"
        style={{ color: 'var(--color-ink)' }}
      >
        {insight.headline}
      </p>

      <p
        data-testid={`case-insight-detail-${insight.kind}`}
        className="reading-measure min-w-0 text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] break-words text-[var(--color-ink-secondary)]"
      >
        {insight.detail}
      </p>

      {/* Not decoration. Without it, a verified leave-one-out result reads
          exactly like the observations below it. */}
      <p className="min-w-0 text-[length:var(--font-size-xs)] break-words text-[var(--color-ink-muted)]">
        {LEAD_METHOD[insight.kind] ?? ''}
      </p>
    </article>
  );
}

function ObservedInsight({ insight }: { insight: Insight }) {
  const tone = STATUS_TONE_META[SEVERITY_TONE[insight.severity]];

  return (
    <li
      data-testid={`case-insight-${insight.kind}`}
      data-kind={insight.kind}
      data-severity={insight.severity}
      data-lead="false"
      className="flex min-w-0 items-start gap-[var(--space-2)] rounded-[var(--radius-md)] p-[var(--space-2-5)]"
      style={{ backgroundColor: tone.bg }}
    >
      <span aria-hidden="true" className="shrink-0" style={{ color: tone.ink }}>
        {tone.icon}
      </span>
      <span className="flex min-w-0 flex-col gap-[var(--space-0-5)]">
        {insight.severity === 'attention' ? (
          <span className="label-caps min-w-0 break-words" style={{ color: tone.ink }}>
            {ATTENTION_MARKER}
          </span>
        ) : null}
        <span
          data-testid={`case-insight-headline-${insight.kind}`}
          className="reading-measure min-w-0 text-[length:var(--font-size-sm)] font-[var(--font-weight-semibold)] break-words"
          style={{ color: tone.ink }}
        >
          {insight.headline}
        </span>
        <span
          data-testid={`case-insight-detail-${insight.kind}`}
          className="reading-measure min-w-0 text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] break-words text-[var(--color-ink-secondary)]"
        >
          {insight.detail}
        </span>
      </span>
    </li>
  );
}

export function CaseInsightsPanel({ insights, layout }: CaseInsightsPanelProps) {
  // Nothing found means nothing rendered -- not an empty frame announcing
  // that nothing was found.
  if (insights.length === 0) return null;

  // A stable partition: each group keeps `deriveInsights`'s own emission
  // order, so the panel is exactly as deterministic as the board.
  const leads = insights.filter((insight) => LEAD_KINDS.includes(insight.kind));
  const observed = insights.filter((insight) => !LEAD_KINDS.includes(insight.kind));

  return (
    <section
      data-testid="case-insights"
      data-layout={layout}
      aria-labelledby="case-insights-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      <h2 id="case-insights-heading">{HEADING}</h2>

      {leads.length > 0 ? (
        <div
          className={
            // At expanded width the two lead cards sit side by side; at the
            // canonical pane they stack, like every other region. `min-w-0`
            // on the track keeps a long option label from forcing the grid
            // wider than the column it sits in.
            layout === 'expanded'
              ? 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-[var(--space-3)]'
              : 'flex flex-col gap-[var(--space-3)]'
          }
        >
          {leads.map((insight) => (
            <LeadInsight key={insight.id} insight={insight} />
          ))}
        </div>
      ) : null}

      {observed.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-[var(--space-2)] p-0">
          {observed.map((insight) => (
            <ObservedInsight key={insight.id} insight={insight} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
