/**
 * The web-app-mode left sidebar (project-owner-approved shell -- the ASCII
 * mock this component was built from: "PRIORITIES / Safety ████ / Price
 * ███ ..."). "This is supposed to have a web app view too... It's supposed
 * to emulate a shopping website at full width. When it's in the side pane,
 * it's in WebMCP mode where the user is viewing it from ChatGPT. Still has
 * to have the same functionalities, but in web app mode the user isn't
 * looking at it via ChatGPT."
 *
 * This component therefore exists ONLY at `layout: 'expanded'` (the
 * full-width, shopping-site-like web-app surface) and renders `null`
 * outright at `layout: 'narrow'` (the existing 390-480px ChatGPT
 * right-pane/WebMCP mode) rather than a narrow-adapted variant: that pane
 * already carries this same information through other surfaces -- the
 * "What you're looking for" disclosure for priorities
 * (`DecisionProfileView.tsx`) and the "Still checking" disclosure
 * (`ReadinessPanel.tsx`), both wired in `App.tsx`, which this task does not
 * touch. Building a second narrow rendering path here would just be a
 * duplicate, driftable source of the same underlying state.
 *
 * Purely presentational, matching every other leaf component in this
 * directory (`OptionCompareView.tsx`, `DecisionProfileView.tsx`,
 * `FindingsSheet.tsx`): no context, no fetching, no command calls. The
 * orchestrator (`App.tsx`) owns deriving real `CaseState`/
 * `WorkspaceViewState` data into the props below and wiring the callbacks
 * to real `updateSelection()`/readiness-surfacing behavior.
 *
 * This component renders exactly two things now: Priorities and Still
 * checking. It used to also own the pack's filter controls; it no longer
 * does, and as a result imports none of `@sift/contracts`' filter-shaped
 * types (`WorkspaceFilter`, `AttributeDefinition`, `EntityRecord`) at all
 * any more.
 *
 * ## Where the filters went, and why (`FilterBar.tsx`, `FilterSheet.tsx`,
 * `workspace-filters.ts`)
 *
 * The project owner settled the shape directly: "For the filters, why not
 * just put this in some sort of dialog or modal? And just show the applied
 * filters?" -- the pattern every mainstream shopping site (Airbnb, Zillow,
 * Etsy) already uses: a "Filters" button carrying an active count, a row of
 * applied-filter chips each removable on its own, a "Clear all," and every
 * actual control living inside a modal/sheet. `workspace-filters.ts` now
 * owns the pure planning/formatting/filtering logic this file used to keep
 * private (`planWorkspaceFilters`, `applyWorkspaceFilters`,
 * `describeAppliedFilters`, and friends); `FilterBar.tsx`/`FilterSheet.tsx`
 * own the DOM this file used to render for it.
 *
 * That preference lined up with a real defect, not just a style call: this
 * component returns `null` outright at `layout: 'narrow'` (see above), so
 * for as long as the filter controls lived here, pane/WebMCP mode had NO
 * filter entry point at all -- a direct contradiction of ADR 0008's
 * requirement that both layouts carry the same functionality. A sheet
 * reachable from `App.tsx` at both layouts is the only shape that actually
 * satisfies that requirement; narrow-adapting a second filter
 * implementation inside this expanded-only file could never have closed
 * that gap on its own, only added a second copy of the same problem this
 * file's own narrow-mode `null` already avoids for priorities and open
 * questions.
 *
 * ## Priorities (docs/specs/product.md "Decision Profile" -- §42)
 *
 * Takes the already-derived `DecisionProfile` (`decision-profile.ts`,
 * `deriveDecisionProfile`) as a prop rather than re-deriving anything from
 * `CaseState` -- this file adds no second projection of criteria data.
 * Renders the union of `mustHave`/`important`/`niceToHave` (the three
 * sections `decision-profile.ts` actually weight-bands), sorted by weight
 * descending across all three. `context` facts (budget target, commute) are
 * deliberately excluded here: they are informational "things to keep in
 * mind," not a ranked priority the way §42's "Very important / Important /
 * Somewhat important" scale describes -- `DecisionProfileView.tsx` itself
 * already renders `context` un-banded for the identical reason (`showBand:
 * false`). `personalConcerns` are excluded too -- a
 * `DecisionProfilePersonalConcern` carries no `weight`/`priorityBand` field
 * to visualize.
 *
 * Per §42 ("Weights should not necessarily be exposed as raw numeric
 * percentages to ordinary users by default... Allow simplified priority
 * manipulation") and this task's explicit brief, the exact 0-100 weight is
 * NEVER rendered as a number or percentage here -- only the band label
 * ("Very important"/"Important"/"Somewhat important",
 * `decision-profile.ts`'s own `PriorityBand`) plus a purely decorative
 * 3-segment bar whose fill count is the band's ORDINAL (1/2/3 segments for
 * somewhat/important/very), never a continuous rendering of the raw weight
 * -- a bar whose width scaled proportionally with the exact weight would
 * leak back the same precision the band system exists to hide. The bar is
 * `aria-hidden` and never the sole carrier of the distinction
 * (design-system.md "Never color-only" -- "Color is reinforcement, not the
 * only channel"): the band text is always the real, visible, accessible
 * content.
 *
 * **Row layout (post-launch defect fix):** the sidebar's 240px column
 * (`App.tsx`'s `grid-cols-[240px_...]`, not owned by this file) is too
 * narrow to fit "label + band text + bar" on one line for any real
 * criterion name ("5-year ownership cost", "Driving comfort") without
 * truncating the label to one or two characters -- exactly the defect a
 * real production pass caught: the label, the ONLY thing that identifies
 * the row, was losing the space race to the band text and getting cut to
 * "S...". `PriorityRow` therefore stacks two lines instead of one row:
 * the label owns the full row width on its own line and is never
 * `truncate`d (long labels wrap instead of clipping -- docs/engineering-principles.md "Never
 * fabricate"/never hide real content), and the band + bar move to a second,
 * visually de-emphasised line (smaller, `--color-ink-muted` "tertiary text"
 * per design-system.md, no `label-caps` shout treatment) underneath. The
 * band's full text is still real, visible, accessible DOM content in both
 * lines -- de-emphasising it is a visual weight change only, never a
 * disclosure/truncation of the band itself, and the bar remains the same
 * `aria-hidden` reinforcement it always was.
 *
 * ## Still checking
 *
 * A compact, glanceable count plus a single entry point standing in for the
 * closed-by-default `DisclosureSection`/`ReadinessPanel` pairing `App.tsx`
 * already renders at the bottom of the page (region 8, "Still checking").
 * This component does not recompute or render the obligation list itself --
 * `openQuestionsCount` is a plain number the caller already has (e.g.
 * `readiness.active.length + readiness.blocked.length + readiness.open
 * .length` from the real `evaluateReadiness` result), and `onOpenQuestions`
 * is however the orchestrator chooses to surface the full detail (opening
 * the existing disclosure, scrolling to it, a dedicated sheet -- this
 * component does not know or care).
 */
import type { DecisionProfile, DecisionProfileConcern, PriorityBand } from './decision-profile.js';
import { STATUS_TONE_META } from './activity-labels.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export interface WorkspaceSidebarProps {
  /** `'narrow'` renders nothing at all -- see file header. */
  layout: 'narrow' | 'expanded';
  /** `deriveDecisionProfile`'s output. `null` when no case is open yet -- distinct from a loaded case with an empty profile. */
  decisionProfile: DecisionProfile | null;
  /** A plain count of obligations still open (however the caller defines "open" from a real `ReadinessResult`) -- this component fabricates no question text of its own. */
  openQuestionsCount: number;
  /** Opens the existing "Still checking" surface. Ownership of what "open" means stays with the orchestrator. */
  onOpenQuestions: () => void;
}

const PRIORITY_BAND_LABEL: Record<PriorityBand, string> = {
  very_important: 'Very important',
  important: 'Important',
  somewhat_important: 'Somewhat important',
};

/** Ordinal (not proportional) segment count -- see the file header's "Priorities" section for why this must stay ordinal, not a continuous rendering of the raw weight. */
const PRIORITY_BAND_SEGMENTS: Record<PriorityBand, number> = {
  somewhat_important: 1,
  important: 2,
  very_important: 3,
};

const PRIORITY_BAR_SEGMENT_COUNT = 3;

/** Decorative-only visual weight indicator -- `aria-hidden`, never the sole carrier of the band distinction (design-system.md "Never color-only"). */
function PriorityWeightBar({ band }: { band: PriorityBand }) {
  const filledCount = PRIORITY_BAND_SEGMENTS[band];
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-[var(--space-0-5)]">
      {Array.from({ length: PRIORITY_BAR_SEGMENT_COUNT }, (_, index) => index + 1).map(
        (segment) => (
          <span
            key={segment}
            className="h-[10px] w-[6px] rounded-[var(--radius-xs)]"
            style={{
              backgroundColor:
                segment <= filledCount ? 'var(--color-brand)' : 'var(--color-border-subtle)',
            }}
          />
        ),
      )}
    </span>
  );
}

function PriorityRow({ concern }: { concern: DecisionProfileConcern }) {
  return (
    <li
      data-testid={`workspace-sidebar-priority-${concern.id}`}
      className="flex flex-col gap-[var(--space-0-5)] rounded-[var(--radius-sm)] px-[var(--space-1)] py-[var(--space-1-5)]"
    >
      {/* Line 1: the label, the ONLY thing that identifies this row, gets
         the full row width and is never `truncate`d -- a long label wraps
         onto a second line rather than clipping to "S...". See the file
         header's "Row layout" note for the defect this fixes. */}
      <span className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] leading-snug text-[var(--color-ink)]">
        {concern.label}
      </span>
      {/* Line 2: the band + bar, de-emphasised (small, muted, no caps
         shout) and moved off the label's line entirely -- secondary
         information, per this task's brief, now that the bar already
         encodes the same distinction ordinally. */}
      <span className="flex items-center gap-[var(--space-1-5)]">
        <PriorityWeightBar band={concern.priorityBand} />
        <span
          data-testid={`workspace-sidebar-priority-band-${concern.id}`}
          className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
        >
          {PRIORITY_BAND_LABEL[concern.priorityBand]}
        </span>
      </span>
    </li>
  );
}

export function WorkspaceSidebar({
  layout,
  decisionProfile,
  openQuestionsCount,
  onOpenQuestions,
}: WorkspaceSidebarProps) {
  if (layout === 'narrow') return null;

  const priorityConcerns: DecisionProfileConcern[] =
    decisionProfile === null
      ? []
      : [
          ...decisionProfile.mustHave,
          ...decisionProfile.important,
          ...decisionProfile.niceToHave,
        ].sort((a, b) => b.weight - a.weight);

  const stillCheckingTone = openQuestionsCount > 0 ? 'open' : 'satisfied';
  const stillCheckingMeta = STATUS_TONE_META[stillCheckingTone];

  return (
    <aside
      data-testid="workspace-sidebar"
      aria-label="Priorities and open questions"
      className="flex flex-col gap-[var(--space-5)]"
    >
      <section
        data-testid="workspace-sidebar-priorities"
        aria-labelledby="workspace-sidebar-priorities-heading"
        className="flex flex-col gap-[var(--space-2)]"
      >
        <h2
          id="workspace-sidebar-priorities-heading"
          className="label-caps text-[var(--color-ink-secondary)]"
        >
          Priorities
        </h2>
        {priorityConcerns.length === 0 ? (
          <p
            data-testid="workspace-sidebar-priorities-empty"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            Nothing prioritized yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-[var(--space-1)]">
            {priorityConcerns.map((concern) => (
              <PriorityRow key={concern.id} concern={concern} />
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section
        data-testid="workspace-sidebar-still-checking"
        className="flex flex-col gap-[var(--space-2)]"
      >
        <Button
          type="button"
          data-testid="workspace-sidebar-still-checking-button"
          onClick={onOpenQuestions}
          variant="secondary"
          className="min-h-[var(--size-touch-target-min)] w-full justify-between"
          style={{ backgroundColor: stillCheckingMeta.bg, color: stillCheckingMeta.ink }}
        >
          <span>Still checking</span>
          <Badge
            data-testid="workspace-sidebar-still-checking-count"
            variant="outline"
            className="label-caps gap-[var(--space-1)]"
            style={{ color: stillCheckingMeta.ink, backgroundColor: 'transparent' }}
          >
            <span aria-hidden="true">{stillCheckingMeta.icon}</span>
            {openQuestionsCount}
          </Badge>
        </Button>
      </section>
    </aside>
  );
}
