/**
 * The contextual action dock: the bottom of the companion frame, and the
 * answer to "what should I do next" expressed as something a person can
 * actually press.
 *
 * ## Two actions, never more
 *
 * `deriveNextMoves` returns every move that is currently valid, most useful
 * first. The dock renders at most the first two. A dock offering five things
 * has stopped answering the question and started asking it back, and the
 * moves it drops are still reachable through the pane's own views — nothing
 * becomes unavailable, it just stops competing for the one decision a person
 * is being asked to make right now.
 *
 * ## Human-only actions look different
 *
 * `NextMove` already guarantees a human-only move carries no `toolName`, so
 * nothing walking the move list can register a tool for it. That is
 * invisible to the person using the product. Here it becomes visible: a
 * human-only action is marked, and says why. If confirming a shortlist looked
 * identical to something ChatGPT could have done on the person's behalf, the
 * product's central claim would be missing from the exact screen where it
 * matters most.
 *
 * This used to say it twice: the move's own `reason` rendered under its
 * button, and a second, near-identical sentence rendered again below both
 * buttons ("Only you can decide which options go ahead" stacked directly on
 * "Only you can take this step..."). In a 640px pane, two sentences making
 * one claim cost real height and pushed the recommendation below the fold.
 * A human-only move now gets one visible marker (a `Badge`, matching
 * `ApprovalCard`'s "Your approval needed") and exactly one sentence,
 * attached to the button it governs rather than floating after it.
 *
 * ## In flow, and neither sticky nor fixed
 *
 * This used to be `sticky bottom-0`, justified by "`fixed` inside an iframe
 * positions against the iframe viewport and covers the last line of content
 * on a short pane." Both halves were wrong. Measured in the real ChatGPT
 * pane, Sift is a top-level document (`window.self === window.top`) with no
 * ancestor establishing a containing block, so `fixed` would have worked;
 * and the sticky it was replaced with did not, because the dock rendered as
 * the LAST child of the scrolling document, where a sticky box has nothing
 * below it to be held against. The dock never pinned — you only met it at
 * the very bottom of a ~2176px scroll.
 *
 * `App.tsx` now makes the case workspace a `100dvh` flex column whose
 * middle is the only scrolling region, so this is an ordinary `shrink-0`
 * flex child sitting at the bottom edge of the shell. It is genuinely
 * always visible, and it cannot cover the last line of content, because
 * that content scrolls inside a box that ends where this one starts. The
 * safe-area padding still keeps it clear of a home indicator.
 */
import type { NextMove } from '@sift/contracts';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

/**
 * The single sentence that states the human-authority boundary. It used to
 * render twice per human-only move — once as that move's own `reason`, once
 * more as a separate paragraph after every shown button. Both said the same
 * thing. This is the one that survives, and it now renders attached to the
 * specific button it governs instead of floating below the whole dock.
 */
const HUMAN_ONLY_NOTE =
  'Only you can take this step — Sift and your assistant can explain it, but neither can do it for you.';

/** The most actions the dock will ever show. See the module comment. */
const MAX_DOCK_ACTIONS = 2;

/**
 * Chooses which moves to show, keeping every human-only move.
 *
 * A plain `slice(0, 2)` used to do this, and it silently deleted the one
 * thing this component exists to make visible. `confirm_shortlist` — the
 * only `humanOnly` move Sift derives — is sixth in `deriveNextMoves`'
 * order, so on any case where two earlier moves also applied, the person
 * was never offered it and the "only you can do this" note never rendered.
 * The module comment above says exactly what that costs: "the product's
 * central claim would be missing from the exact screen where it matters
 * most." It was.
 *
 * Truncation is still real — the dock never shows more than
 * `MAX_DOCK_ACTIONS` — but what survives it is chosen by authority first
 * and usefulness second. Output order still follows `deriveNextMoves`, so
 * a human-only move does not jump the queue visually; it just cannot be
 * the one that falls off the end.
 *
 * Found by `pnpm test:journey family-novice` (ADR 0014), which asked
 * whether a person with a ready recommendation is actually told the
 * decision is theirs.
 */
export function selectDockActions(
  moves: readonly NextMove[],
  max: number = MAX_DOCK_ACTIONS,
): readonly NextMove[] {
  if (moves.length <= max) return moves;
  const kept = new Set<NextMove>(moves.filter((move) => move.humanOnly).slice(0, max));
  for (const move of moves) {
    if (kept.size >= max) break;
    kept.add(move);
  }
  return moves.filter((move) => kept.has(move));
}

export interface ContextActionDockProps {
  /** Derived moves, most useful first. At most two render — see `selectDockActions`. */
  readonly moves: readonly NextMove[];
  readonly onAct: (move: NextMove) => void;
  readonly layout: 'narrow' | 'expanded';
}

export function ContextActionDock({
  moves,
  onAct,
  layout,
}: ContextActionDockProps): React.JSX.Element | null {
  const shown = selectDockActions(moves);
  if (shown.length === 0) return null;

  return (
    <aside
      aria-label="What to do next"
      data-testid="context-action-dock"
      className={[
        'shrink-0 flex flex-col gap-[var(--space-2)]',
        'border-t border-[color:var(--color-border)] bg-[color:var(--color-background)]',
        layout === 'expanded'
          ? 'px-[var(--space-6)] py-[var(--space-3)]'
          : 'px-[var(--space-4)] py-[var(--space-3)]',
        'pb-[max(var(--space-3),env(safe-area-inset-bottom))]',
      ].join(' ')}
    >
      {/*
        One row, at every width.

        This was a column at narrow: two actions, each with its own visible
        reason line underneath, which rendered as four stacked rows and cost
        roughly 150px of a pane whose scarcest resource is vertical space.
        The project owner asked for it in one row, looking at Sift running in
        ChatGPT's real side pane.

        The reasons did not simply get deleted -- see the `Tooltip` and the
        `visually-hidden` span below.
      */}
      <div className="flex items-stretch gap-[var(--space-2)]">
        {shown.map((move, index) => {
          const testId = index === 0 ? 'dock-action-primary' : 'dock-action-secondary';
          // A human-only move's explanation is the one authority sentence,
          // not its own `reason` plus that sentence again — see `HUMAN_ONLY_NOTE`
          // above and the module comment. Giving it a stable id lets both the
          // journeys (`pnpm test:journey family-novice`/`aws-hero`) and this
          // component's own tests keep finding it by the same `data-testid`
          // the old, separate paragraph used. That id is not index-suffixed
          // because `deriveNextMoves` currently derives at most one
          // `humanOnly` move (`confirm_shortlist`) in the whole system — if
          // that ever changes, this id needs to become per-move again.
          const reasonId = move.humanOnly ? 'dock-human-only-note' : `dock-reason-${String(index)}`;
          const reasonText = move.humanOnly ? HUMAN_ONLY_NOTE : move.reason;
          return (
            <div
              key={`${move.kind}-${String(index)}`}
              className="flex min-w-0 flex-1 flex-col justify-end gap-[var(--space-1)]"
            >
              {move.humanOnly && (
                // The visible marker: matches `ApprovalCard`'s "Your approval
                // needed" `Badge` so the same product claim gets the same
                // visual treatment wherever it appears. The one sentence of
                // *why* lives in the `<span>` below, not here.
                <Badge
                  data-testid="dock-human-only-badge"
                  variant="outline"
                  className="label-caps w-fit"
                >
                  Your decision
                </Badge>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    data-testid={testId}
                    data-human-only={move.humanOnly ? 'true' : 'false'}
                    variant={index === 0 ? 'default' : 'secondary'}
                    aria-describedby={reasonId}
                    className="min-h-[var(--size-touch-target-min)] w-full whitespace-normal"
                    onClick={() => {
                      onAct(move);
                    }}
                  >
                    {move.label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{reasonText}</TooltipContent>
              </Tooltip>
              {/*
                The reason is still attached to its action -- it just is not
                spending a visible row any more.

                An earlier version of this comment argued the opposite: that a
                reason "should not have to be hovered for", so it rendered as
                visible text under every button. That was right about the
                principle and wrong about the cost. Two actions each with a
                visible reason is four rows, and in a 390-640px pane those
                rows push the actual answer -- the recommendation -- below the
                fold, which is the thing ADR 0004 exists to prevent.

                Nothing is lost for the people who most need it. The text
                below is `visually-hidden`, not removed, so it is still the
                target of the button's own `aria-describedby`: a screen-reader
                user hears the reason exactly as before, with no hover
                required. Sighted pointer users get it from the tooltip above.
                Only the always-on visual row is gone.
              */}
              <span
                id={reasonId}
                data-testid={move.humanOnly ? 'dock-human-only-note' : undefined}
                className="visually-hidden"
              >
                {reasonText}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
