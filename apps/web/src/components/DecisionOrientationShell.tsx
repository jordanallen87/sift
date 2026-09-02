/**
 * The persistent orientation shell: the top third of the companion pane's
 * frame, and the reason a person never has to scroll back through a
 * conversation to work out where they are.
 *
 * It answers six questions, and it is designed around the fact that a novice
 * arriving at any single screenshot of this product should be able to answer
 * all six:
 *
 * 1. **What decision am I making?** — the case title and the pack running it.
 * 2. **What phase am I in?** — in words a person recognises, not the state
 *    machine's vocabulary. "Understanding what you need", never "discovery".
 * 3. **What has been covered?** — counts, and a bar computed from those same
 *    counts. A stored percentage beside its own numerator and denominator is
 *    a third fact that can disagree with the other two.
 * 4. **What is in focus, and what just changed?** — omitted entirely rather
 *    than filled with a placeholder when there is genuinely nothing to say.
 * 5. **What should I do next?** — always present. This is the one line that
 *    is never allowed to be empty.
 * 6. **How do I reach the outcome?** — so the journey has a visible end
 *    rather than feeling like an open-ended interrogation.
 *
 * ## Sticky positioning
 *
 * `position: sticky` rather than `fixed`, and the scroll container is the
 * pane's own document. Sift renders inside an iframe in the companion case,
 * and a `fixed` element inside an iframe positions against the iframe
 * viewport — which is what makes a dock cover the last line of content on a
 * short pane. Sticky keeps the element in flow, so the content below it is
 * genuinely offset rather than merely appearing to be.
 */
import type { DiscoveryCoverage } from '@sift/contracts';

export interface DecisionOrientation {
  readonly decisionTitle: string;
  readonly packName: string;
  /** The machine's phase id, kept for testids and styling hooks. */
  readonly phase: string;
  /** The same phase in words a person recognises. This is what renders. */
  readonly phaseLabel: string;
  readonly coverage: DiscoveryCoverage;
  /** What Sift is currently asking about or working on. `null` when genuinely nothing is. */
  readonly currentFocus: string | null;
  /** The last thing that actually changed about the decision. `null` before anything has. */
  readonly latestChange: string | null;
  /** Always present: the pane is never a dead end. */
  readonly nextStepLabel: string;
  readonly routeToOutcome: string;
  /** True when something was deferred, so any result built on this is not the whole picture. */
  readonly provisional: boolean;
}

export interface DecisionOrientationShellProps {
  readonly orientation: DecisionOrientation;
  readonly layout: 'narrow' | 'expanded';
  /**
   * Whether this shell names the decision, or leaves that to something
   * above it.
   *
   * `WorkspaceAppBar` renders the case title immediately above this shell
   * in the live workspace, so repeating it here put the same words on
   * screen twice in a row -- visible the moment the shell was rendered for
   * a real case, and invisible to every unit test, which renders the shell
   * alone. Defaults to `true` so the shell is self-sufficient wherever
   * nothing else names the decision.
   */
  readonly showDecisionTitle?: boolean;
}

export function DecisionOrientationShell({
  orientation,
  layout,
  showDecisionTitle = true,
}: DecisionOrientationShellProps): React.JSX.Element {
  const { coverage } = orientation;
  const total = coverage.requiredTotal;
  const resolved = coverage.requiredResolved;

  return (
    // A labelled region, deliberately not a `<header>`. `WorkspaceAppBar`
    // already owns the page's single banner landmark, and a second one is a
    // real axe violation (landmark-no-duplicate-banner) as well as a worse
    // experience: a screen-reader user looking for "the banner" should find
    // one thing, not two. `role="region"` with a name is the correct landmark
    // for a labelled section, and it is still directly navigable.
    <section
      aria-label="Decision status"
      data-testid="decision-orientation-shell"
      className={[
        'sticky top-0 z-20 flex flex-col gap-[var(--space-1)]',
        'border-b border-[color:var(--color-border)] bg-[color:var(--color-background)]',
        layout === 'expanded'
          ? 'px-[var(--space-6)] py-[var(--space-3)]'
          : 'px-[var(--space-4)] py-[var(--space-3)]',
        // Respects the iframe's safe area on a device with a notch, so the
        // first line of the shell is never clipped by the host chrome.
        'pt-[max(var(--space-3),env(safe-area-inset-top))]',
      ].join(' ')}
    >
      {showDecisionTitle && (
        <div className="flex items-baseline justify-between gap-[var(--space-2)]">
          <h1
            data-testid="orientation-decision"
            className="truncate text-[length:var(--text-base)] font-semibold text-[color:var(--color-foreground)]"
          >
            {orientation.decisionTitle}
          </h1>
          <span
            data-testid="orientation-pack"
            className="shrink-0 text-[length:var(--text-xs)] text-[color:var(--color-muted-foreground)]"
          >
            {orientation.packName}
          </span>
        </div>
      )}

      <p
        data-testid="orientation-phase"
        className="text-[length:var(--text-sm)] text-[color:var(--color-foreground)]"
      >
        {orientation.phaseLabel}
      </p>

      {/*
        Hidden entirely when there is nothing to count. "0 of 0 covered" is
        not a smaller truth than a real ratio, it is noise -- and a progress
        bar that can never move invites a person to wonder what they did
        wrong.
      */}
      {total > 0 && (
        <div className="flex items-center gap-[var(--space-2)]">
          <div
            data-testid="orientation-progress"
            role="progressbar"
            aria-valuenow={resolved}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Required topics covered"
            className="h-[var(--space-1)] min-w-0 flex-1 overflow-hidden rounded-full bg-[color:var(--color-muted)]"
          >
            <div
              className="h-full rounded-full bg-[color:var(--color-primary)]"
              // Computed from the very counts printed beside it. `total === 0`
              // is a real state (a pack with no declared topics), and dividing
              // by it would render a NaN width.
              style={{ width: total === 0 ? '0%' : `${String((resolved / total) * 100)}%` }}
            />
          </div>
          <span
            data-testid="orientation-coverage"
            className="shrink-0 text-[length:var(--text-xs)] tabular-nums text-[color:var(--color-muted-foreground)]"
          >
            {resolved} of {total} covered
          </span>
        </div>
      )}

      {orientation.currentFocus !== null && (
        <p
          data-testid="orientation-focus"
          className="text-[length:var(--text-sm)] text-[color:var(--color-foreground)]"
        >
          <span className="text-[color:var(--color-muted-foreground)]">In focus: </span>
          {orientation.currentFocus}
        </p>
      )}

      {orientation.latestChange !== null && (
        <p
          data-testid="orientation-latest-change"
          className="text-[length:var(--text-xs)] text-[color:var(--color-muted-foreground)]"
        >
          {orientation.latestChange}
        </p>
      )}

      <p
        data-testid="orientation-next-step"
        className="text-[length:var(--text-sm)] font-medium text-[color:var(--color-foreground)]"
      >
        <span className="font-normal text-[color:var(--color-muted-foreground)]">Next: </span>
        {orientation.nextStepLabel}
      </p>

      <p
        data-testid="orientation-route"
        className="text-[length:var(--text-xs)] text-[color:var(--color-muted-foreground)]"
      >
        {orientation.routeToOutcome}
      </p>

      {orientation.provisional && (
        <p
          data-testid="orientation-provisional"
          className="text-[length:var(--text-xs)] text-[color:var(--color-warning-foreground,var(--color-foreground))]"
        >
          Provisional — something was deferred, so this is not the whole picture yet.
        </p>
      )}
    </section>
  );
}
