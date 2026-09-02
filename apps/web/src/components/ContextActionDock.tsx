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
 * ## Sticky, not fixed
 *
 * Same reasoning as the orientation shell: `fixed` inside an iframe
 * positions against the iframe viewport and covers the last line of content
 * on a short pane. Sticky keeps the dock in flow, and the safe-area padding
 * keeps it clear of a home indicator.
 */
import type { NextMove } from '@sift/contracts';
import { Button } from '@/components/ui/button';

/** The most actions the dock will ever show. See the module comment. */
const MAX_DOCK_ACTIONS = 2;

export interface ContextActionDockProps {
  /** Derived moves, most useful first. Only the first two render. */
  readonly moves: readonly NextMove[];
  readonly onAct: (move: NextMove) => void;
  readonly layout: 'narrow' | 'expanded';
}

export function ContextActionDock({
  moves,
  onAct,
  layout,
}: ContextActionDockProps): React.JSX.Element | null {
  const shown = moves.slice(0, MAX_DOCK_ACTIONS);
  if (shown.length === 0) return null;

  const hasHumanOnly = shown.some((move) => move.humanOnly);

  return (
    <aside
      aria-label="What to do next"
      data-testid="context-action-dock"
      className={[
        'sticky bottom-0 z-20 flex flex-col gap-[var(--space-2)]',
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
          Only you can take this step — Sift and ChatGPT can explain it, but neither can do it for
          you.
        </p>
      )}
    </aside>
  );
}
