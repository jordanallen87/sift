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

  const hasHumanOnly = shown.some((move) => move.humanOnly);

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
      <div
        className={
          layout === 'expanded'
            ? 'flex items-center justify-end gap-[var(--space-3)]'
            : 'flex flex-col gap-[var(--space-2)]'
        }
      >
        {shown.map((move, index) => {
          const testId = index === 0 ? 'dock-action-primary' : 'dock-action-secondary';
          const reasonId = `dock-reason-${String(index)}`;
          return (
            <div
              key={`${move.kind}-${String(index)}`}
              className="flex flex-col gap-[var(--space-1)]"
            >
              <Button
                type="button"
                data-testid={testId}
                data-human-only={move.humanOnly ? 'true' : 'false'}
                variant={index === 0 ? 'default' : 'secondary'}
                aria-describedby={reasonId}
                className="min-h-[var(--size-touch-target-min)] w-full"
                onClick={() => {
                  onAct(move);
                }}
              >
                {move.label}
              </Button>
              {/*
                The reason travels with the action rather than living in a
                tooltip: "why am I being asked this" is part of the answer to
                "what should I do next", and a person should not have to hover
                to get it. Visually secondary, programmatically attached.
              */}
              <span
                id={reasonId}
                className="text-[length:var(--text-xs)] text-[color:var(--color-muted-foreground)]"
              >
                {move.reason}
              </span>
            </div>
          );
        })}
      </div>

      {hasHumanOnly && (
        <p
          data-testid="dock-human-only-note"
          className="text-[length:var(--text-xs)] text-[color:var(--color-muted-foreground)]"
        >
          Only you can take this step — Sift and your assistant can explain it, but neither can do
          it for you.
        </p>
      )}
    </aside>
  );
}
